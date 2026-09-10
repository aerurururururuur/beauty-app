/**
 * domain/entities/scene.ts —— 场景理解产物(值对象)。
 * 把「用户需求简报 brief(场合/自由文字)」翻译成一个可上妆的妆容方向。
 * label 作为整条链路(参考图/文案/引擎)的驱动键,现取值对应场合语义:
 * 'interview' | 'date' | 'stage' | 'family' | 'daily' …(来自 domain/entities/brief 的 Occasion)
 * 本骨架用 mock 匹配实现;未来可替换为视觉大模型(读可选风景图)。
 */
export interface SceneAnalysis {
  /** 场景语义标签:场合 label,如 'interview' | 'date' | 'stage' | 'family' | 'daily' … */
  label: string;
  /** 自然语言妆容方向。 */
  direction: string;
  /** 场景/妆容关键词。 */
  tags: string[];
  /**
   * 来源:'mock' | 'off' | 未来的模型名。
   *
   * ★ 这里**曾经**有一个 `confidence: number`(0..1),已经删掉:它由分支硬写死
   *   (点 chip 0.92 / 关键词命中 0.72 / 兜底 0.4 或 0.3),并不是一次测量,而是
   *   「把分支名翻译成小数」——调用方本来就知道用户点没点 chip,所以它连信息都不含。
   *   判不出来时该看的是**这个字段**(`'off'`),别再引入一个恒定的置信度。
   *   真接了视觉模型、分数变成真的了,再把它加回来也不迟。
   */
  source: string;
}
