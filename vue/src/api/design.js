import { styleById, stylesForScene, SCENE_STYLES } from './kb/styles'
import { SHADE_LIBRARY } from './kb/shades'
import { FEATURE_GROUPS, FEATURE_LIBRARY, featureById } from './kb/features'
import { SKIN_TONES } from './kb/skintones'

/**
 * api/design.js —— 「开始设计」那条链的数据层:场景 → 信息收集 → 生成方案。
 *
 * ★★ 本模块**整个是本地推导,后端没有这些端点**。这不是 mock 分支:
 *    `VITE_USE_MOCK` 对它无效,两种模式下逐字相同。别看见 `getScenes()` 就以为
 *    把开关拨到 false 会去联网——`server/src/app.ts` 里没有 `/design/*` 的任何一条路由。
 *
 *    方案由 `kb/styles.js` 的 20 套风格配方**当场展开**得到,色值由 `pid + code`
 *    回查 `kb/shades.js`。所以「换一版」「换风格」是纯粹的前端推导,不发请求、
 *    不等待、也不花钱。后续要接真后端时,这里是唯一要改的地方。
 *
 *    ⚠️ 顺带说清一件容易混的事:后端**确实**有一个能真的生成妆容的模块(`agent`),
 *       但它不是这套形状——它按「会话」走(messages / photo / render),
 *       每一次出图都是一条会真花钱的路由,且刻意没有 mock 轨。
 *       桃妆这条 场景→表单→方案 的动线要接上去是**重写动线**,不是替换数据源。
 *       在没做那件事之前,这里的本地推导就是这一屏的真相,不要假装它在联网。
 *
 * 步骤的数量 / 名称 / 顺序全部来自所选风格的配方数组,前端不写死任何一步。
 */

/* ------------------------------ 场景 ------------------------------ */

/** 场景清单。`icon` 只是给组件层挑图标的键,真正的图形在 components/Icon.vue。 */
export const SCENES = [
  { id: 'party', name: '聚会', tagline: '派对焦点妆', desc: '灯光下的存在感，可以大胆一点', icon: 'sparkle' },
  { id: 'date', name: '约会', tagline: '心动氛围妆', desc: '温柔、耐看，又有记忆点', icon: 'heart' },
  { id: 'interview', name: '面试汇报', tagline: '专业得体妆', desc: '可信、清爽，不抢戏', icon: 'brief' },
  { id: 'travel', name: '旅行', tagline: '上镜持妆', desc: '抗汗抗油，拍照好看', icon: 'plane' },
  { id: 'fantasy', name: '奇想', tagline: '不被定义的艺术妆面', desc: '非日常、可创作、只属于你', icon: 'moon' },
]

/** 场景 id → 场景名。台账 / 面包屑用,别再各写一份。 */
export function sceneNameOf(sceneId) {
  return (SCENES.find((s) => s.id === sceneId) || {}).name || ''
}

export function getScenes() {
  return SCENES
}

/* --------------------------- 信息收集表单 --------------------------- */
/**
 * 每个字段都支持两种填写方式:文字描述(`text`)或图片上传(`images`),
 * 提交时**两种都保留**(见 submitDesign 的 payload)。
 * 场景不同,字段的集合也不同(旅行只要地点+穿搭,面试要四个)——这是产品要求,不是遗漏。
 */
