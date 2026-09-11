<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMakeupStore } from '@/stores/makeup'
import { fetchMakeupJob, resultImageHref } from '@/api/makeup'
import {
  OCCASION_CN,
  SKIN_TONE_CN,
  SKIN_TONE_OPTIONS,
  SKIN_TYPE_CN
} from '@/constants/options'
import { rgbCss, rgbToHex } from '@/utils/color'
import CompareSlider from '@/components/CompareSlider.vue'
import Icon from '@/components/Icon.vue'

const store = useMakeupStore()
const router = useRouter()

const jobId = store.jobId
if (!jobId || !store.portraitUrl) {
  router.replace('/upload')
}

const view = ref(null)
const pollError = ref('')
let timer = null

const STEP_CN = {
  queued: '任务排队中…',
  scene_understand: 'AI 正在理解场合与需求…',
  reference_gather: '正在检索该场合相配的参考妆…',
  makeup_generate: '正在按你的肤质肤色配妆容…',
  store_result: '正在保存结果…'
}

function zoneStyle(z) {
  // 归一化锚点 → 容器百分比；软边 radial 渐变 + multiply 叠加模拟低饱和上妆
  const r = z.rgb || [0, 0, 0]
  return {
    left: z.anchor.x * 100 + '%',
    top: z.anchor.y * 100 + '%',
    width: z.size.w * 100 + '%',
    height: z.size.h * 100 + '%',
    opacity: z.opacity ?? 1,
    background: `radial-gradient(ellipse at center, rgba(${r[0]},${r[1]},${r[2]},0.9) 0%, rgba(${r[0]},${r[1]},${r[2]},0.25) 55%, rgba(${r[0]},${r[1]},${r[2]},0) 72%)`,
    filter: `blur(${z.blur ?? 0}px)`
  }
}

/** 来源页 → 域名，用于参考图下方标注出处（去掉协议与 www，只留能认人的部分）。 */
function sourceHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

async function poll() {
  try {
    const v = await fetchMakeupJob(jobId)
    view.value = v
    if (v.status === 'done' || v.status === 'failed') stopPoll()
  } catch (e) {
    pollError.value = e?.message || '查询任务失败'
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
const status = computed(() => view.value?.status || 'queued')
const running = computed(() => status.value === 'queued' || status.value === 'running')
const failed = computed(() => status.value === 'failed')
const done = computed(() => status.value === 'done')
const progress = computed(() => view.value?.progress ?? 0)
const step = computed(() => view.value?.step || 'queued')
const stepText = computed(() => STEP_CN[step.value] || '处理中…')

const result = computed(() => view.value?.result || null)
const scene = computed(() => result.value?.scene || view.value?.scene || null)
const look = computed(() => result.value?.look || null)
const references = computed(() => result.value?.references || view.value?.references || [])
const errorMsg = computed(
  () => view.value?.error?.message || pollError.value || '生成失败，请重试'
)

// ---- 输入简报回显 ----
const brief = computed(() => view.value?.inputs?.brief || {})
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

/** 顶部场合名：命中枚举按中文；自由文字未命中场合时展示需求 snippet。 */
function sceneDisplayName() {
  const cn = OCCASION_CN[scene.value?.label]
  if (cn) return cn
  const t = (brief.value.sceneText || '').trim()
  if (t) return `自定义 · ${t.length > 14 ? t.slice(0, 14) + '…' : t}`
  return scene.value?.label || '日常'
}

/** 底图：真实引擎产物优先；mock（resultUrl 为空）则用本人照片原图 + look 叠加。 */
const baseSrc = computed(() => {
  if (result.value?.resultUrl) return resultImageHref(result.value.resultUrl)
  return store.portraitUrl
})

const showOverlay = computed(() => done.value && !!look.value?.zones?.length)

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

    <!-- 处理中 -->
    <section v-if="running" class="card stage-card">
      <div class="caps stage-kicker">GENERATING</div>
      <div class="stage-title">{{ stepText }}</div>
      <div class="bar">
        <div class="bar-fill" :style="{ width: progress + '%' }"></div>
      </div>
      <div class="bar-meta">
        <span>进度 {{ progress }}%</span>
        <span class="caps">{{ step }}</span>
      </div>
      <p class="stage-hint">初次使用通常需要几秒。请保持页面打开，稍等片刻。</p>
    </section>

    <!-- 失败 -->
    <section v-else-if="failed" class="card">
      <h2 class="card-title">这次没生成成功</h2>
      <p class="card-sub">{{ errorMsg }}</p>
      <button class="btn btn-primary btn-block" @click="restart">重新开始</button>
    </section>

    <!-- 完成 -->
    <template v-else-if="done">
      <!-- 前后对比 -->
      <section>
        <CompareSlider :default-pos="55">
          <template #after>
            <div class="fx">
              <img :src="baseSrc" alt="妆容后" />
              <div
                v-for="(z, i) in showOverlay ? look.zones : []"
                :key="i"
                class="fx-zone"
                :style="zoneStyle(z)"
              ></div>
            </div>
          </template>
          <template #before>
            <img class="before-img" :src="store.portraitUrl" alt="原图" />
          </template>
        </CompareSlider>
        <p class="compare-hint">拖拽中间滑杆，对比妆容前后</p>
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

      <!-- 风格结论 -->
      <section v-if="scene" class="card">
        <div class="caps card-kicker">OCCASION LOOK</div>
        <div class="verdict">
          <span class="scene-name">{{ sceneDisplayName() }}</span>
          <span class="dot">·</span>
          <span class="look-style">{{ look?.style }}</span>
        </div>
        <div class="tag-row">
          <span v-for="(t, i) in scene.tags" :key="i" class="tag">{{ t }}</span>
        </div>
        <p class="direction">{{ scene.direction }}</p>
        <p v-if="result?.analysis" class="analysis">{{ result.analysis }}</p>
      </section>

      <!-- 色板 -->
      <section v-if="look?.palette" class="card">
        <div class="caps card-kicker">PALETTE</div>
        <ul class="palette">
          <li v-for="p in look.palette" :key="p.role" class="swatch">
            <span class="chip" :style="{ background: rgbCss(p.rgb) }"></span>
            <span class="role">{{ p.role }}</span>
            <span class="hex">{{ rgbToHex(p.rgb) }}</span>
          </li>
        </ul>
      </section>

      <!-- 参考妆 -->
      <section v-if="references.length" class="card">
        <div class="caps card-kicker">REFERENCE</div>
        <p class="card-sub">按部位检索到的妆面参考（出处标在图下方）：</p>
        <ol class="ref-list">
          <li v-for="r in references" :key="r.id" class="ref-item">
            <span class="ref-idx">{{ references.indexOf(r) + 1 }}</span>
            <!-- 没有图片地址时只渲染文字：mock 拿不到真图，真实抓取也会遇到没有可用图地址的条目 -->
            <img
              v-if="r.imageUrl"
              class="ref-thumb"
              :src="r.imageUrl"
              :alt="r.title"
              loading="lazy"
              referrerpolicy="no-referrer"
            />
            <div class="ref-body">
              <div class="ref-head">
                <span v-if="r.role" class="ref-role">{{ r.role }}</span>
                <span class="ref-title">{{ r.title }}</span>
              </div>
              <div v-if="sourceHost(r.sourceUrl)" class="ref-source">
                {{ sourceHost(r.sourceUrl) }}
              </div>
            </div>
          </li>
        </ol>
      </section>

      <!-- 解读 -->
      <section class="card">
        <div class="caps card-kicker">WHY THIS LOOK</div>
        <p v-if="result?.explain" class="explain">{{ result.explain }}</p>
        <ul v-if="result?.tips?.length" class="tips">
          <li v-for="(tip, i) in result.tips" :key="i" class="tip">
            <Icon name="check" :size="13" class="tip-check" />
            <span>{{ tip }}</span>
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

.stage-card {
  margin-top: 8px;
}

.stage-kicker {
  margin-bottom: 12px;
}

.stage-title {
  font-family: var(--font-display);
  font-size: 20px;
  margin-bottom: 16px;
}

.bar {
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--c-surface-2);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, var(--c-gold), var(--c-accent));
  transition: width 0.45s ease;
}

