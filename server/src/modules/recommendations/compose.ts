/**
 * modules/recommendations/compose.ts —— 组合根(空壳)。
 * provider 为 null:未实现、也未在 src/index.ts 接入。
 */
import type { RecommendationsProvider } from './domain/ports/recommender.js';

export interface RecommendationsModuleServices {
  provider: RecommendationsProvider | null;
}

export function createRecommendationsModule(): RecommendationsModuleServices {
  return { provider: null };
}
