/**
 * MockEngine 行为单测:风格随「场合 label」变、色板随「brief.skinTone」变——
 * 呼应 roadmap「按真实肤色走、不默认浅肤色审美」。
 */
import { describe, expect, it } from 'vitest';
import { MockEngine } from '../src/modules/makeup/index.js';
import type { EngineInput, EngineResult } from '../src/modules/makeup/index.js';

const eng = new MockEngine();

async function run(occasion: string, skinTone: string): Promise<EngineResult> {
  const input: EngineInput = {
    face: { filePath: 'mem://face.png', mimeType: 'image/png' },
    scenes: [],
    brief: { occasion: occasion as 'interview', skinTone: skinTone as 'light' },
    sceneAnalysis: {
      label: occasion,
      direction: 'x',
      tags: [],
      source: 'mock',
    },
  };
  return eng.generate(input);
}

describe('MockEngine', () => {
  it('不同场合 → 不同风格文案', async () => {
    const interview = await run('interview', 'medium');
    const date = await run('date', 'medium');
    expect((interview.look as { style: string }).style).not.toBe(
      (date.look as { style: string }).style,
    );
  });

  it('同一场合不同肤色档 → 色板不同(浅更柔、深更实)', async () => {
    const light = (await run('interview', 'light')).look as { palette: { rgb: number[] }[] };
    const deep = (await run('interview', 'deep')).look as { palette: { rgb: number[] }[] };
    expect(light.palette).not.toEqual(deep.palette);
    // 深肤色档不应比浅档更「提亮」——深档各色分量不高于浅档。
    for (let i = 0; i < light.palette.length; i++) {
      const l = light.palette[i]!.rgb;
      const d = deep.palette[i]!.rgb;
      expect(d[0]).toBeLessThan(l[0]);
    }
  });

  it('肤色档缺省时落到中间档(不默认浅肤色)', async () => {
    const input: EngineInput = {
      face: { filePath: 'mem://face.png', mimeType: 'image/png' },
      scenes: [],
      brief: { occasion: 'daily' },
      sceneAnalysis: { label: 'daily', direction: 'x', tags: [], source: 'mock' },
    };
    const out = await eng.generate(input);
    expect((out.look as { skinTone: string }).skinTone).toBe('medium');
  });
});
