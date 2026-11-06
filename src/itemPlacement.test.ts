import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ITEM_ATTACK_COOLDOWN_MS,
  ITEM_BLOCKED_RECTS,
  ITEM_BOX_SIZE,
  ITEM_RANGE_RATIOS,
  ITEM_ROUTE_CLEARANCE,
  LINTER_ATTACK_COOLDOWN_MS,
  LINTER_HESITATION_PROBABILITY,
  PAIR_PROGRAMMER_FOLLOW_OFFSET,
  PLACEMENT_CELL_SIZE,
  PLACEMENT_COLS,
  PLACEMENT_ROWS,
} from './config';
import { CELL_SIZE, FIELD_COLS, FIELD_HEIGHT, FIELD_ROWS, FIELD_WIDTH } from './field';
import {
  getItemPlacement,
  getItemRange,
  ITEM_DEFINITIONS,
  ITEM_TYPES,
  isTargetInItemRange,
  itemTargetsNormalCode,
} from './item';
import type { ItemType } from './item';
import {
  canItemAttack,
  countItemsCovering,
  createItemState,
  filterItemTargets,
  findCodesToReveal,
  findItemTarget,
  findTargetFor,
  formatItemOption,
  formatItemMessage,
  getItemAttackCooldownMs,
  getItemOrigin,
  getItemPrice,
  getRouteCells,
  isIncidentPreventedByNote,
  isPlaceableCell,
  isPointInField,
  itemFootprint,
  placementCellCenter,
  pointToCell,
  pointToPlacementCell,
  purchaseInstantItem,
  purchaseItem,
  RELEASE_CLEARANCE_RADIUS,
  shouldItemHesitate,
  SPAWN_CLEARANCE_RADIUS,
} from './itemPlacement';
import type { InstantPurchaseState, PlacedItem, PurchaseState } from './itemPlacement';
import { getReleasePointLabelBounds, RELEASE_POINT_CENTER } from './releasePoint';
import { SUPPORTED_LOCALES } from './i18n/resolveLocale';
import { setLocale } from './i18n';
import { rectsOverlap } from './geometry';
import { cellCenter } from './route';
import type { GridCell, Route } from './route';

// 上帯(y<60)・下帯(y≧480)は UI で置けない。ルートは行 3（y=210）を水平に通り、col 5（x=330）で行 5（y=330）へ曲がる単純なもの。
// アイテムのセルは配置グリッド（16px #151）の座標で書く。
const route: Route = {
  id: 0,
  spawn: { col: 0, row: 3 },
  waypoints: [
    { col: 0, row: 3 },
    { col: 5, row: 3 },
    { col: 5, row: 5 },
    { col: FIELD_COLS - 1, row: 5 },
    { col: FIELD_COLS - 1, row: 4 },
  ],
};
const routes = [route];
const options = { routes };
// 置けるセル。中心 (488, 136)・フットプリント x=480〜496 / y=128〜144（16px #154）で、ルート（y≧202）・上帯（y<60）に重ならない。
const free: GridCell = { col: 30, row: 8 };
// ルートの線上（行3の線 y=210 の上。中心 y=216）・出現場所・リリース地点を含む配置グリッドのセル。
const onRoute: GridCell = { col: 20, row: 13 };
const spawnCell = pointToPlacementCell(cellCenter(route.spawn));
const releaseCell = pointToPlacementCell(RELEASE_POINT_CENTER);
// 行 R を水平に通るだけのルートと、col C に縦区間（行1〜7）を持つルート（境界値のテスト用）。
const rowRoute = (row: number): Route => ({
  id: 10 + row,
  spawn: { col: 0, row },
  waypoints: [
    { col: 0, row },
    { col: FIELD_COLS - 1, row },
  ],
});
const colRoute = (col: number): Route => ({
  id: 20 + col,
  spawn: { col: 0, row: 1 },
  waypoints: [
    { col: 0, row: 1 },
    { col, row: 1 },
    { col, row: 7 },
    { col: FIELD_COLS - 1, row: 7 },
  ],
});
const state = (overrides: Partial<PurchaseState> = {}): PurchaseState => ({
  funds: 1000000,
  placedItems: [],
  nextId: 0,
  gameOver: false,
  ...overrides,
});
// セルに置くアイテム（placement: cell）と、置かずに購入時に発動するアイテム（placement: none #58）。
const CELL_ITEM_TYPES = ITEM_TYPES.filter((itemType) => getItemPlacement(itemType) === 'cell');
const INSTANT_ITEM_TYPES = ITEM_TYPES.filter((itemType) => getItemPlacement(itemType) === 'none');
const placed = (id: number, cell: GridCell, itemType: ItemType = 'linter'): PlacedItem => ({
  id,
  itemType,
  cell,
  lastAttackTime: null,
});

// #164 で半額にした価格（安い 12,500・普通 25,000・高い 50,000）。
describe('getItemPrice: 18アイテムの価格', () => {
  it.each([
    ['codeRabbit', 50000],
    ['linter', 12500],
    ['testTool', 25000],
    ['ci', 25000],
    ['securityScanner', 50000],
    ['pairProgrammer', 25000],
    ['cat', 12500],
    ['rubberDuck', 12500],
    ['codeFreeze', 25000],
    ['specChangeStorm', 25000],
    ['coffeeMachine', 12500],
    ['energyDrink', 12500],
    ['pizza', 12500],
    ['documentation', 25000],
    ['fridayDeploy', 12500],
    ['rollbackButton', 50000],
    ['worksFine', 12500],
    ['seniorNote', 50000],
  ] as const)('%s は %i 円', (itemType, price) => {
    expect(getItemPrice(itemType)).toBe(price);
  });

  it('段階表を差し替えられる', () => {
    expect(getItemPrice('linter', { cheap: 1, normal: 2, expensive: 3 })).toBe(1);
  });
});

describe('purchaseItem: 資金の境界値', () => {
  const price = getItemPrice('linter');
  it.each([
    [price - 1, false],
    [price, true],
    [price + 1, true],
  ])('資金 %i 円 → 購入できるか: %s', (funds, ok) => {
    const result = purchaseItem(state({ funds }), 'linter', free, options);
    expect(result.ok).toBe(ok);
    if (result.ok) {
      expect(result.fundsAfter).toBe(funds - price);
      expect(result.price).toBe(price);
    } else {
      expect(result).toEqual({ ok: false, reason: 'insufficientFunds' });
    }
  });

  it('ちょうど価格なら資金は 0 になる', () => {
    const result = purchaseItem(state({ funds: price }), 'linter', free, options);
    expect(result.ok && result.fundsAfter).toBe(0);
  });

  it('price+1 なら資金は 1 になる', () => {
    const result = purchaseItem(state({ funds: price + 1 }), 'linter', free, options);
    expect(result.ok && result.fundsAfter).toBe(1);
  });

  it.each(CELL_ITEM_TYPES)('%s: 価格-1 は資金不足、ちょうどは成功', (itemType) => {
    const p = getItemPrice(itemType);
    expect(purchaseItem(state({ funds: p - 1 }), itemType, free, options)).toEqual({
      ok: false,
      reason: 'insufficientFunds',
    });
    expect(purchaseItem(state({ funds: p }), itemType, free, options).ok).toBe(true);
  });
});

