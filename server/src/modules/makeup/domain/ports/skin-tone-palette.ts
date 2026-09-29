/**
 * domain/ports/skin-tone-palette.ts —— `makeup` 需要的、来自面部词表的那一点信息。
 *
 * ★ 形状由 **makeup 自己声明**(§7.1:业务模块之间零 import),组装根负责把
 *   `face-catalog` 的 `FaceVocabulary` 包一层接上去 —— 同 `CosmeticReader` / `ProductLibrary`。
 *
 * ★ **调用方必须给,没有缺省。** 少了它,§6 规矩 4 的「合法取值空间按肤色收窄」
 *   会**静默失效**(妆面照过、图照出,只是色域不再受限)—— 那正是本仓库反复点名的假开关。
 *   所以这里宁可让每个调用点多传一个参数。
 *
 * ⚠️ 档位的**名字与色域是内容**(在 `assests/face-catalog/skin-tones.json` 里),不是代码:
 *   同一个档位 id 换一版词表,可用色汇就会变。所以这两个方法是**查表**,不是常量。
 */
import type { ToneKey } from '../entities/look-spec.js';

export interface SkinTonePalette {
  /** 这一档允许的色汇。**档位在词表里不存在时返回 `undefined`**(不抛错)。 */
  toneKeysFor(skinTone: string): readonly ToneKey[] | undefined;
  /** 档位中文名。只用于**给模型看的**错误消息。查不到时 `undefined`。 */
  labelOf(skinTone: string): string | undefined;
}
