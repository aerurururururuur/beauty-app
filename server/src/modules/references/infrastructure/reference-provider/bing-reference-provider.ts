/**
 * infrastructure/reference-provider/bing-reference-provider.ts —— ReferenceProvider 的检索实现。
 *
 * **为什么是 Bing**(2026-09-11 实测，记录见 docs/plan/)：
 *   Google 在大陆 `exit=35`(TLS 握手被重置)、Pinterest `exit=28`(TCP 层丢包)，两者**都不可达**；
 *   `cn.bing.com`(Bing 中国版)走原始 HTML 就能拿到结果页、`murl` 全在页面里、无需 JS 渲染，
 *   且实测**连发 5 次不限流、图片无防盗链**。所以主源选它。
 *   ⚠️ 这是**网络可达性**的取舍，与素材版权是两件事——落到的是什么源见 README「已知代价」。
 *
 * **基址可配**：`REFERENCE_BASE_URL`(config) → 构造参数。因为部署环境(如魔搭)的出站策略
 *   与本机不同，换站点/换镜像/换自建代理都不该动代码。
 *
 * **失败一律降级为空数组，绝不抛错**——见 `fetchRole` 里的说明，这条是本文件最重要的约定。
 */
import type { SceneDescriptor } from '../../../shared/index.js';
import { SCENE_RULES } from '../../../shared/index.js';
import { REFERENCE_ROLES } from '../../domain/entities/reference.js';
import type { ReferenceImage, ReferenceRole } from '../../domain/entities/reference.js';
import type { ReferenceProvider } from '../../domain/ports/reference-provider.js';
import { parseBingHits } from './parse-bing.js';

/** 缺省基址：Bing 中国版。大陆可直连，这也是选它的原因。 */
export const DEFAULT_BASE_URL = 'https://cn.bing.com';

/** 缺省超时。参考图是增强项，慢到 5 秒还不回就该空着走完流水线。 */
export const DEFAULT_TIMEOUT_MS = 5000;

/** 每个部位最多取几张。5 个部位 × 2 = 最多 10 条，够结果页展示且不至于刷屏。 */
export const DEFAULT_PER_ROLE = 2;

/**
 * 单次检索的重试次数。
 *
 * ★ 2026-09-11 实测本机出站是**间歇性**的：同一进程内连打 100 次全成功(p50 203ms)，
 *   但会**成窗口地**连不上 —— 实测撞到三次，特征是 `ConnectTimeoutError` / 请求被 abort，
 *   窗口过后立刻恢复(重试的那次往往就成了)。这不是 Bing 限流(没有 429/403)，
 *   是链路层的一阵抖。所以**一次失败不代表站点不可用，值得再试一次**。
 *   代价：真.断网时每个任务的参考检索阶段会从 5s 变成约 `2 × timeout + 400ms`。
 */
const ATTEMPTS = 2;

/** 重试前的等待。抖通常很短，等太久不如让整条流水线先走完。 */
const RETRY_DELAY_MS = 400;

/** 标题过长会撑破结果页卡片。 */
const TITLE_MAX = 48;

/**
 * 部位 → **检索词**。这是本文件里最需要解释的一张表。
 *
 * ★ 2026-09-11 实测(记录见 docs/plan/)：**不能用部位名自己当检索词**。
 *   实测两轮，同一批查询：
 *     `底妆`   → 砂糖橘(1 条)          `底妆 妆容` → 反洗钱(FATF)英文文件
 *     `底妆 粉底` → 电击棍 / 大众汽车电子件(两轮结果还不一样)
 *     `眼影 妆容` → 毛泽东画像壁纸       `foundation makeup` → 教学设备
 *   而改成**具体的品类名词**后，两轮结果都稳定且对题：
 *     `粉底液` → 香奈儿粉底液          `唇膏` → DIOR 润唇膏
 *     `眼影`   → 眼影粉质评测/画法公式   `腮红` → 腮红画法
 *     `眉毛`   → 28 种眉型详解/修眉教程  `口红` → 口红排行榜
 *   规律：Bing 对**抽象部位词与复合词**会漂移甚至返回完全无关的结果，对**具体品类词**稳定。
 *
 * ⚠️ 所以这里存的是「能搜出东西的词」，不是「部位名」。`role` 仍然是部位名(UI 上要显示的部位)，
 *    两者刻意分开 —— 别为了少一张表就把 `role` 直接当查询词用，那是实测过的错。
 */
