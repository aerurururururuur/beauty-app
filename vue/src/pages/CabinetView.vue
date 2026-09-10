<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import { useCabinetStore } from '@/stores/cabinet'
import { useUserStore } from '@/stores/user'

/**
 * 衣橱页 —— 用户录自己的化妆品(名称 + **自定义特性**),存起来供后续 AI 推荐参考。
 * 特性不给枚举:「标签 + 值」由用户自己写。页首那三个快捷标签只是**省打字**,
 * 不是可选项清单——写了别的标签一样存。
 *
 * 进得来就一定是已登录(路由守卫把关,见 router/index.ts),
 * 所以这里不再自带账号表单,只留一条身份条 + 切换账号。
 */
const router = useRouter()
const user = useUserStore()
const cabinet = useCabinetStore()

/** 切换账号:清本地身份 → 回登录页。衣橱列表由下面 watch(user.id) 负责清干净。 */
function switchAccount() {
  user.logout()
  router.replace('/login')
}

// ---- 表单 ----
const blankRow = () => ({ label: '', value: '' })

const name = ref('')
const rows = ref([blankRow()])
const formError = ref('')
const editingId = ref('')
const pendingDeleteId = ref('')

const isEditing = computed(() => editingId.value !== '')
const canSubmitItem = computed(() => name.value.trim().length > 0 && !cabinet.saving)

/** 快捷标签:约定俗成的常用标签,点了只帮忙填标签名,值仍要自己写。 */
const QUICK_LABELS = ['品类', '色号', '质地']

function quickLabel(label) {
  // 已经在表单里了就不重复加(后端也会拒重复标签),静默跳过
  if (rows.value.some((r) => r.label.trim() === label)) return
  const blank = rows.value.find((r) => !r.label.trim() && !r.value.trim())
  if (blank) blank.label = label
  else rows.value.push({ label, value: '' })
}

function removeRow(index) {
  rows.value.splice(index, 1)
  if (rows.value.length === 0) rows.value.push(blankRow())
}

/**
 * 收集特性行。整行空 = 用户没填,忽略;只填一半则拦下来问清楚——
 * 半行发给后端会被判「特性名不能为空」,当场说比往返一次再报错清楚。
 * 长度、重复标签等规则不在这里重写,交给后端当唯一权威。
 */
function collectAttributes() {
  const list = []
  for (const row of rows.value) {
    const label = row.label.trim()
    const value = row.value.trim()
    if (!label && !value) continue
    if (!label) return { list: [], message: '有一条特性只填了值,还差特性名' }
    if (!value) return { list: [], message: `特性「${label}」还没填值` }
    list.push({ label, value })
  }
  return { list, message: '' }
}

function resetForm() {
  name.value = ''
  rows.value = [blankRow()]
  editingId.value = ''
  formError.value = ''
  cabinet.clearActionError()
}

async function submitItem() {
  formError.value = ''
  const trimmed = name.value.trim()
  if (!trimmed) {
    formError.value = '先给这件化妆品起个名字'
    return
  }
  const { list, message } = collectAttributes()
  if (message) {
    formError.value = message
    return
  }

  const ok = isEditing.value
    ? await cabinet.update(editingId.value, { userId: user.id, name: trimmed, attributes: list })
    : await cabinet.add({ userId: user.id, name: trimmed, attributes: list })
  if (ok) resetForm()
}

function startEdit(item) {
  editingId.value = item.id
  pendingDeleteId.value = ''
  name.value = item.name
  rows.value = item.attributes.length ? item.attributes.map((a) => ({ ...a })) : [blankRow()]
  formError.value = ''
  cabinet.clearActionError()
}

/** 两步删除:第一下变成「确认删」,第二下才真删。没有 modal 组件,就地确认。 */
async function pressDelete(item) {
  if (pendingDeleteId.value !== item.id) {
    pendingDeleteId.value = item.id
    return
  }
  const ok = await cabinet.remove({ id: item.id, userId: user.id })
  pendingDeleteId.value = ''
  if (ok && editingId.value === item.id) resetForm()
}

