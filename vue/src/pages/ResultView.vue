<template>
  <FlowTopbar
    back-to="/form"
    title="生成结果"
    :steps="['1 选场景', '2 选形象', '3 填信息', '4 生成方案']"
    :active-step="4"
  />

  <main v-if="result" class="content content--flow">
    <section class="result-hero">
      <div class="result-hero__shots">
        <!-- 两张都是占位块:本地算得出方案,算不出一张脸(见文件头) -->
        <div class="shot shot--before ph" style="height: 320px">妆前 · 原图占位</div>
        <div class="shot shot--after ph" style="height: 320px">妆后 · 效果占位</div>
        <span class="result-hero__arrow"><Icon name="arrowRight" :size="16" color="var(--color-white)" /></span>
      </div>

      <div class="result-hero__info">
        <span class="result-hero__scene">{{ result.sceneName }} · {{ result.tagline }}</span>
        <h1 class="result-hero__title">{{ result.title }}</h1>
        <p class="result-hero__summary">{{ result.summary }}</p>

        <div class="result-hero__kw">
          <span v-for="k in result.keywords" :key="k" class="kw-chip">{{ k }}</span>
        </div>

        <div class="result-hero__palette-label">本方案用到的色号</div>
        <div class="result-hero__palette">
          <span v-for="p in result.palette" :key="p.code" class="palette-chip" :title="p.name || ''">
            <span class="palette-chip__dot" :style="{ background: p.hex }"></span>
            <span class="palette-chip__code">{{ p.code || p.name }}</span>
            <span v-if="p.name" class="palette-chip__from">{{ p.name }}</span>
          </span>
        </div>

        <div class="result-hero__meta">
          <span class="meta-cell"><em>{{ result.meta.stepCount }}</em>个步骤</span>
          <span class="meta-cell"><em>{{ result.meta.minutes }}</em>分钟</span>
          <span class="meta-cell"><em>{{ result.meta.level }}</em></span>
        </div>

        <div class="result-hero__actions">
          <button class="btn btn--primary" :disabled="saved" @click="onSave">
            {{ saved ? '已记下这一版' : '保存妆容' }}
          </button>
          <button class="btn btn--soft" @click="onRegenerate">换一版</button>
          <RouterLink class="btn btn--soft" to="/vanity">去美妆台看产品</RouterLink>
        </div>
      </div>
    </section>

    <section class="style-switch">
      <div class="style-switch__head">
        <span class="style-switch__title">换一个妆容风格</span>
        <span class="style-switch__note">不同风格的步骤数量与顺序本来就不同，切一下就能看到变化</span>
      </div>
      <div class="style-switch__list">
        <button
          v-for="o in design.styleOptions"
          :key="o.id"
          class="style-chip"
          :class="{ 'style-chip--active': o.id === result.styleId }"
          :title="o.summary || ''"
          @click="o.id !== result.styleId && applyStyle(o.id)"
        >
          <span class="style-chip__name">{{ o.name }}</span>
          <span class="style-chip__meta">{{ o.family }} · {{ o.stepCount }} 步</span>
        </button>
      </div>
    </section>

    <nav class="step-rail" aria-label="妆容步骤导航">
      <div class="step-rail__head">
        <span class="step-rail__title">化妆步骤 · 共 {{ steps.length }} 步</span>
        <span class="step-rail__note">步骤与顺序由本次妆容风格决定，会随风格变化</span>
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
        <div class="step-block__media">
          <div class="shot ph" style="height: 260px">{{ s.name }} · 效果图占位</div>
          <span class="step-block__no">{{ stepNo(i) }}</span>
          <span class="step-block__name-tag">{{ s.name }}</span>
        </div>
        <div class="step-block__body">
          <header class="step-block__head">
            <span class="step-block__index">STEP {{ stepNo(i) }}</span>
            <h3 class="step-block__title">{{ s.name }}</h3>
            <span v-if="s.duration" class="step-block__dur">
              <Icon name="clock" :size="14" color="var(--color-text-disabled)" />
              <span>{{ s.duration }}</span>
            </span>
          </header>
          <p class="step-block__desc">{{ s.desc || '' }}</p>

          <ul v-if="(s.tips || []).length" class="step-tips">
            <li v-for="t in s.tips" :key="t" class="step-tip">
              <Icon name="check" :size="14" /><span>{{ t }}</span>
            </li>
          </ul>

          <div v-if="(s.products || []).length" class="step-block__products">
            <span class="step-block__label">用到</span>
            <span v-for="p in s.products" :key="`${p.name}-${p.code || ''}`" class="step-product">
              <span v-if="p.hex" class="step-product__dot" :style="{ background: p.hex }"></span>
              <span class="step-product__name">{{ p.name }}</span>
              <span v-if="p.code" class="step-product__code">{{ p.code }}</span>
            </span>
          </div>
        </div>
      </section>
    </div>

    <!-- 个性化调整:内容来自选中人设身上的面部特征,没标特征就整块不出现 -->
    <section v-if="personalized.length" class="personalized">
      <h2 class="personalized__title">针对你的面部特征 · {{ personalized.length }} 条调整</h2>
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

    <section class="product-summary">
      <h2 class="product-summary__title">全部用到的产品</h2>
      <ul class="product-summary__list">
        <li v-for="line in productLines" :key="`${line.no}-${line.item.name}-${line.item.code || ''}`" class="product-line">
          <span class="product-line__no">{{ stepNo(line.no - 1) }}</span>
          <span class="product-line__step">{{ line.stepName }}</span>
          <span class="product-line__name">{{ line.item.name }}</span>
          <span class="product-line__code">{{ line.item.code || '—' }}</span>
        </li>
        <li v-if="!productLines.length" class="product-line">本次方案未指定产品</li>
      </ul>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import FlowTopbar from '@/components/FlowTopbar.vue'
