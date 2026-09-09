/**
 * modules/recommendations —— 平价同款/搭配推荐模块(public barrel,空壳)。
 */
export type {
  RecommendationItem,
  RecommendationsProvider,
  RecommendInput,
} from './domain/ports/recommender.js';
export { createRecommendationsModule } from './compose.js';
export type { RecommendationsModuleServices } from './compose.js';
