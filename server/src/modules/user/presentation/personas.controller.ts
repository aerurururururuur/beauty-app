/**
 * presentation/personas.controller.ts —— 人设库的请求 → 用例 翻译层,不做业务判断,错误统一抛 AppError;
 * 照片走 JSON body 的 dataURL,**不走 multipart**。路由:`POST|GET /personas`、`PATCH|DELETE /personas/:id`、
 * `GET /personas/:id/photo`、`POST /personas/analyze`(★ 花钱,接上端口才注册)、
 * `POST|DELETE /personas/tones`、`POST|DELETE /personas/features`(后两族 ★ 在用 ⇒ 409)。
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AnalyzePersonaFace } from '../application/usecases/analyze-persona-face.js';
import type { CreateCustomFeature } from '../application/usecases/create-custom-feature.js';
import type { CreatePersona } from '../application/usecases/create-persona.js';
import type { CreateSkinTone } from '../application/usecases/create-skin-tone.js';
import type { ListCustomFeatures } from '../application/usecases/list-custom-features.js';
import type { ListPersonas } from '../application/usecases/list-personas.js';
import type { ListSkinTones } from '../application/usecases/list-skin-tones.js';
import type { ReadPersonaPhoto } from '../application/usecases/read-persona-photo.js';
import type { RemoveCustomFeature } from '../application/usecases/remove-custom-feature.js';
import type { RemovePersona } from '../application/usecases/remove-persona.js';
import type { RemoveSkinTone } from '../application/usecases/remove-skin-tone.js';
import type { UpdatePersona } from '../application/usecases/update-persona.js';
import { validatePersonaId } from '../domain/validators/persona.validator.js';

export interface PersonasDeps {
  listPersonas: ListPersonas;
  createPersona: CreatePersona;
  updatePersona: UpdatePersona;
  removePersona: RemovePersona;
  readPersonaPhoto: ReadPersonaPhoto;
  /** 自建肤色档:列表搭 `GET /personas` 一起回(不另开一条),所以这里有个 list。 */
  listSkinTones: ListSkinTones;
  createSkinTone: CreateSkinTone;
  removeSkinTone: RemoveSkinTone;
  /** 自建特征:同上,列表搭 `GET /personas` 一起回。★ 在建 / 删两条上**在用 ⇒ 409**。 */
  listCustomFeatures: ListCustomFeatures;
  createCustomFeature: CreateCustomFeature;
  removeCustomFeature: RemoveCustomFeature;
  /**
   * ★ 读脸,**可缺省**:缺省时 `POST /personas/analyze` **根本不注册**,列表里 `canAnalyzeFace` 是 `false`。
   * 这一格的存在与否就是"这个部署有没有读脸能力"的**唯一**判据。
   */
  analyzePersonaFace?: AnalyzePersonaFace;
}

export function makePersonasController(deps: PersonasDeps) {
  /** 有读脸用例 = 这个部署有读脸能力。★ 只在这里判一次,别在两处各推一遍。 */
  const analyze = deps.analyzePersonaFace;

  return {
    add: async (request: FastifyRequest, reply: FastifyReply) => {
      // body 缺失/非 JSON 时给空对象,让校验器统一报 VALIDATION_ERROR(而不是框架 400)。
      const created = await deps.createPersona.execute(request.body ?? {});
      return reply.code(201).send(created);
    },

    list: async (request: FastifyRequest) => {
      const query = request.query ?? {};
      // ★ `skinTones` / `customFeatures` 与 `personas` 一起回:这一屏都要,分三次请求只是多两次往返。
      //   三个用例各自独立(各读各的表),所以并行发,别串起来白等。
      const [personas, skinTones, customFeatures] = await Promise.all([
        deps.listPersonas.execute(query),
        deps.listSkinTones.execute(query),
        deps.listCustomFeatures.execute(query),
      ]);
      // ★ `canAnalyzeFace` 由**控制器**补:用例不该知道"这个进程有没有接读脸端口",那是装配的事。
      return { personas, skinTones, customFeatures, canAnalyzeFace: analyze !== undefined };
    },

    addTone: async (request: FastifyRequest, reply: FastifyReply) => {
      const created = await deps.createSkinTone.execute(request.body ?? {});
      return reply.code(201).send(created);
    },

    removeTone: async (request: FastifyRequest, reply: FastifyReply) => {
      const id = validatePersonaId((request.params as { id?: unknown }).id);
      await deps.removeSkinTone.execute(id, request.query ?? {});
      return reply.code(204).send();
    },

    addFeature: async (request: FastifyRequest, reply: FastifyReply) => {
      const created = await deps.createCustomFeature.execute(request.body ?? {});
      return reply.code(201).send(created);
    },

    removeFeature: async (request: FastifyRequest, reply: FastifyReply) => {
      const id = validatePersonaId((request.params as { id?: unknown }).id);
      await deps.removeCustomFeature.execute(id, request.query ?? {});
      return reply.code(204).send();
    },

    update: async (request: FastifyRequest) => {
      const id = validatePersonaId((request.params as { id?: unknown }).id);
      return deps.updatePersona.execute(id, request.body ?? {});
    },

    remove: async (request: FastifyRequest, reply: FastifyReply) => {
      const id = validatePersonaId((request.params as { id?: unknown }).id);
      await deps.removePersona.execute(id, request.query ?? {});
      return reply.code(204).send();
    },

    /**
     * 照片字节。★ 本模块唯一一条走 `<img>` 的口,归属只能靠 `?userId=` 判。
     * ★★ `Cache-Control: private, no-store` **必须的,不是优化**:这条 URL 不带版本号,
     * 任何一层缓存留下它,都会在用户换照片后继续发旧的那张脸。`private` 同时挡住共享缓存。
     */
    photo: async (request: FastifyRequest, reply: FastifyReply) => {
      const id = validatePersonaId((request.params as { id?: unknown }).id);
      const { mime, bytes } = await deps.readPersonaPhoto.execute(id, request.query ?? {});
      return reply
        .header('content-type', mime)
        .header('cache-control', 'private, no-store')
        .send(bytes);
    },

    /**
     * 读脸。★ 只有 `analyzePersonaFace` 存在时这个键才存在(route 据此注册)。
     * ⚠️ **不返回特征、不返回置信度** —— 契约只有一格 `skinTone`。
     */
    ...(analyze
      ? {
          analyze: async (request: FastifyRequest) =>
            analyze.execute(request.body ?? {}),
        }
      : {}),
  };
}
