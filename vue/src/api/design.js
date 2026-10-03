import { FEATURE_GROUPS, FEATURE_LIBRARY, featureById, featureLabel } from './kb/features.js'
import { SKIN_TONES } from './kb/skintones.js'
import { STYLE_LIBRARY } from './kb/styles.js'
// ★ 上面三条写全 `.js` 后缀，是为了让 `tools/check-form.mjs` 能在裸 node 里
//   直接 import 本文件（node 的 ESM 解析器要求扩展名；Vite 两种写法都认）。
import { OUTFIT_TREE, formOptions } from './kb/outfit.js'

/**
 * api/design.js —— 「开始设计」那条链的**输入侧**数据层:场景 → 信息收集表单。
 *
 * ★★ **2026-09-30 起,「方案」不再由本模块推导。** 它改由后端 agent 产出
 *    (`POST /agent/sessions` 带一份 `brief`,`propose_look` 的时候一并写进会话,
 *    见 `server/src/modules/styling/`)。
 *
 *    所以本模块现在的职责**全在输入侧**,三件:
 *      ① 场景清单与各场景的表单定义(用户要填哪些格);② 从知识库读展示用的调色板
 *        (`getFeatureTags` / `getSkinTones`,人设问卷与详情页要用);
 *      ③ `toBrief()` —— 把页面收上来的东西翻译成后端那份 `brief`。
 *
 *    ✏️ **2026-09-30:色值也不再由本模块回填。** 此前这里有一个 `decoratePlan()`,
 *       拿本地 `kb/shades.js` 给后端方案的 `pid + code` 补 `hex`;色号库并进 `products/`
 *       之后,补色值这一步跟着上了服务端(`styling/application/decorate-plan.ts`),
 *       **方案里本来就带着 hex**(`stores/design.js` 的 `plan` 直接就是 `session.plan`)。
 *       前端从此只渲染颜色——**别再在这里补一次**,两份实现迟早会漂。
 *
 *    ✏️ **2026-09-30:`kb/styles.js` 不再是"零消费者"** —— 那 21 套配方名现在喂给
 *       `/form` 的「你想要的风格」chips(见 `STYLE_FIELD`),手写那份仍是后端
 *       `style-recipes.ts` 的搬运前原件(`styling-plan.test.ts` 逐条对表)。
 *       ⚠️ 它原来的 `SCENE_STYLES` / `stylesForScene`(场景 → 4 条候选)**已删**:
 *       风格与场合各自独立、自由组合,那层池子两端一起没了。
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

/* ------------------------- 两个共享字段 ------------------------- */

/**
 * 「这是什么场合」——★ **每个场景都有这一格**,它与场景卡是两件事。
 *
 * 场景卡只是**默认值**(见 `getSceneForm` 的 `defaultOpts`):进来时预选好,但用户可以
 * 改成自己真正要去的场合。后端 `brief.occasion` 是**自由文本**(只判长度 `MAX_OCCASION`)
 * ——我们枚举不出所有场合。
 * ⚠️ chip 里放的是中文名,送出去前要用 `occasionIdOf` 映回 `party` / `date` 这种 id;
 *   映射只写那一处。
 */
const OCCASION_FIELD = {
  key: 'occasion',
  label: '场合',
  placeholder: '例如：朋友的婚礼、毕业典礼、第一次见客户 —— 用自己的话说就行',
  hint: '照你自己的说法写，越具体越好；不限于上面那几个场景',
  required: false,
  options: SCENES.map((s) => s.name),
  /** 由 `getSceneForm` 按当前场景填成 `[场景名]`。 */
  defaultOpts: [],
}

/**
 * 「你想要的风格」——★ 复用 `kb/styles.js` 那 21 套配方的**名字**。
 *
 * ⚠️ 这 21 个名字与后端 `style-recipes.ts` 的 `STYLE_LIBRARY` **逐字相同**
 *   (`styling-plan.test.ts` 对表钉着);名字对得上,模型才接得住用户点的这一下。
 * ★ 风格与场合互不相干:这 21 条任何场合都能用,后端不再按场合派候选池。
 */
const STYLE_FIELD = {
  key: 'style',
  label: '你想要的风格',
  placeholder: '也可以自己写：赛博霓虹泪痕、水墨留白、Y2K 碎钻、油画肌理……',
  hint: '从这 21 套里挑，或者用你自己的话描述',
  required: false,
  options: STYLE_LIBRARY.map((s) => s.name),
}

