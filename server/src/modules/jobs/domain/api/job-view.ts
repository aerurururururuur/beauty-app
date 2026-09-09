/**
 * domain/api/job-view.ts —— ★ 对外 API 契约 / DTO 类型。
 * 前后端以此联调;类型唯一真源。presentation 直接返回这些形状,
 * application 只负责把领域对象映射过来(见 application/mapping)。
 * 不引入网络/框架类型,保持纯数据。
 */
import type { MakeupBrief } from '../../../shared/index.js';
import type { SceneAnalysis } from '../../../understanding/index.js';
import type { ReferenceImage } from '../../../references/index.js';
import type { Look, ResultText } from '../../../makeup/index.js';
import type { JobError } from '../entities/error.js';
import type { JobStatus, PipelineStep } from '../entities/job.js';

/** 给用户回显的最小输入(不含内部存储键)。 */
export interface JobInputsView {
  faceName: string;
  sceneNames: string[];
  brief?: MakeupBrief;
}

/** 完成任务的最终结果视图。 */
export interface JobResultView extends ResultText {
  engine: string;
  resultUrl: string; // 形如 /jobs/<id>/result
  scene: SceneAnalysis;
  look: Look;
  references: ReferenceImage[];
}

/** 任务状态视图(GET /jobs/:id 响应体)。 */
export interface JobView {
  id: string;
  status: JobStatus;
  progress: number; // 0..100
  step: PipelineStep;
  error: JobError | null;
  inputs: JobInputsView;
  scene?: SceneAnalysis;
  references?: ReferenceImage[];
  result?: JobResultView;
}

/** 提交任务响应(POST /jobs → 202)。 */
export interface SubmitJobResponse {
  id: string;
  status: JobStatus;
  progress: number;
  step: PipelineStep;
}

/** HTTP 错误响应体。 */
export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
