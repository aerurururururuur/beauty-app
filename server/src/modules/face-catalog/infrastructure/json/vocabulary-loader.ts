/**
 * infrastructure/json/vocabulary-loader.ts —— 把面部词表目录读进内存。
 *
 * ★ **急切加载**(启动时一次读完),同 `products/infrastructure/json/content-loader.ts`:
 *   只有急切才拿得到"坏词表启动即失败"。懒读意味着 `toneKeys` 写错要等到
 *   **对话进行到一半、模型真的去配那个色**时才暴露,而那时用户正等着出图。
 *
 * ⚠️ 与 `products` 有一处**有意不同**:产品库"目录不存在"是关掉功能的合法形态,
 *   面部词表**没有这个形态** —— 它是 `SkinTone` 合法取值的来源,缺了它整条 brief
 *   校验就无从谈起。所以这里读不到文件一律抛错,见 `compose.ts` 的文件头。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { FaceVocabulary } from '../../domain/entities/face-vocabulary.js';
import { parseFaceVocabulary } from '../../domain/validators/vocabulary.validator.js';

const SKIN_TONES_FILE = 'skin-tones.json';
const FEATURES_FILE = 'features.json';

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(
      `面部词表读不出来:${file} —— ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * 读词表目录 → 一份 `FaceVocabulary`。
 * 文件缺失、JSON 坏、内容不合规,**三种都抛错**(见文件头:这里没有"降级"这个选项)。
 */
export function loadFaceVocabulary(dir: string): FaceVocabulary {
  const paths = {
    skinTones: path.join(dir, SKIN_TONES_FILE),
    features: path.join(dir, FEATURES_FILE),
  };
  for (const [key, file] of Object.entries(paths)) {
    if (!existsSync(file)) {
      throw new Error(
        `面部词表目录里没有 ${path.basename(file)}:${dir}(缺的是 ${key})。` +
          'FACE_CATALOG_DIR 要指向一个同时含 ' +
          `${SKIN_TONES_FILE} 与 ${FEATURES_FILE} 的目录,见 .env.example。`,
      );
    }
  }

  return parseFaceVocabulary(
    { skinTones: readJson(paths.skinTones), features: readJson(paths.features) },
    { skinTones: SKIN_TONES_FILE, features: FEATURES_FILE },
  );
}
