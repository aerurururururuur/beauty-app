/**
 * domain/ports/engine.ts —— ★ 上妆引擎端口(主缝)。
 *
 * 这是整个骨架最关键的接缝:未来「参数化上妆」或「第三方图像 API」两种实现
 * 都只需实现本端口(2 个成员),流水线与 HTTP 不感知具体实现。
 *
 * 说明:引擎收到的是已解析到本机磁盘的图片路径;将来若换云存储/把图片转交远端 API,
 * 由上层用例在调用处解析/适配,端口形状可保持不变。
 */
import type { EngineSourceImage, MakeupBrief } from '../../../shared/index.js';
import type { Look } from '../entities/look.js';
import type { LookSpec } from '../entities/look-spec.js';

export interface EngineInput {
  face: EngineSourceImage;
  /** 用户需求简报:occasion / 肤质肤色 / 穿搭 / 天气 / 自由文字。 */
  brief: MakeupBrief;
  /**
   * 用户上传的风格参考图(本机文件)。
   *
   * ⚠️ **当前无生产者,占位。** 唯一会传图的入口(`POST /agent/sessions/:id/photo`)
   * 只认本人照片一张,而这条字段要等「风格图进引擎」那一轮才有上层去填它。
   * 引擎收到就该按"没有"处理,别在这里替上层编一份默认值。
   */
  references?: EngineSourceImage[];
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
