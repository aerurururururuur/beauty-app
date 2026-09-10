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

export interface EngineInput {
  face: EngineSourceImage;
  /** 可选风景/氛围参考图(不驱动风格)。 */
  scenes: EngineSourceImage[];
  /** 用户需求简报:occasion / 肤质肤色 / 穿搭 / 天气 / 自由文字。 */
  brief: MakeupBrief;
  /** 流水线算出的妆容方向(场合 label 驱动 style/palette 基准)。 */
  scene?: SceneDescriptor;
  references?: ReferenceImage[]; // 参考图阶段开启时传入
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
