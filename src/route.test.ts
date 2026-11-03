import { describe, expect, it } from 'vitest';
import {
  ENGINEER_SPAWN_CELLS,
  FIELD_COLS,
  FIELD_ROWS,
  RELEASE_POINT_CELL,
  ROUTE_TURN_COL,
} from './config';
import { CELL_SIZE } from './field';
import {
  cellCenter,
  createRoute,
  createRoutes,
  routePixelPoints,
  SPAWN_MARKER_STYLE,
} from './route';

describe('route', () => {
  const routes = createRoutes(ENGINEER_SPAWN_CELLS);

  it('ルートの数は出現セルの数と同じで、id は出現セルのインデックスと対応する', () => {
    expect(routes).toHaveLength(ENGINEER_SPAWN_CELLS.length);
    routes.forEach((route, i) => {
      expect(route.id).toBe(i);
      expect(route.spawn).toEqual(ENGINEER_SPAWN_CELLS[i]);
    });
  });

  it('先頭は出現セル、末尾はリリース地点のセル', () => {
    for (const route of routes) {
      expect(route.waypoints[0]).toEqual(route.spawn);
      expect(route.waypoints[route.waypoints.length - 1]).toEqual(
        RELEASE_POINT_CELL,
      );
    }
  });

  it('すべての折れ点がグリッド範囲内にある', () => {
    for (const { col, row } of routes.flatMap((r) => r.waypoints)) {
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThan(FIELD_COLS);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(FIELD_ROWS);
    }
  });

  it('連続する折れ点は水平または垂直で、同じセルが続かない', () => {
    for (const { waypoints } of routes) {
      for (let i = 1; i < waypoints.length; i++) {
        const a = waypoints[i - 1];
        const b = waypoints[i];
        const sameCol = a.col === b.col;
        const sameRow = a.row === b.row;
        expect(sameCol || sameRow).toBe(true);
        expect(sameCol && sameRow).toBe(false);
      }
    }
  });

  it('同じ入力から同じルートを返す', () => {
    expect(createRoutes(ENGINEER_SPAWN_CELLS)).toEqual(routes);
  });

  it('出現セル同士、および出現セルとリリース地点は重ならない', () => {
    const keys = ENGINEER_SPAWN_CELLS.map((c) => `${c.col},${c.row}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(
      `${RELEASE_POINT_CELL.col},${RELEASE_POINT_CELL.row}`,
    );
  });

  it('仮の値での生成結果', () => {
    const t = ROUTE_TURN_COL;
    expect(routes.map((r) => r.waypoints)).toEqual([
      [
        { col: 0, row: 1 },
        { col: t, row: 1 },
        { col: t, row: 4 },
        { col: 15, row: 4 },
      ],
      [
        { col: 0, row: 4 },
        { col: 15, row: 4 },
      ],
      [
        { col: 0, row: 7 },
        { col: t, row: 7 },
        { col: t, row: 4 },
        { col: 15, row: 4 },
      ],
    ]);
  });

  it('createRoute は単体で再利用できる', () => {
    const route = createRoute(10, { col: 0, row: 0 }, RELEASE_POINT_CELL);
    expect(route.id).toBe(10);
    expect(route.waypoints[0]).toEqual({ col: 0, row: 0 });
  });

  it('セル中心とルートのピクセル座標', () => {
    expect(cellCenter(RELEASE_POINT_CELL)).toEqual({ x: 930, y: 270 });
    expect(routePixelPoints(routes[1])).toEqual([
      { x: 30, y: 270 },
      { x: 930, y: 270 },
    ]);
  });

  it('出現マーカーはセルに収まる', () => {
    expect(SPAWN_MARKER_STYLE.radius * 2).toBeLessThanOrEqual(CELL_SIZE);
  });
});