.bar-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: var(--c-ink-faint);
}

.stage-hint {
  font-size: 12px;
  color: var(--c-ink-soft);
  line-height: 1.7;
  margin: 18px 0 0;
}

.compare-hint {
  text-align: center;
  font-size: 11px;
  color: var(--c-ink-faint);
  margin: 8px 0 2px;
}

.card-kicker {
  margin-bottom: 10px;
}

.fx {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.fx img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.fx-zone {
  position: absolute;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  mix-blend-mode: multiply;
  pointer-events: none;
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

.look-style {
  font-size: 17px;
}

.dot {
  color: var(--c-ink-faint);
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.direction {
  font-size: 13px;
  color: var(--c-ink-soft);
  margin: 12px 0 0;
}

.analysis {
  font-size: 12.5px;
  color: var(--c-ink-soft);
  line-height: 1.7;
  margin: 8px 0 0;
  border-top: 1px dashed var(--c-line);
  padding-top: 10px;
}

.palette {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 18px;
}

.swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.chip {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid var(--c-line-strong);
  box-shadow: var(--shadow-soft);
}

.role {
  font-size: 12px;
  color: var(--c-ink);
}

.hex {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--c-ink-faint);
}

.ref-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.ref-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.ref-item + .ref-item {
  margin-top: 12px;
}

.ref-idx {
  font-family: var(--font-display);
  color: var(--c-accent);
  font-size: 14px;
  line-height: 1.4;
  flex-shrink: 0;
}

.ref-thumb {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
}

.ref-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}

/* 部位标签：与结果页色板里的 role 用的是同一套词（唇/颊/眼影/底妆/眉） */
.ref-role {
  font-size: 10px;
  line-height: 16px;
  padding: 0 6px;
  border-radius: 999px;
  color: var(--c-accent);
  background: var(--c-accent-soft);
  flex-shrink: 0;
}

.ref-title {
  font-size: 13px;
  line-height: 1.6;
}

.ref-source {
  font-size: 11px;
  color: var(--c-ink-faint);
  margin-top: 2px;
}

.explain {
  font-size: 13px;
  line-height: 1.85;
  color: var(--c-ink-soft);
  margin: 0 0 4px;
}

.tips {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}

.tip {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12.5px;
  color: var(--c-ink-soft);
  line-height: 1.7;
}

.tip + .tip {
  margin-top: 6px;
}

.tip-check {
  color: var(--c-accent);
  margin-top: 3px;
  flex-shrink: 0;
}

.actions {
  margin-top: 4px;
}
</style>
