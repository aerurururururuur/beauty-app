/**
 * domain/ports/job-queue.ts —— 异步任务队列端口。
 * 引擎可能调用耗时第三方 API,故任务异步执行、客户端轮询。
 * 具体实现(进程内串行 / BullMQ…)属于 infrastructure。
 */
export interface JobQueue {
  /** 把已持久化的任务加入队列,由 worker 调用流水线用例执行。 */
  enqueue(jobId: string): void;
  /** 供测试/优雅停机:等待队列排空。 */
  whenIdle(): Promise<void>;
}
