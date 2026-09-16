/**
 * application/usecases/confirm-render.ts —— ★ **用户要一张成片**(点了一下)。
 *
 * 这是**唯一**会传 `resume: 'approved'` 的地方,也就是整个系统里
 * **唯一能让引擎真的花钱**的入口。所以它只有三件事要做,而且顺序不能变:
 *
 * 1. **归属校验**(同 `SendMessage`:不存在与不属于同一用户报同一个错);
 * 2. ★ **确认这一次"确认"真的成立**——否则不跑(判据见下);
 * 3. 跑循环(带 `'approved'`),存回。
 *
 * ── ★ 两条入口,判据是"历史里有没有一条 `render_look` 正欠着结果" ──────────────
 *
 * · **入口 A —— 批准模型的提议。** 模型调了 `render_look`、服务端挂起等用户点头,
 *   历史末尾就欠着一条 `tool_use`(`danglingToolUses` 读得出来)。用户点了确认,
 *   就按 `'approved'` 把那一轮重放掉 —— **这条一字未改**。
 * · **入口 B —— 用户自己点的「确认生成」。** ✏️ 2026-09-16 新增。
 *   没有任何提议欠着,但**妆面与照片都齐**(`renderReadiness === 'ready'`)⇒
 *   服务端**代递**一条 `render_look` 提议,同一次请求里按 `'approved'` 跑完。
 *
 * ★ **为什么必须有入口 B**:出图本来是"模型提议 → 用户确认",而"提议"是**提示词级**的
 *   东西(工具描述 + 规则 6)。2026-09-16 实测里,真实模型在用户**两轮明确要图**时
 *   一次都没调那个工具,整条路当场没有别的出入口 —— 而设计文档 §7.4.3 自己写着
 *   「闸门是那条 HTTP 路由、**提示词不是闸门**」。入口 B 把"用户要图"这件事
 *   **从模型的措辞里搬回代码**(界面上那条带按钮的消息由视图按状态摆,
 *   见 `turn-view.mapper.ts` 的 `renderOffer`),花钱那一下仍然是一次人的点击。
 *
 * ★ **两条入口共用一条重放链路**,所以额度检查、引擎调用、先落盘再记会话、
 *   `addRender` 的 `seq` 计算、事件协议**一行都不用抄第二份**。
 *
 * ⚠️ **它不自己判断额度**。额度在 `RenderLookTool` 里查(提议时与批准时各一次),
 *   因为那里才看得见"这一轮重放里到底是谁在要出图"。
 *   在这里再查一遍等于把同一条规则抄第二份——而两份规则迟早会不一致。
 *   ★ 入口 B **没有"提议阶段"**,所以那一支实际只跑到 `render()` 里那第二遍;
 *   这不违背"别让用户点了才说不行":视图只在齐备且还有额度时才把按钮摆出来
 *   (判据同源:`renderReadiness` / `rendersLeft`)。
 *
 * ── ⚠️ 残余空洞(如实记着,本次不关)────────────────────────────────────────
 *
 * 两道防线之外仍有一个洞:**响应在回程丢了、用户又点了一次**,服务端看到的是
 * 一个"妆面照片齐、额度也有"的会话 ⇒ 那在它眼里是一个**正当的新请求**,会真出第二张。
 * 关掉它要的是幂等键(客户端给这次点击一个 id,服务端认这个 id 只花一次钱),
 * 而幂等键要在这条**"一个出图参数都不收"**的路由上加客户端输入 ——
 * 那条规矩(见 `definitions.ts` 的 `RENDER_LOOK` / `agent-http.ts`)不为这个洞破例。
 * ★ 所以界面上那三道(出图期间禁用、出完改口叫「再生成一张」、进程内 in-flight 锁)
 *   是**缓解**,不是证明。别把这段读成"已经安全了"。
 */
import { randomUUID } from 'node:crypto';
import { AppError, ErrorCode } from '../../../shared/index.js';
import { assistantMessage, danglingToolUses } from '../../domain/entities/message.js';
import type { ToolUseBlock } from '../../domain/entities/message.js';
import { appendMessages, renderReadiness } from '../../domain/entities/session.js';
import type { Session } from '../../domain/entities/session.js';
import type { SessionStore } from '../../domain/ports/session-store.js';
import { TOOL_NAMES } from '../../domain/tools/definitions.js';
import type { AgentLoop, AgentTurnResult } from '../agent-loop.js';

export class ConfirmRender {
  /**
   * ★ **按会话的 in-flight 锁**(进程内,`finally` 里清)。
   *
   * 防的是**并发重复点击**:两个请求会同时读到同一份"没有欠账、条件齐"的会话,
   * 于是**各调一次引擎、各算出同一个 `seq`** —— 出两张图、扣两次钱,
   * 而会话里只留得下一条记录(后写的那份覆盖前一份)。
   * 这在入口 B 出现**之前就已经是漏的**(那时两个请求都会撞上同一条待确认提议,
   * 各自重放一次),只是没有入口 B 的时候没人会那么快连点两下。
   *
   * ⚠️ **它只在"单进程 + 内存会话存储"下成立**。将来会话落盘、服务多实例,
   *   这把锁就管不住了,那时要的是存储层的乐观锁(到那次再一起做,
   *   不在这里预先发明一个半成品)。见文件头「残余空洞」。
   */
  private readonly inFlight = new Set<string>();

