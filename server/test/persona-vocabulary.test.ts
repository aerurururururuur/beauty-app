/**
 * persona-vocabulary.test.ts —— 人设库的**跨端对表**:把种子里那几串没人管的字符串变成有人管的。
 * ★ 人设行存的是**前端那套 id**(`yellow-2` / `eye-up`),后端**刻意不校验**(见 `schemas/entities/persona.ts`);
 *   错一个字符的坏法是**静默的**(色块少一块 / 印出个没勾的特征),只有对着两边的源文件看才发现。
 * ★ 钉四样:种子的 `skinTone` ⊆ 前端 8 档、`features` ⊆ `FEATURE_LIBRARY`、两份静态照片真存在、
 *   `design.js` 那两张肤色映射互逆双射(同 `test/face-catalog.test.ts` 的先例)。
 * ⚠️ 钉不住"那一屏跑不跑得起来"——本文件绿了只说明名字对得上(前端零测试,§11-12)。
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SKIN_TONES } from '../src/modules/shared/index.js';
import { PERSONA_RELATIONS, PERSONA_SEEDS, PERSONA_SEED_VERSION } from '../src/modules/user/index.js';
import {
  frontendFeatures,
  frontendRelations,
  frontendSkinToneMaps,
  frontendSkinTones,
} from './helpers/frontend-kb.js';

/**
 * 一份种子的静态照片在盘上的位置。★ `url` 是**前端 `public/` 下的绝对路径**,
 * 所以盘上要自己补上 `vue/public`。
 */
function seedPhotoPath(url: string): string {
  return fileURLToPath(new URL(`../../vue/public${url}`, import.meta.url));
}

describe('种子的肤色档', () => {
  it('5 份种子的 skinTone 都在前端 kb 那 8 个档 id 里', async () => {
    const ids = (await frontendSkinTones()).map((t) => t.id);
    expect(ids).toHaveLength(8);
    for (const seed of PERSONA_SEEDS) {
      expect(ids, `${seed.id} 的 skinTone「${seed.skinTone}」不在前端 kb 里`).toContain(seed.skinTone);
    }
  });

  it('种子的档位不是清一色(5 份里至少用到 4 个不同的档)', () => {
    const used = new Set(PERSONA_SEEDS.map((s) => s.skinTone));
    expect(used.size).toBeGreaterThanOrEqual(4);
  });

  it('★ 后端那套 SKIN_TONES 不是种子该存的词 —— 除了同名的那一个', () => {
    // ★ 这条**不是**"种子里不许出现后端档":两套词里 `olive` **恰好同名**(也恰好都是橄榄皮),
    //   所以它能同时属于两边。真正要钉的是其余 7 个:`warm_beige` 这种一旦漏进种子,
    //   前端查 `skinToneById()` 查不到 ⇒ 静默显示「未定档」+ 无色块,界面上报不出来。
    const clash = PERSONA_SEEDS.map((s) => s.skinTone).filter(
      (tone) => (SKIN_TONES as readonly string[]).includes(tone) && tone !== 'olive'
    );
    expect(clash).toEqual([]);
  });
});

describe('种子的面部特征', () => {
  it('用到的特征 id 都在前端 FEATURE_LIBRARY 里', async () => {
    const ids = (await frontendFeatures()).map((f) => f.id);
    const used = [...new Set(PERSONA_SEEDS.flatMap((s) => s.features))];
    // 先确认这条用例真的在看东西(种子全都不带特征时它会是空转的绿)
    expect(used.length).toBeGreaterThan(0);
    for (const id of used) {
      expect(ids, `特征「${id}」不在前端特征库里`).toContain(id);
    }
  });

  it('同一份种子里特征不重复(重复的话前端会印出两个一样的标签)', () => {
    for (const seed of PERSONA_SEEDS) {
      expect(new Set(seed.features).size, `${seed.id} 的特征有重复`).toBe(seed.features.length);
    }
  });
});

