/**
 * infrastructure/vision/style-analyzer.ts —— `style` 这一个 case 的适配器(任意图 → 风格)。
 *
 * ★★ **输入不一定是妆容照。** 可能是一幅画、一张插画、一页漫画分镜,也可能就是人脸照。
 *   所以问法**不是**「这个妆是什么」(那在非妆容图上没有答案),而是
 *   「照这个画面的风格化妆,妆面该是什么样」—— 让模型从**色调、明暗、对比**里
 *   反推出闭集字段,而不是去找图中并不存在的化妆品。这条是用户点出来的。
 *
 * ★★ **产物仍然是 `StyleRead`(闭集),不是一段描述。** 理由在 `entities/style-read.ts`
 *   头部:让视觉模型回一段话,那段话就是几何词的生成口(「放大感美瞳」是 run 3 的原话);
 *   闭集字段**结构性地**带不进几何词,所以本提示词里一个描述性的词都不许有。
 *
 * ★ 取值清单从元组插值,不手写(手写的那份不会和元组一起改)。
 *   但**字段名**躲不掉第二处写法(第一处在 `schemas/contracts/look-spec.ts`),
 *   所以 Part 6 要有一条测试把这两处钉在一起。
 */
import { TONE_KEYS } from '../../../shared/index.js';
import {
  DEPTHS,
  FINISHES,
  INTENSITY_MAX,
  INTENSITY_MIN,
  SATURATIONS,
  WARMTH_MAX,
  WARMTH_MIN,
} from '../../domain/entities/look-spec.js';
import type { AnalysisOf, AnalyzeInput, ImageAnalyzer } from '../../domain/ports/analyzer.js';
import type { VisionClient } from '../../domain/ports/vision.js';
import { parseVisionReply, validateStyleReading } from '../../domain/validators/analysis.validator.js';

const I = `${INTENSITY_MIN}-${INTENSITY_MAX} 的整数`;
const W = `${WARMTH_MIN}..${WARMTH_MAX} 的整数`;

export const STYLE_PROMPT = [
  '看这张图,把它当作**风格参考**,提炼成下面这个结构。',
  '',
  '图**不一定是妆容照**:可能是人脸照、一幅画、插画或漫画分镜。',
  '不管你看到的是什么,只回答一个问题:**要照这个画面的风格化妆,妆面该是什么样?**',
  '按画面里的**色调、明暗与对比**去判断。不要去描述画面内容,也不要去找具体的化妆品。',
  '',
  '回答**只有**一个 JSON,形状与下面完全一致(不许少字段、不许加字段):',
  '{',
  `  "base": {"coverage": <${I}>, "finish": "<质地>", "warmth": <${W}>},`,
  '  "zones": {',
  `    "lip":       {"tone": "<色>", "depth": "<深浅>", "saturation": "<饱和>", "finish": "<质地>", "intensity": <${I}>},`,
  `    "cheek":     {"tone": "<色>", "depth": "<深浅>", "saturation": "<饱和>", "finish": "<质地>", "intensity": <${I}>},`,
  `    "eyeshadow": {"tone": "<色>", "depth": "<深浅>", "saturation": "<饱和>", "finish": "<质地>", "intensity": <${I}>}`,
  '  }',
  '}',
  '',
  `「色」**只能**是这 ${TONE_KEYS.length} 个之一:${TONE_KEYS.join(' / ')}`,
  `「深浅」**只能**是这 ${DEPTHS.length} 个之一:${DEPTHS.join(' / ')}`,
  `「饱和」**只能**是这 ${SATURATIONS.length} 个之一:${SATURATIONS.join(' / ')}`,
  `「质地」**只能**是这 ${FINISHES.length} 个之一:${FINISHES.join(' / ')}`,
  'warmth 负数偏冷、正数偏暖、0 中性。',
  '',
  '画面没有颜色、或无从判断色彩倾向(比如黑白画、纯色块),就回 {"unknown": true}。',
  '**不要猜**:这套读数会直接决定妆面配色,而"读不出来"是可以接受的答案。',
].join('\n');

export class StyleAnalyzer implements ImageAnalyzer<'style'> {
  readonly case = 'style';

  constructor(private readonly client: VisionClient) {}

  async read(input: AnalyzeInput): Promise<AnalysisOf['style']> {
    const text = await this.client.ask({ images: [input.image], prompt: STYLE_PROMPT });
    return validateStyleReading(parseVisionReply(text, '风格图读数'));
  }
}
