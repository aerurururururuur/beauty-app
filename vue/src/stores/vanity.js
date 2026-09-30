import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api/vanity'

/**
 * 数字美妆台 store。
 *
 * 数据分两半,与 `api/vanity.js` 的分法一一对应(那一半是哪一半,看它的文件头):
 *   · 目录(分类树 / 产品 / 色号 / 性质)—— 本地,`userId` 变了也不用重取;
 *   · 我的化妆包 —— 真后端 `/cabinet/items`,**按账号**,换账号必须重取。
 *
 * ★ 目录是**同步**的(`fetchCategoryProducts` / `fetchShades` 直接返回值,不是 Promise),
 *   所以「切分类 → 换产品 → 挑色号」这几步不进 loading 态、不 await——页面可以
 *   把色号面板当纯展示来写。只有化妆包的增删才需要等后端。
 *
 * ★ 本模块**被 `stores/user.js` 静态引**(logout 时要 reset),所以它和它引的东西
 *   都不能在模块顶层碰 axios。`api/vanity` 里那条 `./cabinet` 是惰性的,别改成静态。
 */

/** 「我的化妆包 / 全部产品」两个视图;存 sessionStorage,来回切页不跳回默认视图。 */
const VIEW_KEY = 'tz:vanityView'

function readView() {
  try {
    return sessionStorage.getItem(VIEW_KEY) === 'all' ? 'all' : 'bag'
  } catch {
    return 'bag' // 隐私模式:默认停在「我的化妆包」
  }
}

