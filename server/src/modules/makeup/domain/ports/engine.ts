/**
 * domain/ports/engine.ts —— ★ 上妆引擎端口(主缝)。
 *
 * 这是整个骨架最关键的接缝:未来「参数化上妆」或「第三方图像 API」两种实现
 * 都只需实现本端口(2 个成员),流水线与 HTTP 不感知具体实现。
 *
 * 说明:引擎收到的是已解析到本机磁盘的图片路径;将来若换云存储/把图片转交远端 API,
 * 由上层用例在调用处解析/适配,端口形状可保持不变。
 */
import type { EngineSourceImage, MakeupBrief, SceneDescriptor } from '../../../shared/index.js';
import type { ReferenceImage } from '../../../references/index.js';
import type { Look } from '../entities/look.js';
import type { LookSpec } from '../entities/look-spec.js';

export interface EngineInput {
  face: EngineSourceImage;
  /** 可选风景/氛围参考图(不驱动风格)。 */
  scenes: EngineSourceImage[];
  /** 用户需求简报:occasion / 肤质肤色 / 穿搭 / 天气 / 自由文字。 */
  brief: MakeupBrief;
  /** 流水线算出的妆容方向(场合 label 驱动 style/palette 基准)。 */
  scene?: SceneDescriptor;
  references?: ReferenceImage[]; // 参考图阶段开启时传入
  /**
   * ★ **妆面单:只有 agent 路径会传**(设计文档 §8.1)。
   *
   * §5.1 原话说「`LookSpec` 塞进 `brief` 也行、作为新字段也行」,2026-09-16 拍板**走新字段**:
   *
   * 1. **`brief` 是"用户填的",`LookSpec` 是"算出来的"。** 两者的来源与可信度都不是一回事,
   *    混进同一个包里,"同一层里 occasion 以谁为准"就变成一个需要解释的问题。
   * 2. ★ **`brief` 会泄漏进 `JobView`**(`jobs/domain/api/job-view.ts:17`),
   *    而 §6 规矩 3 明写「**不要让它泄漏进 `JobView`**」。塞进 `brief` 会**同时**让
   *    `POST /api/jobs` 的校验器接受它——那是把一条引擎私有契约接上了 HTTP 边界。
   *
   * ⚠️ **可选,且缺省不传时不代表"没有妆面要求"**:`jobs` 那条路(冻结中)从来不传它,
   * 所以**依赖它的引擎在表单路径上不可用**——`ImageEngine` 会明确报错而不是瞎编一套妆。
   * 这条后果记在 `modules/makeup/README.md` 与设计文档 §8.1。
   */
  lookSpec?: LookSpec;
}

export interface EngineResult {
  resultFilePath: string; // 引擎产出的成品图(本机绝对路径)
  mimeType: string;
  look: Look; // 结构化妆容元信息,对流水线不透明
}

export interface Engine {
  readonly name: string; // 'mock' | 'parametric' | 'third-party'
  generate(input: EngineInput): Promise<EngineResult>;
}
