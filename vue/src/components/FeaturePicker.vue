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

        <span v-for="f in libraryOf(g.id)" :key="f.id" class="feat-chip-wrap">
          <button
            type="button"
            class="feat-chip"
            :class="{ 'feat-chip--on': picked.has(featureIdOf(f.group, f.text)) }"
            :aria-pressed="picked.has(featureIdOf(f.group, f.text))"
            @click="toggle(featureIdOf(f.group, f.text))"
          >
            <Icon name="check" :size="14" />
            <span>{{ f.text }}</span>
          </button>
          <button
            type="button"
            class="feat-chip__del"
            :title="`把「${f.text}」从特征库里删掉`"
            @click="emit('remove-feature', f.id)"
          >
            ×
          </button>
        </span>

        <button
          v-for="id in orphanOf(g.id)"
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
 * ★ 自己加的那条存成 `<分组 id>/<原话>`(见下面的 `featureIdOf`)。前缀在这里就地拼 ——
 *   本组件**不 import `api/`**(§3 第 4 条),所以那条规则只有本文件与 `kb/features.js` 两处。
 * ★★ 那条同时**进了服务端一张账号共用的库**(`library`),所以别的脸也挑得到它;
 *   库里的每一条带 ✕ 能删,而**删的是库,不是当前这份档案** —— 所以这里只 emit,不自己动手。
 * ★★ 建 / 删都**不在这里落库**:emit 出去,由页面转调 store,值回来才进 `modelValue`。
 *   所以 `submitAdd` 之后那一格**不会立刻亮** —— 亮起来说明服务端真的收下了。
 * ★ 它在出图时**不走目录策略**,是并进「补充说明」那段话交给 agent 的(`api/design.js` 的 `toBrief`)。
 */
const props = defineProps({
  groups: { type: Array, default: () => [] },
  features: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] },
  /** 本账号自建的那几条(`{id, group, text}`,来自 `personas.customFeatures`)。★ kb 里那 31 条不在这里。 */
  library: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'add-feature', 'remove-feature'])

const picked = computed(() => new Set(props.modelValue))

/** 原话的长度上限。★ 服务端 `MAX_FEATURE_TEXT = 40` 与它是同一个数;拼出来再进 `MAX_FEATURE_ID = 64`。 */
const MAX_TEXT = 40

/** 这一组里用户自己建的那几条(整账号共用)。 */
function libraryOf(groupId) {
  return props.library.filter((f) => f.group === groupId)
}

/**
 * 这一组里**选中了但不在库里**的原话。
 * ★ 必须画出来:库是后加的,存量档案里可能有 `<分组>/<原话>` 而库里没有对应行 ——
 *   不画就是**静默丢掉用户写过的话**(勾了看不见,也去不掉)。
 */
function orphanOf(groupId) {
  const head = `${groupId}/`
  return props.modelValue.filter((id) => id.startsWith(head) && !props.library.some((f) => featureIdOf(f.group, f.text) === id))
}

/** 界面上只显示原话,不显示那个分组前缀。 */
function labelOf(id) {
  const cut = id.indexOf('/')
  return cut === -1 ? id : id.slice(cut + 1)
}

/**
 * 拼 `<分组 id>/<原话>`。★ 与 `kb/features.js` 的 `featureIdOf` 是同一条规则 ——
 * 本组件**不 import `api/`**(§3 第 4 条),所以这条规则**只有这两处**,别再抄第三处。
 */
function featureIdOf(groupId, text) {
  return `${groupId}/${text}`
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

/**
 * 只 emit:**发出去的是纯原话,不带分组前缀** —— 拼 `<分组>/<原话>` 是写进人设那一刻的事,
 * 由 store 一处做(页面拿到什么就 push 什么)。这里自己拼一次就会和服务端那份对不上。
 */
function submitAdd() {
  const text = draft.value.trim()
  const group = openGroup.value
  openGroup.value = ''
  if (!text || !group) return
  emit('add-feature', { group, text })
}
</script>
