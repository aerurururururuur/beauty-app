/**
 * 产品目录 —— 数字美妆台里「能拿在手上的一件产品」的全量清单。
 *
 * ★ 本文件是纯数据,不碰 DOM、不发请求,和 kb/ 下其余四份同级。
 *   它原先写在源站的 api.js 里(叫 MOCK_PRODUCTS),搬过来时提成独立数据模块,
 *   理由是它属于「业务数据」而不是「数据层逻辑」——与 kb/ 的既有分工一致。
 *
 * 两条硬约定(源站 AGENTS.md 沿用):
 *   1. 只放「能拿在手上的一件产品」。kb/products.js 里偏「方案 / 套组」性质的条目
 *      (如「一周内维稳组合」)是护肤流程建议,不是可收纳的单品,不得进这里,
 *      否则会在产品位渲染成一张不是产品的卡。
 *   2. shadeCount 只是**兜底值**——真实色号数以 kb/shades.js 实际收录的为准
 *      (decorateProduct 会覆盖)。这里写的数只用于「色号库还没收录」的那几件。
 */

/** 二级分类 id → 产品清单。顺序即展示顺序。 */
export const CATALOG = {
  precare: [
    { id: 'sk-pureshots', name: 'Pure Shots 悦享青春系列', brand: 'YSL', desc: '夜皇后洁面 / 调肤水 / 精华 / 面霜 / 眼霜', shadeCount: 0, swatchUrl: '' },
    { id: 'sk-reload', name: 'Pure Shots Reload 系列', brand: 'YSL', desc: 'Reload 化妆水 / 精华 / 面霜', shadeCount: 0, swatchUrl: '' },
    { id: 'sk-orrouge', name: 'OR Rouge 藏金奢妍系列', brand: 'YSL', desc: '藏金洁面 / 柔肤水 / 精华乳 / 精华油 / 面霜 / 眼霜', shadeCount: 0, swatchUrl: '' },
  ],
  primer: [
    { id: 'pr-base', name: '完美调色妆前乳 SPF25 PA++', brand: 'YSL', desc: '调色款', shadeCount: 0, swatchUrl: '' },
    { id: 'pr-satin', name: '亮颜丝缎妆前乳', brand: 'YSL', desc: '提亮 · 平滑', shadeCount: 0, swatchUrl: '' },
    { id: 'pr-gold', name: '金钻妆前饰底乳', brand: 'YSL', desc: '细腻光泽', shadeCount: 0, swatchUrl: '' },
    { id: 'pr-uv', name: '名模肌密光幻防护妆前乳 SPF50 PA++++', brand: 'YSL', desc: '校色款', shadeCount: 0, swatchUrl: '' },
    { id: 'pr-sun1', name: '高能小滴管防晒乳 SPF50+ PA++++', brand: 'YSL', desc: '轻薄不搓泥', shadeCount: 0, swatchUrl: '' },
    { id: 'pr-sun2', name: '金致奢华赋活防晒隔离乳 SPF50 PA++++', brand: 'YSL', desc: '养肤防晒', shadeCount: 0, swatchUrl: '' },
    { id: 'pr-mist', name: '名模肌密保湿持妆喷雾', brand: 'YSL', desc: '打底 / 定妆两用', shadeCount: 0, swatchUrl: '' },
  ],
  base: [
    { id: 'base-cushion-pink', name: '粉气垫', brand: 'YSL', desc: '轻透奶油肌', shadeCount: 5, swatchUrl: '' },
    { id: 'base-cushion-black', name: '黑气垫', brand: 'YSL', desc: '哑光雾面持妆', shadeCount: 5, swatchUrl: '' },
    { id: 'base-fd-new', name: '恒久粉底液（新版）', brand: 'YSL', desc: '高遮瑕 · 24H 持妆', shadeCount: 11, swatchUrl: '' },
    { id: 'base-fd-old', name: '恒久粉底液（旧版）', brand: 'YSL', desc: '经典哑光', shadeCount: 5, swatchUrl: '' },
    { id: 'base-fd-supermodel', name: '超模粉底液', brand: 'YSL', desc: '柔光裸感', shadeCount: 6, swatchUrl: '' },
    { id: 'base-fd-youth', name: '逆龄粉底液 / 妍活青春', brand: 'YSL', desc: '养肤光泽', shadeCount: 4, swatchUrl: '' },
    { id: 'base-fd-feather', name: '羽毛粉底液', brand: 'YSL', desc: '轻若无感', shadeCount: 5, swatchUrl: '' },
    { id: 'base-fd-glow', name: '恒久光润粉底液', brand: 'YSL', desc: '色号待补', shadeCount: 0, swatchUrl: '' },
    { id: 'base-cream-or', name: '藏金粉霜', brand: 'YSL', desc: '色号待补', shadeCount: 0, swatchUrl: '' },
  ],
  concealer: [
    { id: 'con-hydra', name: '恒久完美补水遮瑕蜜', brand: 'YSL', desc: '水润不卡纹', shadeCount: 6, swatchUrl: '' },
    { id: 'con-touch', name: '明彩笔', brand: 'YSL', desc: '结构性遮瑕 / 提亮', shadeCount: 9, swatchUrl: '' },
  ],
  setting: [
    { id: 'st-powder', name: '恒久无瑕蜜粉 / 皮革散粉', brand: 'YSL', desc: '透明 · 无色号', shadeCount: 0, swatchUrl: '' },
    { id: 'st-pancake', name: '皮革蜜粉饼 / 大白饼', brand: 'YSL', desc: '透明 · 无色号', shadeCount: 0, swatchUrl: '' },
    { id: 'st-mist', name: '名模肌密保湿持妆喷雾', brand: 'YSL', desc: '定妆 · 保湿', shadeCount: 0, swatchUrl: '' },
  ],
  blush: [
    { id: 'bl-powder', name: '恒久完美透肤烟染腮红（粉状）', brand: 'YSL', desc: '柔雾晕染', shadeCount: 13, swatchUrl: '' },
    { id: 'bl-liquid', name: '恒久完美透肤烟染腮红（液态）', brand: 'YSL', desc: '透肤水光', shadeCount: 6, swatchUrl: '' },
  ],
  eye: [
    { id: 'eye-palette-4', name: '高定皮革四色眼影盘', brand: 'YSL', desc: '皮革压纹 · 高显色', shadeCount: 13, swatchUrl: '' },
    { id: 'eye-palette-10', name: '高定十色眼影盘', brand: 'YSL', desc: 'N°1 裸装', shadeCount: 1, swatchUrl: '' },
    { id: 'eye-liner', name: '敢爱自由眼线笔', brand: 'YSL', desc: '顺滑 · 防水', shadeCount: 12, swatchUrl: '' },
    { id: 'eye-lash-clash-wp', name: 'Lash Clash 睫毛膏（防水版）', brand: 'YSL', desc: '黑色 · 浓密卷翘', shadeCount: 0, swatchUrl: '' },
    { id: 'eye-lash-clash', name: 'Lash Clash 睫毛膏（非防水版）', brand: 'YSL', desc: '黑色 · 易卸除', shadeCount: 0, swatchUrl: '' },
    { id: 'eye-brow', name: '眉笔 Dessin Des Sourcils', brand: 'YSL', desc: '双头设计', shadeCount: 5, swatchUrl: '' },
  ],
  lip: [
    { id: 'lip-gold', name: '小金条 / 细管纯口红', brand: 'YSL', desc: '丝绒哑光 · 高显色 · 不拔干', shadeCount: 14, swatchUrl: '' },
    { id: 'lip-square', name: '方管口红', brand: 'YSL', desc: '经典方管 · 缎光', shadeCount: 11, swatchUrl: '' },
    { id: 'lip-pink', name: '小粉条', brand: 'YSL', desc: '水润透亮', shadeCount: 8, swatchUrl: '' },
    { id: 'lip-gloss', name: '黑管唇釉', brand: 'YSL', desc: '镜面水光', shadeCount: 15, swatchUrl: '' },
    { id: 'lip-lock-matte', name: '奢华印记锁吻雾唇釉', brand: 'YSL', desc: '锁色雾面', shadeCount: 1, swatchUrl: '' },
    { id: 'lip-lock-shine', name: '奢华印记锁心光唇釉', brand: 'YSL', desc: '色号待补', shadeCount: 0, swatchUrl: '' },
    { id: 'lip-candy', name: 'Candy Glaze 唇釉 / 唇膏', brand: 'YSL', desc: '色号待补', shadeCount: 0, swatchUrl: '' },
    { id: 'lip-plump', name: '丰唇唇釉 / 唇膏', brand: 'YSL', desc: '色号待补', shadeCount: 0, swatchUrl: '' },
    { id: 'lip-water', name: '水雾唇釉', brand: 'YSL', desc: '色号待补', shadeCount: 0, swatchUrl: '' },
    { id: 'lip-velvet', name: '细管丝绒纯口红', brand: 'YSL', desc: '色号待补', shadeCount: 0, swatchUrl: '' },
    { id: 'lip-liner', name: '塑形唇线笔', brand: 'YSL', desc: '色号待补', shadeCount: 0, swatchUrl: '' },
  ],
  contour: [
    { id: 'ct-powder', name: '恒久完美持久立体修容饼', brand: 'YSL', desc: '阴影 · 立体轮廓', shadeCount: 2, swatchUrl: '' },
    { id: 'ct-bronze', name: '古铜修容液', brand: 'YSL', desc: '液态古铜', shadeCount: 6, swatchUrl: '' },
    { id: 'ct-highlight', name: 'All Hours Hyper Luminize 高光', brand: 'YSL', desc: '细腻爆闪', shadeCount: 3, swatchUrl: '' },
    { id: 'ct-touch-hl', name: '明彩笔高光色', brand: 'YSL', desc: '局部提亮', shadeCount: 8, swatchUrl: '' },
    { id: 'ct-touch', name: '明彩笔（结构性遮瑕 / 提亮）', brand: 'YSL', desc: '经典提亮', shadeCount: 9, swatchUrl: '' },
  ],
}

