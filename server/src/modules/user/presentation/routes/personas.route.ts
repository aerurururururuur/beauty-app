/**
 * presentation/routes/personas.route.ts —— 人设库的路径登记,没有业务判断。
 *
 * ★ **读脸那条由 `deps.analyzePersonaFace` 是否存在决定注册与否**(`VISION_ANALYZER=off` ⇒ 不注册):
 * 「关掉」要表现为**入口不存在**,不是"注册了但什么都不发生"。
 * ⚠️ `app.ts` 那行 `...(deps.persona.analyzePersonaFace ? {...} : {})` 漏了就是假开关。
 */
import type { FastifyInstance } from 'fastify';
import { makePersonasController } from '../personas.controller.js';
import type { PersonasDeps } from '../personas.controller.js';
import { MAX_PHOTO_DATAURL } from '../../domain/validators/persona.validator.js';

/**
 * 带照片那几条路由的请求体上限。
 * ★★ **必须比 validator 的 `MAX_PHOTO_DATAURL` 大**:小了先到的是 Fastify 那句英文 413,
 * 而不是我们那句「照片太大了,请换一张小一点的」。取两倍,够装 dataURL 头部与同体其它标量。
 */
const BODY_LIMIT = MAX_PHOTO_DATAURL * 2;

export function registerPersonasRoutes(app: FastifyInstance, deps: PersonasDeps): void {
  const controller = makePersonasController(deps);

  // ⚠️ `/personas/analyze`、`/personas/tones`、`/personas/features` 都是静态段、`/personas/:id` 是参数段,
  //    方法也不同,不存在谁遮住谁。
  app.post('/personas', { bodyLimit: BODY_LIMIT }, controller.add);
  app.get('/personas', controller.list);
  app.patch('/personas/:id', { bodyLimit: BODY_LIMIT }, controller.update);
  app.delete('/personas/:id', controller.remove);
  app.get('/personas/:id/photo', controller.photo);

  // 自建肤色档。★ 没有 `GET /personas/tones` —— 那一列搭 `GET /personas` 一起回(见控制器)。
  app.post('/personas/tones', controller.addTone);
  app.delete('/personas/tones/:id', controller.removeTone);

  // 自建特征。★ 同上没有 `GET`;`DELETE` 这条是三段,与两段的 `/personas/:id` 不冲突。
  app.post('/personas/features', controller.addFeature);
  app.delete('/personas/features/:id', controller.removeFeature);

  // ★ `controller.analyze` 既能收窄类型,也保证"能力在 ⇒ 路由在"是同一步(同 `agent.route.ts`)。
  const { analyze } = controller;
  if (analyze) {
    app.post('/personas/analyze', { bodyLimit: BODY_LIMIT }, analyze);
  }
}
