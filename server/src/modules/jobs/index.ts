/**
 * modules/jobs —— 任务模块(public barrel)。
 * Job 生命周期 + 异步流水线编排。是骨架的「编排者」:依赖 shared / assets /
 * references / makeup 的公开端口与工具;依赖方向保持单向、无环。
 */

// ---- 领域实体 / 状态机(纯函数,供用例与测试复用) ----
export type {
  JobInputMeta,
  JobRecord,
  JobResult,
  JobStatus,
  JobUpload,
  PipelineStep,
} from './domain/entities/job.js';
export {
  PROGRESS_BY_STEP,
  PIPELINE_STEP_ORDER,
  advanceTo,
  createQueuedJob,
  displayInputs,
  failJob,
  finishJob,
  recordReferences,
  recordScene,
  startJob,
} from './domain/entities/job.js';
export type { JobError } from './domain/entities/error.js';

// ---- schemas(形状/契约,无行为)----
export {
  MAX_DRESS,
  MAX_META_RAW,
  MAX_SCENES,
  MAX_SCENE_TEXT,
  jobSubmitSchema,
  metaSchema,
} from './domain/schemas/job-submit.js';
export type { JobSubmitRaw, MetaScalar, UploadFileMeta } from './domain/schemas/job-submit.js';
export { jobIdSchema } from './domain/schemas/job-id.js';
export type { JobIdScalar } from './domain/schemas/job-id.js';

// ---- validators(校验行为,语义错误码)----
export { validateJobId } from './domain/validators/job-id.validator.js';
export { validateSubmitJob } from './domain/validators/job-submit.validator.js';
// ★ 这里原先还导出一份 `zodIssuesMessage`（本模块自己那份 `validate.ts`）。
//   2026-09-16 四份副本上提 `shared` 之后，本模块**不再持有**这个函数，
//   这条转发就只剩"同一个符号的第二条路"——**没有任何消费者**（实现里直接从 shared 引）。
//   所以删掉，不留在 barrel 上冒充本模块的能力。

// ---- 对外 API 契约 / DTO ----
export type {
  ErrorBody,
  JobInputsView,
  JobResultView,
  JobView,
  SubmitJobResponse,
} from './domain/api/job-view.js';

// ---- ports(本模块持契约;实现见 infrastructure)----
export type { JobRepository } from './domain/ports/job-repository.js';
export type { JobQueue } from './domain/ports/job-queue.js';

// ---- 用例 / 编排 ----
export { GetJob } from './application/usecases/get-job.js';
export { GetJobResult } from './application/usecases/get-job-result.js';
export { RunPipeline } from './application/usecases/run-pipeline.js';
export { SubmitJob } from './application/usecases/submit-job.js';
export type { SubmitJobCommand } from './application/usecases/submit-job.js';

// ---- presentation(HTTP 路由挂载)----
export { registerJobsRoutes } from './presentation/controllers/jobs.controller.js';
export type { JobsDeps } from './presentation/controllers/jobs.controller.js';

// ---- 组合根 ----
export { createJobsModule } from './compose.js';
export type { JobsModuleOptions, JobsModuleServices } from './compose.js';
