/**
 * api/vanity.js —— 数字美妆台的数据层。
 *
 * ★★ 2026-09-30:这个文件**不再是一半后端一半本地**了(那正是它此前最难读的一处,
 *   旧文件头那张「本地 kb / 真后端」的表已整张作废)。两半现在都走 HTTP,
 *   分法只剩**是不是账号数据**:
 *
 *   | 部分 | 来源 | 是账号数据吗 |
 *   | --- | --- | --- |
 *   | 分类树 / 产品卡 / 色号 / 产品性质 | `GET /api/products`(见 `api/products.js`) | 不是(品牌内容,全账号同一份) |
 *   | 「我拥有什么」(我的化妆包) | `/cabinet/items` | 是(按账号) |
 *
 *   ✏️ 此前目录那半是 `kb/{catalog,shades,products}.js` 三份**手写常量**,与后端 `products/`
 *   里的同一批内容各存一份(id 一套 slug、一套数字编号)。那三份已退役,内容并进了
 *   `products/overlay/`,色值也一起上了服务端。后果有两条,改这个文件之前要知道:
 *   · **全仓不许再另写一份产品数据或色值** —— 唯一来源是 `GET /api/products`;
 *   · 目录**不再是同步的**(`fetchCatalog()` 要等一个来回),加载态见 `stores/vanity.js`。
 *
 * ★ **本模块不给 mock 分支**(同 `agent.js` / `personas.js` / `weather.js`):编一份本地目录,
 *   正好把"真的接上了"和"看起来接上了"变成一模一样。
 *
 * ★ `./products` 与 `./cabinet` 两个传输层都必须**惰性取**,不许写成本文件顶部的静态 import:
 *   本模块被 `stores/vanity.js` 静态引,而后者被 `stores/user.js` 静态引(在首屏链上),
 *   静态引任何一个都等于把 axios 拽进首屏包(§6.3 那条 grep 盯的就是它)。
 *
 * ── 化妆包怎么落到 `/cabinet/items`(读这段再改这个文件) ──────────────────
 *
 * 后端那条端点的模型是 `{ name, attributes: [{label, value}] }`:
 *   · `name` ≤ 40 字;`attributes` ≤ 12 条、标签去重;
 *   · **单条特性值 ≤ 40 字符**(`cabinet/domain/validators/cosmetic-item.validator.ts`)——
 *     所以**不能**把「我有的色号」join 成一个字符串塞进一条特性:小金条有 14 个色号,
 *     拼起来 50 多字,一提交就 422,而界面上看起来一切正常。那是本仓的「假开关」类型。
 *
 * 于是按**色号粒度**落库,一件产品占若干行:
 *   · 「整件」行 —— `attributes = [{label:'产品', value:<pid>}]`
 *   · 「色号」行 —— `attributes = [{label:'产品', value:<pid>}, {label:'色号', value:<code>}]`
 *
 * 这不是硬凑:源站自己的口径就是「化妆包记录的是色号粒度,不是整件产品」。
 * 一件产品**恒有且只有一条「整件」行**——它是「这件在包里」的唯一凭据,
 * 所以丢掉最后一个色号时产品仍留在包里(与源站 `removeMyShade` 的行为一致)。
 *
 * ⚠️ 已知代价,别当成 bug:后端单用户上限 100 件(`MAX_ITEMS_PER_USER`),
 *   而这里一件产品 + N 个色号 = N+1 行。收录十几支口红的全部色号就会撞上限,
 *   届时后端回 `CABINET_FULL`(409)并给人话 message,前端照常原样展示即可。
 */

/** 特性标签:这两个字面值是本地与后端的**唯一**约定,改名等于让已有数据读不出来。 */
const ATTR_PRODUCT = '产品'
const ATTR_SHADE = '色号'

/* ================================================================== *
 * 一、产品目录:真后端 `GET /api/products`(品牌内容,与账号无关)
 * ================================================================== */

/**
 * 拉整库目录。形状见后端 `catalogViewSchema`,**原样返回,一格不改名**:
 *
 *   `{ groups: [{ id, label, children: [{ id, label }] }],
 *      products: [{ id, name, categoryId, categoryLabel, text, shadeCount, hasShades }],
 *      shades: { [产品 id]: { label, shades: [...] } } }`
 *
 * ★ `text` 是**卡片上那一行字**:服务端已经在"手写层那句"与"品牌资料首句"之间挑好了,
 *   前端不再自己拼,也不再有 `p.texture || p.desc` 那种兜底。
 * ★ 没有色号的产品**不进 `shades` 字典**。判据一律用卡片上的 `hasShades`,
 *   别在页面里拿 `shades[id]` 在不在来推同一件事(两处判它迟早会漂)。
 */
