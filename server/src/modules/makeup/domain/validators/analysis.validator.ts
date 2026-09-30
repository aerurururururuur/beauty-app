/**
 * makeup/domain/validators/analysis.validator.ts —— `face` / `scene` 读数的取值规则。
 *
 * ★ **不新写白名单。** `skinTone` 的取值规则全仓只有一份:
 *   `shared/domain/validators/brief-fields.validator.ts` 的 `checkBriefFields`,
 *   由「开会话」与 `patch_brief` 两条入口共用(§5.1)。读图是第三条入口,**同样调它** ——
 *   它的失败消息本来就带完整可选清单,正是要给模型看的那种文案。
 *   各判一次的话,「哪些肤色算合法」就有了第二处定义,而它不会和第一处一起改。
 *
 * ⚠️ **`scene` 是这条规矩唯一的例外**(2026-09-30),理由写在 `validateSceneReading` 上。
 *
 * 三步:形状(`schemas/contracts/analysis.ts`)→ 取值(上面那份规则)→ 逐字段显式装配。
 * **不做断言、不兜底**:模型回一个不在闭集里的词,要当场失败。
 * 把它映射到最近的档位就是本仓头号 bug 的形状——200、日志干净、肤色悄悄是错的。
 */
import type { AnalysisOf } from '../ports/analyzer.js';
import type { StyleRead } from '../entities/style-read.js';
import { faceReadingSchema, sceneReadingSchema } from '../schemas/index.js';
import { MAX_SCENE_NOTE, checkBriefFields } from '../../../shared/index.js';
import { describeIssue, fail } from '../errors/validation-errors.js';
import { validateStyleRead } from './look-spec.validator.js';

/** 提示词允许模型用它表示「读不出来」。它是**一条失败通道**,不是一种取值。 */
const UNKNOWN = 'unknown';

/**
 * 风格读数的失败通道。`face` / `scene` 把它挂在字段值上(`{"skinTone":"unknown"}`),
 * 而 `StyleRead` 没有哪个字段能单独表示"整份都没读出来",所以用这个形状。
 * 它**不是**一种读数:认出来就当场失败,绝不往下走。
 */
function isUnknownEscape(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && 'unknown' in raw && raw.unknown === true;
}

/** 校验一次 `style` 读数。★ 三个读数的失败通道都收在本文件里,别在分析器里各写一遍。 */
export function validateStyleReading(raw: unknown): StyleRead {
  if (isUnknownEscape(raw)) fail('风格图读数', '图里没能提炼出可信的风格。');
  return validateStyleRead(raw);
}

/**
 * 模型回的那段文本 → 还没查取值的值。
 * ★ §7.2 要求边界上的 `JSON.parse` 都收在 `validators/` 里 —— 就是这里,只有这一处。
 *
 * ★ 容忍一层 ``` 围栏(**容错,不是规则**):模型习惯把 JSON 包进代码块。
 *   围栏里的内容仍要过同一套形状与取值校验,所以它不可能因此放行一个错答案 ——
 *   顶多是把一个本该失败的回复读成失败。围栏之外还夹着别的话,一律当场失败。
 *   ⚠️ `[未验证]`:真实回复长什么样要靠 `npm run probe:vision` 定,别当成已知。
 */
export function parseVisionReply(text: string, subject: string): unknown {
  const inner = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1]?.trim();
  for (const candidate of inner === undefined ? [text] : [text, inner]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // 换下一种写法;两种都失败才报错(报的是原文,不是最后一次的异常)。
    }
  }
  fail(subject, `模型回复不是合法 JSON:${text.trim().slice(0, 200)}`);
}

/** 校验一次 `face` 读数(肤色 8 档之一)。 */
export function validateFaceReading(raw: unknown): AnalysisOf['face'] {
  const parsed = faceReadingSchema.safeParse(raw);
  if (!parsed.success) {
    fail('肤色读数', parsed.error.issues.map(describeIssue).join(';'));
  }
  const { skinTone } = parsed.data;

  if (skinTone === UNKNOWN) {
    fail('肤色读数', '照片里没读出可信的肤色,没有写入简报。');
  }
  const checked = checkBriefFields({ skinTone });
  if (!checked.ok) fail('肤色读数', checked.message);
  if (!checked.brief.skinTone) fail('肤色读数', '没有给出肤色。');

  return { skinTone: checked.brief.skinTone };
}

/**
 * 校验一次 `scene` 读数 —— 图上读出来的**一句话**(灯光 / 正式程度 / 氛围)。
 *
 * ★★ **全仓唯一一处不调 `checkBriefFields` 的读数**,这是刻意的,不是漏了。
 *   文件头那条「不新写白名单」针对的是**闭集取值**(肤色档、预设场合)——那些值有一份
 *   能共享的清单。场景图读出的是**图上真有的东西**,没有清单可共享。
 *   真要说它像什么:`sceneText`(用户自己的话,同样只判长度)。
 *
 *   ⚠️ 所以这里**绝不能**「把这句话收进 8 档里最近的一格」。那正是文件头第 12 行点名的
 *   头号 bug 形状:200、日志干净、而用户看见的场合是错的。读图的任务是**读出**,
 *   不是**归类**;归类那件事由 `brief.occasion`(用户说的)负责。
 *   `face` 那一支一行不动,它仍然共用 `checkBriefFields`。
 */
export function validateSceneReading(raw: unknown): AnalysisOf['scene'] {
  const parsed = sceneReadingSchema.safeParse(raw);
  if (!parsed.success) {
    fail('场合读数', parsed.error.issues.map(describeIssue).join(';'));
  }
  const scene = parsed.data.scene.trim();

  if (scene === UNKNOWN) {
    fail('场合读数', '图里没读出可信的场合,没有写入简报。');
  }
  if (scene === '') {
    fail('场合读数', '没有给出场合描述。');
  }
  if (scene.length > MAX_SCENE_NOTE) {
    fail('场合读数', `场合描述最多 ${MAX_SCENE_NOTE} 字(收到 ${scene.length} 字)`);
  }

  return { sceneNote: scene };
}