/**
 * 一格的参考图属于后端哪个 `kind`(`/agent/sessions/:id/images` 的入参)。
 * ★ 两个 kind 的读图提示词与落点完全不同,送错了读出一段无关内容且**界面上看不出来**。
 * ⚠️ 只此一处:视图里别再内联一遍 `key === 'style' ? … : …`。
 */
export function refKindOfField(key) {
  return key === STYLE_FIELD.key ? 'style' : 'scene'
}

/**
 * 从 `/form` 收上来的那几格里挑出**要送达的参考图**。
 *
 * ★ 后端每个会话每个 `kind` 只有一个槽(`setImageRef` 是覆盖)⇒ 每类只送
 *   **字段顺序上的第一张**;其余的不静默丢,由 `toBrief` 照实写进 `sceneText`。
 * ⚠️ 挑法**只此一处**:`submit`(真上传)与 `toBrief`(告诉模型送了哪些)必须调
 *   同一个,否则页面说的和实际送的会不一致,而两边都看不出错。
 * 返回 `sent` · `skipped`(`kind`→没送出去的张数,汇总用) · `sentByField`
 * (格子→真送了几张)。**逐格报数只走 `sentByField`**,别在那一格重判一遍"是不是第一张"。
 */
export function refImagesOf(fields = []) {
  const taken = new Set()
  const sent = []
  /** `kind` → 没能送出去的张数。 */
  const skipped = new Map()
  /** 格子 `key` → 真送出去了几张(只可能是 0 或 1)。 */
  const sentByField = new Map()
  const skip = (kind, n) => skipped.set(kind, (skipped.get(kind) || 0) + n)

  for (const f of fields) {
    const files = f.files || []
    if (!files.length) continue
    const kind = refKindOfField(f.key)
    if (taken.has(kind)) {
      skip(kind, files.length)
      continue
    }
    taken.add(kind)
    sent.push({ kind, file: files[0] })
    sentByField.set(f.key, 1)
    if (files.length > 1) skip(kind, files.length - 1)
  }
  return { sent, skipped, sentByField }
}

/* --------------------------- 信息收集表单 --------------------------- */
/**
 * 每个字段都支持两种填写方式:文字描述(`text`)或图片上传(`images`),
 * 提交时**两种都保留**(见 `toBrief`)。
 * 场景不同,字段的集合也不同(旅行只要地点+穿搭,面试要四个)——这是产品要求,不是遗漏。
 *
 * ★ 两格是**每个场景都有**的,拼在各自字段的两头:`OCCASION_FIELD` 在最前
 *   (它框住这次要为什么化妆),`STYLE_FIELD` 在最后(它是最具体的那句偏好)。
 * ★ 级联链(对象 → 地点 → 穿搭,见 `kb/outfit.js`)上的每一格都是**单选**:
 *   多选时「地点随哪个对象变」根本没有答案。
 */

/** 单选(只亮一个 chip)。级联链上的四个字段都走它。 */
const singleField = (f) => ({ ...f, single: true })

/**
 * 级联链上一格:单选,`options` 空着 —— 选项由 `getFieldOptions` 按上游现算。
 * `dependsOn` 只是声明(给页面与自检脚本看);`lockHint` 在上游未选时顶替 chip 显示。
 */
const cascadeField = ({ dependsOn = null, lockHint = '', ...f }) => ({
  ...f,
  single: true,
  cascade: true,
  dependsOn,
  lockHint,
  options: [],
})

