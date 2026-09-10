<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMakeupStore } from '@/stores/makeup'
import { createMakeupJob, useMock } from '@/api/makeup'
import { fetchWeather } from '@/api/weather'
import { DEMO_PORTRAIT } from '@/api/mock'
import {
  OCCASION_OPTIONS,
  SKIN_TYPE_OPTIONS,
  SKIN_TONE_OPTIONS,
  WEATHER_PRESETS
} from '@/constants/options'
import PhotoUploader from '@/components/PhotoUploader.vue'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import Icon from '@/components/Icon.vue'

const store = useMakeupStore()
const router = useRouter()

const sceneInput = ref(null)
const sceneMsg = ref('')
const error = ref('')

const MAX_SCENES = 6

/** 把静态示例照载成 File，作为真实文件提交（mock 下仅作预览亦可）。 */
async function loadDemoFile(url, name, type) {
  const blob = await (await fetch(url)).blob()
  return new File([blob], name, { type })
}

async function fillPortrait() {
  const file = await loadDemoFile(DEMO_PORTRAIT, 'demo-photo.svg', 'image/svg+xml')
  store.setPortrait(file, DEMO_PORTRAIT)
}

// ---- 选择型字段：点选/再点取消；肤色为单档默认 medium，不 toggle 成空 ----
function toggleOccasion(v) {
  store.occasion = store.occasion === v ? '' : v
}
function toggleSkinType(v) {
  store.skinType = store.skinType === v ? '' : v
}
function pickSkinTone(v) {
  store.skinTone = v
}
function pickWeather(p) {
  store.useWeatherPreset(p.value)
}

// ---- 天气实拉：失败只提示、绝不清空已填的天气，也绝不阻塞提交 ----
const weatherLoading = ref(false)

async function pullWeather() {
  const city = store.weatherCity.trim()
  if (!city || weatherLoading.value) return
  weatherLoading.value = true
  try {
    store.applyWeather(await fetchWeather({ city }))
  } catch (e) {
    store.setWeatherFailure(e?.message || '天气拉取失败')
  } finally {
    weatherLoading.value = false
  }
}

// ---- 可选风景参考图（不参与成片判定，仅回显） ----
function addSceneFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'))
  const room = MAX_SCENES - store.sceneFiles.length
  const pick = files.slice(0, room)
  pick.forEach((f) => store.addScene(f, URL.createObjectURL(f)))
  sceneMsg.value =
    files.length > room
      ? `氛围参考图最多 ${MAX_SCENES} 张，已保留前 ${room} 张。`
      : ''
}

function onFacePicked(file) {
  // 照片 URL 已由 PhotoUploader v-model 同步，这里记住真实 File 用于提交。
  store.portraitFile = file
}

async function submit() {
  if (!store.canSubmit) return
  error.value = ''
  store.startSubmit()
  try {
    const res = await createMakeupJob({
      portraitFile: store.portraitFile,
      sceneFiles: store.sceneFiles,
      brief: store.brief
    })
    store.finishSubmit(res.id)
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

      <label class="field-label caps" for="weather-city">当天天气（可选）</label>
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
      <p v-if="store.weatherNote" class="field-tip" :class="{ warn: store.weatherWarn }">
        {{ store.weatherNote }}
      </p>

      <div class="weather-row">
        <button
          v-for="p in WEATHER_PRESETS"
          :key="p.label"
          type="button"
          class="weather-chip"
          :class="{ on: store.weatherSource === 'manual' && store.weather.condition === p.value.condition && store.weather.temperatureC === p.value.temperatureC }"
          @click="pickWeather(p)"
        >
          {{ p.label }}
        </button>
      </div>
      <p class="field-tip">拉不到也没关系——上面任一预设都行，天气不影响提交。</p>
    </section>

    <!-- ④ 可选：氛围参考图 -->
    <section class="card faint">
      <div class="scene-head">
        <h2 class="card-title">④ 氛围参考图（可选）</h2>
        <span class="caps scene-count">{{ store.sceneFiles.length }}/{{ MAX_SCENES }}</span>
      </div>
      <p class="card-sub">实验加分项：上传风景图仅供回显参考，<b>不参与</b>妆容判定。跳过不影响结果。</p>

      <button
        v-if="!store.sceneFiles.length"
        class="btn btn-ghost scene-upload-btn"
        type="button"
        @click="sceneInput?.click()"
      >
        <Icon name="upload" :size="15" />
        上传氛围图（可不上传）
      </button>

      <div v-else class="scene-grid">
        <div v-for="(url, i) in store.sceneUrls" :key="url" class="scene-tile">
          <img :src="url" alt="氛围预览" />
          <button class="remove" type="button" aria-label="移除" @click="store.removeScene(i)">×</button>
        </div>
        <button v-if="store.sceneFiles.length < MAX_SCENES" class="scene-add" type="button" @click="sceneInput?.click()">
          <Icon name="upload" :size="16" />
          <span>再添一张</span>
        </button>
      </div>

      <input
        ref="sceneInput"
        type="file"
        accept="image/*"
        multiple
        hidden
        @change="addSceneFiles($event.target.files)"
      />
      <p v-if="sceneMsg" class="field-tip warn">{{ sceneMsg }}</p>
    </section>

    <p v-if="error" class="field-tip warn submit-error">{{ error }}</p>

    <button class="btn btn-primary btn-block submit" :disabled="!store.canSubmit" @click="submit">
      生成我的得体妆
    </button>
    <p class="caps center-line">
      {{ useMock() ? '当前为离线演示模式（mock）' : '将调用本地 TS 后端（:3000）' }}
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
.tone-row {
  display: flex;
  gap: 10px;
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

/* ---- 天气：城市实拉 + 预设 ---- */
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

.weather-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.weather-chip {
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius-full);
  background: var(--c-surface);
  color: var(--c-ink-soft);
  font-size: 11px;
  padding: 6px 10px;
  cursor: pointer;
}

.weather-chip.on {
  border-color: var(--c-accent);
  background: var(--c-accent-soft);
  color: var(--c-accent-deep);
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

/* ---- 氛围图（可选，弱化） ---- */
.faint .card-title,
.faint .card-sub {
  color: var(--c-ink-soft);
}

.scene-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.scene-count {
  font-size: 11px;
}

.scene-upload-btn {
  width: 100%;
  border-style: dashed;
  color: var(--c-ink-faint);
}

.scene-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.scene-tile {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--c-line-strong);
}

.scene-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  line-height: 1;
  border-radius: 50%;
  background: rgba(42, 30, 34, 0.55);
  color: #fff;
  font-size: 15px;
}

.scene-add {
  aspect-ratio: 4 / 3;
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--c-ink-faint);
  font-size: 11px;
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