describe('pointToCell: 座標→セル', () => {
  it.each([
    [{ x: 0, y: 0 }, { col: 0, row: 0 }],
    [{ x: CELL_SIZE - 1, y: CELL_SIZE - 1 }, { col: 0, row: 0 }],
    [{ x: CELL_SIZE - 0.01, y: 0 }, { col: 0, row: 0 }],
    [{ x: CELL_SIZE, y: 0 }, { col: 1, row: 0 }],
    [{ x: 0, y: CELL_SIZE }, { col: 0, row: 1 }],
    [{ x: CELL_SIZE * 2.5, y: CELL_SIZE * 3.5 }, { col: 2, row: 3 }],
    [{ x: CELL_SIZE * FIELD_COLS - 0.01, y: CELL_SIZE * FIELD_ROWS - 0.01 }, { col: FIELD_COLS - 1, row: FIELD_ROWS - 1 }],
  ])('%j → %j', (point, cell) => {
    expect(pointToCell(point)).toEqual(cell);
  });

  it.each([
    [{ x: -0.01, y: 0 }, { col: -1, row: 0 }],
    [{ x: 0, y: -1 }, { col: 0, row: -1 }],
    [{ x: CELL_SIZE * FIELD_COLS, y: 0 }, { col: FIELD_COLS, row: 0 }],
    [{ x: 0, y: CELL_SIZE * FIELD_ROWS }, { col: 0, row: FIELD_ROWS }],
  ])('フィールド外 %j は範囲外のセル %j', (point, cell) => {
    expect(pointToCell(point)).toEqual(cell);
  });
});

describe('getRouteCells', () => {
  it('折れ点の間のセルも含み、出現・リリースのセルを含む', () => {
    const cells = getRouteCells(route);
    expect(cells).toContainEqual({ col: 3, row: 3 });
    expect(cells).toContainEqual({ col: 5, row: 4 });
    expect(cells).toContainEqual(route.spawn);
    expect(cells).toContainEqual({ col: FIELD_COLS - 1, row: 4 });
  });
});

describe('配置グリッド(#151): pointToPlacementCell / placementCellCenter / itemFootprint / isPointInField', () => {
  it('16px のグリッドで、列数 60・行数 34（最終行は 12px の端数の行）', () => {
    expect(PLACEMENT_CELL_SIZE).toBe(16);
    expect(PLACEMENT_COLS).toBe(60);
    expect(PLACEMENT_ROWS).toBe(34);
    expect(PLACEMENT_COLS * PLACEMENT_CELL_SIZE).toBe(FIELD_WIDTH);
    expect((PLACEMENT_ROWS - 1) * PLACEMENT_CELL_SIZE).toBeLessThan(FIELD_HEIGHT);
    expect(PLACEMENT_ROWS * PLACEMENT_CELL_SIZE).toBeGreaterThanOrEqual(FIELD_HEIGHT);
  });

  it.each([
    [{ x: 0, y: 0 }, { col: 0, row: 0 }],
    [{ x: 15, y: 15 }, { col: 0, row: 0 }],
    [{ x: 15.99, y: 0 }, { col: 0, row: 0 }],
    [{ x: 16, y: 0 }, { col: 1, row: 0 }],
    [{ x: 0, y: 16 }, { col: 0, row: 1 }],
    [{ x: 959, y: 539 }, { col: 59, row: 33 }],
    [{ x: FIELD_WIDTH - 0.01, y: FIELD_HEIGHT - 0.01 }, { col: PLACEMENT_COLS - 1, row: PLACEMENT_ROWS - 1 }],
  ])('pointToPlacementCell: %j → %j', (point, cell) => {
    expect(pointToPlacementCell(point)).toEqual(cell);
  });

  it.each([
    [{ x: -0.01, y: 0 }, { col: -1, row: 0 }],
    [{ x: FIELD_WIDTH, y: 0 }, { col: PLACEMENT_COLS, row: 0 }],
    // y=540 は最終行（528〜544）に入るが、フィールド外なので isPointInField で先に弾く。
    [{ x: 0, y: FIELD_HEIGHT }, { col: 0, row: PLACEMENT_ROWS - 1 }],
  ])('フィールド外 %j は %j', (point, cell) => {
    expect(pointToPlacementCell(point)).toEqual(cell);
  });

  it('isPointInField: 0 ≤ x < 960 かつ 0 ≤ y < 540', () => {
    expect(isPointInField({ x: 0, y: 0 })).toBe(true);
    expect(isPointInField({ x: FIELD_WIDTH - 0.01, y: FIELD_HEIGHT - 0.01 })).toBe(true);
    expect(isPointInField({ x: -0.01, y: 0 })).toBe(false);
    expect(isPointInField({ x: 0, y: -0.01 })).toBe(false);
    expect(isPointInField({ x: FIELD_WIDTH, y: 0 })).toBe(false);
    expect(isPointInField({ x: 0, y: FIELD_HEIGHT })).toBe(false);
  });

  it('placementCellCenter はセルの中心 (col + 0.5) × 16', () => {
    expect(placementCellCenter({ col: 0, row: 0 })).toEqual({ x: 8, y: 8 });
    expect(placementCellCenter({ col: 28, row: 16 })).toEqual({ x: 456, y: 264 });
    expect(placementCellCenter({ col: PLACEMENT_COLS - 1, row: PLACEMENT_ROWS - 1 })).toEqual({ x: 952, y: 536 });
  });

  it('itemFootprint は中心を中心とする一辺 ITEM_BOX_SIZE（配置グリッド 1マス = 16px #154）の正方形で、セルそのものと一致する', () => {
    expect(ITEM_BOX_SIZE).toBe(16);
    expect(ITEM_BOX_SIZE).toBe(PLACEMENT_CELL_SIZE);
    expect(itemFootprint({ col: 28, row: 16 })).toEqual({ x: 448, y: 256, width: 16, height: 16 });
    expect(itemFootprint({ col: 0, row: 0 })).toEqual({ x: 0, y: 0, width: 16, height: 16 });
    expect(itemFootprint({ col: PLACEMENT_COLS - 1, row: 8 })).toEqual({ x: 944, y: 128, width: 16, height: 16 });
  });
});

