/**
 * domain/entities/reference.ts —— 参考图条目(值对象)。
 * 由 reference-provider 产出;license 必填,标注可授权来源。
 */
export interface ReferenceImage {
  id: string;
  title: string;
  /** 授权来源说明(必填)。 */
  license: string;
  /** 来源页 URL。 */
  sourceUrl: string;
}
