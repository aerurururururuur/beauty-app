<template>
  <header class="topbar">
    <div class="topbar__titles">
      <h1 class="topbar__title">数字美妆台</h1>
      <p class="topbar__sub">YSL 全系色号 · 在线试色</p>
    </div>
    <div class="topbar__spacer"></div>

    <!-- 视图切换:默认停在「我的化妆包」 -->
    <div class="vanity-tabs">
      <button class="vanity-tab" :class="{ 'vanity-tab--active': vanity.view === 'bag' }" @click="vanity.setView('bag')">
        我的化妆包
      </button>
      <button class="vanity-tab" :class="{ 'vanity-tab--active': vanity.view === 'all' }" @click="vanity.setView('all')">
        全部产品
      </button>
    </div>

    <label class="searchbox">
      <Icon name="search" :size="18" color="currentColor" />
      <input class="searchbox__input" type="search" placeholder="搜产品 / 色号" />
    </label>
    <div class="ph" style="width: 38px; height: 38px; border-radius: 999px; font-size: 10px">头像</div>
  </header>

  <main class="content content--vanity">
    <!-- 后端那句话原样显示(色号已在包里、配额满、后端不可达…) -->
    <ErrorNote :text="vanity.error" />

    <!-- ★★ 三态的前两态:目录还没回来 / 没回来过。
         目录是这两个视图**共同的地基**,所以它必须在两个 section 之前——
         加载中就把「该分类暂无产品」「这一类都已经在你的化妆包里了」渲染出来,
         正是本仓最怕的形状(界面上看不出区别,只有结果是错的)。 -->
    <div v-if="vanity.catalogLoading" class="vanity-state">
      <div class="vanity-state__art">
        <Icon name="palette" :size="40" color="var(--color-peach)" />
      </div>
      <p class="vanity-state__title">正在取产品目录…</p>
      <p class="vanity-state__sub">产品、色号与产品性质都从后端来,这一屏要等它一下</p>
    </div>

    <div v-else-if="vanity.catalogError" class="vanity-state">
      <div class="vanity-state__art">
        <Icon name="palette" :size="40" color="var(--color-peach)" />
      </div>
      <p class="vanity-state__title">产品目录没能取回来</p>
      <p class="vanity-state__sub">{{ vanity.catalogError }}</p>
      <button class="btn btn--soft vanity-state__action" @click="vanity.loadCatalog()">再试一次</button>
    </div>

    <template v-else>
      <!-- 视图一:我的化妆包 -->
      <section v-show="vanity.view === 'bag'" class="vanity-view">
        <header class="vanity-view__head">
          <div>
            <h2 class="vanity-view__title">我的化妆包</h2>
            <p class="vanity-view__sub">按 YSL 原有目录分好类,标出你手上真实有的那几个色号</p>
          </div>
          <span class="vanity-view__count">
            <em>{{ vanity.bagPieceCount }}</em> 件
            <span class="vanity-view__count-sep">·</span>
            <em>{{ vanity.bagShadeCount }}</em> 色
          </span>
        </header>

        <!-- 已拥有的产品(按目录分组) -->
        <div class="bag-groups">
          <template v-if="vanity.bagGroups.length">
            <section v-for="group in vanity.bagGroups" :key="`${group.groupName}-${group.categoryName}`" class="bag-group">
              <header class="bag-group__head">
                <span class="bag-group__from">{{ group.groupName || '' }}</span>
                <span class="bag-group__name">{{ group.categoryName || '' }}</span>
                <span class="bag-group__meta">{{ group.items.length }} 件 · {{ group.shadeCount }} 色</span>
              </header>
              <div class="bag-grid">
                <article
                  v-for="p in group.items"
                  :key="p.id"
                  class="bag-card"
                  :class="{ 'bag-card--todo': p.needsShades }"
                  @click="vanity.openInAllView(p.id)"
                  @pointerenter="vanity.prefetchDetail(p.id)"
                >
                  <img
                    v-if="!brokenImages.has(p.id)"
                    class="bag-card__thumb"
                    :src="productImageOf(p.id)"
                    alt=""
                    @error="markImageBroken(p.id)"
                  />
                  <div v-else class="bag-card__thumb"></div>
                  <div class="bag-card__body">
                    <span class="bag-card__cat">{{ p.categoryLabel || '' }}</span>
                    <span class="bag-card__name">{{ p.name }}</span>
                    <span class="bag-card__meta">{{ p.text || '' }}</span>
                  </div>

                  <!-- 我有的色号。点 × 只丢这一个色号,产品还留在包里 -->
                  <div v-if="(p.ownedShades || []).length" class="bag-card__shades">
                    <button
                      v-for="s in dotsOf(p)"
                      :key="s.code"
                      class="bag-shade"
                      :title="shadeLabel(s)"
                      :aria-label="`移除色号 ${shadeLabel(s)}`"
                      @click.stop="vanity.dropShade(p.id, s.code)"
                    >
                      <span class="bag-shade__dot" :style="{ background: s.hex }"></span>
                      <span class="bag-shade__code">{{ s.code }}</span>
                    </button>
                    <span v-if="restCountOf(p)" class="bag-shade bag-shade--more">+{{ restCountOf(p) }}</span>
                  </div>
                  <div v-else class="bag-card__shades bag-card__shades--empty">
                    {{ p.hasShades ? '去全部产品里挑色号' : '整件收进,无色号可选' }}
                  </div>

                  <div class="bag-card__foot">
                    <span class="bag-card__count">{{ countTextOf(p) }}</span>
                    <button class="bag-card__del" @click.stop="vanity.dropProduct(p.id)">移出</button>
                  </div>
                </article>
              </div>
            </section>
          </template>

          <div v-else class="bag-empty">
            <div class="bag-empty__art">
              <Icon name="palette" :size="40" color="var(--color-peach)" />
            </div>
            <p class="bag-empty__title">化妆包还空着</p>
            <p class="bag-empty__sub">把你手上的 YSL 收进来,AI 只用你会用的东西给你配色</p>
          </div>
        </div>

        <!-- 页面最下方的新增入口 -->
        <RouterLink class="bag-add" to="/vanity/add">
          <span class="bag-add__plus">＋</span>
          <span class="bag-add__body">
            <span class="bag-add__title">添新宠</span>
            <span class="bag-add__sub">先整件收进包里,色号再去「全部产品」里逐个挑</span>
          </span>
        </RouterLink>
      </section>

      <!-- 视图二:全部分类浏览(左分类 / 中产品 / 右试色) -->
      <section v-show="vanity.view === 'all'" class="vanity-view vanity-view--all">
        <aside class="tree">
          <div class="tree__title">全部分类</div>
          <div v-for="group in vanity.groups" :key="group.id" class="tree__group">
            <div class="tree__group-head">
              <Icon name="arrowDown" :size="12" color="var(--color-text-sub)" />
              <span class="tree__group-name">{{ group.label }}</span>
              <span class="tree__group-count">{{ group.children.length }}</span>
            </div>
            <button
              v-for="c in group.children"
              :key="c.id"
              class="tree__item"
              :class="{ 'tree__item--active': c.id === vanity.activeCategoryId }"
              @click="vanity.selectCategory(c.id)"
            >
              {{ c.label }}
            </button>
          </div>
        </aside>

        <section class="product-area">
          <div class="crumb">
            <span>彩妆 / 护肤</span>
            <span class="crumb__sep">/</span>
            <strong>{{ vanity.activeCategoryName }}</strong>
            <span class="crumb__count">{{ productCountText }}</span>
          </div>

          <div v-if="!vanity.categoryProducts.length" class="empty">该分类暂无产品</div>
          <div v-else class="product-grid">
            <button
              v-for="p in vanity.categoryProducts"
              :key="p.id"
              class="product-card"
              :class="{ 'product-card--active': p.id === vanity.activeProductId }"
              @click="vanity.selectProduct(p.id)"
              @pointerenter="vanity.prefetchDetail(p.id)"
            >
              <img
                v-if="!brokenImages.has(p.id)"
                class="product-card__thumb"
                :src="productImageOf(p.id)"
                alt=""
                @error="markImageBroken(p.id)"
              />
              <div v-else class="product-card__thumb"></div>
              <div class="product-card__name">{{ p.name }}</div>
              <div class="product-card__texture">{{ p.text || '' }}</div>
              <div class="product-card__shades" :class="{ 'product-card__shades--none': !p.hasShades }">
                {{ shadeTextOf(p) }}
              </div>
            </button>
          </div>
        </section>

        <aside class="shade-panel">
          <img
            v-if="shadeImageSrc && !brokenImages.has(shadeImageSrc)"
            class="shade-panel__preview"
            :src="shadeImageSrc"
            alt=""
            @error="markImageBroken(shadeImageSrc)"
          />
          <div v-else class="shade-panel__preview ph">试色预览</div>
          <div class="shade-panel__name">{{ vanity.activeProduct?.name || '' }}</div>
          <div class="shade-panel__picked">
            {{ vanity.activeShade ? shadeLabel(vanity.activeShade) : '暂无色号' }}
          </div>

          <!-- 色系标签(色调 / 明度 / 饱和度)。★「色号待补」那一段删了:占位色号随
               `kb/shades.js` 一起没了,今天每一行的色调都是真数据。 -->
          <div v-if="vanity.activeShade" class="shade-detail">
            <span class="shade-detail__tag">{{ vanity.activeShade.tone }}</span>
            <span v-if="vanity.activeShade.lightness" class="shade-detail__tag">
              {{ vanity.activeShade.lightness }}
            </span>
            <span v-if="vanity.activeShade.saturation" class="shade-detail__tag">
              {{ vanity.activeShade.saturation }}
            </span>
            <span v-if="vanity.activeShade.hexApprox" class="shade-detail__note">
              色值为按官方色调描述推导的近似值
            </span>
          </div>

          <!-- ★★ 产品性质:一个列表,一个 key 一行(2026-10-01 用户拍板,原来是分两段的)。
               ⚠️ 明知故犯的代价:一行里混着品牌原文与手写层那句,读的人分不出哪句是品牌说的
                 —— 分两段本来就是为这个。别再把两个标题加回来。
               标题不再写「品牌资料」:它现在盖着两处来源的话。
               来源是 `GET /api/products/:id`(点开这一件时才取,取到就缓存)。 -->
          <p v-if="vanity.detailLoading" class="prod-info prod-info--busy">正在取这件产品的资料…</p>
          <p v-else-if="vanity.detailError" class="prod-info prod-info--fail">{{ vanity.detailError }}</p>
          <div v-else-if="infoRows.length" class="prod-info">
            <div class="prod-info__title">为什么选它</div>
            <div v-for="row in infoRows" :key="row.key" class="prod-info__row">
              <span class="prod-info__k">{{ row.label }}</span>
              <span class="prod-info__v">{{ row.text }}</span>
            </div>
          </div>

          <div class="shade-panel__head">
            <span>色号</span>
            <span class="shade-panel__count">{{ vanity.shades.length }} 色</span>
          </div>

          <div v-if="vanity.shades.length" class="tone-filter">
            <button
              v-for="t in vanity.toneFilters"
              :key="t.key"
              class="tone-chip"
              :class="{ 'tone-chip--active': t.key === vanity.activeTone }"
              @click="vanity.setTone(t.key)"
            >
              {{ t.label }}<em>{{ t.count }}</em>
            </button>
          </div>

          <!-- 两种「没有」是两件事:这件产品压根不分类色号 / 这一类色调下没有 -->
          <div v-if="!vanity.shades.length" class="empty">这件产品没有色号,整件收进化妆包就好</div>
          <div v-else-if="!vanity.visibleShades.length" class="empty">该色调下暂无色号</div>
          <div v-else class="shade-grid">
            <button
              v-for="s in vanity.visibleShades"
              :key="s.code"
              class="shade-chip"
              :class="{
                'shade-chip--active': s.code === vanity.activeShade?.code,
                'shade-chip--bag': vanity.isOwnedShade(s.code),
              }"
              :title="shadeLabel(s) + (vanity.isOwnedShade(s.code) ? '(已在化妆包)' : '')"
              @click="vanity.selectShade(s.code)"
            >
              <span class="shade-chip__swatch" :style="{ background: s.hex }">
                <span
                  class="shade-chip__code"
                  :style="{ color: isLightHex(s.hex) ? 'var(--color-shade-text-dark)' : 'var(--color-white)' }"
                >
                  {{ s.code }}
                </span>
                <span v-if="vanity.isOwnedShade(s.code)" class="shade-chip__dot"></span>
              </span>
              <span class="shade-chip__name">{{ s.name || '' }}</span>
            </button>
          </div>

          <div class="shade-panel__actions">
            <button
              v-if="vanity.activeShade"
              class="btn"
              :class="vanity.activeShadeOwned ? 'btn--done' : 'btn--primary'"
              :disabled="vanity.busy"
              @click="vanity.toggleActiveShade()"
            >
              {{ vanity.activeShadeOwned ? '已在化妆包 · 点此移出' : '收进我的色号' }}
            </button>
          </div>
        </aside>
      </section>
    </template>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { productImageOf, shadeImageOf } from '@/api/vanity'
