/**
 * test/references.test.ts —— 参考检索模块。
 *
 * 分两段，刻意划清「能测的」与「不测的」：
 *  ① `parseBingHits` —— 纯函数，**喂真实形状的 HTML 片段**，这是本模块最值得测的部分；
 *  ② `BingReferenceProvider` —— 用 `vi.stubGlobal('fetch')` 打桩，测的是**降级契约**
 *     (抓取失败必须回空数组、绝不抛错)，而不是抓取本身。
 *
 * **不测的**：真实的网络抓取。它依赖站点可达性，必然不稳定，不进单测。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BingReferenceProvider,
  REFERENCE_ROLES,
  parseBingHits,
} from '../src/modules/references/index.js';
import type { SceneDescriptor } from '../src/modules/shared/index.js';

const SCENE: SceneDescriptor = {
  label: 'interview',
  direction: '正式得体 · 哑光大地色，眉眼利落显精神',
  tags: ['正式', '哑光', '大地色', '利落'],
};

/**
 * 造一条 Bing 结果条目。**刻意复刻真实页面的写法**：`m` 属性值是 JSON，
 * 但内部的 `"` 全被转义成 `&quot;` —— 这正是 `parseBingHits` 能安全切分的前提，
 * 所以夹具必须还原这一点，否则测的是一个不存在的形状。
 */
function iusc(m: Record<string, unknown>): string {
  const escaped = JSON.stringify(m).replace(/"/g, '&quot;');
  return `<a class="iusc" m="${escaped}"></a>`;
}

function page(...attrs: string[]): string {
  return `<html><body><div id="mmComponent_images">${attrs.join('')}</div></body></html>`;
}

const HIT_A = { murl: 'https://img.example.com/a.jpg', purl: 'https://blog.example.com/a', t: '面试妆容教程 A' };
const HIT_B = { murl: 'https://img.example.com/b.png', purl: 'https://blog.example.com/b', t: '面试妆容教程 B' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseBingHits', () => {
  it('从 m 属性里取出图片直链、来源页、标题', () => {
    const hits = parseBingHits(page(iusc(HIT_A), iusc(HIT_B)));
    expect(hits).toEqual([
      { imageUrl: HIT_A.murl, sourceUrl: HIT_A.purl, title: HIT_A.t },
      { imageUrl: HIT_B.murl, sourceUrl: HIT_B.purl, title: HIT_B.t },
    ]);
  });

  it('按 murl 去重，保持首次出现顺序', () => {
    const hits = parseBingHits(page(iusc(HIT_A), iusc(HIT_A), iusc(HIT_B)));
    expect(hits.map((h) => h.imageUrl)).toEqual([HIT_A.murl, HIT_B.murl]);
  });

  it('跳过非 JSON 的 m 属性（页面里还有别的 m= 写法）', () => {
    const html = page('<span class="m" m="not-json">x</span>', iusc(HIT_A));
    expect(parseBingHits(html).map((h) => h.imageUrl)).toEqual([HIT_A.murl]);
  });

  it('只收 http(s) 直链，data: / 相对路径一律丢弃', () => {
    const html = page(
      iusc({ murl: 'data:image/png;base64,AAAA' }),
      iusc({ murl: '/relative/a.jpg' }),
      iusc({ murl: 42 }),
      iusc({ t: '没有 murl' }),
      iusc(HIT_A),
    );
    expect(parseBingHits(html).map((h) => h.imageUrl)).toEqual([HIT_A.murl]);
  });

  it('缺 purl / t 时回落到空串，不编造', () => {
    const [hit] = parseBingHits(page(iusc({ murl: HIT_A.murl })));
    expect(hit).toEqual({ imageUrl: HIT_A.murl, sourceUrl: '', title: '' });
  });

  it('页面上什么都没有 → 空数组（不是抛错）', () => {
    expect(parseBingHits('<html><body>没有结果</body></html>')).toEqual([]);
    expect(parseBingHits('')).toEqual([]);
  });
});