const SCENE_FORMS = {
  party: {
    sceneId: 'party',
    name: '聚会',
    tagline: '派对焦点妆',
    fields: [
      {
        key: 'relation',
        label: '对象 / 人物关系',
        placeholder: '例如：闺蜜局、同事生日会、陌生人多的派对',
        hint: '关系越具体，妆感强度越准',
        required: true,
        options: ['闺蜜局', '同事 / 同学聚会', '生日会', '陌生人多的派对', '家人聚餐'],
      },
      {
        key: 'place',
        label: '地点',
        placeholder: '例如：KTV、 rooftop bar、家里客厅',
        hint: '灯光环境直接决定高光与眼妆浓度',
        required: true,
        options: ['室内暖光餐厅', 'KTV / 酒吧', '户外夜场', '家中聚会', '酒店宴会厅'],
      },
      {
        key: 'outfit',
        label: '穿搭',
        placeholder: '例如：黑色吊带 + 银色配饰',
        hint: '告诉我们主色与材质，妆面会跟着呼应',
        required: false,
        options: ['黑色系', '白色 / 浅色系', '亮片 / 金属', '彩色撞色', '还没定'],
      },
    ],
  },
  date: {
    sceneId: 'date',
    name: '约会',
    tagline: '心动氛围妆',
    fields: [
      {
        key: 'relation',
        label: '对象 / 人物关系',
        placeholder: '例如：暧昧对象第一次见面、恋爱三周年的男朋友',
        hint: '相处阶段不同，甜度和距离感也不同',
        required: true,
        options: ['暧昧期 / 初见', '稳定恋爱中', '纪念日', '相亲', '朋友以上'],
      },
      {
        key: 'place',
        label: '地点',
        placeholder: '例如：法餐小馆、电影院、江边散步',
        hint: '烛光 vs 日光，妆感差别很大',
        required: true,
        options: ['烛光餐厅', '咖啡 / 甜品店', '电影院', '户外散步', '自驾 / 兜风'],
      },
      {
        key: 'outfit',
        label: '穿搭',
        placeholder: '例如：奶油白针织 + 珍珠耳环',
        hint: '柔和面料配柔雾妆，硬挺面料配干净线条',
        required: false,
        options: ['温柔针织', '连衣裙', '休闲 / 街头', '衬衫 / 通勤', '还没定'],
      },
    ],
  },
  interview: {
    sceneId: 'interview',
    name: '面试汇报',
    tagline: '专业得体妆',
    fields: [
      {
        key: 'industry',
        label: '行业',
        placeholder: '例如：互联网大厂产品岗、四大审计、设计工作室',
        hint: '不同行业对妆感的容忍度差别明显',
        required: true,
        options: ['互联网 / 科技', '金融 / 咨询', '法律 / 政务', '教育 / 医疗', '创意 / 设计', '媒体 / 公关'],
      },
      {
        key: 'relation',
        label: '人物关系',
        placeholder: '例如：HR 一面、部门总监终面、向客户汇报',
        hint: '决定你要多"可靠"还是多"亲和"',
        required: true,
        options: ['HR 一面', '直属主管', '部门总监 / 终面', '客户 / 甲方', '全员汇报'],
      },
      {
        key: 'place',
        label: '地点',
        placeholder: '例如：公司会议室、线上面试、大型会议厅',
        hint: '线上要考虑镜头与顶光',
        required: true,
        options: ['公司会议室', '线上面试 / 视频', '会议厅 / 讲台', '咖啡厅'],
      },
      {
        key: 'outfit',
        label: '穿搭',
        placeholder: '例如：藏青西装 + 白衬衫',
        hint: '正装越硬挺，妆越要收',
        required: false,
        options: ['全套西装', '衬衫 + 西裤', '商务休闲', '制服 / 工装', '还没定'],
      },
    ],
  },
  travel: {
    sceneId: 'travel',
    name: '旅行',
    tagline: '上镜持妆',
    fields: [
      {
        key: 'place',
        label: '地点',
        placeholder: '例如：北海道雪景、三亚海边、西北戈壁',
        hint: '气候和光线决定持妆与色彩策略',
        required: true,
        options: ['海边 / 热带', '雪景 / 高原', '城市街拍', '古镇 / 人文', '山林 / 户外'],
      },
      {
        key: 'outfit',
        label: '穿搭',
        placeholder: '例如：米色风衣 + 牛仔裤 + 草帽',
        hint: '旅行拍照讲究整体氛围统一',
        required: false,
        options: ['浅色 / 米白系', '牛仔 / 休闲', '亮色度假风', '深色机能风', '还没定'],
      },
    ],
  },
  fantasy: {
    sceneId: 'fantasy',
    name: '奇想',
    tagline: '不被定义的艺术妆面',
    fields: [
      {
        key: 'style',
        label: '风格',
        placeholder: '例如：赛博霓虹泪痕、水墨留白、Y2K 碎钻、油画肌理',
        hint: '越具体越好，可以是一句话、一张图、一个梦境',
        required: true,
        options: ['赛博 / 未来感', '东方水墨', 'Y2K 千禧', '油画 / 古典', '暗黑童话', '植物 / 自然'],
      },
    ],
  },
}

