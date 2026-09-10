import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { addCosmetic, listCosmetics, removeCosmetic, updateCosmetic } from '@/api/cabinet'

/**
 * cabinet store —— 衣橱列表与增删改。
 * 状态是「某个 userId 的清单」:换账号(或退出)时必须 clear(),
 * 否则会把上一个人的化妆品显示给下一个人。
 *
 * 写入一律「等后端成功后改本地」而不是乐观更新:衣橱条目少、演示网络就在本机,
 * 让界面显示的永远是后端真有的那一份,比抢那几十毫秒重要。
 */
export const useCabinetStore = defineStore('cabinet', () => {
  const items = ref([])
  const loading = ref(false) // 首次/切换账号时的列表加载
  const saving = ref(false) // 新增 / 修改 / 删除进行中
  const error = ref('') // 加载失败(挡住整个列表)
  const actionError = ref('') // 单次操作失败(表单旁提示,列表还在)

  const count = computed(() => items.value.length)
  const isEmpty = computed(() => !loading.value && items.value.length === 0)

  function clear() {
    items.value = []
    loading.value = false
    saving.value = false
    error.value = ''
    actionError.value = ''
  }

  async function load(userId) {
    if (!userId) return
    loading.value = true
    error.value = ''
    // ★ 先清空再拉:换账号时若留着上一个人的清单,拉取期间会把他的化妆品
    //   显示给现在这个人(列表块不是 v-else 链的一环,单靠 loading 挡不住)。
    items.value = []
    try {
      items.value = await listCosmetics({ userId })
    } catch (e) {
      error.value = e?.message || '衣橱读取失败'
      items.value = []
    } finally {
      loading.value = false
    }
  }

  async function add({ userId, name, attributes }) {
    if (saving.value) return false
    saving.value = true
    actionError.value = ''
    try {
      const created = await addCosmetic({ userId, name, attributes })
      items.value = [...items.value, created]
      return true
    } catch (e) {
      actionError.value = e?.message || '保存失败'
      return false
    } finally {
      saving.value = false
    }
  }

  async function update(id, { userId, name, attributes }) {
    if (saving.value) return false
    saving.value = true
    actionError.value = ''
    try {
      const next = await updateCosmetic(id, { userId, name, attributes })
      // 原地替换,保持列表顺序(后端按 createdAt 排,改名称不该让它跳位置)
      items.value = items.value.map((it) => (it.id === id ? next : it))
      return true
    } catch (e) {
      actionError.value = e?.message || '保存失败'
      return false
    } finally {
      saving.value = false
    }
  }

  async function remove({ id, userId }) {
    if (saving.value) return false
    saving.value = true
    actionError.value = ''
    try {
      await removeCosmetic({ id, userId })
      items.value = items.value.filter((it) => it.id !== id)
      return true
    } catch (e) {
      actionError.value = e?.message || '删除失败'
      return false
    } finally {
      saving.value = false
    }
  }

  function clearActionError() {
    actionError.value = ''
  }

  return {
    items,
    loading,
    saving,
    error,
    actionError,
    count,
    isEmpty,
    load,
    add,
    update,
    remove,
    clear,
    clearActionError
  }
})
