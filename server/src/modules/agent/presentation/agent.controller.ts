/**
 * presentation/agent.controller.ts —— 对话 agent 的请求 → 用例 翻译层。
 * POST /agent/sessions                    开会话 → 201
 * GET  /agent/sessions/:id?userId=        读会话 → 200
 * POST /agent/sessions/:id/messages       发一句话(跑一整轮)→ 200
 * POST /agent/sessions/:id/photo          上传本人照片(multipart,字段 face)→ 200
 * POST /agent/sessions/:id/render         ★ 出图(会花钱)→ 200
 * GET  /agent/sessions/:id/renders/:seq   取一张成品图(?userId=)→ 200(字节)
 * POST /agent/sessions/:id/images         上传参考图(multipart,字段 file + kind)→ 200
 * POST /agent/sessions/:id/analyses       ★ 读图分析(会花钱)→ 200
 *
 * ★ **后两条只在 `VISION_ANALYZER=real` 时存在**(见 `routes/agent.route.ts`)——
 *   `off` 要表现为**入口不存在**,不是"注册了但什么都不发生"。
 *
 * 控制器很薄(同 `cabinet.controller.ts`):校验入参 → 调用用例 → 映成视图。
 * 所有业务判断都在用例与 `agent-loop` 里;错误统一抛 `AppError`,
 * 由 `shared` 的错误处理器映射成状态码。
 *
 * ⚠️ **阶段 2 是"一轮跑完一次性返回"的普通 JSON,不是 SSE。**
 * §7.3 第 6 条要的流式要到阶段 3 才做(那时才有耗时 6.5s 的 `render_look` 值得推流)。
 * 现在就把响应造成事件流形状(见 `AgentTurnView.events`)是为了**让阶段 3 只换传输、
 * 不换契约**——前端到时候把 `events` 从"一次拿到全部"改成"逐条收到"即可。
 *
 * ✏️ 路径登记在 `presentation/routes/agent.route.ts`(见 `weather.controller.ts` 那段说明)。
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { StartSession } from '../application/usecases/start-session.js';
import type { GetSession } from '../application/usecases/get-session.js';
import type { SendMessage } from '../application/usecases/send-message.js';
import type { AttachPhoto } from '../application/usecases/attach-photo.js';
import type { ConfirmRender } from '../application/usecases/confirm-render.js';
import type { GetRender } from '../application/usecases/get-render.js';
import type { AttachImage } from '../application/usecases/attach-image.js';
import type { AnalyzeImage } from '../application/usecases/analyze-image.js';
import {
  toAnalysisResultView,
  toSessionView,
  toTurnView,
} from '../application/agent-view.js';
import type { SessionViewOptions } from '../application/agent-view.js';
import {
  validateAnalysesRequest,
  validateConfirmRender,
  validateImageKindField,
  validateImageUpload,
  validatePhotoUpload,
  validateRenderSeq,
  validateSendMessage,
  validateSessionId,
  validateStartSession,
  validateUserIdField,
  validateUserIdQuery,
} from '../domain/validators/agent-http.validator.js';
import { IMAGE_UPLOAD_FIELDS, PHOTO_UPLOAD_FIELDS, parseUploadRequest } from './multipart.js';

export interface AgentDeps {
  startSession: StartSession;
  getSession: GetSession;
  sendMessage: SendMessage;
  attachPhoto: AttachPhoto;
  confirmRender: ConfirmRender;
  getRender: GetRender;
  /**
   * ★ 读图那两条口。**缺省时整个键不出现** ⇒ 两条路由不注册(`VISION_ANALYZER=off`)。
   *   收图与花钱那两步绑在一起——"只有分析没有收图口"是个说不通的部署。
   */
  analysis?: {
    attachImage: AttachImage;
    analyzeImage: AnalyzeImage;
  };
}

/**
 * 校验上传的文件,**不过就先把流销毁再抛**。
 * ★ 销毁这一步属于 HTTP 层,不属于校验器——校验器只该回答"行不行",
 *   它若顺手关流,今后被别处复用时就会关掉一个不归它管的东西。
 */
function validateOrDestroy<T extends { mimeType: string; stream: { destroy(): void } }>(
  file: T | undefined,
  validate: (file: T | undefined) => T,
): T {
  try {
    return validate(file);
  } catch (err) {
    file?.stream.destroy();
    throw err;
  }
}

