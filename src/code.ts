// コード（正常/不正）の見た目の定義。Phaser には依存しない（テスト可能にするため）。
import {
  CELL_SIZE,
  CODE_CORNER_RADIUS_RATIO,
  CODE_MALICIOUS_COLORS,
  CODE_NORMAL_COLORS,
  CODE_SIZE_RATIO,
  CODE_STAR_INNER_RATIO,
  CODE_STAR_SPIKES,
  CODE_STROKE_WIDTH,
} from './config';
import type { Point } from './route';

export type CodeKind = 'normal' | 'malicious';
export type CodeShape = 'roundedRect' | 'star';
export type CodePattern = 'lines' | 'exclamation';

export type CodeStyle = {
  readonly fillColor: number;
  readonly strokeColor: number;
  readonly patternColor: number;
  readonly shape: CodeShape;
  readonly pattern: CodePattern;
};

export { CODE_CORNER_RADIUS_RATIO, CODE_STAR_INNER_RATIO, CODE_STAR_SPIKES, CODE_STROKE_WIDTH };

export const CODE_SIZE = CELL_SIZE * CODE_SIZE_RATIO;

export const CODE_STYLES = {
  normal: {
    fillColor: CODE_NORMAL_COLORS.fill,
    strokeColor: CODE_NORMAL_COLORS.stroke,
    patternColor: CODE_NORMAL_COLORS.pattern,
    shape: 'roundedRect',
    pattern: 'lines',
  },
  malicious: {
    fillColor: CODE_MALICIOUS_COLORS.fill,
    strokeColor: CODE_MALICIOUS_COLORS.stroke,
    patternColor: CODE_MALICIOUS_COLORS.pattern,
    shape: 'star',
    pattern: 'exclamation',
  },
} as const satisfies Record<CodeKind, CodeStyle>;

// 中心(0,0)の星形の頂点。真上から時計回りに外径・内径を交互に取る（頂点数 = spikes × 2）。
export const starPoints = (size: number, spikes: number, innerRatio: number): Point[] => {
  const outer = size / 2;
  const inner = outer * innerRatio;
  return Array.from({ length: spikes * 2 }, (_, i) => {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / spikes;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
};
