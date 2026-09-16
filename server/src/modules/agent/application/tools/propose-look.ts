/**
 * application/tools/propose-look.ts —— `propose_look` 的实现(免费、无 IO)。
 *
 * ★ 它是 §4 那条核心约束的**执行点**:模型给的是**结构化字段**,
 * 之后由 `describeLook` 渲染成人话——**模型从头到尾没有经手过一句提示词**。
 * §10 `[I1]`「LLM 产出的任何字段都不直接进入 prompt 文本」在这里被兑现:
 * 本工具连 prompt 都看不见。
 *
 * ★ 校验用 `validateLookSpec`,**带上会话里已知的 `skinTone`**——
 * 这就是 §6 规矩 4「合法取值空间按肤色收窄,而不是生成完再检查」的落点。
 * 肤色还没问出来时(`skinTone === undefined`)不收窄:那是"还不知道",
 * 该让对话继续问,而不是把一份合法妆面打回。
 */
import { AppError } from '../../../shared/index.js';
import { describeLook, validateLookSpec } from '../../../makeup/index.js';
import type { LookSpec } from '../../../makeup/index.js';
import { PROPOSE_LOOK } from '../../domain/tools/definitions.js';
import type { Tool, ToolContext, ToolOutcome } from '../../domain/tools/tool.js';
import { setLookSpec } from '../../domain/entities/session.js';

export class ProposeLookTool implements Tool {
  readonly definition = PROPOSE_LOOK;

  async run(input: unknown, context: ToolContext): Promise<ToolOutcome> {
    let spec: LookSpec;
    try {
      spec = validateLookSpec(input, { skinTone: context.session.brief.skinTone });
    } catch (err) {
      // 校验失败的 message 已经写成"带合法取值清单"的形状(见 look-spec.validator.ts),
      // 可以**原样**回填给模型——这就是把错误消息当 prompt 写的好处,这里不需要再加工。
      const message = err instanceof AppError ? err.message : '妆面单不合法,但原因未知';
      // ★★ **开头那句"这次没有记下任何妆面"是 2026-09-16 补的,别删。**
      //   实测(真实模型):报错之后模型**没有重试**,而是直接在正文里把一套
      //   (它自己以为改好了的)妆面讲给用户听,用户当然以为妆面已经定了——
      //   而会话里 `lookSpec` 一直是空的。后面用户说"出图吧",`render_look`
      //   只能回一句"还没有妆面可以出图",整条链路在那个点上塌掉。
      //   ⇒ 与 `render_look` 的失败分支同一个道理(见 `NO_CONFIRMATION_NOTICE`):
      //     **失败必须把"什么都没发生"这个事实说在最前面**,不能只说哪里不对。
      return {
        content:
          '★ 这次**没有记下任何妆面**——你刚才那套不存在于会话里,用户在界面上也看不到它。' +
          `${message}。请修正后**再调用一次本工具**;` +
          '在它返回成功之前,不要用正文把一套妆面讲成已经定下来的。',
        isError: true,
      };
    }

    const session = setLookSpec(context.session, spec);
    return {
      content: [
        '已记下这套妆面:',
        describeLook(spec),
        '',
        '请把这段描述**讲给用户听**(用你自己的话,但内容要与之一致),并问她要不要调整。',
        '注意:这段描述就是用户在出图前唯一能看到的东西,不要添加它没说的效果承诺。',
      ].join('\n'),
      session,
    };
  }
}