  constructor(private readonly deps: { sessions: SessionStore; loop: AgentLoop }) {}

  async execute(sessionId: string, userId: string): Promise<AgentTurnResult> {
    const session = await this.deps.sessions.find(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(ErrorCode.SESSION_NOT_FOUND, '会话不存在,或不属于该用户');
    }

    if (this.inFlight.has(sessionId)) {
      // 用 `VALIDATION_ERROR` 而不是 409:前端把这一族当成"这次没成,刷新一下"
      // 处理即可(见 `vue/AGENTS.md` §7.3),不为它单开一个码。
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        '这个会话正在出图,等它出完(大约 7 秒)再点。',
      );
    }
    this.inFlight.add(sessionId);
    try {
      return await this.run(session);
    } finally {
      // ★ 一定要在 `finally` 里清:循环不抛错,但存储会(`save` 挂了)。
      //   漏清的话那个会话**再也出不了图**,而且报的是"正在出图"——最难查的一种坏法。
      this.inFlight.delete(sessionId);
    }
  }

  private async run(session: Session): Promise<AgentTurnResult> {
    const dangling = danglingToolUses(session.messages);
    const proposal = dangling.find((call) => call.name === TOOL_NAMES.renderLook);

    // ── 欠着的**不是**出图请求 ──
    // 这是"上一轮崩在中间"留下的畸形状态。**不能在它上面再叠一条提议**:
    // 那样模型下一轮会同时看到两个待办,而前一个它自己也不记得是怎么欠下的。
    // 让用户再说一句话就顺掉了(`agent-loop` 的 ⓞ 段会把它按 `declined` 了结)。
    if (!proposal && dangling.length > 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        '这个会话还有一件事没做完,现在出不了图。再跟它说一句话就行。',
      );
    }

    // ── 入口 A:原样;入口 B:代递一条提议(缺东西时在这一步抛)──
    const prepared = proposal ? session : this.prepareProposal(session);

    const result = await this.deps.loop.run(prepared, undefined, { resume: 'approved' });
    // ★ 无论循环怎么结束都要存回(同 `SendMessage`):哪怕这一轮出图失败,
    //   会话里也已经多了一条 `tool_result` 和一句收束语——不存的话那个
    //   "欠着的 tool_use" 会**原样还在**,用户再点一次确认就会重复花钱。
    //
    // ★★ **这是唯一的落库点。** `prepareProposal` 合成的那条提议**只在这一趟里活着**。
    //    ⚠️ 千万别在 `loop.run` 之前顺手补一次 `sessions.save(prepared)`:一旦
    //    那之后出岔子,盘上留下的会话末尾就欠着一条**模型从没提过的 `tool_use`**,
    //    用户刷新页面会看到一个凭空冒出来的确认框,而系统里没有任何东西记得它怎么来的。
    await this.deps.sessions.save(result.session);
    return result;
  }

  /**
   * ★ **入口 B:服务端代递一条出图提议。**
   *
   * 用户点的是界面上**界面自己摆的**那条消息(`renderOffer`),那一下**并没有任何
   * `tool_use` 在等确认**。所以这里补一条,好让整轮从一个确定的状态(欠着一条
   * `render_look`)出发 —— 重放链路只认这个状态,不认"用户点了一下"。
   *
   * ★ **补一条提议,而不是直接调工具**,有两个理由:
   *   ① 走同一条链路 ⇒ 那五件事(额度、引擎、先落盘再记会话、`seq`、事件)不用抄第二份;
   *   ② 历史里因此留下**"提议 → 批准"这一对**,与规则 6 交给模型的世界观一致
   *      (「出图要用户点头」)。少了一半的话,它下一轮会看到"没人调工具却出了图"——
   *      那正是 v5–v11 那一串翻车的同一个病灶(模型手上没有状态,只能猜)。
   */
  private prepareProposal(session: Session): Session {
    // ★ 缺什么由 `renderReadiness` 判(与工具、与视图**同一份判据**),
    //   这里只负责**说给用户听**。⚠️ 别照抄 `render-look.ts` 那两句:那是写给模型看的
    //   (「请先请用户上传…」),直接透给用户会变成"自己请自己"。
    const missing = renderReadiness(session);
    if (missing === 'no_look') {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        '现在还没有妆面可以出图。先说清你要去哪儿,让它把妆面定下来。',
      );
    }
    if (missing === 'no_face') {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        '还缺一张你的正面照片,出不了图。先传一张(正面、光线均匀、不戴墨镜)。',
      );
    }

    // ★ `manual-` 前缀:转写里一眼认得出这条**不是供应商发的 id**(排查时有用),
    //   同时与模型给的 id 不会撞(那些是 `call_xxxx` 之类)。
    const call: ToolUseBlock = {
      type: 'tool_use',
      id: `manual-${randomUUID()}`,
      name: TOOL_NAMES.renderLook,
      input: {},
    };
    // ★ **只带 `tool_use`、不带一个字的正文**:正文是"模型说的话",
    //   服务端替它写一句,就是在历史里伪造一句它没说过的话(同 `AgentView.vue` 不伪造开场白)。
    return appendMessages(session, [assistantMessage([call])]);
  }
}
