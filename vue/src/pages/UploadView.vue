<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMakeupStore } from '@/stores/makeup'
import { createMakeupJob, useMock } from '@/api/makeup'
import { DEMO_PORTRAIT, DEMO_SCENERY, DEMO_SCENE_TEXT } from '@/api/mock'
import PhotoUploader from '@/components/PhotoUploader.vue'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import Icon from '@/components/Icon.vue'

const store = useMakeupStore()
const router = useRouter()

const sceneInput = ref(null)
const sceneMsg = ref('')
const error = ref('')

const MAX_SCENES = 6

/** 把静态素材载成一个 File（本人照 / 风景示例都能作为真实文件提交到后端）。 */
async function loadDemoFile(url, name, type) {
  const blob = await (await fetch(url)).blob()
  return new File([blob], name, { type })
}

async function fillPortrait() {
  const file = await loadDemoFile(DEMO_PORTRAIT, 'demo-photo.svg', 'image/svg+xml')
  store.setPortrait(file, DEMO_PORTRAIT)
}

async function fillScene() {
  const file = await loadDemoFile(DEMO_SCENERY, 'scenery.svg', 'image/svg+xml')
  store.addScene(file, URL.createObjectURL(file))
  if (!store.sceneText) store.setSceneText(DEMO_SCENE_TEXT)
}

function addSceneFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'))
  const room = MAX_SCENES - store.sceneFiles.length
  const pick = files.slice(0, room)
  pick.forEach((f) => store.addScene(f, URL.createObjectURL(f)))
  sceneMsg.value =
    files.length > room
      ? `风景图最多 ${MAX_SCENES} 张，已保留前 ${room} 张。`
      : ''
}

function onFacePicked(file) {
  // 照片 URL 已由 PhotoUploader v-model 同步，这里只需记住真实 File 用于提交。
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
      sceneText: store.sceneText
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
      <span class="title">准备一次上妆</span>
      <span class="spacer"></span>
    </header>

    <LoadingOverlay v-if="store.submitting" text="正在提交…" />

    <!-- 本人照片 -->
    <section class="card">
      <h2 class="card-title">① 本人照片</h2>
      <p class="card-sub">妆容将直接画在这张照片上。正面、光线均匀更佳。</p>
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

    <!-- 场景 -->
    <section class="card">
      <div class="scene-head">
        <h2 class="card-title">② 场景灵感</h2>
        <span class="caps scene-count">{{ store.sceneFiles.length }}/{{ MAX_SCENES }}</span>
      </div>
      <p class="card-sub">风景图或一句文字，二选一即可。AI 会据此选妆。</p>

      <div v-if="store.sceneUrls.length" class="scene-grid">
        <div v-for="(url, i) in store.sceneUrls" :key="url" class="scene-tile">
          <img :src="url" alt="场景预览" />
          <button class="remove" type="button" aria-label="移除" @click="store.removeScene(i)">×</button>
        </div>
        <button v-if="store.sceneFiles.length < MAX_SCENES" class="scene-add" type="button" @click="sceneInput?.click()">
          <Icon name="upload" :size="16" />
          <span>再添一张</span>
        </button>
      </div>

      <button
        v-if="!store.sceneFiles.length"
        class="btn btn-ghost scene-upload-btn"
        type="button"
        @click="sceneInput?.click()"
      >
        <Icon name="upload" :size="15" />
        上传风景图
      </button>
      <input
        ref="sceneInput"
        type="file"
        accept="image/*"
        multiple
        hidden
        @change="addSceneFiles($event.target.files)"
      />
      <p v-if="sceneMsg" class="field-tip warn">{{ sceneMsg }}</p>

      <div class="text-area-wrap">
        <label class="caps" for="scene-text">或描述想要的氛围</label>
        <textarea
          id="scene-text"
          v-model="store.sceneText"
          rows="3"
          maxlength="2000"
          placeholder="例：雪后黄昏，冷调，薄雾里的山峦与杉树…"
        ></textarea>
        <div class="text-meta">
          <button
            v-if="!store.sceneFiles.length && !store.sceneText"
            class="text-link"
            type="button"
            @click="fillScene"
          >
            一键填入示例场景 →
          </button>
          <span class="count">{{ store.sceneText.length }}/2000</span>
        </div>
      </div>
    </section>

    <p v-if="error" class="field-tip warn submit-error">{{ error }}</p>

    <button class="btn btn-primary btn-block submit" :disabled="!store.canSubmit" @click="submit">
      生成我的妆容
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

.scene-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.scene-count {
  font-size: 11px;
}

.scene-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 12px;
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

.scene-upload-btn {
  width: 100%;
  margin-bottom: 6px;
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
  margin-top: 8px;
}

.text-meta .count {
  font-size: 11px;
  color: var(--c-ink-faint);
}

.field-tip {
  font-size: 11.5px;
  margin: 6px 0 0;
}

.field-tip.warn {
  color: var(--c-accent-deep);
}

.submit {
  margin-top: 4px;
}

.center-line {
  text-align: center;
  margin: 12px 0 0;
}
</style>
