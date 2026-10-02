/**
 * makeup/domain/entities/look.ts —— 妆容的结构化元信息。
 * Look 对调用方而言是不透明数据(引擎私有契约),makeup 模块自持。
 *
 * ⚠️ **今天它没有消费者。** 唯一走出去的路径是 `agent` 的 `render_look`,而那里只取
 * `result.image`,`look` 经 `validateEngineResult` 验一遍形状后**直接丢掉**;
 * `AgentSessionView` 里**没有** `look` 这一格(它只给 `lookSpec?` 与 `lookDescription?`)。
 * 所以三个引擎往里面写什么,今天都不影响用户看到的任何东西。
 *
 * 为什么留着:测试替身会放一份 `zones` / `palette`——那是「本人照片 + CSS 叠加」预览的原料,
 * 而结果页那种预览在 2026-09-29 随 `jobs` 一起没了。**前端设计那一轮要拿回去的话,
 * 得先把 `look` 透出到会话视图**(不是只改这里)。真引擎(`ImageEngine`)本来就不产 `zones`。
 */
import type { MakeupZoneRow, MakeupZoneShape } from '../schemas/index.js';

export type Look = Record<string, unknown>;

/**
 * 妆容叠加区(图片归一化坐标 0..1;骨架约定为正面自拍照片)。⚠️ 同文件头:今天无消费者。
 *
 * ★ 字段不在这里声明 —— 形状是 `../schemas/entities/makeup-zone.ts` 那一份,
 *   口径与 `look-spec.ts` 那四个类一致(理由写在那个文件里,不抄第二遍)。
 *   ⚠️ 那面还有个**只有这里有**的情况:`rgb` 收窄成**只读**元组,
 *   而 schema 给的是可变元组(`readonly T[]` 当不了 `T[]`),所以这一格只能 `Omit` 掉再重声明,
 *   不能像标量那样直接覆盖 —— 同 `face-catalog/face-vocabulary.ts` 的 `toneKeys`。
 */
export class MakeupZone {
  constructor(row: MakeupZoneRow) {
    Object.assign(this, row);
  }
}
export interface MakeupZone extends Omit<MakeupZoneShape, 'rgb'> {
  /** 锚点(相对图片宽高比例)。 */
  readonly anchor: { readonly x: number; readonly y: number };
  /** 尺寸(相对图片宽高比例)。 */
  readonly size: { readonly w: number; readonly h: number };
  /** 叠加色 [r,g,b] 0..255。 */
  readonly rgb: readonly [number, number, number];
}
