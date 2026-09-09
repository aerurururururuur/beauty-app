/**
 * application/usecases/submit-job.ts —— 提交任务用例。
 * 职责:入参校验行为(domain/validator)→ 图片落盘(经 ArtifactStore 端口)→ 建 queued 记录 → 入队。
 * 不感知 HTTP/multipart;收到的 UploadFile 已由 presentation 层校验过,
 * 这里再次调用同一校验器作为领域边界双保险。
 */
import { randomUUID } from 'node:crypto';
import { createQueuedJob } from '../../domain/entities/job.js';
import type { JobUpload } from '../../domain/entities/job.js';
import type { MakeupBrief } from '../../domain/entities/brief.js';
import type { ImageRef } from '../../domain/entities/image.js';
import type { SubmitJobResponse } from '../../domain/api/job-view.js';
import { validateSubmitJob } from '../../domain/validator/job-submit.validator.js';
import type { ArtifactStore, UploadFile } from '../../domain/ports/artifact-store.js';
import type { JobRepository } from '../../domain/ports/job-repository.js';
import type { JobQueue } from '../../domain/ports/job-queue.js';

export interface SubmitJobCommand {
  face: UploadFile;
  scenes: UploadFile[];
  brief: MakeupBrief;
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
    // 领域不变量(face 单张、occasion/文字至少其一、scene 数量上限等)收敛在 domain/validator 一处。
    const input = validateSubmitJob({
      faces: [{ originalName: command.face.originalName, mimeType: command.face.mimeType }],
      scenes: command.scenes.map((f) => ({ originalName: f.originalName, mimeType: f.mimeType })),
      metaRaw: JSON.stringify(command.brief ?? {}),
    });

    const id = randomUUID();
    const face: ImageRef = await this.deps.artifactStore.putInputFile(id, 'face', command.face);
    const scenes: ImageRef[] = [];
    for (const file of command.scenes) {
      scenes.push(await this.deps.artifactStore.putInputFile(id, 'scene', file));
    }

    const upload: JobUpload = {
      face,
      scenes,
      brief: input.brief,
    };
    const record = createQueuedJob(id, upload);

    await this.deps.jobs.create(record);
    this.deps.queue.enqueue(id);

    return { id: record.id, status: record.status, progress: record.progress, step: record.step };
  }
}
