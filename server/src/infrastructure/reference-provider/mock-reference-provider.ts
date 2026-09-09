/**
 * infrastructure/reference-provider/mock-reference-provider.ts —— ReferenceProvider 的 mock 实现。
 * 按场景 label(场合语义)返回预设参考条目。不联网、不抓取网络图。
 *
 * ★ IP/原创红线(roadmap §七):素材须自绘/自有/可授权并逐张记录来源。
 * 本 mock 只给出「场合化的示意标题」,license 诚实标注为自绘演示素材;
 * 正式稿须替换为可授权参考素材并回填真实 license/sourceUrl。
 */
import type { ReferenceImage } from '../../domain/entities/reference.js';
import type { SceneAnalysis } from '../../domain/entities/scene.js';
import type { ReferenceProvider } from '../../domain/ports/reference-provider.js';

interface Sample {
  title: string;
}

const SAMPLES: Record<string, Sample[]> = {
  interview: [
    { title: '正式面试妆 · 哑光大地色(参考) ' },
    { title: '低饱和豆沙唇妆(参考)' },
    { title: '眉目利落的通勤妆示范(参考)' },
  ],
  date: [
    { title: '约会温柔粉调妆(参考)' },
    { title: '水光感腮红晕染(参考)' },
    { title: '暖调玫瑰唇妆示范(参考)' },
  ],
  stage: [
    { title: '上台演讲 · 哑光高显色底妆(参考)' },
    { title: '立体眉眼轮廓示范(参考)' },
    { title: '镜头友好唇色示范(参考)' },
  ],
  family: [
    { title: '见家长 · 温婉得体妆(参考)' },
    { title: '自然提气色腮红(参考)' },
    { title: '豆沙调温柔唇妆示范(参考)' },
  ],
  daily: [
    { title: '日常通勤百搭淡妆(参考)' },
    { title: '自然伪素颜底妆示范(参考)' },
    { title: '通勤豆沙唇妆(参考)' },
  ],
};

/** 兜底条目(自由文字但未命中任何场合)。 */
const FALLBACK_SAMPLES: Sample[] = [
  { title: '日常通勤百搭淡妆(参考)' },
  { title: '自然伪素颜底妆示范(参考)' },
  { title: '通勤豆沙唇妆(参考)' },
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
      license: '自绘演示素材 · 正式稿替换为可授权来源并回填授权信息',
      sourceUrl: '', // 红线:不抓网络图;正式稿填本地/授权素材地址
    }));
  }
}
