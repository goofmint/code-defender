import { describe, expect, it } from 'vitest';
import { pointInRect, rectIntersectsCircle, rectIntersectsThickSegment, rectsOverlap, rectWithin } from './geometry';
import type { Rect } from './geometry';

// 配置判定(#151)の幾何関数。境界値（接触ちょうど・1px 手前・1px 先）で規約を固定する。
const base: Rect = { x: 100, y: 100, width: 36, height: 36 };

describe('rectsOverlap: 矩形どうしの重なり', () => {
  it('辺が接するだけ（右端 = 左端）なら重ならず、1px 食い込むと重なる', () => {
    expect(rectsOverlap(base, { x: 136, y: 100, width: 10, height: 10 })).toBe(false);
    expect(rectsOverlap(base, { x: 135, y: 100, width: 10, height: 10 })).toBe(true);
    expect(rectsOverlap(base, { x: 137, y: 100, width: 10, height: 10 })).toBe(false);
  });

  it('上下でも辺の接触は重ならない', () => {
    expect(rectsOverlap(base, { x: 100, y: 64, width: 36, height: 36 })).toBe(false);
    expect(rectsOverlap(base, { x: 100, y: 65, width: 36, height: 36 })).toBe(true);
    expect(rectsOverlap(base, { x: 100, y: 136, width: 36, height: 36 })).toBe(false);
    expect(rectsOverlap(base, { x: 100, y: 135, width: 36, height: 36 })).toBe(true);
  });

  it('角だけが接する場合も重ならない', () => {
    expect(rectsOverlap(base, { x: 136, y: 136, width: 10, height: 10 })).toBe(false);
    expect(rectsOverlap(base, { x: 135, y: 135, width: 10, height: 10 })).toBe(true);
  });

  it('同じ矩形・包含する矩形は重なる。引数の順序に依らない', () => {
    expect(rectsOverlap(base, base)).toBe(true);
    const outer = { x: 0, y: 0, width: 300, height: 300 };
    expect(rectsOverlap(base, outer)).toBe(true);
    expect(rectsOverlap(outer, base)).toBe(true);
  });
});

describe('rectWithin: 完全包含', () => {
  const outer: Rect = { x: 0, y: 0, width: 960, height: 540 };

  it('辺が一致しても含まれる。1px はみ出すと含まれない', () => {
    expect(rectWithin({ x: 0, y: 0, width: 36, height: 36 }, outer)).toBe(true);
    expect(rectWithin({ x: 924, y: 504, width: 36, height: 36 }, outer)).toBe(true);
    expect(rectWithin({ x: -1, y: 0, width: 36, height: 36 }, outer)).toBe(false);
    expect(rectWithin({ x: 0, y: -1, width: 36, height: 36 }, outer)).toBe(false);
    expect(rectWithin({ x: 925, y: 504, width: 36, height: 36 }, outer)).toBe(false);
    expect(rectWithin({ x: 924, y: 505, width: 36, height: 36 }, outer)).toBe(false);
  });
});

describe('pointInRect: 点の包含', () => {
  it('左端・上端は含み、右端・下端は含まない', () => {
    expect(pointInRect({ x: 100, y: 100 }, base)).toBe(true);
    expect(pointInRect({ x: 99.99, y: 100 }, base)).toBe(false);
    expect(pointInRect({ x: 100, y: 99.99 }, base)).toBe(false);
    expect(pointInRect({ x: 135.99, y: 135.99 }, base)).toBe(true);
    expect(pointInRect({ x: 136, y: 118 }, base)).toBe(false);
    expect(pointInRect({ x: 118, y: 136 }, base)).toBe(false);
  });
});