const SCENE_FORMS = {
  party: {
    sceneId: 'party',
    name: '聚会',
    tagline: '派对焦点妆',
    fields: [
      OCCASION_FIELD,
      singleField({
        key: 'relation',
        label: '对象 / 人物关系',
        placeholder: '例如：闺蜜局、同事生日会、陌生人多的派对',
        hint: '关系越具体，妆感强度越准',
        required: true,
        options: OUTFIT_TREE.party.relations,
      }),
      cascadeField({
        key: 'place',
        label: '地点',
        placeholder: '例如：KTV、 rooftop bar、家里客厅',
        hint: '灯光环境直接决定高光与眼妆浓度',
        required: true,
        dependsOn: 'relation',
        lockHint: '先选「对象 / 人物关系」，地点会跟着变',
      }),
      cascadeField({
        key: 'outfit',
        label: '穿搭',
        placeholder: '例如：黑色吊带 + 银色配饰',
        hint: '告诉我们主色与材质，妆面会跟着呼应',
        required: false,
        dependsOn: 'place',
        lockHint: '先选好地点，再给你搭配合适穿搭',
      }),
      STYLE_FIELD,
    ],
  },
  date: {
    sceneId: 'date',
    name: '约会',
    tagline: '心动氛围妆',
    fields: [
      singleField({
        key: 'relation',
        label: '对象 / 人物关系',
        placeholder: '例如：暧昧对象第一次见面、恋爱三周年的男朋友',
        hint: '相处阶段不同，甜度和距离感也不同',
        required: true,
        options: OUTFIT_TREE.date.relations,
      }),
      cascadeField({
        key: 'place',
        label: '地点',
        placeholder: '例如：法餐小馆、电影院、江边散步',
        hint: '烛光 vs 日光，妆感差别很大',
        required: true,
        dependsOn: 'relation',
        lockHint: '先选「对象 / 人物关系」，地点会跟着变',
      }),
      cascadeField({
        key: 'outfit',
        label: '穿搭',
        placeholder: '例如：奶油白针织 + 珍珠耳环',
        hint: '柔和面料配柔雾妆，硬挺面料配干净线条',
        required: false,
        dependsOn: 'place',
        lockHint: '先选好地点，再给你搭配合适穿搭',
      }),
      STYLE_FIELD,
    ],
  },
  interview: {
    sceneId: 'interview',
    name: '面试汇报',
    tagline: '专业得体妆',
    fields: [
      singleField({
        key: 'industry',
        label: '行业',
        placeholder: '例如：互联网大厂产品岗、四大审计、设计工作室',
        hint: '不同行业对妆感的容忍度差别明显',
        required: true,
        options: OUTFIT_TREE.interview.industries,
      }),
      singleField({
        key: 'relation',
        label: '人物关系',
        placeholder: '例如：HR 一面、部门总监终面、向客户汇报',
        hint: '决定你要多"可靠"还是多"亲和"',
        required: true,
        options: OUTFIT_TREE.interview.relations,
      }),
      cascadeField({
        key: 'place',
        label: '地点',
        placeholder: '例如：公司会议室、线上面试、大型会议厅',
        hint: '线上要考虑镜头与顶光',
        required: true,
        dependsOn: 'relation',
        lockHint: '先选「人物关系」，地点会跟着变',
      }),
      cascadeField({
        key: 'outfit',
        label: '穿搭',
        placeholder: '例如：藏青西装 + 白衬衫',
        hint: '正装越硬挺，妆越要收',
        required: false,
        dependsOn: 'place',
        lockHint: '先选好地点，再给你搭配合适穿搭',
      }),
      STYLE_FIELD,
    ],
  },
  travel: {
    sceneId: 'travel',
    name: '旅行',
    tagline: '上镜持妆',
    fields: [
      cascadeField({
        key: 'place',
        label: '地点',
        placeholder: '例如：北海道雪景、三亚海边、西北戈壁',
        hint: '气候和光线决定持妆与色彩策略',
        required: true,
        dependsOn: null,
        lockHint: '',
      }),
      cascadeField({
        key: 'outfit',
        label: '穿搭',
        placeholder: '例如：米色风衣 + 牛仔裤 + 草帽',
        hint: '旅行拍照讲究整体氛围统一',
        required: false,
        dependsOn: 'place',
        lockHint: '先选好地点，再给你搭配合适穿搭',
      }),
      STYLE_FIELD,
    ],
  },
  fantasy: {
    sceneId: 'fantasy',
    name: '奇想',
    tagline: '不被定义的艺术妆面',
    fields: [
      OCCASION_FIELD,
      // ✏️ 2026-09-30:这里原本有一格**自家**的 `key: 'style'`(6 个艺术方向 chip)。
      //   现在全场景共用 `STYLE_FIELD`(21 套配方名),它让位 —— 两格同 key 会让
      //   `inputs[f.key]` 撞在一起(两个字段渲染同一个输入框,而且用户看不见哪里错了)。
      //   ⚠️ 那 6 个词**没有丢**:它们进了 `STYLE_FIELD.placeholder` 当例子,
      //   奇想这个场景要的就是"可以是一句话、一个梦境",手写那条路照旧敞开。
      STYLE_FIELD,
    ],
  },
}

