import {
  CATALOG,
  CATEGORY_NAME,
  flatCatalog,
  productById,
  vanityTree,
} from './kb/catalog'
import { SHADE_LIBRARY, TONE_LABEL, shadesOf } from './kb/shades'
import { productInfoOf } from './kb/products'

/**
 * api/vanity.js —— 数字美妆台的数据层。
 *
 * ★ 本模块是**一半接后端、一半本地**的,两边必须分清(这是全仓最容易读错的一处):
 *
 *   | 部分 | 来源 | 为什么 |
 *   | --- | --- | --- |
 *   | 产品目录 / 分类树 / 色号库 / 产品性质 | 本地 `kb/` | **后端没有这些端点** |
 *   | 「我拥有什么」(我的化妆包) | 真后端 `/cabinet/items` | 有端点,且它就是「用户自己的化妆品」 |
 *
 *   上半部分是纯粹的本地数据,**不是 mock 分支**——`VITE_USE_MOCK` 对它无效,
 *   两种模式下行为逐字相同。别以为把开关拨到 `false` 就会去联网取产品目录:
 *   后端的 `products` 模块只给 agent 工具用,一条 HTTP 出口都没有
 *   (见 `server/src/app.ts` 注册的那几条路由)。
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
 * 一、本地部分:产品目录 / 色号 / 性质(后端无端点)
 * ================================================================== */

/** 分类树(一级 → 二级),productCount 由产品数据实时算。 */
export function fetchVanityTree() {
  return vanityTree()
}

/** 某个二级分类下的产品,已补齐色号数 / 质地 / 是否有色号。 */
export function fetchCategoryProducts(categoryId) {
  return (CATALOG[categoryId] || []).map(decorateProduct)
}

/** 全量产品 − 已拥有。「添新宠」用它,所以同一件不会重复入库。 */
export function fetchCatalogProducts({ ownedIds = [] } = {}) {
  const owned = new Set(ownedIds)
  return flatCatalog()
    .filter((p) => !owned.has(p.id))
    .map(decorateProduct)
}

/**
 * 取某产品的色号:优先走色号库,没收录时返回「色号待补」占位块。
 * ★ 色值只来自 `kb/shades.js`,任何地方都不许另写一份 hex。
 */
export function fetchShades({ productId = '', productName = '' } = {}) {
  const { shades } = shadesOf(productId, 6)
  return { productId, productName, shades }
}

/** 色调筛选器的可选项,依据当前产品实际存在的色调生成(不写死暖/冷/中性三档)。 */
export function fetchToneFilters({ productId = '' } = {}) {
  const { shades } = shadesOf(productId, 6)
  const keys = [...new Set(shades.map((s) => s.toneKey))]
  return [{ key: 'all', label: '全部', count: shades.length }].concat(
    keys.map((k) => ({
      key: k,
      label: TONE_LABEL[k] || k,
      count: shades.filter((s) => s.toneKey === k).length,
    }))
  )
}

/** 产品性质说明(质地 / 适用肤质 / 适用天气 / 成分预警 / 口碑)。 */
export function fetchProductInfo({ productId = '' } = {}) {
  return productInfoOf(productId)
}

/** 产品卡上的派生字段:色号数以色号库实际收录为准,质地取自性质库。 */
function decorateProduct(p) {
  const lib = SHADE_LIBRARY[p.id]
  const info = productInfoOf(p.id)
  return {
    ...p,
    shadeCount: lib ? lib.shades.length : p.shadeCount,
    hasShades: Boolean(lib),
    texture: info ? info.texture : p.desc,
  }
}

/** 把「我有的色号 code」还原成带名称与色值的完整色号(色值仍只来自色号库)。 */
function withOwnedShades(p, codes = []) {
  const base = decorateProduct(p)
  const all = SHADE_LIBRARY[p.id] ? SHADE_LIBRARY[p.id].shades : []
  const owned = codes
    .map((code) => all.find((s) => s.code === code))
    .filter(Boolean)
    .map((s) => ({ code: s.code, name: s.name, hex: s.hex }))
  return {
    ...base,
    codes: owned.map((s) => s.code),
    ownedShades: owned,
    ownedCount: owned.length,
    /** 产品有色号但一个都没收 → 卡片上要提示去挑色号 */
    needsShades: Boolean(base.hasShades) && owned.length === 0,
  }
}

/* ================================================================== *
 * 二、化妆包:真后端(cabinet items)
 * ================================================================== */

/**
 * ★ `./cabinet` 必须**惰性取**,不许写成本文件顶部的静态 import。
 *   理由:目录那半(上面一、)是纯 kb 数据,**不需要 axios**,而本模块会被
 *   `stores/vanity.js` 在首屏链上静态引用;静态引 `./cabinet` 就等于把 axios
 *   拽进首屏包(它只在「我的化妆包」那一屏才用得上)。
 *   判别方法:`npm run build` 后 axios 仍应待在独立分块里,与 `index-*.js` 分开。
 */
function cabinet() {
  return import('./cabinet')
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

/** 批量收整件进包(「添新宠」)。已存在的自动跳过。 */
export async function addProducts({ userId, bag, ids = [] }) {
  const c = await cabinet()
  for (const id of ids) {
    if (bag[id]) continue
    const p = productById(id)
    if (!p) continue // 只认真实存在于产品目录里的 id,脏数据直接丢
    await c.addCosmetic({ userId, name: p.name, attributes: attributesFor(id) })
  }
  return fetchBag({ userId })
}

/** 收进某一个色号:产品若还不在包里,先把「整件」行建出来;色号行去重追加。 */
export async function addShade({ userId, bag, productId = '', code = '' }) {
  if (!code || !productById(productId)) return bag
  const entry = bag[productId]
  if (entry?.shadeItemIds?.[code]) return bag
  const c = await cabinet()
  const p = productById(productId)
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
 * 三、化妆包的展示形状(纯推导,不发请求)
 * ================================================================== */

/** 我有的产品明细:带 `category` / `categoryName` / `codes` / `ownedShades`。 */
export function myProducts({ bag = {} } = {}) {
  return Object.keys(bag)
    .map((id) => productById(id))
    .filter(Boolean)
    .map((p) => withOwnedShades(p, bag[p.id]?.codes || []))
}

/**
 * 按 YSL 原有目录分组,顺序与产品树一致,只返回真正有存货的分类。
 * (源站的 getMyBagGroups:分组名与顺序都来自分类树,不写死。)
 */
export function myBagGroups({ bag = {} } = {}) {
  const items = myProducts({ bag })
  const ordered = vanityTree().flatMap((group) =>
    group.children.map((c) => ({ id: c.id, name: c.name, groupName: group.name }))
  )
  return ordered
    .map((c) => {
      const inGroup = items.filter((p) => p.category === c.id)
      return {
        category: c.id,
        categoryName: c.name,
        groupName: c.groupName,
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

/** 分类 id → 分类名。 */
export function categoryNameOf(id) {
  return CATEGORY_NAME[id] || ''
}