// 换账号(登录 / 退出)必须重来一遍:否则会把上一个人的化妆品显示给下一个人。
// immediate 顺带承担了首屏加载:没登录时 id 为空,直接清空。
watch(
  () => user.id,
  async (id) => {
    resetForm()
    pendingDeleteId.value = ''
    if (id) await cabinet.load(id)
    else cabinet.clear()
  },
  { immediate: true }
)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <button class="back-btn" aria-label="返回" @click="router.push('/')">
        <Icon name="arrowLeft" :size="16" />
      </button>
      <div class="title">我的衣橱</div>
      <div class="spacer" />
      <span class="caps">{{ cabinet.count }} 件</span>
    </header>

    <!-- ---- 身份条:进得来就一定是已登录(守卫把关,见 router/index.ts) ---- -->
    <section class="id-bar">
      <Icon name="user" :size="15" class="id-icon" />
      <span class="id-name">{{ user.nickname }}</span>
      <span class="caps id-note">的衣橱</span>
      <div class="spacer" />
      <button class="text-link" @click="switchAccount">切换账号</button>
    </section>

    <!-- ---- 录入表单 ---- -->
    <section class="card">
      <div class="caps">{{ isEditing ? 'EDIT' : 'ADD' }}</div>
      <h2 class="card-title">{{ isEditing ? '修改这件' : '添一件化妆品' }}</h2>
      <p class="card-sub">特性由你自己写——没有固定字段,写下你在意的就行。</p>

      <label class="field-label caps" for="item-name">名称</label>
      <input
        id="item-name"
        v-model="name"
        class="text-input"
        type="text"
        placeholder="如:豆沙色唇釉"
        @input="formError = ''"
      />

      <div class="rows-head">
        <span class="caps">特性(可留空)</span>
        <button class="text-link" @click="addRow()">+ 加一行</button>
      </div>

      <div v-for="(row, i) in rows" :key="i" class="attr-row">
        <input v-model="row.label" class="text-input attr-label" type="text" placeholder="标签" />
        <input v-model="row.value" class="text-input attr-value" type="text" placeholder="值" />
        <button class="row-del" aria-label="删掉这行" @click="removeRow(i)">
          <Icon name="trash" :size="14" />
        </button>
      </div>

      <div class="quick-row">
        <span class="caps quick-hint">常用标签</span>
        <button v-for="label in QUICK_LABELS" :key="label" class="quick-chip" @click="quickLabel(label)">
          {{ label }}
        </button>
      </div>

      <p v-if="formError || cabinet.actionError" class="field-tip warn">
        {{ formError || cabinet.actionError }}
      </p>

      <div class="form-actions">
        <button class="btn btn-primary" :disabled="!canSubmitItem" @click="submitItem">
          <Icon name="check" :size="15" />
          {{ isEditing ? '保存修改' : '存进衣橱' }}
        </button>
        <button v-if="isEditing" class="btn btn-ghost" @click="resetForm">取消</button>
      </div>
    </section>

    <!-- ---- 列表 ---- -->
    <section class="list-area">
      <p v-if="cabinet.loading" class="list-tip">正在读取…</p>
      <p v-else-if="cabinet.error" class="field-tip warn">{{ cabinet.error }}</p>
      <p v-else-if="cabinet.isEmpty" class="list-tip">
        衣橱还是空的。上面添一件试试——录得越细,之后配妆时越好参考。
      </p>

      <article v-for="item in cabinet.items" :key="item.id" class="item">
        <div class="item-head">
          <h3 class="item-name">{{ item.name }}</h3>
          <div class="item-ops">
            <button class="icon-btn" title="改一下" @click="startEdit(item)">
              <Icon name="edit" :size="14" />
            </button>
            <button
              class="icon-btn"
              :class="{ danger: pendingDeleteId === item.id }"
              :title="pendingDeleteId === item.id ? '再点一次确认删除' : '删除'"
              @click="pressDelete(item)"
            >
              <Icon name="trash" :size="14" />
            </button>
          </div>
        </div>

        <div v-if="item.attributes.length" class="item-attrs">
          <span v-for="attr in item.attributes" :key="attr.label" class="tag">
            {{ attr.label }} · {{ attr.value }}
          </span>
        </div>
        <p v-else class="item-noattr">没填特性——补上会更方便参考</p>

        <p v-if="pendingDeleteId === item.id" class="confirm-tip">再点一次删除,或点别处取消</p>
      </article>
    </section>

    <p class="hint">
      这份清单只用于给你配妆时参考「已经有什么、还缺什么」。<br />
      浏览器本地演示,不做真实用户数据留存。
    </p>
  </div>
