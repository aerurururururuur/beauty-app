/**
 * domain/validators/user.validator.ts —— 账号入参的校验行为。
 * 真正被 presentation / application 调用的对象:
 *   ① 用 credentialsSchema(纯形状)检查结构是否合法;
 *   ② 执行形状表达不了的语义规则(长度上下限、格式正则、字符集),
 *      统一映射成 VALIDATION_ERROR;
 *   ③ 清洗(trim 昵称)并产出可直接落库 / 比对的凭据。
 *
 * ★ §4.2:上面那些**上下限与格式常量定义在本文件里**,不在 `schemas/` ——
 *   规则和它的错误文案放一起,改一处就生效;schema 那边只剩「是不是字符串」。
 *   ⚠️ §4.3 欠账:这些上限仍是文件里的魔数,要真兑现得由组合根注入(单独一轮)。
 *
 * 注册与登录同形同规则,故共用一个校验器(将来若注册规则变严,在此按意图分叉)。
 * 密码**不做任何清洗**:空格、首尾空白都是密码的合法字符,动了就和用户之后输入的密码对不上。
 *
 * ★ **对外文案用前端页面上的词**:身份字段叫「桃妆 ID」、账号叫「桃妆账号」——
 *   不叫「昵称」「用户」。理由:前端不按 `code` 分支,把这里的 message **原样**打在
 *   输入框旁边(vue/AGENTS.md §3 第 2 条),所以这几句就是 UI 文案,必须用用户看得见的词。
 *   ⚠️ **只换文案,不换标识符**:`nickname` / `USER_ID_PATTERN` / 本文件与模块 README 里的
 *   「昵称」全部照旧。内部术语与对外文案是两套,**别为了"统一"去改字段名**。
 *   ⚠️ `agent` 模块的 `start-session.ts` 另有一句 `用户不存在:<id>`——**刻意不同步**:
 *   那条路由今天没有任何前端在调,它的读者不是桃妆用户(该仓原则见 agent/README「各写面向
 *   自己读者的文案」)。别照着这里把那句也改了。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import { credentialsSchema, userIdSchema, userTableSchema } from '../schemas/index.js';
import { zodIssuesMessage } from '../../../shared/index.js';
import type { User } from '../entities/user.js';

/** 昵称原文上限(字,给 trim 留余量;清洗后的上下限另判)。 */
export const MAX_NICKNAME_RAW = 64;
/** 昵称清洗后上限(字)。 */
export const MAX_NICKNAME = 32;
/** 昵称清洗后下限(字)。 */
export const MIN_NICKNAME = 2;
/** 密码下限(位)。 */
export const MIN_PASSWORD = 6;
/** 密码上限(位,同时是防超长 payload 的闸门)。 */
export const MAX_PASSWORD = 128;

/**
 * 用户 id 的格式:只认 URL 安全字符,1..80 位。
 *
 * ★ 与 `cabinet` 的同名正则(`ITEM_ID_PATTERN` / `OWNER_ID_PATTERN`)**逐字同款但各持一份**
 *   —— 模块之间不互相 import(见模块 README 的依赖方向约定),不为了一个正则破例。
 *   ✏️ 2026-09-29:此前这里数的是"另外三处",`jobs` 那份随模块删了 —— 实测全仓**只剩两处**
 *   (本文件与 `cabinet/domain/validators/cosmetic-item.validator.ts`,后者两份里
 *   `ITEM_ID_PATTERN` 管条目 id、`OWNER_ID_PATTERN` 管归属人 id)。改这里请顺手看那一处。
 */
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/** 通过校验、可交给用例使用的账号凭据(密码仍是明文,仅在内存中流转)。 */
export interface Credentials {
  nickname: string;
  password: string;
}

/** 是否含控制字符(C0 段 + DEL):昵称会进 URL 与 UI,含换行 / 制表 / NUL 一律拒收。 */
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

/** 校验账号 id,合法则原样返回,非法抛 AppError。 */
export function validateUserId(raw: unknown): string {
  const parsed = userIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error));
  }
  if (!USER_ID_PATTERN.test(parsed.data)) fail('桃妆账号不合法');
  return parsed.data;
}

/** 校验账号凭据(注册 / 登录共用);不合法抛带业务错误码的 AppError,合法返回清洗后的凭据。 */
export function validateCredentials(raw: unknown): Credentials {
  // ① 形状
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error), {
      issues: parsed.error.issues,
    });
  }

  // ② 原文上限(§4.2 后在这里;先挡住超大 payload,别拿超长串喂 scrypt)。
  //    两条**一起报**,不中途返回:schema 时代它们是一次 parse 里的两个 issue。
  const tooLong: string[] = [];
  if (parsed.data.nickname.length > MAX_NICKNAME_RAW) {
    tooLong.push(`桃妆 ID 原文最多 ${MAX_NICKNAME_RAW} 字`);
  }
  if (parsed.data.password.length > MAX_PASSWORD) {
    tooLong.push(`密码最多 ${MAX_PASSWORD} 位`);
  }
  if (tooLong.length > 0) fail(tooLong.join(';'));

  // ③ 语义规则(形状表达不了的:长度夹逼、字符集)
  const nickname = parsed.data.nickname.trim();
  if (nickname.length < MIN_NICKNAME) {
    fail(`桃妆 ID 至少 ${MIN_NICKNAME} 个字符(不含首尾空白)`);
  }
  if (nickname.length > MAX_NICKNAME) {
    fail(`桃妆 ID 最多 ${MAX_NICKNAME} 个字符`);
  }
  if (hasControlChar(nickname)) {
    fail('桃妆 ID 不能包含换行或控制字符');
  }
  if (parsed.data.password.length < MIN_PASSWORD) {
    fail(`密码至少 ${MIN_PASSWORD} 位(最多 ${MAX_PASSWORD} 位)`);
  }

  // ④ 输出(密码原样透传,不清洗)
  return { nickname, password: parsed.data.password };
}

/**
 * 落盘表(`dataDir/users/users.json`)的解析点 —— 仓库读出口调它(§7.2)。
 *
 * ★ 这里只查**形状**。昵称长度、id 格式是**入参**规则,不拿来回溯校验盘上的数据:
 *   某天收紧一条上限,旧账号不该整个读不出来。这道网要挡的是另一类事 ——
 *   文件被手改过、写坏了,形状对不上。
 * ★ 抛普通 `Error` 而不是 `AppError`:这不是「这个请求不合法」,是**盘上的数据坏了**。
 *   该以 500 结束并让人去查那个文件,不是一个 400 把锅甩给客户端。
 */
export function parseUserTable(raw: unknown, file: string): Record<string, User> {
  const parsed = userTableSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `账号数据不合法:${file} —— ${zodIssuesMessage(parsed.error)}。` +
        '这是 dataDir 下的落盘数据,不是请求入参;多半是文件被手改过。',
    );
  }

  const table: Record<string, User> = {};
  for (const [id, row] of Object.entries(parsed.data)) {
    // 键与行里的 id 必须一致:对不上时「按 id 查不到、按昵称却查得到」,登录会变得不可解释。
    if (row.id !== id) {
      throw new Error(
        `账号数据不合法:${file} —— 键「${id}」下的账号 id 是「${row.id}」,两者必须一致。`,
      );
    }
    table[id] = row;
  }
  return table;
}
