<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMakeupStore } from '@/stores/makeup'
import { useUserStore } from '@/stores/user'
import { confirmMakeupRender, fetchMakeupSession, renderImageHref } from '@/api/makeup'
import {
  OCCASION_CN,
  SKIN_TONE_CN,
  SKIN_TONE_OPTIONS,
  SKIN_TYPE_CN
} from '@/constants/options'
import CompareSlider from '@/components/CompareSlider.vue'
import Icon from '@/components/Icon.vue'

/**
 * ResultView —— 表单提交之后那一屏。
 *
 * ✏️ 2026-09-29:它原来读的是 `GET /jobs/:id` 那份 `JobView`(状态机 + 进度 +
 *   `STEP_CN` 步骤名 + `result.look.zones` 的 CSS 叠加上妆预览)。`jobs` 删掉之后,
 *   后端只剩**一条**出图路径,状态就是一段 agent 会话(`AgentSessionView`)。
 *
 * ⚠️ **本轮的界面形态是"能跑起来的最小改动",不是设计稿。** 会话视图里**没有**
 *   `look.zones` / `look.palette`(它只给一句 `lookDescription`),所以这页**不再有**
 *   那张"本人照片 + 色块叠加"的模拟上妆图——那要等前端设计那一轮再定怎么展示。
 *   现在:没图时说清"还没出图",有图就直接展示成品图与本人照片的前后对比。
 *
 * ★ **这里必须留一次用户确认**(红线 §7.4):agent 那条路出图是会花钱的,
 *   钱只能由人的一次 HTTP 动作触发。`renderOffer` / `pendingRender` 是服务端
 *   给的两个互斥入口,请求体逐字相同,前端不必区分。
 */

const store = useMakeupStore()
const user = useUserStore()
const router = useRouter()

if (!store.sessionId) {
  router.replace('/upload')
}

const view = ref(null)
const pollError = ref('')
const confirming = ref(false)
let timer = null

async function poll() {
  try {
    view.value = await fetchMakeupSession({ sessionId: store.sessionId, userId: user.id })
    pollError.value = ''
  } catch (e) {
    // 404 = 会话不在 / 不属于这个用户(服务端不区分)。这里没有别的出路可指。
    pollError.value = e?.message || '读不到这段会话'
    stopPoll()
  }
}

function stopPoll() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

onMounted(() => {
  poll()
  timer = setInterval(poll, 650)
})
onUnmounted(stopPoll)

// ---- 派生状态 ----
const renders = computed(() => view.value?.renders || [])
const latest = computed(() => (renders.value.length ? renders.value[renders.value.length - 1] : null))
const lookDescription = computed(() => view.value?.lookDescription || '')

/**
 * 服务端给的那条出图入口。`pendingRender`(模型提的)与 `renderOffer`(界面摆的)
 * **互斥** —— 两个按钮指向同一次花钱的话,其中一个必然 422。
 */
const renderRequest = computed(() => view.value?.renderOffer || view.value?.pendingRender || null)

/** 成品图地址:路径式 URL 要配 `API_BASE` **再补 `?userId=`**(取图靠查询串判归属)。 */
const resultSrc = computed(() => (latest.value ? renderImageHref(latest.value.url, user.id) : ''))

// ---- 输入简报回显 ----
const brief = computed(() => view.value?.brief || {})
const toneMeta = Object.fromEntries(SKIN_TONE_OPTIONS.map((t) => [t.value, t]))
const hasEcho = computed(
  () =>
    !!brief.value.occasion ||
    !!brief.value.sceneText ||
    !!brief.value.skinType ||
    !!brief.value.skinTone ||
    !!brief.value.dress ||
    !!brief.value.weather
)

