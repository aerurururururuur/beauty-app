<template>
  <FlowTopbar
    back-to="/form"
    title="生成结果"
    :steps="['1 选场景', '2 选形象', '3 填信息', '4 生成方案']"
    :active-step="4"
  />

  <main v-if="plan" class="content content--flow">
    <section class="result-hero">
      <div class="result-hero__shots hero-side">
        <!--
          ★ 这一格是**真的成片**,不是占位块。没出图之前这里什么都没有——
            出图那条自己会占满整列(见 renderNote),不摆假图。
        -->
        <img v-if="shotSrc" class="shot" :src="shotSrc" :alt="`「${plan.styleName}」的成片`" />
        <div v-if="renderNote" class="render-card">
          <p class="render-card__note">{{ renderNote }}</p>
          <button
            v-if="canRender"
            class="btn btn--primary"
            :disabled="design.generating"
            @click="onRender"
          >
            {{ design.generating ? '正在出图…' : renderButtonText }}
          </button>
        </div>
      </div>

      <div class="result-hero__info">
        <span class="result-hero__scene">{{ sceneName }}</span>
        <h1 class="result-hero__title">{{ plan.styleName }}</h1>
        <!-- ★ 这段是「这套妆是什么」的唯一说法（服务端 describeLook 生成），原样展示 -->
        <p class="result-hero__summary">{{ lookDescription }}</p>

        <div class="result-hero__kw">
          <span v-for="k in plan.keywords" :key="k" class="kw-chip">{{ k }}</span>
        </div>

        <!--
          ★ 色板：**为空时整块不渲染**（摆一个只有标题的空壳，用户会以为颜色丢了）。
          ⚠️ 一块可能是**模型直接给的颜色**（没有色号，`code` 是空串），所以
          两处都不能只认 `p.code`：`:key` 会撞、第二行会重复显示同一句。
        -->
        <div v-if="palette.length" class="result-hero__palette-label">本方案用到的颜色</div>
        <div v-if="palette.length" class="result-hero__palette">
          <span v-for="p in palette" :key="p.code || p.name" class="palette-chip" :title="p.name || ''">
            <span class="palette-chip__dot" :style="{ background: p.hex }"></span>
            <span class="palette-chip__code">{{ p.code || p.name }}</span>
            <span v-if="p.code && p.name" class="palette-chip__from">{{ p.name }}</span>
          </span>
        </div>

        <!--
          ★ **推荐产品**：色号的唯一出处 —— 步骤文本只说工具与用法，不绑具体 SKU。
          ⚠️ 产品为空时整块不渲染（同色板那条：空壳会让人以为产品丢了）。
        -->
        <div v-if="products.length" class="result-hero__products">
          <span class="result-hero__products-label">推荐产品</span>
          <span v-for="p in products" :key="`${p.pid}-${p.code || ''}`" class="step-product">
            <span v-if="p.hex" class="step-product__dot" :style="{ background: p.hex }"></span>
            <span class="step-product__name">{{ p.name }}</span>
            <span v-if="p.code" class="step-product__code">{{ p.code }}</span>
          </span>
        </div>

        <div class="result-hero__meta">
          <span class="meta-cell"><em>{{ plan.meta.stepCount }}</em>个步骤</span>
        </div>

        <div class="result-hero__actions">
          <button class="btn btn--primary" :disabled="saved" @click="onSave">
            {{ saved ? '已记下这一版' : '保存妆容' }}
          </button>
          <RouterLink class="btn btn--soft" to="/vanity">去美妆台看产品</RouterLink>
        </div>
      </div>
    </section>

    <!-- 出图 / 读图失败时后端给的那句人话，原样展示（§7.3） -->
    <ErrorNote :text="design.error" />

    <!--
      ★ 只摆**真有图可读**的那几格（给缺图那格一个点下去必失败的按钮 = 摆了三个坏两个）；
      `wouldOverwrite` 的那一格照摆但**置灰并写出理由**。
      ⚠️ 点了才真读（一次读图调用，会花钱）；`VISION_ANALYZER=off` 时 `analysisOffer`
      根本不存在，这一块连壳都没有。
    -->
    <section v-if="analysisCases.length" class="analysis">
      <div class="analysis__head">
        <span class="analysis__title">让 agent 读一下你传的图</span>
        <span class="analysis__note">点一下才会读；一次读图调用会花钱</span>
      </div>
      <div class="analysis__list">
        <div v-for="c in analysisCases" :key="c.kind" class="analysis-card">
          <div class="analysis-card__body">
            <span class="analysis-card__name">{{ ANALYSIS_LABELS[c.kind] || c.kind }}</span>
            <!-- ★ 置灰的理由就是后端那句话，原样展示，前端不按 code 分支 -->
            <span v-if="c.notice" class="analysis-card__reason">{{ c.notice }}</span>
          </div>
          <!-- ★ 文案写死「读一下」，不做"正在读…"那套：`generating` 是全局的，
               换风格 / 出图时也是真，谎报成"正在读"就不对了 -->
          <button
            class="btn btn--soft"
            :disabled="c.wouldOverwrite || design.generating"
            @click="onAnalyze(c.kind)"
          >
            读一下
          </button>
        </div>
      </div>
      <!-- 「用户填的优先」那一次：没读也没花钱，后端给的解释原样展示 -->
      <p v-if="design.analysisNotice" class="analysis__notice">{{ design.analysisNotice }}</p>
    </section>

    <nav class="step-rail" aria-label="妆容步骤导航">
      <div class="step-rail__head">
        <span class="step-rail__title">化妆步骤 · 共 {{ steps.length }} 步</span>
        <span class="step-rail__note">步骤与顺序由模型按你的需求这次定，不是一套固定模板</span>
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
        <!--
          ★ 这一步的**累积图**：画到这一步为止的妆（哪一步对哪张图由服务端算，
            见 `design.stepRenders`——前端不自己由步骤名推部位）。
          ⚠️ 护肤 / 妆前 / 防晒 / 定妆**没有图**，那几步整块不摆。**不补空块、不补 `.ph`**
             （§8-4：占位块会让人以为"这张待会儿会出现"）。
          ⚠️ 缺省引擎（`MAKEUP_ENGINE=mock`）下这张就是**你传的那张照片原样**，
             所以标签只说「到这一步为止」，不写「效果图」也不写「渲染」。
        -->
        <div v-if="stepShots[s.id]" class="step-block__media">
          <img class="step-shot" :src="stepShots[s.id]" :alt="`画到「${s.name}」这一步为止的妆容`" />
          <span class="step-block__no">{{ stepNo(i) }}</span>
          <span class="step-block__name-tag">到这一步为止</span>
        </div>

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

    <!-- 个性化调整：条目来自这次 brief 带上来的面部特征，没有特征就整块不出现 -->
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

    <!-- ★ 色号只住在计划级的推荐产品里（步骤文本不绑 SKU），所以这里直接读 `plan.products` -->
    <section class="product-summary">
      <h2 class="product-summary__title">推荐产品</h2>
      <ul class="product-summary__list">
        <li v-for="(p, i) in products" :key="`${p.pid}-${p.code || ''}`" class="product-line">
          <span class="product-line__no">{{ stepNo(i) }}</span>
          <span class="product-line__name">{{ p.name }}</span>
          <span class="product-line__code">{{ p.code || '—' }}</span>
        </li>
        <li v-if="!products.length" class="product-line">本次方案未指定产品</li>
      </ul>
    </section>
  </main>

  <!-- 还没读到方案：要么正在读，要么这次会话真的没有方案（后端给的那句人话原样展示） -->
  <main v-else class="content content--flow">
    <p v-if="design.generating" class="flow-tip">正在读这次会话…</p>
    <ErrorNote :text="design.error" />
    <RouterLink class="btn btn--soft" to="/create">回「开始设计」重走一遍</RouterLink>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ErrorNote from '@/components/ErrorNote.vue'
