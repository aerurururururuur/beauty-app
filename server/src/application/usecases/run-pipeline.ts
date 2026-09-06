/**
 * application/usecases/run-pipeline.ts —— 异步 worker 用例(流水线)。
 * 步骤:scene_understand → reference_gather → makeup_generate → store_result,
 * 每完成一步原子地推进 JobRecord(domain 状态机约束),任一步失败则标记 failed。
 * 四个端口全部来自 domain/ports,具体实现由组装根注入。
 */
import { advanceTo, failJob, finishJob, recordReferences, recordScene, startJob } from '../../domain/entities/job.js';
import type { JobResult } from '../../domain/entities/job.js';
import type { ImageRef } from '../../domain/entities/image.js';
import { AppError, ErrorCode } from '../../domain/errors/app-error.js';
import type { Engine, EngineSourceImage } from '../../domain/ports/engine.js';
import type { ArtifactStore } from '../../domain/ports/artifact-store.js';
import type { JobRepository } from '../../domain/ports/job-repository.js';
import type { ReferenceProvider } from '../../domain/ports/reference-provider.js';
import type { SceneAnalyzer } from '../../domain/ports/scene-analyzer.js';
import { buildNarrative } from '../narration.js';

export class RunPipeline {
  constructor(
    private readonly deps: {
      jobs: JobRepository;
      artifactStore: ArtifactStore;
      sceneAnalyzer: SceneAnalyzer;
      referenceProvider: ReferenceProvider;
      engine: Engine;
    },
  ) {}

  async execute(jobId: string): Promise<void> {
    const found = await this.deps.jobs.find(jobId);
    if (!found) {
      console.warn(`[pipeline] 队列中任务不存在:${jobId}`);
      return;
    }
    try {
      // queued → running
      let rec = await this.deps.jobs.update(jobId, (prev) => startJob(prev));

      // 解析输入到本机文件路径(引擎/分析器读图需要)
      const toSource = (ref: ImageRef): Promise<EngineSourceImage> =>
        this.deps.artifactStore
          .resolveToFilePath(jobId, ref)
          .then((filePath) => ({ filePath, mimeType: ref.mimeType, originalName: ref.originalName }));
      const face = await toSource(rec.inputs.face);
      const scenes = await Promise.all(rec.inputs.scenes.map((ref) => toSource(ref)));

      // ① 场景理解
      const scene = await this.deps.sceneAnalyzer.analyze({
        face,
        scenes,
        sceneText: rec.inputs.sceneText,
      });
      rec = await this.deps.jobs.update(jobId, (prev) =>
        recordScene(advanceTo(prev, 'scene_understand'), scene),
      );

      // ② 参考图搜集(带授权来源)
      const references = await this.deps.referenceProvider.fetch(scene);
      rec = await this.deps.jobs.update(jobId, (prev) =>
        recordReferences(advanceTo(prev, 'reference_gather'), references),
      );

      // ③ 上妆引擎
      rec = await this.deps.jobs.update(jobId, (prev) => advanceTo(prev, 'makeup_generate'));
      const generated = await this.deps.engine.generate({
        face,
        scenes,
        sceneText: rec.inputs.sceneText,
        sceneAnalysis: scene,
        references,
      });

      // ④ 收编产物 + 完成
      const stored = await this.deps.artifactStore.putResult(
        jobId,
        generated.resultFilePath,
        generated.mimeType,
      );
      const text = buildNarrative(scene, this.deps.engine.name, generated.look);
      const result: JobResult = {
        engine: this.deps.engine.name,
        resultUrl: stored.url,
        scene,
        look: generated.look,
        references,
        analysis: text.analysis,
        explain: text.explain,
        tips: text.tips,
      };
      await this.deps.jobs.update(jobId, (prev) => finishJob(prev, result));
    } catch (err) {
      const code = err instanceof AppError ? err.code : ErrorCode.INTERNAL_ERROR;
      const message = err instanceof Error ? err.message : '未知错误';
      try {
        await this.deps.jobs.update(jobId, (prev) => failJob(prev, code, message));
      } catch {
        // 极端竞态下记录可能已非 running;保持现状,队列不因此中断。
      }
    }
  }
}
