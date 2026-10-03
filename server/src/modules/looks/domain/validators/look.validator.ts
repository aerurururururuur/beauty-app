/**
 * domain/validators/look.validator.ts —— 妆容档案入参的校验行为(仿 cabinet 的校验器)。
 * 被调用时做三件事:① 用 schemas 查结构;② 执行形状表达不了的规则(trim 后的上下限、
 * 控制字符、`seq` 是不是正整数)并统一映射成 `VALIDATION_ERROR`;③ 清洗出可直接落库的值。
 *
 * ★ §4.2:**上下限常量与 id 格式正则住在本文件**,不在 `schemas/` —— 规则与它的错误文案
 *   同处一地,改一处就生效;schema 那边只剩「是不是字符串」。
 * ★ 这几句 message 就是 UI 文案(前端把 message 原样上屏):用页面的词(「我的妆容档案」
 *   「桃妆账号」),不用内部术语;但**只换文案,不换标识符**。
 */
import { AppError, ErrorCode, zodIssuesMessage } from '../../../shared/index.js';
import {
  createLookSchema,
  lookIdSchema,
  lookTableSchema,
  ownerQuerySchema,
} from '../schemas/index.js';
import { Look } from '../entities/look.js';
import type {
  LookPaletteEntry,
  LookPersonalized,
  LookProduct,
  LookRow,
  LookStep,
} from '../schemas/index.js';

/* ── 上限常量(§4.2:规则住在这里,不在 schema) ───────────────────────── */

/** 场景名(「聚会」这种中文名)与场景 id 清洗后上限。★ 场景 id **允许空串**(见下)。 */
export const MAX_SCENE_NAME = 40;
export const MAX_SCENE_ID = 40;
/** 风格名与风格 id。`styleId` 可省(模型可以完全自己写一套)。 */
export const MAX_STYLE_NAME = 80;
export const MAX_STYLE_ID = 80;
/** 「这套妆是什么」的唯一说法 + 一句话摘要。 */
export const MAX_DESCRIPTION_RAW = 4000;
export const MAX_DESCRIPTION = 2000;
export const MAX_SUMMARY_RAW = 4000;
export const MAX_SUMMARY = 2000;
/** 关键词。 */
export const MAX_KEYWORDS = 12;
export const MAX_KEYWORD = 40;
/** 色板。★ `hex` 与 `code` 都可为空串(没色号的模型自配色)。 */
export const MAX_PALETTE = 30;
export const MAX_PALETTE_NAME = 120;
/** 推荐产品。★ `hex` 可空 = 这一支没有色块。 */
export const MAX_PRODUCTS = 30;
export const MAX_PID = 80;
export const MAX_PRODUCT_NAME = 120;
/** 色号。★ 空串 = 整件推荐(没有色号)。 */
export const MAX_SHADE_CODE = 40;
/** 色值(`#b03a3a`)。 */
export const MAX_HEX = 32;
/** 步骤。 */
export const MAX_STEPS = 30;
export const MAX_STEP_ID = 40;
export const MAX_STEP_NAME = 60;
export const MAX_STEP_DESC_RAW = 1600;
export const MAX_STEP_DESC = 800;
export const MAX_STEP_TIPS = 8;
export const MAX_STEP_TIP = 200;
/** 个性化建议。 */
export const MAX_PERSONALIZED = 20;
export const MAX_PERSONALIZED_TEXT = 400;
export const MAX_PERSONALIZED_PRODUCTS = 8;
/** 会话 id(只作为溯源存着,不当路径用)。 */
export const MAX_SESSION_ID = 80;
/** `seq`:相对会话的正整数序号。 */
export const MAX_SEQ = 100000;

const LOOK_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const OWNER_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/** 通过校验、可交给用例使用的新增入参(已逐格清洗)。服务端生成的三格不在里面。 */
export type CreateLookInput = Omit<LookRow, 'id' | 'coverMime' | 'createdAt'>;

/** 通过校验的归属查询(列表 / 删除 / 取封面共用)。 */
export interface OwnerQuery {
  userId: string;
}

/** 是否含控制字符(C0 段 + DEL):这些值会进 JSON 与 UI,含换行 / 制表 / NUL 一律拒收。 */
function hasControlChar(value: string): boolean {
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x20 || cp === 0x7f) return true;
  }
  return false;
}