import FlowTopbar from '@/components/FlowTopbar.vue'
import Icon from '@/components/Icon.vue'
import { renderImageHref } from '@/api/agent'
import { useQueryParam } from '@/composables/useQueryParam'
import { useStepRail } from '@/composables/useStepRail'
import { useUserStore } from '@/stores/user'
import { useDesignStore } from '@/stores/design'

/**
 * 开始设计 · 第 4 步:生成结果。
 *
 * ★ 这一屏**整屏是后端 agent 那份方案的展示**:步骤 / 色板 / 产品 / 个性化
 *   全部来自 `session.plan`(由 `propose_look` 那一次调用一并产出),页面里
 *   不出现任何写死的步骤名或步数,也不再有本地推导。
 *
 * ★ 状态全在地址栏里:`?session=<id>`,刷新后靠 `design.loadSession()` 从服务端
 *   把同一次会话拉回来(§3 第 6 条)。**不再有 `?scene=&style=&persona=`**。
 *
 * ★ 2026-10-02:**步骤由模型自己写**,配方只当参考(见 `plan.steps`)。所以这一屏
 *   **没有**「换一个妆容风格」那排 chips、也**没有**「换一版」按钮——
 *   想改妆面就回会话里说一句("眼妆再淡一点"),那是一次 agent 回合(最长 90 秒)。
 *   ⚠️ 同理 `plan.meta` **只剩 `stepCount`**:`minutes` / `level` 随配方一起下线了,
 *   模型现编的"约 30 分钟"是凭空来的数字(§8-4)。
 *
 * ★★ **这一格是真的成片。** 上一版这里是两个标着「占位」的块,因为那时算得出
 *   步骤与色号、算不出一张脸。现在出图那条链接回来了(会花钱,见 `api/agent.js`),
 *   所以:有图就显示真图,没图就**什么都不摆**、只摆那条确认框。
 *   **不许**再拿一个灰块顶着说它是效果图(§8-4)。
 *
 * ★ 步骤块左边那一格也是真图(2026-10-01「每一步一张图」):出图时服务端**逐步**出,
 *   每一步一张累积累积图,`stepRenders` 把「哪一步对哪张」算好了。护肤/妆前/防晒/定妆
 *   那四步**没有图**,取不到就整块不摆——**不许补 `.ph`**(它会让人以为"这张待会儿会出现")。
 *   ★ 缺省引擎下这些图就是输入照本身,所以图上只写「到这一步为止」(§8-4)。
 *
 * ★ 出图入口**全屏只有一个**:`pendingRender`(模型提的)与 `renderOffer`
 *   (界面按状态自己摆的)在服务端就是互斥的,这里也只是**二选一**地读——
 *   两个都读、都摆,就会出现两个按钮,而点两下是真的要花两次钱。
 *
 * ★ 读图那一块(2026-09-30):只摆**真有图可读**的那几格,点了才真读(会花钱,
 *   见 `stores/design.js` 的 `analyze`);置灰的理由是后端给的 `notice`,**原样展示**。
 *
 * ★ 「保存妆容」= 导出这一版的 JSON 快照,**没有落到任何服务端**
 *   (`api/design.js` 的 snapshotDesign 说明了为什么)。按钮文案因此是
 *   「已记下这一版」,不是「已保存到我的作品」——后者会让人以为换台机器还能看到。
 *
 * ★ 步骤导航靠 IntersectionObserver 反向高亮,点击则平滑跳过去(见 `useStepRail`)。
 *   路由的 scrollBehavior 对带 hash 的跳转返回 false,就是为了不抢这里的锚点滚动——
 *   改 `useStepRail` 时那条配置要一起看,别只改一边。
 */
