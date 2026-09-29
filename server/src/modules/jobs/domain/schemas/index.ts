/**
 * jobs/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * jobs 没有 `entities/`：`JobRecord` 是 `domain/entities/job.ts` 里手写的领域类型，
 * 不是从 zod 推出来的行。三个文件都属 `api/`（提交入参、`:id` 路径参数、响应 DTO）。
 */
export {
  MAX_SCENES,
  MAX_META_RAW,
  metaSchema,
  jobSubmitSchema,
} from './api/job-submit.js';
export type { UploadFileMeta, JobSubmitRaw, MetaScalar } from './api/job-submit.js';

export { jobIdSchema } from './api/job-id.js';
export type { JobIdScalar } from './api/job-id.js';

export type {
  JobInputsView,
  JobResultView,
  JobView,
  SubmitJobResponse,
  ErrorBody,
} from './api/job-view.js';
