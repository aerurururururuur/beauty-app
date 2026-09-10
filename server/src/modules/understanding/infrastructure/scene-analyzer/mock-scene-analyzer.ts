/**
 * infrastructure/scene-analyzer/mock-scene-analyzer.ts —— SceneAnalyzer 的 mock 实现。
 *
 * 判定逻辑**不在这里**:它住在 `shared/domain/scene-rules.ts` 的纯函数 `describeScene()`,
 * 因为浏览器 mock 模式(前端 `api/mock.js`)要给出**一模一样**的答案,两边必须同源。
 * 这个类只负责「适配器」该管的事:计时、把形状对齐到本模块的 `SceneAnalysis`。
 *
 * 不读图、不联网。可选风景参考图(scenes)不参与风格判定,留给未来视觉大模型加分项。
 */
import type { SceneAnalysis } from '../../domain/entities/scene.js';
import type { SceneAnalyzer, SceneAnalyzerInput } from '../../domain/ports/scene-analyzer.js';
import { describeScene } from '../../../shared/index.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class MockSceneAnalyzer implements SceneAnalyzer {
  readonly name = 'mock';

  async analyze(input: SceneAnalyzerInput): Promise<SceneAnalysis> {
    await sleep(250); // 模拟一点“理解耗时”,让前端轮询看到进度推进。
    return describeScene(input.brief);
  }
}
