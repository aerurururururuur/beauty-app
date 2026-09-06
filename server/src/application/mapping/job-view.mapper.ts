/**
 * application/mapping/job-view.mapper.ts —— 领域 JobRecord → 对外 JobView。
 * 只做纯投影(剥掉内部存储引用),不含任何 IO。
 */
import { displayInputs } from '../../domain/entities/job.js';
import type { JobRecord } from '../../domain/entities/job.js';
import type { JobView } from '../../domain/api/job-view.js';

export function toJobView(rec: JobRecord): JobView {
  return {
    id: rec.id,
    status: rec.status,
    progress: rec.progress,
    step: rec.step,
    error: rec.error,
    inputs: displayInputs(rec.inputs),
    scene: rec.scene,
    references: rec.references,
    result: rec.result,
  };
}
