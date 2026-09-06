/**
 * infrastructure/reference-provider/mock-reference-provider.ts —— ReferenceProvider 的 mock 实现。
 * 按场景 label 返回预设参考条目(带授权来源标注)。不联网。
 * 未来可替换为网页/资源库搜索(需遵守授权条款)。
 */
import type { ReferenceImage } from '../../domain/entities/reference.js';
import type { SceneAnalysis } from '../../domain/entities/scene.js';
import type { ReferenceProvider } from '../../domain/ports/reference-provider.js';

interface Sample {
  title: string;
}

const SAMPLES: Record<string, Sample[]> = {
  snow: [
    { title: '雪景清透妆 · 冷调底妆' },
    { title: '冷感粉调腮红晕染' },
    { title: '水润透亮唇妆示例' },
  ],
  beach: [
    { title: '海边元气橘粉妆' },
    { title: '水光感高光点缀' },
    { title: '夏日清透腮红示例' },
  ],
  'red-leaf': [
    { title: '秋日枫叶眼妆' },
    { title: '复古红棕唇色' },
    { title: '暖调腮红修容示例' },
  ],
  city: [
    { title: '都市轻烟熏眼妆' },
    { title: '冷调裸色唇妆' },
    { title: '夜景灯光下哑光底妆示例' },
  ],
  desert: [
    { title: '沙漠大地色眼影' },
    { title: '暖棕修容与晒伤腮红' },
    { title: '哑光蜜桃唇妆示例' },
  ],
  mountain: [
    { title: '山野裸感伪素颜妆' },
    { title: '透光高光与清透底妆' },
    { title: '豆沙色日常唇妆示例' },
  ],
  unknown: [
    { title: '百搭日常淡妆' },
    { title: '自然提气色腮红' },
    { title: '通勤豆沙唇妆示例' },
  ],
};

/** 兜底条目(未识别场景)。 */
const FALLBACK_SAMPLES: Sample[] = [
  { title: '百搭日常淡妆' },
  { title: '自然提气色腮红' },
  { title: '通勤豆沙唇妆示例' },
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class MockReferenceProvider implements ReferenceProvider {
  readonly name = 'mock';

  async fetch(scene: SceneAnalysis): Promise<ReferenceImage[]> {
    // 模拟一次外部检索耗时,让进度可视化。
    await sleep(200);
    const samples = SAMPLES[scene.label] ?? FALLBACK_SAMPLES;
    return samples.map((s, i) => ({
      id: `ref-${scene.label}-${i + 1}`,
      title: s.title,
      license: '骨架示例条目 · 接入真实来源后须标注授权条款',
      sourceUrl: `https://example.com/makeup-reference/${scene.label}/${i + 1}`,
    }));
  }
}