describe('isPlaceableCell: 置ける場所（配置グリッド #151）', () => {
  const ctx = { routes, placedItems: [] as PlacedItem[] };
  const noRoutes = { routes: [], placedItems: [] as PlacedItem[] };
  const lastCol = PLACEMENT_COLS - 1;
  const lastRow = PLACEMENT_ROWS - 1;

  it.each([
    [free, true],
    [{ col: 0, row: 20 }, true], // 左端（x=0〜16）。16px なのでフィールドの左端にも収まる（出現列でもルート・出現場所から離れていれば置ける）
    [{ col: lastCol, row: 8 }, true], // 右端（x=944〜960）。ちょうど収まる
    [{ col: 27, row: 4 }, true], // 上帯（y<60）の直下（y=64〜80。4px 空く）
    [{ col: 27, row: 3 }, false], // 上帯に重なる（y=48〜64）
    [{ col: 27, row: 29 }, true], // 下帯（y≧480）の直上（y=464〜480。辺が接する）
    [{ col: 27, row: 30 }, false], // 下帯に重なる（y=480〜496。接した次のセルは不可）
    [{ col: 27, row: lastRow }, false], // 下へはみ出す（y=528〜544）
    // #156 で左の HUD（旧 x=72〜416、y=80〜362）を撤去したため、その範囲（ルートから離れた位置）にも置ける。
    [{ col: 25, row: 10 }, true], // 旧 HUD の右端の内側（x=400〜416）
    [{ col: 10, row: 5 }, true], // 旧 HUD の上端の内側（y=80〜96）
    [{ col: 10, row: 22 }, true], // 旧 HUD の下端の内側（y=352〜368）
    [{ col: 10, row: 19 }, true], // 旧 休暇の案内文(#150)の位置（y=304〜320）
    [{ col: 4, row: 10 }, true], // 旧 HUD の左端の内側（x=64〜80）
    [{ col: -1, row: 10 }, false],
    [{ col: PLACEMENT_COLS, row: 10 }, false],
    [{ col: 30, row: -1 }, false],
    [{ col: 30, row: PLACEMENT_ROWS }, false],
    [{ col: 30.5, row: 8 }, false],
    [{ col: 30, row: 8.5 }, false],
  ])('%j → %s', (cell, expected) => {
    expect(isPlaceableCell(cell, ctx)).toBe(expected);
  });

  it('ルートの線: 中心線から ITEM_ROUTE_CLEARANCE（8px）未満は不可、ちょうど離れれば可（水平の区間）', () => {
    expect(ITEM_ROUTE_CLEARANCE).toBe(8);
    // 行3の線（y=210）。帯は y=202〜218。16px グリッドの辺は帯の辺（16 の倍数ではない）とちょうど接しないので、帯に最も近い空きと重なりのセルで見る（ちょうどの境界は geometry.test.ts）。
    const above = { routes: [rowRoute(3)], placedItems: [], blockedRects: [] };
    expect(isPlaceableCell({ col: 20, row: 11 }, above)).toBe(true); // 下端 y=192（帯まで 10px 空く）
    expect(isPlaceableCell({ col: 20, row: 12 }, above)).toBe(false); // 下端 y=208（帯に 6px 重なる）
    expect(isPlaceableCell({ col: 20, row: 13 }, above)).toBe(false); // 線上
    expect(isPlaceableCell({ col: 20, row: 14 }, above)).toBe(true); // 上端 y=224（帯の下端 218 まで 6px 空く）
    // 行4の線（y=270）。帯は y=262〜278。
    const below = { routes: [rowRoute(4)], placedItems: [], blockedRects: [] };
    expect(isPlaceableCell({ col: 20, row: 18 }, below)).toBe(true); // 上端 y=288（帯の下端 278 まで 10px 空く）
    expect(isPlaceableCell({ col: 20, row: 17 }, below)).toBe(false); // 上端 y=272（帯に 6px 重なる）
    expect(isPlaceableCell({ col: 20, row: 16 }, below)).toBe(false); // 下端 y=272（帯に 10px 重なる）
    expect(isPlaceableCell({ col: 20, row: 15 }, below)).toBe(true); // 下端 y=256（帯の上端 262 まで 6px 空く）
  });

  it('ルートの線: 縦の区間も同じ', () => {
    // col 7 の縦区間（x=450、行1〜7）。帯は x=442〜458（ここも 16 の倍数ではないので、最も近い空きと重なりのセルで見る）。
    const left = { routes: [colRoute(7)], placedItems: [], blockedRects: [] };
    expect(isPlaceableCell({ col: 26, row: 20 }, left)).toBe(true); // 右端 x=432（帯の左端 442 まで 10px 空く）
    expect(isPlaceableCell({ col: 27, row: 20 }, left)).toBe(false); // 右端 x=448（帯に 6px 重なる）
    expect(isPlaceableCell({ col: 28, row: 20 }, left)).toBe(false); // 左端 x=448（帯に 10px 重なる）
    expect(isPlaceableCell({ col: 29, row: 20 }, left)).toBe(true); // 左端 x=464（帯の右端 458 まで 6px 空く）
    // col 8 の縦区間（x=510）。帯は x=502〜518。
    const right = { routes: [colRoute(8)], placedItems: [], blockedRects: [] };
    expect(isPlaceableCell({ col: 33, row: 20 }, right)).toBe(true); // 左端 x=528（帯の右端 518 まで 10px 空く）
    expect(isPlaceableCell({ col: 32, row: 20 }, right)).toBe(false); // 左端 x=512（帯に 6px 重なる）
    expect(isPlaceableCell({ col: 31, row: 20 }, right)).toBe(false); // 右端 x=512（帯に 10px 重なる）
    expect(isPlaceableCell({ col: 30, row: 20 }, right)).toBe(true); // 右端 x=496（帯の左端 502 まで 6px 空く）
  });

  it('ルートの線上・その脇（既定のルート）', () => {
    expect(isPlaceableCell(onRoute, ctx)).toBe(false);
    expect(isPlaceableCell({ col: 20, row: 11 }, ctx)).toBe(true); // 行3の線のクリアランスから 10px 空く（#156 で HUD を撤去したので置ける）
    expect(isPlaceableCell({ col: 28, row: 20 }, ctx)).toBe(false); // 行5の線（y=330）の上
    expect(isPlaceableCell({ col: 28, row: 18 }, ctx)).toBe(true); // 行5の線の上側（下端 y=304 < 322）
    expect(isPlaceableCell({ col: 28, row: 22 }, ctx)).toBe(true); // 行5の線の下側（上端 y=352 > 338）
    expect(isPlaceableCell({ col: 28, row: 21 }, ctx)).toBe(false); // 上端 y=336（帯 y≦338 に 2px 重なる）
  });

  it('出現場所の円（半径 SPAWN_CLEARANCE_RADIUS）に重なると不可、離れれば可。ルートが無ければ出現セルの位置にも置ける', () => {
    expect(SPAWN_CLEARANCE_RADIUS).toBe(19.5);
    const spawn: GridCell = { col: 0, row: 4 }; // 中心 (30, 270)
    const spawnOnly = { routes: [{ id: 1, spawn, waypoints: [spawn] }], placedItems: [], blockedRects: [] };
    expect(isPlaceableCell({ col: 3, row: 16 }, spawnOnly)).toBe(false); // 左端 x=48（円の右端 49.5 に 1.5px 重なる。距離 18）
    expect(isPlaceableCell({ col: 4, row: 16 }, spawnOnly)).toBe(true); // 左端 x=64（距離 34）
    expect(isPlaceableCell({ col: 1, row: 15 }, spawnOnly)).toBe(false); // 下端 y=256（円の上端 250.5 に 5.5px 重なる。距離 14）
    expect(isPlaceableCell({ col: 1, row: 14 }, spawnOnly)).toBe(true); // 下端 y=240（距離 30）
    const atSpawn = pointToPlacementCell(cellCenter(spawn));
    expect(isPlaceableCell(atSpawn, spawnOnly)).toBe(false);
    expect(isPlaceableCell(atSpawn, { ...noRoutes, blockedRects: [] })).toBe(true);
    expect(isPlaceableCell(spawnCell, ctx)).toBe(false);
  });

  it('リリース地点の円（半径 RELEASE_CLEARANCE_RADIUS）に重なると不可（ルートが無くても）、離れれば可', () => {
    expect(RELEASE_CLEARANCE_RADIUS).toBe(28);
    expect(isPlaceableCell(releaseCell, noRoutes)).toBe(false);
    // 円は中心 (930, 270)・半径 28（x=902〜958、y=242〜298）。
    expect(isPlaceableCell({ col: 56, row: 16 }, noRoutes)).toBe(false); // 右端 x=912（円の左端 902 に 10px 重なる。距離 18）
    expect(isPlaceableCell({ col: 55, row: 16 }, noRoutes)).toBe(true); // 右端 x=896（距離 34）
    expect(isPlaceableCell({ col: 58, row: 18 }, noRoutes)).toBe(false); // 上端 y=288（円の下端 298 に 10px 重なる。距離 18）
    expect(isPlaceableCell({ col: 58, row: 19 }, noRoutes)).toBe(true); // 上端 y=304（距離 34）
  });

  it('「リリース」のラベル（getReleasePointLabelBounds）に重なると不可', () => {
    expect(getReleasePointLabelBounds()).toEqual({ x: 902, y: 224.5, width: 56, height: 17.5 });
    expect(isPlaceableCell({ col: 58, row: 13 }, noRoutes)).toBe(true); // 下端 y=224（ラベルの上端 224.5 まで 0.5px 空く）
    expect(isPlaceableCell({ col: 58, row: 14 }, noRoutes)).toBe(false); // 下端 y=240（ラベルに 15.5px 重なる。円からは距離 30 で離れている）
    expect(isPlaceableCell({ col: 55, row: 14 }, noRoutes)).toBe(true); // 右端 x=896（ラベルの左端 902 まで 6px 空く）
    expect(isPlaceableCell({ col: 56, row: 14 }, noRoutes)).toBe(false); // 右端 x=912（ラベルに 10px 重なる）
  });

  it('既存アイテムのフットプリントと重なると不可。同じセルは不可、辺が接する隣・角が接する斜め隣は可（16px #154）', () => {
    const withItem = { routes, placedItems: [placed(0, free)] };
    expect(isPlaceableCell(free, withItem)).toBe(false); // 同じセル（完全に重なる）
    expect(isPlaceableCell({ col: free.col + 1, row: free.row }, withItem)).toBe(true); // 右隣（辺が接する）
    expect(isPlaceableCell({ col: free.col - 1, row: free.row }, withItem)).toBe(true); // 左隣
    expect(isPlaceableCell({ col: free.col, row: free.row + 1 }, withItem)).toBe(true); // 下隣
    expect(isPlaceableCell({ col: free.col, row: free.row - 1 }, withItem)).toBe(true); // 上隣
    expect(isPlaceableCell({ col: free.col + 1, row: free.row + 1 }, withItem)).toBe(true); // 右下（角が接する）
    expect(isPlaceableCell({ col: free.col - 1, row: free.row - 1 }, withItem)).toBe(true); // 左上
    expect(isPlaceableCell({ col: free.col + 2, row: free.row }, withItem)).toBe(true); // 2セル隣（16px 空く）
  });

  it('blockedRects を差し替えられる。辺が接するだけの矩形は置け、1px 重なると置けない', () => {
    const footprint = itemFootprint(free); // x=480〜496、y=128〜144
    const leftOf = (right: number) => [{ x: 0, y: 0, width: right, height: FIELD_HEIGHT }];
    const rightOf = (left: number) => [{ x: left, y: 0, width: FIELD_WIDTH - left, height: FIELD_HEIGHT }];
    expect(isPlaceableCell(free, { ...ctx, blockedRects: leftOf(footprint.x) })).toBe(true);
    expect(isPlaceableCell(free, { ...ctx, blockedRects: leftOf(footprint.x + 1) })).toBe(false);
    expect(isPlaceableCell(free, { ...ctx, blockedRects: rightOf(footprint.x + footprint.width) })).toBe(true);
    expect(isPlaceableCell(free, { ...ctx, blockedRects: rightOf(footprint.x + footprint.width - 1) })).toBe(false);
    // 既定の置けない矩形を外すと上帯にも置ける。上端（行0）は 16px なので収まり、フィールドの外の行(-1)は置けない。
    expect(isPlaceableCell({ col: 27, row: 1 }, { ...ctx, blockedRects: [] })).toBe(true);
    expect(isPlaceableCell({ col: 27, row: 0 }, { ...ctx, blockedRects: [] })).toBe(true);
    expect(isPlaceableCell({ col: 27, row: -1 }, { ...ctx, blockedRects: [] })).toBe(false);
    expect(isPlaceableCell({ col: 27, row: 3 }, ctx)).toBe(false);
  });

  it('フィールドからのはみ出し単独（ルートなし・blockedRects 空）: 列0・列59・行0・行32 は収まり、12px の最終行33と範囲外は不可(#154)', () => {
    const bare = { routes: [], placedItems: [] as PlacedItem[], blockedRects: [] };
    expect(isPlaceableCell({ col: 0, row: 8 }, bare)).toBe(true); // x=0〜16（左端に接する）
    expect(isPlaceableCell({ col: lastCol, row: 8 }, bare)).toBe(true); // x=944〜960（右端に接する）
    expect(isPlaceableCell({ col: 20, row: 0 }, bare)).toBe(true); // y=0〜16（上端に接する）
    expect(isPlaceableCell({ col: 20, row: lastRow - 1 }, bare)).toBe(true); // y=512〜528（最後に収まる行）
    expect(isPlaceableCell({ col: 20, row: lastRow }, bare)).toBe(false); // y=528〜544（下へ 4px はみ出す。最終行は 12px しかない）
    expect(isPlaceableCell({ col: lastCol, row: lastRow }, bare)).toBe(false);
    expect(isPlaceableCell({ col: -1, row: 8 }, bare)).toBe(false);
    expect(isPlaceableCell({ col: PLACEMENT_COLS, row: 8 }, bare)).toBe(false);
    expect(isPlaceableCell({ col: 20, row: -1 }, bare)).toBe(false);
    expect(isPlaceableCell({ col: 20, row: PLACEMENT_ROWS }, bare)).toBe(false);
  });

  it('既定の置けない矩形は上帯・下帯の2つ（#156 で左の HUD の矩形を外した）', () => {
    expect(ITEM_BLOCKED_RECTS).toEqual([
      { x: 0, y: 0, width: FIELD_WIDTH, height: CELL_SIZE },
      { x: 0, y: FIELD_HEIGHT - CELL_SIZE, width: FIELD_WIDTH, height: CELL_SIZE },
    ]);
  });
});

