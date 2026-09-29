<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMakeupStore } from '@/stores/makeup'
import { useUserStore } from '@/stores/user'
import { submitMakeupForm } from '@/api/makeup'
import { useMock } from '@/api/use-mock'
import { fetchWeather } from '@/api/weather'
import { DEMO_PORTRAIT } from '@/api/mock'
import {
  OCCASION_OPTIONS,
  SKIN_TYPE_OPTIONS,
  SKIN_TONE_OPTIONS
} from '@/constants/options'
import PhotoUploader from '@/components/PhotoUploader.vue'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import Icon from '@/components/Icon.vue'

const store = useMakeupStore()
const user = useUserStore()
const router = useRouter()
const isMock = useMock()

const error = ref('')

/** 把静态示例照载成 File，作为真实文件提交（mock 下仅作预览亦可）。 */
async function loadDemoFile(url, name, type) {
  const blob = await (await fetch(url)).blob()
  return new File([blob], name, { type })
}

async function fillPortrait() {
  const file = await loadDemoFile(DEMO_PORTRAIT, 'demo-photo.svg', 'image/svg+xml')
  store.setPortrait(file, DEMO_PORTRAIT)
}

// ---- 选择型字段：点选/再点取消；肤色为单档默认 olive（词表的 isDefault 档），不 toggle 成空 ----
function toggleOccasion(v) {
  store.occasion = store.occasion === v ? '' : v
}
function toggleSkinType(v) {
  store.skinType = store.skinType === v ? '' : v
}
function pickSkinTone(v) {
  store.skinTone = v
}
// ---- 天气实拉:只有这一条路(无手动预设)。失败只提示,绝不阻塞提交 ----
const weatherLoading = ref(false)

async function pullWeather() {
  const city = store.weatherCity.trim()
  if (!city || weatherLoading.value) return
  weatherLoading.value = true
  // 先清空再拉:旧数值对不上新城市,让「拉取中」期间显示的是空而不是上次的结果
  store.clearWeather()
  try {
    store.applyWeather(await fetchWeather({ city }))
  } catch (e) {
    store.setWeatherFailure(e?.message || '天气拉取失败')
  } finally {
    weatherLoading.value = false
  }
}

// ---- 生效中的天气回显:让用户看得见「提交上去的到底是什么」 ----
const WEATHER_SOURCE_CN = { 'open-meteo': '实时', mock: '离线示意' }
const weatherSourceLabel = computed(
  () => WEATHER_SOURCE_CN[store.weatherSource] || store.weatherSource || '未拉取'
)

const weatherSummary = computed(() => {
  const w = store.weather
  const parts = []
  if (w.condition) parts.push(w.condition)
  if (typeof w.temperatureC === 'number') parts.push(`${w.temperatureC}°C`)
  if (typeof w.humidityPct === 'number') parts.push(`湿度${w.humidityPct}%`)
  if (typeof w.uvIndex === 'number') parts.push(`UV${w.uvIndex}`)
  return parts.join(' · ')
})

function onFacePicked(file) {
  // 照片 URL 已由 PhotoUploader v-model 同步，这里记住真实 File 用于提交。
  store.portraitFile = file
}

/**
 * 提交。
 *
 * ✏️ 2026-09-29:底层换成了 agent 会话链(建会话带 brief → 传照片 → 发一句话)。
 * ★ **提交不等于出图**:出图要用户在出图那条消息上再点一次「确认生成」才会花钱
 *   (红线 §7.4)。所以这里只是把表单接进对话,然后交棒给结果页。
 */