describe('种子里的静态照片', () => {
  const withPhoto = PERSONA_SEEDS.filter((s) => s.photo.kind === 'seed');
  const withoutPhoto = PERSONA_SEEDS.filter((s) => s.photo.kind === 'none');

  it('恰好 2 份带图、3 份没有 —— 那 3 份是设计如此,不是缺图', () => {
    // ★ `vue/AGENTS.md` §11-14:3 份 `photoUrl: ''` 的种子走 `PersonaAvatar` 的「首字 + 肤色底」,
    //   而那一态正是**新建人设时的默认态**。给它补一张图 = 让那条路径没人走过。
    expect(withPhoto.map((s) => s.id)).toEqual(['ps-colleague', 'ps-sister']);
    expect(withoutPhoto.map((s) => s.id)).toEqual(['ps-self', 'ps-mom', 'ps-friend']);
  });

  it('`seed` 指向的那个文件在前端 public/ 下真的存在', () => {
    expect(withPhoto).toHaveLength(2); // 两边都空了的话下面那个循环会空转
    for (const seed of withPhoto) {
      if (seed.photo.kind !== 'seed') continue; // 收窄用;上面那个 filter 已经保证了
      const onDisk = seedPhotoPath(seed.photo.url);
      expect(existsSync(onDisk), `盘上找不到 ${seed.photo.url}(我找的是 ${onDisk})`).toBe(true);
    }
  });
});

describe('关系档(后端白名单 ↔ 前端 RELATIONS)', () => {
  it('种子的 relation 都在白名单里', () => {
    for (const seed of PERSONA_SEEDS) {
      expect(PERSONA_RELATIONS as readonly string[], `${seed.id} 的 relation 不合法`).toContain(seed.relation);
    }
  });

  it('两边是同一组 id(只比集合,不比顺序 —— 顺序只影响页面上的排布)', async () => {
    const front = await frontendRelations();
    expect([...front.map((r) => r.id)].sort()).toEqual([...PERSONA_RELATIONS].sort());
  });

  it('★ 前端每一档都得有中文名(少了 label 的 chip 是一个空白按钮)', async () => {
    for (const rel of await frontendRelations()) {
      expect(rel.label, `关系档「${rel.id}」没有中文名`).toBeTruthy();
    }
  });
});

describe('肤色档的两张映射表(api/design.js)', () => {
  it('正向表的**键**= 前端 kb 那 8 个 id,值 = 后端 SKIN_TONES 那 8 个', async () => {
    const { toBackend } = await frontendSkinToneMaps();
    const frontIds = (await frontendSkinTones()).map((t) => t.id);
    expect(Object.keys(toBackend).sort()).toEqual([...frontIds].sort());
    expect(Object.values(toBackend).sort()).toEqual([...SKIN_TONES].sort());
  });

  it('值是单射:一个后端档不许被两个前端档指到', async () => {
    const { toBackend } = await frontendSkinToneMaps();
    const values = Object.values(toBackend);
    expect(new Set(values).size).toBe(values.length);
  });

  it('反查表是正向表的**真逆**(逐条对得上)', async () => {
    const { toBackend, fromBackend } = await frontendSkinToneMaps();
    const pairs = Object.entries(toBackend);
    expect(pairs.length).toBe(8);
    expect(Object.keys(fromBackend)).toHaveLength(pairs.length);
    for (const [front, backend] of pairs) {
      expect(fromBackend[backend], `后端档「${backend}」反查出来是「${fromBackend[backend]}」`).toBe(front);
    }
  });

  it('查不到的档回 undefined —— 读脸那侧靠它判「没读出来」(§8-1)', async () => {
    const { fromBackend } = await frontendSkinToneMaps();
    expect(fromBackend['warm_beige']).toBe('yellow-2');
    // ★ 这一格是**契约**不是巧合:前端**不许**给查不到的档兜一个默认值,
    //   那等于替用户挑了一个他没确认过的肤色。所以它必须**真的**是 undefined。
    expect(fromBackend['not_a_tone']).toBeUndefined();
  });
});

describe('种子版本', () => {
  it('是个正整数(0 / 负数会让「升版本才补种」这条规矩失去意义)', () => {
    expect(Number.isInteger(PERSONA_SEED_VERSION)).toBe(true);
    expect(PERSONA_SEED_VERSION).toBeGreaterThan(0);
  });
});
