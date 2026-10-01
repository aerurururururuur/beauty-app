/**
 * presentation/users.controller.ts —— 账号的请求 → 用例 翻译层。
 * POST /users(注册 → 201) / POST /users/login(登录 → 200) / GET /users/:id /
 * PATCH /users/:id(改资料:简介 + 头像)/ GET /users/:id/avatar(取头像字节)
 *
 * 很薄:把请求体原样交给用例(校验行为在 domain/validator / 用例里),不做业务判断;
 * 错误统一抛 AppError,由 shared 的错误处理器映射成状态码。
 * 账号走 JSON 标量 + dataURL,**不走 multipart**(同人设照片那条的理由)。
 *
 * ⚠️ `PATCH /users/:id` **不是访问控制**:本服务不签发凭证,拿到 id 的人就能改那个账号的资料。
 * 这与本模块其它路由同级(真正把关的东西现在不存在),别把它当成安全边界。
 *
 * ✏️ 路径登记在 `presentation/routes/users.route.ts`(见 `weather.controller.ts` 那段说明)。
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticateUser } from '../application/usecases/authenticate-user.js';
import type { GetUser } from '../application/usecases/get-user.js';
import type { ReadUserAvatar } from '../application/usecases/read-user-avatar.js';
import type { RegisterUser } from '../application/usecases/register-user.js';
import type { UpdateProfile } from '../application/usecases/update-profile.js';
import { validateUserId } from '../domain/validators/user.validator.js';

export interface UsersDeps {
  registerUser: RegisterUser;
  authenticateUser: AuthenticateUser;
  getUser: GetUser;
  updateProfile: UpdateProfile;
  readUserAvatar: ReadUserAvatar;
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

    /** 改资料。★ 归属不靠查询串:`:id` 就是账号自己(见文件头那条 ⚠️)。 */
    update: async (request: FastifyRequest) => {
      const id = validateUserId((request.params as { id?: unknown }).id);
      return deps.updateProfile.execute(id, request.body ?? {});
    },

    /**
     * 头像字节。★ 本模块第二条走 `<img>` 而不是 axios 的口,两条响应头理由同 `personas.controller.ts`:
     * `Cache-Control: private, no-store` **是必须的,不是优化** —— 这条 URL 不带版本号,
     * 任何一层缓存留下它,都会在用户换头像后继续发旧的那张。`private` 同时挡住共享缓存。
     */
    avatar: async (request: FastifyRequest, reply: FastifyReply) => {
      const id = validateUserId((request.params as { id?: unknown }).id);
      const { mime, bytes } = await deps.readUserAvatar.execute(id);
      return reply
        .header('content-type', mime)
        .header('cache-control', 'private, no-store')
        .send(bytes);
    },
  };
}
