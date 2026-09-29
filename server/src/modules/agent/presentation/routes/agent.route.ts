/**
 * presentation/routes/agent.route.ts —— 对话 agent 的路径登记。
 * 只有「方法 + 路径 → handler」的映射,没有业务判断。
 *
 * ★ **会花钱的路径有两条**(✏️ 读图那一轮起):`…/render` 与 `…/analyses`。
 *   两条为什么都是独立路由、入口怎么合流,写在 `agent.controller.ts` 各自的上方。
 *
 * ★ **最后两条由 `deps.analysis` 是否存在决定注册与否**(`VISION_ANALYZER=off` ⇒ 不注册)。
 *   先例是 `PRODUCTS_DIR` 指空 ≡ 关掉产品库(工具不注册):「关掉」要表现为
 *   **入口不存在**,而不是"注册了但什么都不发生"。
 */
import type { FastifyInstance } from 'fastify';
import { makeAgentController } from '../agent.controller.js';
import type { AgentDeps } from '../agent.controller.js';

export function registerAgentRoutes(app: FastifyInstance, deps: AgentDeps): void {
  const controller = makeAgentController(deps);

  app.post('/agent/sessions', controller.startSession);
  app.get('/agent/sessions/:id', controller.getSession);
  app.post('/agent/sessions/:id/messages', controller.sendMessage);
  app.post('/agent/sessions/:id/photo', controller.attachPhoto);
  app.post('/agent/sessions/:id/render', controller.confirmRender);
  app.get('/agent/sessions/:id/renders/:seq', controller.getRender);

  // ★ `controller.analysis` 既能收窄类型,也保证这一组要么全在、要么全不在。
  const { analysis } = controller;
  if (analysis) {
    app.post('/agent/sessions/:id/images', analysis.attachImage);
    app.post('/agent/sessions/:id/analyses', analysis.analyzeImage);
  }
}
