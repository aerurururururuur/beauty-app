/**
 * domain/ports/scene-analyzer.ts —— 场景理解端口(可选缝)。
 * 把风景图/文字 → 场景妆容方向。未来可接视觉大模型,现 mock。
 */
import type { SceneAnalysis } from '../entities/scene.js';
import type { EngineSourceImage } from './engine.js';

export interface SceneAnalyzerInput {
  face: EngineSourceImage;
  scenes: EngineSourceImage[];
  /** 自由文字场景描述。 */
  sceneText?: string;
}

export interface SceneAnalyzer {
  readonly name: string;
  analyze(input: SceneAnalyzerInput): Promise<SceneAnalysis>;
}
