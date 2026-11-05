import { describe, expect, it } from 'vitest';
import {
  RELEASE_BURST,
  RELEASE_POINT_CELL,
  RELEASE_POINT_DECOR_STYLE,
  RELEASE_POINT_PULSE,
} from './config';
import {
  CELL_SIZE,
  FIELD_COLS,
  FIELD_HEIGHT,
  FIELD_ROWS,
  FIELD_WIDTH,
} from './field';
import { burstParticleOffsets, RELEASE_POINT_CENTER, RELEASE_POINT_STYLE } from './releasePoint';

describe('releasePoint', () => {
  it('フィールド内のセル上にある', () => {
    expect(RELEASE_POINT_CELL.col).toBeGreaterThanOrEqual(0);
    expect(RELEASE_POINT_CELL.col).toBeLessThan(FIELD_COLS);
    expect(RELEASE_POINT_CELL.row).toBeGreaterThanOrEqual(0);
    expect(RELEASE_POINT_CELL.row).toBeLessThan(FIELD_ROWS);
  });

  it('右端の列・縦中央の行のセル中心に置かれる', () => {
    expect(RELEASE_POINT_CELL).toEqual({ col: FIELD_COLS - 1, row: 4 });
    expect(RELEASE_POINT_CENTER).toEqual({ x: 930, y: 270 });
  });

  it('円がフィールドからはみ出さない', () => {
    const { x, y } = RELEASE_POINT_CENTER;
    const { radius } = RELEASE_POINT_STYLE;
    expect(x - radius).toBeGreaterThanOrEqual(0);
    expect(x + radius).toBeLessThanOrEqual(FIELD_WIDTH);
    expect(y - radius).toBeGreaterThanOrEqual(0);
    expect(y + radius).toBeLessThanOrEqual(FIELD_HEIGHT);
    expect(radius * 2).toBeLessThanOrEqual(CELL_SIZE);
  });
});

describe('リリース地点の装飾(#144)', () => {
  it('パルスの外端（線幅を含む）は円より外側で、セル内（中心から CELL_SIZE / 2 以内）に収まる', () => {
    const outer = RELEASE_POINT_PULSE.maxRadius + RELEASE_POINT_PULSE.strokeWidth / 2;
    expect(RELEASE_POINT_PULSE.maxRadius).toBeGreaterThan(RELEASE_POINT_STYLE.radius);
    expect(outer).toBeLessThanOrEqual(CELL_SIZE / 2);
  });

  it('内側のリングとアイコンは円の内側に収まる', () => {
    const { innerRingRadius, ringWidth, iconSize, iconLineWidth } = RELEASE_POINT_DECOR_STYLE;
    expect(innerRingRadius + ringWidth / 2).toBeLessThan(RELEASE_POINT_STYLE.radius);
    // アイコンの最も外側の点は台の両端（中心から iconSize/2 × √2）に線幅の半分を足した位置。
    expect((iconSize / 2) * Math.SQRT2 + iconLineWidth / 2).toBeLessThan(innerRingRadius);
  });

  it('エフェクトの輪は円より大きく広がり、粒の数は正の整数', () => {
    expect(RELEASE_BURST.ringEndRadius).toBeGreaterThan(RELEASE_POINT_STYLE.radius);
    expect(Number.isInteger(RELEASE_BURST.particleCount)).toBe(true);
    expect(RELEASE_BURST.particleCount).toBeGreaterThan(0);
  });
});

describe('burstParticleOffsets(#144)', () => {
  it('count 個を真上から時計回りに等間隔で、中心から distance の位置に並べる', () => {
    const offsets = burstParticleOffsets(4, 10);
    const expected = [
      { x: 0, y: -10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: -10, y: 0 },
    ];
    expect(offsets).toHaveLength(4);
    offsets.forEach((offset, i) => {
      expect(offset.x).toBeCloseTo(expected[i].x);
      expect(offset.y).toBeCloseTo(expected[i].y);
    });
  });

  it('設定の粒の数ぶん返し、すべて中心から同じ距離にある', () => {
    const offsets = burstParticleOffsets(RELEASE_BURST.particleCount, RELEASE_BURST.particleDistance);
    expect(offsets).toHaveLength(RELEASE_BURST.particleCount);
    offsets.forEach((offset) => {
      expect(Math.hypot(offset.x, offset.y)).toBeCloseTo(RELEASE_BURST.particleDistance);
    });
  });

  it('1個なら真上だけ、距離 0 なら全部中心（境界値）', () => {
    const [only] = burstParticleOffsets(1, 5);
    expect(only.x).toBeCloseTo(0);
    expect(only.y).toBeCloseTo(-5);
    burstParticleOffsets(3, 0).forEach((offset) => {
      expect(offset.x).toBeCloseTo(0);
      expect(offset.y).toBeCloseTo(0);
    });
  });

  it('粒の数が正の整数でない・距離が負または数値でないときはエラーにする', () => {
    expect(() => burstParticleOffsets(0, 10)).toThrow();
    expect(() => burstParticleOffsets(-1, 10)).toThrow();
    expect(() => burstParticleOffsets(1.5, 10)).toThrow();
    expect(() => burstParticleOffsets(4, -1)).toThrow();
    expect(() => burstParticleOffsets(4, Number.NaN)).toThrow();
  });
});
