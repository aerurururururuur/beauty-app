/**
 * presentation/jobs.controller.ts —— 任务的请求 → 用例 翻译层。
 * POST /jobs(multipart) / GET /jobs/:id / GET /jobs/:id/result
 * 很薄:multipart → zod 校验 → 调用用例;不做业务判断。
 *
 * ✏️ 路径登记在 `presentation/routes/jobs.route.ts`(见 `weather.controller.ts` 那段说明)。
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { GetJob } from '../application/usecases/get-job.js';
import type { GetJobResult } from '../application/usecases/get-job-result.js';
import type { SubmitJob } from '../application/usecases/submit-job.js';
import type { UploadFile } from '../../assets/index.js';
import { validateJobId } from '../domain/validators/job-id.validator.js';
import { validateSubmitJob } from '../domain/validators/job-submit.validator.js';
import { parseJobParts } from './multipart.js';

export interface JobsDeps {
  submitJob: SubmitJob;
  getJob: GetJob;
  getJobResult: GetJobResult;
}

function parseJobId(raw: unknown): string {
  return validateJobId(raw);
}

function toMeta(file: UploadFile): { originalName: string; mimeType: string } {
  return { originalName: file.originalName, mimeType: file.mimeType };
}

function destroyFiles(files: UploadFile[]): void {
  for (const file of files) file.stream.destroy();
}

export function makeJobsController(deps: JobsDeps) {
  return {
    submit: async (request: FastifyRequest, reply: FastifyReply) => {
      const parts = await parseJobParts(request);
      // 形状(image/*、meta JSON、occasion/肤质肤色枚举等)与业务规则
      // (FACE_REQUIRED / CONTEXT_REQUIRED / SCENES_MAX_EXCEEDED…)统一由校验器执行;
      // 失败时先销毁已打开的上传流再抛出,避免句柄泄漏。
      let input;
      try {
        input = validateSubmitJob({
          faces: parts.faceFiles.map(toMeta),
          scenes: parts.sceneFiles.map(toMeta),
          metaRaw: parts.metaRaw,
        });
      } catch (err) {
        destroyFiles([...parts.faceFiles, ...parts.sceneFiles]);
        throw err;
      }
      // 校验器已保证 face 恰好 1 张;把它配回流交给用例落盘。
      const created = await deps.submitJob.execute({
        face: parts.faceFiles[0]!,
        scenes: parts.sceneFiles,
        brief: input.brief,
      });
      return reply.code(202).send(created);
    },

    get: async (request: FastifyRequest) => {
      const id = parseJobId((request.params as { id?: unknown }).id);
      return deps.getJob.execute(id);
    },

    getResult: async (request: FastifyRequest, reply: FastifyReply) => {
      const id = parseJobId((request.params as { id?: unknown }).id);
      const artifact = await deps.getJobResult.execute(id);
      return reply.type(artifact.mimeType).send(artifact.stream);
    },
  };
}
