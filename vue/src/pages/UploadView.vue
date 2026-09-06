<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTryonStore } from '@/stores/tryon'
import PhotoUploader from '@/components/PhotoUploader.vue'
import TipBanner from '@/components/TipBanner.vue'
import Icon from '@/components/Icon.vue'
import { useMock, mockTips, DEMO_PHOTO } from '@/api/mock'

const router = useRouter()
const store = useTryonStore()

const tips = ref([])

function onPhoto() {
  // 演示模式：选了照片即给出模拟的 AI 拍摄指导；真实模式由后端分析后返回
  tips.value = useMock() ? mockTips : []
}

function useDemoPhoto() {
  store.setPhoto(null, DEMO_PHOTO)
  tips.value = useMock() ? mockTips : []
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <button class="back-btn" @click="router.push('/')"><Icon name="arrowLeft" :size="18" /></button>
      <div class="title">上传照片</div>
      <span class="spacer"></span>
    </header>

    <section class="card">
      <div class="card-head">
        <h3 class="card-title">自拍</h3>
        <span class="caps">必填</span>
      </div>
      <p class="card-sub">正面、自然光、唇部完整出镜</p>
      <PhotoUploader
        v-model="store.photoUrl"
        label="上传自拍"
        sub="点击或拖拽图片"
        @change="onPhoto"
      />
      <button v-if="!store.photoUrl" class="demo-link" @click="useDemoPhoto">
        没有照片？试试示例自拍
      </button>
    </section>

    <section class="card color-card">
      <div class="card-head">
        <h3 class="card-title">色卡</h3>
        <span class="caps">选填</span>
      </div>
      <p class="card-sub">含美妆色卡的照片，用于校准颜色</p>
      <PhotoUploader
        v-model="store.colorCardUrl"
        label="上传色卡"
        sub="选填"
        :height="'140px'"
      />
    </section>

    <TipBanner v-if="tips.length" :tips="tips" class="tips" />

    <button class="btn btn-primary btn-block next" :disabled="!store.photoUrl" @click="router.push('/lipstick')">
      选择色号
    </button>
  </div>
</template>

<style scoped>
.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.color-card {
  margin-top: 14px;
}

.demo-link {
  margin-top: 12px;
  font-size: 12px;
  color: var(--c-ink-soft);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--c-line-strong);
  width: 100%;
  text-align: center;
}

.tips {
  margin-top: 14px;
}

.next {
  margin-top: auto;
}
</style>
