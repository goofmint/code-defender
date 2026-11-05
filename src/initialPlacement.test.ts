import { describe, expect, it } from 'vitest';
import {
  INITIAL_PLACEMENT_BLOCKED_CELLS,
  INITIAL_PLACEMENT_PANEL_LINES,
  ITEM_BLOCKED_CELLS,
  ITEM_BLOCKED_ROWS,
  ITEM_PRICE_TIER_BY_TYPE,
  ITEM_SHORT_NAMES,
  RELEASE_POINT_CELL,
  STAGE_POINT_COST_BY_TIER,
  STAGE_POINTS_INITIAL,
} from './config';
import { FIELD_COLS, FIELD_ROWS } from './field';
import { ITEM_TYPES } from './item';
import type { ItemType } from './item';
import {
  createInitialPlacementState,
  finishInitialPlacement,
  formatInitialPlacementMessage,
  formatInitialPlacementPanel,
  getStagePointCost,
  placeInitialItem,
  removeInitialItem,
} from './initialPlacement';
import type { InitialPlacementState } from './initialPlacement';
import { purchaseItem } from './itemPlacement';
import type { GridCell, Route } from './route';

// itemPlacement.test.ts と同じ単純なルート。行3を水平に通り、col 5 で行5へ曲がってリリース地点へ向かう。
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
const context = { routes: [route] };
const free: GridCell = { col: 8, row: 2 };
const linterCost = STAGE_POINT_COST_BY_TIER[ITEM_PRICE_TIER_BY_TYPE.linter];

// 置けたことを確かめて結果の状態を返す（テスト用）。
const placeOrThrow = (
  state: InitialPlacementState,
  itemType: ItemType,
  cell: GridCell,
): InitialPlacementState => {
  const result = placeInitialItem(state, itemType, cell, context);
  if (!result.ok) throw new Error(`置けませんでした: ${result.reason}`);
  return result.state;
};

describe('createInitialPlacementState: 初期状態', () => {
  it('既定は STAGE_POINTS_INITIAL・配置なし・id 0', () => {
    expect(createInitialPlacementState()).toEqual({
      points: STAGE_POINTS_INITIAL,
      itemState: { placedItems: [], nextId: 0 },
    });
  });

  it('ポイントを指定できる（0 も可）', () => {
    expect(createInitialPlacementState(0).points).toBe(0);
  });

  it('呼ぶたびに独立した状態を返す', () => {
    const a = createInitialPlacementState();
    const b = createInitialPlacementState();
    expect(a).not.toBe(b);
    expect(a.itemState).not.toBe(b.itemState);
  });
});

describe('getStagePointCost: 価格の段階からの換算', () => {
  it.each(ITEM_TYPES.map((itemType) => [itemType, STAGE_POINT_COST_BY_TIER[ITEM_PRICE_TIER_BY_TYPE[itemType]]] as const))(
    '%s は %i ポイント',
    (itemType, cost) => {
      expect(getStagePointCost(itemType)).toBe(cost);
    },
  );

  it('段階の順（安い < 普通 < 高い）を保つ', () => {
    expect(STAGE_POINT_COST_BY_TIER.cheap).toBeLessThan(STAGE_POINT_COST_BY_TIER.normal);
    expect(STAGE_POINT_COST_BY_TIER.normal).toBeLessThan(STAGE_POINT_COST_BY_TIER.expensive);
  });

  it('コスト表を差し替えられる', () => {
    const table = { cheap: 10, normal: 20, expensive: 30 };
    expect(getStagePointCost('linter', table)).toBe(10);
    expect(getStagePointCost('testTool', table)).toBe(20);
    expect(getStagePointCost('codeRabbit', table)).toBe(30);
  });
});

