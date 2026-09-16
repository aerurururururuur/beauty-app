/**
 * domain/validators/agent-http.validator.ts —— HTTP 入参的校验**行为**。
 * 形状在 `schemas/agent-http.ts`;这里只做形状表达不了的事:清洗 + 中文错误。
 * (长度上限这类"单字段闭区间"归 schema,不在这里重复一遍。)
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import { confirmRenderSchema, startSessionSchema, sendMessageSchema } from '../schemas/agent-http.js';
import type { ConfirmRenderRaw, SendMessageRaw, StartSessionRaw } from '../schemas/agent-http.js';
import { describeIssues } from './validate.js';

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

/** 校验「开会话」入参。 */
export function validateStartSession(raw: unknown): StartSessionRaw {
  return validateUserIdOnly(raw);
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
 * multipart 表单字段里的归属人(上传照片用)。
 * ★ 为什么走表单而不是 JSON:那条请求体**只能是 multipart**(要带文件),
 *   混不进一个 JSON body。这一点与查询串那条是同一个理由——**能放的地方就是那里**。
 */
export function validateUserIdField(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    fail('缺少 userId。上传照片时请把 userId 作为表单字段一并提交。');
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
 * 校验上传的照片。
 *
 * ⚠️ **只验"它是不是一张图片"**,不验别的——特别是**不做人脸检测**(§7.2:
 * 视觉读图那条腿本次"只预留、不实现")。这里说得出的话只有:
 * 类型对不对、有没有文件名。**判断不了的事就不要在这里假装判断了。**
 *
 * 大小与文件个数由 `@fastify/multipart` 的 limits 兜(`maxUploadMb`,同 `jobs`)。
 */
export function validatePhotoUpload<T extends { mimeType: string }>(
  /**
   * ★ 只要求"有 `mimeType`"(结构类型):本函数不碰流,也不该看见流——
   * 传进来的具体类型它一概不动。
   */
  file: T | undefined,
): T {
  if (!file) fail('没有收到文件。请用 multipart/form-data 上传,字段名 face。');
  if (!file.mimeType.startsWith('image/')) {
    fail(`只收图片文件,收到的是「${file.mimeType || '未知类型'}」。`);
  }
  // ★ **原样交回入参**,不做转换。这不是偷懒:调用方因此拿到**收窄过的**类型,
  //   不必再写一遍 `if (!file)`——而那段判断的文案只该有一份。
  return file;
}
