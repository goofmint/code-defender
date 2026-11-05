import { describe, expect, it } from 'vitest';
import {
  ENGINEER_SPAWN_CELLS,
  ENGINEER_SPAWN_COL,
  FIELD_COLS,
  FIELD_ROWS,
  MAX_ENGINEER_ROUTES,
  MAX_ENGINEERS,
  PLAYER_START_COL,
  PLAYER_START_ROW,
  RELEASE_POINT_CELL,
  ROUTE_TURN_COL_MAX,
  ROUTE_TURN_COL_MIN,
  ROUTE_TURN_COUNT_MAX,
  ROUTE_TURN_COUNT_MIN,
} from './config';
import { CELL_SIZE } from './field';
import type { GridCell, Route } from './route';
import {
  addRoute,
  addRouteAt,
  cellCenter,
  createRoute,
  createRoutes,
  nextSpawnCell,
  pointToRouteCell,
  removeRoute,
  routePixelPoints,
  SPAWN_MARKER_STYLE,
} from './route';

// シード付き擬似乱数（mulberry32）。0 以上 1 未満を返す。
const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const alwaysMin = (): number => 0;
const alwaysMax = (): number => 0.999999;
const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
const allRows = Array.from({ length: FIELD_ROWS }, (_, row) => row);

const spawnAt = (row: number): GridCell => ({ col: ENGINEER_SPAWN_COL, row });
const spawnKey = ({ col, row }: GridCell): string => `${col},${row}`;
const routeAt = (row: number, random: () => number): Route =>
  createRoute(0, spawnAt(row), RELEASE_POINT_CELL, random);
const routesAtRows = (rows: readonly number[], random: () => number): Route[] =>
  createRoutes(rows.map(spawnAt), random);

// 区間上のすべてのセルに展開する。
const expandCells = (waypoints: readonly GridCell[]): GridCell[] =>
  waypoints.flatMap((b, i) => {
    if (i === 0) return [b];
    const a = waypoints[i - 1];
    const steps = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
    return Array.from({ length: steps }, (_, n) => ({
      col: a.col + Math.sign(b.col - a.col) * (n + 1),
      row: a.row + Math.sign(b.row - a.row) * (n + 1),
    }));
  });

// 縦区間の列（曲がり列）。
const turnColumns = (route: Route): number[] =>
  route.waypoints.flatMap((b, i) =>
    i > 0 && route.waypoints[i - 1].col === b.col ? [b.col] : [],
  );

const expectValidRoute = (route: Route): void => {
  const { waypoints } = route;
  expect(waypoints[0]).toEqual(route.spawn);
  expect(waypoints[waypoints.length - 1]).toEqual(RELEASE_POINT_CELL);
  waypoints.forEach(({ col, row }, i) => {
    expect(col).toBeGreaterThanOrEqual(0);
    expect(col).toBeLessThan(FIELD_COLS);
    expect(row).toBeGreaterThanOrEqual(0);
    expect(row).toBeLessThan(FIELD_ROWS);
    if (i === 0) return;
    const prev = waypoints[i - 1];
    expect(prev.col === col || prev.row === row).toBe(true);
    expect(prev.col === col && prev.row === row).toBe(false);
    expect(col).toBeGreaterThanOrEqual(prev.col);
  });
  const cols = turnColumns(route);
  expect(cols.length).toBeGreaterThanOrEqual(ROUTE_TURN_COUNT_MIN);
  expect(cols.length).toBeLessThanOrEqual(ROUTE_TURN_COUNT_MAX);
  for (const col of cols) {
    expect(col).toBeGreaterThanOrEqual(ROUTE_TURN_COL_MIN);
    expect(col).toBeLessThanOrEqual(ROUTE_TURN_COL_MAX);
  }
  expect(new Set(cols).size).toBe(cols.length);
  expect(
    expandCells(waypoints).some(
      (c) => c.col === PLAYER_START_COL && c.row === PLAYER_START_ROW,
    ),
  ).toBe(false);
};