import Icon from '@/components/Icon.vue'
import { useQueryParam } from '@/composables/useQueryParam'
import { useStepRail } from '@/composables/useStepRail'
import { useUserStore } from '@/stores/user'
import { usePersonasStore } from '@/stores/personas'
import { useDesignStore } from '@/stores/design'

/**
 * 开始设计 · 第 4 步:生成结果。
 *
 * ★ 步骤的**数量与顺序来自方案数据**(6 ~ 11 步不等,不同风格本来就不同),
 *   页面里不出现任何写死的步骤名或步数。
 *
 * ★ 这一屏**整屏由 URL 重建**:`?scene=&style=&persona=` 三个参数就够了,
 *   刷新后还是这一版。所以切风格不是"改个本地状态",而是重算 + `router.replace` 回写地址栏。
 *
 * ★★ 前后两张图是**占位块**(源站也一样,块的文案就写着「占位」)。
 *    本地方案算得出步骤与色号,但**算不出一张脸**——渲染要真后端。
 *    所以这里不摆假图、也不写"正在生成效果图"。
 *
 * ★ 「保存妆容」= 导出这一版的 JSON 快照,**没有落到任何服务端**
 *   (`api/design.js` 的 snapshotDesign 说明了为什么)。按钮文案因此是
 *   「已记下这一版」,不是「已保存到我的作品」——后者会让人以为换台机器还能看到。
 *
 * ★ 步骤导航靠 IntersectionObserver 反向高亮,点击则平滑跳过去(见 `useStepRail`)。
 *   路由的 scrollBehavior 对带 hash 的跳转返回 false,就是为了不抢这里的锚点滚动——
 *   改 `useStepRail` 时那条配置要一起看,别只改一边。
 */
const route = useRoute()
const router = useRouter()
const user = useUserStore()
const personas = usePersonasStore()
const design = useDesignStore()

// ★ `scene` 的兜底是 'party'(不是 ''):缺了它 /result 也得能算出一版方案
const sceneId = useQueryParam('scene', 'party')
const personaId = useQueryParam('persona')
const styleId = useQueryParam('style')

const result = computed(() => design.result)
const saved = ref(false)

const steps = computed(() => result.value?.steps || [])

/** 步骤导航:滚动时反向高亮、点击平滑跳过去(观察器的生命周期见 useStepRail)。 */
const { activeId: activeStepId, els: stepEls, jumpTo: jumpToStep } = useStepRail(result, steps)

const personalized = computed(() => result.value?.personalized || [])
/** 底部产品清单:把每一步用到的产品摊平,并记住它属于第几步。 */
const productLines = computed(() =>
  steps.value.flatMap((s, i) => (s.products || []).map((p) => ({ stepName: s.name, no: i + 1, item: p })))
)

function stepNo(index) {
  return String(index + 1).padStart(2, '0')
}

onMounted(() => {
  personas.load(user.id)
  // 特征优先从人设档案取(选人流程带来的);没有 persona 参数时就没有个性化区
  const persona = personaId.value ? personas.getById(personaId.value) : null
  design.buildResult({
    sceneId: sceneId.value,
    styleId: styleId.value,
    features: persona?.features || [],
  })
  activeStepId.value = steps.value[0]?.id || ''
})

/* --------------------- 滚动高亮 / 锚点跳转 --------------------- */

// 观察器的建立、随换风格重建、以及卸载时 disconnect,全在 useStepRail 里(见那个文件)

/* --------------------------- 三个动作 --------------------------- */

/**
 * 换风格 /「换一版」都走这里:重算方案 → 回写地址栏 → 回顶部。
 *
 * ★ 这里仍然直接用 `route.query`(而不是 `useQueryParam`):它要的是**把整个 query 摊开保留**,
 *   只覆盖 scene/style/persona 三个,而不是读某一个字符串参数——那是 `useQueryParam` 管的事。
 */
function applyStyle(nextStyleId) {
  design.setStyle(nextStyleId)
  router.replace({ query: { ...route.query, scene: sceneId.value, style: design.result.styleId, persona: personaId.value } })
  window.scrollTo({ top: 0, behavior: 'auto' })
}

function onRegenerate() {
  applyStyle(design.regenerate()?.styleId || '')
}

function onSave() {
  design.snapshot()
  saved.value = true
}
</script>
