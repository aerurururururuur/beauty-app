/**
 * 场景穿搭级联库 —— 数据来源：原型《场景+对象+穿搭.docx》
 *
 * 选项之间有逻辑依赖：对象 → 地点 → 穿搭。上游没选时下游锁定（返回 null），
 * 由 `FormView` 显示 `lockHint`。只做映射，不杜撰。
 */

/* —— 聚会：对象 → 地点 → 穿搭 —— */
const PARTY_LIGHT = ['针织/软糯', '棉麻/文艺', '牛仔/休闲', '浅色/居家感']
const PARTY_WARM = ['法式/复古', '碎花/长裙', '大地色/针织', '浅色/温柔系']
const PARTY_NIGHT = ['亮片/金属', '黑色系', '深色/酷飒', '亮色/吸睛', '吊带/热裤']
const PARTY_BANQUET = ['西装/通勤', '法式/复古', '深色/大衣', '亮片/金属', '黑白/高级感']
const PARTY_OUTDOOR = ['工装/山野', '亮色/运动', '大地色/机能', '牛仔/休闲']
const PARTY_CASUAL = ['牛仔/休闲', '黑白/休闲', '深色/酷飒', '亮色/吸睛']
const PARTY_PARTY = ['吊带/热裤', '亮色/撞色', '黑白/休闲', '亮片/金属']

const PARTY = {
  relations: ['闺蜜局', '同事/同学聚会', '生日会', '陌生人多的派对', '家人聚餐', '商务/行业交流局', '带娃亲子局'],
  placeByRelation: {
    闺蜜局: ['室内暖光餐厅', 'KTV / 酒吧', '户外草坪/公园', '网红打卡餐厅', '私人影院', '咖啡厅'],
    家人聚餐: ['家中客厅', '室内暖光餐厅', '户外庭院/草坪', '酒店宴会厅'],
    同事: ['KTV / 酒吧', '室内暖光餐厅', '桌游店/剧本杀', '户外露营地'],
    同学聚会: ['KTV / 酒吧', '室内暖光餐厅', '桌游店/剧本杀', '户外露营地'],
    '同事/同学聚会': ['KTV / 酒吧', '室内暖光餐厅', '桌游店/剧本杀', '户外露营地'],
    生日会: ['酒店宴会厅', 'KTV / 酒吧', '户外草坪', '别墅轰趴馆'],
    '陌生人多的派对': ['Rooftop bar', '户外音乐节', 'KTV / 酒吧', '艺术展酒会'],
    商务: ['酒店宴会厅', '室内暖光餐厅', '高端酒廊', '咖啡厅'],
    '商务/行业交流局': ['酒店宴会厅', '室内暖光餐厅', '高端酒廊', '咖啡厅'],
    带娃: ['家中客厅', '户外草坪/公园', '亲子餐厅', '室内游乐场'],
    '带娃亲子局': ['家中客厅', '户外草坪/公园', '亲子餐厅', '室内游乐场'],
  },
  outfitByPlace: {
    家中客厅: PARTY_LIGHT,
    户外草坪: PARTY_LIGHT,
    '户外庭院/草坪': PARTY_LIGHT,
    室内暖光餐厅: PARTY_WARM,
    精致下午茶: PARTY_WARM,
    'KTV / 酒吧': PARTY_NIGHT,
    'Rooftop bar': PARTY_NIGHT,
    酒店宴会厅: PARTY_BANQUET,
    高端酒廊: PARTY_BANQUET,
    户外露营地: PARTY_OUTDOOR,
    户外音乐节: PARTY_OUTDOOR,
    '桌游店/剧本杀': PARTY_CASUAL,
    私人影院: PARTY_CASUAL,
    别墅轰趴馆: PARTY_PARTY,
    网红打卡餐厅: PARTY_WARM,
    艺术展酒会: PARTY_NIGHT,
    咖啡厅: PARTY_WARM,
    '户外草坪/公园': PARTY_LIGHT,
    亲子餐厅: PARTY_WARM,
    室内游乐场: PARTY_CASUAL,
  },
  defaultOutfit: ['针织/软糯', '牛仔/休闲', '浅色/居家感', '还没定'],
}

