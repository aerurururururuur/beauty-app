/**
 * domain/ports/scene-analyzer.ts —— 场景理解端口(可选缝)。
 * 把「用户需求简报 brief(场合 + 自由文字)」→ 妆容方向。
 * scenes 为可选风景参考图(骨架里不驱动风格,留给未来视觉大模型加分项)。
 */
import type { EngineSourceImage, MakeupBrief } from '../../../shared/index.js';
import type { SceneAnalysis } from '../entities/scene.js';

export interface SceneAnalyzerInput {
  face: EngineSourceImage;
  /** 可选风景/氛围参考图(不驱动风格;回显/未来视觉理解用)。 */
  scenes: EngineSourceImage[];
  brief: MakeupBrief;
}

export interface SceneAnalyzer {
  readonly name: string;
  analyze(input: SceneAnalyzerInput): Promise<SceneAnalysis>;
}
