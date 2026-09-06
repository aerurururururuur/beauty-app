/**
 * application/usecases/submit-job.ts —— 提交任务用例。
 * 职责:领域不变量校验 → 图片落盘(经 ArtifactStore 端口)→ 建 queued 记录 → 入队。
 * 不感知 HTTP/multipart;收到的 UploadFile 已由 presentation 层按 zod schema 校验过。
 */
import { randomUUID } from 'node:crypto';
import { createQueuedJob } from '../../domain/entities/job.js';
import type { JobUpload } from '../../domain/entities/job.js';
import type { ImageRef } from '../../domain/entities/image.js';
import { AppError, ErrorCode } from '../../domain/errors/app-error.js';
import type { SubmitJobResponse } from '../../domain/api/job-view.js';
import { MAX_SCENES } from '../../domain/schemas/job-submit.js';
import type { ArtifactStore, UploadFile } from '../../domain/ports/artifact-store.js';
import type { JobRepository } from '../../domain/ports/job-repository.js';
import type { JobQueue } from '../../domain/ports/job-queue.js';

export interface SubmitJobCommand {
  face: UploadFile;
  scenes: UploadFile[];
  sceneText?: string;
}

export class SubmitJob {
  constructor(
    private readonly deps: {
      artifactStore: ArtifactStore;
      jobs: JobRepository;
      queue: JobQueue;
    },
  ) {}

  async execute(command: SubmitJobCommand): Promise<SubmitJobResponse> {
    // 领域不变量:本人照片一张 + (风景图或文字)至少其一(与 presentation 的 zod 双重保障)。
    if (!command.sceneText?.trim() && command.scenes.length === 0) {
      throw new AppError(ErrorCode.SCENES_REQUIRED, '请至少提供一张风景图或一段场景文字');
    }
    if (command.scenes.length > MAX_SCENES) {
      throw new AppError(ErrorCode.SCENES_MAX_EXCEEDED, `风景图最多 ${MAX_SCENES} 张`);
    }

    const id = randomUUID();
    const face: ImageRef = await this.deps.artifactStore.putInputFile(id, 'face', command.face);
    const scenes: ImageRef[] = [];
    for (const file of command.scenes) {
      scenes.push(await this.deps.artifactStore.putInputFile(id, 'scene', file));
    }

    const upload: JobUpload = {
      face,
      scenes,
      sceneText: command.sceneText?.trim() ? command.sceneText : undefined,
    };
    const record = createQueuedJob(id, upload);

    await this.deps.jobs.create(record);
    this.deps.queue.enqueue(id);

    return { id: record.id, status: record.status, progress: record.progress, step: record.step };
  }
}
