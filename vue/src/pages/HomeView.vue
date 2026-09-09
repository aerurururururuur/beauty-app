<script setup>
import { useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'

const router = useRouter()

const steps = [
  {
    icon: 'camera',
    no: '01',
    title: '上传本人照片',
    desc: '一张正面照，妆容与肤色都按你真实的脸来配。'
  },
  {
    icon: 'sparkle',
    no: '02',
    title: '告诉我们要去哪儿',
    desc: '面试、约会、见家长、上台……再选肤质肤色、穿搭与天气。'
  },
  {
    icon: 'check',
    no: '03',
    title: '为你配一套得体妆',
    desc: 'AI 按「场合 × 你的肤色肤质」挑参考与色板，前后对比一目了然。'
  }
]
</script>

<template>
  <div class="page home">
    <header class="hero">
      <div class="caps overline">OCCASION MAKEUP · AI 妆容实验</div>
      <h1 class="brand">场合美妆镜</h1>
      <p class="lead">
        为那些<em>重要的时刻</em>，配一张体面、得体的脸。<br />
        面试、约会、见家长、上台——上传照片，
        告诉我们要去往哪个场合，AI 就为你配一套合适的妆容。
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
        开始配妆
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
  max-width: 320px;
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
