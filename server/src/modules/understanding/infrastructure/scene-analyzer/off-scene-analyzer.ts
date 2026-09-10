/**
 * infrastructure/scene-analyzer/off-scene-analyzer.ts —— `SCENE_ANALYZER=off` 时的实现。
 *
 * ★ 语义是「**不推断**」,不是「关掉这一棒」:`run-pipeline.ts` 的流水线强依赖 `scene`,
 *   真关掉会让每个任务失败。所以 off 给的是**中性结果**:按默认场合(日常)走,
 *   不声明任何关键词标签。
 *
 * 它存在的意义是**紧急逃生门**:将来接了视觉大模型而现场判断开始抽风时,
 * 一个环境变量就能让理解环节退回「什么都不判断」,而不是当场改代码/重新构建。
 *
 * ★ 诚实标记是 **`source: 'off'`** —— 要区分「真的判成日常」和「根本没判」就看它,
 *   **别只看 `label`**(这里的 `label` 是 `daily` 只是为了给下游一个能跑的合法值)。
 *   曾经还有一个 `confidence: 0` 充当这个标记,已删:它是硬写的常量,不含信息,
 *   而 `source` 一个字段就把话说完了。
 */
import type { SceneAnalysis } from '../../domain/entities/scene.js';
import type { SceneAnalyzer, SceneAnalyzerInput } from '../../domain/ports/scene-analyzer.js';
import { DEFAULT_OCCASION, SCENE_RULES } from '../../../shared/index.js';

export class OffSceneAnalyzer implements SceneAnalyzer {
  readonly name = 'off';

  async analyze(_input: SceneAnalyzerInput): Promise<SceneAnalysis> {
    return {
      label: DEFAULT_OCCASION,
      direction: SCENE_RULES[DEFAULT_OCCASION].direction,
      tags: [], // 没做理解,就没有关键词可说 —— 别拿场合基准 tags 冒充推断结果。
      source: 'off',
    };
  }
}
