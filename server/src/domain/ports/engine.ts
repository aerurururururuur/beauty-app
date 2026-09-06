/**
 * domain/ports/engine.ts —— ★ 上妆引擎端口(主缝)。
 *
 * 这是整个骨架最关键的接缝:未来「参数化上妆」或「第三方图像 API」两种实现
 * 都只需实现本端口(2 个成员),流水线与 HTTP 不感知具体实现。
 *
 * 说明:引擎收到的是已解析到本机磁盘的图片路径;将来若换云存储/把图片转交远端 API,
 * 由上层用例在调用处解析/适配,端口形状可保持不变。
 */
import type { Look, ReferenceImage, SceneAnalysis } from '../entities/index.js';

export interface EngineSourceImage {
  filePath: string; // 本机绝对路径
  mimeType: string;
  originalName?: string;
}

export interface EngineInput {
  face: EngineSourceImage;
  scenes: EngineSourceImage[];
  /** 自由文字场景描述。 */
  sceneText?: string;
  sceneAnalysis?: SceneAnalysis; // 场景阶段开启并成功时传入
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
