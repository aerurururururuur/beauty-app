/**
 * infrastructure/scene-analyzer/mock-scene-analyzer.ts —— SceneAnalyzer 的 mock 实现。
 * 只做关键词匹配(对场景文字与文件名),不读图、不联网。
 * 未来替换为视觉大模型后,本实现退役。
 */
import type { SceneAnalysis } from '../../domain/entities/scene.js';
import type { SceneAnalyzer, SceneAnalyzerInput } from '../../domain/ports/scene-analyzer.js';

interface Rule {
  keywords: string[];
  label: string;
  direction: string;
  tags: string[];
}

const RULES: Rule[] = [
  {
    keywords: ['雪', '冰川', '极光', 'snow'],
    label: 'snow',
    direction: '清透冷调 · 雾面服帖',
    tags: ['冷调', '清透', '雾面', '低饱和'],
  },
  {
    keywords: ['海', '沙滩', '海岛', '泳', 'beach'],
    label: 'beach',
    direction: '元气橘粉 · 水光清透',
    tags: ['暖调', '水光', '元气', '橘粉'],
  },
  {
    keywords: ['红叶', '枫', '秋', '银杏', 'red'],
    label: 'red-leaf',
    direction: '枫叶暖调 · 提升气色',
    tags: ['暖调', '枫叶红', '显气色'],
  },
  {
    keywords: ['城市', '都市', '夜景', '霓虹', '街头', 'city'],
    label: 'city',
    direction: '冷调都市 · 眉眼利落',
    tags: ['冷调', '轻烟熏', '哑光'],
  },
  {
    keywords: ['沙漠', '戈壁', '沙丘', 'desert'],
    label: 'desert',
    direction: '大地暖棕 · 哑光修容',
    tags: ['暖调', '大地色', '哑光'],
  },
  {
    keywords: ['山', '森林', '草原', '湖', '瀑布', 'mountain'],
    label: 'mountain',
    direction: '裸感自然 · 轻雾透光',
    tags: ['自然', '裸感', '透光'],
  },
];

const UNKNOWN: SceneAnalysis = {
  label: 'unknown',
  direction: '自然日常 · 百搭',
  tags: ['日常', '自然'],
  confidence: 0.3,
  source: 'mock',
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class MockSceneAnalyzer implements SceneAnalyzer {
  readonly name = 'mock';

  async analyze(input: SceneAnalyzerInput): Promise<SceneAnalysis> {
    // 模拟一点点“理解耗时”,让前端轮询能看到进度推进。
    await sleep(250);
    const text = (input.sceneText ?? '').toLowerCase();
    const hay = [text, ...input.scenes.map((s) => s.originalName ?? '')].join(' ');
    for (const rule of RULES) {
      if (rule.keywords.some((k) => hay.includes(k))) {
        return {
          label: rule.label,
          direction: rule.direction,
          tags: rule.tags,
          confidence: text ? 0.72 : 0.5,
          source: 'mock',
        };
      }
    }
    return { ...UNKNOWN, source: 'mock' };
  }
}