describe('rectIntersectsCircle: 矩形と円', () => {
  const center = { x: 200, y: 118 };

  it('右辺と円が接するちょうど（距離 = 半径）は重ならず、半径が 0.01 大きいと重なる', () => {
    // base の右端 x=136 から中心まで 64。
    expect(rectIntersectsCircle(base, center, 64)).toBe(false);
    expect(rectIntersectsCircle(base, center, 64.01)).toBe(true);
    expect(rectIntersectsCircle(base, center, 63.99)).toBe(false);
  });

  it('角に最も近い円は角までの距離で判定する', () => {
    // base の右下の角 (136, 136) から (166, 176) までは 50。
    const diagonal = { x: 166, y: 176 };
    expect(rectIntersectsCircle(base, diagonal, 50)).toBe(false);
    expect(rectIntersectsCircle(base, diagonal, 50.01)).toBe(true);
  });

  it('中心が矩形の内側なら半径が 0 より大きければ重なる', () => {
    expect(rectIntersectsCircle(base, { x: 118, y: 118 }, 0.01)).toBe(true);
    expect(rectIntersectsCircle(base, { x: 118, y: 118 }, 0)).toBe(false);
  });
});

describe('rectIntersectsThickSegment: 矩形と太さを持つ線分', () => {
  const clearance = 8;

  it('水平な線分: 線分からの距離がクリアランスちょうどは重ならず、未満なら重なる', () => {
    // 線分 y=210（x 30〜330）。帯は y 202〜218。
    const from = { x: 30, y: 210 };
    const to = { x: 330, y: 210 };
    expect(rectIntersectsThickSegment({ x: 100, y: 166, width: 36, height: 36 }, from, to, clearance)).toBe(false);
    expect(rectIntersectsThickSegment({ x: 100, y: 167, width: 36, height: 36 }, from, to, clearance)).toBe(true);
    expect(rectIntersectsThickSegment({ x: 100, y: 218, width: 36, height: 36 }, from, to, clearance)).toBe(false);
    expect(rectIntersectsThickSegment({ x: 100, y: 217, width: 36, height: 36 }, from, to, clearance)).toBe(true);
  });

  it('水平な線分: 端点の先もクリアランスぶん広がる', () => {
    const from = { x: 30, y: 210 };
    const to = { x: 330, y: 210 };
    expect(rectIntersectsThickSegment({ x: 338, y: 200, width: 36, height: 36 }, from, to, clearance)).toBe(false);
    expect(rectIntersectsThickSegment({ x: 337, y: 200, width: 36, height: 36 }, from, to, clearance)).toBe(true);
    expect(rectIntersectsThickSegment({ x: -14, y: 200, width: 36, height: 36 }, from, to, clearance)).toBe(false);
    expect(rectIntersectsThickSegment({ x: -13, y: 200, width: 36, height: 36 }, from, to, clearance)).toBe(true);
  });

  it('垂直な線分でも同じ。向き（from/to の順）に依らない', () => {
    // 線分 x=330（y 210〜330）。帯は x 322〜338。
    const from = { x: 330, y: 330 };
    const to = { x: 330, y: 210 };
    expect(rectIntersectsThickSegment({ x: 286, y: 250, width: 36, height: 36 }, from, to, clearance)).toBe(false);
    expect(rectIntersectsThickSegment({ x: 287, y: 250, width: 36, height: 36 }, from, to, clearance)).toBe(true);
    expect(rectIntersectsThickSegment({ x: 338, y: 250, width: 36, height: 36 }, from, to, clearance)).toBe(false);
    expect(rectIntersectsThickSegment({ x: 337, y: 250, width: 36, height: 36 }, to, from, clearance)).toBe(true);
  });

  it('長さ 0 の線分はクリアランスの正方形として扱う', () => {
    const point = { x: 100, y: 100 };
    expect(rectIntersectsThickSegment({ x: 108, y: 100, width: 10, height: 10 }, point, point, clearance)).toBe(false);
    expect(rectIntersectsThickSegment({ x: 107, y: 100, width: 10, height: 10 }, point, point, clearance)).toBe(true);
  });

  it('斜めの線分はエラーにする', () => {
    expect(() => rectIntersectsThickSegment(base, { x: 0, y: 0 }, { x: 10, y: 10 }, clearance)).toThrow();
  });
});