describe('purchaseItem: 置く場所と重複', () => {
  it('同じセルに2個目は occupied', () => {
    const first = purchaseItem(state(), 'linter', free, options);
    if (!first.ok) throw new Error('first purchase failed');
    const second = purchaseItem(
      state({ placedItems: first.placedItems, nextId: 1, funds: first.fundsAfter }),
      'ci',
      free,
      options,
    );
    expect(second).toEqual({ ok: false, reason: 'occupied' });
  });

  it('辺が接する隣・角が接する斜め隣には置ける（フットプリントが重ならない 16px #154）', () => {
    const withFirst = state({ placedItems: [placed(0, free)], nextId: 1 });
    expect(purchaseItem(withFirst, 'ci', { col: free.col + 1, row: free.row }, options).ok).toBe(true);
    expect(purchaseItem(withFirst, 'ci', { col: free.col + 1, row: free.row + 1 }, options).ok).toBe(true);
    expect(purchaseItem(withFirst, 'ci', free, options)).toEqual({ ok: false, reason: 'occupied' });
  });

  it.each([
    ['ルートの線上', onRoute],
    ['出現場所', spawnCell],
    ['リリース地点', releaseCell],
    ['上帯', { col: 20, row: 1 }],
    ['下帯', { col: 20, row: 32 }],
    ['範囲外', { col: -1, row: 10 }],
  ])('%s は notPlaceable で資金・配列は変わらない', (_name, cell) => {
    const input = state();
    expect(purchaseItem(input, 'linter', cell, options)).toEqual({ ok: false, reason: 'notPlaceable' });
    expect(input.funds).toBe(1000000);
    expect(input.placedItems).toEqual([]);
  });
});

describe('purchaseItem: ゲームオーバー・不明・判定順', () => {
  it('ゲームオーバー後は gameOver で、資金・配列が変わらない', () => {
    const items = [placed(0, { col: 1, row: 1 })];
    const input = state({ gameOver: true, placedItems: items });
    expect(purchaseItem(input, 'linter', free, options)).toEqual({ ok: false, reason: 'gameOver' });
    expect(input.funds).toBe(1000000);
    expect(input.placedItems).toEqual(items);
  });

  it('不明なアイテムは unknownItem', () => {
    expect(purchaseItem(state(), 'unknown', free, options)).toEqual({ ok: false, reason: 'unknownItem' });
  });

  it.each([
    ['ゲームオーバーかつ資金不足', state({ gameOver: true, funds: 0 }), 'linter', free, 'gameOver'],
    ['ゲームオーバーかつ不明', state({ gameOver: true }), 'x', free, 'gameOver'],
    ['不明かつ置けない場所', state(), 'x', { col: -1, row: 0 }, 'unknownItem'],
    ['置けない場所かつ資金不足', state({ funds: 0 }), 'linter', { col: -1, row: 0 }, 'notPlaceable'],
    [
      '既にあるかつ資金不足',
      state({ funds: 0, placedItems: [placed(0, free)] }),
      'linter',
      free,
      'occupied',
    ],
  ] as const)('判定順: %s → %s', (_name, input, itemType, cell, reason) => {
    expect(purchaseItem(input, itemType, cell, options)).toEqual({ ok: false, reason });
  });
});