export async function fetchCatalog() {
  const { fetchProductCatalog } = await productsApi()
  return fetchProductCatalog()
}

/**
 * 一件产品的六维原文 + 手写补充(信息面板点开时才取)。
 * 返回 `{ id, name, categoryId, categoryLabel, number, dimensions[], wording[], shades? }`。
 * ★ `dimensions`(品牌资料原文)与 `wording`(我们补的)是**两段**,别并起来渲染——
 *   一行是品牌说的、一行是我们说的,并起来就分不清了(§8-5)。
 */
export async function fetchProductInfo({ productId = '' } = {}) {
  if (!productId) return null
  const { fetchProductDetail } = await productsApi()
  return fetchProductDetail(productId)
}

/** 色号字典里某件产品的全部色号。没收录 → 空数组(**不造占位块**)。 */
export function shadesOf(shades = {}, productId = '') {
  return shades[productId]?.shades || []
}

/**
 * 色调筛选器的可选项,依据这件产品实际有的色调生成(不写死暖/冷/中性三档)。
 * ★ 中文名从**色号自己身上**取(每个色号都带着 `tone`),所以不必再维持一张 TONE_LABEL 表
 *   ——那张表随 `kb/shades.js` 一起退役了,别加回来。
 */
export function toneFiltersOf(list = []) {
  const keys = [...new Set(list.map((s) => s.toneKey))]
  return [{ key: 'all', label: '全部', count: list.length }].concat(
    keys.map((k) => {
      const inKey = list.filter((s) => s.toneKey === k)
      return { key: k, label: inKey[0]?.tone || k, count: inKey.length }
    })
  )
}

/** id → 产品卡。化妆包那半要按 id 反查名字,不做线性查找。 */
export function cardsByIdOf(products = []) {
  const cards = {}
  for (const p of products) cards[p.id] = p
  return cards
}

/**
 * 产品图 URL。图在**前端** `vue/public/assets/products/` 下,所以**不拼 `API_BASE`**
 * (与 `avatarSrc` / `renderImageHref` / `photoUrl` 那三条走后端字节的相反)。
 * 命名是落图时定的:`<产品 id>.webp`;缺图时由页面回落 `.ph` 占位块,不代用别的图。
 */
export function productImageOf(id = '') {
  return id ? `/assets/products/${id}.webp` : ''
}

/** 试色图 URL。`<产品 id>__<色号>.webp`。★ 色号对不上的产品**没有图**,取不到就回落占位块。 */
export function shadeImageOf(id = '', code = '') {
  return id && code ? `/assets/products/${id}__${code}.webp` : ''
}

/** 分类 id → 分类名(从目录树里查,不另存一张表)。 */
export function categoryNameOf(groups = [], id = '') {
  for (const g of groups) {
    const hit = g.children.find((c) => c.id === id)
    if (hit) return hit.label
  }
  return ''
}

/* ================================================================== *
 * 二、化妆包:真后端(cabinet items)
 * ================================================================== */

/**
 * ★ `./cabinet` 必须**惰性取**,不许写成本文件顶部的静态 import。
 *   理由:本模块会被 `stores/vanity.js` 在首屏链上静态引用;静态引 `./cabinet` 就等于把 axios
 *   拽进首屏包(它只在「我的化妆包」那一屏才用得上)。判别方法见 `api/products.js` 那一段。
 */
function cabinet() {
  return import('./cabinet')
}

/** 目录那半的传输层。惰性理由同上,见文件头最后一段。 */
function productsApi() {
  return import('./products')
}

/** 化妆包的内存形状:`{ [productId]: { itemId, shadeItemIds: {code: itemId}, codes: [code] } }` */
function toBag(items) {
  const bag = {}
  for (const it of items) {
    const pid = attrValue(it, ATTR_PRODUCT)
    if (!pid) continue // 不是本模块写的条目(用户手录的化妆品),跳过
    if (!bag[pid]) bag[pid] = { itemId: '', shadeItemIds: {}, codes: [] }
    const code = attrValue(it, ATTR_SHADE)
    if (code) {
      bag[pid].shadeItemIds[code] = it.id
      if (!bag[pid].codes.includes(code)) bag[pid].codes.push(code)
    } else {
      bag[pid].itemId = it.id
    }
  }
  return bag
}

function attrValue(item, label) {
  return (item.attributes || []).find((a) => a.label === label)?.value || ''
}

/** 造一条化妆包条目的特性组。整件行不带「色号」标签,色号行才带。 */
function attributesFor(productId, code = '') {
  const attrs = [{ label: ATTR_PRODUCT, value: productId }]
  if (code) attrs.push({ label: ATTR_SHADE, value: code })
  return attrs
}