describe('createRoute', () => {
  it('多数のシード × 全出現行で、接続・範囲・単調・主人公セル回避を満たす', () => {
    for (const seed of seeds) {
      const random = seededRandom(seed);
      for (const row of allRows) expectValidRoute(routeAt(row, random));
    }
  });

  it('乱数が最小（常に 0）でも範囲内で、曲がり列は最左・個数は最小', () => {
    for (const row of allRows) {
      const route = routeAt(row, alwaysMin);
      expectValidRoute(route);
      expect(turnColumns(route)).toHaveLength(ROUTE_TURN_COUNT_MIN);
      expect(turnColumns(route)[0]).toBe(ROUTE_TURN_COL_MIN);
    }
  });

  it('乱数が最大（常に 0.999999）でも範囲内で、曲がり列は最右・個数は最大', () => {
    for (const row of allRows) {
      const route = routeAt(row, alwaysMax);
      expectValidRoute(route);
      const cols = turnColumns(route);
      expect(cols).toHaveLength(ROUTE_TURN_COUNT_MAX);
      expect(cols[cols.length - 1]).toBe(ROUTE_TURN_COL_MAX);
    }
  });

  it('曲がる回数は最小・最大の両方が実際に出る', () => {
    const counts = new Set<number>();
    for (const seed of seeds) {
      counts.add(turnColumns(routeAt(0, seededRandom(seed))).length);
    }
    expect(counts.has(ROUTE_TURN_COUNT_MIN)).toBe(true);
    expect(counts.has(ROUTE_TURN_COUNT_MAX)).toBe(true);
  });

  it.each([
    ['上端の行0', 0],
    ['下端の行8', FIELD_ROWS - 1],
    ['リリース行・主人公行と同じ行4', PLAYER_START_ROW],
  ])('出現行が%sでも直線にならず主人公セルを通らない', (_name, row) => {
    for (const random of [alwaysMin, alwaysMax, ...seeds.map(seededRandom)]) {
      const route = routeAt(row, random);
      expectValidRoute(route);
      expect(route.waypoints.length).toBeGreaterThan(2);
    }
  });

  it('固定乱数列（常に 0）の期待点列', () => {
    expect(routeAt(1, alwaysMin).waypoints).toEqual([
      { col: 0, row: 1 },
      { col: 1, row: 1 },
      { col: 1, row: 0 },
      { col: 9, row: 0 },
      { col: 9, row: 4 },
      { col: 15, row: 4 },
    ]);
    expect(routeAt(4, alwaysMin).waypoints).toEqual([
      { col: 0, row: 4 },
      { col: 1, row: 4 },
      { col: 1, row: 0 },
      { col: 9, row: 0 },
      { col: 9, row: 4 },
      { col: 15, row: 4 },
    ]);
  });

  it('固定乱数列（常に 0.999999）の期待点列', () => {
    expect(routeAt(1, alwaysMax).waypoints).toEqual([
      { col: 0, row: 1 },
      { col: 11, row: 1 },
      { col: 11, row: 8 },
      { col: 12, row: 8 },
      { col: 12, row: 7 },
      { col: 13, row: 7 },
      { col: 13, row: 8 },
      { col: 14, row: 8 },
      { col: 14, row: 4 },
      { col: 15, row: 4 },
    ]);
  });

  it('同じ乱数列なら同じルート、異なる乱数列なら異なるルート', () => {
    expect(routeAt(1, seededRandom(7))).toEqual(routeAt(1, seededRandom(7)));
    expect(routeAt(1, seededRandom(7))).not.toEqual(
      routeAt(1, seededRandom(8)),
    );
  });

  it('id と出現セルを引き継ぐ', () => {
    const route = createRoute(10, spawnAt(0), RELEASE_POINT_CELL, alwaysMin);
    expect(route.id).toBe(10);
    expect(route.spawn).toEqual(spawnAt(0));
  });
});

