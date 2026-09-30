<template>
  <section class="feat-picker">
    <header class="feat-picker__head">
      <h2 class="feat-picker__title">面部特征<span class="feat-picker__opt">选填 · 可多选</span></h2>
      <p class="feat-picker__hint">勾选后 AI 会调用对应的调整策略。</p>
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

        <button
          v-for="id in customOf(g.id)"
          :key="id"
          type="button"
          class="feat-chip feat-chip--on"
          :aria-pressed="true"
          :title="`去掉「${labelOf(id)}」`"
          @click="toggle(id)"
        >
          <Icon name="check" :size="14" />
          <span>{{ labelOf(id) }}</span>
        </button>

        <button
          v-if="openGroup !== g.id"
          type="button"
          class="feat-chip feat-chip--add"
          @click="openAdd(g.id)"
        >
          + 自定义
        </button>
      </div>

      <form v-if="openGroup === g.id" class="feat-add" @submit.prevent="submitAdd">
        <input
          v-model="draft"
          class="feat-add__input"
          type="text"
          :maxlength="MAX_TEXT"
          :placeholder="`在「${g.name}」里自己写一条`"
          aria-label="自定义特征"
        />
        <button type="submit" class="btn btn--primary" :disabled="!draft.trim()">加上</button>
        <button type="button" class="btn btn--soft" @click="openGroup = ''">取消</button>
      </form>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import Icon from '@/components/Icon.vue'

/**
 * 面部特征多选(按分组铺,**每一组都能自己加一条**)。
 *
 * 用在**两处**:人设问卷(建档时勾)与人设详情(改档案时勾)。两处的 `groups` / `features`
 * 都来自同一份知识库(`kb/features.js`)——别在页面里再抄一份标签。
 * `v-model` 绑的是**选中的特征 id 数组**,与 `api/personas.js` 的 `features: string[]` 逐字对应。
 * ★ 自己加的那条存成 `<分组 id>/<原话>`(见 `kb/features.js` 的 `featureLabel`)。前缀在这里就地拼 ——
 *   本组件**不 import `api/`**(§3 第 4 条),所以那条例外写法只有这两处,别再多一处。
 * ★ 它在出图时**不走目录策略**,是并进「补充说明」那段话交给 agent 的(`api/design.js` 的 `toBrief`)。
 */
const props = defineProps({
  groups: { type: Array, default: () => [] },
  features: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue'])

const picked = computed(() => new Set(props.modelValue))

/** 原话的长度上限。★ 服务端 `MAX_FEATURE_ID = 64` 算的是**整个** `<分组 id>/<原话>`,留出前缀余量。 */
const MAX_TEXT = 40

/** 这一组里用户自己加的那几条。 */
function customOf(groupId) {
  const head = `${groupId}/`
  return props.modelValue.filter((id) => id.startsWith(head))
}

/** 界面上只显示原话,不显示那个分组前缀。 */
function labelOf(id) {
  const cut = id.indexOf('/')
  return cut === -1 ? id : id.slice(cut + 1)
}

function featuresOf(groupId) {
  return props.features.filter((f) => f.group === groupId)
}

function toggle(id) {
  emit(
    'update:modelValue',
    picked.value.has(id) ? props.modelValue.filter((x) => x !== id) : [...props.modelValue, id]
  )
}

/** 一次只展开一组的新增输入框;空串 = 都收起。 */
const openGroup = ref('')
const draft = ref('')

function openAdd(groupId) {
  draft.value = ''
  openGroup.value = groupId
}

/** 同一组里已经写过一样的话就不重复加(重复 id 会存成两条,而界面上只看得见一个 chip)。 */
function submitAdd() {
  const text = draft.value.trim()
  const groupId = openGroup.value
  openGroup.value = ''
  if (!text || !groupId) return
  const id = `${groupId}/${text}`
  if (!picked.value.has(id)) emit('update:modelValue', [...props.modelValue, id])
}
</script>
