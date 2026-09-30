<template>
  <section class="skin-picker">
    <header class="skin-picker__head">
      <h2 class="skin-picker__title">肤色<span class="skin-picker__req">必选 · 单选</span></h2>
      <p class="skin-picker__hint">
        {{ hint || '请按素颜自然光下的真实肤色选，别照着照片里的白平衡挑。' }}
      </p>
    </header>
    <div class="skin-picker__grid">
      <div v-for="t in tones" :key="t.id" class="skin-chip-wrap">
        <button
          type="button"
          class="skin-chip"
          :class="{ 'skin-chip--on': t.id === modelValue }"
          :title="t.desc"
          :aria-pressed="t.id === modelValue"
          @click="$emit('update:modelValue', t.id)"
        >
          <span class="skin-chip__dot" :style="{ background: t.hex }"></span>
          <span class="skin-chip__name">{{ t.name }}</span>
          <span class="skin-chip__desc">{{ t.tone || '自定义' }}</span>
        </button>
        <button
          v-if="manageable && t.custom"
          type="button"
          class="skin-chip__del"
          :title="`删掉「${t.name}」这一档`"
          @click="$emit('remove-tone', t.id)"
        >
          ×
        </button>
      </div>

      <button
        v-if="manageable && !adding"
        type="button"
        class="skin-chip skin-chip--add"
        @click="openAdd"
      >
        + 自建一档
      </button>
    </div>

    <form v-if="manageable && adding" class="skin-add" @submit.prevent="submitAdd">
      <span class="skin-add__preview" :style="{ background: draftHex }"></span>
      <input
        v-model="draftName"
        class="skin-add__name"
        type="text"
        maxlength="8"
        placeholder="这一档叫什么"
        aria-label="肤色档名字"
      />
      <input v-model="draftHex" class="skin-add__color" type="color" aria-label="肤色档颜色" />
      <button type="submit" class="btn btn--primary" :disabled="!draftName.trim()">存下</button>
      <button type="button" class="btn btn--soft" @click="adding = false">取消</button>
      <p class="skin-add__tip">颜色请按素颜自然光下的真实肤色调，别往白了调。</p>
    </form>
  </section>
</template>

<script setup>
import { ref } from 'vue'

/**
 * 肤色档单选(预置 8 档 + 账号自建的)。
 *
 * ★ 提示语**由调用方给**(`hint`):本组件在两处被渲染,详情页根本没有读脸这回事,
 *   写死一句含「AI」的提示会让那一屏跟着说假话(§8-1)。
 * ★ `manageable` 为真时才摆「+ 自建一档」与自建档上的 ✕ —— 只有人设库两屏该动这份库。
 * ★ 色块底色一律用 `t.hex`(真实肤底色),**不许调成「更白更好看」**;文案里不出现「显白」。
 */
defineProps({
  /** 全量档位(预置 + 自建);自建那几档带 `custom: true`。来自 store 的 `allSkinTones`。 */
  tones: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' },
  /** 提示语;空串 = 用那句中性的。★ 只有真跑过读脸的调用方,才配传含「AI」的那一版。 */
  hint: { type: String, default: '' },
  /** 能不能改这份库(建新档 / 删自建档)。 */
  manageable: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'add-tone', 'remove-tone'])

/** 新建表单展开/收起,以及它自己那两格(名字 / 颜色)。★ 不落 store —— 没点「存下」之前什么都不算。 */
const adding = ref(false)
const draftName = ref('')
/** 缺省色给**中调**。★ 别给浅色:那等于替用户预设了浅肤色审美(§8-1)。 */
const DEFAULT_HEX = '#c08552'
const draftHex = ref(DEFAULT_HEX)

function openAdd() {
  draftName.value = ''
  draftHex.value = DEFAULT_HEX
  adding.value = true
}

/** 建失败时 store 的 `error` 会给人话;这里照旧先收起表单,免得那句提示被自己的输入框挡住。 */
function submitAdd() {
  const name = draftName.value.trim()
  if (!name) return
  emit('add-tone', { name, hex: draftHex.value })
  adding.value = false
}
</script>