describe('purchaseItem: 成功時の結果', () => {
  it('入力の配列は変更せず、新しい配列を返し、lastAttackTime は null', () => {
    const items: readonly PlacedItem[] = [placed(0, { col: 1, row: 1 })];
    const snapshot = JSON.stringify(items);
    const result = purchaseItem(state({ placedItems: items, nextId: 1 }), 'ci', free, options);
    expect(JSON.stringify(items)).toBe(snapshot);
    if (!result.ok) throw new Error('purchase failed');
    expect(result.placedItems).not.toBe(items);
    expect(result.placedItems).toHaveLength(2);
    expect(result.item).toEqual({ id: 1, itemType: 'ci', cell: free, lastAttackTime: null });
  });

  it('id は nextId から連番になる', () => {
    let current = state();
    const ids: number[] = [];
    // 行 24（y=374〜410）に 3 セル（48px）間隔で並べる。
    for (const col of [1, 4, 7]) {
      const result = purchaseItem(current, 'linter', { col, row: 24 }, options);
      if (!result.ok) throw new Error('purchase failed');
      ids.push(result.item.id);
      current = { ...current, placedItems: result.placedItems, nextId: result.item.id + 1, funds: result.fundsAfter };
    }
    expect(ids).toEqual([0, 1, 2]);
  });
});

describe('createItemState: リスタート時の初期状態', () => {
  it('配置なし・id は 0 から', () => {
    expect(createItemState()).toEqual({ placedItems: [], nextId: 0 });
  });

  it('呼ぶたびに独立した状態を返す', () => {
    expect(createItemState().placedItems).not.toBe(createItemState().placedItems);
  });
});

describe('formatItemMessage / formatItemOption', () => {
  it('成功・資金不足・置けない・既にある', () => {
    const ok = purchaseItem(state(), 'linter', free, options);
    expect(formatItemMessage(ok, 'linter')).toBe('Linterを置きました');
    expect(formatItemMessage({ ok: false, reason: 'insufficientFunds' }, 'linter')).toBe('資金が足りません');
    expect(formatItemMessage({ ok: false, reason: 'notPlaceable' }, 'linter')).toBe('そこには置けません');
    expect(formatItemMessage({ ok: false, reason: 'occupied' }, 'linter')).toBe('そこには置けません');
  });

  it('メニューの枠の文言は名前と価格で、キー名は出さない（#156）', () => {
    expect(formatItemOption('linter')).toBe('Linter 1.25万円');
    expect(formatItemOption('codeRabbit')).toBe('CodeRabbit 5万/月');
    expect(formatItemOption('securityScanner')).toBe('Scanner 5万/月');
    expect(formatItemOption('cat')).toBe('Cat 1.25万円');
    expect(formatItemOption('seniorNote')).toBe('Senior 5万円');
  });

  it('6個ずつ3ページの文言（#58, #156）', () => {
    const pages = [ITEM_TYPES.slice(0, 6), ITEM_TYPES.slice(6, 12), ITEM_TYPES.slice(12, 18)];
    expect(pages.map((page) => page.map((itemType) => formatItemOption(itemType)))).toEqual([
      ['CodeRabbit 5万/月', 'Linter 1.25万円', 'Test 2.5万円', 'CI 2.5万/月', 'Scanner 5万/月', 'Pair 2.5万/月'],
      ['Cat 1.25万円', 'Duck 1.25万円', 'Freeze 2.5万円', 'SpecStorm 2.5万円', 'Coffee 1.25万円', 'Energy 1.25万円'],
      ['Pizza 1.25万円', 'Docs 2.5万円', 'FriDeploy 1.25万円', 'Rollback 5万円', 'Yoshi! 1.25万円', 'Senior 5万円'],
    ]);
  });

  it('月額の表示は精算と同じ倍率を使う（1回払いは倍率に関係なく購入価格）', () => {
    expect(formatItemOption('codeRabbit', 0.5)).toBe('CodeRabbit 2.5万/月');
    expect(formatItemOption('codeRabbit', 0)).toBe('CodeRabbit 0万/月');
    expect(formatItemOption('linter', 0.5)).toBe('Linter 1.25万円');
  });
});

describe('findItemTarget: 範囲内で最も近い不正なコード', () => {
  const item = placed(0, { col: 5, row: 2 }, 'linter');
  const center = placementCellCenter(item.cell);
  const range = getItemRange('linter');
  const code = (id: number, dx: number, kind: 'malicious' | 'normal' = 'malicious', dy = 0) => ({
    id,
    kind,
    position: { x: center.x + dx, y: center.y + dy },
  });

  it('範囲ちょうどは範囲内', () => {
    expect(findItemTarget(item, [code(1, range)])?.id).toBe(1);
  });

  it('1px 内は範囲内、1px 外は範囲外', () => {
    expect(findItemTarget(item, [code(1, range - 1)])?.id).toBe(1);
    expect(findItemTarget(item, [code(1, range + 1)])).toBeNull();
  });

  it('正常なコードは近くても対象にしない', () => {
    expect(findItemTarget(item, [code(1, 0, 'normal')])).toBeNull();
    expect(findItemTarget(item, [code(1, 0, 'normal'), code(2, range)])?.id).toBe(2);
  });

  it('不正が複数なら最も近いもの', () => {
    expect(findItemTarget(item, [code(1, 50), code(2, 10), code(3, 30, 'malicious', 30)])?.id).toBe(2);
  });

  it('空配列は null', () => {
    expect(findItemTarget(item, [])).toBeNull();
  });

  it('入力の配列を変更しない', () => {
    const codes = [code(1, 50), code(2, 10)];
    findItemTarget(item, codes);
    expect(codes.map((c) => c.id)).toEqual([1, 2]);
  });
});

