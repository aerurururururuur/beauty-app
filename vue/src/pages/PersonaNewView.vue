<template>
  <FlowTopbar
    :back-to="pick ? `/personas?scene=${encodeURIComponent(sceneId)}&pick=1` : '/personas'"
    title="捏个新人设"
  />

  <main class="content content--flow">
    <div class="flow-head">
      <h1 class="flow-head__title">先给这个人设一张脸</h1>
      <p class="flow-head__sub">照片只用于面部分析：AI 会读出建议肤色与面部特征，下一步由你确认</p>
    </div>

    <ErrorNote :text="personas.error" />

    <!-- 拍照 / 相册两种来源。input 藏起来,由两张卡分别触发 -->
    <div class="upload-row">
      <button class="upload-card" @click="pickFile({ camera: true })">
        <span class="upload-card__icon"><Icon name="camera" :size="40" color="var(--color-rose)" /></span>
        <span class="upload-card__title">拍照上传</span>
        <span class="upload-card__desc">正对镜头、光线均匀，当场拍一张</span>
      </button>
      <button class="upload-card" @click="pickFile()">
        <span class="upload-card__icon"><Icon name="upload" :size="40" color="var(--color-rose)" /></span>
        <span class="upload-card__title">相册上传</span>
        <span class="upload-card__desc">从相册选一张清晰的正面照</span>
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        :capture="useCamera"
        hidden
        @change="onFile"
      />
    </div>

    <!-- 选中照片后的预览与下一步 -->
    <div v-if="photo" class="photo-stage">
      <img class="photo-stage__img" :src="photo" alt="人设照片预览" />
      <div class="photo-stage__body">
        <div class="photo-stage__title">照片就绪</div>
        <div class="photo-stage__desc">下一步 AI 会读出建议肤色与面部特征，你确认后就建档</div>
        <RouterLink class="btn btn--primary" :to="quizTo">下一步：AI 面诊</RouterLink>
      </div>
    </div>
  </main>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import ErrorNote from '@/components/ErrorNote.vue'
import FlowTopbar from '@/components/FlowTopbar.vue'
import Icon from '@/components/Icon.vue'
import { useFilePick } from '@/composables/useFilePick'
import { useSceneQuery } from '@/composables/useSceneQuery'
import { usePersonasStore } from '@/stores/personas'

/**
 * 捏个新人设 · 第 1 步:给这个人设一张脸。
 *
 * ★ 照片**只在本机处理**:选完先缩到长边 ≤640 的 JPEG(`putDraftPhoto`),
 *   再存进本次会话的草稿里。**不上传、不进网络**。
 * ★ 草稿存 sessionStorage,所以刷新这一页照片还在(这就是 `photo` 直接读草稿的原因)。
 *   它会在建档成功或退出登录时被清掉。
 *
 * ★ 两张来源卡走的是同一个 input,只有 `capture="user"` 一行之差(手机上前置摄像头)。
 *   桌面上这个属性被忽略,所以两卡看起来一样——这是浏览器的行为,不是没生效。
 *
 * ✏️ 源站那两张卡的图标用的是 `camera40` / `upload40` 两个**不存在的图标名**,
 *    `icon()` 找不到就返回空串 ⇒ 源站的这两张卡上**一个图标都没有**,且不报错。
 *    这里改用真实存在的 `camera` / `upload`。
 */
const personas = usePersonasStore()

const { sceneId, pick } = useSceneQuery()

/** 草稿里已经有照片就直接进预览——返回上一步再进来时不用重选一张。 */
const photo = computed(() => personas.draft.photo || '')

/** 相机与相册共用同一个 input,只差 `capture` 一行(见 useFilePick)。 */
const { inputRef: fileInput, capture: useCamera, pick: pickFile } = useFilePick()

const quizTo = computed(() =>
  pick.value
    ? { path: '/personas/quiz', query: { scene: sceneId.value, pick: '1' } }
    : { path: '/personas/quiz' }
)

async function onFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  await personas.putDraftPhoto(file)
  event.target.value = ''
}
</script>