describe('BingReferenceProvider', () => {
  it('按部位各抓一次，每个部位都打上对应 role', async () => {
    const fetchMock = vi.fn().mockImplementation(() => htmlResponse(page(iusc(HIT_A), iusc(HIT_B))));
    vi.stubGlobal('fetch', fetchMock);

    const refs = await new BingReferenceProvider('https://cn.bing.com', 1000, 2).fetch(SCENE);

    // 5 个部位 × 每部位 2 张
    expect(fetchMock).toHaveBeenCalledTimes(REFERENCE_ROLES.length);
    expect(refs).toHaveLength(REFERENCE_ROLES.length * 2);
    for (const role of REFERENCE_ROLES) {
      expect(refs.filter((r) => r.role === role)).toHaveLength(2);
    }
  });

  it('检索词走 URLSearchParams（UTF-8 百分号编码），不是手拼串', async () => {
    const fetchMock = vi.fn().mockImplementation(() => htmlResponse(page()));
    vi.stubGlobal('fetch', fetchMock);

    await new BingReferenceProvider('https://cn.bing.com', 1000, 2).fetch(SCENE);

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/images/search');
    // 中文必须被百分号编码落到 URL 上；手拼串在 Windows 上会踩 GBK 的坑（实测搜出过汽车图）。
    expect(url).toMatch(/%E7%B2%89%E5%BA%95%E6%B6%B2/); // 「粉底液」的 UTF-8 编码
    // 用 searchParams 还原（注意它把空格编成 `+`，decodeURIComponent 不会把 `+` 变回空格）。
    expect(new URL(url).searchParams.get('q')).toBe('粉底液');
  });

  it('★ 检索词按品类词走，且**不含场合词**（带上场合会让 5 个部位返回同一批图）', async () => {
    const fetchMock = vi.fn().mockImplementation(() => htmlResponse(page()));
    vi.stubGlobal('fetch', fetchMock);

    await new BingReferenceProvider('https://cn.bing.com', 1000, 2).fetch(SCENE);

    const queries = fetchMock.mock.calls.map((c) => new URL(String(c[0])).searchParams.get('q'));
    // 每个部位一个查询词，五组互不相同 —— 这正是「按部位分解」的前提。
    expect(new Set(queries).size).toBe(REFERENCE_ROLES.length);
    for (const q of queries) {
      expect(q).not.toContain('面试'); // 场合词一旦进入查询，Bing 会坍缩到它上面
      expect(q).not.toContain('妆容');
    }
  });

  it('★ 抓取失败一律降级为空数组，绝不抛错（否则整个上妆任务会挂）', async () => {
    const cases: Array<[string, () => Promise<Response>]> = [
      ['断网', () => Promise.reject(new Error('网络断了'))],
      ['非 2xx', () => Promise.resolve(new Response('nope', { status: 503 }))],
      ['被拦', () => Promise.resolve(new Response('', { status: 403 }))],
    ];

    for (const [label, impl] of cases) {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(impl));
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const refs = await new BingReferenceProvider('https://cn.bing.com', 1000, 2).fetch(SCENE);
      expect(refs, `${label} 时应回空数组`).toEqual([]);
    }
  });

  it('★ 首次失败会重试一次；重试成功就照常出结果', async () => {
    // 实测本机出站是间歇性的：成窗口地连不上，窗口过后立刻恢复。所以重试要真的生效。
    // 按 **URL** 记「这个部位是不是第一次」——5 个部位是并发的，用全局计数会串味。
    const tried = new Set<string>();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (tried.has(url)) return htmlResponse(page(iusc(HIT_A))); // 重试：这次通
      tried.add(url);
      return Promise.reject(new Error('断了一下')); // 首试：失败
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const refs = await new BingReferenceProvider('https://cn.bing.com', 1000, 2).fetch(SCENE);

    expect(refs).toHaveLength(REFERENCE_ROLES.length);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(REFERENCE_ROLES.length); // 确实重试了
  });

  it('站点返回的 HTML 里没有图 → 空数组，不是抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => htmlResponse('<html>改版了</html>')));
    const refs = await new BingReferenceProvider('https://cn.bing.com', 1000, 2).fetch(SCENE);
    expect(refs).toEqual([]);
  });

  it('基址可配：换站点不该改代码', async () => {
    const fetchMock = vi.fn().mockImplementation(() => htmlResponse(page()));
    vi.stubGlobal('fetch', fetchMock);

    await new BingReferenceProvider('https://mirror.internal:8080', 1000, 2).fetch(SCENE);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /^https:\/\/mirror\.internal:8080\/images\/search/,
    );
  });

  it('标题取不到时回落到「<场合><部位>参考」，不返回空标题', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => htmlResponse(page(iusc({ murl: HIT_A.murl })))),
    );
    const refs = await new BingReferenceProvider('https://cn.bing.com', 1000, 2).fetch(SCENE);
    expect(refs[0]?.title).toBe('面试底妆参考');
    expect(refs.every((r) => r.title.length > 0)).toBe(true);
  });
});

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
