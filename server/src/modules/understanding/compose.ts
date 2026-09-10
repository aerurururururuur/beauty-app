/**
 * modules/understanding/compose.ts —— 组合根。
 * 按 config.sceneAnalyzer 分发实现:
 *   mock —— 按 brief 判定场合(规则单一源见 shared/domain/scene-rules.ts);
 *   off  —— 不做推断,给中性结果(紧急逃生门,语义见 off-scene-analyzer.ts)。
 * 业务 / HTTP 层都不感知具体是哪个实现。
 */
import { OffSceneAnalyzer } from './infrastructure/scene-analyzer/off-scene-analyzer.js';
import { MockSceneAnalyzer } from './infrastructure/scene-analyzer/mock-scene-analyzer.js';
import type { SceneAnalyzer } from './domain/ports/scene-analyzer.js';

/**
 * 场景理解开关。与 `shared/infrastructure/config.ts` 的 `sceneAnalyzer` 同形
 * (那边读 SCENE_ANALYZER 环境变量);此处独立声明,避免模块反向依赖组装层的配置类型。
 * 两处要一起改。
 */
export type SceneAnalyzerKind = 'mock' | 'off';

export interface UnderstandingModuleOptions {
  /** 场景理解开关(来自 config.sceneAnalyzer)。 */
  kind?: SceneAnalyzerKind;
}

export interface UnderstandingModuleServices {
  sceneAnalyzer: SceneAnalyzer;
}

export function createUnderstandingModule(
  options: UnderstandingModuleOptions = {},
): UnderstandingModuleServices {
  const kind = options.kind ?? 'mock';
  return { sceneAnalyzer: kind === 'off' ? new OffSceneAnalyzer() : new MockSceneAnalyzer() };
}