/* —— 约会：对象 → 地点 → 穿搭 —— */
const DATE_COFFEE = ['温柔针织', '衬衫/通勤', '浅色/纯欲', '珍珠配饰']
const DATE_CINEMA = ['休闲/街头', '棉麻/文艺', '宽松舒适']
const DATE_WALK = ['休闲/街头', '牛仔/休闲', '亮色/运动', '舒适平底鞋']
const DATE_NIGHTMARKET = ['休闲/街头', '黑白/休闲', '亮色/吸睛']
const DATE_FESTIVAL = ['亮片/金属', '牛仔/休闲', '亮色/吸睛']
const DATE_MARKET = ['休闲/街头', '牛仔/休闲', '亮色/运动']
const DATE_HOME = ['针织/软糯', '棉麻/文艺', '浅色/居家感', '宽松舒适']
const DATE_ROMANTIC = ['连衣裙', '法式/复古', '缎面/丝绒', '精致配饰']
const DATE_TRANSIT = ['连衣裙', '温柔针织', '亮色/吸睛', '舒适平底鞋']
const DATE_MIDHIGH = ['连衣裙', '衬衫/通勤', '大地色/质感', '浅色/得体']

const DATE = {
  relations: ['暧昧期 / 初见', '稳定恋爱中', '纪念日', '相亲', '朋友以上', '异地重逢'],
  placeByRelation: {
    '暧昧期 / 初见': ['咖啡/甜品店', '电影院', '户外散步', '艺术展/看展'],
    稳定恋爱中: ['自驾/兜风', '夜市/小吃街', '私人影院', '居家做饭'],
    纪念日: ['烛光餐厅', '高空景观餐厅', '浪漫民宿', '定制私厨'],
    相亲: ['安静的咖啡/甜品店', '美术馆', '中高端餐厅'],
    朋友以上: ['户外散步', '音乐节/Livehouse', '桌游店/密室', '创意市集'],
    异地重逢: ['高铁站/机场接机', '私人影院', '浪漫民宿', '烛光餐厅'],
  },
  outfitByPlace: {
    '咖啡/甜品店': DATE_COFFEE,
    电影院: DATE_CINEMA,
    户外散步: DATE_WALK,
    '艺术展/看展': DATE_COFFEE,
    '自驾/兜风': DATE_WALK,
    '夜市/小吃街': DATE_NIGHTMARKET,
    私人影院: DATE_CINEMA,
    居家做饭: DATE_HOME,
    烛光餐厅: DATE_ROMANTIC,
    高空景观餐厅: DATE_ROMANTIC,
    浪漫民宿: DATE_HOME,
    定制私厨: DATE_ROMANTIC,
    '安静的咖啡/甜品店': DATE_COFFEE,
    美术馆: DATE_COFFEE,
    中高端餐厅: DATE_MIDHIGH,
    '音乐节/Livehouse': DATE_FESTIVAL,
    '桌游店/密室': DATE_MARKET,
    创意市集: DATE_MARKET,
    '高铁站/机场接机': DATE_TRANSIT,
  },
  defaultOutfit: ['温柔针织', '浅色/纯欲', '休闲/街头', '还没定'],
}

/* —— 面试汇报：行业（独立）→ 人物关系 → 地点 → 穿搭 —— */
const INTERVIEW = {
  industries: ['互联网 / 科技', '金融 / 咨询', '法律 / 政务', '教育 / 医疗', '创意 / 设计', '媒体 / 公关'],
  relations: ['HR 一面', '直属主管', '部门总监 / 终面', '客户 / 甲方', '全员汇报'],
  placeByRelation: {
    'HR 一面': ['线上面试/视频', '公司会议室', '咖啡厅'],
    直属主管: ['公司会议室', '咖啡厅', '会议厅/讲台'],
    '部门总监 / 终面': ['会议厅/讲台', '公司会议室'],
    '客户 / 甲方': ['公司会议室', '咖啡厅', '会议厅/讲台'],
    全员汇报: ['会议厅/讲台', '公司会议室'],
  },
  outfitByPlace: {
    '线上面试/视频': ['衬衫 + 西裤', '商务休闲', '还没定'],
    公司会议室: ['全套西装', '衬衫 + 西裤', '商务休闲'],
    '会议厅/讲台': ['全套西装', '衬衫 + 西裤', '制服 / 工装'],
    咖啡厅: ['商务休闲', '衬衫 + 西裤', '还没定'],
  },
  defaultOutfit: ['全套西装', '衬衫 + 西裤', '商务休闲', '还没定'],
}