/**
 * 未知场景回落到聚会——四个入口页都直接拼 `scene=<id>`,脏参数不该让页面空掉。
 *
 * ★ 返回前**把场景名塞进「场合」那一格的 `defaultOpts`**:场景卡是那一格的默认值。
 *   `defaultOpts` 是个新键(`FormView` 的播种读它),没有它的场景在页面上就是空的一格。
 * ★ 这条默认路径**与改动前逐字等价**:预选的「聚会」经 `toBrief` 的 `occasionIdOf`
 *   映回 `party`,正是此前硬写进去的那个值。所以不碰新格的用户拿到的结果一模一样。
 */
export function getSceneForm({ sceneId = 'party' } = {}) {
  const form = SCENE_FORMS[sceneId] || SCENE_FORMS.party
  return {
    ...form,
    fields: form.fields.map((f) =>
      f.key === OCCASION_FIELD.key ? { ...f, defaultOpts: [form.name] } : f
    ),
  }
}

/**
 * 用户在「场合」那格里写的东西 → 送进 `brief.occasion` 的值。
 *
 * ★ **只认精确命中**:整格等于某个场景名(`聚会` / `约会` / …)⇒ 送它的 **id**
 *   (`party` / `date` …);**其余一律原样送用户的话**。
 * ⚠️ **不许做包含匹配。** 「朋友的聚会」里含「聚会」,把它收进 `party` 会让用户的原话
 *   到不了出图提示词 —— 而后端把 `occasion` 放开成自由文本,为的就是保住那句话。
 *   (同一口径在后端:`presetOccasionCn` 也是精确命中,见 `shared/domain/scene-rules.ts`。)
 */
function occasionIdOf(text) {
  const name = String(text || '').trim()
  const hit = SCENES.find((s) => s.name === name)
  return hit ? hit.id : name
}

/* --------------------------- 知识库直出 --------------------------- */

/**
 * 取级联字段当前的选项(转发 `kb/outfit.js` 的 `formOptions`)。
 * @param {object}    p
 * @param {string}    p.sceneId
 * @param {string}    p.fieldKey  `industry` | `relation` | `place` | `outfit`
 * @param {object}    p.values    已选值 `{ relation, place }`
 * @returns {string[]|null} **null = 上游没选,这一格应锁定**,页面显示 `lockHint`
 */
export function getFieldOptions({ sceneId, fieldKey, values = {} } = {}) {
  return formOptions(sceneId, fieldKey, values)
}

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
export const SKIN_TONE_TO_BACKEND = {
  'cool-fair': 'cool_porcelain',
  'pink-fair': 'pink_porcelain',
  'yellow-1': 'warm_ivory',
  'yellow-2': 'warm_beige',
  olive: 'olive',
  'yellow-dark': 'warm_tan',
  wheat: 'wheat',
  deep: 'deep_brown',
}

/**
 * 反查:后端的 id → 前端的档 id。★ **从上面那张表现拼,不是第二份清单**
 *   (两张各写一遍必然漂开,而漂开的那天不会报错——只会把某一档静默显示成「未定档」)。
 *
 * 它只服务**一条路**:读脸(`POST /personas/analyze`)回的是**后端**档 id,
 * 前端要把它落到展示档上。查不到就是 `undefined`,调用方**必须当成「没读出来」**,
 * 不许兜一个默认档——那等于替用户挑了一个他没确认过的肤色(红线 §8-1)。
 *
 * ★ 由 `server/test/persona-vocabulary.test.ts` 跨端对表钉住 8↔8 双射:
 *   前端 kb 的 8 个 id === 上表的**键**,后端 `SKIN_TONES` 的 8 个 id === 上表的**值**。
 */
export const SKIN_TONE_FROM_BACKEND = Object.fromEntries(
  Object.entries(SKIN_TONE_TO_BACKEND).map(([front, backend]) => [backend, front])
)

/** 后端 `dress` 的硬上限(字)。与 `shared/.../brief-fields.validator.ts` 的 `MAX_DRESS` 同值。 */
const MAX_DRESS = 80
/** 后端 `sceneText` 的硬上限(字)。与 `shared/.../brief-fields.validator.ts` 的 `MAX_SCENE_TEXT` 同值。 */
const MAX_SCENE_TEXT = 2000
/** 后端 `occasion` 的硬上限(字)。同上文件的 `MAX_OCCASION`。★ 它是**自由文本**,只判长度。 */
const MAX_OCCASION = 40
/** 后端 `styleText` 的硬上限(字)。同上文件的 `MAX_STYLE_TEXT`。 */
const MAX_STYLE_TEXT = 80
/**
 * 后端 `personaNotes` 的硬上限(字)。同上文件的 `MAX_PERSONA_NOTES`。
 * ⚠️ 它装的是**补充说明 + 认不出的自定义特征拼成的一段话**,与人设档案那格(`200`)是两个数。
 */