/** 读整个化妆包(一次列全,页面从内存里读,不再逐色号发请求)。 */
export async function fetchBag({ userId }) {
  const c = await cabinet()
  return toBag(await c.listCosmetics({ userId }))
}

/**
 * 批量收整件进包(「添新宠」)。已存在的自动跳过。
 * ★ 名字取自**已加载的目录**(`cards`)——今天目录在服务端,不可能再按 id 现查一次;
 *   `cards` 里没有的 id 直接丢(脏数据不该把整次提交栽掉)。
 */
export async function addProducts({ userId, bag, ids = [], cards = {} }) {
  const c = await cabinet()
  for (const id of ids) {
    if (bag[id]) continue
    const p = cards[id]
    if (!p) continue
    await c.addCosmetic({ userId, name: p.name, attributes: attributesFor(id) })
  }
  return fetchBag({ userId })
}

/** 收进某一个色号:产品若还不在包里,先把「整件」行建出来;色号行去重追加。 */
export async function addShade({ userId, bag, productId = '', code = '', cards = {} }) {
  const p = cards[productId]
  if (!code || !p) return bag
  const entry = bag[productId]
  if (entry?.shadeItemIds?.[code]) return bag
  const c = await cabinet()
  if (!entry) await c.addCosmetic({ userId, name: p.name, attributes: attributesFor(productId) })
  await c.addCosmetic({ userId, name: p.name, attributes: attributesFor(productId, code) })
  return fetchBag({ userId })
}

/** 丢掉某一个色号。整件行不动,所以产品仍留在包里。 */
export async function removeShade({ userId, bag, productId = '', code = '' }) {
  const itemId = bag[productId]?.shadeItemIds?.[code]
  if (!itemId) return bag
  const c = await cabinet()
  await c.removeCosmetic({ id: itemId, userId })
  return fetchBag({ userId })
}

/** 整件移出:先删色号行再删整件行——留着任一条,化妆包里那件就还在。 */
export async function removeProduct({ userId, bag, productId = '' }) {
  const entry = bag[productId]
  if (!entry) return bag
  const c = await cabinet()
  for (const itemId of Object.values(entry.shadeItemIds || {})) {
    await c.removeCosmetic({ id: itemId, userId })
  }
  if (entry.itemId) await c.removeCosmetic({ id: entry.itemId, userId })
  return fetchBag({ userId })
}

/* ================================================================== *
 * 三、化妆包的展示形状(纯推导,不发请求。目录由调用方传进来)
 * ================================================================== */

/** 把「我有的色号 code」还原成带名称与色值的完整色号(色值也只来自服务端那份)。 */
function withOwnedShades(p, codes = [], all = []) {
  const owned = codes
    .map((code) => all.find((s) => s.code === code))
    .filter(Boolean)
    .map((s) => ({ code: s.code, name: s.name, hex: s.hex }))
  return {
    ...p,
    codes: owned.map((s) => s.code),
    ownedShades: owned,
    ownedCount: owned.length,
    /** 产品有色号但一个都没收 → 卡片上要提示去挑色号 */
    needsShades: Boolean(p.hasShades) && owned.length === 0,
  }
}

/** 我有的产品明细:带 `categoryLabel` / `codes` / `ownedShades` / `ownedCount` / `needsShades`。 */
export function myProducts({ bag = {}, cards = {}, shades = {} } = {}) {
  return Object.keys(bag)
    .map((id) => cards[id])
    .filter(Boolean)
    .map((p) => withOwnedShades(p, bag[p.id]?.codes || [], shadesOf(shades, p.id)))
}

/**
 * 按分类树分组,顺序与产品树一致,只返回真正有存货的分类。
 * (源站的 getMyBagGroups:分组名与顺序都来自分类树,不写死。)
 */
export function myBagGroups({ bag = {}, cards = {}, shades = {}, groups = [] } = {}) {
  const items = myProducts({ bag, cards, shades })
  const ordered = groups.flatMap((g) =>
    g.children.map((c) => ({ id: c.id, label: c.label, groupLabel: g.label }))
  )
  return ordered
    .map((c) => {
      const inGroup = items.filter((p) => p.categoryId === c.id)
      return {
        categoryName: c.label,
        groupName: c.groupLabel,
        items: inGroup,
        shadeCount: inGroup.reduce((sum, p) => sum + p.ownedCount, 0),
      }
    })
    .filter((g) => g.items.length)
}

/** 化妆包里某件产品我有的那几个色号(不是这件产品的全部色号)。 */
export function ownedShadesOf({ bag = {}, productId = '' } = {}) {
  return bag[productId]?.codes || []
}