export const useVanityStore = defineStore('vanity', () => {
  /* ----------------------------- 状态 ----------------------------- */

  /** 当前数据属于哪个账号。换账号要重取化妆包,目录不必。 */
  const userId = ref('')
  /** 分类树(一级 → 二级),来自本地目录。 */
  const tree = ref([])
  /** 化妆包内存形状,见 `api/vanity.js` 的 `toBag`。 */
  const bag = ref({})
  /** 化妆包是**为哪个账号**取的。为空和「取过但是空的包」是两回事,别用 `bag` 是否为空判断。 */
  const loadedFor = ref('')

  const view = ref(readView())
  const busy = ref(false)
  const error = ref('')

  /* 全部产品视图:当前选中的分类 / 产品 / 色调 / 色号 */
  const activeCategoryId = ref('')
  const activeProductId = ref('')
  const activeTone = ref('all')
  const activeShadeCode = ref('')

  /* 添新宠视图 */
  const catalog = ref([])
  const addCategory = ref('all')
  const picked = ref([])

  /* ----------------------------- 派生 ----------------------------- */

  /** 化妆包按分类树分组(每组带 categoryName / groupName / items / shadeCount)。 */
  const bagGroups = computed(() => api.myBagGroups({ bag: bag.value }))
  /** 化妆包里的产品明细(每件带 ownedShades / ownedCount / needsShades)。 */
  const bagProducts = computed(() => api.myProducts({ bag: bag.value }))
  const bagPieceCount = computed(() => bagProducts.value.length)
  const bagShadeCount = computed(() =>
    bagProducts.value.reduce((sum, p) => sum + (p.ownedCount || 0), 0)
  )

  /** 当前分类下的产品,已把「我有的色号」并进去。 */
  const categoryProducts = computed(() => {
    if (!activeCategoryId.value) return []
    return api.fetchCategoryProducts(activeCategoryId.value).map((p) => ({
      ...p,
      codes: api.ownedShadesOf({ bag: bag.value, productId: p.id }),
    }))
  })

  const activeCategoryName = computed(() => api.categoryNameOf(activeCategoryId.value))
  const activeProduct = computed(
    () => categoryProducts.value.find((p) => p.id === activeProductId.value) || null
  )

  /** 这件产品的**全部**色号(不是「我有的」)。 */
  const shades = computed(() =>
    activeProductId.value ? api.fetchShades({ productId: activeProductId.value }).shades : []
  )
  /** 色调筛选项,按当前产品实际存在的色调生成。 */
  const toneFilters = computed(() =>
    activeProductId.value ? api.fetchToneFilters({ productId: activeProductId.value }) : []
  )
  /** 筛过色调之后要铺进格子的色号。 */
  const visibleShades = computed(() =>
    activeTone.value === 'all' ? shades.value : shades.value.filter((s) => s.toneKey === activeTone.value)
  )
  /** 面板上正在看的那一个色号;没选过就取第一个。 */
  const activeShade = computed(
    () => shades.value.find((s) => s.code === activeShadeCode.value) || shades.value[0] || null
  )
  const activeShadeOwned = computed(() => isOwnedShade(activeShade.value?.code))
  const productInfo = computed(() =>
    activeProductId.value ? api.fetchProductInfo({ productId: activeProductId.value }) : null
  )

  /** 添新宠:分类 chips 由候选产品自己的分类推出,不写死。 */
  const catalogCategories = computed(() => {
    const out = []
    for (const p of catalog.value) {
      if (!p.categoryName) continue
      const hit = out.find((c) => c.name === p.categoryName)
      if (hit) hit.count += 1
      else out.push({ name: p.categoryName, count: 1 })
    }
    return out
  })
  const catalogVisible = computed(() =>
    addCategory.value === 'all'
      ? catalog.value
      : catalog.value.filter((p) => p.categoryName === addCategory.value)
  )

  /* ----------------------------- 动作 ----------------------------- */

  /**
   * 进「数字美妆台」时调一次。已为同一账号取过就不重复请求化妆包;
   * 目录是本地数据,取一次就够。
   *
   * ★ `force` 只给「化妆包被别处改过」的场景用,常规进页不要传。
   */
  async function load(nextUserId, { force = false } = {}) {
    if (!tree.value.length) {
      tree.value = api.fetchVanityTree()
      if (!activeCategoryId.value) activeCategoryId.value = tree.value[0]?.children[0]?.id || ''
    }
    if (loadedFor.value === nextUserId && !force) {
      userId.value = nextUserId
      return
    }
    userId.value = nextUserId
    await guard(async () => {
      bag.value = await api.fetchBag({ userId: nextUserId })
      loadedFor.value = nextUserId
    })
  }

  /** 切到某账号的化妆包(登录/换账号后调。与 `load` 分开,免得每次进页都重取)。 */
  async function refreshBag() {
    if (!userId.value) return
    await guard(async () => {
      bag.value = await api.fetchBag({ userId: userId.value })
      loadedFor.value = userId.value
    })
  }

  /** 退出登录时清空。★ 目录可以留,化妆包**必须**清——它属于上一个账号。 */
  function reset() {
    userId.value = ''
    bag.value = {}
    loadedFor.value = ''
    activeCategoryId.value = tree.value[0]?.children[0]?.id || ''
    activeProductId.value = ''
    activeTone.value = 'all'
    activeShadeCode.value = ''
    catalog.value = []
    addCategory.value = 'all'
    picked.value = []
    error.value = ''
  }

  function setView(next) {
    view.value = next === 'all' ? 'all' : 'bag'
    try {
      sessionStorage.setItem(VIEW_KEY, view.value)
    } catch {
      /* 隐私模式:视图只在本次内存里生效 */
    }
  }

  /** 切分类:顺手清掉产品与色号的选中态,免得面板上留着上一个分类的色号。 */
  function selectCategory(id) {
    activeCategoryId.value = id
    activeProductId.value = ''
    activeShadeCode.value = ''
    activeTone.value = 'all'
    const first = categoryProducts.value[0]
    if (first) selectProduct(first.id)
  }

  /** 切产品:色调回到「全部」,并默认选中第一个色号(与源站一致,面板不留空)。 */
  function selectProduct(id) {
    activeProductId.value = id
    activeTone.value = 'all'
    activeShadeCode.value = shades.value[0]?.code || ''
  }

  function setTone(tone) {
    activeTone.value = tone
  }

  function selectShade(code) {
    activeShadeCode.value = code
  }

  /* --------------------- 化妆包:收一件 / 收色号 / 移出 --------------------- */

  function isOwnedShade(code) {
    return Boolean(code) && (bag.value[activeProductId.value]?.codes || []).includes(code)
  }

  /** 收进 / 移出当前选中的色号。产品若原本不在包里,收色号会连「整件」行一起建出来。 */
  async function toggleActiveShade() {
    const code = activeShade.value?.code
    if (!code || !userId.value) return
    await guard(async () => {
      const args = { userId: userId.value, bag: bag.value, productId: activeProductId.value, code }
      bag.value = activeShadeOwned.value ? await api.removeShade(args) : await api.addShade(args)
    })
  }

  async function dropShade(productId, code) {
    if (!userId.value) return
    await guard(async () => {
      bag.value = await api.removeShade({ userId: userId.value, bag: bag.value, productId, code })
    })
  }

  /** 整件移出:色号行与整件行一起删(只删一半的话这件还在包里)。 */
  async function dropProduct(productId) {
    if (!userId.value) return
    await guard(async () => {
      bag.value = await api.removeProduct({ userId: userId.value, bag: bag.value, productId })
    })
  }

  /** 点化妆包里的卡片 → 切到「全部产品」并展开这一件的色号。 */
  function openInAllView(productId) {
    setView('all')
    const hit = api.myProducts({ bag: bag.value }).find((p) => p.id === productId)
    if (!hit) return
    if (hit.category && hit.category !== activeCategoryId.value) {
      activeCategoryId.value = hit.category
      activeProductId.value = ''
    }
    selectProduct(productId)
  }

  /* ----------------------------- 添新宠 ----------------------------- */

  /** 候选 = 全量产品 − 已拥有,所以同一件不会重复入库。 */
  function loadCatalog() {
    catalog.value = api.fetchCatalogProducts({ ownedIds: Object.keys(bag.value) })
    addCategory.value = 'all'
    picked.value = []
  }

  function togglePick(id) {
    const at = picked.value.indexOf(id)
    if (at >= 0) picked.value.splice(at, 1)
    else picked.value.push(id)
  }

  function isPicked(id) {
    return picked.value.includes(id)
  }

  /** 批量收整件进包(色号为空,具体色号去「全部产品」里挑)。成功后回到化妆包视图。 */
  async function commitPicked() {
    if (!picked.value.length || !userId.value) return false
    const ok = await guard(async () => {
      bag.value = await api.addProducts({
        userId: userId.value,
        bag: bag.value,
        ids: [...picked.value],
      })
    })
    if (ok) {
      picked.value = []
      setView('bag')
    }
    return Boolean(ok)
  }

  /* ------------------------------ 工具 ------------------------------ */

  /**
   * 统一的忙碌 / 报错外壳。失败时把后端给的那句话(**原样**)放进 `error`,
   * 由页面显示——前端不按 `code` 分支,后端 message 就是给人看的。
   * 成功返回 fn 的返回值,失败返回 null,调用方按真假判断即可。
   */
  async function guard(fn) {
    busy.value = true
    error.value = ''
    try {
      return await fn()
    } catch (e) {
      error.value = e?.message || '操作失败,请稍后再试'
      return null
    } finally {
      busy.value = false
    }
  }

  return {
    // 状态
    userId,
    tree,
    bag,
    loadedFor,
    view,
    busy,
    error,
    activeCategoryId,
    activeProductId,
    activeTone,
    activeShadeCode,
    catalog,
    addCategory,
    picked,
    // 派生
    bagGroups,
    bagProducts,
    bagPieceCount,
    bagShadeCount,
    categoryProducts,
    activeCategoryName,
    activeProduct,
    shades,
    toneFilters,
    visibleShades,
    activeShade,
    activeShadeOwned,
    productInfo,
    catalogCategories,
    catalogVisible,
    // 动作
    load,
    refreshBag,
    reset,
    setView,
    selectCategory,
    selectProduct,
    setTone,
    selectShade,
    isOwnedShade,
    toggleActiveShade,
    dropShade,
    dropProduct,
    openInAllView,
    loadCatalog,
    togglePick,
    isPicked,
    commitPicked,
  }
})
