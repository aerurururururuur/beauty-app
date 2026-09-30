import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api/vanity'

/**
 * 数字美妆台 store。
 *
 * 数据分两半,与 `api/vanity.js` 的分法一一对应:
 *   · 目录(分类树 / 产品卡 / 色号 / 产品性质)—— **品牌内容**,`userId` 变了也不用重取;
 *   · 我的化妆包 —— 真后端 `/cabinet/items`,**按账号**,换账号必须重取。
 *
 * ★★ **2026-09-30:目录不再是同步的。** 它此前是本地 kb,取值是返回值;
 *   现在它来自 `GET /api/products`,要等一个来回。所以本 store 补上了它从来没有的加载态:
 *   `catalogLoading` / `catalogLoaded` / `catalogError`。
 *   ✏️ **加载态必须与「这一类暂无产品」分开**:请求还没回来就渲染「该分类暂无产品」,
 *   正是本仓头号 bug 类型(界面上看不出区别,只有结果是错的)。页面按三态渲染:
 *   加载中 / 后端那句人话的错 / 有数据。
 *
 * ★ **只多了这一个 async 点。** 目录一次整库拉回来之后,「切分类 → 换产品 → 挑色号」
 *   仍然是**同步**的(下面那些 computed 都从内存里的目录读),页面照旧可以当纯展示写。
 *   第二个 async 点是**信息面板**(`loadDetail`)——后端刻意把六维原文放在单条详情那条口上
 *   (整库带着它 payload 会翻几倍),所以点开某一件时另取一次,取到就缓存。
 *
 * ✏️ **2026-09-30 稍后:这一个 async 点被"预热"盖住了。** 一次往返实测只要 3–6 ms,
 *   但面板会先塌成一行「正在取…」再撑开 —— 一次点击两次重排,看着就是卡一下。
 *   所以进「全部产品」后按顺序把**当前分类**的详情先取回来(`prefetchCategory`),
 *   鼠标落到卡片上再补一件(`prefetchDetail`);点下去就是缓存命中,面板一次渲染换掉。
 *   整库 66 条的详情**不**一次推下来 —— 那正是后端把详情拆成第二条路由的理由。
 *
 * ★ 本模块**被 `stores/user.js` 静态引**(logout 时要 reset),所以它和它引的东西
 *   都不能在模块顶层碰 axios。`api/vanity` 里那两条 `import('./…')` 是惰性的,别改成静态。
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
  /** 化妆包内存形状,见 `api/vanity.js` 的 `toBag`。 */
  const bag = ref({})
  /** 化妆包是**为哪个账号**取的。为空和「取过但是空的包」是两回事,别用 `bag` 是否为空判断。 */
  const loadedFor = ref('')

  const view = ref(readView())
  const busy = ref(false)
  const error = ref('')

  /* 目录(品牌内容,整库一份,与账号无关) */
  /** 分类树(护肤 / 彩妆 → 九类)。空数组 = 还没拉回来,**不是**「没有分类」。 */
  const groups = ref([])
  /** 全部产品卡(含 `categoryId` / `categoryLabel` / `text` / `shadeCount` / `hasShades`)。 */
  const catalogProducts = ref([])
  /** `{ [产品 id]: { label, shades } }`。没有色号的产品**不在这个字典里**。 */
  const catalogShades = ref({})
  const catalogLoading = ref(false)
  const catalogLoaded = ref(false)
  /** 目录拉不到时后端/网络给的那句话。★ 与 `error`(化妆包那条)分开——两件事的处置不同。 */
  const catalogError = ref('')

  /** 点开某一件时拉的六维原文,取到就缓存(形状见 `GET /api/products/:id`)。 */
  const detailById = ref({})
  /** 正在取哪一件的详情。空串 = 没有在取。 */
  const detailLoadingId = ref('')
  const detailError = ref('')
  /** 在途锁(见 `fetchDetailOnce`)+ 预热轮次号(见 `prefetchCategory`)。**刻意都不是 state**。 */
  const inFlight = new Map()
  let prefetchGen = 0

  /* 全部产品视图:当前选中的分类 / 产品 / 色调 / 色号 */
  const activeCategoryId = ref('')
  const activeProductId = ref('')
  const activeTone = ref('all')
  const activeShadeCode = ref('')

  /* 添新宠视图 */
  const addCategory = ref('all')
  const picked = ref([])

  /* ----------------------------- 派生 ----------------------------- */

  const cardsById = computed(() => api.cardsByIdOf(catalogProducts.value))

  /** 化妆包按分类树分组(每组带 categoryName / groupName / items / shadeCount)。 */
  const bagGroups = computed(() =>
    api.myBagGroups({
      bag: bag.value,
      cards: cardsById.value,
      shades: catalogShades.value,
      groups: groups.value,
    })
  )
  /** 化妆包里的产品明细(每件带 ownedShades / ownedCount / needsShades)。 */
  const bagProducts = computed(() =>
    api.myProducts({ bag: bag.value, cards: cardsById.value, shades: catalogShades.value })
  )
  const bagPieceCount = computed(() => bagProducts.value.length)
  const bagShadeCount = computed(() =>
    bagProducts.value.reduce((sum, p) => sum + (p.ownedCount || 0), 0)
  )

  /** 当前分类下的产品,已把「我有的色号」并进去。 */
  const categoryProducts = computed(() => {
    if (!activeCategoryId.value) return []
    return catalogProducts.value
      .filter((p) => p.categoryId === activeCategoryId.value)
      .map((p) => ({
        ...p,
        codes: api.ownedShadesOf({ bag: bag.value, productId: p.id }),
      }))
  })

  const activeCategoryName = computed(() =>
    api.categoryNameOf(groups.value, activeCategoryId.value)
  )
  const activeProduct = computed(
    () => categoryProducts.value.find((p) => p.id === activeProductId.value) || null
  )

  /** 这件产品的**全部**色号(不是「我有的」)。 */
  const shades = computed(() =>
    activeProductId.value ? api.shadesOf(catalogShades.value, activeProductId.value) : []
  )
  /** 色调筛选项,按当前产品实际存在的色调生成。 */
  const toneFilters = computed(() =>
    activeProductId.value ? api.toneFiltersOf(shades.value) : []
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

  /** 信息面板的那一份原文;**还没取到就是 null**(页面据此渲染加载中)。 */
  const productInfo = computed(() =>
    activeProductId.value ? detailById.value[activeProductId.value] || null : null
  )
  /** 正在取的**就是当前这一件**——换个说法:`detailLoadingId` 是"谁在取",这是"它在不在取"。 */
  const detailLoading = computed(
    () => Boolean(activeProductId.value) && detailLoadingId.value === activeProductId.value
  )

  /** 添新宠:候选 = 全量产品 − 已拥有,所以同一件不会重复入库。 */
  const catalog = computed(() => catalogProducts.value.filter((p) => !(p.id in bag.value)))
  /** 分类 chips 由候选产品自己的分类推出,不写死。 */
  const catalogCategories = computed(() => {
    const out = []
    for (const p of catalog.value) {
      if (!p.categoryLabel) continue
      const hit = out.find((c) => c.name === p.categoryLabel)
      if (hit) hit.count += 1
      else out.push({ name: p.categoryLabel, count: 1 })
    }
    return out
  })
  const catalogVisible = computed(() =>
    addCategory.value === 'all'
      ? catalog.value
      : catalog.value.filter((p) => p.categoryLabel === addCategory.value)
  )

  /* ----------------------------- 动作 ----------------------------- */

  /**
   * 进「数字美妆台」时调一次。**先拉目录,再拉化妆包**(目录拿不到就没必要往下走)。
   * 已为同一账号取过就不重复请求化妆包;目录是品牌内容,取一次就够。
   *
   * ★ 返回 `false` = 目录没拉到,页面该整屏报错(`catalogError` 里是那句话)。
   *   页面**必须 `await`** 它,否则会在目录还是空的时候就渲染出「该分类暂无产品」。
   *
   * ★ `force` 只给「化妆包被别处改过」的场景用,常规进页不要传。
   */
  async function load(nextUserId, { force = false } = {}) {
    userId.value = nextUserId
    if (!catalogLoaded.value) {
      const ok = await loadCatalog()
      if (!ok) return false
    }
    if (loadedFor.value === nextUserId && !force) return true
    const ok = await guard(async () => {
      bag.value = await api.fetchBag({ userId: nextUserId })
      loadedFor.value = nextUserId
    })
    return Boolean(ok)
  }

  /**
   * 拉整库目录(品牌内容)。失败**不抛**,把后端/网络那句话放进 `catalogError`。
   * ★ 它自己也有 `catalogLoading`,而且**不进 `busy`**:目录是这一屏的地基,
   *   与「收一个色号」那种按钮级的忙碌不是一回事。
   */
  async function loadCatalog() {
    if (catalogLoading.value) return false
    catalogLoading.value = true
    catalogError.value = ''
    try {
      const view = await api.fetchCatalog()
      groups.value = view?.groups || []
      catalogProducts.value = view?.products || []
      catalogShades.value = view?.shades || {}
      catalogLoaded.value = true
      // 选中的分类若在新目录里不存在了(内容换过一版),回到第一个 —— 否则左边树是空的、
      // 中间写着「该分类暂无产品」,而那句话在这里是假的。
      if (!api.categoryNameOf(groups.value, activeCategoryId.value)) {
        activeCategoryId.value = groups.value[0]?.children[0]?.id || ''
        activeProductId.value = ''
        activeShadeCode.value = ''
      }
      // 只在用户真在看「全部产品」时预热;停在化妆包那一屏就一条都不发。
      if (view.value === 'all') prefetchCategory()
      return true
    } catch (e) {
      // 后端不起时 axios 的 message 是英文的,`api/index.js` 已经把它换成人话。
      catalogError.value = e?.message || '产品目录没能取回来,请稍后再试。'
      return false
    } finally {
      catalogLoading.value = false
    }
  }

  /** 切到某账号的化妆包(登录/换账号后调。与 `load` 分开,免得每次进页都重取)。 */
  async function refreshBag() {
    if (!userId.value) return
    await guard(async () => {
      bag.value = await api.fetchBag({ userId: userId.value })
      loadedFor.value = userId.value
    })
  }

  /**
   * 退出登录时清空。★ 目录可以留(品牌内容,不是账号数据),化妆包**必须**清——它属于上一个账号。
   * ★ 详情缓存要清:它是按产品缓存的内容,留着不脏,但账号一换就多一份没人读的内存。
   */
  function reset() {
    userId.value = ''
    bag.value = {}
    loadedFor.value = ''
    activeCategoryId.value = groups.value[0]?.children[0]?.id || ''
    activeProductId.value = ''
    activeTone.value = 'all'
    activeShadeCode.value = ''
    addCategory.value = 'all'
    picked.value = []
    error.value = ''
    detailById.value = {}
    detailLoadingId.value = ''
    detailError.value = ''
    prefetchGen += 1 // 停掉还在跑的预热轮次(已发出的那条不撤回,落地也只是品牌内容)
  }

  function setView(next) {
    view.value = next === 'all' ? 'all' : 'bag'
    try {
      sessionStorage.setItem(VIEW_KEY, view.value)
    } catch {
      /* 隐私模式:视图只在本次内存里生效 */
    }
    if (view.value === 'all') prefetchCategory()
  }

  /** 切分类:顺手清掉产品与色号的选中态,免得面板上留着上一个分类的色号。 */
  function selectCategory(id) {
    activeCategoryId.value = id
    activeProductId.value = ''
    activeShadeCode.value = ''
    activeTone.value = 'all'
    const first = categoryProducts.value[0]
    if (first) selectProduct(first.id)
    prefetchCategory()
  }

  /** 切产品:色调回到「全部」,并默认选中第一个色号(与源站一致,面板不留空)。 */
  function selectProduct(id) {
    activeProductId.value = id
    activeTone.value = 'all'
    activeShadeCode.value = shades.value[0]?.code || ''
    // 信息面板那份原文单独取(见 `loadDetail`)。**不等它**——色号面板立刻就能画,
    // 而那一块自己有加载态。
    loadDetail(id)
  }

  /**
   * 取一件详情,**同一件在途时复用那一条**(预热与点击会同时要它)。
   * 只写 `detailById` —— 加载态/错误态属于信息面板,预热不该动它们。
   */
  async function fetchDetailOnce(productId) {
    const cached = detailById.value[productId]
    if (cached) return cached
    if (inFlight.has(productId)) return inFlight.get(productId)
    const run = api
      .fetchProductInfo({ productId })
      .then((info) => {
        if (info) detailById.value = { ...detailById.value, [productId]: info }
        return info
      })
      .finally(() => inFlight.delete(productId))
    inFlight.set(productId, run)
    return run
  }

  /**
   * 鼠标落到卡片上时预热**那一件**。静默:失败什么都不写,点开时 `loadDetail` 会再取一次、
   * 并给出那句话。★ **不动 `prefetchGen`** —— 划过一张卡不该打断整分类那一轮。
   */
  function prefetchDetail(productId) {
    if (!productId || detailById.value[productId]) return
    fetchDetailOnce(productId).catch(() => {})
  }

  /**
   * 预热**当前分类**的六维原文,一次只发一条(不与用户点出来的那次抢)。
   * **静默**:失败什么都不写,点开时 `loadDetail` 会再取一次、并给出那句话。
   */
  async function prefetchCategory() {
    const gen = ++prefetchGen
    for (const p of categoryProducts.value) {
      if (gen !== prefetchGen) return // 换分类了:这一轮停下(已发出的那条不撤回)
      if (detailById.value[p.id]) continue
      try {
        await fetchDetailOnce(p.id)
      } catch {
        /* 静默,见上 */
      }
    }
  }

  /**
   * 取某一件的六维原文(取过就不重复取)。**不抛错**:失败时 `detailError` 里是那句话,
   * 页面把信息面板那一块换成一句提示,色号面板照旧可用。
   */
  async function loadDetail(productId) {
    // ★ 先清:上一件失败留下来的那句话不能挂在这一件下面。
    detailError.value = ''
    if (!productId || detailById.value[productId]) return
    detailLoadingId.value = productId
    try {
      await fetchDetailOnce(productId)
    } catch (e) {
      detailError.value = e?.message || '这件产品的资料没能取回来。'
    } finally {
      detailLoadingId.value = ''
    }
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
      const args = {
        userId: userId.value,
        bag: bag.value,
        productId: activeProductId.value,
        code,
        cards: cardsById.value,
      }
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
    const hit = bagProducts.value.find((p) => p.id === productId)
    if (!hit) return
    if (hit.categoryId && hit.categoryId !== activeCategoryId.value) {
      activeCategoryId.value = hit.categoryId
      activeProductId.value = ''
      prefetchCategory() // 换了分类:上一轮作废(见 `prefetchCategory`)
    }
    selectProduct(productId)
  }

  /* ----------------------------- 添新宠 ----------------------------- */

  /**
   * 进「添新宠」时调一次:候选是**推导**出来的(全量 − 已拥有),所以这里只重置筛选与勾选。
   * ✏️ 它以前叫 `loadCatalog`,而那时它真的去取一份目录——今天目录常驻内存,不再有"取"这件事,
   *   名字留着会让人以为漏了一次请求。
   */
  function enterAddView() {
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
        cards: cardsById.value,
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
    bag,
    loadedFor,
    view,
    busy,
    error,
    groups,
    catalogProducts,
    catalogShades,
    catalogLoading,
    catalogLoaded,
    catalogError,
    detailError,
    activeCategoryId,
    activeProductId,
    activeTone,
    activeShadeCode,
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
    detailLoading,
    catalog,
    catalogCategories,
    catalogVisible,
    // 动作
    load,
    loadCatalog,
    loadDetail,
    prefetchDetail,
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
    enterAddView,
    togglePick,
    isPicked,
    commitPicked,
  }
})
