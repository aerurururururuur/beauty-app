/**
 * presentation/routes/agent.route.ts —— 对话 agent 的路径登记。
 * 只有「方法 + 路径 → handler」的映射,没有业务判断。
 *
 * ★ `/agent/sessions/:id/render` 那一行是**全项目唯一会花钱的路径**;
 *   它为什么是独立一条路由、两个入口怎么合流,写在 `agent.controller.ts` 的
 *   `confirmRender` 上方。
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
}
