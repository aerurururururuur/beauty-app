/**
 * domain/ports/reference-provider.ts —— 参考图来源端口(可选缝)。
 * 给定场景分析,返回按部位标记、带出处标注的参考图条目。
 * 骨架返回预设(mock);外部检索见 infrastructure/reference-provider/。
 *
 * ★ **实现约定(重要,不是建议)**：`fetch` **不抛错**。
 *   拿不到参考图就返回空数组。
 *
 *   理由在调用方：`jobs/application/usecases/run-pipeline.ts` 是**裸调**本端口、
 *   外面只有流水线的大 try/catch —— 端口一旦抛错,整个上妆任务会被标成 failed,
 *   用户拿不到成品图,**只因为参考图没搜到**。而参考图是增强项:结果页参考区
 *   本来就是 `v-if="references.length"`,空数组是一条能走通的正常状态
 *   (`OffReferenceProvider` 就恒返回空)。
 *
 *   所以限流 / 超时 / 站点改版这类失败,应由实现**内部消化并记日志**,
 *   而不是升级成调用方的错误。
 */
import type { SceneDescriptor } from '../../../shared/index.js';
import type { ReferenceImage } from '../entities/reference.js';

export interface ReferenceProvider {
  readonly name: string;
  /** 按场景取参考图。**失败返回空数组,不抛错**(见文件头)。 */
  fetch(scene: SceneDescriptor): Promise<ReferenceImage[]>;
}
