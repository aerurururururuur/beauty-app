/**
 * infrastructure/vision/scene-analyzer.ts —— `scene` 这一个 case 的适配器(场景图 → 场合)。
 *
 * 三条纪律与 `face-analyzer.ts` 逐条相同(列全取值 / 给失败通道 / 越界当场抛),
 * 理由不再重复一遍;规则表同样是全仓那份 `checkBriefFields`,不新写白名单。
 */
import { OCCASIONS } from '../../../shared/index.js';
import type { AnalysisOf, AnalyzeInput, ImageAnalyzer } from '../../domain/ports/analyzer.js';
import type { VisionClient } from '../../domain/ports/vision.js';
import { parseVisionReply, validateSceneReading } from '../../domain/validators/analysis.validator.js';

export const SCENE_PROMPT = [
  '看这张照片,判断它属于哪一类**场合**。',
  '',
  `场合**只能**是下面之一(原样回,一个字母都不要改):${OCCASIONS.join(' / ')}`,
  '',
  '回答**只有**一个 JSON,不要任何别的话:',
  '{"occasion":"<上面某一个>"}',
  '',
  '看不清、或者拿不准,就回 {"occasion":"unknown"}。不要猜。',
].join('\n');

export class SceneAnalyzer implements ImageAnalyzer<'scene'> {
  readonly case = 'scene';

  constructor(private readonly client: VisionClient) {}

  async read(input: AnalyzeInput): Promise<AnalysisOf['scene']> {
    const text = await this.client.ask({ images: [input.image], prompt: SCENE_PROMPT });
    return validateSceneReading(parseVisionReply(text, '场合读数'));
  }
}