import ErrorNote from '@/components/ErrorNote.vue'
import Icon from '@/components/Icon.vue'
import { useUserStore } from '@/stores/user'
import { useVanityStore } from '@/stores/vanity'

/**
 * 数字美妆台。两个视图:
 *   bag —— 我的化妆包(默认首屏:先看到「我手上真实有的」)
 *   all —— 全部产品(左分类 / 中产品 / 右试色)
 *
 * ★★ 目录(分类树 / 产品卡 / 色号 / 产品性质)现在**来自后端** `GET /api/products`,
 *   与化妆包(`/cabinet/items`)一样要等一个来回。所以这一屏是**三态**:
 *   加载中 / 目录没拉回来(整屏一句人话 + 再试一次) / 有数据。
 *   `onMounted` 里那句 `await vanity.load(...)` **不能漏 await**——漏了就会在目录还是空的时候
 *   渲染出「该分类暂无产品」,而那句话说的事没发生。
 *
 * ★ 色号面板与切分类是**同步**的(整库一次拉回来之后就都在内存里),只有化妆包的增删要等后端
 *   ——那两处按钮走 `vanity.busy`。
 *
 * ★ 卡片上的 `×` / 「移出」按钮**必须 stopPropagation**:
 *   整张卡也是可点区域(点了切到「全部产品」看这一件),不挡住就会「想删色号却跳走」。
 *
 * ★ 产品性质那一块**点开某一件时才取**(后端把六维原文放在单条详情那条口上,整库带着它
 *   payload 会翻几倍),所以它自己有加载态与失败态;失败**不挡**色号面板。
 */
