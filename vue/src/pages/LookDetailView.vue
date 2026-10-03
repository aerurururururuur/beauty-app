<template>
  <FlowTopbar back-to="/looks" title="这一版妆容档案" />

  <main class="content content--flow">
    <ErrorNote :text="error" />

    <!-- ★ 三态分开：读的过程中不许渲染成「没有这一版」（那会把"还没回来"说成"被删了"） -->
    <p v-if="loading" class="detail-hint">正在读这一版妆容…</p>

    <template v-else-if="look">
      <section class="result-hero">
        <div class="result-hero__shots">
          <!-- ★ 封面是**档案自己那一份字节**（存档时复制过来的），不是会话里那张的引用 -->
          <img
            v-if="!coverBroken"
            class="shot"
            :src="coverSrc"
            :alt="`「${look.styleName}」的封面`"
            @error="coverBroken = true"
          />
          <!-- 字节读不到时**不摆破图**：说清是封面没了，方案本身还在 -->
          <div v-else class="cover-missing ph"><span>这一版的封面图读不到了</span></div>
        </div>

        <div class="result-hero__info">
          <span class="result-hero__scene">{{ look.sceneName }}</span>
          <h1 class="result-hero__title">{{ look.styleName }}</h1>
          <p class="result-hero__summary">{{ description }}</p>

          <div class="result-hero__kw">
            <span v-for="k in look.keywords" :key="k" class="kw-chip">{{ k }}</span>
          </div>

          <!-- 色板 / 推荐产品：**为空时整块不渲染**（空壳会让人以为颜色/产品丢了） -->
          <div v-if="palette.length" class="result-hero__palette-label">这一版用到的颜色</div>
          <div v-if="palette.length" class="result-hero__palette">
            <span v-for="p in palette" :key="p.code || p.name" class="palette-chip" :title="p.name || ''">
              <span class="palette-chip__dot" :style="{ background: p.hex }"></span>
              <span class="palette-chip__code">{{ p.code || p.name }}</span>
              <span v-if="p.code && p.name" class="palette-chip__from">{{ p.name }}</span>
            </span>
          </div>

          <div v-if="products.length" class="result-hero__products">
            <span class="result-hero__products-label">推荐产品</span>
            <span v-for="p in products" :key="`${p.pid}-${p.code || ''}`" class="step-product">
              <span v-if="p.hex" class="step-product__dot" :style="{ background: p.hex }"></span>
              <span class="step-product__name">{{ p.name }}</span>
              <span v-if="p.code" class="step-product__code">{{ p.code }}</span>
            </span>
          </div>

          <div class="result-hero__meta">
            <span class="meta-cell"><em>{{ look.stepCount }}</em>个步骤</span>
            <span class="meta-cell">{{ (look.createdAt || '').slice(0, 10) }} 存下</span>
          </div>

          <div class="result-hero__actions">
            <RouterLink class="btn btn--soft" to="/looks">回我的妆容档案</RouterLink>
            <RouterLink class="btn btn--soft" to="/vanity">去美妆台看产品</RouterLink>
          </div>
        </div>
      </section>

      <nav class="step-rail" aria-label="妆容步骤导航">
        <div class="step-rail__head">
          <span class="step-rail__title">化妆步骤 · 共 {{ steps.length }} 步</span>
        </div>
        <div class="step-rail__list">
          <a
            v-for="(s, i) in steps"
            :key="s.id"
            class="step-rail__item"
            :class="{ 'step-rail__item--active': s.id === activeStepId }"
            :href="`#step-${s.id}`"
            @click.prevent="jumpToStep(s.id)"
          >
            <span class="step-rail__no">{{ stepNo(i) }}</span>
            <span class="step-rail__name">{{ s.name }}</span>
          </a>
        </div>
      </nav>

      <div class="step-list">
        <section
          v-for="(s, i) in steps"
          :id="`step-${s.id}`"
          :key="s.id"
          ref="stepEls"
          class="step-block"
          :data-step="s.id"
        >
          <!-- ★ 步骤块左边**只有正文**：档案里没有逐步累积图（那些图随会话 24h 一起删了） -->
          <div class="step-block__body">
            <header class="step-block__head">
              <span class="step-block__index">STEP {{ stepNo(i) }}</span>
              <h3 class="step-block__title">{{ s.name }}</h3>
            </header>
            <p class="step-block__desc">{{ s.desc || '' }}</p>

            <ul v-if="(s.tips || []).length" class="step-tips">
              <li v-for="t in s.tips" :key="t" class="step-tip">
                <Icon name="check" :size="14" /><span>{{ t }}</span>
              </li>
            </ul>
          </div>
        </section>
      </div>

      <section v-if="personalized.length" class="personalized">
        <h2 class="personalized__title">针对面部特征的调整 · {{ personalized.length }} 条</h2>
        <div class="personalized__list">
          <article v-for="f in personalized" :key="f.id" class="feat-card">
            <header class="feat-card__head">
              <span class="feat-card__group">{{ f.groupName || '' }}</span>
              <h3 class="feat-card__name">{{ f.name }}</h3>
            </header>
            <p class="feat-card__desc">{{ f.desc }}</p>
            <p class="feat-card__fix">{{ f.fix }}</p>
            <div v-if="(f.products || []).length" class="feat-card__products">
              <span class="step-block__label">用到</span>
              <span v-for="n in f.products" :key="n" class="step-product">
                <span class="step-product__name">{{ n }}</span>
              </span>
            </div>
          </article>
        </div>
      </section>

      <section v-if="products.length" class="product-summary">
        <h2 class="product-summary__title">推荐产品</h2>
        <ul class="product-summary__list">
          <li v-for="(p, i) in products" :key="`${p.pid}-${p.code || ''}`" class="product-line">
            <span class="product-line__no">{{ stepNo(i) }}</span>
            <span class="product-line__name">{{ p.name }}</span>
            <span class="product-line__code">{{ p.code || '—' }}</span>
          </li>
        </ul>
      </section>
    </template>

    <template v-else>
      <p class="detail-hint">这一版不在你的妆容档案里，可能已经被删掉了。</p>
      <RouterLink class="btn btn--soft" to="/looks">回我的妆容档案</RouterLink>
    </template>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ErrorNote from '@/components/ErrorNote.vue'