/**
 * 产品树的形状:一级分类 → 二级分类。分类名与顺序都来自这里,页面不写死。
 * ★ 二级分类的 productCount 由本文件的数据实时算(见 vanityTree()),不手写——
 *   手写的老毛病是加一件产品忘了改计数,侧栏就长期显示一个对不上的数字。
 */
export const CATEGORY_GROUPS = [
  { id: 'skincare', name: '护肤', children: ['precare', 'primer'] },
  { id: 'makeup', name: '彩妆', children: ['base', 'concealer', 'setting', 'blush', 'eye', 'lip', 'contour'] },
]

/** 二级分类 id → 分类名。只在拿不到分类树时兜底(正式展示名以 CATEGORY_GROUPS 为准)。 */
export const CATEGORY_NAME = {
  precare: '提前护理',
  primer: '妆前',
  base: '底妆',
  concealer: '遮瑕',
  setting: '定妆',
  blush: '腮红',
  eye: '眼妆',
  lip: '口红',
  contour: '提亮 / 修容',
}

/** 分类树,productCount 由 CATALOG 实际条数推导。 */
export function vanityTree() {
  return CATEGORY_GROUPS.map((g) => ({
    id: g.id,
    name: g.name,
    children: g.children.map((id) => ({
      id,
      name: CATEGORY_NAME[id] || id,
      productCount: (CATALOG[id] || []).length,
    })),
  }))
}

/** 把分类字典铺平成一条产品列表,每项带上所属分类。 */
export function flatCatalog() {
  return Object.entries(CATALOG).flatMap(([category, list]) =>
    list.map((p) => ({ ...p, category, categoryName: CATEGORY_NAME[category] || '' }))
  )
}

/** 按 id 找一件产品(带分类信息);找不到返回 null。 */
export function productById(id) {
  return flatCatalog().find((p) => p.id === id) || null
}