</template>

<style scoped>
.page {
  gap: 18px;
}

/* ---- 账号区 ---- */
.field-label {
  display: block;
  margin: 16px 0 8px;
}

.text-input {
  width: 100%;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius-sm);
  background: var(--c-surface);
  color: var(--c-ink);
  font-family: inherit;
  font-size: 13px;
  padding: 10px 12px;
  outline: none;
}

.text-input:focus {
  border-color: var(--c-accent);
}

.field-tip {
  font-size: 11.5px;
  margin: 10px 0 0;
  color: var(--c-ink-faint);
  line-height: 1.7;
}

.field-tip.warn {
  color: var(--c-accent-deep);
}

/* ---- 身份条 ---- */
.id-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px 16px;
  border: 1px solid var(--c-line);
  border-radius: var(--radius);
  background: var(--c-surface);
}

.id-icon {
  color: var(--c-accent);
}

.id-name {
  font-family: var(--font-display);
  font-size: 14px;
}

.id-note {
  letter-spacing: 0.08em;
}

/* ---- 特性行 ---- */
.rows-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 18px 0 8px;
}

.attr-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.attr-label {
  flex: 0 0 32%;
}

.attr-value {
  flex: 1;
  min-width: 0;
}

.row-del {
  flex: 0 0 auto;
  width: 34px;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius-sm);
  color: var(--c-ink-faint);
  display: flex;
  align-items: center;
  justify-content: center;
}

.row-del:active {
  background: var(--c-surface-2);
  color: var(--c-accent-deep);
}

.quick-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.quick-hint {
  margin-right: 2px;
}

.quick-chip {
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius-full);
  background: var(--c-surface);
  color: var(--c-ink-soft);
  font-size: 11px;
  padding: 5px 11px;
}

.quick-chip:active {
  border-color: var(--c-accent);
  background: var(--c-accent-soft);
  color: var(--c-accent-deep);
}

.form-actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}

.form-actions .btn-primary {
  flex: 1;
}

/* ---- 列表 ---- */
.list-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.list-tip {
  font-size: 12px;
  line-height: 1.8;
  color: var(--c-ink-faint);
  margin: 0;
  padding: 14px 16px;
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--radius);
  text-align: center;
}

.item {
  border: 1px solid var(--c-line);
  border-radius: var(--radius);
  background: var(--c-surface);
  padding: 14px 16px;
}

.item-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.item-name {
  font-family: var(--font-display);
  font-size: 15px;
  letter-spacing: 0.02em;
  margin: 0;
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.item-ops {
  display: flex;
  gap: 6px;
  flex: 0 0 auto;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--c-line-strong);
  color: var(--c-ink-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:active {
  background: var(--c-surface-2);
}

.icon-btn.danger {
  border-color: var(--c-accent);
  background: var(--c-accent-soft);
  color: var(--c-accent-deep);
}

.item-attrs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.item-noattr {
  font-size: 11.5px;
  color: var(--c-ink-faint);
  margin: 8px 0 0;
}

.confirm-tip {
  font-size: 11px;
  color: var(--c-accent-deep);
  margin: 10px 0 0;
}

.hint {
  text-align: center;
  font-size: 11px;
  color: var(--c-ink-faint);
  margin: 4px auto 0;
  line-height: 1.8;
}
</style>
