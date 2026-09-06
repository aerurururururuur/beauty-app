/**
 * domain/entities/index.ts —— 实体聚合导出,便于端口/上层按需引用。
 */
export type { ImageRef } from './image.js';
export type { SceneAnalysis } from './scene.js';
export type { ReferenceImage } from './reference.js';
export type { Look, ResultText, JobError, MakeupZone } from './look.js';
export type {
  JobStatus,
  PipelineStep,
  JobUpload,
  JobInputMeta,
  JobResult,
  JobRecord,
} from './job.js';
export { PROGRESS_BY_STEP, PIPELINE_STEP_ORDER } from './job.js';
export {
  createQueuedJob,
  startJob,
  advanceTo,
  recordScene,
  recordReferences,
  finishJob,
  failJob,
  displayInputs,
} from './job.js';
