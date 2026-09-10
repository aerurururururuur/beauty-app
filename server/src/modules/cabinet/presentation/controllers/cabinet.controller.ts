/**
 * presentation/controllers/cabinet.controller.ts —— 衣橱 HTTP 路由。
 * POST   /cabinet/items          新增 → 201
 * GET    /cabinet/items?userId=  列表 → 200
 * PATCH  /cabinet/items/:id      修改 → 200
 * DELETE /cabinet/items/:id?userId=  删除 → 204
 *
 * 控制器很薄:把请求体/查询串/路径参数原样交给用例(校验行为在 domain/validator 与用例里),
 * 不做业务判断;错误统一抛 AppError,由 shared 的错误处理器映射成状态码。
 * 只有 JSON 标量与小数组,没有文件,故不走 multipart。
 *
 * 归属用查询串传(DELETE 尤其不能指望请求体:不少客户端/代理会把它丢掉)。
 */
import type { FastifyInstance } from 'fastify';
import type { AddCosmetic } from '../../application/usecases/add-cosmetic.js';
import type { ListCosmetics } from '../../application/usecases/list-cosmetics.js';
import type { RemoveCosmetic } from '../../application/usecases/remove-cosmetic.js';
import type { UpdateCosmetic } from '../../application/usecases/update-cosmetic.js';
import { validateItemId } from '../../domain/validators/cosmetic-item.validator.js';

export interface CabinetDeps {
  addCosmetic: AddCosmetic;
  listCosmetics: ListCosmetics;
  updateCosmetic: UpdateCosmetic;
  removeCosmetic: RemoveCosmetic;
}

export function registerCabinetRoutes(app: FastifyInstance, deps: CabinetDeps): void {
  app.post('/cabinet/items', async (request, reply) => {
    // body 缺失/非 JSON 时给空对象,让校验器统一报 VALIDATION_ERROR(而不是框架 400)。
    const created = await deps.addCosmetic.execute(request.body ?? {});
    return reply.code(201).send(created);
  });

  app.get('/cabinet/items', async (request) => {
    return deps.listCosmetics.execute(request.query ?? {});
  });

  app.patch('/cabinet/items/:id', async (request) => {
    const id = validateItemId((request.params as { id?: unknown }).id);
    return deps.updateCosmetic.execute(id, request.body ?? {});
  });

  app.delete('/cabinet/items/:id', async (request, reply) => {
    const id = validateItemId((request.params as { id?: unknown }).id);
    await deps.removeCosmetic.execute(id, request.query ?? {});
    return reply.code(204).send();
  });
}
