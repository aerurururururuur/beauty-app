<template>
  <section class="feat-picker">
    <header class="feat-picker__head">
      <h2 class="feat-picker__title">面部特征<span class="feat-picker__opt">选填 · 可多选</span></h2>
      <p class="feat-picker__hint">勾选后 AI 会调用对应的调整策略；不勾也能生成，勾了会更贴合你。</p>
    </header>

    <div v-for="g in groups" :key="g.id" class="feat-group" :data-group="g.id">
      <div class="feat-group__head">
        <span class="feat-group__name">{{ g.name }}</span>
        <span class="feat-group__hint">{{ g.hint }}</span>
      </div>
      <div class="feat-group__chips">
        <button
          v-for="f in featuresOf(g.id)"
          :key="f.id"
          type="button"
          class="feat-chip"
          :class="{ 'feat-chip--on': picked.has(f.id) }"
          :title="f.desc"
          :aria-pressed="picked.has(f.id)"
          @click="toggle(f.id)"
        >
          <Icon name="check" :size="14" />
          <span>{{ f.name }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '@/components/Icon.vue'

/**
 * 面部特征多选(按分组铺)。
 *
 * 用在**两处**:人设问卷(建档时勾)与人设详情(改档案时勾)。所以它是共享组件,
 * 而且两处的 `groups` / `features` 都来自同一份知识库(`kb/features.js`)——
 * 别在页面里再抄一份标签。
 *
 * `v-model` 绑的是**选中的特征 id 数组**(不是对象),与 `api/personas.js` 的
 * `features: string[]` 逐字对应,中间不需要转换。
 */
const props = defineProps({
  groups: { type: Array, default: () => [] },
  features: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue'])

const picked = computed(() => new Set(props.modelValue))

function featuresOf(groupId) {
  return props.features.filter((f) => f.group === groupId)
}

function toggle(id) {
  emit(
    'update:modelValue',
    picked.value.has(id) ? props.modelValue.filter((x) => x !== id) : [...props.modelValue, id]
  )
}
</script>