describe('createRoutes', () => {
  const routes = createRoutes(ENGINEER_SPAWN_CELLS, seededRandom(3));

  it('ルートの数は出現セルの数と同じで、id は出現セルのインデックスと対応する', () => {
    expect(routes).toHaveLength(ENGINEER_SPAWN_CELLS.length);
    routes.forEach((route, i) => {
      expect(route.id).toBe(i);
      expect(route.spawn).toEqual(ENGINEER_SPAWN_CELLS[i]);
      expectValidRoute(route);
    });
  });

  it('出現セル同士、および出現セルとリリース地点は重ならない', () => {
    const keys = ENGINEER_SPAWN_CELLS.map(spawnKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(spawnKey(RELEASE_POINT_CELL));
  });

  it('縦区間は他の出現セル・リリースセルを通らない', () => {
    const cells = new Set(
      [...ENGINEER_SPAWN_CELLS, RELEASE_POINT_CELL].map(spawnKey),
    );
    for (const route of routes) {
      const passed = expandCells(route.waypoints).filter(
        (c) => spawnKey(c) !== spawnKey(route.spawn) && cells.has(spawnKey(c)),
      );
      expect(passed.map(spawnKey)).toEqual([spawnKey(RELEASE_POINT_CELL)]);
    }
  });

  it('同じ乱数列から同じルートを返す', () => {
    expect(createRoutes(ENGINEER_SPAWN_CELLS, seededRandom(3))).toEqual(routes);
  });
});

describe('ルートの表示用座標', () => {
  it('セル中心とルートのピクセル座標', () => {
    expect(cellCenter(RELEASE_POINT_CELL)).toEqual({ x: 930, y: 270 });
    expect(routePixelPoints(routeAt(1, alwaysMin)).slice(0, 2)).toEqual([
      { x: 30, y: 90 },
      { x: 90, y: 90 },
    ]);
  });

  it('出現マーカーはセルに収まる', () => {
    expect(SPAWN_MARKER_STYLE.radius * 2).toBeLessThanOrEqual(CELL_SIZE);
  });
});

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
  const initial = (): Route[] =>
    createRoutes(ENGINEER_SPAWN_CELLS, seededRandom(1));

  it('空の一覧に追加すると id 0・先頭行のルートを返す', () => {
    const route = addRoute([], alwaysMin);
    expect(route?.id).toBe(0);
    expect(route?.spawn).toEqual(spawnAt(0));
  });

  it('上限-1本（8本）のときは9本目を追加できる', () => {
    const rows = allRows.slice(0, MAX_ENGINEER_ROUTES - 1);
    const route = addRoute(routesAtRows(rows, alwaysMin), alwaysMin);
    expect(route?.spawn).toEqual(spawnAt(MAX_ENGINEER_ROUTES - 1));
  });

  it('上限ちょうど（9本）のときは undefined を返す', () => {
    const rows = allRows.slice(0, MAX_ENGINEER_ROUTES);
    expect(addRoute(routesAtRows(rows, alwaysMin), alwaysMin)).toBeUndefined();
  });

  it('上限を超えた入力でも undefined を返す', () => {
    const over = Array.from({ length: MAX_ENGINEER_ROUTES + 1 }, (_, i) =>
      createRoute(i, spawnAt(i % FIELD_ROWS), RELEASE_POINT_CELL, alwaysMin),
    );
    expect(addRoute(over, alwaysMin)).toBeUndefined();
  });

  it('初期3本から繰り返し追加すると上限で止まり、出現場所が重ならず、すべて接続条件を満たす', () => {
    const random = seededRandom(5);
    const routes = initial();
    for (;;) {
      const route = addRoute(routes, random);
      if (route === undefined) break;
      expectValidRoute(route);
      routes.push(route);
    }
    expect(routes).toHaveLength(MAX_ENGINEER_ROUTES);
    const keys = routes.map((r) => spawnKey(r.spawn));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(spawnKey(RELEASE_POINT_CELL));
    expect(new Set(routes.map((r) => r.id)).size).toBe(routes.length);
  });

  it('追加ルートの出現セルは左端列の最上部の空き', () => {
    // 初期の出現行は 1・4・7 なので、最初の空きは行0、次は行2。
    const routes = initial();
    const first = addRoute(routes, alwaysMin);
    expect(first?.spawn).toEqual(spawnAt(0));
    if (first === undefined) return;
    expect(addRoute([...routes, first], alwaysMin)?.spawn).toEqual(spawnAt(2));
  });

  it('初期3本へ追加すると id は 3 になる', () => {
    expect(addRoute(initial(), alwaysMin)?.id).toBe(ENGINEER_SPAWN_CELLS.length);
  });

  it('欠番があっても既存の最大 id + 1 になる', () => {
    const routes = initial().filter((r) => r.id !== 1);
    expect(routes.map((r) => r.id)).toEqual([0, 2]);
    expect(addRoute(routes, alwaysMin)?.id).toBe(3);
  });

  it('入力の一覧と既存ルートを変更しない', () => {
    const routes = initial();
    const snapshot = structuredClone(routes);
    addRoute(routes, seededRandom(9));
    expect(routes).toEqual(snapshot);
  });

  it('同じ乱数列なら同じルート', () => {
    expect(addRoute(initial(), seededRandom(4))).toEqual(
      addRoute(initial(), seededRandom(4)),
    );
  });

  it('最大エンジニア数まで addRoute で増やせて、出現セル・id が重ならず、その次は undefined', () => {
    for (const seed of seeds) {
      const random = seededRandom(seed);
      const routes = initial();
      for (let i = 0; i < MAX_ENGINEERS - ENGINEER_SPAWN_CELLS.length; i++) {
        const route = addRoute(routes, random);
        expect(route).toBeDefined();
        if (route === undefined) return;
        routes.push(route);
      }
      expect(routes).toHaveLength(MAX_ENGINEERS);
      expect(new Set(routes.map((r) => spawnKey(r.spawn))).size).toBe(MAX_ENGINEERS);
      expect(new Set(routes.map((r) => r.id)).size).toBe(MAX_ENGINEERS);
      expect(addRoute(routes, random)).toBeUndefined();
    }
  });

  it.each([
    [7, true],
    [8, true],
    [9, false],
  ])('ルートが%i本のとき追加できるか: %s（8人目・9人目・10人目）', (count, canAdd) => {
    const routes = routesAtRows(allRows.slice(0, count), alwaysMin);
    expect(addRoute(routes, alwaysMin) !== undefined).toBe(canAdd);
  });
});

