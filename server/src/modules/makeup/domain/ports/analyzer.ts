/**
 * makeup/domain/ports/analyzer.ts —— 「读图」端口。
 *
 * 与 `engine.ts`(出图)并排:那个是「给一套妆面单,出一张图」,这个是「给一张图,答一个问题」。
 * 依赖方向相同 —— 能力由本模块提供,由 `agent` 调用;`makeup` 不认识 `agent`。
 *
 * ── 为什么是「一个接口 + 三个 case」,不是三个端口 ─────────────────────────
 * 三者只共享**输入**(一张已落盘的图)与**调用方式**(一个方法),**不共享返回类型**。
 * 合成一个「返回一袋可选字段」的端口,每个适配器都得对另外两种情况表态,而它不知道答案
 * —— 那袋字段迟早有一个被顺手填上。拆成三个端口,「三种都要有实现」就只能写在注释里。
 * 取中间:接口按 case 参数化,`read` 的返回类型跟着 case 走,再加一张穷尽的分派表。
 *
 * ★ `Analyzers` 是 mapped type:**加第四个 case 而不加适配器,编译不过。**
 *   「少了一格但照跑」是本仓头号 bug,这条把它变成编译期错误(§4.4)。
 *
 * ── 三个 case 的产物 ──────────────────────────────────────────────────────
 * | case | 读什么 | 产物 | 规则表在哪 |
 * | --- | --- | --- | --- |
 * | `face` | 本人照片 | `skinTone` | `shared/.../brief-fields.validator.ts` |
 * | `scene` | 场景地点图 | `occasion` | 同上 |
 * | `style` | 风格参考图 | `StyleRead` | `domain/validators/look-spec.validator.ts` |
 *
 * ★ **`face` / `scene` 不新写白名单**,直接调那张全仓唯一的规则表:读图是第三条入口
 *   (前两条是开会话与 `patch_brief`),各判一次就有了第二处定义(§5.1)。
 * ★ 产物全是闭集里的值、无自由文本 —— 理由见 `entities/style-read.ts`。
 */
import type { Occasion, ResolvedImage, SkinTone } from '../../../shared/index.js';
import type { StyleRead } from '../entities/style-read.js';

/**
 * 三种图。
 *
 * ⚠️ 与 `assets` 的 `InputKind` **同形**(也是这三个词),两处要一起改。
 * 按本仓的惯例,同名 union 各声明一份并在这里点名(同 `MakeupEngineKind` 与
 * `config.ts` 的关系):`makeup` **不 import 任何业务模块**(README 的依赖小节),
 * 所以不能从 `assets` 借这个类型。
 */
export type AnalyzeCase = 'face' | 'scene' | 'style';

/** 一次读图的输入。三个 case 一个形状 —— 差别全在**问题**上,不在图上。 */
export interface AnalyzeInput {
  /** 已解析成本机绝对路径的输入图(复用 `ResolvedImage`,不新造类型)。 */
  image: ResolvedImage;
}

/** 三个 case 各自的产物。★ 每一项都是**闭集里的值**,见文件头。 */
export interface AnalysisOf {
  /** 肤色 8 档之一(`SKIN_TONES`)。 */
  face: { skinTone: SkinTone };
  /** 场合 5 档之一(`OCCASIONS`)。 */
  scene: { occasion: Occasion };
  /** 风格图读数(复合值,所以它是个实体类)。 */
  style: StyleRead;
}

/**
 * 一个 case 一个适配器。`read` **只回答这一种问题**,返回类型跟着 `C` 走 ——
 * 一个 `face` 适配器不需要知道"风格图读数"长什么样。
 */
export interface ImageAnalyzer<C extends AnalyzeCase> {
  readonly case: C;
  read(input: AnalyzeInput): Promise<AnalysisOf[C]>;
}

/**
 * 三种适配器**齐了**才算一份 `Analyzers`。
 *
 * ★ mapped type 是刻意的(见文件头):**加 case 不加适配器 = 编译不过。**
 *   写成 `Partial<Record<…>>` 或三个可选字段,得到的就是「某种情况没人实现,
 *   而调用点照跑」—— 那正是本仓反复点名的那类 bug。
 */
export type Analyzers = { [C in AnalyzeCase]: ImageAnalyzer<C> };