function occasionCn(v) {
  return OCCASION_CN[v] || v || ''
}
function skinTypeCn(v) {
  return SKIN_TYPE_CN[v] || v || ''
}
function weatherText(w) {
  if (!w) return ''
  const bits = []
  if (w.condition) bits.push(w.condition)
  if (w.temperatureC != null) bits.push(`${w.temperatureC}°C`)
  if (w.humidityPct != null) bits.push(`湿度${w.humidityPct}%`)
  return bits.join(' · ')
}

/** 顶部需求名:命中枚举按中文;自由文字未命中场合时展示需求 snippet。 */
function briefDisplayName() {
  const cn = OCCASION_CN[brief.value.occasion]
  if (cn) return cn
  const t = (brief.value.sceneText || '').trim()
  if (t) return `自定义 · ${t.length > 14 ? t.slice(0, 14) + '…' : t}`
  return '这次的需求'
}

async function confirm() {
  if (confirming.value || !renderRequest.value) return
  confirming.value = true
  pollError.value = ''
  try {
    // ★ 这条路由**不收任何出图参数**:要出的就是会话里那一套。
    view.value = await confirmMakeupRender({ sessionId: store.sessionId, userId: user.id })
  } catch (e) {
    // 服务端的 message 本身就是人话(缺妆面 / 缺照片 / 上一轮欠着的不是出图请求 / 并发连点)。
    pollError.value = e?.message || '这次没能出图'
  } finally {
    confirming.value = false
  }
}