const user = useUserStore()
const vanity = useVanityStore()

/**
 * 取不到图的产品 id / 图片 URL。★ 缺图是**常态**(大量产品本来就没有图),
 * 所以回落的是那个本来就摆着的占位块,不是破图、也不代用同类别的图。
 * DEV 下把没取到的喊一声——否则「路径写错了」与「这条本来就没图」在界面上长得一样。
 */
const brokenImages = ref(new Set())

function markImageBroken(key) {
  brokenImages.value.add(key)
  if (import.meta.env.DEV) console.warn('[美妆台] 产品图没取到:', key)
}

/** 当前选中色号的试色图。没选色号 → 空串 → 走那个占位块。 */
const shadeImageSrc = computed(() =>
  vanity.activeShade ? shadeImageOf(vanity.activeProductId, vanity.activeShade.code) : ''
)

/** 一张化妆包卡片上最多摆几个色号,多出来的折成「+N」。 */
const MAX_BAG_DOTS = 5

onMounted(async () => {
  await vanity.load(user.id)
})

/* -------------------- 化妆包卡片的派生 -------------------- */

function dotsOf(p) {
  return (p.ownedShades || []).slice(0, MAX_BAG_DOTS)
}

function restCountOf(p) {
  return Math.max(0, (p.ownedShades || []).length - MAX_BAG_DOTS)
}

