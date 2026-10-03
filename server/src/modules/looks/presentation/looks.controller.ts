/**
 * presentation/looks.controller.ts —— 「我的妆容档案」的请求 → 用例 翻译层。
 * POST   /looks                    存一版 → 201
 * GET    /looks?userId=            列出自己的档案 → 200
 * DELETE /looks/:id?userId=        删一版 → 204
 * GET    /looks/:id/cover?userId=  取封面字节 → 200(图片)
 *
 * 很薄:把请求体/查询串/路径参数原样交给用例(校验行为在 domain/validator 与用例里),
 * 不做业务判断;错误统一抛 AppError,由 shared 的错误处理器映射成状态码。
 *
 * 归属用查询串传(DELETE 尤其不能指望请求体:不少客户端/代理会把它丢掉)。
 * 其余三条也只有 JSON 标量,不走 multipart;**只有封面那条发字节**。
 *
 * ✏️ 路径登记在 `presentation/routes/looks.route.ts`(同 `cabinet.controller.ts` 的说明)。
 */
import { createReadStream } from 'node:fs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AddLook } from '../application/usecases/add-look.js';
import type { ListLooks } from '../application/usecases/list-looks.js';
import type { ReadLookCover } from '../application/usecases/read-look-cover.js';
import type { RemoveLook } from '../application/usecases/remove-look.js';
import { validateLookId } from '../domain/validators/look.validator.js';

export interface LooksDeps {
  addLook: AddLook;
  listLooks: ListLooks;
  removeLook: RemoveLook;
  readLookCover: ReadLookCover;
}

export function makeLooksController(deps: LooksDeps) {
  return {
    add: async (request: FastifyRequest, reply: FastifyReply) => {
      // body 缺失/非 JSON 时给空对象,让校验器统一报 VALIDATION_ERROR(而不是框架 400)。
      const created = await deps.addLook.execute(request.body ?? {});
      return reply.code(201).send(created);
    },

    list: async (request: FastifyRequest) => {
      return deps.listLooks.execute(request.query ?? {});
    },

    remove: async (request: FastifyRequest, reply: FastifyReply) => {
      const id = validateLookId((request.params as { id?: unknown }).id);
      await deps.removeLook.execute(id, request.query ?? {});
      return reply.code(204).send();
    },

    // ★ **建流在这一层**:用例给的是本机路径 + MIME(见 `ReadLookCover`)。
    // ★★ `cache-control: private, no-store` 是**故意的**:档案能被用户删掉,
    //    缓存里的图不该活得比它久。agent 那条渲染路由没这条 —— 它的图本来就受会话 TTL 管。
    cover: async (request: FastifyRequest, reply: FastifyReply) => {
      const id = validateLookId((request.params as { id?: unknown }).id);
      const image = await deps.readLookCover.execute(id, request.query ?? {});
      return reply
        .type(image.mimeType)
        .header('cache-control', 'private, no-store')
        .send(createReadStream(image.filePath));
    },
  };
}
