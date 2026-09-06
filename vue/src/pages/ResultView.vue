<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMakeupStore } from '@/stores/makeup'
import { fetchMakeupJob, resultImageHref } from '@/api/makeup'
import { SCENE_CN } from '@/api/mock'
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
  scene_understand: 'AI 正在理解场景氛围…',
  reference_gather: '正在检索场景匹配的参考妆…',
  makeup_generate: '正在为照片挑选并渲染妆容…',
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

      <!-- 风格结论 -->
      <section v-if="scene" class="card">
        <div class="caps card-kicker">SCENE LOOK</div>
        <div class="verdict">
          <span class="scene-name">{{ SCENE_CN[scene.label] || scene.label }}</span>
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
        <p class="card-sub">AI 参考了这些场景妆面的处理方式：</p>
        <ol class="ref-list">
          <li v-for="r in references" :key="r.id" class="ref-item">
            <span class="ref-idx">{{ references.indexOf(r) + 1 }}</span>
            <div class="ref-body">
              <div class="ref-title">{{ r.title }}</div>
              <div class="ref-license">{{ r.license }}</div>
            </div>
          </li>
        </ol>
      </section>

      <!-- 解读 -->
      <section class="card">
        <div class="caps card-kicker">WHY</div>
        <p v-if="result?.explain" class="explain">{{ result.explain }}</p>
        <ul v-if="result?.tips?.length" class="tips">
          <li v-for="(tip, i) in result.tips" :key="i" class="tip">
            <Icon name="check" :size="13" class="tip-check" />
            <span>{{ tip }}</span>
          </li>
        </ul>
      </section>

      <div class="actions">
        <button class="btn btn-primary btn-block" @click="restart">换个场景再来一次</button>
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

.ref-title {
  font-size: 13px;
  line-height: 1.6;
}

.ref-license {
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
