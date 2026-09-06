<script setup>
import { useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'

const router = useRouter()

const steps = [
  { icon: 'camera', no: '01', title: '上传本人照片', desc: '一张正面自拍或照片，妆容将直接画在这张脸上。' },
  { icon: 'sparkle', no: '02', title: '给一个场景', desc: '上传风景图片，或写一句想要的氛围——雪山、海边、都市夜色……' },
  { icon: 'check', no: '03', title: 'AI 为你上妆', desc: 'AI 检索场景匹配的参考妆，为照片挑出合适的妆容并渲染。' }
]
</script>

<template>
  <div class="page home">
    <header class="hero">
      <div class="caps overline">SCENE MAKEUP · AI 妆容实验</div>
      <h1 class="brand">场景美妆镜</h1>
      <p class="lead">
        把「此刻的风景」当作灵感。<br />
        上传你的照片与想去的场景，AI 参考真实妆面，
        为这<em>张脸</em>配上合适的妆容。
      </p>
    </header>

    <section class="card steps">
      <div class="caps card-kicker">HOW IT WORKS</div>
      <ol class="step-list">
        <li v-for="s in steps" :key="s.no" class="step">
          <div class="step-no">{{ s.no }}</div>
          <div class="step-body">
            <div class="step-title">
              <Icon :name="s.icon" :size="15" class="step-icon" />
              {{ s.title }}
            </div>
            <p class="step-desc">{{ s.desc }}</p>
          </div>
        </li>
      </ol>
    </section>

    <div class="cta-area">
      <button class="btn btn-primary btn-block" @click="router.push('/upload')">
        <Icon name="upload" :size="16" />
        开始创作
      </button>
      <p class="hint">全程浏览器本地演示，不收集任何照片 · 后端引擎当前为骨架示例</p>
    </div>
  </div>
</template>

<style scoped>
.page {
  justify-content: center;
  gap: 22px;
}

.hero {
  text-align: center;
  padding: 28px 4px 6px;
}

.overline {
  letter-spacing: 0.22em;
}

.brand {
  font-family: var(--font-display);
  font-size: 46px;
  line-height: 1.2;
  margin: 12px 0 14px;
  letter-spacing: 0.06em;
}

.brand::first-letter {
  color: var(--c-accent);
}

.lead {
  font-size: 14px;
  line-height: 1.9;
  color: var(--c-ink-soft);
  margin: 0 auto;
  max-width: 300px;
}

.lead em {
  font-style: normal;
  color: var(--c-accent);
}

.steps {
  padding: 22px;
}

.card-kicker {
  margin-bottom: 14px;
}

.step-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.step {
  display: flex;
  gap: 14px;
}

.step + .step {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--c-line);
}

.step-no {
  font-family: var(--font-display);
  color: var(--c-accent);
  font-size: 18px;
  line-height: 1.1;
  flex-shrink: 0;
}

.step-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-display);
  font-size: 15px;
  letter-spacing: 0.02em;
}

.step-icon {
  color: var(--c-accent);
}

.step-desc {
  margin: 5px 0 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--c-ink-soft);
}

.cta-area {
  margin-top: 2px;
}

.hint {
  text-align: center;
  font-size: 11px;
  color: var(--c-ink-faint);
  margin: 14px auto 0;
  line-height: 1.7;
}
</style>