const user = useUserStore()
const design = useDesignStore()

const sessionId = useQueryParam('session')

/** 读图那三格叫什么。★ 后端只给 `kind`，中文名是页面上的词（§7.3）。 */
const ANALYSIS_LABELS = { face: '本人照片', scene: '场景图', style: '风格参考图' }

const plan = computed(() => design.plan)
const lookDescription = computed(() => design.lookDescription || plan.value?.summary || '')
const sceneName = computed(() => design.sceneNameOf(design.session?.brief?.occasion || ''))
const saved = ref(false)

const steps = computed(() => plan.value?.steps || [])
const personalized = computed(() => plan.value?.personalized || [])

/** 步骤导航：滚动时反向高亮、点击平滑跳过去（观察器的生命周期见 useStepRail）。 */
const { activeId: activeStepId, els: stepEls, jumpTo: jumpToStep } = useStepRail(plan, steps)

/**
 * 色板与推荐产品**都在计划级**（服务端产出，见 `plan-view.ts`）。
 * ★ 步骤文本只说工具与用法，**不绑 SKU**；色号只住在 `products`（推荐产品）里。
 * ★ `palette[].hex` 一定非空（空色值那一条服务端就丢了）；`products[].hex` 可以是空串
 *   ——那支产品仍然真的推荐给你，只是没色块可画。
 */
const palette = computed(() => plan.value?.palette || [])
const products = computed(() => plan.value?.products || [])

/* ------------------------------ 出图 ------------------------------ */

