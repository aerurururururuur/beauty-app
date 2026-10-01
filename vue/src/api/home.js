/**
 * api/home.js —— 首页 / 灵感广场 / 我的 三屏的展示内容。
 *
 * ★★ **后端没有这些端点**,`VITE_USE_MOCK` 也管不到这里。这一屏展示的
 *    **是策展好的演示内容,不是真实用户数据**——没有别人的作品、没有真实的点赞数、
 *    没有真实的粉丝数。当前端文案别把它讲成"社区正在发生的事"。
 *
 *    改这个文件只影响观感,不影响任何一条真实动线。接真后端时:
 *    把每个函数换成一次 HTTP 调用即可,页面不用改。
 *
 * ✏️ 2026-10-01:本文件**不再给「我的」页提供任何账号字段**。
 *   此前 `getProfile()` 里那三格(昵称 / 简介 / 头像)有一半是拿真人数据、一半是编的
 *   (简介那句「混合偏干皮…」是演示值,却和真昵称并排摆在同一个人名下面)。
 *   现在昵称 / 简介 / 头像由 `api/users.js` 走 `GET /users/:id` 取(真落盘),
 *   这里只剩**推出来的桃妆号 + 演示统计 + AI 档案标签**。
 */

/* ------------------------------ 首页 ------------------------------ */

/** 顶部轮播:5 张,`coverUrl` 为空时渲染 `.ph` 占位块而不是破图。 */
export const BANNERS = [
  { id: 'b1', tag: '本季主推', title: '枫糖轻暖妆', subtitle: '本季最多人收藏的妆容 · 3.8 万人已试妆', coverUrl: '' },
  { id: 'b2', tag: '趋势', title: '白开水通勤妆', subtitle: '干净到像没化妆', coverUrl: '' },
  { id: 'b3', tag: '国风', title: '国风桃枝照水', subtitle: '桃花妆也能日常化', coverUrl: '' },
  { id: 'b4', tag: '进阶', title: '雾面哑光秋冬妆', subtitle: '秋冬最上镜的一支棕调', coverUrl: '' },
  { id: 'b5', tag: '新手', title: '学生党五分钟出门妆', subtitle: '赶时间也能好看', coverUrl: '' },
]

export function getBanners() {
  return BANNERS
}

/**
 * 为你推荐 / 灵感瀑布流共用的作品卡。
 * `avatarColor` 是 `author` 上的字段(不是独立色值),由 ui 层直接铺成小圆点底色。
 */
export const RECOMMEND = [
  { id: 'r1', title: '盐系清透日常妆', coverUrl: '', author: { name: '晚晚不晚', avatarColor: '#e7a6ac' }, likes: 1286 },
  { id: 'r2', title: '枫糖暖调氛围妆', coverUrl: '', author: { name: '桃气少女阿柚', avatarColor: '#a1c2b1' }, likes: 2143 },
  { id: 'r3', title: '国风桃枝照水', coverUrl: '', author: { name: '沈叙白', avatarColor: '#b6d5c6' }, likes: 976 },
  { id: 'r4', title: '白开水通勤妆', coverUrl: '', author: { name: '林小满', avatarColor: '#d48d95' }, likes: 1654 },
]

export function getRecommend() {
  return RECOMMEND
}

/** 「偷偷变美」小贴士卡。`actionLabel` 是按钮文案,由数据给,不写死在模板里。 */
export const TIPS = [
  { id: 't1', title: '秋冬底妆怎么不卡粉？', actionLabel: '去试试' },
  { id: 't2', title: '圆脸适合的修容画法', actionLabel: '去试试' },
  { id: 't3', title: '单眼皮也能放大的眼妆', actionLabel: '去试试' },
  { id: 't4', title: '黄皮显白的口红色号', actionLabel: '去试试' },
]

export function getTips() {
  return TIPS
}

/** 近期热点话题。 */
export const TOPICS = [
  { id: 'p1', title: '# 白开水妆', desc: '这个妆感真的太干净了，通勤也扛得住', stat: '12.6 万人在试', coverUrl: '' },
  { id: 'p2', title: '# 枫糖暖棕', desc: '秋冬最上镜的一支棕调', stat: '9.4 万人在试', coverUrl: '' },
  { id: 'p3', title: '# 国风桃枝', desc: '桃花妆也能日常化', stat: '6.8 万人在试', coverUrl: '' },
  { id: 'p4', title: '# 素颜感底妆', desc: '像没化妆一样的好皮肤', stat: '15.2 万人在试', coverUrl: '' },
]

export function getTopics() {
  return TOPICS
}

/* ---------------------------- 灵感广场 ---------------------------- */

/** 分类 chips。第一项即默认选中项,页面不写死"默认选哪个"。 */
export const CATEGORIES = [
  { id: 'hot', label: '热门' },
  { id: 'autumn', label: '秋冬妆' },
  { id: 'work', label: '通勤妆' },
  { id: 'guofeng', label: '国风妆' },
  { id: 'copy', label: '星你仿妆' },
  { id: 'basic', label: '新手教程' },
]

