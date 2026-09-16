/**
 * agent/application/look-state-description.ts —— 把「妆面定下来没有」讲成一行字。
 *
 * ★ **它是 `render-state-description.ts` 的姊妹文件,写法与取舍全照那一份**:
 *   同一个道理——**一句关于状态的话,不能交给手上没有状态的人**。
 *   出图那边翻过的车(v5)是「模型说有个确认框,而根本没有」;
 *   妆面这边翻的车是「模型说妆面定了,而 `lookSpec` 是空的」。
 *
 * **实测到的翻车(2026-09-16,真实模型 `qwen-flash`)**:
 *   `propose_look` 被拒(肤色收窄了可用色域)之后,模型**没有重试**,
 *   而是在正文里把一套它自己以为改好了的妆面讲给用户听。用户当然以为定了;
 *   而会话里 `lookSpec` 一直空着,直到"出图"那一轮在 `render_look` 那里塌下来。
 *
 * ★ **已经修过的部分**(别重复修):`propose-look.ts` 的失败文案已经改成
 *   「★ 这次**没有记下任何妆面** …请修正后再调用一次」——那是**当轮**的提醒,
 *   实测有效(同日另一次诊断里模型确实在同一个回合内重试并成功了)。
 *
 * ★ **这一行补的是它够不着的那一段**:那条工具结果只活在这一轮里。
 *   模型若照旧用正文讲完就收尾,**下一轮的系统提示里只有「当前还没有提出过妆面」**——
 *   准确,但读不出"你上轮被拒了"和"正文里写了不算"这两件事。
 *   于是它以为自己已经提过了,再也不会去调那个工具;用户手上则什么也没有。
 *   ⇒ 失败必须**跨轮活下来**,同 `render_look` 的 `NO_CONFIRMATION_NOTICE`。
 *
 * ⚠️ **妆面已经有一套时,这一行照样要报失败**,别只报那一套老的。
 *   那种形状是:定稿成功 → 用户要改 → 改的那次被拒 → `lookSpec` 里**还是老的那套**。
 *   只看 `lookSpec` 的写法(比如 `session.lookSpec ? … : …` 的三元)会显示成
 *   "一切正常",而模型上一条工具结果说的是"这次没记下",两边对不上;
 *   它可能就此跟用户说"改好了",可渲染用的仍是老妆面。所以这一支要**明说老的还在**。
 *
 * ⚠️ **故意不复述拒因**:那条工具结果就在上下文里,原文比这里转述得准。
 *   同 `render-state-description.ts` 不报"还能出几张"的理由——多一份就多一处能对不上的地方。
 *
 * ★ **两条分支都要留住**(v11 首次真实模型实测之后补的):
 *   · `lookSpec` 空 —— 无论"一次都没调过"还是"调了被拒",这一格都要说明**正文里描述过不算数**;
 *   · `lookSpec` 有值但上次改失败 —— 要明说"改动没记下、老的还留着"。
 *   实测里**更常见的是第一种**(首轮一次 `propose_look` 都没调、正文却讲了一整套),
 *   而那种形状下没有失败的结果块,只写"被拒了"那半句会**够不着**。
 */
import { describeLook } from '../../makeup/index.js';
import { TOOL_NAMES } from '../domain/tools/definitions.js';
import type { Message } from '../domain/entities/message.js';
import type { Session } from '../domain/entities/session.js';

/** 妆面这件事的当前状态。**要能被模型直接照字面用**,不留要靠推断的空白。 */
export function describeLookState(session: Session): string {
  // ★ 空格那一支也钉了一句「正文里不算数」——**这不是复述规则,是实测里更常见的那种失败**:
  //   v11 首轮真实模型跑出来的是**「一次 propose_look 都没调、正文里却讲了一整套妆面」**
  //   (「底妆遮瑕度4…眼影砖红…」)。那一支 `lastProposeFailed` 是假(压根没有结果块),
  //   所以只补"被拒"那半句是够不着的。**"这一格只认工具成功"是对这一格的说明,不是一条新义务。**
  const current = session.lookSpec
    ? `当前已提出的妆面:${describeLook(session.lookSpec)}`
    : '当前还没有提出过妆面。★ 这一格只认 `propose_look` 成功——**正文里描述过妆面不算数**,' +
      '在它进这一格之前,出图那一环也没有妆面可用。';

  if (!lastProposeFailed(session.messages)) return current;

  // ★ 关键词是「正文里…不算数」——实测的翻车正是"正文里讲了、就当记下了"。
  return session.lookSpec
    ? `${current}⚠️ 你上一次**改妆面**的 \`propose_look\` 被拒了(原因见那条工具结果):` +
        '**改动的部分一个字都没记下,上面这套老的还留着**——正文里讲成改好了不算数,' +
        '要替换它只能是改对之后**再调一次**。'
    : `${current}⚠️ 上一次 \`propose_look\` 被拒了(原因见那条工具结果):` +
        '**正文里把妆面讲成已经定下来的不算数**——要提出妆面,只有改对之后' +
        '**再调一次**这一条路。';
}

/**
 * 这个工具的**最后一次**结果是失败吗?
 *
 * ★ **取最后一次,不是"有没有失败过"**:先失败后成功是正常路径(模型重试了),
 *   那时若还报着早先那次失败,就成了假警报。
 *   ⇒ `lookSpec` 有值时这一支基本只在"定稿后又改失败"那种形状上有用,
 *     而那正是它该说话的地方。
 *
 * ⚠️ 结果块本身**不带工具名**(只有 `toolUseId`),所以先把 `tool_use` 的名字收成表,
 *   再按 id 回查。同 `danglingToolUses` 一样,判据是**按名字挑**,不是"有没有欠账"。
 */
function lastProposeFailed(messages: readonly Message[]): boolean {
  const nameOf = new Map<string, string>();
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type === 'tool_use') nameOf.set(block.id, block.name);
    }
  }

  let failed = false;
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type !== 'tool_result') continue;
      if (nameOf.get(block.toolUseId) !== TOOL_NAMES.proposeLook) continue;
      failed = block.isError === true;
    }
  }
  return failed;
}
