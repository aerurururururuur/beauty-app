import { SHADE_LIBRARY } from './kb/shades'
import { FEATURE_GROUPS, FEATURE_LIBRARY } from './kb/features'
import { SKIN_TONES } from './kb/skintones'

/**
 * api/design.js —— 「开始设计」那条链的**输入侧**数据层:场景 → 信息收集表单。
 *
 * ★★ **2026-09-30 起,「方案」不再由本模块推导。** 它改由后端 agent 产出
 *    (`POST /agent/sessions` 带一份 `brief`,`propose_look` 的时候一并写进会话,
 *    见 `server/src/modules/styling/`)。
 *
 *    所以本模块现在的职责只剩三件,都是**输入侧**的:
 *      ① 场景清单与各场景的表单定义(用户要填哪些格);② 从知识库读展示用的调色板
 *        (`getFeatureTags` / `getSkinTones`,人设问卷与详情页要用);
 *      ③ `toBrief()` —— 把页面收上来的东西翻译成后端那份 `brief`。
 *    外加一件**输出侧的补丁** `decoratePlan()`:后端给的方案里没有色值,由这里回填。
 *
 *    ⚠️ 因此 `kb/styles.js`(21 套配方 + 候选池)在本前端**已经没有消费者了**——
 *       它是内容,已经整体搬进后端 `styling/domain/entities/style-recipes.ts`。
 *       留着它是因为 `server/test/styling-plan.test.ts` 拿它当**搬运前的原件**对表
 *       (同 `public/demo/` 那两个 SVG 的地位:已知的零消费者,不是漏收拾的)。
 *
 * 步骤的数量 / 名称 / 顺序全部来自后端那份方案,前端不写死任何一步。
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
 * 提交时**两种都保留**(见 `toBrief`)。
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

/* --------------------------- 拼 brief --------------------------- */

/**
 * 肤色档:前端的 id ↔ 后端的 id。
 *
 * ★ 两边是**两套不同的 id**,而且是各自按自己的意思起的:前端这份写的是
 *   「用户嘴里的话」(`yellow-1` / `yellow-dark`),后端那份(`shared/domain/entities/brief.ts`
 *   的 `SKIN_TONES`)是**与词表目录对账过的代码**,启动时少一个都起不来。
 *   映射只写在这一处——换名字改这里,别去改后端的枚举,也别在页面里各拼一次。
 *
 * ⚠️ **一行都不能少。** 后端 `checkBriefFields` 是**白名单**校验:
 *   认不出来的取值不是"忽略",是**整份 brief 被打回 422**。所以下面查不到的档
 *   宁可**整个不传**(见 `toBrief`),也不能原样送过去——那会让用户填了一屏的信息
 *   因为一个肤色档全丢掉。
 */
const SKIN_TONE_TO_BACKEND = {
  'cool-fair': 'cool_porcelain',
  'pink-fair': 'pink_porcelain',
  'yellow-1': 'warm_ivory',
  'yellow-2': 'warm_beige',
  olive: 'olive',
  'yellow-dark': 'warm_tan',
  wheat: 'wheat',
  deep: 'deep_brown',
}

/** 后端 `dress` 的硬上限(字)。与 `shared/.../brief-fields.validator.ts` 的 `MAX_DRESS` 同值。 */
const MAX_DRESS = 80
/** 后端 `sceneText` 的硬上限(字)。与 `shared/.../brief-fields.validator.ts` 的 `MAX_SCENE_TEXT` 同值。 */
const MAX_SCENE_TEXT = 2000

/**
 * 截断并**留一句话**。
 *
 * ★ 静默截断是不行的:模型会以为那就是用户说的全部,而用户以为自己的话送到了。
 *   所以截断后补一句,让读它的模型知道**还有内容没看到**——它可以据此再问一句。
 *   (上限本身是后端的硬规则,超了是 422,所以这里必须裁。)
 */
