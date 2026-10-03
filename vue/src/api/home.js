/**
 * api/home.js —— 首页 / 灵感广场 / 我的 三屏的展示内容。
 *
 * ★★ **后端没有这些端点**。这一屏展示的
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

/**
 * 帖子封面 URL:图在**前端** `vue/public/assets/posts/`,命名 = `<帖子 id>.webp`,不拼 `API_BASE`。
 * ★ 这是**生成的 AI 妆容渲染**(源图池 `帖子封面图片/{首页,灵感,我的}/`),不是商品图。
 * ✏️ 2026-10-03 换了一轮图(25 张,按标题对 id),同一个妆面不再跨页复用;缺图回落 `.ph`。
 */
function postCoverOf(id) {
  return `/assets/posts/${id}.webp`
}

/* ------------------------------ 首页 ------------------------------ */

/**
 * 顶部轮播:5 张,`coverUrl` 为空时渲染 `.ph` 占位块而不是破图。
 * ★ 页面今天只渲染第 1 张(b2~b5 不进 DOM),后四张没有配图,留空。
 */
export const BANNERS = [
  { id: 'b1', tag: '本季主推', title: '枫糖轻暖妆', subtitle: '本季最多人收藏的妆容 · 3.8 万人已试妆', coverUrl: postCoverOf('b1') },
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
  { id: 'r1', title: '盐系清透日常妆', coverUrl: postCoverOf('r1'), author: { name: '晚晚不晚', avatarColor: '#e7a6ac' }, likes: 1286 },
  { id: 'r2', title: '枫糖暖调氛围妆', coverUrl: postCoverOf('r2'), author: { name: '桃气少女阿柚', avatarColor: '#a1c2b1' }, likes: 2143 },
  { id: 'r3', title: '国风桃枝照水', coverUrl: postCoverOf('r3'), author: { name: '沈叙白', avatarColor: '#b6d5c6' }, likes: 976 },
  { id: 'r4', title: '白开水通勤妆', coverUrl: postCoverOf('r4'), author: { name: '林小满', avatarColor: '#d48d95' }, likes: 1654 },
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

/**
 * 近期热点话题。
 * ★ p3 的源图是「港式复古妆」——国风已在 b3 / r3 各出现一次,这一格按源图名换成港风话题。
 */
export const TOPICS = [
  { id: 'p1', title: '# 白开水妆', desc: '这个妆感真的太干净了，通勤也扛得住', stat: '12.6 万人在试', coverUrl: postCoverOf('p1') },
  { id: 'p2', title: '# 枫糖暖棕', desc: '秋冬最上镜的一支棕调', stat: '9.4 万人在试', coverUrl: postCoverOf('p2') },
  { id: 'p3', title: '# 港式复古妆', desc: '浓唇淡眼，拍港风照片最省事的一套', stat: '6.8 万人在试', coverUrl: postCoverOf('p3') },
  { id: 'p4', title: '# 素颜感底妆', desc: '像没化妆一样的好皮肤', stat: '15.2 万人在试', coverUrl: postCoverOf('p4') },
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
 *
 * ★ `coverUrl` = `vue/public/assets/posts/<id>.webp`(见 `postCoverOf`)。
 * ★ `desc` / `collected` / `comments` 同样是策展文案,**不是真有人写过、点过**。
 */
export const POSTS = [
  {
    id: 'i1',
    title: '橘调蜜桃妆｜约会必看',
    coverUrl: postCoverOf('i1'),
    coverHeight: 300,
    desc: '暖橘腮红压在苹果肌最高点，唇上是低饱和的水光桃色。灯光下最显气色的一套，约会前十分钟就能画完。',
    author: { name: '桃气少女阿柚', avatarColor: '#e7a6ac' },
    likes: 1286,
    collected: 642,
    comments: [
      { id: 'i1-c1', user: '安之若素', avatarColor: '#a1c2b1', text: '腮红打在苹果肌最高点这句救了我，以前一直往颧骨外侧扫，难怪显脏。' },
      { id: 'i1-c2', user: '小满', avatarColor: '#e7a6ac', text: '桃色唇釉是哪一支呀，求个色号。' },
      { id: 'i1-c3', user: 'Momo', avatarColor: '#b6d5c6', text: '说十分钟能画完是真的，昨天赶着出门试了一次。' },
    ],
  },
  {
    id: 'i2',
    title: '雾面哑光秋冬妆',
    coverUrl: postCoverOf('i2'),
    coverHeight: 260,
    desc: '底妆压成雾面，唇上换成红棕哑光。秋冬穿大衣时最上镜的一套，怕干的先薄涂一层润唇打底。',
    author: { name: '沈叙白', avatarColor: '#a1c2b1' },
    likes: 2143,
    collected: 1180,
    comments: [
      { id: 'i2-c1', user: '阿柚', avatarColor: '#e7a6ac', text: '红棕哑光配大衣是真的绝，整个冬天都在用这一支。' },
      { id: 'i2-c2', user: '林间', avatarColor: '#d48d95', text: '干唇先薄涂一层润唇这步太重要了，我跳过直接起皮。' },
    ],
  },
  {
    id: 'i3',
    title: '学生党五分钟出门妆',
    coverUrl: postCoverOf('i3'),
    coverHeight: 320,
    desc: '只用三件：气垫、腮红、唇釉。玫瑰粉腮红扫在苹果肌，唇上叠一层薄涂，素颜感但气色在线。',
    author: { name: '林小满', avatarColor: '#b6d5c6' },
    likes: 976,
    collected: 508,
    comments: [
      { id: 'i3-c1', user: '可乐不加冰', avatarColor: '#b6d5c6', text: '三件套真的够了，以前总觉得少点啥，越加越脏。' },
      { id: 'i3-c2', user: '晚晚不晚', avatarColor: '#d48d95', text: '玫瑰粉扫苹果肌，气色一下就上来了。' },
      { id: 'i3-c3', user: '温野', avatarColor: '#a1c2b1', text: '早八人狂喜。' },
    ],
  },
  {
    id: 'i4',
    title: '复古港风红唇妆',
    coverUrl: postCoverOf('i4'),
    coverHeight: 240,
    desc: '复古正红唇配干净底妆，浓的是唇、淡的是眼。想拍港风照片的时候，这一套最省事。',
    author: { name: '晚晚不晚', avatarColor: '#d48d95' },
    likes: 1654,
    collected: 902,
    comments: [
      { id: 'i4-c1', user: '沈叙白', avatarColor: '#a1c2b1', text: '浓唇配淡眼这个思路是对的，两边都浓就俗了。' },
      { id: 'i4-c2', user: '一枚栗子', avatarColor: '#e7a6ac', text: '正红唇配什么底妆比较好？我每次都卡粉。' },
    ],
  },
  {
    id: 'i5',
    title: '冷调裸妆的高级感',
    coverUrl: postCoverOf('i5'),
    coverHeight: 240,
    desc: '茶棕裸唇加上冷调修容，整张脸往冷里走一格。日常戴眼镜也不会显得妆重。',
    author: { name: '桃气少女阿柚', avatarColor: '#e7a6ac' },
    likes: 3021,
    collected: 1530,
    comments: [
      { id: 'i5-c1', user: '青川', avatarColor: '#b6d5c6', text: '茶棕裸唇找了好久，终于看到有人认真讲冷调修容。' },
      { id: 'i5-c2', user: '白露', avatarColor: '#d48d95', text: '戴眼镜那句是真的，妆一浓配镜框就很奇怪。' },
    ],
  },
  {
    id: 'i6',
    title: '桃花眼妆详细教程',
    coverUrl: postCoverOf('i6'),
    coverHeight: 320,
    desc: '先把冷白高光点在眼头和卧蚕，再用浅棕铺满眼窝。拆成四步，手生的也能跟着画。',
    author: { name: '沈叙白', avatarColor: '#a1c2b1' },
    likes: 1520,
    collected: 864,
    comments: [
      { id: 'i6-c1', user: '林小满', avatarColor: '#b6d5c6', text: '卧蚕单独拆一步太贴心了，我以前一直画成一坨。' },
      { id: 'i6-c2', user: '阿桃', avatarColor: '#e7a6ac', text: '眼头高光用冷白还是暖白呀？' },
      { id: 'i6-c3', user: 'Nono', avatarColor: '#a1c2b1', text: '跟着画了一遍，第一次觉得自己眼妆能看。' },
    ],
  },
  {
    id: 'i7',
    title: '通勤伪素颜妆',
    coverUrl: postCoverOf('i7'),
    coverHeight: 250,
    desc: '通透暖杏的水光唇，眼妆只画内眼线。会议室里看得出化了妆，但看不出化了什么。',
    author: { name: '林小满', avatarColor: '#b6d5c6' },
    likes: 864,
    collected: 402,
    comments: [
      { id: 'i7-c1', user: '周末不睡懒觉', avatarColor: '#d48d95', text: '「看得出化了妆但看不出化了什么」，这句太准了。' },
      { id: 'i7-c2', user: '秋分', avatarColor: '#b6d5c6', text: '内眼线是我的死穴，每次都画出去。' },
    ],
  },
  {
    id: 'i8',
    title: '微醺酒渍腮红',
    coverUrl: postCoverOf('i8'),
    coverHeight: 300,
    desc: '腮红打在眼下与鼻梁交界处，做成刚喝完一杯的暖粉感。冷调肤色也能压得住。',
    author: { name: '晚晚不晚', avatarColor: '#d48d95' },
    likes: 2380,
    collected: 1204,
    comments: [
      { id: 'i8-c1', user: '桃气少女阿柚', avatarColor: '#e7a6ac', text: '眼下和鼻梁交界这个位置太关键了，往下一厘米就变高原红。' },
      { id: 'i8-c2', user: '小鹿乱撞', avatarColor: '#a1c2b1', text: '冷调肤色也能压得住是真的吗？我试过总是显青。' },
    ],
  },
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
 * ★ 三项统计是演示值(没有真实的作品库);
 *   昵称 / 简介 / 头像不在这里,它们走 `api/users.js` 的 `fetchProfile()`。
 *   `taozhuangId` 由 id 推出来,让页面上那个号码与当前账号对得上、刷新不变。
 * ★ `aiProfile` 那三个写死的标签**已删**(原先摆在「我的 AI 妆容档案」卡上,
 *   是把演示值当成了用户的档案)。**别再按旧印象加回来。**
 */
export function getProfile({ userId = '' } = {}) {
  const suffix = String(userId).replace(/\W/g, '').slice(-7).toUpperCase() || '0000000'
  return {
    taozhuangId: `桃妆号 TZ-${suffix}`,
    stats: { works: 126, collections: 47, liked: 312, followers: 3412 },
  }
}

/** 我的作品 / 收藏 / 赞过。三个 Tab 的空态文案是产品要求,别统一成「暂无内容」。 */
export const WORKS_EMPTY = {
  works: '这里还空着，去设计第一个妆容吧',
  collections: '还没有收藏的妆容，去灵感广场逛逛',
  liked: '还没有点过赞的妆容',
}

/** 同上:封面走同一个 `postCoverOf`,这些也不是账号里真存过的作品。 */
const MY_WORKS = [
  {
    id: 'w1',
    title: '枫糖暖调氛围妆',
    coverUrl: postCoverOf('w1'),
    coverHeight: 250,
    desc: '暖金高光扫在眼窝中央，配一条棕调眼线。想要「灯光打在身上」那种暖的时候用。',
    likes: 2143,
    collected: 1106,
    comments: [
      { id: 'w1-c1', user: '晚晚不晚', avatarColor: '#d48d95', text: '暖金高光扫眼窝中央这招学到了。' },
      { id: 'w1-c2', user: '一只柚子', avatarColor: '#e7a6ac', text: '「灯光打在身上」这个形容太会了。' },
    ],
  },
  {
    id: 'w2',
    title: '盐系清透日常妆',
    coverUrl: postCoverOf('w2'),
    coverHeight: 230,
    desc: '清透桃色水光唇，底妆只压 T 区。出门买杯咖啡也用得上的一套。',
    likes: 1286,
    collected: 640,
    comments: [
      { id: 'w2-c1', user: '苏打水', avatarColor: '#a1c2b1', text: '底妆只压 T 区是对的，全脸压完就没这个透感了。' },
      { id: 'w2-c2', user: '午睡冠军', avatarColor: '#b6d5c6', text: '桃色水光唇好看，请问是叠涂吗？' },
    ],
  },
  {
    id: 'w3',
    title: '国风桃枝照水',
    coverUrl: postCoverOf('w3'),
    coverHeight: 270,
    desc: '烟灰粉压成雾面唇，眼尾拖出一条淡粉的线。国风，但不戏，日常穿也能出门。',
    likes: 976,
    collected: 517,
    comments: [
      { id: 'w3-c1', user: '沈叙白', avatarColor: '#a1c2b1', text: '烟灰粉做雾面唇很聪明，换成艳粉就戏了。' },
      { id: 'w3-c2', user: '南山', avatarColor: '#e7a6ac', text: '日常穿也能出门这点很重要，国风妆最怕太隆重。' },
    ],
  },
  {
    id: 'w4',
    title: '白开水通勤妆',
    coverUrl: postCoverOf('w4'),
    coverHeight: 240,
    desc: '淡粉玫瑰唇加干净底妆。像没化妆一样的好皮肤，是这一套全部的目标。',
    likes: 1654,
    collected: 823,
    comments: [
      { id: 'w4-c1', user: '林小满', avatarColor: '#b6d5c6', text: '像没化妆一样的好皮肤，这就是我一直在找的。' },
      { id: 'w4-c2', user: '陈皮', avatarColor: '#d48d95', text: '淡粉玫瑰唇配干净底妆，说起来简单，做对很难。' },
    ],
  },
  {
    id: 'w5',
    title: '橘调蜜桃妆',
    coverUrl: postCoverOf('w5'),
    coverHeight: 260,
    desc: '琥珀柑茶的唇色，腮红跟着往橘里偏一点。夏天拍外景最上镜。',
    likes: 3021,
    collected: 1490,
    comments: [
      { id: 'w5-c1', user: '桃气少女阿柚', avatarColor: '#e7a6ac', text: '琥珀柑茶这个名字也太好听了。' },
      { id: 'w5-c2', user: '七月', avatarColor: '#a1c2b1', text: '腮红跟着往橘里偏一点，这个细节很少有人提。' },
    ],
  },
  {
    id: 'w6',
    title: '雾面哑光秋冬妆',
    coverUrl: postCoverOf('w6'),
    coverHeight: 230,
    desc: '裸感珊瑚的哑光唇配雾面底妆。喝水也不容易掉，秋冬不用频繁补。',
    likes: 2143,
    collected: 1080,
    comments: [
      { id: 'w6-c1', user: '薄荷绿', avatarColor: '#b6d5c6', text: '哑光唇喝水不容易掉是真的吗？我总是一杯水就没了。' },
      { id: 'w6-c2', user: '阿柚', avatarColor: '#e7a6ac', text: '裸感珊瑚很好看，秋冬不显老。' },
    ],
  },
  {
    id: 'w7',
    title: '桃花眼妆教程',
    coverUrl: postCoverOf('w7'),
    coverHeight: 250,
    desc: '碎闪金棕四色铺满眼窝，眼尾叠一层深棕。桃花眼的重点在卧蚕，教程里单独拆了一步。',
    likes: 1520,
    collected: 866,
    comments: [
      { id: 'w7-c1', user: 'Nono', avatarColor: '#a1c2b1', text: '卧蚕那步我也单独拆出来练了，确实有用。' },
      { id: 'w7-c2', user: '小鹿', avatarColor: '#e7a6ac', text: '碎闪金棕和深棕的层次出来了，很好看。' },
    ],
  },
  {
    id: 'w8',
    title: '微醺酒渍腮红',
    coverUrl: postCoverOf('w8'),
    coverHeight: 280,
    desc: '酒棕色的水光唇配微醺腮红，脸和唇是同一个色调。晚上出门用这一套。',
    likes: 2380,
    collected: 1188,
    comments: [
      { id: 'w8-c1', user: '晚晚不晚', avatarColor: '#d48d95', text: '脸和唇同一个色调这个思路，晚上出门真的合适。' },
      { id: 'w8-c2', user: '橙子汽水', avatarColor: '#b6d5c6', text: '酒棕色水光唇求个色号。' },
    ],
  },
]

export function getMyWorks({ tab = 'works' } = {}) {
  return tab === 'works' ? MY_WORKS : []
}

/**
 * 按 id 取一条作品。灵感广场(`POSTS`)与我的作品(`MY_WORKS`)共用同一个详情页,
 * 所以两处一起查。取不到返回 `null`,由页面自己摆空态。
 */
export function getPost(id = '') {
  return POSTS.find((p) => p.id === id) || MY_WORKS.find((p) => p.id === id) || null
}