import FlowTopbar from '@/components/FlowTopbar.vue'
import Icon from '@/components/Icon.vue'
import { listLooks, lookCoverHref } from '@/api/looks'
import { useRouteParam } from '@/composables/useQueryParam'
import { useStepRail } from '@/composables/useStepRail'
import { useUserStore } from '@/stores/user'

/**
 * 这一版妆容档案的详情页。数据就是 `/looks` 列表里的那一行（`toLookView` 已经把整套方案带回
 * 来了），所以**没有单条详情端点**——进来重新拉一次列表按 id 取那一条。
 *
 * ★ 版式整套复用 `flow.css` 里 `/result` 那套类（`.result-hero*` / `.step-block*` /
 *   `.product-summary`），看起来是同一屏；**`ResultView.vue` 一个字都没动**。
 * ⚠️ 两处**故意不摆**：逐步累积图（那些图跟着会话 24h 一起删了，档案里没有）、
 *   出图与读图入口（档案是"看存下来的这一版"，不是再生成一次）。
 */
const user = useUserStore()

const lookId = useRouteParam('id')
const look = ref(null)
const loading = ref(true)
const error = ref('')
/** 封面字节读不到（被带外删掉）时置真：摆一句人话，不摆破图。 */
const coverBroken = ref(false)

const description = computed(() => look.value?.lookDescription || look.value?.summary || '')
const palette = computed(() => look.value?.palette || [])
const products = computed(() => look.value?.products || [])
const steps = computed(() => look.value?.steps || [])
const personalized = computed(() => look.value?.personalized || [])
const coverSrc = computed(() => lookCoverHref(look.value?.coverUrl, user.id))

const { activeId: activeStepId, els: stepEls, jumpTo: jumpToStep } = useStepRail(look, steps)

function stepNo(index) {
  return String(index + 1).padStart(2, '0')
}

onMounted(async () => {
  try {
    const items = await listLooks({ userId: user.id })
    look.value = items.find((it) => it.id === lookId.value) || null
  } catch (e) {
    // ★ 读不到就照实说，不把「没读到」渲染成「没有这一版」
    error.value = e?.message || '没能读到这一版妆容，请稍后再试'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.detail-hint {
  padding: 32px 0;
  color: var(--color-text-sub);
  font-size: 14px;
}

/* 封面读不到时占这一列的位置（`.shot` 是给 `<img>` 的，div 用不上 object-fit） */
.cover-missing {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
}
</style>
