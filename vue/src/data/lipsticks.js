/**
 * 口红数据库样例（演示数据）。
 * rgb 为近似 sRGB 值，供前端色块展示与 mock 试色使用；
 * 后端就绪后以 GET /api/lipsticks 返回为准。
 */
export const lipsticks = [
  { id: 'dior-999', brand: 'Dior', name: '传奇红 999', rgb: [182, 26, 30], finish: '哑光', tags: ['正红', '气场'], desc: '经典正红，不挑肤色的显白神器' },
  { id: 'lancome-196', brand: 'Lancôme', name: '胡萝卜 196', rgb: [214, 88, 26], finish: '哑光', tags: ['胡萝卜橘', '元气'], desc: '元气胡萝卜橘，显白又有活力' },
  { id: 'mac-chili', brand: 'MAC', name: '小辣椒 Chili', rgb: [166, 52, 30], finish: '丝绒', tags: ['砖红', '复古'], desc: '砖红小辣椒，复古高级感' },
  { id: 'armani-400', brand: '阿玛尼', name: '挚爱 400', rgb: [182, 16, 24], finish: '丝绒', tags: ['红管', '丝绒'], desc: '阿玛尼红管经典，丝绒质地' },
  { id: '3ce-goingright', brand: '3CE', name: 'Going Right', rgb: [226, 112, 76], finish: '滋润', tags: ['蜜桃橘', '温柔'], desc: '奶杏蜜桃橘，温柔日常' },
  { id: 'chanel-58', brand: 'CHANEL', name: '香奈儿 58', rgb: [138, 30, 38], finish: '丝绒', tags: ['红棕', '气质'], desc: '复古红棕，秋冬气质担当' },
  { id: 'tf-16', brand: 'TOM FORD', name: '斯嘉丽红 16', rgb: [176, 40, 32], finish: '滋润', tags: ['水润', '番茄'], desc: '番茄红，水润又显白' },
  { id: 'shu-or570', brand: '植村秀', name: '血橙 OR570', rgb: [236, 92, 44], finish: '滋润', tags: ['血橙', '活力'], desc: '活力血橙，春夏首选' },
  { id: 'perfectdiary-v08', brand: '完美日记', name: 'V08 桃金', rgb: [198, 66, 98], finish: '哑光', tags: ['桃金', '细闪'], desc: '带细闪的桃金色，约会利器' },
  { id: 'florasis-m211', brand: '花西子', name: '同心锁 M211', rgb: [160, 26, 46], finish: '丝绒', tags: ['雕花', '复古红'], desc: '微雕红，国风正红' },
  { id: 'judydoll-09', brand: '橘朵', name: '枸杞红 09', rgb: [212, 94, 78], finish: '滋润', tags: ['枸杞', '日常'], desc: '清透枸杞红，日常通勤友好' },
  { id: 'ysl-13', brand: 'YSL', name: '正红 13', rgb: [210, 52, 66], finish: '滋润', tags: ['元气', '亮红'], desc: '明亮正红，元气满格' }
]