/**
 * 这张卡上的色号计数。三种说法对应三种真实状态,别合成一句:
 * 有色的报数量;这件产品**不分类色号**(睫毛膏/精华)照实说;其余是还没挑。
 */
function countTextOf(p) {
  if ((p.ownedShades || []).length) return `我有 ${p.ownedShades.length} / ${p.shadeCount} 色`
  return p.hasShades ? '还没挑色号' : '无色号产品'
}

/** 产品卡上那一行色号文案。★ `hasShades === false` 是「这件没有色号这回事」,不是"待补"。 */
function shadeTextOf(p) {
  return p.hasShades ? `${p.shadeCount} 色` : '无色号'
}

/* -------------------- 色号色块 -------------------- */

/** 色号名与代号不同时才并列显示,不然会写成「#21 · #21」。 */
function shadeLabel(s) {
  return s.name && s.name !== s.code ? `${s.code} · ${s.name}` : s.code
}

/** 浅底色上用深字、深底色上用白字。算的是感知亮度,不是简单的中值。 */
function isLightHex(hex = '') {
  const m = String(hex).replace('#', '')
  if (m.length !== 6) return false
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 165
}

const productCountText = computed(() => `共 ${vanity.categoryProducts.length} 个产品`)

/**
 * 信息面板那几行:**品牌原文在前,手写层那句接在同一行后面**。
 * ★ 一个 key 只出一行(两边都有「质地/妆效」这类重叠 key,不合并就会同一格写两遍)。
 * ★ 顺序照品牌那份走,品牌没有的 key 追加在后面。标签与取舍由服务端给。
 */
const infoRows = computed(() => {
  const byKey = new Map((vanity.productInfo?.dimensions || []).map((row) => [row.key, { ...row }]))
  for (const row of vanity.productInfo?.wording || []) {
    const hit = byKey.get(row.key)
    if (hit) hit.text = `${hit.text} ${row.text}`
    else byKey.set(row.key, { ...row })
  }
  return [...byKey.values()]
})
</script>
