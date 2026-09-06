<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTryonStore } from '@/stores/tryon'
import CompareSlider from '@/components/CompareSlider.vue'
import Icon from '@/components/Icon.vue'
import { rgbCss, rgbToHex } from '@/utils/color'

const router = useRouter()
const store = useTryonStore()

onMounted(() => {
  // 直接访问结果页时回到上传
  if (!store.photoUrl || !store.selectedLipstick) router.replace('/upload')
})

const photoUrl = computed(() => store.photoUrl)
const lipstick = computed(() => store.selectedLipstick)
const result = computed(() => store.result)

// 真实模式使用后端返回的 resultUrl；mock 模式用 CSS 在唇部区域叠加唇色
const isMockTryon = computed(() => !result.value?.resultUrl)
const tintStyle = computed(() => ({
  background: rgbCss(lipstick.value?.rgb || [0, 0, 0], 0.85)
}))

function restart() {
  store.reset()
  router.replace('/upload')
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <button class="back-btn" @click="router.push('/lipstick')"><Icon name="arrowLeft" :size="18" /></button>
      <div class="title">试妆结果</div>
      <span class="spacer"></span>
    </header>

    <CompareSlider :default-pos="50" class="stage">
      <template #after>
        <div class="after-wrap">
          <img :src="photoUrl" alt="试色后" />
          <div v-if="isMockTryon" class="lip-tint" :style="tintStyle"></div>
        </div>
      </template>
      <template #before>
        <img :src="photoUrl" alt="原图" />
      </template>
    </CompareSlider>

    <div v-if="lipstick" class="lip-info">
      <div class="swatch" :style="{ background: rgbCss(lipstick.rgb) }"></div>
      <div class="info">
        <div class="brand caps">{{ lipstick.brand }}</div>
        <div class="name">{{ lipstick.name }}</div>
      </div>
      <div class="meta">
        <span class="finish caps">{{ lipstick.finish }}</span>
        <span class="hex">{{ rgbToHex(lipstick.rgb) }}</span>
      </div>
    </div>

    <section class="explain">
      <div class="explain-head">
        <span class="caps">大模型解读</span>
      </div>
      <p v-if="result?.explain" class="quote">{{ result.explain }}</p>
      <p v-else class="quote">试色完成。选择一个色号后，这里会展示大模型为你生成的试色解读。</p>

      <div v-if="result?.analysis" class="metrics">
        <div class="metric">
          <span class="caps">亮度</span>
          <b>{{ result.analysis.brightness }}</b>
        </div>
        <div class="metric">
          <span class="caps">色调</span>
          <b>{{ result.analysis.temperature }}</b>
        </div>
      </div>

      <ul v-if="result?.tips?.length" class="tips">
        <li v-for="(t, i) in result.tips" :key="i">
          <Icon name="check" :size="13" class="tip-check" />{{ t }}
        </li>
      </ul>
    </section>

    <div class="actions">
      <button class="btn btn-primary" @click="router.push('/lipstick')">换个色号</button>
      <button class="text-link redo" @click="restart">重新上传</button>
    </div>
  </div>
</template>

<style scoped>
.stage {
  margin-top: 18px;
}

.after-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}

.after-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* mock 试色：在嘴唇区域叠加唇色（正脸自拍嘴唇约在 50%, 46%） */
.lip-tint {
  position: absolute;
  left: 50%;
  top: 46%;
  transform: translate(-50%, -50%);
  width: 24%;
  aspect-ratio: 1.6;
  border-radius: 50% 50% 48% 52% / 58% 58% 42% 42%;
  filter: blur(12px);
  opacity: 0.92;
  mix-blend-mode: multiply;
  pointer-events: none;
}

.lip-info {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 2px;
  border-bottom: 1px solid var(--c-line);
}

.lip-info .swatch {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid var(--c-line);
  box-shadow: inset 0 -3px 8px rgba(42, 30, 34, 0.15);
  flex-shrink: 0;
}

.lip-info .info {
  flex: 1;
  min-width: 0;
}

.lip-info .brand {
  margin-bottom: 3px;
}

.lip-info .name {
  font-family: var(--font-display);
  font-size: 17px;
}

.lip-info .meta {
  text-align: right;
}

.lip-info .finish {
  display: block;
  margin-bottom: 5px;
}

.lip-info .hex {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--c-ink-faint);
}

.explain {
  margin-top: 22px;
}

.explain-head {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--c-line);
}

.quote {
  font-family: var(--font-display);
  font-size: 15px;
  line-height: 1.85;
  color: var(--c-ink);
  margin: 16px 0 0;
}

.metrics {
  display: flex;
  margin-top: 18px;
  border-top: 1px solid var(--c-line);
}

.metric {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px 6px 0;
}

.metric + .metric {
  border-left: 1px solid var(--c-line);
  padding-left: 14px;
}

.metric b {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 400;
}

.tips {
  list-style: none;
  margin: 18px 0 0;
  padding: 0;
}

.tips li {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 13px;
  color: var(--c-ink-soft);
  line-height: 1.7;
}

.tips li + li {
  margin-top: 8px;
}

.tip-check {
  color: var(--c-accent);
  margin-top: 3px;
  flex-shrink: 0;
}

.actions {
  display: flex;
  align-items: center;
  gap: 22px;
  margin-top: 28px;
}

.actions .btn {
  flex: 1;
}
</style>
