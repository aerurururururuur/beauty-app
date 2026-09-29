/**
 * infrastructure/vision/face-analyzer.ts —— `face` 这一个 case 的适配器(本人照片 → 肤色)。
 *
 * ★ 提示词**只做分类**,而且三件事缺一条就是假开关:
 *   ① 合法取值**列全**(下面那份从 `SKIN_TONES` 插值,不手写、不复制);
 *   ② 给模型一条**显式的失败通道**(`unknown`),别逼它猜一个;
 *   ③ 越界由 `validateFaceReading` 当场抛错 —— 绝不"就近映射"到某一档。
 *      映射一下就是本仓头号 bug 的形状:200、日志干净、肤色悄悄是错的,
 *      而它会一路流进提示词的肤色锚句。
 *
 * ⚠️ **只给档位 id,不给中文解释。** 中文档名在词表目录里
 *   (`assests/face-catalog/skin-tones.json` 的 `label`),在这里再写一份就是第二份词表。
 *   真要给模型看中文,得照 `SkinTonePalette` 的做法**从端口注入**。
 */
import { SKIN_TONES } from '../../../shared/index.js';
import type { AnalysisOf, AnalyzeInput, ImageAnalyzer } from '../../domain/ports/analyzer.js';
import type { VisionClient } from '../../domain/ports/vision.js';
import { parseVisionReply, validateFaceReading } from '../../domain/validators/analysis.validator.js';

export const FACE_PROMPT = [
  '看这张人脸照片,判断肤色档位。',
  '',
  `档位**只能**是下面之一(原样回,一个字母都不要改):${SKIN_TONES.join(' / ')}`,
  '',
  '回答**只有**一个 JSON,不要任何别的话:',
  '{"skinTone":"<上面某一个>"}',
  '',
  '看不清人脸、或者拿不准,就回 {"skinTone":"unknown"}。',
  '**不要猜**:猜错会让整套妆的配色跑偏,而"读不出来"是可以接受的答案。',
].join('\n');

export class FaceAnalyzer implements ImageAnalyzer<'face'> {
  readonly case = 'face';

  constructor(private readonly client: VisionClient) {}

  async read(input: AnalyzeInput): Promise<AnalysisOf['face']> {
    const text = await this.client.ask({ images: [input.image], prompt: FACE_PROMPT });
    return validateFaceReading(parseVisionReply(text, '肤色读数'));
  }
}
