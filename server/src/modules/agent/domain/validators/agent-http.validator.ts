/**
 * domain/validators/agent-http.validator.ts —— HTTP 入参的校验**行为**。
 * 形状在 `schemas/api/agent-http.ts`;这里做形状表达不了的事:长度上限、清洗、中文错误。
 *
 * ★ §4.2:长度上限**在这里**,不在 schema —— 它是业务规则,要和它的错误文案放一起。
 *   (本文件从前写着"长度上限这类单字段闭区间归 schema",那条口径已按 spec 改掉。)
 *   ⚠️ §4.3 欠账:`MAX_AGENT_TEXT` 仍是文件里的魔数,要真兑现得由组合根注入(单独一轮)。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { MakeupBrief, WeatherInfo } from '../../../shared/index.js';
import { checkBriefFields } from '../../../shared/index.js';
import {
  ANALYZE_CASES,
  REF_IMAGE_KINDS,
  analysesRequestSchema,
  confirmRenderSchema,
  startSessionSchema,
  sendMessageSchema,
} from '../schemas/index.js';
import type { ConfirmRenderRaw, SendMessageRaw } from '../schemas/index.js';
import type { AnalyzeCase } from '../../../makeup/index.js';
import type { RefImageKind } from '../entities/session.js';
import { describeIssues } from './validate.js';

/**
 * 单条用户消息上限(字)。
 * 比 `shared` 的 `MAX_SCENE_TEXT`(2000)小一个量级:那是**一次性把需求写完**的输入框,
 * 这是**对话里的一句话**。留 1000 已经远超正常一句话,同时挡住"贴一整篇需求文档进来"
 * 这种会把上下文预算一次烧掉的行为。
 *
 * ⚠️ `vue/src/api/agent.js` 有一份**手抄的同值副本**(前端要先在本地拦一次,
 *    不等服务端回错)。改这里**必须**顺手改那边,否则前后端的"字数超了"会在不同长度上触发。
 */
export const MAX_AGENT_TEXT = 1000;

function fail(message: string): never {
  throw new AppError(ErrorCode.VALIDATION_ERROR, message);
}

/** 「只有 userId」那份形状。★ 与 `confirmRenderSchema` 是**同一个对象**(见那边)。 */
const userIdOnlySchema = startSessionSchema;

/**
 * 「只有 `userId`」那一类请求体的共用校验(开会话 / 确认出图)。
 * ★ 两处**必须是同一段代码**:同一件事有两条实现,迟早只改一条。
 */
function validateUserIdOnly(raw: unknown): { userId: string } {
  const parsed = userIdOnlySchema.safeParse(raw ?? {});
  if (!parsed.success) fail(describeIssues(parsed.error));

  const userId = parsed.data.userId.trim();
  // trim 后为空 = 没给。schema 的 `min(1)` 挡不住全空白(`" "` 有长度)。
  if (userId === '') fail('userId 不能是空白');
  return { userId };
}

/**
 * 「开会话」校验后的入参:归属人 + 一份**可选的**初始简报(已经过规则校验与清洗)。
 * ★ 简报字段的规则与 `patch_brief` **共用 `shared` 的 `checkBriefFields`**——
 *   同一份字段在两条路上受不同限制,是「表单里能写 2000 字、对话里却报错」
 *   那类极难归因的 bug 的来源。
 */
export interface StartSessionInput {
  userId: string;
  brief: MakeupBrief;
}

/** 校验「开会话」入参。 */
export function validateStartSession(raw: unknown): StartSessionInput {
  const parsed = startSessionSchema.safeParse(raw ?? {});
  if (!parsed.success) fail(describeIssues(parsed.error));

  const userId = parsed.data.userId.trim();
  if (userId === '') fail('userId 不能是空白');

  const checked = checkBriefFields(parsed.data);
  if (!checked.ok) fail(checked.message);

  // ★ `weather` 是这条入口独有的成员,不在 `checkBriefFields` 里(那条路没有天气),
  //   所以在这里单独过一遍。
  const weather = checkWeather(parsed.data.weather);
  return { userId, brief: weather ? { ...checked.brief, weather } : checked.brief };
}

/** 天气简述上限(字)。 */
const MAX_WEATHER_CONDITION = 20;