const MAX_PERSONA_NOTES = 300

/**
 * 截断并**留一句话**。
 *
 * ★ 静默截断是不行的:模型会以为那就是用户说的全部,而用户以为自己的话送到了。
 *   所以截断后补一句,让读它的模型知道**还有内容没看到**——它可以据此再问一句。
 *   (上限本身是后端的硬规则,超了是 422,所以这里必须裁。)
 */
function clamp(text, max) {
  if (text.length <= max) return text
  // ★ 后缀**要算进 max**:补完那一句总长仍然 ≤ max。
  //   多一个字符后端就是 422(`brief-fields.validator.ts` 的 `value.length > max`),
  //   而那道 422 打回的是**整份 brief** —— 截断本是为了守规矩,别自己越线。
  const suffix = '（原文过长，已截断）'
  if (max <= suffix.length) return text.slice(0, Math.max(max, 0))
  return `${text.slice(0, max - suffix.length)}${suffix}`
}

/** 一格里用户写的东西:`text + 勾选的预设项`,与 `FormView.collectFields` 同一口径。 */
function textOfField(field) {
  return [String(field?.text || '').trim(), ...(field?.opts || [])].filter(Boolean).join('；')
}

/**
 * 后端 `WeatherView` → `brief.weather` 的那四格。
 *
 * ★ **必须逐格挑,不能原样塞**:服务端 `startSessionSchema` 里的 `weatherShape` 是 `.strict()`,
 *   多带 `source` / `place` 任何一个键,打回的是**整份 brief**(422),不是那一格。
 * ★ 非实况来源(`source` 不是上游名)整块返回 `null`。★ **判据只此一处**:
 *   `/form` 拿同一个函数决定**摆不摆**——不标来源就没法把一份编出来的天气诚实摆成实况。
 */