/** 未知场景回落到聚会——四个入口页都直接拼 `scene=<id>`,脏参数不该让页面空掉。 */
export function getSceneForm({ sceneId = 'party' } = {}) {
  return SCENE_FORMS[sceneId] || SCENE_FORMS.party
}

/* --------------------------- 知识库直出 --------------------------- */

/** 面部特征标签库:信息收集页(勾选)与结果页(个性化调整)共用同一份。 */
export function getFeatureTags() {
  return { groups: FEATURE_GROUPS, features: FEATURE_LIBRARY }
}

/** 肤色档库:8 档。人设问卷与详情页的单选都从这里来。 */
export function getSkinTones() {
  return SKIN_TONES
}

/* --------------------------- 生成结果 --------------------------- */

/**
 * 通用步骤逻辑 —— 来自《上妆步骤知识库》第十二章「补充说明」。
 * 按步骤名关键词匹配,命中后作为该步的注意事项展示。
 * ★ 顺序有意义:先命中的那条胜出(如「眼线」既匹配眼妆也匹配不到别的,但「唇线」要晚于「唇妆」判定除外)。
 */
const STEP_LOGIC = [
  { re: /遮瑕/, note: '色彩性瑕疵（黑眼圈、泛红）在底妆前遮；结构性瑕疵（泪沟、法令纹）在底妆后遮，两个时机不可颠倒' },
  { re: /定妆/, note: '蜜粉负责控油定妆，喷雾负责保湿定妆与降低粉感，两者配合效果最好' },
  { re: /底妆/, note: '少量多次是核心，单侧脸用量不超过黄豆大小，避免成膜层叠加导致斑驳' },
  { re: /修容/, note: '修容不要超过眼尾，正面看才不会显脏；发际线与下颚线处的修容一定要晕染' },
  { re: /腮红/, note: '腮红可直接当眼影用，一套颜色做出 monochromatic look' },
  { re: /眼妆|眼影|睫毛|眉毛|眉眼|眼线|卧蚕/, note: '上完底妆先在眼皮上一层散粉，避免眼皮太黏没晕染开眼影' },
  { re: /唇妆|唇线|唇/, note: '涂唇膏前先用面纸轻按掉多余护唇膏油脂，否则会影响成膜与持色' },
  { re: /高光/, note: '微笑，用刷子在颧骨双起部位涂至太阳穴；鼻梁上修饰鼻型，唇弓处轻点放大唇部体积' },
  { re: /防晒|妆前/, note: '妆前乳若已带 SPF50，可不再单独叠加防晒；否则防晒要在妆前乳之后、底妆之前' },
]

function logicFor(name) {
  const hit = STEP_LOGIC.find((l) => l.re.test(name))
  return hit ? [hit.note] : []
}

/** 回查色值:色值的**唯一**来源是色号库,配方里只写 pid + code,不许另写一份 hex。 */
function hexOf(pid, code) {
  if (!pid || !code) return ''
  const entry = SHADE_LIBRARY[pid]
  if (!entry) return ''
  const hit = entry.shades.find((x) => x.code === code)
  return hit ? hit.hex : ''
}

/** 把风格配方展开成结果页的 steps 数组。顺序即配方的顺序,一步都不许在前端补。 */
function buildSteps(style) {
  return style.steps.map((t, i) => ({
    id: `${style.id}-${String(i + 1).padStart(2, '0')}`,
    name: t.name,
    desc: t.action,
    tips: logicFor(t.name),
    imageUrl: '',
    products: t.products.map((p) => ({ name: p.name, code: p.code, hex: hexOf(p.pid, p.code) })),
  }))
}