export function makeAgentController(deps: AgentDeps) {
  // 每个 handler 都要拼视图,而视图选项是同一份——提出来免得八处各写一遍。
  const analysis = deps.analysis;
  const viewOptions: SessionViewOptions = {
    // ★ 只在真有读图能力时才传:它就是"视图里摆不摆分析那块"的那个开关(见 `agent-view.ts`)。
    ...(analysis ? { hasAnalysis: true } : {}),
  };

  return {
    startSession: async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, brief } = validateStartSession(request.body ?? {});
      const session = await deps.startSession.execute(userId, brief);
      return reply.code(201).send(toSessionView(session, viewOptions));
    },

    // 归属用查询串传(同 cabinet:DELETE/GET 不指望请求体,代理会丢)。
    getSession: async (request: FastifyRequest) => {
      const id = validateSessionId((request.params as { id?: unknown }).id);
      const userId = validateUserIdQuery(request.query);
      return toSessionView(await deps.getSession.execute(id, userId), viewOptions);
    },

    sendMessage: async (request: FastifyRequest) => {
      const id = validateSessionId((request.params as { id?: unknown }).id);
      const body = validateSendMessage(request.body ?? {});
      const result = await deps.sendMessage.execute(id, body.userId, body.text);
      return toTurnView(result.session, result.events, result.stopReason, viewOptions);
    },

    attachPhoto: async (request: FastifyRequest) => {
      const id = validateSessionId((request.params as { id?: unknown }).id);
      const parts = await parseUploadRequest(request, PHOTO_UPLOAD_FIELDS);
      const file = validateOrDestroy(parts.file, validatePhotoUpload);
      const userId = validateUserIdField(parts.scalars.userId);
      // ★ 直传:解析器产出的形状就是端口的 `PhotoUpload`(见 `multipart.ts`)。
      const session = await deps.attachPhoto.execute(id, userId, file);
      return toSessionView(session, viewOptions);
    },

    // ★ 全项目唯一会花钱的入口。**它不读任何出图参数**——要出的就是用户在屏幕上
    //   看到的那一套,而那一套已经在会话里(见 `confirmRenderSchema`)。
    //   ✏️ 花钱的扳机 = **用户点了对话里那条出图消息上的按钮**(那条消息由界面按状态摆,
    //   不是模型说的;模型自己提的那条也接到这同一条路由上)。两个入口的判据在用例里。
    //
    // ★ **出图是独立一步,不是一个工具参数。** 理由见 `definitions.ts` 的 `RENDER_LOOK`:
    //   花钱那个决定必须由**人的一次 HTTP 动作**表达,不能由模型在对话里"替用户点"。
    //   ✏️ 2026-09-16 起这条路径有两个入口(判据在用例里,这里一字未改):
    //     ① 批准模型提的那条请求(状态是"历史里欠着一条 `render_look`");
    //     ② 用户在对话里点那条**界面按状态自己摆**的「确认生成」消息
    //        ——那时没有任何提议欠着,服务端代递一条再跑。
    //   两条都在这一个 handler 上,因为"两份写在一起的东西迟早会只改一份"是同一句话
    //   (见 `agent-http.ts` 的 `confirmRenderSchema`)。
    confirmRender: async (request: FastifyRequest) => {
      const id = validateSessionId((request.params as { id?: unknown }).id);
      const body = validateConfirmRender(request.body ?? {});
      const result = await deps.confirmRender.execute(id, body.userId);
      return toTurnView(result.session, result.events, result.stopReason, viewOptions);
    },

    getRender: async (request: FastifyRequest, reply: FastifyReply) => {
      const id = validateSessionId((request.params as { id?: unknown }).id);
      const params = request.params as { seq?: unknown };
      const seq = validateRenderSeq(params.seq);
      const userId = validateUserIdQuery(request.query);
      const artifact = await deps.getRender.execute(id, userId, seq);
      return reply.type(artifact.mimeType).send(artifact.stream);
    },

    // ★★ 下面两条**只在 `analysis` 在时才有**(`VISION_ANALYZER=real`)。
    //    `off` 时这里根本没有这两个键,路由那边也不会注册它们 —— 见 `routes/agent.route.ts`。
    //    ⚠️ 别为了"形状整齐"给它们一个抛错的兜底实现:那会得到一条**存在但永远失败**的路,
    //       而"关掉"要说的是"这条口不在"(先例:`PRODUCTS_DIR` 指空就不注册产品工具)。
    // ★★ 这一组**只在 `analysis` 在时才有**(`VISION_ANALYZER=real`)。
    //    `off` 时这个键根本不存在,路由那边也不会注册它们 —— 见 `routes/agent.route.ts`。
    //    ⚠️ 别为了"形状整齐"给它们一个抛错的兜底实现:那会得到一条**存在但永远失败**的路,
    //       而"关掉"要说的是"这条口不在"(先例:`PRODUCTS_DIR` 指空就不注册产品工具)。
    ...(analysis
      ? {
          analysis: {
            /** 收一张参考图。★ **这一步免费**,分析在下面那条。 */
            attachImage: async (request: FastifyRequest) => {
              const id = validateSessionId((request.params as { id?: unknown }).id);
              const parts = await parseUploadRequest(request, IMAGE_UPLOAD_FIELDS);
              const file = validateOrDestroy(parts.file, validateImageUpload);
              // ★ `kind` 从表单里来,走与 JSON 那条**同一张闭集表**(`REF_IMAGE_KINDS`)。
              const kind = validateImageKindField(parts.scalars.kind);
              const userId = validateUserIdField(parts.scalars.userId);
              const session = await analysis.attachImage.execute(id, userId, kind, file);
              return toSessionView(session, viewOptions);
            },

            // ★ **这一条会花钱。** 只收「哪一张」(`kind`),不收任何分析参数 ——
            //   同 `confirmRender` 的口径:不让参数绕过服务端的规则(见 `analysesRequestSchema`)。
            analyzeImage: async (request: FastifyRequest) => {
              const id = validateSessionId((request.params as { id?: unknown }).id);
              const body = validateAnalysesRequest(request.body ?? {});
              const outcome = await analysis.analyzeImage.execute(id, body.userId, body.kind);
              return toAnalysisResultView(outcome, viewOptions);
            },
          },
        }
      : {}),
  };
}