describe('placeInitialItem: ポイントの境界値', () => {
  it.each(ITEM_TYPES)('%s: コスト−1 は insufficientPoints、ちょうどは残り 0、+1 は残り 1', (itemType) => {
    const cost = getStagePointCost(itemType);
    expect(placeInitialItem(createInitialPlacementState(cost - 1), itemType, free, context)).toEqual({
      ok: false,
      reason: 'insufficientPoints',
    });
    const exact = placeInitialItem(createInitialPlacementState(cost), itemType, free, context);
    expect(exact.ok && exact.state.points).toBe(0);
    expect(exact.ok && exact.cost).toBe(cost);
    const plusOne = placeInitialItem(createInitialPlacementState(cost + 1), itemType, free, context);
    expect(plusOne.ok && plusOne.state.points).toBe(1);
  });

  it('ポイント 0 ではどのアイテムも置けない', () => {
    ITEM_TYPES.forEach((itemType) => {
      expect(placeInitialItem(createInitialPlacementState(0), itemType, free, context)).toEqual({
        ok: false,
        reason: 'insufficientPoints',
      });
    });
  });

  it('差し替えたコスト表で判定する', () => {
    const costTable = { cheap: 5, normal: 5, expensive: 5 };
    expect(placeInitialItem(createInitialPlacementState(4), 'linter', free, { ...context, costTable })).toEqual({
      ok: false,
      reason: 'insufficientPoints',
    });
    const result = placeInitialItem(createInitialPlacementState(5), 'linter', free, { ...context, costTable });
    expect(result.ok && result.state.points).toBe(0);
  });

  it('初期ポイントを使い切るまで置け、使い切ると置けない', () => {
    let state = createInitialPlacementState();
    const count = Math.floor(STAGE_POINTS_INITIAL / linterCost);
    for (let i = 0; i < count; i++) {
      state = placeOrThrow(state, 'linter', { col: 7 + (i % 7), row: 1 + Math.floor(i / 7) });
    }
    expect(state.points).toBe(STAGE_POINTS_INITIAL - count * linterCost);
    expect(placeInitialItem(state, 'linter', { col: 7, row: 7 }, context)).toEqual({
      ok: false,
      reason: 'insufficientPoints',
    });
  });
});

describe('placeInitialItem: 置けるセルの境界値', () => {
  const big = createInitialPlacementState(1000);
  const reasonAt = (cell: GridCell): string => {
    const result = placeInitialItem(big, 'linter', cell, context);
    return result.ok ? 'ok' : result.reason;
  };

  it('フィールド内の端（col 0・最終列、行1・最終行の1つ上）は置ける（ルート外なら）', () => {
    expect(reasonAt({ col: 0, row: 6 })).toBe('ok');
    expect(reasonAt({ col: FIELD_COLS - 1, row: 1 })).toBe('ok');
    expect(reasonAt({ col: 10, row: 1 })).toBe('ok');
    expect(reasonAt({ col: 10, row: FIELD_ROWS - 2 })).toBe('ok');
  });

  it('範囲外（負・列数・行数ちょうど）は notPlaceable', () => {
    [
      { col: -1, row: 6 },
      { col: FIELD_COLS, row: 6 },
      { col: 8, row: -1 },
      { col: 8, row: FIELD_ROWS },
    ].forEach((cell) => expect(reasonAt(cell)).toBe('notPlaceable'));
  });

  it('小数のセルは notPlaceable', () => {
    expect(reasonAt({ col: 8.5, row: 2 })).toBe('notPlaceable');
    expect(reasonAt({ col: 8, row: 2.5 })).toBe('notPlaceable');
  });

  it('置けない行（ITEM_BLOCKED_ROWS）は notPlaceable、隣の行は置ける', () => {
    ITEM_BLOCKED_ROWS.forEach((row) => expect(reasonAt({ col: 8, row })).toBe('notPlaceable'));
    expect(reasonAt({ col: 8, row: 1 })).toBe('ok');
    expect(reasonAt({ col: 8, row: FIELD_ROWS - 2 })).toBe('ok');
  });

  it('ルート上・出現セル・リリース地点は notPlaceable、その隣は置ける', () => {
    expect(reasonAt({ col: 3, row: 3 })).toBe('notPlaceable');
    expect(reasonAt({ col: 8, row: 5 })).toBe('notPlaceable');
    expect(reasonAt(route.spawn)).toBe('notPlaceable');
    expect(reasonAt(RELEASE_POINT_CELL)).toBe('notPlaceable');
    expect(reasonAt({ col: 8, row: 6 })).toBe('ok');
    expect(reasonAt({ col: 0, row: 2 })).toBe('ok');
    expect(reasonAt({ col: RELEASE_POINT_CELL.col - 1, row: RELEASE_POINT_CELL.row })).toBe('ok');
  });

  it('HUD のセル（ITEM_BLOCKED_CELLS）は notPlaceable、その右隣の列は置ける', () => {
    ITEM_BLOCKED_CELLS.forEach((cell) => expect(reasonAt(cell)).toBe('notPlaceable'));
    const maxCol = Math.max(...ITEM_BLOCKED_CELLS.map((cell) => cell.col));
    expect(reasonAt({ col: maxCol + 1, row: 1 })).toBe('ok');
  });

  it('blockedCells に初期配置UIのセルを足すと、そのセルは notPlaceable、左隣と下隣は置ける', () => {
    const setupContext = { ...context, blockedCells: [...ITEM_BLOCKED_CELLS, ...INITIAL_PLACEMENT_BLOCKED_CELLS] };
    const reasonInSetup = (cell: GridCell): string => {
      const result = placeInitialItem(big, 'linter', cell, setupContext);
      return result.ok ? 'ok' : result.reason;
    };
    INITIAL_PLACEMENT_BLOCKED_CELLS.forEach((cell) => expect(reasonInSetup(cell)).toBe('notPlaceable'));
    const minCol = Math.min(...INITIAL_PLACEMENT_BLOCKED_CELLS.map((cell) => cell.col));
    const maxRow = Math.max(...INITIAL_PLACEMENT_BLOCKED_CELLS.map((cell) => cell.row));
    expect(reasonInSetup({ col: minCol - 1, row: 1 })).toBe('ok');
    expect(reasonInSetup({ col: minCol, row: maxRow + 1 })).toBe('ok');
  });
});