function clamp(text, max) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}（原文过长，已截断）`
}

/** 一格里用户写的东西:`text + 勾选的预设项`,与 `FormView.collectFields` 同一口径。 */
function textOfField(field) {
  return [String(field?.text || '').trim(), ...(field?.opts || [])].filter(Boolean).join('；')
}

/**
 * `/form` 收上来的东西 → 后端那份 `brief`(平铺在 `POST /agent/sessions` 的请求体上)。
 *
 * 三条刻意的取舍:
 *
 * ① ★ **不填就不给,不倒推。** 人设没定肤色档时 `skinTone` 整个键不出现——
 *    这不是遗漏,是红线(§8-1:肤色档没有默认值)。塞一个兜底等于替用户认定肤色,
 *    而肤色会**收窄**妆面的合法色域(`validateLookSpec`),错了整份配色都会偏。
 *    前端这份档位 id 认不出来时也是同一处理:宁可不传。
 *
 * ② **`dress` 与 `sceneText` 都从同一批字段来,但用途不同**:`dress` 是给模型的
 *    「一句话风格信号」(穿搭主色与材质),`sceneText` 是**用户自己写的那段话**,
 *    一格不落地拼进去。两者重复一点没关系,少了一格才是真的丢了输入。
 *
 * ③ ★ **只上传了图片、没写字的格子会留下一句明说。** 这一期**不传信息图**
 *    (`VISION_ANALYZER=off` 时后端 `/images` 那条路由根本没注册),如果这里静默跳过,
 *    页面上明明收下了图、agent 那边却像没发生过——那是本仓最怕的那种「假开关」。
 *    所以写成一句话交出去,让模型知道「有图,但没送到」,它可以开口问用户。
 */
export function toBrief({ sceneId = 'party', persona = null, fields = [] } = {}) {
  // ★ 用表单自己的 sceneId(它已经做过未知场景的回落),别直接把 query 里的字符串送出去。
  const brief = { occasion: getSceneForm({ sceneId }).sceneId }

  const tone = SKIN_TONE_TO_BACKEND[persona?.skinTone || '']
  if (tone) brief.skinTone = tone

  const features = (persona?.features || []).filter(Boolean)
  if (features.length) brief.features = [...features]

  const dress = textOfField(fields.find((f) => f.key === 'outfit'))
  if (dress) brief.dress = clamp(dress, MAX_DRESS)

  const lines = fields
    .map((f) => {
      const text = textOfField(f)
      const count = (f.images || []).length
      if (text) return `${f.label}：${text}`
      if (count) return `${f.label}：用户上传了 ${count} 张图片（本次未能送达）`
      return ''
    })
    .filter(Boolean)
  if (lines.length) brief.sceneText = clamp(lines.join('\n'), MAX_SCENE_TEXT)

  return brief
}

/* --------------------------- 补色值 --------------------------- */

/**
 * 回查色值:色值的**唯一**来源是色号库,后端那份方案里只带 `pid + code`,不带 hex。
 *
 * ★ 这条规矩是 `kb/styles.js` 自己立的(硬约定 2),后端照它办——所以色块的颜色
 *   只有前端补得出来。改这里之前先看 `api/vanity.js` 文件头:全仓不许另写一份 hex。
 */
function hexOf(pid, code) {
  if (!pid || !code) return ''
  const entry = SHADE_LIBRARY[pid]
  if (!entry) return ''
  const hit = entry.shades.find((x) => x.code === code)
  return hit ? hit.hex : ''
}

/**
 * 后端那份方案(`AgentSessionView.plan`)→ 结果页要的形状:把 `hex` 补上。
 *
 * ★ **只补色值,不改任何一格内容。** 步骤数量与顺序、色板块数与顺序、个性化条目,
 *   全部照后端的原样带过去——前端不再有自己的推导,这是「方案由 agent 产出」的全部含义。
 *
 * ★ 色板的色值取自**第一个带着这个色号的步骤产品**(`derivePlan` 是从步骤推导出色板的,
 *   所以每个色号都在步骤里出现过)。查不到色的产品**不进色板**,也不占领那个色号
 *   ——它是「这一支没有色块」,不是「这个色号没有色块」。
 */
export function decoratePlan(plan) {
  if (!plan) return null
  const hexByCode = new Map()
  for (const step of plan.steps || []) {
    for (const p of step.products || []) {
      const hex = hexOf(p.pid, p.code)
      if (!hex || !p.code || hexByCode.has(p.code)) continue
      hexByCode.set(p.code, hex)
    }
  }
  return {
    ...plan,
    palette: (plan.palette || []).map((p) => ({ ...p, hex: hexByCode.get(p.code) || '' })),
    steps: (plan.steps || []).map((s) => ({
      ...s,
      products: (s.products || []).map((p) => ({ ...p, hex: hexOf(p.pid, p.code) })),
    })),
  }
}

/**
 * 「保存妆容」。后端**没有**「我的作品」这个集合,这里也**不编一个假的成功**:
 * 返回的就是本地事实——这一版方案已经**整理成一份 JSON 快照**了,没有落到任何地方。
 * 页面照这句话展示即可(「已记下这一版」),别说成「已保存到作品」——
 * 那会让人以为下次换台机器还能看到。
 */
export function snapshotDesign({ sceneId = '', sceneName = '', plan = null } = {}) {
  if (!plan) return null
  return {
    sceneId,
    sceneName,
    styleId: plan.styleId,
    styleName: plan.styleName,
    stepCount: plan.meta.stepCount,
    minutes: plan.meta.minutes,
    level: plan.meta.level,
    palette: plan.palette,
    steps: plan.steps.map((s) => ({ name: s.name, products: s.products })),
  }
}