describe('removeRoute（退職でルートが消える #32）', () => {
  const initial = (): Route[] => createRoutes(ENGINEER_SPAWN_CELLS, seededRandom(1));

  it.each([
    ['先頭', 0, [1, 2]],
    ['中間', 1, [0, 2]],
    ['最大 id', 2, [0, 1]],
  ])('%sのルートを消すと残りの id は %j', (_label, routeId, expected) => {
    expect(removeRoute(initial(), routeId).map((route) => route.id)).toEqual(expected);
  });

  it('存在しない id なら例外を投げず、同じ内容の新しい配列を返す', () => {
    const routes = initial();
    const result = removeRoute(routes, 99);
    expect(result).toEqual(routes);
    expect(result).not.toBe(routes);
  });

  it('空配列なら空配列', () => {
    expect(removeRoute([], 0)).toEqual([]);
  });

  it('最後の1本を消すと空になる', () => {
    expect(removeRoute([createRoute(4, spawnAt(0), RELEASE_POINT_CELL, alwaysMin)], 4)).toEqual([]);
  });

  it('入力の配列と残るルートを変更せず、残るルートは同じ参照のまま（作り直さない）', () => {
    const routes = initial();
    const before = [...routes];
    const snapshot = structuredClone(routes);
    const result = removeRoute(routes, 1);
    expect(routes).toEqual(snapshot);
    routes.forEach((route, i) => expect(route).toBe(before[i]));
    expect(result[0]).toBe(routes[0]);
    expect(result[1]).toBe(routes[2]);
  });

  it('最大 id のルートを消したあとに追加すると、同じ id と出現場所が再び使われる', () => {
    const routes = initial();
    const added = addRoute(routes, alwaysMin);
    expect(added).toBeDefined();
    if (added === undefined) return;
    const removed = removeRoute([...routes, added], added.id);
    const again = addRoute(removed, alwaysMin);
    expect(again?.id).toBe(added.id);
    expect(again?.spawn).toEqual(added.spawn);
  });

  it('中間のルートを消したあとに追加すると、id は残りの最大 id + 1', () => {
    const removed = removeRoute(initial(), 1);
    expect(addRoute(removed, alwaysMin)?.id).toBe(3);
  });

  it('中間のルートを消すと、その出現場所が次の追加で空きとして使われる', () => {
    // 初期の出現行は 1・4・7。行0 は空いているので先に使われ、消した行4 はその後の空きとして残る。
    const removed = removeRoute(initial(), 1);
    expect(nextSpawnCell(removed.map((route) => route.spawn))).toEqual(spawnAt(0));
    expect(removed.map((route) => route.spawn)).not.toContainEqual(ENGINEER_SPAWN_CELLS[1]);
  });
});