function restart() {
  store.reset()
  router.push('/upload')
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <button class="back-btn" @click="router.push('/')">
        <Icon name="arrowLeft" :size="18" />
      </button>
      <span class="title">妆容结果</span>
      <span class="spacer"></span>
    </header>

    <!-- 读不到会话(含 mock 模式下这条链整个不可用) -->
    <section v-if="pollError" class="card">
      <h2 class="card-title">这次没能拿到结果</h2>
      <p class="card-sub">{{ pollError }}</p>
      <button class="btn btn-primary btn-block" @click="restart">重新开始</button>
    </section>

    <template v-else>
      <!-- 成品图 -->
      <section v-if="latest">
        <CompareSlider :default-pos="55">
          <template #after>
            <img :src="resultSrc" alt="妆容后" />
          </template>
          <template #before>
            <img class="before-img" :src="store.portraitUrl" alt="原图" />
          </template>
        </CompareSlider>
        <p class="compare-hint">拖拽中间滑杆，对比妆容前后</p>
      </section>

      <!-- 妆面结论 -->
      <section class="card">
        <div class="caps card-kicker">{{ latest ? 'LOOK' : 'WAITING' }}</div>
        <div class="verdict">
          <span class="scene-name">{{ briefDisplayName() }}</span>
        </div>
        <!-- ★ 这句来自服务端 describeLook(),是唯一一份说法——原样展示,别自己再拼一句。 -->
        <p v-if="lookDescription" class="direction">{{ lookDescription }}</p>
        <p v-else class="direction faint">
          妆面还在定。定下来之后这里会说清这一次是什么妆。
        </p>

        <!-- 出图那条消息。⚠️ 措辞一个字都不自己加:费用与时长那句来自服务端。 -->
        <div v-if="renderRequest" class="offer">
          <p class="offer-summary">{{ renderRequest.summary }}</p>
          <button
            class="btn btn-primary btn-block"
            :disabled="confirming"
            @click="confirm"
          >
            {{ confirming ? '正在出图…' : renderRequest.alreadyRendered ? '再生成一张' : '确认生成' }}
          </button>
        </div>
        <p v-else-if="!latest" class="stage-hint faint">
          还在等一个能出图的妆面与照片。稍等片刻，或回上传页补一张本人正面照。
        </p>
      </section>

      <!-- 已出的图 -->
      <section v-if="renders.length > 1" class="card">
        <div class="caps card-kicker">RENDERS</div>
        <ol class="render-list">
          <li v-for="r in renders" :key="r.seq" class="render-item">
            <img class="render-thumb" :src="renderImageHref(r.url, user.id)" :alt="`第 ${r.seq} 张`" />
            <div class="render-body">
              <span class="render-seq">第 {{ r.seq }} 张</span>
              <span v-if="r.lookDescription" class="render-desc">{{ r.lookDescription }}</span>
            </div>
          </li>
        </ol>
      </section>

      <!-- 本次输入回显 -->
      <section v-if="hasEcho" class="card echo-card">
        <div class="caps card-kicker">YOUR INPUT</div>
        <ul class="echo">
          <li v-if="brief.occasion" class="echo-item">
            <span class="echo-label">场合</span>
            <span class="echo-val"><span class="val-text">{{ occasionCn(brief.occasion) }}</span></span>
          </li>
          <li v-if="brief.sceneText" class="echo-item">
            <span class="echo-label">你的需求</span>
            <span class="echo-val"><span class="val-text echo-free">{{ brief.sceneText }}</span></span>
          </li>
          <li v-if="brief.skinType" class="echo-item">
            <span class="echo-label">肤质</span>
            <span class="echo-val"><span class="val-text">{{ skinTypeCn(brief.skinType) }}</span></span>
          </li>
          <li v-if="brief.skinTone" class="echo-item">
            <span class="echo-label">肤色</span>
            <span class="echo-val">
              <span class="tone-swatch" :style="{ background: toneMeta[brief.skinTone]?.swatch }"></span>
              <span class="val-text">{{ SKIN_TONE_CN[brief.skinTone] || brief.skinTone }}</span>
            </span>
          </li>
          <li v-if="brief.dress" class="echo-item">
            <span class="echo-label">穿搭</span>
            <span class="echo-val"><span class="val-text">{{ brief.dress }}</span></span>
          </li>
          <li v-if="brief.weather" class="echo-item">
            <span class="echo-label">天气</span>
            <span class="echo-val"><span class="val-text">{{ weatherText(brief.weather) || '未提供' }}</span></span>
          </li>
        </ul>
      </section>

      <div class="actions">
        <button class="btn btn-primary btn-block" @click="restart">换个场合，再来一次</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page {
  gap: 14px;
}

.card-kicker {
  margin-bottom: 10px;
}

.compare-hint {
  text-align: center;
  font-size: 11px;
  color: var(--c-ink-faint);
  margin: 8px 0 2px;
}

.stage-hint {
  font-size: 12px;
  color: var(--c-ink-soft);
  line-height: 1.7;
  margin: 18px 0 0;
}

.faint {
  color: var(--c-ink-faint);
}

/* ---- 出图那条消息 ---- */
.offer {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--c-line);
}

.offer-summary {
  font-size: 12.5px;
  color: var(--c-ink-soft);
  line-height: 1.7;
  margin: 0 0 12px;
}

/* ---- 输入回显 ---- */
.echo-card {
  padding: 16px 20px;
}

.echo {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.echo-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12.5px;
}

.echo-label {
  flex: none;
  width: 62px;
  color: var(--c-ink-faint);
}

.echo-val {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  color: var(--c-ink);
}

.val-text {
  word-break: break-word;
}

.echo-free {
  color: var(--c-ink-soft);
  line-height: 1.6;
}

.tone-swatch {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--c-line-strong);
}

.verdict {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  font-family: var(--font-display);
  font-size: 19px;
}

.scene-name {
  color: var(--c-accent);
}

.direction {
  font-size: 13px;
  color: var(--c-ink-soft);
  line-height: 1.7;
  margin: 12px 0 0;
}

/* ---- 已出的图 ---- */
.render-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.render-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.render-item + .render-item {
  margin-top: 12px;
}

.render-thumb {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
}

.render-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.render-seq {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--c-ink-faint);
}

.render-desc {
  font-size: 12.5px;
  color: var(--c-ink-soft);
  line-height: 1.6;
}

.actions {
  margin-top: 4px;
}
</style>
