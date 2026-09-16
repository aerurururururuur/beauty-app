/**
 * presentation/controllers/agent.controller.ts —— 对话 agent 的 HTTP 路由。
 * POST /agent/sessions                    开会话 → 201
 * GET  /agent/sessions/:id?userId=        读会话 → 200
 * POST /agent/sessions/:id/messages       发一句话(跑一整轮)→ 200
 * POST /agent/sessions/:id/photo          上传本人照片(multipart,字段 face)→ 200
 * POST /agent/sessions/:id/render         ★ 确认出图(会花钱)→ 200
 * GET  /agent/sessions/:id/renders/:seq   取一张成品图(?userId=)→ 200(字节)
 *
 * 控制器很薄(同 `cabinet.controller.ts`):校验入参 → 调用用例 → 映成视图。
 * 所有业务判断都在用例与 `agent-loop` 里;错误统一抛 `AppError`,
 * 由 `shared` 的错误处理器映射成状态码。
 *
 * ★ **确认出图是独立一条路由,不是一个工具参数。** 理由见 `definitions.ts` 的
 *   `RENDER_LOOK`:花钱那个决定必须由**人的一次 HTTP 动作**表达,
 *   不能由模型在对话里"替用户点"。所以本文件里 `confirmRender` 那条
 *   **是全项目唯一会让引擎花钱的入口**——前端把确认框接到它上面。
 *
 * ⚠️ **阶段 2 是"一轮跑完一次性返回"的普通 JSON,不是 SSE。**
 * §7.3 第 6 条要的流式要到阶段 3 才做(那时才有耗时 6.5s 的 `render_look` 值得推流)。
 * 现在就把响应造成事件流形状(见 `AgentTurnView.events`)是为了**让阶段 3 只换传输、
 * 不换契约**——前端到时候把 `events` 从"一次拿到全部"改成"逐条收到"即可。
 */
import type { FastifyInstance } from 'fastify';
import type { StartSession } from '../../application/usecases/start-session.js';
import type { GetSession } from '../../application/usecases/get-session.js';
import type { SendMessage } from '../../application/usecases/send-message.js';
import type { AttachPhoto } from '../../application/usecases/attach-photo.js';
import type { ConfirmRender } from '../../application/usecases/confirm-render.js';
import type { GetRender } from '../../application/usecases/get-render.js';
import { toSessionView, toTurnView } from '../../application/mapping/turn-view.mapper.js';
import {
  validateConfirmRender,
  validatePhotoUpload,
  validateRenderSeq,
  validateSendMessage,
  validateSessionId,
  validateStartSession,
  validateUserIdField,
  validateUserIdQuery,
} from '../../domain/validators/agent-http.validator.js';
import { parsePhotoRequest } from '../multipart.js';

export interface AgentDeps {
  startSession: StartSession;
  getSession: GetSession;
  sendMessage: SendMessage;
  attachPhoto: AttachPhoto;
  confirmRender: ConfirmRender;
  getRender: GetRender;
  /**
   * §10 `[I3]` 的出图上限。★ 视图要它,因为确认框那句话里报"还剩几张"
   * (与工具用的是**同一个** `renderConfirmationSummary`,不在这里重拼一遍)。
   */
  maxRenders: number;
}

/**
 * 校验上传的文件,**不过就先把流销毁再抛**(同 `jobs.controller.ts` 的 `destroyFiles`)。
 * ★ 销毁这一步属于 HTTP 层,不属于校验器——校验器只该回答"行不行",
 *   它若顺手关流,今后被别处复用时就会关掉一个不归它管的东西。
 */
function validateOrDestroy<T extends { mimeType: string; stream: { destroy(): void } }>(
  file: T | undefined,
): T {
  try {
    return validatePhotoUpload(file);
  } catch (err) {
    file?.stream.destroy();
    throw err;
  }
}

export function registerAgentRoutes(app: FastifyInstance, deps: AgentDeps): void {
  // 每个 handler 都要拼视图,而视图选项只有一个值——提出来免得六处各写一遍。
  const viewOptions = { maxRenders: deps.maxRenders };

  app.post('/agent/sessions', async (request, reply) => {
    const { userId } = validateStartSession(request.body ?? {});
    const session = await deps.startSession.execute(userId);
    return reply.code(201).send(toSessionView(session, viewOptions));
  });

  // 归属用查询串传(同 cabinet:DELETE/GET 不指望请求体,代理会丢)。
  app.get('/agent/sessions/:id', async (request) => {
    const id = validateSessionId((request.params as { id?: unknown }).id);
    const userId = validateUserIdQuery(request.query);
    return toSessionView(await deps.getSession.execute(id, userId), viewOptions);
  });

  app.post('/agent/sessions/:id/messages', async (request) => {
    const id = validateSessionId((request.params as { id?: unknown }).id);
    const body = validateSendMessage(request.body ?? {});
    const result = await deps.sendMessage.execute(id, body.userId, body.text);
    return toTurnView(result.session, result.events, result.stopReason, viewOptions);
  });

  app.post('/agent/sessions/:id/photo', async (request) => {
    const id = validateSessionId((request.params as { id?: unknown }).id);
    const parts = await parsePhotoRequest(request);
    const file = validateOrDestroy(parts.file);
    const userId = validateUserIdField(parts.userId);
    // ★ 直传:解析器产出的形状就是端口的 `PhotoUpload`(见 `multipart.ts`)。
    const session = await deps.attachPhoto.execute(id, userId, file);
    return toSessionView(session, viewOptions);
  });

  // ★ 全项目唯一会花钱的入口。**它不读任何出图参数**——要出的就是用户在屏幕上
  //   看到的那一套,而那一套已经在会话里(见 `confirmRenderSchema`)。
  app.post('/agent/sessions/:id/render', async (request) => {
    const id = validateSessionId((request.params as { id?: unknown }).id);
    const body = validateConfirmRender(request.body ?? {});
    const result = await deps.confirmRender.execute(id, body.userId);
    return toTurnView(result.session, result.events, result.stopReason, viewOptions);
  });

  app.get('/agent/sessions/:id/renders/:seq', async (request, reply) => {
    const id = validateSessionId((request.params as { id?: unknown }).id);
    const params = request.params as { seq?: unknown };
    const seq = validateRenderSeq(params.seq);
    const userId = validateUserIdQuery(request.query);
    const artifact = await deps.getRender.execute(id, userId, seq);
    return reply.type(artifact.mimeType).send(artifact.stream);
  });
}