function fail(message: string): never {
  throw new AppError(ErrorCode.VALIDATION_ERROR, message);
}

/** 归属账号 id:形状已由 schema 保证,格式在这里判(§4.2)。 */
function checkOwnerId(userId: string): string {
  if (!OWNER_ID_PATTERN.test(userId)) fail('桃妆账号不合法');
  return userId;
}

/**
 * 通用的文本清洗:原文上限 → trim → 长度 → 控制字符。
 * `allowEmpty` 为真时不判空(色号、色值、场景 id 都有"空就是没有"的含义)。
 */
function cleanText(
  raw: string,
  max: number,
  what: string,
  allowEmpty = false,
): string {
  // 原文上限先判:先挡住超大 payload,再谈清洗后的长度。
  if (raw.length > max * 8) fail(`${what}太长了`);
  const value = raw.trim();
  if (!allowEmpty && value.length === 0) fail(`${what}不能为空`);
  if (value.length > max) fail(`${what}最多 ${max} 个字符`);
  if (hasControlChar(value)) fail(`${what}不能包含换行或控制字符`);
  return value;
}

/** `seq`:必须是正整数(0 / 负数 / 小数都拒)。 */
function cleanSeq(raw: number): number {
  if (!Number.isInteger(raw) || raw <= 0) fail('图片序号不合法');
  if (raw > MAX_SEQ) fail('图片序号不合法');
  return raw;
}

/** `stepCount`:非负整数,且不超过步骤数上限。 */
function cleanStepCount(raw: number): number {
  if (!Number.isInteger(raw) || raw < 0) fail('步骤数不合法');
  if (raw > MAX_STEPS) fail(`步骤最多 ${MAX_STEPS} 步`);
  return raw;
}

function cleanKeywords(raw: readonly string[]): string[] {
  if (raw.length > MAX_KEYWORDS) fail(`关键词最多 ${MAX_KEYWORDS} 条`);
  return raw.map((k) => cleanText(k, MAX_KEYWORD, '关键词'));
}

function cleanPalette(raw: readonly LookPaletteEntry[]): LookPaletteEntry[] {
  if (raw.length > MAX_PALETTE) fail(`色板最多 ${MAX_PALETTE} 块`);
  return raw.map((entry) => ({
    code: cleanText(entry.code, MAX_SHADE_CODE, '色板的色号', true),
    name: cleanText(entry.name, MAX_PALETTE_NAME, '色板的颜色名'),
    hex: cleanText(entry.hex, MAX_HEX, '色值', true),
  }));
}

function cleanProducts(raw: readonly LookProduct[]): LookProduct[] {
  if (raw.length > MAX_PRODUCTS) fail(`推荐产品最多 ${MAX_PRODUCTS} 件`);
  return raw.map((p) => ({
    pid: cleanText(p.pid, MAX_PID, '产品编号'),
    code: cleanText(p.code, MAX_SHADE_CODE, '推荐产品的色号', true),
    name: cleanText(p.name, MAX_PRODUCT_NAME, '产品名'),
    hex: cleanText(p.hex, MAX_HEX, '色值', true),
  }));
}

function cleanSteps(raw: readonly LookStep[]): LookStep[] {
  if (raw.length > MAX_STEPS) fail(`步骤最多 ${MAX_STEPS} 步`);
  return raw.map((step) => {
    if (step.tips.length > MAX_STEP_TIPS) fail(`每一步的建议最多 ${MAX_STEP_TIPS} 条`);
    return {
      id: cleanText(step.id, MAX_STEP_ID, '步骤编号'),
      name: cleanText(step.name, MAX_STEP_NAME, '步骤名'),
      desc: cleanText(step.desc, MAX_STEP_DESC, '步骤说明', true),
      tips: step.tips.map((t) => cleanText(t, MAX_STEP_TIP, '步骤建议')),
    };
  });
}

