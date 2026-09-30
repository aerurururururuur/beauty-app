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
              >
                <div class="bag-card__thumb"></div>
                <div class="bag-card__body">
                  <span class="bag-card__cat">{{ p.categoryName || '' }}</span>
                  <span class="bag-card__name">{{ p.name }}</span>
                  <span class="bag-card__meta">{{ p.texture || p.desc || '' }}</span>
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
                  {{ p.hasShades === false ? '整件收进,无色号可选' : '去全部产品里挑色号' }}
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
        <div v-for="group in vanity.tree" :key="group.name" class="tree__group">
          <div class="tree__group-head">
            <Icon name="arrowDown" :size="12" color="var(--color-text-sub)" />
            <span class="tree__group-name">{{ group.name }}</span>
            <span class="tree__group-count">{{ group.children.length }}</span>
          </div>
          <button
            v-for="c in group.children"
            :key="c.id"
            class="tree__item"
            :class="{ 'tree__item--active': c.id === vanity.activeCategoryId }"
            @click="vanity.selectCategory(c.id)"
          >
            {{ c.name }}
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
          >
            <div class="product-card__thumb"></div>
            <div class="product-card__name">{{ p.name }}</div>
            <div class="product-card__texture">{{ p.texture || p.desc || '' }}</div>
            <div class="product-card__shades" :class="{ 'product-card__shades--pending': p.hasShades === false }">
              {{ p.hasShades === false ? '色号待补' : p.shadeCount ? `${p.shadeCount} 色` : '无色号' }}
            </div>
          </button>
        </div>
      </section>

      <aside class="shade-panel">
        <div class="shade-panel__preview ph">试色预览</div>
        <div class="shade-panel__name">{{ vanity.activeProduct?.name || '' }}</div>
        <div class="shade-panel__picked">
          {{ vanity.activeShade ? shadeLabel(vanity.activeShade) : '暂无色号' }}
        </div>

        <!-- 色系标签(暖调 / 明度 / 饱和度) -->
        <div v-if="vanity.activeShade && vanity.activeShade.tone === '待补'" class="shade-detail shade-detail--pending">
          该产品的色号尚未收录进色号库,后端补齐后会自动替换
        </div>
        <div v-else-if="vanity.activeShade" class="shade-detail">
          <span class="shade-detail__tag">{{ vanity.activeShade.tone }}</span>
          <span class="shade-detail__tag">{{ vanity.activeShade.lightness }}</span>
          <span class="shade-detail__tag">{{ vanity.activeShade.saturation }}</span>
          <span v-if="vanity.activeShade.hexApprox" class="shade-detail__note">
            色值为按官方色调描述推导的近似值
          </span>
        </div>

        <!-- 产品性质(来自本地知识库,不是模型现场编的) -->
        <div v-if="infoRows.length" class="prod-info">
          <div class="prod-info__title">为什么选它</div>
          <div v-for="[k, v] in infoRows" :key="k" class="prod-info__row">
            <span class="prod-info__k">{{ k }}</span>
            <span class="prod-info__v">{{ v }}</span>
          </div>
          <p v-if="vanity.productInfo.voice" class="prod-info__voice">
            用户口碑 · {{ vanity.productInfo.voice }}
          </p>
        </div>

        <div class="shade-panel__head">
          <span>色号</span>
          <span class="shade-panel__count">{{ vanity.shades.length }} 色</span>
        </div>

        <div class="tone-filter">
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

        <div v-if="!vanity.visibleShades.length" class="empty">该色调下暂无色号</div>
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
  </main>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import ErrorNote from '@/components/ErrorNote.vue'
import Icon from '@/components/Icon.vue'
import { useUserStore } from '@/stores/user'
import { useVanityStore } from '@/stores/vanity'

/**
 * 数字美妆台。两个视图:
 *   bag —— 我的化妆包(默认首屏:先看到「我手上真实有的」)
 *   all —— 全部产品(左分类 / 中产品 / 右试色)
 *
 * ★ 目录(分类树 / 产品 / 色号 / 产品性质)来自本地知识库,是**同步**的;
 *   只有化妆包(`bagGroups` / 增删)走真后端 `/cabinet/items`。见 `api/vanity.js` 的文件头。
 *
 * ★ 化妆包的增删**要等后端**,所以按钮走 `vanity.busy`;切分类、挑色号是纯展示,不等。
 *
 * ★ 卡片上的 `×` / 「移出」按钮**必须 stopPropagation**:
 *   整张卡也是可点区域(点了切到「全部产品」看这一件),不挡住就会「想删色号却跳走」。
 */
const user = useUserStore()
const vanity = useVanityStore()

/** 一张化妆包卡片上最多摆几个色号,多出来的折成「+N」。 */
const MAX_BAG_DOTS = 5

onMounted(() => {
  vanity.load(user.id)
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
 * 有色的报数量;收录了但没色号的报「无色号产品」;还没收录的报「还没挑色号」。
 */
function countTextOf(p) {
  if ((p.ownedShades || []).length) return `我有 ${p.ownedShades.length} / ${p.shadeCount} 色`
  if (p.hasShades === false) return '无色号产品'
  return '还没挑色号'
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

/** 产品性质四行。空值的行不渲染(后端没收录就不编)。 */
const infoRows = computed(() => {
  const info = vanity.productInfo
  if (!info) return []
  return [
    ['质地 / 妆效', info.texture],
    ['适用肤质', info.skin],
    ['适用天气 / 场景', info.weather],
    ['成分预警', info.warning],
  ].filter(([, v]) => v)
})
</script>
