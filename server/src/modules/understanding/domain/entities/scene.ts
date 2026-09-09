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
  /** 置信度 0..1。 */
  confidence: number;
  /** 来源:'mock' | 未来的模型名。 */
  source: string;
}
