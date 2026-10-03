/**
 * 信息收集表单的自检：不起服务、不开浏览器，直接用裸 node 跑。
 *
 * 用法：node tools/check-form.mjs
 *
 * ★ 它守的是「级联选项」那一个洞：表单上给用户看到的每个选项，都必须能走到非空的下游。
 *   曾经踩过 —— 标签写「同事 / 同学聚会」（斜杠带空格）而映射表键写「同事/同学聚会」，
 *   结果选完对象、地点一片空白,而且连锁定提示都没有(看着就像这一格本来就没有选项)。
 *
 * ★ 它能跑起来,靠的是 `src/api/design.js` 的 import 都写全了 `.js` 后缀 ——
 *   node 的 ESM 解析器要求扩展名。本仓没有测试框架,这个脚本就是那条链的护栏。
 */
import { getFieldOptions, getSceneForm } from '../src/api/design.js'

let pass = 0
const fails = []
const ok = (name, cond, extra = '') =>
  cond ? pass++ : fails.push(`✗ ${name}${extra ? ' — ' + extra : ''}`)

/** 有「对象 → 地点 → 穿搭」三层的四个场景。奇想没有穿搭层级,不在此列。 */
const CASCADE_SCENES = ['party', 'date', 'interview', 'travel']

for (const sc of CASCADE_SCENES) {
  const f = getSceneForm({ sceneId: sc })
  const relField = f.fields.find((x) => x.key === 'relation')
  const placeField = f.fields.find((x) => x.key === 'place')
  const outfitField = f.fields.find((x) => x.key === 'outfit')

  ok(`${sc} 地点是级联字段`, !!placeField && placeField.cascade === true)
  ok(`${sc} 穿搭是级联字段`, !!outfitField && outfitField.cascade === true)
  ok(`${sc} 级联字段是单选`, placeField?.single === true && outfitField?.single === true)

  // 未选上游 ⇒ 下游必须锁定(null),不能是空数组——空数组在页面上就是一格没有提示的空白
  ok(
    `${sc} 未选地点时穿搭锁定`,
    getFieldOptions({ sceneId: sc, fieldKey: 'outfit', values: {} }) === null
  )

  const topPlaces = getFieldOptions({ sceneId: sc, fieldKey: 'place', values: {} })
  if (placeField && placeField.dependsOn) {
    ok(`${sc} 未选对象时地点锁定`, topPlaces === null)
    ok(`${sc} 锁定态有提示语`, !!placeField.lockHint)
  } else {
    ok(
      `${sc} 无对象层级时地点直接可选`,
      Array.isArray(topPlaces) && topPlaces.length > 0
    )
  }

  // 核心那两条：每个对象都要能筛出地点；每个地点都要能给出穿搭
  const relations = relField ? relField.options || [] : ['']
  const badRel = []
  const badOutfit = []
  for (const rel of relations) {
    const places = getFieldOptions({ sceneId: sc, fieldKey: 'place', values: { relation: rel } })
    if (!Array.isArray(places) || !places.length) {
      badRel.push(`${rel}→${Array.isArray(places) ? '空' : String(places)}`)
      continue
    }
    for (const p of places) {
      const outfits = getFieldOptions({ sceneId: sc, fieldKey: 'outfit', values: { place: p } })
      if (!Array.isArray(outfits) || !outfits.length || outfits.some((o) => !o)) {
        badOutfit.push(`${rel}→${p}`)
      }
    }
  }
  ok(`${sc} 每个对象都能筛出地点`, badRel.length === 0, badRel.join('、'))
  ok(`${sc} 每个地点都能给出穿搭`, badOutfit.length === 0, badOutfit.join('、'))

  // 归一化查表：后端回传带空格的写法(「同事 / 同学聚会」)也要命中
  if (relations.length) {
    const spaced = relations[0].replace(/\//g, ' / ')
    const hit = getFieldOptions({ sceneId: sc, fieldKey: 'place', values: { relation: spaced } })
    ok(`${sc} 带空格的写法也能命中`, Array.isArray(hit) && hit.length > 0, spaced)
  }
}

// 奇想没有对象/地点/穿搭层级：取级联选项不许报错
ok(
  '奇想取级联选项不报错',
  Array.isArray(getFieldOptions({ sceneId: 'fantasy', fieldKey: 'place', values: {} }))
)

console.log(fails.length ? fails.join('\n') : '')
console.log(`\n表单自检通过 ${pass} 项，失败 ${fails.length} 项`)
process.exit(fails.length ? 1 : 0)