describe('アイテムごとの正常なコードの扱い（targetsNormalCode）', () => {
  const range = getItemRange('linter');
  const origin = { x: 100, y: 100 };
  const code = (id: number, dx: number, kind: 'malicious' | 'normal') => ({
    id,
    kind,
    position: { x: origin.x + dx, y: origin.y },
  });

  it('猫以外の17アイテムはすべて false', () => {
    const others = ITEM_TYPES.filter((type) => type !== 'cat');
    expect(others).toHaveLength(17);
    for (const type of others) {
      expect(ITEM_DEFINITIONS[type].targetsNormalCode).toBe(false);
      expect(itemTargetsNormalCode(type)).toBe(false);
    }
  });

  it('猫(#57)だけは true（正常なコードも消す）', () => {
    expect(ITEM_DEFINITIONS.cat.targetsNormalCode).toBe(true);
    expect(itemTargetsNormalCode('cat')).toBe(true);
  });

  describe('設定 false', () => {
    const query = { position: origin, range, targetsNormalCode: false };

    it('正常だけが範囲の境界にある → null（境界±1 も）', () => {
      expect(findTargetFor(query, [code(1, range, 'normal')])).toBeNull();
      expect(findTargetFor(query, [code(1, range - 1, 'normal')])).toBeNull();
      expect(findTargetFor(query, [code(1, range + 1, 'normal')])).toBeNull();
    });

    it('正常と不正が同じ距離 → 不正（配列の順序を両方試す）', () => {
      expect(findTargetFor(query, [code(1, 10, 'normal'), code(2, 10, 'malicious')])?.id).toBe(2);
      expect(findTargetFor(query, [code(2, 10, 'malicious'), code(1, 10, 'normal')])?.id).toBe(2);
    });

    it('正常が近く不正が遠い（両方範囲内）→ 不正', () => {
      expect(findTargetFor(query, [code(1, 5, 'normal'), code(2, range, 'malicious')])?.id).toBe(2);
    });

    it('正常が近く不正が範囲外 → null', () => {
      expect(findTargetFor(query, [code(1, 5, 'normal'), code(2, range + 1, 'malicious')])).toBeNull();
    });
  });

  describe('テスト専用の設定 true', () => {
    const query = { position: origin, range, targetsNormalCode: true };

    it('正常だけが境界ちょうど → 正常、境界+1 → null', () => {
      expect(findTargetFor(query, [code(1, range, 'normal')])?.id).toBe(1);
      expect(findTargetFor(query, [code(1, range - 1, 'normal')])?.id).toBe(1);
      expect(findTargetFor(query, [code(1, range + 1, 'normal')])).toBeNull();
    });

    it('同じ距離 → 配列で先のもの（仮の扱い）', () => {
      expect(findTargetFor(query, [code(1, 10, 'normal'), code(2, 10, 'malicious')])?.id).toBe(1);
      expect(findTargetFor(query, [code(2, 10, 'malicious'), code(1, 10, 'normal')])?.id).toBe(2);
    });

    it('正常が近く不正が遠い → 正常', () => {
      expect(findTargetFor(query, [code(2, range, 'malicious'), code(1, 5, 'normal')])?.id).toBe(1);
    });
  });

  describe('filterItemTargets', () => {
    it('false は不正だけ、true は全部残す', () => {
      const codes = [code(1, 0, 'normal'), code(2, 0, 'malicious')];
      expect(filterItemTargets(codes, false).map((c) => c.id)).toEqual([2]);
      expect(filterItemTargets(codes, true).map((c) => c.id)).toEqual([1, 2]);
    });

    it('入力の配列を変更しない', () => {
      const codes = [code(1, 0, 'normal'), code(2, 0, 'malicious')];
      filterItemTargets(codes, false);
      expect(codes.map((c) => c.id)).toEqual([1, 2]);
    });
  });
});

describe('canItemAttack: クールダウン', () => {
  it('初回(null)は可能', () => {
    expect(canItemAttack(0, null)).toBe(true);
  });

  it.each([
    [ITEM_ATTACK_COOLDOWN_MS - 1, false],
    [ITEM_ATTACK_COOLDOWN_MS, true],
    [ITEM_ATTACK_COOLDOWN_MS + 1, true],
  ])('前回から %i ms 後 → %s', (elapsed, expected) => {
    expect(canItemAttack(5000 + elapsed, 5000)).toBe(expected);
  });
});

describe('CodeRabbit(#52): 長距離の射程と標的の選び方', () => {
  const item = placed(0, { col: 8, row: 2 }, 'codeRabbit');
  const center = placementCellCenter(item.cell);
  const range = ITEM_RANGE_RATIOS.long * CELL_SIZE;
  const code = (id: number, dx: number, kind: 'malicious' | 'normal' = 'malicious', dy = 0) => ({
    id,
    kind,
    position: { x: center.x + dx, y: center.y + dy },
  });

  it('射程は長距離（ITEM_RANGE_RATIOS.long × CELL_SIZE）', () => {
    expect(ITEM_DEFINITIONS.codeRabbit.range).toBe('long');
    expect(getItemRange('codeRabbit')).toBe(range);
  });

  it.each([
    ['射程 - 1px', range - 1, true],
    ['射程ちょうど', range, true],
    ['射程 + 1px', range + 1, false],
  ])('%s の不正なコードを標的にするか: %s', (_name, dx, expected) => {
    expect(findItemTarget(item, [code(1, dx)])?.id ?? null).toBe(expected ? 1 : null);
  });

  it('縦方向でも射程ちょうどは範囲内、+1px は範囲外', () => {
    expect(findItemTarget(item, [code(1, 0, 'malicious', range)])?.id).toBe(1);
    expect(findItemTarget(item, [code(1, 0, 'malicious', range + 1)])).toBeNull();
  });

  it('距離 0 の不正なコードを標的にする', () => {
    expect(findItemTarget(item, [code(1, 0)])?.id).toBe(1);
  });

  it('射程内に正常なコードしかなければ null', () => {
    expect(findItemTarget(item, [code(1, 0, 'normal'), code(2, range - 1, 'normal'), code(3, range, 'normal')])).toBeNull();
  });

  it('正常なコードのほうが近くても不正なコードを選ぶ', () => {
    expect(findItemTarget(item, [code(1, 0, 'normal'), code(2, range)])?.id).toBe(2);
  });

  it('等距離の不正なコードが 2 つなら配列の先頭を選ぶ', () => {
    expect(findItemTarget(item, [code(1, range), code(2, -range)])?.id).toBe(1);
    expect(findItemTarget(item, [code(2, -range), code(1, range)])?.id).toBe(2);
  });
});

describe('CodeRabbit(#52): ルート脇に置いてルートを守る', () => {
  const price = getItemPrice('codeRabbit');
  // ルートは行 5（y=330）を通る（col 5〜最終列）。配置グリッドの col 28・行 18（中心 456,296、フットプリント y=278〜314）は
  // ルートの線のクリアランス（y≧322）に重ならないルート脇の位置。routeCell はそのすぐ下のルートのセル（60px）。
  const beside: GridCell = { col: 28, row: 18 };
  const routeCell: GridCell = { col: 7, row: 5 };
  const onRouteCell = pointToPlacementCell(cellCenter(routeCell));

  it('ルートの線上のセルは notPlaceable で、資金と配置配列は変わらない', () => {
    const input = state({ funds: price });
    expect(getRouteCells(route)).toContainEqual(routeCell);
    expect(purchaseItem(input, 'codeRabbit', onRouteCell, options)).toEqual({ ok: false, reason: 'notPlaceable' });
    expect(input.funds).toBe(price);
    expect(input.placedItems).toEqual([]);
  });

  it('ルート脇のセルには置け、隣のルートのセル中心が射程内に入る', () => {
    const result = purchaseItem(state({ funds: price }), 'codeRabbit', beside, options);
    if (!result.ok) throw new Error(`購入に失敗しました: ${result.reason}`);
    expect(result.item).toEqual({ id: 0, itemType: 'codeRabbit', cell: beside, lastAttackTime: null });
    expect(result.fundsAfter).toBe(0);
    expect(isTargetInItemRange('codeRabbit', placementCellCenter(result.item.cell), cellCenter(routeCell))).toBe(true);
    const onRoute = { id: 1, kind: 'malicious' as const, position: cellCenter(routeCell) };
    expect(findItemTarget(result.item, [onRoute])?.id).toBe(1);
  });
});

