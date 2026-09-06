/**
 * presentation/controllers/jobs.controller.ts —— 任务 HTTP 路由。
 * POST /jobs(multipart) / GET /jobs/:id / GET /jobs/:id/result
 * 控制器很薄:multipart → zod 校验 → 调用用例;不做业务判断。
 */
import type { FastifyInstance } from 'fastify';
import type { GetJob } from '../../application/usecases/get-job.js';
import type { GetJobResult } from '../../application/usecases/get-job-result.js';
import type { SubmitJob } from '../../application/usecases/submit-job.js';
import { AppError, ErrorCode } from '../../domain/errors/app-error.js';
import { jobIdSchema } from '../../domain/schemas/job-id.js';
import { jobSubmitSchema, zodIssuesMessage } from '../../domain/schemas/job-submit.js';
import type { UploadFile } from '../../domain/ports/artifact-store.js';
import { parseJobParts } from '../multipart.js';

export interface JobsDeps {
  submitJob: SubmitJob;
  getJob: GetJob;
  getJobResult: GetJobResult;
}

function parseJobId(raw: unknown): string {
  const parsed = jobIdSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error));
  return parsed.data;
}

function toMeta(file: UploadFile): { originalName: string; mimeType: string } {
  return { originalName: file.originalName, mimeType: file.mimeType };
}

function destroyFiles(files: UploadFile[]): void {
  for (const file of files) file.stream.destroy();
}

export function registerJobsRoutes(app: FastifyInstance, deps: JobsDeps): void {
  app.post('/jobs', async (request, reply) => {
    const parts = await parseJobParts(request);
    const schemaResult = jobSubmitSchema.safeParse({
      faces: parts.faceFiles.map(toMeta),
      scenes: parts.sceneFiles.map(toMeta),
      sceneText: parts.sceneText,
    });
    if (!schemaResult.success) {
      destroyFiles([...parts.faceFiles, ...parts.sceneFiles]);
      throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(schemaResult.error), {
        issues: schemaResult.error.issues,
      });
    }
    // schema 已保证 face 恰好 1 张;把它配回流交给用例落盘。
    const input = schemaResult.data;
    const created = await deps.submitJob.execute({
      face: parts.faceFiles[0]!,
      scenes: parts.sceneFiles,
      sceneText: input.sceneText,
    });
    return reply.code(202).send(created);
  });

  app.get('/jobs/:id', async (request) => {
    const id = parseJobId((request.params as { id?: unknown }).id);
    return deps.getJob.execute(id);
  });

  app.get('/jobs/:id/result', async (request, reply) => {
    const id = parseJobId((request.params as { id?: unknown }).id);
    const artifact = await deps.getJobResult.execute(id);
    return reply.type(artifact.mimeType).send(artifact.stream);
  });
}