describe('addRouteAt（出現セルを指定して追加する #157）', () => {
  const initial = (): Route[] => createRoutes(ENGINEER_SPAWN_CELLS, seededRandom(1));

  it('多数のシード × 出現列の全行で、指定した出現セルから接続・範囲・単調・主人公セル回避を満たす', () => {
    for (const seed of seeds) {
      const random = seededRandom(seed);
      for (const row of allRows) {
        const route = addRouteAt([], spawnAt(row), random);
        if (route === undefined) throw new Error('ルートを追加できませんでした');
        expect(route.spawn).toEqual(spawnAt(row));
        expectValidRoute(route);
      }
    }
  });

  it('id は既存の最大 id + 1（空なら 0、欠番があっても最大 + 1）', () => {
    expect(addRouteAt([], spawnAt(0), alwaysMin)?.id).toBe(0);
    expect(addRouteAt(initial(), spawnAt(0), alwaysMin)?.id).toBe(3);
    expect(addRouteAt(removeRoute(initial(), 1), spawnAt(4), alwaysMin)?.id).toBe(3);
    expect(addRouteAt(removeRoute(initial(), 2), spawnAt(7), alwaysMin)?.id).toBe(2);
  });

  it('同じ乱数列なら addRoute と同じ形（出現セルが同じとき）', () => {
    const routes = initial();
    expect(addRouteAt(routes, spawnAt(0), seededRandom(7))).toEqual(addRoute(routes, seededRandom(7)));
  });

  it('境界値: 上限-1本（8本）なら追加でき、上限ちょうど（9本）なら undefined', () => {
    const below = routesAtRows(allRows.slice(0, MAX_ENGINEER_ROUTES - 1), alwaysMin);
    expect(addRouteAt(below, spawnAt(MAX_ENGINEER_ROUTES - 1), alwaysMin)?.spawn).toEqual(spawnAt(MAX_ENGINEER_ROUTES - 1));
    const full = routesAtRows(allRows.slice(0, MAX_ENGINEER_ROUTES), alwaysMin);
    expect(addRouteAt(full, spawnAt(0), alwaysMin)).toBeUndefined();
  });

  it('入力の一覧と既存ルートを変更しない', () => {
    const routes = initial();
    const snapshot = structuredClone(routes);
    addRouteAt(routes, spawnAt(0), alwaysMin);
    expect(routes).toEqual(snapshot);
  });
});

describe('pointToRouteCell（ピクセル → ルートグリッド 60px のセル #157）', () => {
  it('セルの中心は cellCenter の逆になる', () => {
    for (const row of allRows) {
      for (const col of [0, FIELD_COLS - 1]) {
        expect(pointToRouteCell(cellCenter({ col, row }))).toEqual({ col, row });
      }
    }
  });

  it('境界値: セル境界ちょうどは次のセル、0.01px 手前は前のセル', () => {
    expect(pointToRouteCell({ x: 0, y: 0 })).toEqual({ col: 0, row: 0 });
    expect(pointToRouteCell({ x: CELL_SIZE - 0.01, y: CELL_SIZE - 0.01 })).toEqual({ col: 0, row: 0 });
    expect(pointToRouteCell({ x: CELL_SIZE, y: CELL_SIZE })).toEqual({ col: 1, row: 1 });
  });

  it('境界値: フィールドの内側の端はセルになり、外（負・幅・高さちょうど）は undefined', () => {
    const width = CELL_SIZE * FIELD_COLS;
    const height = CELL_SIZE * FIELD_ROWS;
    expect(pointToRouteCell({ x: width - 0.01, y: height - 0.01 })).toEqual({ col: FIELD_COLS - 1, row: FIELD_ROWS - 1 });
    expect(pointToRouteCell({ x: -0.01, y: 0 })).toBeUndefined();
    expect(pointToRouteCell({ x: 0, y: -0.01 })).toBeUndefined();
    expect(pointToRouteCell({ x: width, y: 0 })).toBeUndefined();
    expect(pointToRouteCell({ x: 0, y: height })).toBeUndefined();
  });
});