describe('purchaseItem: 置き方(#58)', () => {
  it.each(INSTANT_ITEM_TYPES)('置かないアイテム %s は purchaseItem では notPlaceable', (itemType) => {
    expect(purchaseItem(state(), itemType, free, options)).toEqual({ ok: false, reason: 'notPlaceable' });
  });

  it('ペアプロ相棒（主人公についてまわる）は既にアイテムがあるセル・ルート上でも買える', () => {
    const occupiedState = state({ placedItems: [placed(0, free)], nextId: 1 });
    const overItem = purchaseItem(occupiedState, 'pairProgrammer', free, options);
    expect(overItem.ok).toBe(true);
    expect(purchaseItem(state(), 'pairProgrammer', onRoute, options).ok).toBe(true);
  });

  it('ペアプロ相棒はセルを占有しない（同じセルに他のアイテムを置ける）', () => {
    const pair = placed(0, free, 'pairProgrammer');
    expect(isPlaceableCell(free, { routes, placedItems: [pair] })).toBe(true);
    expect(purchaseItem(state({ placedItems: [pair], nextId: 1 }), 'linter', free, options).ok).toBe(true);
  });

  it('ペアプロ相棒でもゲームオーバー・資金不足は判定する', () => {
    const price = getItemPrice('pairProgrammer');
    expect(purchaseItem(state({ gameOver: true }), 'pairProgrammer', free, options)).toEqual({
      ok: false,
      reason: 'gameOver',
    });
    expect(purchaseItem(state({ funds: price - 1 }), 'pairProgrammer', free, options)).toEqual({
      ok: false,
      reason: 'insufficientFunds',
    });
  });

  it('ラバーダック・コーヒーマシン・書き置きはセルに置く（置けない場所は notPlaceable）', () => {
    for (const itemType of ['rubberDuck', 'coffeeMachine', 'seniorNote'] as const) {
      expect(purchaseItem(state(), itemType, free, options).ok).toBe(true);
      expect(purchaseItem(state(), itemType, onRoute, options)).toEqual({ ok: false, reason: 'notPlaceable' });
    }
  });
});

describe('purchaseInstantItem: 置かないアイテム(#58)の購入', () => {
  const instantState = (overrides: Partial<InstantPurchaseState> = {}): InstantPurchaseState => ({
    funds: 1000000,
    gameOver: false,
    hasRollbackTarget: true,
    ...overrides,
  });

  it('置かないアイテムは8個', () => {
    expect(INSTANT_ITEM_TYPES).toEqual([
      'codeFreeze',
      'specChangeStorm',
      'energyDrink',
      'pizza',
      'documentation',
      'fridayDeploy',
      'rollbackButton',
      'worksFine',
    ]);
  });

  it.each(INSTANT_ITEM_TYPES)('%s: 価格-1 は資金不足、ちょうどは成功して資金 0', (itemType) => {
    const price = getItemPrice(itemType);
    expect(purchaseInstantItem(instantState({ funds: price - 1 }), itemType)).toEqual({
      ok: false,
      reason: 'insufficientFunds',
    });
    expect(purchaseInstantItem(instantState({ funds: price }), itemType)).toEqual({
      ok: true,
      itemType,
      fundsAfter: 0,
      price,
    });
  });

  it.each(CELL_ITEM_TYPES)('置くアイテム %s は notPlaceable', (itemType) => {
    expect(purchaseInstantItem(instantState(), itemType)).toEqual({ ok: false, reason: 'notPlaceable' });
  });

  it('ロールバックボタンは取り消せる障害がなければ noEligibleIncident、他のアイテムは障害の有無に関係ない', () => {
    expect(purchaseInstantItem(instantState({ hasRollbackTarget: false }), 'rollbackButton')).toEqual({
      ok: false,
      reason: 'noEligibleIncident',
    });
    expect(purchaseInstantItem(instantState({ hasRollbackTarget: false }), 'codeFreeze').ok).toBe(true);
  });

  it.each([
    ['ゲームオーバーかつ不明', instantState({ gameOver: true }), 'x', 'gameOver'],
    ['ゲームオーバーかつ対象なし', instantState({ gameOver: true, hasRollbackTarget: false }), 'rollbackButton', 'gameOver'],
    ['不明かつ資金不足', instantState({ funds: 0 }), 'x', 'unknownItem'],
    ['対象なしかつ資金不足', instantState({ funds: 0, hasRollbackTarget: false }), 'rollbackButton', 'noEligibleIncident'],
    ['資金不足', instantState({ funds: 0 }), 'pizza', 'insufficientFunds'],
  ] as const)('判定順: %s → %s', (_name, input, itemType, reason) => {
    expect(purchaseInstantItem(input, itemType)).toEqual({ ok: false, reason });
  });

  it('メッセージ: 成功は「〜を使いました」、対象なしは専用の文言', () => {
    const ok = purchaseInstantItem(instantState(), 'pizza');
    expect(formatItemMessage(ok, 'pizza')).toBe('Pizzaを使いました');
    expect(formatItemMessage({ ok: false, reason: 'noEligibleIncident' }, 'rollbackButton')).toBe(
      '取り消せる障害がありません',
    );
  });
});

describe('getItemAttackCooldownMs: アイテム別の攻撃間隔(#58)', () => {
  it('Linter は専用の間隔、それ以外は共通の間隔', () => {
    expect(getItemAttackCooldownMs('linter')).toBe(LINTER_ATTACK_COOLDOWN_MS);
    expect(LINTER_ATTACK_COOLDOWN_MS).toBeLessThan(ITEM_ATTACK_COOLDOWN_MS);
    expect(getItemAttackCooldownMs('codeRabbit')).toBe(ITEM_ATTACK_COOLDOWN_MS);
    expect(getItemAttackCooldownMs('pairProgrammer')).toBe(ITEM_ATTACK_COOLDOWN_MS);
  });
});

describe('findItemTarget: 攻撃の起点(#58)', () => {
  it('起点を渡すと、置いたセルではなく起点から最も近いコードを選ぶ', () => {
    const item = placed(0, { col: 2, row: 2 }, 'pairProgrammer');
    const origin = { x: 600, y: 300 };
    const near = { id: 1, kind: 'malicious' as const, position: { x: 610, y: 300 } };
    const nearCell = { id: 2, kind: 'malicious' as const, position: placementCellCenter(item.cell) };
    expect(findItemTarget(item, [nearCell, near], origin)?.id).toBe(1);
    expect(findItemTarget(item, [nearCell, near])?.id).toBe(2);
  });
});

describe('getItemOrigin: 攻撃・効果の起点(#58)', () => {
  const player = { x: 400, y: 300 };

  it('ペアプロ相棒は置いたセルではなく、主人公の位置 + ずれ', () => {
    const item: PlacedItem = { id: 0, itemType: 'pairProgrammer', cell: { col: 1, row: 1 }, lastAttackTime: null };
    expect(getItemOrigin(item, player)).toEqual({
      x: player.x + PAIR_PROGRAMMER_FOLLOW_OFFSET.x,
      y: player.y + PAIR_PROGRAMMER_FOLLOW_OFFSET.y,
    });
  });

  it('ついてまわらないアイテムは主人公の位置に関係なく置いたセル（配置グリッド #151）の中心', () => {
    const item: PlacedItem = { id: 0, itemType: 'linter', cell: { col: 1, row: 1 }, lastAttackTime: null };
    expect(getItemOrigin(item, player)).toEqual(placementCellCenter({ col: 1, row: 1 }));
    expect(getItemOrigin(item, player)).toEqual({ x: 24, y: 24 });
  });
});

describe('countItemsCovering: 点を範囲に含む台数(#58)', () => {
  const cell: GridCell = { col: 5, row: 5 };
  const center = placementCellCenter(cell);
  const coffeeRange = getItemRange('coffeeMachine');
  const coffee = (id: number, at: GridCell = cell): PlacedItem => ({
    id,
    itemType: 'coffeeMachine',
    cell: at,
    lastAttackTime: null,
  });

  it('範囲の境界ちょうどは数え、1px 外は数えない', () => {
    expect(countItemsCovering([coffee(0)], 'coffee', { x: center.x + coffeeRange, y: center.y })).toBe(1);
    expect(countItemsCovering([coffee(0)], 'coffee', { x: center.x + coffeeRange + 1, y: center.y })).toBe(0);
  });

  it('効果が違うアイテムは数えない', () => {
    const duck: PlacedItem = { id: 1, itemType: 'rubberDuck', cell, lastAttackTime: null };
    expect(countItemsCovering([coffee(0), duck], 'coffee', center)).toBe(1);
    expect(countItemsCovering([coffee(0), duck], 'reveal', center)).toBe(1);
  });

  it('複数台を数える', () => {
    expect(countItemsCovering([coffee(0), coffee(1, { col: 6, row: 5 })], 'coffee', center)).toBe(2);
  });
});

