/**
 * domain/entities/reference.ts —— 参考图条目(值对象)。
 * 由 reference-provider 产出。
 *
 * ★ 2026-09-11 形状变更(改走外部检索)：**删掉了 `license`**。
 *   该字段原先要求逐张标注授权来源，而外部检索来的图**没有授权可标**——
 *   与其填一句「自绘演示素材」之类的假话(那比不填更糟)，不如去掉这个字段。
 *
 *   **代价必须认**：`sourceUrl` 于是成了本实体上**仅存的出处线索**。所以它**不许留空**。
 *   留空 = 这份数据再也没有任何办法回溯每张图是从哪来的。
 */

/**
 * 参考图的部位标签。
 *
 * ★ 刻意与 `makeup` 的 `MakeupZone.role`(`'唇' | '颊' | '眼影'`)对齐命名 ——
 *   「按部位找参考」与「按部位上妆」说的应当是同一套词。
 *   依赖方向不允许这里 import makeup(makeup 反过来依赖 references 的 `ReferenceImage`)，
 *   所以这是**同形声明**而非复用：改一边要想到另一边。
 *
 * `底妆` / `眉` 目前**没有**对应的 `MakeupZone`——mock 引擎只叠 唇/颊/眼影 三处。
 * 保留它们是因为「找参考」按妆容分区本身是有意义的；缺 zone 是引擎那边的欠账，不是这里的。
 *
 * ⚠️ **role 的来源是「哪个查询词搜出来的」，不是分析了图片内容。**
 *    本项目还没有视觉模型，无法真的「看出这张图在画唇」。别把这个字段读成 AI 的识别结论。
 */
export const REFERENCE_ROLES = ['底妆', '眉', '眼影', '颊', '唇'] as const;
export type ReferenceRole = (typeof REFERENCE_ROLES)[number];

export interface ReferenceImage {
  id: string;
  /** 展示标题。优先用来源页标题，取不到才回落到「<场合><部位>参考」。 */
  title: string;
  /**
   * 图片地址。
   * ⚠️ 目前是**第三方热链**(直接指回原站点)，未下载到本地 —— 见 README「已知代价」。
   */
  imageUrl: string;
  /**
   * 来源页 URL(图片被检索到时所在的那个页面，不是图片本身)。
   * ★ `license` 删除后这是仅存的出处线索，**providers 必须填真实来源，不许留空**。
   */
  sourceUrl: string;
  /** 部位标签。取值由「哪个查询词搜出来的」决定，见 `REFERENCE_ROLES` 的说明。 */
  role: ReferenceRole;
  /** 抓取时刻(ISO 8601)。检索结果会失效，留个时间戳便于判断新旧。 */
  retrievedAt: string;
}
