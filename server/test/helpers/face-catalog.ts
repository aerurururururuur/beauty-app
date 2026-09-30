/**
 * test/helpers/face-catalog.ts —— 测试要用的**仓库里那份真词表**。
 *
 * 为什么集中在这里:现在有四个测试文件要拿它 ——
 * `face-catalog` 自己(合规)、`agent-tools`(收窄)、`mock-engine`(缺省档)、
 * `run-pipeline`(文案里那个肤色中文名)。各拼一遍路径的话,路径写错会**同时**
 * 让四处以同一种方式红,那时候很难一眼看出错的是路径。
 *
 * ⚠️ **这不是"假端口",别把它塞进 `fakes.ts`。** 那个文件装的是内存替身;
 *   这里加载的是**进 git 的、线上真正会读的那份内容**。拿一份假词表去测收窄,
 *   测到的只是"假表自己和自己一致"——真词表被改瘸了,那边照样绿。
 */
import path from 'node:path';
import { loadFaceVocabulary } from '../../src/modules/face-catalog/index.js';
import type { FaceVocabulary } from '../../src/modules/face-catalog/index.js';
import type { FeatureStrategies } from '../../src/modules/agent/index.js';
import type { SkinTonePalette } from '../../src/modules/makeup/index.js';

/** 仓库根。本文件在 `server/test/helpers/`,上溯三层到 `olyhks/`。 */
export const REPO_ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** ★ 目录名是 `assests`(仓库里就是这个拼法),不要"顺手改正"。 */
export const REAL_CATALOG_DIR = path.join(REPO_ROOT, 'assests', 'face-catalog');

export function realVocabulary(): FaceVocabulary {
  return loadFaceVocabulary(REAL_CATALOG_DIR);
}

/**
 * 组装根那道缝(照 `src/index.ts` 的 `palette`)在测试里的版本。
 * 生产里由 `src/index.ts` 从 `FaceVocabulary` 显式挑字段搭出来,这里照做。
 */
export function realPalette(): SkinTonePalette {
  const vocabulary = realVocabulary();
  return {
    toneKeysFor: (skinTone) => vocabulary.tierById(skinTone)?.toneKeys,
    labelOf: (skinTone) => vocabulary.tierById(skinTone)?.label,
  };
}

/**
 * 组装根那道缝(照 `src/index.ts` 的 `features`)在测试里的版本。
 * ★ **与 `realPalette` 分成两个函数**,尽管它们读的是同一份词表:生产里这两条缝
 *   本来就是分开的(一条给色域、一条给策略卡),合起来会让"哪条缝漏了哪一格"看不出来。
 */
export function realFeatures(): FeatureStrategies {
  const vocabulary = realVocabulary();
  return {
    byId: (id) => {
      const hit = vocabulary.featureById(id);
      if (!hit) return undefined;
      return {
        id: hit.value.id,
        group: hit.dimension.id,
        groupName: hit.dimension.label,
        name: hit.value.label,
        desc: hit.value.desc,
        fix: hit.value.fix,
        products: [...hit.value.products],
      };
    },
  };
}