export function getCategories() {
  return CATEGORIES
}

/**
 * 瀑布流作品。`coverHeight` 是每张卡的封面高度——瀑布流的错落**靠它产生**,
 * 不是靠 CSS 随机,所以它是数据不是样式。
 */
export const POSTS = [
  { id: 'i1', title: '橘调蜜桃妆｜约会必看', coverUrl: '', coverHeight: 300, author: { name: '桃气少女阿柚', avatarColor: '#e7a6ac' }, likes: 1286 },
  { id: 'i2', title: '雾面哑光秋冬妆', coverUrl: '', coverHeight: 260, author: { name: '沈叙白', avatarColor: '#a1c2b1' }, likes: 2143 },
  { id: 'i3', title: '学生党五分钟出门妆', coverUrl: '', coverHeight: 320, author: { name: '林小满', avatarColor: '#b6d5c6' }, likes: 976 },
  { id: 'i4', title: '复古港风红唇妆', coverUrl: '', coverHeight: 240, author: { name: '晚晚不晚', avatarColor: '#d48d95' }, likes: 1654 },
  { id: 'i5', title: '冷调裸妆的高级感', coverUrl: '', coverHeight: 240, author: { name: '桃气少女阿柚', avatarColor: '#e7a6ac' }, likes: 3021 },
  { id: 'i6', title: '桃花眼妆详细教程', coverUrl: '', coverHeight: 320, author: { name: '沈叙白', avatarColor: '#a1c2b1' }, likes: 1520 },
  { id: 'i7', title: '通勤伪素颜妆', coverUrl: '', coverHeight: 250, author: { name: '林小满', avatarColor: '#b6d5c6' }, likes: 864 },
  { id: 'i8', title: '微醺酒渍腮红', coverUrl: '', coverHeight: 300, author: { name: '晚晚不晚', avatarColor: '#d48d95' }, likes: 2380 },
]

/**
 * 按分类 + 排序取作品。
 * ★ `total` 是给人看的那句「为你找到 N 个作品」里的 N,**由本函数算**而不是模板里写死——
 *   不然换个分类计数还是旧的那个数。
 */
export function getPosts({ category = 'hot', sort = 'hot' } = {}) {
  const items = [...POSTS]
  if (sort === 'new') items.reverse()
  return {
    total: category === 'hot' ? '1.2 万' : `${items.length * 137}`,
    items,
    category,
    sort,
  }
}

/* ------------------------------ 我的 ------------------------------ */

/**
 * 「我的」页上那几格**不是账号数据**的东西。
 * ★ 三项统计与 AI 档案标签都是演示值(没有真实的作品库、也没有真的测过妆);
 *   昵称 / 简介 / 头像不在这里,它们走 `api/users.js` 的 `fetchProfile()`。
 *   `taozhuangId` 由 id 推出来,让页面上那个号码与当前账号对得上、刷新不变。
 */
export function getProfile({ userId = '' } = {}) {
  const suffix = String(userId).replace(/\W/g, '').slice(-7).toUpperCase() || '0000000'
  return {
    taozhuangId: `桃妆号 TZ-${suffix}`,
    stats: { works: 126, collections: 47, liked: 312, followers: 3412 },
    aiProfile: { tags: [{ label: '冷调一白' }, { label: '椭圆脸' }, { label: '淡颜系' }] },
  }
}

/** 我的作品 / 收藏 / 赞过。三个 Tab 的空态文案是产品要求,别统一成「暂无内容」。 */
export const WORKS_EMPTY = {
  works: '这里还空着，去设计第一个妆容吧',
  collections: '还没有收藏的妆容，去灵感广场逛逛',
  liked: '还没有点过赞的妆容',
}

const MY_WORKS = [
  { id: 'w1', title: '枫糖暖调氛围妆', coverUrl: '', coverHeight: 250, likes: 2143 },
  { id: 'w2', title: '盐系清透日常妆', coverUrl: '', coverHeight: 230, likes: 1286 },
  { id: 'w3', title: '国风桃枝照水', coverUrl: '', coverHeight: 270, likes: 976 },
  { id: 'w4', title: '白开水通勤妆', coverUrl: '', coverHeight: 240, likes: 1654 },
  { id: 'w5', title: '橘调蜜桃妆', coverUrl: '', coverHeight: 260, likes: 3021 },
  { id: 'w6', title: '雾面哑光秋冬妆', coverUrl: '', coverHeight: 230, likes: 2143 },
  { id: 'w7', title: '桃花眼妆教程', coverUrl: '', coverHeight: 250, likes: 1520 },
  { id: 'w8', title: '微醺酒渍腮红', coverUrl: '', coverHeight: 280, likes: 2380 },
]

export function getMyWorks({ tab = 'works' } = {}) {
  return tab === 'works' ? MY_WORKS : []
}
