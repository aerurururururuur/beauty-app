/**
 * application/usecases/analyze-persona-face.ts —— ★ **读脸(这一条会花钱)。**
 * 用户点了才跑,模型碰不到它 —— **那次点击本身就是人工动作**,不需要 `render_look` 那套确认闸门。
 *
 * ★ **四步顺序别重排**:① 账号必须存在(不判就是一条**匿名付费入口**,任何知道 URL 的人都能烧钱;
 * 查的是账号不是人设,因为建档流程就是先读脸再落档)→ ② 校验照片(★必须**在花钱之前**:
 * 10 MB 的图在这里拒是零成本,放到端口后拒钱已经花了)→ ③ 花钱 → ④ 原样转手。
 *
 * ★ 端口只把「答了 unknown / 档位外的词」翻成 `unreadable`,别的异常(网络、鉴权、5xx)原样抛出去 ——
 * 于是这里的 422 只可能是"这张照片读不出来"。
 * ⚠️ **别在这里 catch 掉一切再回一句"读不出来"** —— 那正是"一个会瞎编的假后端"那条。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { FaceReader } from '../../domain/ports/face-reader.js';
import type { UserRepository } from '../../domain/ports/user-repository.js';
import type { PersonaFaceSuggestion } from '../../domain/schemas/index.js';
import { validateAnalyzeInput } from '../../domain/validators/persona.validator.js';

/** 读不出来时给用户看的那句话(UI 文案,所以归本模块写;端口只给一个 `reason`)。 */
const UNREADABLE_NOTICE = '这张照片没能读出肤色。换一张光线均匀的正面照再试试';

export class AnalyzePersonaFace {
  constructor(
    private readonly deps: {
      /** ★ 本模块的账号仓库:读脸是付费动作,先确认这确实是本服务的注册用户。 */
      users: UserRepository;
      faceReader: FaceReader;
    },
  ) {}

  async execute(raw: unknown): Promise<PersonaFaceSuggestion> {
    const input = validateAnalyzeInput(raw);

    if (!(await this.deps.users.findById(input.userId))) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, '桃妆账号不存在');
    }

    const read = await this.deps.faceReader.analyzeFace(input.photo);
    if (!read.ok) {
      // ★ 422:是这一次**请求里的那张照片**读不出来,不是服务的问题。
      //   message 前端原样上屏,所以它就是上面那句人话。
      throw new AppError(ErrorCode.VALIDATION_ERROR, UNREADABLE_NOTICE);
    }

    return { skinTone: read.skinTone };
  }
}
