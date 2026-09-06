<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const steps = [
  { n: '01', text: '上传一张正面自拍' },
  { n: '02', text: '挑选心仪的口红色号' },
  { n: '03', text: '查看唇上的试色效果' }
]
</script>

<template>
  <div class="home">
    <header class="top">
      <span class="mark">时光</span>
      <span class="caps">TIME TRY-ON · 2026</span>
    </header>

    <div class="hero">
      <svg class="mirror" viewBox="0 0 120 150" aria-hidden="true">
        <path
          d="M30 6 h60 a24 24 0 0 1 24 24 v90 a24 24 0 0 1 -24 24 h-60 a24 24 0 0 1 -24 -24 v-90 a24 24 0 0 1 24 -24 z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
        />
        <path
          class="lip"
          d="M60 58 C 48 53 40 60 40 71 C 40 83 49 90 60 90 C 71 90 80 83 80 71 C 80 60 72 53 60 58 Z"
        />
      </svg>

      <h1 class="wordmark">时光试妆镜</h1>
      <p class="slogan">上传一张自拍，看口红色号<br />在你唇上的样子。</p>
    </div>

    <ol class="steps">
      <li v-for="s in steps" :key="s.n" class="step">
        <span class="n">{{ s.n }}</span>
        <span class="t">{{ s.text }}</span>
      </li>
    </ol>

    <button class="btn btn-primary btn-block cta" @click="router.push('/upload')">开始试色</button>

    <p class="note caps">AI 唇部识别 · 色卡校准 · 大模型解读</p>
  </div>
</template>

<style scoped>
.home {
  min-height: 100vh;
  max-width: 440px;
  margin: 0 auto;
  padding: 28px 32px 40px;
  display: flex;
  flex-direction: column;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--c-line);
}

.mark {
  font-family: var(--font-display);
  font-size: 15px;
  letter-spacing: 0.2em;
  color: var(--c-accent);
}

.hero {
  margin-top: 64px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.mirror {
  width: 108px;
  height: 135px;
  color: var(--c-ink);
  opacity: 0.85;
}

.lip {
  fill: var(--c-accent);
}

.wordmark {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 30px;
  letter-spacing: 0.16em;
  margin: 32px 0 16px;
  color: var(--c-ink);
}

.slogan {
  font-size: 13.5px;
  line-height: 1.9;
  color: var(--c-ink-soft);
  margin: 0;
}

.steps {
  list-style: none;
  margin: 60px 0 0;
  padding: 0;
  border-top: 1px solid var(--c-line);
}

.step {
  display: flex;
  align-items: baseline;
  gap: 18px;
  padding: 14px 2px;
  border-bottom: 1px solid var(--c-line);
}

.n {
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--c-accent);
  width: 26px;
}

.t {
  font-size: 14px;
  color: var(--c-ink);
}

.cta {
  margin-top: 40px;
}

.note {
  margin-top: 22px;
  text-align: center;
}
</style>
