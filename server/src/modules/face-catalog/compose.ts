/**
 * modules/face-catalog/compose.ts —— 组合根。
 *
 * ★ **刻意没有 `kind` union / 开关。** 词表只有一份真实数据,没有可替换的实现
 *   (对照 `weather` 有 `mock|live` —— 那是真有可替换的实现)。
 *
 * ★ **⚠️ 这里与 `products` 的先例有意不同:没有"目录不存在 = 关掉功能"这一格。**
 *   产品库是**增强项**——没有它,只是产品工具不注册,其余照常。
 *   面部词表是 `SkinTone` 合法取值的来源(`brief.skinType` / `skinTone` 的成员校验
 *   要对着它走),**缺了它整条 brief 校验就无从谈起**。所以"读不到"不是一种部署形态,
 *   是配置错误 —— 一律抛错,启动即失败(同 `MAKEUP_ENGINE` 那条"刻意没有 `off`")。
 *
 *   ⚠️ 换句话说:**`FACE_CATALOG_DIR` 指向一个不存在的路径 = 起不来**,
 *   不是"安静地关掉识别"。这正是本仓库反复点名的「假开关」要避免的形态。
 */
import { loadFaceVocabulary } from './infrastructure/json/vocabulary-loader.js';
import type { FaceVocabulary } from './domain/entities/face-vocabulary.js';

export interface FaceCatalogModuleOptions {
  /**
   * 词表目录的**绝对路径**(来自 `config.faceCatalogDir` / `FACE_CATALOG_DIR`)。
   * 缺省 `server/../assests/face-catalog`。
   * ⚠️ 目录不存在、或里面缺文件、或内容不合规 —— 全部**启动即失败**。
   */
  contentDir: string;
}

export interface FaceCatalogModuleServices {
  vocabulary: FaceVocabulary;
}

export function createFaceCatalogModule(
  options: FaceCatalogModuleOptions,
): FaceCatalogModuleServices {
  // 故意不 try/catch:词表坏了就该把启动打断,包一层只会把"配置错了却也能启动"引回来。
  return { vocabulary: loadFaceVocabulary(options.contentDir) };
}