const ROLE_QUERY: Record<ReferenceRole, string> = {
  底妆: '粉底液',
  眉: '眉毛',
  眼影: '眼影',
  颊: '腮红',
  唇: '口红',
};

/**
 * 浏览器 UA。实测用这个 UA 能拿到完整结果页；默认的 Node UA 可能被判定成爬虫。
 * 这不是"绕过检测"——我们请求的是公开搜索结果页，带上 UA 只是别让站点以为收到的是异常客户端。
 */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export class BingReferenceProvider implements ReferenceProvider {
  readonly name = 'bing';

  constructor(
    private readonly baseUrl: string = DEFAULT_BASE_URL,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
    private readonly perRole: number = DEFAULT_PER_ROLE,
  ) {}

  async fetch(scene: SceneDescriptor): Promise<ReferenceImage[]> {
    // 5 个部位并发。实测单次请求 ~220ms，串行也就 1 秒出头，但并发让超时预算更好算。
    const perRole = await Promise.all(REFERENCE_ROLES.map((role) => this.fetchRole(scene, role)));
    return perRole.flat();
  }

  /**
   * 抓一个部位。**任何失败都降级为空数组，绝不向上抛。**
   *
   * 这条约定是刻意的：`jobs/run-pipeline.ts` 调用本端口时**没有 try/catch**，
   * 异常会一路走到流水线的 catch 并把整个任务标成 failed。参考图是**增强项**——
   * 检索站点限流/超时/改版都不该让用户拿不到成品图。结果页参考区本来就是
   * `v-if="references.length"`，空数组是一条能走通的正常状态(`off` provider 就是恒返回空)。
   */
  private async fetchRole(scene: SceneDescriptor, role: ReferenceRole): Promise<ReferenceImage[]> {
    let html: string;
    try {
      html = await this.getHtml(this.searchUrl(role));
    } catch (err) {
      console.warn(
        `[references] 部位「${role}」检索失败，降级为空：${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }

    const hits = parseBingHits(html).slice(0, Math.max(0, this.perRole));
    const retrievedAt = new Date().toISOString();
    const sceneCn = SCENE_RULES[scene.label].cn;

    return hits.map((hit, i) => ({
      id: `ref-${scene.label}-${role}-${i + 1}`,
      title: (hit.title.trim() || `${sceneCn}${role}参考`).slice(0, TITLE_MAX),
      imageUrl: hit.imageUrl,
      // 来源页缺了不编：留空会让这条记录失去出处，但编一个 URL 更糟。
      sourceUrl: hit.sourceUrl,
      role,
      retrievedAt,
    }));
  }

  /**
   * 检索词 = 该部位的**品类词**(见 `ROLE_QUERY`)。
   *
   * ★ **刻意不带场合词。** 产品上想要「场合 → 检索词」，但实测这条路是坏的：
   *   带上场合后 Bing 会把查询**坍缩到那个主导词**上 ——
   *   `面试 底妆 妆容` / `面试 眉 妆容` / `面试 眼影 妆容` … 五组返回的图**完全相同**
   *   (前 10 张两两 Jaccard = 1.00)，且都是面试场景图、不是妆容图。
   *   也就是说：场合词一进来，「按部位分解」这个前提就没了 ——
   *   结果会把同一张图贴五个不同的部位标签，比不给图更糟。
   *   同理 `底妆 妆容 面试` 这类三词组合实测直接返回无关内容。
   *   场合对参考图的影响因此**不再走检索词**，场合仍由 `scene-rules` 决定妆容方向(那部分没变)。
   *
   * `URLSearchParams` 负责百分号编码(UTF-8)——实测必须走它，
   * 手工拼串在 Windows 上会踩 GBK 编码的坑(搜出过汽车图)。
   */
  private searchUrl(role: ReferenceRole): string {
    const url = new URL('/images/search', this.baseUrl);
    url.searchParams.set('q', ROLE_QUERY[role]);
    return url.toString();
  }

  /** 取结果页。失败会重试(见 `ATTEMPTS`)，重试仍失败才把错误抛给 `fetchRole` 去降级。 */
  private async getHtml(url: string): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) {
          throw new Error(`检索站点返回 ${res.status}`);
        }
        return await res.text();
      } catch (err) {
        lastErr = err;
        if (attempt < ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }
    throw lastErr;
  }
}