async function submit() {
  if (!store.canSubmit) return
  error.value = ''
  store.startSubmit()
  try {
    const view = await submitMakeupForm({
      userId: user.id,
      portraitFile: store.portraitFile,
      brief: store.brief
    })
    store.finishSubmit(view.sessionId)
    router.push({ path: '/result' })
  } catch (e) {
    store.failSubmit()
    error.value = e?.message || '提交失败，请稍后再试'
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <button class="back-btn" @click="router.push('/')">
        <Icon name="arrowLeft" :size="18" />
      </button>
      <span class="title">为重要场合上妆</span>
      <span class="spacer"></span>
    </header>

    <LoadingOverlay v-if="store.submitting" text="正在提交…" />

    <!-- ① 本人照片 -->
    <section class="card">
      <h2 class="card-title">① 本人照片</h2>
      <p class="card-sub">妆容建议将基于这张脸。正面、光线均匀更佳，肤色才看得准。</p>
      <PhotoUploader
        v-model="store.portraitUrl"
        label="上传本人照片"
        sub="点击或拖拽图片"
        :height="'300px'"
        @change="onFacePicked"
      />
      <button v-if="!store.portraitUrl" class="text-link demo-link" type="button" @click="fillPortrait">
        用一张示例照片试试 →
      </button>
    </section>

    <!-- ② 场合与需求 -->
    <section class="card">
      <h2 class="card-title">② 这次为了什么？</h2>
      <p class="card-sub">妆容围绕「重要场合」搭配。选一个场合，或写一句自己的需求。</p>

      <div class="opt-grid occ-grid">
        <button
          v-for="o in OCCASION_OPTIONS"
          :key="o.value"
          type="button"
          class="opt occ"
          :class="{ on: store.occasion === o.value }"
          @click="toggleOccasion(o.value)"
        >
          <span class="opt-label">{{ o.label }}</span>
          <span class="opt-hint">{{ o.hint }}</span>
        </button>
      </div>

      <div class="text-area-wrap">
        <label class="caps" for="scene-text">补充一句你的期待（可选）</label>
        <textarea
          id="scene-text"
          v-model="store.sceneText"
          rows="2"
          maxlength="2000"
          placeholder="例：正式终面，希望显得沉稳又精神；或某天重要约会，想温柔一点……"
        ></textarea>
        <div class="text-meta">
          <span class="text-link" style="visibility: hidden">占位</span>
          <span class="count">{{ store.sceneText.length }}/2000</span>
        </div>
      </div>
    </section>

    <!-- ③ 肤质 · 肤色 · 穿搭 · 天气 -->
    <section class="card">
      <h2 class="card-title">③ 更了解你的脸</h2>
      <p class="card-sub">按真实肤质与肤色配妆——不追求「显白」，只为得体。</p>

      <label class="field-label caps">肤质</label>
      <div class="opt-grid">
        <button
          v-for="s in SKIN_TYPE_OPTIONS"
          :key="s.value"
          type="button"
          class="opt pill"
          :class="{ on: store.skinType === s.value }"
          @click="toggleSkinType(s.value)"
        >
          {{ s.label }}
        </button>
      </div>

      <label class="field-label caps">肤色</label>
      <div class="tone-row">
        <button
          v-for="t in SKIN_TONE_OPTIONS"
          :key="t.value"
          type="button"
          class="tone"
          :class="{ on: store.skinTone === t.value }"
          @click="pickSkinTone(t.value)"
        >
          <span class="tone-dot" :style="{ background: t.swatch }"></span>
          <span class="tone-cn">{{ t.label }}</span>
        </button>
      </div>

      <label class="field-label caps" for="dress-input">穿搭一句话（可选）</label>
      <input
        id="dress-input"
        v-model="store.dress"
        class="text-input"
        maxlength="80"
        placeholder="例：藏青西装 / 米色连衣裙"
      />

      <label class="field-label caps" for="weather-city">当天天气（可选 · 填城市自动拉取）</label>
      <div class="city-row">
        <input
          id="weather-city"
          v-model="store.weatherCity"
          class="text-input city-input"
          maxlength="32"
          placeholder="城市，例：北京"
          @keyup.enter="pullWeather"
        />
        <button
          class="btn btn-ghost city-btn"
          type="button"
          :disabled="!store.weatherCity.trim() || weatherLoading"
          @click="pullWeather"
        >
          {{ weatherLoading ? '拉取中…' : '拉取实时' }}
        </button>
      </div>
      <div class="weather-now" :class="{ warn: store.weatherWarn }">
        <span class="weather-now-tag caps">{{ weatherSourceLabel }}</span>
        <span class="weather-now-val">{{ weatherSummary || '未拉取' }}</span>
        <span v-if="store.weatherPlace" class="weather-now-place">{{ store.weatherPlace }}</span>
      </div>

      <p v-if="store.weatherNote" class="field-tip" :class="{ warn: store.weatherWarn }">
        {{ store.weatherNote }}
      </p>
    </section>

    <p v-if="error" class="field-tip warn submit-error">{{ error }}</p>

    <button
      class="btn btn-primary btn-block submit"
      :disabled="!store.canSubmit || isMock"
      @click="submit"
    >
      生成我的得体妆
    </button>
    <!-- ★ mock 模式下这条路**明确不可用**,不给假结果:提交之后那条链要真的开会话、
         真的传照片,而出图是一条会花钱的真实 HTTP 路由(理由同 `api/agent.js` 文件头)。 -->
    <p class="caps center-line">
      {{
        isMock
          ? '离线演示模式下这条链不可用——出图需要真实后端'
          : '将调用本地 TS 后端（:3000）'
      }}
    </p>
  </div>
</template>

<style scoped>
.page {
  gap: 14px;
  padding-bottom: 24px;
}

.demo-link {
  display: inline-block;
  margin-top: 10px;
}

/* ---- 选项 chip 组 ---- */
.opt-grid {
  display: grid;
  gap: 8px;
}

.occ-grid {
  grid-template-columns: repeat(3, 1fr);
}

.opt {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius-sm);
  background: var(--c-surface);
  color: var(--c-ink);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.opt.pill {
  flex-direction: row;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  padding: 8px 6px;
}

.opt-label {
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.opt-hint {
  font-size: 10.5px;
  color: var(--c-ink-faint);
}

.opt.on {
  border-color: var(--c-accent);
  background: var(--c-accent-soft);
  color: var(--c-accent-deep);
}

.opt.on .opt-hint {
  color: var(--c-accent-deep);
}

/* ---- 肤色 5 档 ----
   以「中间档」为中性默认、深肤色同样如实呈现，色卡与后端 skinTone 枚举一一对应。 */
/* 8 档排两行:一行放不下 8 个(440px 页宽 ÷ 8 ≈ 55px,而「深棕皮·中性偏暖」要 77px)。
   刻意不把标签改短 —— 中文名以词表为准,前端另造一套短名就又多一个漂移点。 */
.tone-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px 6px;
}

.tone {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  color: var(--c-ink-soft);
  padding: 0;
}

.tone-dot {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid var(--c-surface);
  box-shadow: 0 0 0 1px var(--c-line-strong);
  transition: box-shadow 0.15s ease, transform 0.12s ease;
}

.tone-cn {
  font-size: 11px;
}

.tone.on .tone-dot {
  box-shadow: 0 0 0 2px var(--c-accent);
  transform: scale(1.08);
}

.tone.on .tone-cn {
  color: var(--c-accent-deep);
  font-weight: 600;
}

/* ---- 天气：填城市实拉（无预设） ---- */
.city-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.city-input {
  flex: 1;
  min-width: 0;
}

.city-btn {
  flex: none;
  white-space: nowrap;
}

.city-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* 生效中的天气:把「提交上去的到底是什么」摆在眼前,而不是只给一句「已填入」 */
.weather-now {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 8px;
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid var(--c-line);
  border-radius: var(--radius);
  background: var(--c-surface-2);
}

.weather-now.warn {
  border-color: var(--c-accent);
  background: var(--c-accent-soft);
}

.weather-now-tag {
  flex: none;
  font-size: 10px;
  letter-spacing: 0.06em;
  padding: 2px 6px;
  border-radius: var(--radius-full);
  background: var(--c-surface);
  color: var(--c-ink-soft);
}

.weather-now.warn .weather-now-tag {
  color: var(--c-accent-deep);
}

.weather-now-val {
  font-size: 12px;
  color: var(--c-ink);
}

.weather-now-place {
  margin-left: auto;
  font-size: 11px;
  color: var(--c-ink-faint);
}

/* ---- 通用文本 ---- */
.field-label {
  display: block;
  margin: 16px 0 8px;
}

.text-input {
  width: 100%;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius-sm);
  background: var(--c-surface);
  color: var(--c-ink);
  font-family: inherit;
  font-size: 13px;
  padding: 10px 12px;
  outline: none;
}

.text-input:focus {
  border-color: var(--c-accent);
}

.text-area-wrap {
  margin-top: 16px;
}

.text-area-wrap label {
  display: block;
  margin-bottom: 8px;
}

textarea {
  width: 100%;
  resize: none;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius-sm);
  background: var(--c-surface);
  color: var(--c-ink);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.7;
  padding: 12px;
  outline: none;
}

textarea:focus {
  border-color: var(--c-accent);
}

.text-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
}

.text-meta .count {
  font-size: 11px;
  color: var(--c-ink-faint);
}

.field-tip {
  font-size: 11.5px;
  margin: 8px 0 0;
  color: var(--c-ink-faint);
}

.field-tip.warn {
  color: var(--c-accent-deep);
}

.submit-error {
  text-align: center;
}

.submit {
  margin-top: 2px;
}

.center-line {
  text-align: center;
  margin: 12px 0 0;
}
</style>
