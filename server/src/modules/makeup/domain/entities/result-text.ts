/**
 * makeup/domain/entities/result-text.ts —— 面向用户的文案结果。
 * 由 narration(按 occasion × 肤质肤色穿搭天气)组装;作为 JobResult 的文案部分。
 */
export interface ResultText {
  analysis: string;
  explain: string;
  tips: string[];
}