describe('placeInitialItem: 占有と判定順', () => {
  it('置いたセルに2個目は occupied、隣は置ける', () => {
    const state = placeOrThrow(createInitialPlacementState(), 'linter', free);
    expect(placeInitialItem(state, 'testTool', free, context)).toEqual({ ok: false, reason: 'occupied' });
    expect(placeInitialItem(state, 'linter', { col: free.col + 1, row: free.row }, context).ok).toBe(true);
  });

  it('判定順: 不明なアイテム → 置けない場所 → 既にある → ポイント不足', () => {
    const occupied = placeOrThrow(createInitialPlacementState(linterCost), 'linter', free);
    // occupied.points は 0。すべての条件が重なっても先の理由が出る。
    expect(placeInitialItem(occupied, 'unknown', { col: -1, row: 0 }, context)).toEqual({
      ok: false,
      reason: 'unknownItem',
    });
    expect(placeInitialItem(occupied, 'linter', { col: -1, row: 0 }, context)).toEqual({
      ok: false,
      reason: 'notPlaceable',
    });
    expect(placeInitialItem(occupied, 'linter', free, context)).toEqual({ ok: false, reason: 'occupied' });
    expect(placeInitialItem(occupied, 'linter', { col: 9, row: 2 }, context)).toEqual({
      ok: false,
      reason: 'insufficientPoints',
    });
  });
});

describe('placeInitialItem: 成功時の結果と入力の不変性', () => {
  it('id は nextId から連番、lastAttackTime は null、新しい配列を返す', () => {
    const initial = createInitialPlacementState();
    const first = placeInitialItem(initial, 'linter', free, context);
    expect(first.ok && first.item).toEqual({ id: 0, itemType: 'linter', cell: free, lastAttackTime: null });
    if (!first.ok) throw new Error('置けませんでした');
    expect(first.state.itemState.nextId).toBe(1);
    expect(initial.itemState.placedItems).toEqual([]);
    expect(first.state.itemState.placedItems).not.toBe(initial.itemState.placedItems);
    const second = placeInitialItem(first.state, 'cat', { col: 9, row: 2 }, context);
    expect(second.ok && second.item.id).toBe(1);
  });

  it('失敗したときは入力を変更しない', () => {
    const state = placeOrThrow(createInitialPlacementState(linterCost), 'linter', free);
    const snapshot = structuredClone(state);
    placeInitialItem(state, 'unknown', free, context);
    placeInitialItem(state, 'linter', { col: -1, row: 0 }, context);
    placeInitialItem(state, 'linter', free, context);
    placeInitialItem(state, 'linter', { col: 9, row: 2 }, context);
    removeInitialItem(state, { col: 9, row: 2 });
    expect(state).toEqual(snapshot);
  });
});

