/**
 * makeup/domain/entities/look.ts —— 妆容的结构化元信息。
 * Look 对调用方而言是不透明数据(引擎私有契约),makeup 模块自持。
 *
 * ⚠️ **今天它没有消费者。** 唯一走出去的路径是 `agent` 的 `render_look`,而那里只取
 * `resultFilePath` / `mimeType`,`look` 经 `validateEngineResult` 验一遍形状后**直接丢掉**;
 * `AgentSessionView` 里**没有** `look` 这一格(它只给 `lookSpec?` 与 `lookDescription?`)。
 * 所以三个引擎往里面写什么,今天都不影响用户看到的任何东西。
 *
 * 为什么留着:`MockEngine` 会放一份 `zones` / `palette`——那是「本人照片 + CSS 叠加」预览的原料,
 * 而结果页那种预览在 2026-09-29 随 `jobs` 一起没了。**前端设计那一轮要拿回去的话,
 * 得先把 `look` 透出到会话视图**(不是只改这里)。真引擎(`ImageEngine`)本来就不产 `zones`。
 */
export type Look = Record<string, unknown>;

/**
 * 妆容叠加区(图片归一化坐标 0..1;骨架约定为正面自拍照片)。⚠️ 同文件头:今天无消费者。
 *
 * ★ 7 个字段走位置参数,照 `face-vocabulary.ts` 的 `SkinToneTier`(6 个字段也是位置参数);
 *   `#sealed` 的用处见 `look-spec.ts` 那段。
 */
export class MakeupZone {
  /** 名义化标记:只声明、不初始化、**不许读**。见 `look-spec.ts` 那段「为什么是类」。 */
  declare private readonly brand: void;

  constructor(
    /** '唇' | '颊' | '眼影' | … */
    readonly role: string,
    /** 锚点(相对图片宽高比例)。 */
    readonly anchor: { readonly x: number; readonly y: number },
    /** 尺寸(相对图片宽高比例)。 */
    readonly size: { readonly w: number; readonly h: number },
    /** 叠加色 [r,g,b] 0..255。 */
    readonly rgb: readonly [number, number, number],
    /** CSS mix-blend-mode。 */
    readonly blend: string,
    /** CSS 模糊像素。 */
    readonly blur: number,
    /** 不透明度 0..1。 */
    readonly opacity: number,
  ) {}
}