function cleanPersonalized(raw: readonly LookPersonalized[]): LookPersonalized[] {
  if (raw.length > MAX_PERSONALIZED) fail(`个性化建议最多 ${MAX_PERSONALIZED} 条`);
  return raw.map((p) => {
    if (p.products.length > MAX_PERSONALIZED_PRODUCTS) {
      fail(`一条建议里提到的产品最多 ${MAX_PERSONALIZED_PRODUCTS} 件`);
    }
    return {
      id: cleanText(p.id, MAX_STEP_ID, '建议编号'),
      group: cleanText(p.group, MAX_STEP_ID, '建议分组'),
      groupName: cleanText(p.groupName, MAX_SCENE_NAME, '建议分组名'),
      name: cleanText(p.name, MAX_STEP_NAME, '建议名'),
      desc: cleanText(p.desc, MAX_PERSONALIZED_TEXT, '建议说明', true),
      fix: cleanText(p.fix, MAX_PERSONALIZED_TEXT, '建议做法', true),
      products: p.products.map((n) =>
        cleanText(n, MAX_PRODUCT_NAME, '建议里提到的产品名'),
      ),
    };
  });
}

/** 校验档案 id,合法则原样返回,非法抛 AppError。★ 它会被当成封面目录名,所以格式必须严。 */
export function validateLookId(raw: unknown): string {
  const parsed = lookIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error));
  }
  if (!LOOK_ID_PATTERN.test(parsed.data)) fail('档案 id 不合法');
  return parsed.data;
}

/** 校验归属查询串(列表 / 删除 / 取封面);不合法抛 AppError,合法返回 userId。 */
export function validateOwnerQuery(raw: unknown): OwnerQuery {
  const parsed = ownerQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error), {
      issues: parsed.error.issues,
    });
  }
  return { userId: checkOwnerId(parsed.data.userId) };
}

/** 校验新增入参;不合法抛 AppError,合法返回逐格清洗后的值。 */
export function validateCreateInput(raw: unknown): CreateLookInput {
  const parsed = createLookSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error), {
      issues: parsed.error.issues,
    });
  }
  const d = parsed.data;

  return {
    userId: checkOwnerId(d.userId),
    sessionId: cleanText(d.sessionId, MAX_SESSION_ID, '会话编号'),
    seq: cleanSeq(d.seq),
    // ★ 场景 id **允许空串**:刷新后的 `/result` 上推不出它,与其编一个不如留空。
    sceneId: cleanText(d.sceneId, MAX_SCENE_ID, '场景编号', true),
    sceneName: cleanText(d.sceneName, MAX_SCENE_NAME, '场景名', true),
    ...(d.styleId !== undefined
      ? { styleId: cleanText(d.styleId, MAX_STYLE_ID, '风格编号', true) }
      : {}),
    styleName: cleanText(d.styleName, MAX_STYLE_NAME, '风格名'),
    lookDescription: cleanText(d.lookDescription, MAX_DESCRIPTION, '妆容描述', true),
    summary: cleanText(d.summary, MAX_SUMMARY, '妆容摘要', true),
    keywords: cleanKeywords(d.keywords),
    stepCount: cleanStepCount(d.stepCount),
    palette: cleanPalette(d.palette),
    products: cleanProducts(d.products),
    steps: cleanSteps(d.steps),
    personalized: cleanPersonalized(d.personalized),
  };
}

/**
 * 落盘表(`dataDir/looks/items.json`)的解析点 —— 仓库读出口调它(§7.2)。
 *
 * ★ 这里只查**形状**。长度与条数上限、id 与 `seq` 的规则是**入参**规则,不拿来回溯校验
 *   盘上的数据:某天收紧一条上限,旧数据不该整个读不出来。这道网挡的是另一类事 ——
 *   文件被手改过、写坏了,形状对不上。
 * ★ 抛普通 `Error` 而不是 `AppError`:这不是「这个请求不合法」,是**盘上的数据坏了**,
 *   该以 500 结束并让人去查那个文件,不是一个 400 把锅甩给客户端。
 */
export function parseLookTable(raw: unknown, file: string): Record<string, Look> {
  const parsed = lookTableSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `妆容档案数据不合法:${file} —— ${zodIssuesMessage(parsed.error)}。` +
        '这是 dataDir 下的落盘数据,不是请求入参;多半是文件被手改过。',
    );
  }

  const table: Record<string, Look> = {};
  for (const [id, row] of Object.entries(parsed.data)) {
    // 键与行里的 id 必须一致:钥匙和锁对不上时,按 id 查得到、按账号却列不出来。
    if (row.id !== id) {
      throw new Error(
        `妆容档案数据不合法:${file} —— 键「${id}」下的档案 id 是「${row.id}」,两者必须一致。`,
      );
    }
    table[id] = new Look(row);
  }
  return table;
}
