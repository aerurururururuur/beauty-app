/**
 * domain/entities/job.ts —— Job 聚合的核心领域逻辑:状态机、流水线步骤、进度。
 * 全部为纯函数/纯数据,无 IO、无框架。仓库端口只负责持久化这里产生的记录。
 */
import type { ImageRef } from './image.js';
import type { ReferenceImage } from './reference.js';
import type { SceneAnalysis } from './scene.js';
import type { JobError, Look, ResultText } from './look.js';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export type PipelineStep =
  | 'queued'
  | 'scene_understand'
  | 'reference_gather'
  | 'makeup_generate'
  | 'store_result';

/** 任务输入(含持久化所需的存储引用)。 */
export interface JobUpload {
  face: ImageRef;
  scenes: ImageRef[];
  /** 自由文字场景描述(与 scenes 至少其一)。 */
  sceneText?: string;
}

/** 给用户回显的最小输入描述(不暴露内部存储键)。 */
export interface JobInputMeta {
  faceName: string;
  sceneNames: string[];
  sceneText?: string;
}

/** 完成任务时返回给客户端的最终结果。 */
export interface JobResult extends ResultText {
  /** 产出该结果的上妆引擎名。 */
  engine: string;
  /** 下载地址,形如 /jobs/<id>/result。 */
  resultUrl: string;
  scene: SceneAnalysis;
  look: Look;
  references: ReferenceImage[];
}

/** 每完成一步对应的进度值。 */
export const PROGRESS_BY_STEP: Readonly<Record<PipelineStep, number>> = {
  queued: 0,
  scene_understand: 20,
  reference_gather: 40,
  makeup_generate: 70,
  store_result: 100,
};

/** 流水线的合法步骤顺序(进度随步骤单调递增)。 */
export const PIPELINE_STEP_ORDER: readonly PipelineStep[] = [
  'queued',
  'scene_understand',
  'reference_gather',
  'makeup_generate',
  'store_result',
];

export interface JobRecord {
  id: string;
  status: JobStatus;
  progress: number; // 0..100
  step: PipelineStep;
  error: JobError | null;
  inputs: JobUpload;
  createdAt: string; // ISO
  startedAt?: string;
  completedAt?: string;
  /** 阶段 1(scene_understand)的产物,也回显进 result。 */
  scene?: SceneAnalysis;
  /** 阶段 2(reference_gather)的产物,供轮询/引擎使用。 */
  references?: ReferenceImage[];
  result?: JobResult;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 给用户回显的最小输入描述。 */
export function displayInputs(upload: JobUpload): JobInputMeta {
  return {
    faceName: upload.face.originalName ?? upload.face.storeKey,
    sceneNames: upload.scenes.map((s) => s.originalName ?? s.storeKey),
    ...(upload.sceneText && upload.sceneText.trim() ? { sceneText: upload.sceneText } : {}),
  };
}

export function createQueuedJob(id: string, inputs: JobUpload): JobRecord {
  return {
    id,
    status: 'queued',
    progress: PROGRESS_BY_STEP.queued,
    step: 'queued',
    error: null,
    inputs,
    createdAt: nowIso(),
  };
}

/** queued → running,记录开始时间。 */
export function startJob(rec: JobRecord): JobRecord {
  assertCan(rec, 'running');
  return { ...rec, status: 'running', startedAt: nowIso() };
}

/** running 中前进到下一步骤(步骤顺序由 PIPELINE_STEP_ORDER 约束)。 */
export function advanceTo(rec: JobRecord, step: PipelineStep): JobRecord {
  if (rec.status !== 'running') {
    throw new Error(`job ${rec.id} 不在 running 状态,不能推进到 ${step}`);
  }
  const cur = PIPELINE_STEP_ORDER.indexOf(rec.step);
  const next = PIPELINE_STEP_ORDER.indexOf(step);
  if (cur < 0 || next < 0 || next < cur) {
    throw new Error(`job ${rec.id} 非法步骤迁移:${rec.step} -> ${step}`);
  }
  return { ...rec, step, progress: PROGRESS_BY_STEP[step] };
}

/** 挂上阶段 1 的场景分析产物。 */
export function recordScene(rec: JobRecord, scene: SceneAnalysis): JobRecord {
  assertRunning(rec, '记录场景');
  return { ...rec, scene };
}

/** 挂上阶段 2 的参考图产物。 */
export function recordReferences(rec: JobRecord, references: ReferenceImage[]): JobRecord {
  assertRunning(rec, '记录参考图');
  return { ...rec, references };
}

/** running → done(step 归位 store_result / 进度 100)。 */
export function finishJob(rec: JobRecord, result: JobResult): JobRecord {
  assertCan(rec, 'done');
  return {
    ...rec,
    status: 'done',
    step: 'store_result',
    progress: PROGRESS_BY_STEP.store_result,
    completedAt: nowIso(),
    error: null,
    references: result.references,
    result,
  };
}

/** running → failed。step 保留为失败当时所在步骤(调用方可指定)。 */
export function failJob(rec: JobRecord, code: string, message: string, step?: PipelineStep): JobRecord {
  assertCan(rec, 'failed');
  return {
    ...rec,
    status: 'failed',
    step: step ?? rec.step,
    error: { code, message },
    completedAt: nowIso(),
  };
}

function assertRunning(rec: JobRecord, action: string): void {
  if (rec.status !== 'running') {
    throw new Error(`job ${rec.id} 不在 running 状态,不能${action}`);
  }
}

function assertCan(rec: JobRecord, to: JobStatus): void {
  if (rec.status === 'done' || rec.status === 'failed') {
    throw new Error(`job ${rec.id} 已终止(${rec.status}),不能再迁移到 ${to}`);
  }
  if (to === 'done' || to === 'failed') {
    if (rec.status !== 'running') {
      throw new Error(`job ${rec.id} 须在 running 状态才能迁移到 ${to},当前 ${rec.status}`);
    }
    return;
  }
  if (to === 'running' && rec.status !== 'queued') {
    throw new Error(`job ${rec.id} 只能从 queued 迁移到 running,当前 ${rec.status}`);
  }
}