/* —— 旅行：地点 → 穿搭（无对象层级）—— */
const TRAVEL = {
  places: ['海边 / 热带', '雪景 / 高原', '城市街拍', '古镇 / 人文', '山林 / 户外', '沙漠 / 异域'],
  outfitByPlace: {
    '海边 / 热带': ['比基尼/沙滩', '浅色/米白', '碎花/长裙', '亮色/度假', '吊带/热裤', '还没定'],
    '雪景 / 高原': ['羽绒/保暖', '毛衣/软糯', '深色/大衣', '亮色/滑雪', '浅色/雪地', '还没定'],
    城市街拍: ['西装/通勤', '牛仔/休闲', '深色/酷飒', '亮色/吸睛', '法式/复古', '还没定'],
    '古镇 / 人文': ['素色/新中式', '棉麻/文艺', '复古/印花', '旗袍/国风', '大地色/针织', '还没定'],
    '山林 / 户外': ['冲锋衣/户外', '工装/山野', '亮色/运动', '大地色/机能', '黑白/休闲', '还没定'],
    '沙漠 / 异域': ['红色/长裙', '土色/旷野', '印花/民族', '白色/亚麻', '深色/异域', '还没定'],
  },
  defaultOutfit: ['休闲/街头', '牛仔/休闲', '浅色/米白', '还没定'],
}

/** 场景 → 级联树。奇想没有穿搭层级，不在此列。 */
export const OUTFIT_TREE = {
  party: PARTY,
  date: DATE,
  interview: INTERVIEW,
  travel: TRAVEL,
}

/**
 * 归一化选项文案：剥掉空格、统一斜杠写法（`／`、`、` → `/`）、转小写。
 * ⚠️ 界面标签为中文排版写成「同事 / 同学聚会」，而映射表的键写「同事/同学聚会」——
 *   不归一化就查不到表，表现为**选完对象、地点一片空白且连锁定提示都没有**。
 */
const normKey = (s) =>
  String(s ?? '')
    .trim()
    .replace(/[／、]/g, '/')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, '')
    .toLowerCase()

/** 先精确命中，再按归一化命中；都命中不到返回 undefined，交给调用方兜底 */
function pickFromMap(map, key) {
  if (!map || !key) return undefined
  if (map[key]) return map[key]
  const n = normKey(key)
  for (const k of Object.keys(map)) {
    if (normKey(k) === n) return map[k]
  }
  return undefined
}

/** 该场景映射表里出现过的全部地点（去重）。上游取值未知时的兜底，别让下游空着 */
function allPlaces(t) {
  if (!t.placeByRelation) return t.places || []
  const seen = new Set()
  const out = []
  for (const list of Object.values(t.placeByRelation)) {
    for (const p of list || []) {
      if (seen.has(p)) continue
      seen.add(p)
      out.push(p)
    }
  }
  return out
}

/**
 * 取某场景某字段的当前可选项。
 * @param {string} sceneId
 * @param {string} fieldKey `industry` | `relation` | `place` | `outfit`
 * @param {object} values   已选值 `{ relation, place }`
 * @returns {string[]|null} 选项数组；**null = 上游未选，本格应锁定**
 */
export function formOptions(sceneId, fieldKey, values = {}) {
  const t = OUTFIT_TREE[sceneId]
  if (!t) return []
  switch (fieldKey) {
    case 'industry':
      return t.industries || []
    case 'relation':
      return t.relations || []
    case 'place':
      // 有 placeByRelation = 地点随对象变；没选对象先锁定。未知对象回落到该场景全部地点
      if (t.placeByRelation) {
        if (!values.relation) return null
        return pickFromMap(t.placeByRelation, values.relation) || allPlaces(t)
      }
      // 旅行这类无对象层级：地点就是顶层选项
      return t.places || []
    case 'outfit': {
      if (!values.place) return null
      // 地点是手写自由文本时命中不到表，给该场景的通用穿搭兜底
      const list = t.outfitByPlace ? pickFromMap(t.outfitByPlace, values.place) : null
      return list || t.defaultOutfit || []
    }
    default:
      return []
  }
}
