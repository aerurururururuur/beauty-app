/**
 * agent/application/brief-description.ts —— 把「agent 现在知道什么」讲成一行字。
 *
 * 两处要用它:① `patch_brief` 的 observation(告诉模型"记下了,当前是这样");
 * ② 系统提示里嵌当前 brief(§7.3 第 7 条:最该留住的是它的当前值,不是聊天原文)。
 *
 * ★ **值原样透出,不翻译。** 这是刻意的:单一源在
 * `shared/domain/scene-rules.ts`,**曾经有第三份**中文名表与前端 constants 各写一遍,
 * 加减场合时会漏改(那张表随表单流水线一起删掉了)。
 * ⇒ 所以本文件**不建中文标签表**:中文名在别处已经有一份,再抄第二份就是重犯那个错。
 * 而**模型本来就用这些值思考**(它的工具入参就是这些值),
 * 直接给它 `肤色深浅=deep` 比给它一个可能对不上的中文名更准。
 * 中文只出现在**给用户看的话**里,而那是模型自己组织的,不需要我替它备一份词表。
 *
 * ⚠️ **`场合` 那一格现在是用户的原话**(2026-09-30),可能是预设表外的「朋友的婚礼」——
 *   照原样透出,别拿去查表(查不到会退成"没填过",模型就会重问一遍用户刚说过的话)。
 */
import type { MakeupBrief } from '../../shared/index.js';

/** 字段名用中文(帮模型对上用户的话),值原样。★ 顺序即渲染顺序。 */
const FIELD_LABELS: readonly (readonly [keyof MakeupBrief, string])[] = [
  ['occasion', '场合'],
  ['styleText', '想要的风格'],
  ['sceneText', '用户原话'],
  // ★ 分析器写进去的(用户填不了),见 `MakeupBrief.sceneNote`。
  ['sceneNote', '场景图读数'],
  ['skinType', '肤质'],
  ['skinTone', '肤色深浅'],
  ['features', '本人特征'],
  ['dress', '穿搭'],
  // ★ 用户在人设档案里自己写的那段话 + 词表里没有的特征。**没登记这一行它就不进系统提示**,
  //   模型从头到尾不知道有这回事(而 200、日志干净,看不出来)。
  ['personaNotes', '人设补充说明'],
];

/**
 * 渲染当前已知需求。**空 brief 要有明确的说法**——留空字符串会让模型
 * 误以为"系统没告诉它",从而反复调用 `patch_brief` 去确认。
 */
export function describeBrief(brief: MakeupBrief): string {
  const parts: string[] = [];
  for (const [key, label] of FIELD_LABELS) {
    const value = brief[key];
    if (value !== undefined && value !== '') parts.push(`${label}=${String(value)}`);
  }
  // weather 不在 agent 的工具面里(§7.2 只列了场合/肤质/肤色/穿搭/自由文字),
  // 但 MakeupBrief 有这一格;若上游填过,照实透出,免得模型以为没有天气信息。
  if (brief.weather) {
    parts.push(`天气=${brief.weather.condition ?? '未知'}`);
  }
  return parts.length > 0 ? parts.join(';') : '(还什么都不知道,需要向用户问)';
}
