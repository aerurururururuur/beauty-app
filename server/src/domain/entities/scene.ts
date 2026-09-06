/**
 * domain/entities/scene.ts —— 场景理解产物(值对象)。
 * 把「风景图 + 文字」翻译成一个可上妆的「场景妆容方向」。
 * 本骨架用 mock 关键词匹配实现;未来可替换为视觉大模型。
 */
export interface SceneAnalysis {
  /** 场景语义标签:'beach' | 'snow' | 'red-leaf' | 'city' | 'desert' | 'mountain' | 'unknown' … */
  label: string;
  /** 自然语言妆容方向。 */
  direction: string;
  /** 场景/妆容关键词。 */
  tags: string[];
  /** 置信度 0..1。 */
  confidence: number;
  /** 来源:'mock' | 未来的模型名。 */
  source: string;
}
