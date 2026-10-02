/**
 * MockEngine 行为单测:风格随「场合 label」变、色板随「brief.skinTone」变——
 * 呼应 roadmap「按真实肤色走、不默认浅肤色审美」。
 */
import { describe, expect, it } from 'vitest';
import type { EngineInput, EngineResult } from '../src/modules/makeup/index.js';
import { realVocabulary } from './helpers/face-catalog.js';
import { MockEngine } from './helpers/mock-engine.js';

const eng = new MockEngine();
/** 仓库里那份真词表。★ 缺省档到底该是哪一档,**只有词表说了算**。 */
const CATALOG = realVocabulary();

async function run(occasion: string, skinTone: string): Promise<EngineResult> {
  const input: EngineInput = {
    face: { filePath: 'mem://face.png', mimeType: 'image/png' },
    brief: { occasion: occasion as 'interview', skinTone: skinTone as 'cool_porcelain' },
  };
  return eng.generate(input);
}

describe('MockEngine', () => {
  it('不同场合 → 不同风格文案', async () => {
    const interview = await run('interview', 'olive');
    const date = await run('date', 'olive');
    expect((interview.look as { style: string }).style).not.toBe(
      (date.look as { style: string }).style,
    );
  });

  it('同一场合不同肤色档 → 色板不同(浅更柔、深更实)', async () => {
    const light = (await run('interview', 'cool_porcelain')).look as { palette: { rgb: number[] }[] };
    const deep = (await run('interview', 'deep_brown')).look as { palette: { rgb: number[] }[] };
    expect(light.palette).not.toEqual(deep.palette);
    // 深肤色档不应比浅档更「提亮」——深档各色分量不高于浅档。
    for (let i = 0; i < light.palette.length; i++) {
      const l = light.palette[i]!.rgb;
      const d = deep.palette[i]!.rgb;
      expect(d[0]!).toBeLessThan(l[0]!);
    }
  });

  /**
   * ★ 这条是 §13-3 红线的**执行点**:引擎在"用户没说肤色"时挑哪一档,就是这套系统
   *   实际默认的审美。所以它**不写死 `'olive'`**,而是去问词表"哪一档标了 `isDefault`" ——
   *   写死的话,词表把缺省档挪走之后这里照样绿,而线上默认的那一档已经变了。
   */
  it('★ 肤色档缺省时落到词表的 isDefault 档,且那一档不是最浅档(不默认浅肤色)', async () => {
    const input: EngineInput = {
      face: { filePath: 'mem://face.png', mimeType: 'image/png' },
      brief: { occasion: 'daily' },
    };
    const out = await eng.generate(input);
    const fallback = CATALOG.defaultTier();

    expect((out.look as { skinTone: string }).skinTone).toBe(fallback.id);
    expect(fallback.order).toBeGreaterThan(Math.min(...CATALOG.tones.map((t) => t.order)));
  });
});