/**
 * 天气数值的合理区间。★ 越界的数**原样进模型上下文不是"信息更丰富",只是噪音**——
 * 而它会一路流进提示词。区间是**规则**(§4.2),所以在这里而不在 schema。
 */
const WEATHER_BOUNDS = {
  temperatureC: [-60, 60],
  humidityPct: [0, 100],
  uvIndex: [0, 15],
} as const;

/**
 * 校验并清洗天气。四个成员**逐个显式处理**(新增成员时这里编译期会提醒)。
 * 全部被拒或为空 → 返回 `undefined`(视同没带天气),**不留一个空对象**:
 * 空对象在 `describeBrief` 那边会被当成"上游填过"而透出一句空话。
 */
function checkWeather(raw: WeatherInfo | undefined): WeatherInfo | undefined {
  if (!raw) return undefined;

  const out: WeatherInfo = {};
  const problems: string[] = [];

  if (raw.condition !== undefined) {
    const condition = raw.condition.trim();
    if (condition.length > MAX_WEATHER_CONDITION) {
      problems.push(`天气简述最多 ${MAX_WEATHER_CONDITION} 字`);
    } else if (condition) {
      out.condition = condition;
    }
  }

  for (const key of ['temperatureC', 'humidityPct', 'uvIndex'] as const) {
    const value = raw[key];
    if (value === undefined) continue;
    const [min, max] = WEATHER_BOUNDS[key];
    if (!Number.isFinite(value) || value < min || value > max) {
      problems.push(`${key} 超出合理区间 ${min}~${max}`);
    } else {
      out[key] = value;
    }
  }

  if (problems.length > 0) fail(problems.join(';'));
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 校验「确认出图」入参。★ 除了归属人什么都没得校验——**这是有意的**,见 schema 注释。 */
export function validateConfirmRender(raw: unknown): ConfirmRenderRaw {
  return validateUserIdOnly(raw);
}

/** 校验「发消息」入参。 */
export function validateSendMessage(raw: unknown): SendMessageRaw {
  const parsed = sendMessageSchema.safeParse(raw ?? {});
  if (!parsed.success) fail(describeIssues(parsed.error));

  const userId = parsed.data.userId.trim();
  if (userId === '') fail('userId 不能是空白');

  // ★ 长度上限(§4.2 后在这里)。⚠️ 量的是**原文**,trim 之前 —— 与 schema 时代一致:
  //   一条末尾带一万个空格的正文照样会烧上下文预算,不能靠 trim 绕过。
  if (parsed.data.text.length > MAX_AGENT_TEXT) {
    fail(`消息最多 ${MAX_AGENT_TEXT} 字`);
  }

  // ★ 正文按**原样**保留首尾之外的空格无所谓,但**全空白要拦**——
  //   全空白消息会白烧一轮 LLM,而且模型收到空话只会瞎猜。
  const text = parsed.data.text.trim();
  if (text === '') fail('消息不能是空白');

  return { userId, text };
}

/**
 * 路径参数里的会话 id。
 * 形状校验只有"非空字符串",**归属与存在性一律由用例判**——
 * 在这里查会话等于让控制器读存储,层次就穿了。
 */
export function validateSessionId(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    fail('会话 id 不能为空');
  }
  return raw.trim();
}

/** 查询串里的归属人(`GET` 用;`DELETE`/`GET` 都不指望请求体,代理会丢)。 */
export function validateUserIdQuery(query: unknown): string {
  const raw = (query as { userId?: unknown } | undefined)?.userId;
  if (typeof raw !== 'string' || raw.trim() === '') fail('缺少 userId');
  return raw.trim();
}

/**
 * multipart 表单字段里的归属人(**两条上传口共用**)。
 * ★ 为什么走表单而不是 JSON:那条请求体**只能是 multipart**(要带文件),
 *   混不进一个 JSON body。这一点与查询串那条是同一个理由——**能放的地方就是那里**。
 * ✏️ 读图那一轮把「上传照片时」改成「上传时」:它现在也服务参考图那条口。
 */
export function validateUserIdField(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    fail('缺少 userId。上传时请把 userId 作为表单字段一并提交。');
  }
  return raw.trim();
}

/** 路径参数里的出图序号(取图路由用)。 */
export function validateRenderSeq(raw: unknown): number {
  const n = Number(raw);
  // ★ 只接受**正整数**:`0`、`1.5`、`"abc"`、`-1` 全都不是有效的序号,
  //   而放它们进去就等于放它们进存储键(那是拼路径的地方,越界的值必须在此止步)。
  if (!Number.isInteger(n) || n < 1) fail('出图序号必须是正整数');
  return n;
}

