/**
 * application/narration.ts —— 面向用户文案的纯组装函数。
 * 与引擎解耦:文案模板固定,引擎只需返回结构化妆容元信息(look)。
 * 未来若引擎自带解释文案,可在调用处直接替换,无需改动图像引擎端口。
 */
import type { Look, ResultText } from '../domain/entities/look.js';
import type { SceneAnalysis } from '../domain/entities/scene.js';

/** 场景英文 label → 中文名(缺失时原样回显)。 */
const SCENE_CN: Record<string, string> = {
  beach: '海边',
  snow: '雪景',
  'red-leaf': '红叶',
  city: '都市夜景',
  desert: '沙漠',
  mountain: '山野',
  unknown: '未识别场景',
};

export function buildNarrative(scene: SceneAnalysis, engineName: string, look: Look): ResultText {
  const sceneCn = SCENE_CN[scene.label] ?? scene.label;
  const palette = Array.isArray(look.palette) ? (look.palette as unknown[]) : [];
  const style = typeof look.style === 'string' && look.style ? (look.style as string) : '自然日常';

  const analysis = `场景识别:${sceneCn}。妆容方向:${scene.direction}${
    scene.tags.length > 0 ? `(关键词:${scene.tags.join(' / ')})` : ''
  }。`;

  const explain = `已基于「${sceneCn}」主题为你匹配「${style}」风格妆容,主色板 ${palette.length} 色;由 ${engineName} 引擎生成。`;

  const tips = [
    `场景光线偏「${scene.tags[0] ?? sceneCn}」时,底妆宜薄透,突出${style}氛围感`,
    '如需更自然,可在结果图上降低饱和度对比后再导出',
  ];

  return { analysis, explain, tips };
}
