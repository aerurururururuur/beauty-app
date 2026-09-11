/**
 * infrastructure/reference-provider/parse-bing.ts —— 从 Bing 图片搜索结果页的**原始 HTML**
 * 里抠出图片条目。**纯函数、无 IO、无网络** —— 这是本模块唯一能被稳定单测的部分
 * (抓取本身依赖网络、必然不稳定，不进单测，见 README)。
 *
 * 为什么**不需要无头浏览器**(2026-09-11 实测确认)：
 * 结果页把每条结果的元数据塞在 `<a class="iusc" m="{...}">` 的 `m` 属性里，
 * 而属性值内部的引号是 HTML 转义过的 `&quot;` —— 所以 `m="([^"]*)"` 能安全地整段取出，
 * 反转义 + `JSON.parse` 就是结构化数据，**无需执行任何 JS**。
 * 相关字段：`murl` = 图片直链，`purl` = 来源页，`t` = 标题。
 */

/** 从结果页解析出的一条命中。 */
export interface BingHit {
  /** 图片直链。 */
  imageUrl: string;
  /** 来源页 URL；页面没给则为空串。 */
  sourceUrl: string;
  /** 来源页标题；页面没给则为空串。 */
  title: string;
}

/**
 * 匹配 `m="..."` 属性。因为属性值里的引号已被转义成 `&quot;`，
 * 所以 `[^"]*` 不会在中途断掉 —— 这正是这套解析能成立的前提。
 */
const M_ATTR = /m="([^"]*)"/g;

/**
 * 反转义 HTML 实体。
 * `&amp;` 必须**最后**替换：先换它会把 `&amp;quot;` 提前变成 `&quot;`，
 * 让一个本应是字面量的字符串被二次解码成引号。
 */
function unescapeHtml(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * 解析结果页 HTML → 命中列表。**按 `murl` 去重且保持首次出现顺序**。
 * 解析不出任何东西时返回空数组(不是抛错)——「这页没有图」和「这页格式变了」
 * 对调用方是同一件事：拿不到参考图。
 */
export function parseBingHits(html: string): BingHit[] {
  const hits: BingHit[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(M_ATTR)) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(unescapeHtml(match[1] ?? ''));
    } catch {
      // 页面里还有其它 `m=` 属性(如 `class="m"` 的兄弟写法),不是 JSON 就跳过。
      continue;
    }
    if (typeof decoded !== 'object' || decoded === null) continue;

    const rec = decoded as Record<string, unknown>;
    const imageUrl = rec.murl;
    // 只收 http(s) 直链：`data:` / 相对路径喂给 <img> 不是我们想要的东西。
    if (typeof imageUrl !== 'string' || !/^https?:\/\//.test(imageUrl)) continue;
    if (seen.has(imageUrl)) continue;
    seen.add(imageUrl);

    hits.push({
      imageUrl,
      sourceUrl: typeof rec.purl === 'string' ? rec.purl : '',
      title: typeof rec.t === 'string' ? rec.t : '',
    });
  }

  return hits;
}
