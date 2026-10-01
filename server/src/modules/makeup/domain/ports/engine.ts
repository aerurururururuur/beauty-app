/**
 * domain/ports/engine.ts —— ★ 上妆引擎端口(主缝)。
 *
 * 这是整个骨架最关键的接缝:未来「参数化上妆」或「第三方图像 API」两种实现
 * 都只需实现本端口(2 个成员),流水线与 HTTP 不感知具体实现。
 *
 * 说明:引擎收到的是已解析到本机磁盘的图片路径;将来若换云存储/把图片转交远端 API,
 * 由上层用例在调用处解析/适配,端口形状可保持不变。
 */
import type { MakeupBrief, ResolvedImage } from '../../../shared/index.js';
import type { Look } from '../entities/look.js';
import type { LookSpec, ZoneRole } from '../entities/look-spec.js';

export interface EngineInput {
  face: ResolvedImage;
  /** 用户需求简报:occasion / 肤质肤色 / 穿搭 / 天气 / 自由文字。 */
  brief: MakeupBrief;
  /**
   * 用户上传的风格参考图(本机文件)。
   *
   * ★ **已决定不进引擎**(2026-09-29):风格图只做**文本化分析** —— 读出的 `StyleRead`
   * 经 `styleReadNote` 进 `messages[]` 交给模型填 `LookSpec`。
   * 所以这条字段**当前无生产者,而这是决定,不是占位**;理由与代价记在
   * `modules/makeup/README.md` 的待办里。
   * 引擎收到就该按"没有"处理,别在这里替上层编一份默认值。
   */
  references?: ResolvedImage[];
  /**
   * ★ **妆面单:只有 agent 路径会传。**
   *
   * `LookSpec` 走**新字段**、不塞进 `brief`,两条理由:
   *
   * 1. **`brief` 是"用户填的",`LookSpec` 是"算出来的"。** 两者的来源与可信度都不是一回事,
   *    混进同一个包里,"同一层里 occasion 以谁为准"就变成一个需要解释的问题。
   * 2. ★ **`brief` 是从 HTTP 边界进来的**(`POST /agent/sessions` 带初始 brief)。
   *    塞进 `brief` 就等于**让那条入口的校验器顺手接受 `lookSpec`**——
   *    把一条引擎私有契约接上了 HTTP 边界。妆面单只该由 `propose_look` 产出。
   *
   * ⚠️ **可选,且缺省不传时不代表"没有妆面要求"**:`ImageEngine` 缺它时会**明确报错**
   * 而不是瞎编一套妆。这条后果记在 `modules/makeup/README.md`。
   */
  lookSpec?: LookSpec;
  /**
   * ★ **只画这几个区**(✏️ 2026-10-01 逐步累积出图:一个上妆步一张图)。
   *
   * 缺省 = `lookSpec.zones` 里填了的区全画,也就是今天的行为。
   * ⚠️ **引擎只拿它收窄措辞,不拿它挑色** —— 色仍然来自 `lookSpec` 本身,
   * 所以"同一份妆面单的第 3 张与第 5 张"变化只在画到哪儿了。
   */
  appliedZones?: readonly ZoneRole[];
}

export interface EngineResult {
  /**
   * ★ 引擎产出的成品图。**与输入图同一个形状**(`ResolvedImage`:本机绝对路径 + MIME)——
   *   原先这里写的是 `resultFilePath` + `mimeType` 两个平铺字段,与 `EngineInput.face`
   *   装的是同一件东西却各说各话,调用方还得手动把两份拼回一张图。
   */
  image: ResolvedImage;
  look: Look; // 结构化妆容元信息,对流水线不透明
}

export interface Engine {
  readonly name: string; // 'mock' | 'parametric' | 'third-party'
  generate(input: EngineInput): Promise<EngineResult>;
}
