/**
 * infrastructure/reference-provider/mock-reference-provider.ts —— ReferenceProvider 的 mock 实现。
 * 按场景 label(场合语义)返回预设条目。不联网、不抓取。
 *
 * ★ 它**故意不给 `imageUrl`**(留空串)。mock 手上没有真图，编一个假 URL 会让前端
 *   渲染出一个裂图 —— 那比「没有图」更糟。留空是实话：结果页据此回落到只显示标题。
 *   这条回落路径是**必需的**，不是只为 mock 服务：真实抓取也会遇到没有可用图地址的条目。
 *
 * 用途没变：**离线兜底**（与 `makeup` 的 MockEngine 同一思路），以及 `REFERENCE_PROVIDER=off`
 * 之外的第二种「整条链路照跑」的验证姿势。
 */
import type { SceneDescriptor } from '../../../shared/index.js';
import type { ReferenceImage, ReferenceRole } from '../../domain/entities/reference.js';
import type { ReferenceProvider } from '../../domain/ports/reference-provider.js';

interface Sample {
  title: string;
  role: ReferenceRole;
}

const SAMPLES: Record<string, Sample[]> = {
  interview: [
    { title: '正式面试妆 · 哑光大地色(参考)', role: '眼影' },
    { title: '低饱和豆沙唇妆(参考)', role: '唇' },
    { title: '眉目利落的通勤妆示范(参考)', role: '眉' },
  ],
  date: [
    { title: '约会温柔粉调妆(参考)', role: '颊' },
    { title: '水光感腮红晕染(参考)', role: '颊' },
    { title: '暖调玫瑰唇妆示范(参考)', role: '唇' },
  ],
  stage: [
    { title: '上台演讲 · 哑光高显色底妆(参考)', role: '底妆' },
    { title: '立体眉眼轮廓示范(参考)', role: '眼影' },
    { title: '镜头友好唇色示范(参考)', role: '唇' },
  ],
  family: [
    { title: '见家长 · 温婉得体妆(参考)', role: '底妆' },
    { title: '自然提气色腮红(参考)', role: '颊' },
    { title: '豆沙调温柔唇妆示范(参考)', role: '唇' },
  ],
  daily: [
    { title: '日常通勤百搭淡妆(参考)', role: '底妆' },
    { title: '自然伪素颜底妆示范(参考)', role: '底妆' },
    { title: '通勤豆沙唇妆(参考)', role: '唇' },
  ],
};

/** 兜底条目(自由文字但未命中任何场合)。 */
const FALLBACK_SAMPLES: Sample[] = [
  { title: '日常通勤百搭淡妆(参考)', role: '底妆' },
  { title: '自然伪素颜底妆示范(参考)', role: '底妆' },
  { title: '通勤豆沙唇妆(参考)', role: '唇' },
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class MockReferenceProvider implements ReferenceProvider {
  readonly name = 'mock';

  async fetch(scene: SceneDescriptor): Promise<ReferenceImage[]> {
    // 模拟一次外部检索耗时,让进度可视化。
    await sleep(200);
    const samples = SAMPLES[scene.label] ?? FALLBACK_SAMPLES;
    const retrievedAt = new Date().toISOString();
    return samples.map((s, i) => ({
      id: `ref-${scene.label}-${i + 1}`,
      title: s.title,
      imageUrl: '', // 见文件头:mock 不编图片地址,前端回落到只显示标题
      sourceUrl: '', // 同上,不编出处
      role: s.role,
      retrievedAt,
    }));
  }
}
