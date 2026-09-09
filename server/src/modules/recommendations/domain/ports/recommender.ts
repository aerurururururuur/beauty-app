/**
 * modules/recommendations —— 空壳模块(端口已声明,骨架未 wire)。
 * 未来基于「场合 × 妆容 × 自有/可授权产品」做平价同款/搭配推荐(roadmap 后续)。
 */
import type { MakeupBrief } from '../../../shared/index.js';

export interface RecommendInput {
  brief: MakeupBrief;
  /** 化妆引擎产出的结构化 look(可空,推荐仅作参考)。 */
  look?: Record<string, unknown>;
}

export interface RecommendationItem {
  id: string;
  name: string;
  note: string;
}

export interface RecommendationsProvider {
  readonly name: string;
  recommend(input: RecommendInput): Promise<RecommendationItem[]>;
}