/** 最新那张成片。★ 取"最新"而不是第一张：后面那些是同一套妆的再生成，新的盖住旧的。 */
const shotSrc = computed(() => {
  const last = design.renders[design.renders.length - 1]
  return last ? renderImageHref(last.url, user.id) : ''
})

/**
 * 每一步那张累积图：`{ [步骤 id]: 能直接塞 <img> 的地址 }`。
 * ★ 是服务端给的 `stepRenders`（`{步骤 id: seq}`）+ 已出的图，页面只做拼接。
 * ★ 还没出图时它是 `{}` ⇒ 每个步骤块都不摆图位（不是摆个空壳）。
 */
const stepShots = computed(() => {
  const bySeq = new Map(design.renders.map((r) => [r.seq, r]))
  return Object.fromEntries(
    Object.entries(design.stepRenders).map(([stepId, seq]) => {
      const shot = bySeq.get(seq)
      return [stepId, shot ? renderImageHref(shot.url, user.id) : '']
    })
  )
})

const canRender = computed(() => Boolean(design.pendingRender || design.renderOffer))

/**
 * 出图那一块要说的话。
 *
 * ★ 有提议/有那条消息时**逐字用服务端那句话**（`renderConfirmationSummary()`：
 *   出图要多久、要花什么钱都写在里面）——前端另写一句就成了第二份说法。
 * ★ 没照片时是另一回事：那不是"要不要出图"，是"出不了"。这一句由前端说，
 *   因为服务端那时**根本不摆**出图入口（`renderReadiness !== 'ready'`）。
 */
const renderNote = computed(() => {
  const entry = design.pendingRender || design.renderOffer
  if (entry) return entry.summary
  if (design.hasFace) return ''
  return '这次没有带上你的照片，出不了成片。回上一步换一份有照片的人设，再走一遍。'
})

/** 出完图之后那条消息**不会消失**（妆面与照片都还在），所以按钮要改口，防误连点。 */
const renderButtonText = computed(() =>
  design.renderOffer?.alreadyRendered ? '再生成一张' : '确认生成'
)

function stepNo(index) {
  return String(index + 1).padStart(2, '0')
}

/* ------------------------------ 读图 ------------------------------ */

/** ★ 只留**真有图可读**的那几格：缺图那格点下去必然 422。 */
const analysisCases = computed(() =>
  (design.analysisOffer?.cases || []).filter((c) => c.hasImage)
)

function onAnalyze(kind) {
  design.analyze({ userId: user.id, kind })
}

onMounted(async () => {
  await design.loadSession({ sessionId: sessionId.value, userId: user.id })
  activeStepId.value = steps.value[0]?.id || ''
})

/* --------------------------- 两个动作 --------------------------- */

function onRender() {
  design.confirmRender({ userId: user.id })
}

function onSave() {
  design.snapshot()
  saved.value = true
}
</script>

<style scoped>
/* hero 那一列竖着排：成片在上、出图那条在下 */
.hero-side {
  flex-direction: column;
}

.hero-side .shot {
  flex: 1 1 auto;
  min-height: 0;
}

/* ---------- 步骤块左边那一格图 ---------- */
/* `flow.css` 那条是给"撑满整列"写的；这里要的是按图自己的比例，免得裁掉脸。 */
.step-block__media {
  align-self: flex-start;
}

/* 图块的宽由 `.step-block__media` 定死，高度随图（引擎出的是 2:3 竖图）。 */
.step-shot {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-md);
  background: var(--color-card);
}

/* 没出图时它是这一列里唯一的东西，自己占满整列 */
.render-card {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-5);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-white);
}

.render-card__note {
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-sub);
}

.flow-tip {
  font-size: 14px;
  color: var(--color-text-sub);
}

/* 读图那一块：一格一行，按钮在右 */
.analysis {
  margin-top: var(--space-5);
  padding: var(--space-5);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-white);
}

.analysis__head {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.analysis__title {
  font-size: 15px;
  font-weight: 600;
}

.analysis__note {
  font-size: 13px;
  color: var(--color-text-sub);
}

.analysis__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.analysis-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 10px 12px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
}

.analysis-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.analysis-card__name {
  font-size: 14px;
}

.analysis-card__reason {
  font-size: 12px;
  color: var(--color-text-sub);
}

.analysis__notice {
  margin-top: var(--space-3);
  font-size: 13px;
  color: var(--color-text-sub);
}
</style>
