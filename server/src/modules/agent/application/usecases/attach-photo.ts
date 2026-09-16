/**
 * application/usecases/attach-photo.ts —— 把用户上传的**本人照片**挂到会话上。
 *
 * 这是「用户上传的信息暴露给 agent」里**唯一一件真实个人信息**进门的地方,
 * 所以本文件的三条谨慎都是有意的:
 *
 * 1. **不进 `messages[]`**:只把 `ImageRef` 记进 `session.faceRef`,字节落在存储里。
 *    几 MB 的 base64 进了消息历史,会话就没法读、没法落盘、每轮 system 拼接都要带着它。
 *    (`render_look` 需要它时经 `SessionArtifacts.resolveFace` 拿本机路径。)
 * 2. **不告诉模型"照片存在哪"**:模型看不到路径。它只需知道"有没有照片"
 *    ——`render_look` 会自己判断缺不缺。
 * 3. ★ **不做人脸检测 / 不读图**(§7.2:视觉读图那条腿"只预留、不实现")。
 *    这里只校验"它是一张能解码的图片类型的文件",**不判断里面有没有脸**——
 *    判断不了就别说判断了,那是 `describe_face` 的活,而它本次不做。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import { appendMessages, setFaceRef } from '../../domain/entities/session.js';
import type { Session } from '../../domain/entities/session.js';
import { textMessage } from '../../domain/entities/message.js';
// ★ 这句话搬去了 domain:离线演示驱动也要读它(判断该要照片还是该提议出图),理由见那个文件。
import { PHOTO_ATTACHED_NOTE } from '../../domain/tools/observations.js';
import type { PhotoUpload } from '../../domain/ports/session-artifacts.js';
import type { SessionArtifacts } from '../../domain/ports/session-artifacts.js';
import type { SessionStore } from '../../domain/ports/session-store.js';

export class AttachPhoto {
  constructor(
    private readonly deps: { sessions: SessionStore; artifacts: SessionArtifacts },
  ) {}

  async execute(sessionId: string, userId: string, file: PhotoUpload): Promise<Session> {
    const session = await this.deps.sessions.find(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(ErrorCode.SESSION_NOT_FOUND, '会话不存在,或不属于该用户');
    }

    const ref = await this.deps.artifacts.putFace(sessionId, file);

    // ★ 往历史里**记一句话**,但不记照片本身。
    //   不记的话模型不知道自己手上已经有照片了,会一直催用户去传——
    //   而那正是"用户明明传了、它还说没有"这种最让人火大的体验。
    const noted = appendMessages(setFaceRef(session, ref), [
      textMessage('user', PHOTO_ATTACHED_NOTE),
    ]);
    await this.deps.sessions.save(noted);
    return noted;
  }
}
