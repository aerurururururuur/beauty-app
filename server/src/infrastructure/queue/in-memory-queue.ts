/**
 * infrastructure/queue/in-memory-queue.ts —— JobQueue 的进程内串行实现。
 * enqueue 把任务接到 promise 链上串行执行;onJob(组装根注入 RunPipeline)。
 * 注意:这是骨架实现,进程重启即丢失队列;未来可换 BullMQ/其它。
 */
import type { JobQueue } from '../../domain/ports/job-queue.js';

export class InMemoryJobQueue implements JobQueue {
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly onJob: (jobId: string) => Promise<void>) {}

  enqueue(jobId: string): void {
    this.chain = this.chain
      .then(() => this.onJob(jobId))
      .catch((err: unknown) => {
        console.error(`[queue] 处理任务 ${jobId} 失败:`, err);
      });
  }

  whenIdle(): Promise<void> {
    return this.chain;
  }
}