/** 顶部色板由「本方案真的用到的色号」推导,保证色板与步骤永远一致(不由配方手写)。 */
function buildPalette(steps) {
  const seen = new Set()
  const out = []
  steps.forEach((s) =>
    (s.products || []).forEach((p) => {
      if (!p.hex || !p.code) return
      if (seen.has(p.code)) return
      seen.add(p.code)
      // code 是色号,name 是出自哪个产品,前端按需要展示其一或两者
      out.push({ code: p.code, name: p.name, hex: p.hex })
    })
  )
  return out.slice(0, 8)
}

/** 个性化调整:把选中人设身上的面部特征标签展开成策略卡。 */
function buildPersonalized(featureIds = []) {
  const groupName = (gid) => (FEATURE_GROUPS.find((g) => g.id === gid) || {}).name || ''
  return featureIds
    .map(featureById)
    .filter(Boolean)
    .map((f) => ({
      id: f.id,
      group: f.group,
      groupName: groupName(f.group),
      name: f.name,
      desc: f.desc,
      fix: f.fix,
      products: f.products,
    }))
}

/**
 * 某场景下可切换的妆容风格。步骤数量与顺序本来就不同(6 ~ 11 步),这是要点不是缺陷。
 * 返回 `stepCount` 让切换条上能直接标「N 步」。
 */
export function getStyleOptions({ sceneId = 'party' } = {}) {
  return stylesForScene(sceneId).map((s) => ({
    id: s.id,
    name: s.name,
    family: s.family,
    summary: s.summary,
    stepCount: s.steps.length,
  }))
}

/**
 * 生成方案。`styleId` 空时取该场景候选池的第一套。
 * `features` 是选中人设身上的面部特征 id —— 决定「针对你的面部特征」那一区的内容。
 */
export function getDesignResult({ sceneId = 'party', styleId = '', features = [] } = {}) {
  const pool = SCENE_STYLES[sceneId] || SCENE_STYLES.party
  const style = styleById(styleId || pool[0])
  const steps = buildSteps(style)

  return {
    id: `look-${sceneId}-${style.id}`,
    taskId: `local-${sceneId}-${style.id}`,
    sceneId,
    sceneName: sceneNameOf(sceneId) || '通用',
    styleId: style.id,
    styleName: style.name,
    family: style.family,
    title: style.name,
    tagline: style.family,
    summary: style.summary,
    keywords: style.keywords,
    palette: buildPalette(steps),
    meta: { stepCount: steps.length, minutes: style.minutes, level: style.level },
    steps,
    personalized: buildPersonalized(features),
    styleOptions: pool
      .map(styleById)
      .map((s) => ({ id: s.id, name: s.name, family: s.family, summary: s.summary, stepCount: s.steps.length })),
  }
}

/** 「换一版」:切到场景候选池里的下一个风格,步骤数量与顺序随之变化。 */
export function regenerateDesign({ sceneId = 'party', styleId = '' } = {}) {
  const pool = SCENE_STYLES[sceneId] || SCENE_STYLES.party
  const cur = pool.indexOf(styleId)
  const nextId = pool[(cur + 1) % pool.length] || pool[0]
  return { styleId: nextId }
}

/**
 * 「保存妆容」。源站把它当成一条 POST,但后端没有这个端点,这里也**不编一个假的成功**:
 * 返回的就是本地事实——这一版方案已经**导出成一份 JSON 快照**了,没有落到任何服务端。
 * 页面照这句话展示即可(「已记下这一版」),别说成「已保存到作品」——
 * 那会让人以为下次换台机器还能看到。
 */
export function snapshotDesign(data) {
  return {
    id: data.id,
    sceneId: data.sceneId,
    sceneName: data.sceneName,
    styleId: data.styleId,
    styleName: data.styleName,
    stepCount: data.meta.stepCount,
    minutes: data.meta.minutes,
    level: data.meta.level,
    palette: data.palette,
    steps: data.steps.map((s) => ({ name: s.name, products: s.products })),
  }
}
