// ルートの進行方向の矢印（シェブロン）の位置と向き(#144)。描画は Phaser に依存するため、純粋な計算だけを確かめる。
import { describe, expect, it } from 'vitest';
import {
  ROUTE_LINE_STYLE,
  SPAWN_MARKER_DECOR_STYLE,
  FIELD_FLOOR_STYLE,
} from './config';
import { CELL_SIZE } from './field';
import { createRoutes, routeChevrons, routePixelPoints, SPAWN_MARKER_STYLE } from './route';
import type { Point } from './route';
import { FIXTURE_SPAWN_CELLS } from './testFixtures';

// 点 p が線分 a-b 上（端点を含む）にあるか。
const isOnSegment = (p: Point, a: Point, b: Point): boolean => {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  const lengthSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return Math.abs(cross) < 1e-9 && dot >= 0 && dot <= lengthSq;
};

describe('routeChevrons', () => {
  it('水平区間に、始点から間隔の半分の位置から等間隔に並び、右向き（angle=0）になる', () => {
    const chevrons = routeChevrons(
      [
        { x: 30, y: 90 },
        { x: 210, y: 90 },
      ],
      60,
    );
    expect(chevrons.map((c) => c.x)).toEqual([60, 120, 180]);
    chevrons.forEach((c) => {
      expect(c.y).toBe(90);
      expect(c.angle).toBe(0);
    });
  });

  it('各区間の矢印は次のウェイポイントの方向を向く（下・上・左）', () => {
    const down = routeChevrons([{ x: 0, y: 0 }, { x: 0, y: 60 }], 60);
    const up = routeChevrons([{ x: 0, y: 60 }, { x: 0, y: 0 }], 60);
    const left = routeChevrons([{ x: 60, y: 0 }, { x: 0, y: 0 }], 60);
    expect(down).toEqual([{ x: 0, y: 30, angle: Math.PI / 2 }]);
    expect(up).toEqual([{ x: 0, y: 30, angle: -Math.PI / 2 }]);
    expect(left).toEqual([{ x: 30, y: 0, angle: Math.PI }]);
  });

  it('区間の長さが間隔の半分未満なら置かず、ちょうど半分なら終点に1個置く（境界値）', () => {
    expect(routeChevrons([{ x: 0, y: 0 }, { x: 29, y: 0 }], 60)).toEqual([]);
    expect(routeChevrons([{ x: 0, y: 0 }, { x: 30, y: 0 }], 60)).toEqual([{ x: 30, y: 0, angle: 0 }]);
  });

  it('長さ 0 の区間（重なった点）・点1つ・点なしでは置かない', () => {
    expect(routeChevrons([{ x: 10, y: 10 }, { x: 10, y: 10 }], 60)).toEqual([]);
    expect(routeChevrons([{ x: 10, y: 10 }], 60)).toEqual([]);
    expect(routeChevrons([], 60)).toEqual([]);
  });

  it('間隔が正でなければエラーにする', () => {
    const points = [{ x: 0, y: 0 }, { x: 60, y: 0 }];
    expect(() => routeChevrons(points, 0)).toThrow();
    expect(() => routeChevrons(points, -1)).toThrow();
    expect(() => routeChevrons(points, Number.NaN)).toThrow();
  });

  it('入力の点列を変更しない', () => {
    const points = [{ x: 0, y: 0 }, { x: 120, y: 0 }];
    const copy = points.map((p) => ({ ...p }));
    routeChevrons(points, 60);
    expect(points).toEqual(copy);
  });

  it('実際の初期3本のルートで、すべての矢印がいずれかの区間上にあり、その区間の終点を向く', () => {
    const routes = createRoutes(FIXTURE_SPAWN_CELLS, () => 0.5);
    routes.forEach((route) => {
      const points = routePixelPoints(route);
      const chevrons = routeChevrons(points, ROUTE_LINE_STYLE.chevronSpacing);
      // 各区間はセル中心どうしを結ぶので、長さ（セル数）と同じ数の矢印が並ぶ。
      const expectedCount = points
        .slice(1)
        .reduce((sum, end, i) => sum + Math.hypot(end.x - points[i].x, end.y - points[i].y) / CELL_SIZE, 0);
      expect(chevrons).toHaveLength(expectedCount);
      chevrons.forEach((chevron) => {
        const segment = points
          .slice(1)
          .map((end, i) => ({ start: points[i], end }))
          .find(({ start, end }) => isOnSegment(chevron, start, end));
        expect(segment).toBeDefined();
        if (segment === undefined) return;
        const toNext = Math.atan2(segment.end.y - segment.start.y, segment.end.x - segment.start.x);
        expect(chevron.angle).toBeCloseTo(toNext);
      });
    });
  });
});

describe('床・ルート・出現場所の見た目の値(#144)', () => {
  it('ルートの下地線は本線より太く、矢印の間隔は正', () => {
    expect(ROUTE_LINE_STYLE.underlayWidth).toBeGreaterThan(ROUTE_LINE_STYLE.mainWidth);
    expect(ROUTE_LINE_STYLE.chevronSpacing).toBeGreaterThan(0);
    expect(ROUTE_LINE_STYLE.chevronSize).toBeLessThan(ROUTE_LINE_STYLE.chevronSpacing);
  });

  it('不透明度はすべて 0 より大きく 1 以下', () => {
    const alphas = [
      ROUTE_LINE_STYLE.underlayAlpha,
      ROUTE_LINE_STYLE.mainAlpha,
      ROUTE_LINE_STYLE.chevronAlpha,
      FIELD_FLOOR_STYLE.gridAlpha,
      FIELD_FLOOR_STYLE.frameAlpha,
      FIELD_FLOOR_STYLE.vignetteMaxAlpha,
      SPAWN_MARKER_DECOR_STYLE.ringAlpha,
    ];
    alphas.forEach((alpha) => {
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThanOrEqual(1);
    });
  });

  it('出現場所の外側リング（線幅を含む）と内側の ▶ はセル・出現場所の円に収まる', () => {
    const { ringGap, ringWidth, iconSize } = SPAWN_MARKER_DECOR_STYLE;
    expect(SPAWN_MARKER_STYLE.radius + ringGap + ringWidth / 2).toBeLessThan(CELL_SIZE / 2);
    // ▶ の頂点は中心から最大 iconSize*2/3。
    expect((iconSize * 2) / 3).toBeLessThan(SPAWN_MARKER_STYLE.radius);
  });
});