describe('removeInitialItem: 撤去と全額返却', () => {
  it.each(ITEM_TYPES)('%s を撤去するとコストを全額返し、配置前のポイントに戻る', (itemType) => {
    const before = createInitialPlacementState(10);
    const placed = placeOrThrow(before, itemType, free);
    const removal = removeInitialItem(placed, free);
    expect(removal.ok && removal.refund).toBe(getStagePointCost(itemType));
    expect(removal.ok && removal.state.points).toBe(before.points);
    expect(removal.ok && removal.state.itemState.placedItems).toEqual([]);
  });

  it('空のセルは notFound で入力を変更しない', () => {
    const state = placeOrThrow(createInitialPlacementState(), 'linter', free);
    expect(removeInitialItem(state, { col: 9, row: 2 })).toEqual({ ok: false, reason: 'notFound' });
    expect(state.itemState.placedItems).toHaveLength(1);
  });

  it('撤去したセルに置き直せる。id は再利用せず続きの番号になる', () => {
    const placed = placeOrThrow(createInitialPlacementState(), 'linter', free);
    const removal = removeInitialItem(placed, free);
    if (!removal.ok) throw new Error('撤去できませんでした');
    expect(removal.state.itemState.nextId).toBe(1);
    const again = placeInitialItem(removal.state, 'testTool', free, context);
    expect(again.ok && again.item.id).toBe(1);
  });

  it('差し替えたコスト表で返却する', () => {
    const placed = placeOrThrow(createInitialPlacementState(), 'linter', free);
    const removal = removeInitialItem(placed, free, { cheap: 7, normal: 8, expensive: 9 });
    expect(removal.ok && removal.refund).toBe(7);
  });
});

describe('finishInitialPlacement: プレイへの引き継ぎ', () => {
  it('配置と nextId を引き継ぎ、残ポイントは破棄する', () => {
    const state = placeOrThrow(createInitialPlacementState(), 'linter', free);
    const itemState = finishInitialPlacement(state);
    expect(itemState).toEqual({ placedItems: state.itemState.placedItems, nextId: 1 });
    expect(itemState).not.toHaveProperty('points');
  });

  it('配置ゼロでも開始でき、空の配置と id 0 を返す', () => {
    expect(finishInitialPlacement(createInitialPlacementState())).toEqual({ placedItems: [], nextId: 0 });
  });

  it('引き継いだ後の purchaseItem は id の続きの番号で置き、初期配置のセルには occupied', () => {
    const afterFirst = placeOrThrow(createInitialPlacementState(), 'linter', free);
    const afterSecond = placeOrThrow(afterFirst, 'testTool', { col: 9, row: 2 });
    const itemState = finishInitialPlacement(afterSecond);
    const purchaseState = { funds: 1000000, placedItems: itemState.placedItems, nextId: itemState.nextId, gameOver: false };
    const bought = purchaseItem(purchaseState, 'ci', { col: 10, row: 2 }, context);
    expect(bought.ok && bought.item.id).toBe(2);
    expect(purchaseItem(purchaseState, 'ci', free, context)).toEqual({ ok: false, reason: 'occupied' });
  });
});

describe('formatInitialPlacementMessage / formatInitialPlacementPanel', () => {
  it('置いた・撤去した・ポイント不足・置けない・既にある・空のセル・不明', () => {
    const state = createInitialPlacementState();
    const placed = placeInitialItem(state, 'linter', free, context);
    expect(formatInitialPlacementMessage(placed, 'linter')).toBe(`${ITEM_SHORT_NAMES.linter}を置きました`);
    if (!placed.ok) throw new Error('置けませんでした');
    expect(formatInitialPlacementMessage(removeInitialItem(placed.state, free), 'linter')).toBe(
      `${ITEM_SHORT_NAMES.linter}を撤去しました`,
    );
    expect(formatInitialPlacementMessage({ ok: false, reason: 'insufficientPoints' }, 'linter')).toBe(
      'ステージポイントが足りません',
    );
    expect(formatInitialPlacementMessage({ ok: false, reason: 'notPlaceable' }, 'linter')).toBe('そこには置けません');
    expect(formatInitialPlacementMessage({ ok: false, reason: 'occupied' }, 'linter')).toBe('そこには置けません');
    expect(formatInitialPlacementMessage({ ok: false, reason: 'notFound' }, 'linter')).toBe(
      'そこにはアイテムがありません',
    );
    expect(formatInitialPlacementMessage({ ok: false, reason: 'unknownItem' }, 'foo')).toBe('不明なアイテムです: foo');
  });

  it('パネルは INITIAL_PLACEMENT_PANEL_LINES 行で、残ポイントと選択中のアイテム・コストを出す', () => {
    const lines = formatInitialPlacementPanel(STAGE_POINTS_INITIAL, 'linter');
    expect(lines).toHaveLength(INITIAL_PLACEMENT_PANEL_LINES);
    expect(lines[0]).toContain(`${STAGE_POINTS_INITIAL}pt`);
    expect(lines[1]).toBe(`選択: ${ITEM_SHORT_NAMES.linter} ${linterCost}pt`);
    expect(formatInitialPlacementPanel(0, 'cat')[0]).toContain('0pt');
  });
});