export function briefWeatherOf(view) {
  if (!view || view.source === 'mock') return null
  const w = {}
  // ★ 用 `!== undefined` 判,别用真值:0℃ 与紫外线 0 都是合法值,真值判会把它们判没。
  for (const key of ['condition', 'temperatureC', 'humidityPct', 'uvIndex']) {
    if (view[key] !== undefined) w[key] = view[key]
  }
  return Object.keys(w).length ? w : null
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
 * ③ ★ **只传了图、没写字的格子要留下一句明说**,否则 agent 那边像没发生过(假开关)。
 *    参考图会送(每类一张,见 `refImagesOf`),所以这句报的是**真送出去了几张**。
 *    ⚠️ **别把 0 张写成「用户上传了 N 张图片」** —— 模型会以为手里有图,而它看不到。
 *    ⚠️ `canSendRefImages` 为假(这个部署没有读图能力,那两条路由根本不注册)时
 *    **一张都别声称送达** —— 送不出去就得说送不出去。
 *
 * ④ ✏️ `occasion` 与 `styleText` 各自有专格了(见 `OCCASION_FIELD` / `STYLE_FIELD`),
 *    不再由场景卡代填、也不再从自由文字里推。
 *
 * ⑤ ★ **天气只送实况**(`briefWeatherOf`):没拉、拉不到、或服务端标了离线示意,整块不出现——
 *    与 ①「不填就不给」同一条,宁可没有,也不塞一份对不上城市的。
 */
export function toBrief({
  sceneId = 'party',
  persona = null,
  fields = [],
  canSendRefImages = false,
  weather = null,
} = {}) {
  // ★ 用表单自己的 sceneId(它已经做过未知场景的回落),别直接把 query 里的字符串送出去。
  const form = getSceneForm({ sceneId })
  const brief = {}

  // ★ 场合:用户写的话**精确命中预设才映回 id**(理由见 `occasionIdOf`);那一格空着时
  //   回落到场景卡 —— 场景卡本来就是「这次为什么化妆」的一个信号,只是现在能覆盖它了。
  const occasion = occasionIdOf(textOfField(fields.find((f) => f.key === OCCASION_FIELD.key)))
  const resolved = occasion || form.sceneId
  if (resolved) brief.occasion = clamp(resolved, MAX_OCCASION)

  // ★ 风格:那一格的原话(chip 名或手写)原样送 —— `styleText` 是自由文本,
  //   收窄成 21 条之一是后端 `styleFor()` 的事,不是这里的。
  const styleText = textOfField(fields.find((f) => f.key === STYLE_FIELD.key))
  if (styleText) brief.styleText = clamp(styleText, MAX_STYLE_TEXT)

  const tone = SKIN_TONE_TO_BACKEND[persona?.skinTone || '']
  if (tone) brief.skinTone = tone

  // ★ 天气是用户在 `/form` 上**点出来的**(见 `FormView`),不是必填:拿不到就整块不出现。
  const live = briefWeatherOf(weather)
  if (live) brief.weather = live

  // ★ 特征分两路:目录里的进 `features`(后端 `face-catalog` 有目录,`propose_look` 据此挑策略);
  //   用户自己加的那几条(`<分组 id>/<原话>`)并进下面那段话 ——
  //   塞进 `features` 是**白塞**(后端会当未知 id 剔掉),它就静默没了。
  const known = []
  const custom = []
  for (const fid of persona?.features || []) {
    if (!fid) continue
    ;(featureById(fid) ? known : custom).push(fid)
  }
  if (known.length) brief.features = [...known]

  // ★ 「补充说明」+ 自己加的特征拼成一段话,模型在系统提示里读得到(`brief-description.ts`)。
  //   拼的是 `featureLabel` 那句话,**不带** `<分组 id>/` 那个前缀(那是前端存的形状)。
  const notes = [
    String(persona?.notes || '').trim(),
    custom.length ? `其它特征：${custom.map(featureLabel).join('、')}` : '',
  ]
    .filter(Boolean)
    .join('；')
  if (notes) brief.personaNotes = clamp(notes, MAX_PERSONA_NOTES)

  const dress = textOfField(fields.find((f) => f.key === 'outfit'))
  if (dress) brief.dress = clamp(dress, MAX_DRESS)

  // ★ 两个专格不进 `sceneText` —— 再抄一遍就是同一句话的两个来源,迟早会漂。
  //   ⚠️ 但**图**照旧要报(见 ③)。
  const DEDICATED = [OCCASION_FIELD.key, STYLE_FIELD.key]
  // ⚠️ 标签**从 `form.fields` 查**,传进来的 `fields` 只有 `{key,type,text,images}`、**没有
  //   label**(`FormView.collectFields` 的形状):写 `${f.label}` 会把每一行印成
  //   「undefined：黑色吊带」,而它照常送进模型、照常不报错。
  const labelOf = new Map(form.fields.map((f) => [f.key, f.label]))
  // 送了几张要逐格照实说(③)。★ 这个部署没有读图能力时,一张都没送出去。
  const { skipped, sentByField } = refImagesOf(fields)
  const arrivedOf = (key) => (canSendRefImages ? sentByField.get(key) || 0 : 0)

  const lines = fields
    .map((f) => {
      const label = labelOf.get(f.key) || f.key
      const text = DEDICATED.includes(f.key) ? '' : textOfField(f)
      const count = (f.images || []).length
      if (text) return `${label}：${text}`
      if (!count) return ''
      const arrived = arrivedOf(f.key)
      // 送齐了 / 送到一部分 / 一张都没送 —— 三种都不许含糊(③)。
      if (arrived >= count) return `${label}：用户上传了 ${count} 张图片`
      if (arrived > 0) return `${label}：用户上传了 ${count} 张图片，其中 ${arrived} 张已随会话送达`
      return `${label}：用户上传了 ${count} 张图片，这一格没能送上去`
    })
    .filter(Boolean)
  // 为什么会有没送到的,整段只说一次 —— 逐格重复一遍就没人看得下去。
  const missing = canSendRefImages
    ? [...skipped.values()].reduce((a, b) => a + b, 0)
    : fields.reduce((n, f) => n + (f.images || []).length, 0)
  if (missing) {
    lines.push(
      canSendRefImages
        ? `（参考图每个会话每类只留一张，另有 ${missing} 张没能送上去）`
        : '（这个部署没有读图能力，参考图一张都没能送上去）'
    )
  }
  if (lines.length) brief.sceneText = clamp(lines.join('\n'), MAX_SCENE_TEXT)

  return brief
}