describe('shouldItemHesitate: Linter の見送り(#58)', () => {
  const origin = { x: 300, y: 300 };
  const range = getItemRange('linter');
  const normalInRange = { kind: 'normal' as const, position: { x: origin.x + range, y: origin.y } };
  const normalOutOfRange = { kind: 'normal' as const, position: { x: origin.x + range + 1, y: origin.y } };
  const maliciousInRange = { kind: 'malicious' as const, position: origin };
  const below = (): number => LINTER_HESITATION_PROBABILITY - 0.01;
  const at = (): number => LINTER_HESITATION_PROBABILITY;

  it('射程内に正常なコードがあり、乱数が確率未満なら見送る', () => {
    expect(shouldItemHesitate('linter', origin, [maliciousInRange, normalInRange], below)).toBe(true);
  });

  it('乱数が確率ちょうどなら見送らない', () => {
    expect(shouldItemHesitate('linter', origin, [maliciousInRange, normalInRange], at)).toBe(false);
  });

  it('射程内に正常なコードがなければ乱数を引かずに見送らない', () => {
    const random = (): number => {
      throw new Error('乱数を引いてはいけません');
    };
    expect(shouldItemHesitate('linter', origin, [maliciousInRange, normalOutOfRange], random)).toBe(false);
  });

  it('Linter 以外は見送らない', () => {
    expect(shouldItemHesitate('testTool', origin, [normalInRange], below)).toBe(false);
  });
});

describe('findCodesToReveal: ラバーダックで正体を暴く(#58)', () => {
  const cell: GridCell = { col: 5, row: 5 };
  const center = placementCellCenter(cell);
  const duck: PlacedItem = { id: 0, itemType: 'rubberDuck', cell, lastAttackTime: null };
  const range = getItemRange('rubberDuck');

  it('範囲内でまだ暴いていない不正なコードだけを返す（正常・暴いた済み・範囲外は除く）。入力は変更しない', () => {
    const codes = [
      { id: 1, kind: 'malicious' as const, position: center },
      { id: 2, kind: 'normal' as const, position: center },
      { id: 3, kind: 'malicious' as const, position: center, revealed: true },
      { id: 4, kind: 'malicious' as const, position: { x: center.x + range + 1, y: center.y } },
      { id: 5, kind: 'malicious' as const, position: { x: center.x + range, y: center.y } },
    ];
    const snapshot = structuredClone(codes);
    expect(findCodesToReveal([duck], codes).map((code) => code.id)).toEqual([1, 5]);
    expect(codes).toEqual(snapshot);
  });

  it('ラバーダックがなければ何も暴かない', () => {
    expect(findCodesToReveal([], [{ id: 1, kind: 'malicious' as const, position: center }])).toEqual([]);
  });
});

describe('isIncidentPreventedByNote: 書き置きで障害を防ぐ(#58)', () => {
  const range = getItemRange('seniorNote');

  it('リリース地点が書き置きの範囲内なら防ぐ', () => {
    const note: PlacedItem = { id: 0, itemType: 'seniorNote', cell: releaseCell, lastAttackTime: null };
    expect(isIncidentPreventedByNote([note])).toBe(true);
  });

  it('リリース地点が範囲外・書き置き以外のアイテムなら防がない', () => {
    const farCell: GridCell = { col: 0, row: 0 };
    const far = placementCellCenter(farCell);
    expect(Math.hypot(far.x - RELEASE_POINT_CENTER.x, far.y - RELEASE_POINT_CENTER.y)).toBeGreaterThan(range);
    expect(isIncidentPreventedByNote([{ id: 0, itemType: 'seniorNote', cell: farCell, lastAttackTime: null }])).toBe(
      false,
    );
    expect(isIncidentPreventedByNote([{ id: 0, itemType: 'rubberDuck', cell: releaseCell, lastAttackTime: null }])).toBe(
      false,
    );
  });
});

describe('アイテムの文言（英語 #158）', () => {
  beforeEach(() => {
    setLocale('en');
  });
  afterEach(() => {
    setLocale('ja');
  });

  it('成功・資金不足・置けない・不明', () => {
    expect(formatItemMessage(purchaseItem(state(), 'linter', free, options), 'linter')).toBe('Placed Linter');
    expect(formatItemMessage({ ok: false, reason: 'insufficientFunds' }, 'linter')).toBe('Not enough funds');
    expect(formatItemMessage({ ok: false, reason: 'notPlaceable' }, 'linter')).toBe("Can't place it there");
    expect(formatItemMessage({ ok: false, reason: 'unknownItem' }, 'foo')).toBe('Unknown item: foo');
  });

  it('メニューの枠は千円単位（1回払いは ¥…K、月額は ¥…K/mo）で、金額の計算は変えない', () => {
    expect(formatItemOption('linter')).toBe('Linter ¥12.5K');
    expect(formatItemOption('codeRabbit')).toBe('CodeRabbit ¥50K/mo');
    expect(formatItemOption('codeRabbit', 0.5)).toBe('CodeRabbit ¥25K/mo');
    expect(formatItemOption('codeRabbit', 0)).toBe('CodeRabbit ¥0K/mo');
    expect(formatItemOption('seniorNote')).toBe('Senior ¥50K');
  });
});

describe.each(SUPPORTED_LOCALES)('リリース地点のラベルの置けない矩形（%s #158）', (locale) => {
  beforeEach(() => {
    setLocale(locale);
  });
  afterEach(() => {
    setLocale('ja');
  });
  const noRoutes = { routes: [], placedItems: [] as PlacedItem[] };

  it('矩形はフィールドの内側に収まり、中心はリリース地点の中心の真上', () => {
    const bounds = getReleasePointLabelBounds();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(FIELD_WIDTH);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width / 2).toBeCloseTo(RELEASE_POINT_CENTER.x);
  });

  it('ラベルの矩形に重なる配置セルはすべて置けない', () => {
    const bounds = getReleasePointLabelBounds();
    const overlapping: { col: number; row: number }[] = [];
    for (let col = 0; col < PLACEMENT_COLS; col += 1) {
      for (let row = 0; row < PLACEMENT_ROWS; row += 1) {
        if (rectsOverlap(itemFootprint({ col, row }), bounds)) overlapping.push({ col, row });
      }
    }
    expect(overlapping.length).toBeGreaterThan(0);
    for (const cell of overlapping) expect(isPlaceableCell(cell, noRoutes)).toBe(false);
  });
});

describe('リリース地点のラベルの置けない矩形の値（英語 #158）', () => {
  beforeEach(() => {
    setLocale('en');
  });
  afterEach(() => {
    setLocale('ja');
  });

  it('「Release」の推定幅 58.8px（半角 7 文字 × 14px × 0.6）を中央に置く。高さ・y は日本語と同じ', () => {
    const bounds = getReleasePointLabelBounds();
    expect(bounds.width).toBeCloseTo(58.8);
    expect(bounds.x).toBeCloseTo(930 - 58.8 / 2);
    expect(bounds.y).toBe(224.5);
    expect(bounds.height).toBe(17.5);
    expect(isPlaceableCell({ col: 55, row: 14 }, noRoutesEn)).toBe(true); // 右端 x=896（ラベルの左端 900.6 まで 4.6px 空く）
    expect(isPlaceableCell({ col: 56, row: 14 }, noRoutesEn)).toBe(false); // 右端 x=912（ラベルに 11.4px 重なる）
    expect(isPlaceableCell({ col: 58, row: 13 }, noRoutesEn)).toBe(true); // 下端 y=224（ラベルの上端 224.5 まで 0.5px 空く）
  });
});
const noRoutesEn = { routes: [], placedItems: [] as PlacedItem[] };
