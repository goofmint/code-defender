import { describe, expect, it } from 'vitest';
import { CODE_SIZE, CODE_STAR_INNER_RATIO, CODE_STAR_SPIKES, CODE_STYLES, starPoints } from './code';
import type { CodeKind } from './code';
import { CODE_DECOR_ALPHA, CODE_DECOR_COLORS, CODE_NORMAL_COLORS } from './config';
import { CELL_SIZE } from './field';
import { PLAYER_SIZE } from './player';

const kinds: CodeKind[] = ['normal', 'malicious'];

describe('コードの見た目', () => {
  it('正常・不正の両方にスタイルがある', () => {
    for (const kind of kinds) {
      expect(CODE_STYLES[kind]).toBeDefined();
    }
  });

  it('塗り色と形の識別子が両種類で異なる', () => {
    expect(CODE_STYLES.normal.fillColor).not.toBe(CODE_STYLES.malicious.fillColor);
    expect(CODE_STYLES.normal.shape).not.toBe(CODE_STYLES.malicious.shape);
  });

  it('サイズは 0 より大きく、セルと主人公より小さい', () => {
    expect(CODE_SIZE).toBeGreaterThan(0);
    expect(CODE_SIZE).toBeLessThan(CELL_SIZE);
    expect(CODE_SIZE).toBeLessThan(PLAYER_SIZE);
  });

  it('星形の頂点数はトゲ数の 2 倍である', () => {
    expect(starPoints(CODE_SIZE, CODE_STAR_SPIKES, CODE_STAR_INNER_RATIO)).toHaveLength(
      CODE_STAR_SPIKES * 2,
    );
  });

  it('星形の頂点は外径・内径の距離を交互に取る', () => {
    const points = starPoints(CODE_SIZE, CODE_STAR_SPIKES, CODE_STAR_INNER_RATIO);
    const outer = CODE_SIZE / 2;
    points.forEach((p, i) => {
      const expected = i % 2 === 0 ? outer : outer * CODE_STAR_INNER_RATIO;
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(expected);
    });
  });
});

describe('コードの装飾の色(#144)', () => {
  it('正常コードのシンタックス色の先頭は模様の水色と同じで、どれも不正コードの赤と異なる', () => {
    expect(CODE_DECOR_COLORS.normalSyntax[0]).toBe(CODE_NORMAL_COLORS.pattern);
    for (const color of [...CODE_DECOR_COLORS.normalSyntax, CODE_DECOR_COLORS.normalHeader, CODE_DECOR_COLORS.normalFold]) {
      expect(color).not.toBe(CODE_STYLES.malicious.fillColor);
    }
  });

  it('影・ハイライト・不正コードの光の不透明度は 0 より大きく 1 以下', () => {
    for (const alpha of Object.values(CODE_DECOR_ALPHA)) {
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });
});
