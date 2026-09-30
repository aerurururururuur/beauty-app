/**
 * infrastructure/vision/scene-analyzer.ts —— `scene` 这一个 case 的适配器(场景图 → 一句话)。
 *
 * 三条纪律与 `face-analyzer.ts` 逐条相同(给失败通道 / 越界当场抛 / 不猜),
 * 理由不再重复一遍;但**取值规则不共用**:`scene` 读的是图上真有的东西,没有清单,
 * 见 `validateSceneReading` 的文件头。
 */
import type { AnalysisOf, AnalyzeInput, ImageAnalyzer } from '../../domain/ports/analyzer.js';
import type { VisionClient } from '../../domain/ports/vision.js';
import { parseVisionReply, validateSceneReading } from '../../domain/validators/analysis.validator.js';

export const SCENE_PROMPT = [
  '看这张照片,用**一句话**(不超过 40 字)描述这是什么场合。',
  '要说的具体一点:灯光怎么样、正式到什么程度、什么氛围,比如',
  '「办公室冷白光,白天,正式度中等」「暗场生日会,暖黄灯光,气氛热闹」。',
  '',
  '★ **不要**把它归成「面试」「约会」这类标签,也不要猜你看不出来的东西 ——',
  '只说照片里真有的。',
  '',
  '回答**只有**一个 JSON,不要任何别的话:',
  '{"scene":"<上面那句话>"}',
  '',
  '看不清、或者拿不准,就回 {"scene":"unknown"}。不要猜。',
].join('\n');

export class SceneAnalyzer implements ImageAnalyzer<'scene'> {
  readonly case = 'scene';

  constructor(private readonly client: VisionClient) {}

  async read(input: AnalyzeInput): Promise<AnalysisOf['scene']> {
    const text = await this.client.ask({ images: [input.image], prompt: SCENE_PROMPT });
    return validateSceneReading(parseVisionReply(text, '场合读数'));
  }
}
