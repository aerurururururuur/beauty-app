/**
 * infrastructure/scene-analyzer/mock-scene-analyzer.ts —— SceneAnalyzer 的 mock 实现。
 * 依据用户需求简报(brief)做场合判定:
 *   - brief.occasion 给定 → 直接采用(最高置信);
 *   - 否则对自由文字 sceneText 做场合关键词匹配;
 *   - 都未命中 → 归到 daily(自然百搭),避免任意自定义文字被当成某类场合。
 * 不读图、不联网。可选风景参考图(scenes)不参与风格判定,留给未来视觉大模型加分项。
 */
import type { Occasion } from '../../../shared/index.js';
import type { SceneAnalysis } from '../../domain/entities/scene.js';
import type { SceneAnalyzer, SceneAnalyzerInput } from '../../domain/ports/scene-analyzer.js';

/** 每个场合预置的妆容方向与关键词。 */
const STYLE: Record<Occasion, { direction: string; tags: string[] }> = {
  interview: {
    direction: '正式得体 · 哑光大地色,眉眼利落显精神',
    tags: ['正式', '哑光', '大地色', '利落'],
  },
  date: {
    direction: '温柔提气色 · 粉调水光,亲和自然',
    tags: ['温柔', '粉调', '水光', '亲和'],
  },
  stage: {
    direction: '上台醒目 · 哑光高显色,轮廓立体、镜头友好',
    tags: ['舞台', '高显色', '哑光', '立体'],
  },
  family: {
    direction: '温婉得体 · 自然提气色,亲切耐看',
    tags: ['温婉', '自然', '提气色', '耐看'],
  },
  daily: {
    direction: '日常百搭 · 通透自然伪素颜',
    tags: ['日常', '通透', '伪素颜', '自然'],
  },
};

const KEYWORD_RULES: { keywords: string[]; occasion: Occasion }[] = [
  { occasion: 'interview', keywords: ['面试', '终面', '求职', '复试'] },
  { occasion: 'stage', keywords: ['上台', '演讲', '答辩', '路演', '主持', '汇报'] },
  { occasion: 'date', keywords: ['约会', '相亲', '烛光'] },
  { occasion: 'family', keywords: ['见家长', '家长'] },
  { occasion: 'daily', keywords: ['上班', '通勤', '日常', '开会', '客户'] },
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class MockSceneAnalyzer implements SceneAnalyzer {
  readonly name = 'mock';

  async analyze(input: SceneAnalyzerInput): Promise<SceneAnalysis> {
    await sleep(250); // 模拟一点“理解耗时”,让前端轮询看到进度推进。
    const brief = input.brief ?? {};
    const text = (brief.sceneText ?? '').toLowerCase();

    let label: Occasion;
    let confidence: number;
    if (brief.occasion) {
      label = brief.occasion;
      confidence = 0.92;
    } else {
      const hit = KEYWORD_RULES.find((r) => r.keywords.some((k) => text.includes(k)));
      if (hit) {
        label = hit.occasion;
        confidence = 0.72;
      } else {
        label = 'daily';
        confidence = text ? 0.4 : 0.3;
      }
    }

    const s = STYLE[label];
    return {
      label,
      direction: s.direction,
      tags: s.tags,
      confidence,
      source: 'mock',
    };
  }
}
