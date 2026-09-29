/**
 * presentation/users.controller.ts —— 账号的请求 → 用例 翻译层。
 * POST /users(注册 → 201) / POST /users/login(登录 → 200) / GET /users/:id
 *
 * 很薄:把请求体原样交给用例(校验行为在 domain/validator / 用例里),不做业务判断;
 * 错误统一抛 AppError,由 shared 的错误处理器映射成状态码。
 * 账号只收 JSON 标量、没有文件,故不走 multipart。
 *
 * ✏️ 路径登记在 `presentation/routes/users.route.ts`(见 `weather.controller.ts` 那段说明)。
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticateUser } from '../application/usecases/authenticate-user.js';
import type { GetUser } from '../application/usecases/get-user.js';
import type { RegisterUser } from '../application/usecases/register-user.js';
import { validateUserId } from '../domain/validators/user.validator.js';

export interface UsersDeps {
  registerUser: RegisterUser;
  authenticateUser: AuthenticateUser;
  getUser: GetUser;
}

export function makeUsersController(deps: UsersDeps) {
  return {
    register: async (request: FastifyRequest, reply: FastifyReply) => {
      // body 缺失/非 JSON 时给空对象,让校验器统一报 VALIDATION_ERROR(而不是框架 400)。
      const created = await deps.registerUser.execute(request.body ?? {});
      return reply.code(201).send(created);
    },

    authenticate: async (request: FastifyRequest) => {
      return deps.authenticateUser.execute(request.body ?? {});
    },

    get: async (request: FastifyRequest) => {
      const id = validateUserId((request.params as { id?: unknown }).id);
      return deps.getUser.execute(id);
    },
  };
}
