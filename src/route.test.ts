import { describe, expect, it } from 'vitest';
import {
  ENGINEER_SPAWN_CELLS,
  ENGINEER_SPAWN_COL,
  FIELD_COLS,
  FIELD_ROWS,
  MAX_ENGINEER_ROUTES,
  RELEASE_POINT_CELL,
  ROUTE_TURN_COL,
} from './config';
import { CELL_SIZE } from './field';
import type { GridCell, Route } from './route';
import {
  addRoute,
  cellCenter,
  createRoute,
  createRoutes,
  nextSpawnCell,
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

const spawnAt = (row: number): GridCell => ({ col: ENGINEER_SPAWN_COL, row });
const routesAtRows = (rows: readonly number[]): Route[] =>
  createRoutes(rows.map(spawnAt));
const allRows = Array.from({ length: FIELD_ROWS }, (_, row) => row);
const spawnKey = ({ col, row }: GridCell): string => `${col},${row}`;

describe('nextSpawnCell', () => {
  it('使用中がなければ追加列の先頭行を返す', () => {
    expect(nextSpawnCell([])).toEqual(spawnAt(0));
  });

  it('初期の出現セルがあっても最初の空き行を返す', () => {
    expect(nextSpawnCell(ENGINEER_SPAWN_CELLS)).toEqual(spawnAt(0));
  });

  it('最後の1行だけ空いていればその行を返す', () => {
    const used = allRows.slice(0, FIELD_ROWS - 1).map(spawnAt);
    expect(nextSpawnCell(used)).toEqual(spawnAt(FIELD_ROWS - 1));
  });

  it('全行が使用中なら undefined を返す', () => {
    expect(nextSpawnCell(allRows.map(spawnAt))).toBeUndefined();
  });

  it('リリース地点のセルは返さない', () => {
    const used: GridCell[] = [];
    for (let i = 0; i < FIELD_ROWS; i++) {
      const cell = nextSpawnCell(used);
      if (cell === undefined) break;
      expect(cell).not.toEqual(RELEASE_POINT_CELL);
      used.push(cell);
    }
  });
});

describe('addRoute', () => {
  it('空の一覧に追加すると id 0・先頭行のルートを返す', () => {
    const route = addRoute([]);
    expect(route?.id).toBe(0);
    expect(route?.spawn).toEqual(spawnAt(0));
  });

  it('上限-1本のときは追加できる', () => {
    const rows = allRows.slice(0, MAX_ENGINEER_ROUTES - 1);
    expect(addRoute(routesAtRows(rows))).toBeDefined();
  });

  it('上限ちょうどのときは undefined を返す', () => {
    const rows = allRows.slice(0, MAX_ENGINEER_ROUTES);
    expect(addRoute(routesAtRows(rows))).toBeUndefined();
  });

  it('上限を超えた入力でも undefined を返す', () => {
    const over = Array.from({ length: MAX_ENGINEER_ROUTES + 1 }, (_, i) =>
      createRoute(i, spawnAt(i % FIELD_ROWS), RELEASE_POINT_CELL),
    );
    expect(addRoute(over)).toBeUndefined();
  });

  it('初期3本から繰り返し追加すると上限で止まり、出現場所が重ならない', () => {
    const routes = createRoutes(ENGINEER_SPAWN_CELLS);
    for (;;) {
      const route = addRoute(routes);
      if (route === undefined) break;
      routes.push(route);
    }
    expect(routes).toHaveLength(MAX_ENGINEER_ROUTES);
    const keys = routes.map((r) => spawnKey(r.spawn));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(spawnKey(RELEASE_POINT_CELL));
    expect(new Set(routes.map((r) => r.id)).size).toBe(routes.length);
  });

  it('初期3本へ追加すると id は 3 になる', () => {
    expect(addRoute(createRoutes(ENGINEER_SPAWN_CELLS))?.id).toBe(
      ENGINEER_SPAWN_CELLS.length,
    );
  });

  it('欠番があっても既存の最大 id + 1 になる', () => {
    const routes = createRoutes(ENGINEER_SPAWN_CELLS).filter((r) => r.id !== 1);
    expect(routes.map((r) => r.id)).toEqual([0, 2]);
    expect(addRoute(routes)?.id).toBe(3);
  });

  it('入力の一覧を変更しない', () => {
    const routes = createRoutes(ENGINEER_SPAWN_CELLS);
    const snapshot = structuredClone(routes);
    addRoute(routes);
    expect(routes).toHaveLength(snapshot.length);
    expect(routes).toEqual(snapshot);
  });

  it('返るルートは出現セルから始まりリリース地点で終わる', () => {
    const route = addRoute(createRoutes(ENGINEER_SPAWN_CELLS));
    expect(route).toBeDefined();
    if (route === undefined) return;
    expect(route.waypoints[0]).toEqual(route.spawn);
    expect(route.waypoints[route.waypoints.length - 1]).toEqual(
      RELEASE_POINT_CELL,
    );
  });

  it('返るルートの線分は水平または垂直で、全点がフィールド内にある', () => {
    const route = addRoute(createRoutes(ENGINEER_SPAWN_CELLS));
    expect(route).toBeDefined();
    if (route === undefined) return;
    route.waypoints.forEach(({ col, row }, i) => {
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThan(FIELD_COLS);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(FIELD_ROWS);
      if (i === 0) return;
      const prev = route.waypoints[i - 1];
      expect(prev.col === col || prev.row === row).toBe(true);
    });
  });
});
