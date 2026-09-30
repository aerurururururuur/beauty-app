/**
 * domain/ports/face-reader.ts —— ★ 读脸端口。`user` 不 import `makeup`,也不知道底下是谁;
 * 只知道:给一张照片的 dataURL,回一个**后端档 id**。接线在组装根 `src/index.ts`。
 *
 * 三个刻意的形状:
 * 1. **收 dataURL**:前端手上从来只有它("dataURL → 文件"是实现细节,在组装根之下发生)。
 * 2. **回后端档 id(字符串),不是 `SkinTone`**:用 `makeup` 的类型就等于 import 它。
 *    ★ 它(`olive`)与行里存的那套(`yellow-2`)**是两套词**,翻成展示档由前端反查表做,不在这里翻。
 * 3. **失败走结果联合,不走异常**:「读不出肤色」是**正常业务结局**(模型有 `unknown` 这条出口)。
 *    ⚠️ 实现**只**把「答了 unknown / 答了不在档位里的词」翻成 `unreadable`,
 *    **其他一切异常(网络、鉴权、5xx)原样抛出** —— 把 500 说成"读不出来"就是本仓头号 bug 的形状。
 *
 * ★ 它**不落任何库**:读脸只产出一条**建议**,落档由用户确认后调 `POST /personas`(§8-1)。
 */
export type FaceReadOutcome =
  /** 读出来了。`skinTone` 是**后端**档 id(`olive` …,与 `SKIN_TONES` 同一套)。 */
  | { ok: true; skinTone: string }
  /** 读不出来(模型答了 `unknown` 或档位外的词)。★ 不给原因字符串:说给用户听的那句由**用例**写。 */
  | { ok: false; reason: 'unreadable' };

export interface FaceReader {
  /** ★ 这一次**会花钱**(一次多模态调用)。只由用户点击触发,不是工具、模型碰不到。 */
  analyzeFace(photo: string): Promise<FaceReadOutcome>;
}