/**
 * 校验上传的文件**是不是一张图片**。
 *
 * ⚠️ **只验这一件事。** 尤其**不做人脸检测**:`face` 分析读的是服务端**已经存下的**
 *   那张图(见 `analyze-image.ts`),跟"这一份上传流里有没有脸"是两个时刻的事。
 *   这里说得出的话只有:类型对不对、有没有文件名。
 *   **判断不了的事就不要在这里假装判断了**(§7.2)。
 *
 * 大小与文件个数由 `@fastify/multipart` 的 limits 兜(见 `src/app.ts`,用 `maxUploadMb`)。
 */
function checkUploadedImage<T extends { mimeType: string }>(
  /**
   * ★ 只要求"有 `mimeType`"(结构类型):本函数不碰流,也不该看见流——
   * 传进来的具体类型它一概不动。
   */
  file: T | undefined,
  /** 报错时点名的字段名。两条上传口各自不同,所以从调用点传进来。 */
  fieldName: string,
): T {
  if (!file) fail(`没有收到文件。请用 multipart/form-data 上传,字段名 ${fieldName}。`);
  if (!file.mimeType.startsWith('image/')) {
    fail(`只收图片文件,收到的是「${file.mimeType || '未知类型'}」。`);
  }
  // ★ **原样交回入参**,不做转换。这不是偷懒:调用方因此拿到**收窄过的**类型,
  //   不必再写一遍 `if (!file)`——而那段判断的文案只该有一份。
  return file;
}

/** 校验上传的**本人照片**(字段 `face`)。 */
export function validatePhotoUpload<T extends { mimeType: string }>(file: T | undefined): T {
  return checkUploadedImage(file, 'face');
}

/** 校验上传的**参考图**(风格图 / 场景图,字段 `file`)。 */
export function validateImageUpload<T extends { mimeType: string }>(file: T | undefined): T {
  return checkUploadedImage(file, 'file');
}

/**
 * 从一个闭集里挑出 `raw`,挑不到就当场失败并**列出全部合法取值**。
 *
 * ★ 不用 `as` 把字符串硬塞成联合类型(§7.3):`find` 返回的是**元组里那个字面量本身**,
 *   所以返回类型天然正确 —— 而且当元组与目标 union 漂开时**这里编译不过**
 *   (`ANALYZE_CASES` / `REF_IMAGE_KINDS` 与 `makeup` / 本模块那两个 union 的交叉校验
 *   就落在这一行上,不用另写一条类型级断言)。
 */
function pick<T extends string>(allowed: readonly T[], raw: unknown, label: string): T {
  const value = typeof raw === 'string' ? raw.trim() : '';
  const hit = allowed.find((a) => a === value);
  if (!hit) fail(`${label} 取值「${value || '(空)'}」不合法;可用:${allowed.join(' / ')}`);
  return hit;
}

/**
 * 触发分析时收的 `kind`。
 * ★ 不认识的值**当场失败并列出合法取值**,绝不兜到某一个缺省上——
 *   兜底的话,"用户点了风格分析、实际跑的是肤色"会变成一个静默的成功(本仓头号 bug)。
 */
export function validateAnalysisKind(raw: unknown): AnalyzeCase {
  return pick<AnalyzeCase>(ANALYZE_CASES, raw, 'kind');
}

/** multipart 表单里那条上传口收的 `kind`(只可能是风格图 / 场景图)。 */
export function validateImageKindField(raw: unknown): RefImageKind {
  return pick<RefImageKind>(REF_IMAGE_KINDS, raw, 'kind');
}

/** 校验「触发一次分析」入参。 */
export interface AnalysesRequestInput {
  userId: string;
  kind: AnalyzeCase;
}

export function validateAnalysesRequest(raw: unknown): AnalysesRequestInput {
  const parsed = analysesRequestSchema.safeParse(raw ?? {});
  if (!parsed.success) fail(describeIssues(parsed.error));

  const userId = parsed.data.userId.trim();
  if (userId === '') fail('userId 不能是空白');

  return { userId, kind: validateAnalysisKind(parsed.data.kind) };
}
