import { describe, expect, it } from 'vitest';
import {
  ENGINEER_SPAWN_CELLS,
  ITEM_ATTACK_COOLDOWN_MS,
  ITEM_RANGE_RATIOS,
  LINTER_ATTACK_COOLDOWN_MS,
  RELEASE_POINT_CELL,
} from './config';
import { CELL_SIZE, FIELD_COLS, FIELD_ROWS } from './field';
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
  createItemState,
  filterItemTargets,
  findItemTarget,
  findTargetFor,
  formatItemButton,
  formatItemMessage,
  getItemAttackCooldownMs,
  getItemPrice,
  getRouteCells,
  isPlaceableCell,
  pointToCell,
  purchaseInstantItem,
  purchaseItem,
} from './itemPlacement';
import type { InstantPurchaseState, PlacedItem, PurchaseState } from './itemPlacement';
import { cellCenter } from './route';
import type { GridCell, Route } from './route';

// 上端(0)・下端(最終行)は UI の行で置けない。ルートは行 3 を水平に通る単純なもの。
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
const free: GridCell = { col: 8, row: 2 };
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

describe('getItemPrice: 18アイテムの価格', () => {
  it.each([
    ['codeRabbit', 200000],
    ['linter', 50000],
    ['testTool', 100000],
    ['ci', 100000],
    ['securityScanner', 200000],
    ['pairProgrammer', 100000],
    ['cat', 50000],
    ['rubberDuck', 50000],
    ['codeFreeze', 100000],
    ['specChangeStorm', 100000],
    ['coffeeMachine', 50000],
    ['energyDrink', 50000],
    ['pizza', 50000],
    ['documentation', 100000],
    ['fridayDeploy', 50000],
    ['rollbackButton', 200000],
    ['worksFine', 50000],
    ['seniorNote', 200000],
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

describe('isPlaceableCell: 置ける場所', () => {
  const ctx = { routes, placedItems: [] as PlacedItem[] };
  const lastCol = FIELD_COLS - 1;
  const lastRow = FIELD_ROWS - 1;

  it.each([
    [{ col: 0, row: 2 }, true], // 左端の列（ルートでない）
    [{ col: lastCol, row: 1 }, true], // 右端の列
    [{ col: 8, row: 2 }, true],
    [{ col: 6, row: 1 }, false], // HUD と重なるセルの右端（行1）
    [{ col: 7, row: 1 }, true], // HUD の右隣（行1）
    [{ col: 6, row: 2 }, false], // HUD と重なるセルの右端（行2）
    [{ col: 7, row: 2 }, true], // HUD の右隣（行2）
    [{ col: 1, row: 3 }, false], // HUD の最下行（行3、技術的負債）の左端
    [{ col: 6, row: 3 }, false], // HUD と重なるセルの右端（行3）
    [{ col: 7, row: 3 }, true], // HUD の右隣（行3）
    [{ col: 1, row: 4 }, false], // 昇給・減給ボタン(#34)の左端（行4）
    [{ col: 6, row: 4 }, false], // 昇給・減給ボタン(#34)と重なるセルの右端（行4）
    [{ col: 7, row: 4 }, true], // 昇給・減給ボタン(#34)の右隣（行4）
    [{ col: 1, row: 1 }, false], // HUD の左端
    [{ col: 0, row: 1 }, true], // 出現列（ルートが無ければ置ける）
    [{ col: 3, row: lastRow - 1 }, true], // UI の行の1つ内側
    [{ col: 3, row: 0 }, false], // 上端 UI 行
    [{ col: 3, row: lastRow }, false], // 下端 UI 行
    [{ col: -1, row: 1 }, false],
    [{ col: FIELD_COLS, row: 1 }, false],
    [{ col: 3, row: -1 }, false],
    [{ col: 3, row: FIELD_ROWS }, false],
    [{ col: 1.5, row: 1 }, false],
  ])('%j → %s', (cell, expected) => {
    expect(isPlaceableCell(cell, ctx)).toBe(expected);
  });

  it('ルート上のセルは不可、その隣は可', () => {
    expect(isPlaceableCell({ col: 3, row: 3 }, ctx)).toBe(false);
    expect(isPlaceableCell({ col: 3, row: 2 }, ctx)).toBe(false); // 隣だが HUD と重なる
    expect(isPlaceableCell({ col: 3, row: 4 }, ctx)).toBe(false); // 隣だが昇給・減給ボタン(#34)と重なる
    expect(isPlaceableCell({ col: 5, row: 4 }, ctx)).toBe(false);
    expect(isPlaceableCell({ col: 6, row: 4 }, ctx)).toBe(false); // 隣だが昇給・減給ボタン(#34)と重なる
    expect(isPlaceableCell({ col: 5, row: 6 }, ctx)).toBe(true);
    expect(isPlaceableCell({ col: 7, row: 4 }, ctx)).toBe(true);
  });

  it('出現セルは不可、その隣は可', () => {
    expect(isPlaceableCell(route.spawn, ctx)).toBe(false);
    expect(isPlaceableCell({ col: 0, row: 2 }, ctx)).toBe(true);
    // 他の初期出現セルもルートが無ければ置けるが、ルートがあれば不可
    const spawn = ENGINEER_SPAWN_CELLS[0];
    const spawnRoute: Route = { id: 1, spawn, waypoints: [spawn] };
    expect(isPlaceableCell(spawn, { routes: [spawnRoute], placedItems: [] })).toBe(false);
  });

  it('リリース地点は不可（ルートが無くても）、その隣は可', () => {
    expect(isPlaceableCell(RELEASE_POINT_CELL, { routes: [], placedItems: [] })).toBe(false);
    expect(
      isPlaceableCell({ col: RELEASE_POINT_CELL.col - 1, row: RELEASE_POINT_CELL.row - 1 }, ctx),
    ).toBe(true);
  });

  it('既にアイテムがあるセルは不可、隣は可', () => {
    const withItem = { routes, placedItems: [placed(0, free)] };
    expect(isPlaceableCell(free, withItem)).toBe(false);
    expect(isPlaceableCell({ col: free.col + 1, row: free.row }, withItem)).toBe(true);
  });

  it('blockedRows / blockedCells を引数で差し替えられる', () => {
    expect(isPlaceableCell({ col: 8, row: 1 }, { ...ctx, blockedRows: [1] })).toBe(false);
    expect(isPlaceableCell({ col: 3, row: 0 }, { ...ctx, blockedRows: [] })).toBe(true);
    expect(isPlaceableCell({ col: 3, row: 1 }, { ...ctx, blockedCells: [] })).toBe(true);
    expect(isPlaceableCell({ col: 8, row: 1 }, { ...ctx, blockedCells: [{ col: 8, row: 1 }] })).toBe(false);
  });
});

describe('isPlaceableCell: HUD の下', () => {
  it('行3 col1 は HUD（技術的負債の行）と重なるため置けない', () => {
    expect(isPlaceableCell({ col: 1, row: 3 }, { routes: [], placedItems: [] })).toBe(false);
  });

  // 行3〜4 は昇給・減給の情報行・ボタン(#34)と重なるため置けない。その下の行5から置ける。
  it.each([3, 4])('行%i col1〜6 は置けず、col7 は置ける（ルートが無いとき）', (row) => {
    for (let col = 1; col <= 6; col += 1) {
      expect(isPlaceableCell({ col, row }, { routes: [], placedItems: [] })).toBe(false);
    }
    expect(isPlaceableCell({ col: 7, row }, { routes: [], placedItems: [] })).toBe(true);
  });

  it('行4 col1 は昇給・減給ボタン(#34)と重なるため置けない', () => {
    expect(isPlaceableCell({ col: 1, row: 4 }, { routes: [], placedItems: [] })).toBe(false);
  });

  it('行5 col1〜6 は（ルートが無ければ）置ける', () => {
    for (let col = 1; col <= 6; col += 1) {
      expect(isPlaceableCell({ col, row: 5 }, { routes: [], placedItems: [] })).toBe(true);
    }
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

  it('隣のセルには置ける', () => {
    const placedFirst = placed(0, free);
    const result = purchaseItem(
      state({ placedItems: [placedFirst], nextId: 1 }),
      'ci',
      { col: free.col + 1, row: free.row },
      options,
    );
    expect(result.ok).toBe(true);
  });

  it.each([
    ['ルート上', { col: 3, row: 3 }],
    ['出現セル', route.spawn],
    ['リリース地点', RELEASE_POINT_CELL],
    ['UI 行（上）', { col: 3, row: 0 }],
    ['HUD と重なるセル', { col: 3, row: 1 }],
    ['UI 行（下）', { col: 3, row: FIELD_ROWS - 1 }],
    ['範囲外', { col: -1, row: 1 }],
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
    for (let col = 1; col <= 3; col++) {
      const result = purchaseItem(current, 'linter', { col, row: 6 }, options);
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

describe('formatItemMessage / formatItemButton', () => {
  it('成功・資金不足・置けない・既にある', () => {
    const ok = purchaseItem(state(), 'linter', free, options);
    expect(formatItemMessage(ok, 'linter')).toBe('Linterを置きました');
    expect(formatItemMessage({ ok: false, reason: 'insufficientFunds' }, 'linter')).toBe('資金が足りません');
    expect(formatItemMessage({ ok: false, reason: 'notPlaceable' }, 'linter')).toBe('そこには置けません');
    expect(formatItemMessage({ ok: false, reason: 'occupied' }, 'linter')).toBe('そこには置けません');
  });

  it('ボタンはページ内の枠番号 + 4 を表示する（#58）', () => {
    expect(formatItemButton(1, 'linter')).toBe('[5] Linter 5万円');
    expect(formatItemButton(0, 'codeRabbit')).toBe('[4] CodeRabbit 20万/月');
    expect(formatItemButton(4, 'securityScanner')).toBe('[8] Scanner 20万/月');
    expect(formatItemButton(0, 'cat')).toBe('[4] Cat 5万円');
    expect(formatItemButton(5, 'seniorNote')).toBe('[9] Senior 20万円');
  });

  it('ページごとのボタンのキー表示は 4〜9（#58。6個ずつ3ページ）', () => {
    const pages = [ITEM_TYPES.slice(0, 6), ITEM_TYPES.slice(6, 12), ITEM_TYPES.slice(12, 18)];
    expect(pages.map((page) => page.map((itemType, slot) => formatItemButton(slot, itemType)))).toEqual([
      [
        '[4] CodeRabbit 20万/月',
        '[5] Linter 5万円',
        '[6] Test 10万円',
        '[7] CI 10万/月',
        '[8] Scanner 20万/月',
        '[9] Pair 10万/月',
      ],
      ['[4] Cat 5万円', '[5] Duck 5万円', '[6] Freeze 10万円', '[7] SpecStorm 10万円', '[8] Coffee 5万円', '[9] Energy 5万円'],
      ['[4] Pizza 5万円', '[5] Docs 10万円', '[6] FriDeploy 5万円', '[7] Rollback 20万円', '[8] Yoshi! 5万円', '[9] Senior 20万円'],
    ]);
  });

  it('キー表示のない枠番号（6）は例外にする', () => {
    expect(() => formatItemButton(6, 'cat')).toThrow();
  });

  it('月額の表示は精算と同じ倍率を使う（1回払いは倍率に関係なく購入価格）', () => {
    expect(formatItemButton(0, 'codeRabbit', 0.5)).toBe('[4] CodeRabbit 10万/月');
    expect(formatItemButton(0, 'codeRabbit', 0)).toBe('[4] CodeRabbit 0万/月');
    expect(formatItemButton(1, 'linter', 0.5)).toBe('[5] Linter 5万円');
  });
});

describe('findItemTarget: 範囲内で最も近い不正なコード', () => {
  const item = placed(0, { col: 5, row: 2 }, 'linter');
  const center = cellCenter(item.cell);
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
  const center = cellCenter(item.cell);
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
  // ルートは行 5 を通る（col 5〜最終列）。col 7・行 4 は HUD・昇給減給ボタンと重ならないルート隣接セル。
  const beside: GridCell = { col: 7, row: 4 };
  const routeCell: GridCell = { col: 7, row: 5 };

  it('ルート上のセルは notPlaceable で、資金と配置配列は変わらない', () => {
    const input = state({ funds: price });
    expect(getRouteCells(route)).toContainEqual(routeCell);
    expect(purchaseItem(input, 'codeRabbit', routeCell, options)).toEqual({ ok: false, reason: 'notPlaceable' });
    expect(input.funds).toBe(price);
    expect(input.placedItems).toEqual([]);
  });

  it('HUD と重ならないルート隣接セルには置け、隣のルートのセル中心が射程内に入る', () => {
    const result = purchaseItem(state({ funds: price }), 'codeRabbit', beside, options);
    if (!result.ok) throw new Error(`購入に失敗しました: ${result.reason}`);
    expect(result.item).toEqual({ id: 0, itemType: 'codeRabbit', cell: beside, lastAttackTime: null });
    expect(result.fundsAfter).toBe(0);
    expect(isTargetInItemRange('codeRabbit', cellCenter(result.item.cell), cellCenter(routeCell))).toBe(true);
    const onRoute = { id: 1, kind: 'malicious' as const, position: cellCenter(routeCell) };
    expect(findItemTarget(result.item, [onRoute])?.id).toBe(1);
  });
});

describe('purchaseItem: 置き方(#58)', () => {
  it.each(INSTANT_ITEM_TYPES)('置かないアイテム %s は purchaseItem では notPlaceable', (itemType) => {
    expect(purchaseItem(state(), itemType, free, options)).toEqual({ ok: false, reason: 'notPlaceable' });
  });

  it('ペアプロ相棒（主人公についてまわる）は既にアイテムがあるセル・ルート上でも買える', () => {
    const onRoute: GridCell = { col: 3, row: 3 };
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
      expect(purchaseItem(state(), itemType, { col: 3, row: 3 }, options)).toEqual({ ok: false, reason: 'notPlaceable' });
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
    const nearCell = { id: 2, kind: 'malicious' as const, position: cellCenter(item.cell) };
    expect(findItemTarget(item, [nearCell, near], origin)?.id).toBe(1);
    expect(findItemTarget(item, [nearCell, near])?.id).toBe(2);
  });
});
