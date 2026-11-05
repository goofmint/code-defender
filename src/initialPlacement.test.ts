import { describe, expect, it } from 'vitest';
import {
  INITIAL_PLACEMENT_PANEL_LINES,
  INITIAL_PLACEMENT_UI_BOUNDS,
  ITEM_BLOCKED_RECTS,
  ITEM_PRICE_TIER_BY_TYPE,
  ITEM_SHORT_NAMES,
  PLACEMENT_COLS,
  PLACEMENT_ROWS,
  STAGE_POINT_COST_BY_TIER,
  STAGE_POINTS_INITIAL,
} from './config';
import { FIELD_COLS } from './field';
import { getItemPlacement, ITEM_TYPES } from './item';
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
import { itemFootprint, placementCellCenter, pointToPlacementCell, purchaseItem } from './itemPlacement';
import { RELEASE_POINT_CENTER } from './releasePoint';
import { cellCenter } from './route';
import type { GridCell, Route } from './route';

// itemPlacement.test.ts と同じ単純なルート。行3（y=210）を水平に通り、col 5 で行5（y=330）へ曲がってリリース地点へ向かう。
// セルは配置グリッド（16px #151）の座標。
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
// 置けるセル。中心 (488, 136)・フットプリント x=470〜506 / y=118〜154 で、HUD（x≦416）・ルート（y≧202）・上帯（y<60）に重ならない。
const free: GridCell = { col: 30, row: 8 };
// free の 3 セル右（x=518〜554。フットプリントは 12px 空く）と、さらに 3 セル右。
const besideFree: GridCell = { col: free.col + 3, row: free.row };
const farFromFree: GridCell = { col: free.col + 6, row: free.row };
// ルートの線上（行3の線 y=210 の上、中心 y=216）・出現場所・リリース地点を含むセル。
const onRoute: GridCell = { col: 20, row: 13 };
const spawnCell = pointToPlacementCell(cellCenter(route.spawn));
const releaseCell = pointToPlacementCell(RELEASE_POINT_CENTER);
const linterCost = STAGE_POINT_COST_BY_TIER[ITEM_PRICE_TIER_BY_TYPE.linter];
// 初期配置で置けるのはセルに置くアイテム（placement: cell）だけ。置かないアイテム（placement: none #58）は notPlaceable。
const CELL_ITEM_TYPES = ITEM_TYPES.filter((itemType) => getItemPlacement(itemType) === 'cell');
const NONE_ITEM_TYPES = ITEM_TYPES.filter((itemType) => getItemPlacement(itemType) === 'none');

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
  it.each(CELL_ITEM_TYPES)('%s: コスト−1 は insufficientPoints、ちょうどは残り 0、+1 は残り 1', (itemType) => {
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
    CELL_ITEM_TYPES.forEach((itemType) => {
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
    // フットプリント（36px）が重ならないよう 3 セル（48px）ずつ右へずらす。
    for (let i = 0; i < count; i++) {
      state = placeOrThrow(state, 'linter', { col: free.col + 3 * i, row: free.row });
    }
    expect(state.points).toBe(STAGE_POINTS_INITIAL - count * linterCost);
    expect(placeInitialItem(state, 'linter', { col: free.col, row: 24 }, context)).toEqual({
      ok: false,
      reason: 'insufficientPoints',
    });
  });
});

describe('placeInitialItem: 置けるセルの境界値（配置グリッド #151）', () => {
  const big = createInitialPlacementState(1000);
  const reasonAt = (cell: GridCell): string => {
    const result = placeInitialItem(big, 'linter', cell, context);
    return result.ok ? 'ok' : result.reason;
  };

  it('フットプリントがフィールドに収まる端のセルは置け、はみ出すセルは notPlaceable', () => {
    expect(reasonAt({ col: 1, row: 20 })).toBe('ok'); // x=6〜42
    expect(reasonAt({ col: 0, row: 20 })).toBe('notPlaceable'); // x=-2〜34
    expect(reasonAt({ col: 58, row: 8 })).toBe('ok'); // x=910〜946
    expect(reasonAt({ col: PLACEMENT_COLS - 1, row: 8 })).toBe('notPlaceable'); // x=926〜962
    expect(reasonAt({ col: 27, row: 5 })).toBe('ok'); // y=70〜106（上帯の直下）
    expect(reasonAt({ col: 27, row: 28 })).toBe('ok'); // y=438〜474（下帯の直上）
    expect(reasonAt({ col: 27, row: PLACEMENT_ROWS - 1 })).toBe('notPlaceable'); // y=518〜554
  });

  it('範囲外（負・列数・行数ちょうど）は notPlaceable', () => {
    [
      { col: -1, row: 20 },
      { col: PLACEMENT_COLS, row: 20 },
      { col: 30, row: -1 },
      { col: 30, row: PLACEMENT_ROWS },
    ].forEach((cell) => expect(reasonAt(cell)).toBe('notPlaceable'));
  });

  it('小数のセルは notPlaceable', () => {
    expect(reasonAt({ col: 30.5, row: 8 })).toBe('notPlaceable');
    expect(reasonAt({ col: 30, row: 8.5 })).toBe('notPlaceable');
  });

  it('上帯（y<60）・下帯（y≧480）に 1px でも重なると notPlaceable、接するだけなら置ける', () => {
    expect(reasonAt({ col: 27, row: 4 })).toBe('notPlaceable'); // y=54〜90
    expect(reasonAt({ col: 27, row: 5 })).toBe('ok'); // y=70〜106
    expect(reasonAt({ col: 27, row: 29 })).toBe('notPlaceable'); // y=454〜490
    expect(reasonAt({ col: 27, row: 28 })).toBe('ok'); // y=438〜474
  });

  it('ルートの線・出現場所・リリース地点に重なると notPlaceable、クリアランスの外は置ける', () => {
    expect(reasonAt(onRoute)).toBe('notPlaceable');
    expect(reasonAt({ col: 28, row: 20 })).toBe('notPlaceable'); // 行5の線（y=330）の上
    expect(reasonAt(spawnCell)).toBe('notPlaceable');
    expect(reasonAt(releaseCell)).toBe('notPlaceable');
    expect(reasonAt({ col: 28, row: 18 })).toBe('ok'); // 下端 y=314、行5の線のクリアランス（y≧322）の上
    expect(reasonAt({ col: 28, row: 21 })).toBe('notPlaceable'); // 上端 y=326、クリアランス（y≦338）に重なる
    expect(reasonAt({ col: 28, row: 22 })).toBe('ok'); // 上端 y=342、クリアランスの下
    expect(reasonAt({ col: 54, row: 16 })).toBe('ok'); // 右端 x=890、リリース地点の円（半径 28）の左
    expect(reasonAt({ col: 1, row: 20 })).toBe('ok'); // 出現列でもルートが無い位置
  });

  it('HUD の矩形（ITEM_HUD_BOUNDS: x=72〜416、y=80〜298）に重なると notPlaceable、その外は置ける', () => {
    expect(reasonAt({ col: 26, row: 10 })).toBe('notPlaceable'); // x=406〜442
    expect(reasonAt({ col: 27, row: 10 })).toBe('ok'); // x=422〜458
    expect(reasonAt({ col: 10, row: 19 })).toBe('notPlaceable'); // y=294〜330
    expect(reasonAt({ col: 10, row: 20 })).toBe('ok'); // y=310〜346
  });

  it('blockedRects に初期配置UIの範囲を足すと、その中は notPlaceable、左隣と下隣は置ける。プレイ中の既定では置ける', () => {
    const setupContext = { ...context, blockedRects: [...ITEM_BLOCKED_RECTS, INITIAL_PLACEMENT_UI_BOUNDS] };
    const reasonInSetup = (cell: GridCell): string => {
      const result = placeInitialItem(big, 'linter', cell, setupContext);
      return result.ok ? 'ok' : result.reason;
    };
    // 初期配置UIの範囲は x=668〜952、y=68〜208。
    const inside: GridCell = { col: 45, row: 8 }; // x=710〜746、y=118〜154
    expect(reasonInSetup(inside)).toBe('notPlaceable');
    expect(reasonAt(inside)).toBe('ok');
    expect(reasonInSetup({ col: 41, row: 8 })).toBe('notPlaceable'); // 右端 x=682
    expect(reasonInSetup({ col: 40, row: 8 })).toBe('ok'); // 右端 x=666
    expect(reasonInSetup({ col: 45, row: 13 })).toBe('notPlaceable'); // 上端 y=198
    expect(reasonInSetup({ col: 45, row: 14 })).toBe('ok'); // 上端 y=214
  });
});

describe('placeInitialItem: 置かないアイテム（placement: none #58）', () => {
  it('置かないアイテムが存在する', () => {
    expect(NONE_ITEM_TYPES.length).toBeGreaterThan(0);
  });

  it.each(NONE_ITEM_TYPES)('%s は置けるセル・十分なポイントでも notPlaceable で、入力を変更しない', (itemType) => {
    const state = createInitialPlacementState(10);
    const snapshot = structuredClone(state);
    expect(placeInitialItem(state, itemType, free, context)).toEqual({ ok: false, reason: 'notPlaceable' });
    expect(state).toEqual(snapshot);
  });
});

describe('placeInitialItem: 占有と判定順', () => {
  it('置いたセルに2個目は occupied。フットプリントが重なる 2 セル隣も occupied、重ならない 3 セル隣は置ける', () => {
    const state = placeOrThrow(createInitialPlacementState(), 'linter', free);
    expect(placeInitialItem(state, 'testTool', free, context)).toEqual({ ok: false, reason: 'occupied' });
    expect(placeInitialItem(state, 'linter', { col: free.col + 2, row: free.row }, context)).toEqual({
      ok: false,
      reason: 'occupied',
    });
    expect(placeInitialItem(state, 'linter', { col: free.col, row: free.row + 2 }, context)).toEqual({
      ok: false,
      reason: 'occupied',
    });
    expect(placeInitialItem(state, 'linter', besideFree, context).ok).toBe(true);
    expect(placeInitialItem(state, 'linter', { col: free.col, row: free.row + 3 }, context).ok).toBe(true);
  });

  it('初期配置では主人公についてまわるアイテム（ペアプロ相棒 #58）も占有する', () => {
    const state = placeOrThrow(createInitialPlacementState(), 'pairProgrammer', free);
    expect(placeInitialItem(state, 'linter', free, context)).toEqual({ ok: false, reason: 'occupied' });
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
    expect(placeInitialItem(occupied, 'linter', besideFree, context)).toEqual({
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
    const second = placeInitialItem(first.state, 'cat', besideFree, context);
    expect(second.ok && second.item.id).toBe(1);
  });

  it('失敗したときは入力を変更しない', () => {
    const state = placeOrThrow(createInitialPlacementState(linterCost), 'linter', free);
    const snapshot = structuredClone(state);
    placeInitialItem(state, 'unknown', free, context);
    placeInitialItem(state, 'linter', { col: -1, row: 0 }, context);
    placeInitialItem(state, 'linter', free, context);
    placeInitialItem(state, 'linter', besideFree, context);
    removeInitialItem(state, placementCellCenter(besideFree));
    expect(state).toEqual(snapshot);
  });
});

describe('removeInitialItem: 撤去と全額返却（押した点がフットプリント内 #151）', () => {
  const freeCenter = placementCellCenter(free);

  it.each(CELL_ITEM_TYPES)('%s を撤去するとコストを全額返し、配置前のポイントに戻る', (itemType) => {
    const before = createInitialPlacementState(10);
    const placed = placeOrThrow(before, itemType, free);
    const removal = removeInitialItem(placed, freeCenter);
    expect(removal.ok && removal.refund).toBe(getStagePointCost(itemType));
    expect(removal.ok && removal.state.points).toBe(before.points);
    expect(removal.ok && removal.state.itemState.placedItems).toEqual([]);
  });

  it('アイテムのない点は notFound で入力を変更しない', () => {
    const state = placeOrThrow(createInitialPlacementState(), 'linter', free);
    expect(removeInitialItem(state, placementCellCenter(besideFree))).toEqual({ ok: false, reason: 'notFound' });
    expect(state.itemState.placedItems).toHaveLength(1);
  });

  it('境界値: フットプリントの左端・上端は含み、右端・下端は含まない', () => {
    const state = placeOrThrow(createInitialPlacementState(), 'linter', free);
    const { x, y, width, height } = itemFootprint(free);
    expect(removeInitialItem(state, { x, y }).ok).toBe(true);
    expect(removeInitialItem(state, { x: x - 0.01, y }).ok).toBe(false);
    expect(removeInitialItem(state, { x, y: y - 0.01 }).ok).toBe(false);
    expect(removeInitialItem(state, { x: x + width - 0.01, y: y + height - 0.01 }).ok).toBe(true);
    expect(removeInitialItem(state, { x: x + width, y: y + height - 0.01 }).ok).toBe(false);
    expect(removeInitialItem(state, { x: x + width - 0.01, y: y + height }).ok).toBe(false);
  });

  it('セルの中心でなくてもフットプリント内なら撤去し、別のセルを押しても同じアイテムが対象になる', () => {
    const state = placeOrThrow(createInitialPlacementState(), 'linter', free);
    // free の 1 セル右の中心（x=504）はフットプリント（x=470〜506）の中。
    const removal = removeInitialItem(state, placementCellCenter({ col: free.col + 1, row: free.row }));
    expect(removal.ok && removal.item.cell).toEqual(free);
  });

  it('撤去したセルに置き直せる。id は再利用せず続きの番号になる', () => {
    const placed = placeOrThrow(createInitialPlacementState(), 'linter', free);
    const removal = removeInitialItem(placed, freeCenter);
    if (!removal.ok) throw new Error('撤去できませんでした');
    expect(removal.state.itemState.nextId).toBe(1);
    const again = placeInitialItem(removal.state, 'testTool', free, context);
    expect(again.ok && again.item.id).toBe(1);
  });

  it('差し替えたコスト表で返却する', () => {
    const placed = placeOrThrow(createInitialPlacementState(), 'linter', free);
    const removal = removeInitialItem(placed, freeCenter, { cheap: 7, normal: 8, expensive: 9 });
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
    const afterSecond = placeOrThrow(afterFirst, 'testTool', besideFree);
    const itemState = finishInitialPlacement(afterSecond);
    const purchaseState = { funds: 1000000, placedItems: itemState.placedItems, nextId: itemState.nextId, gameOver: false };
    const bought = purchaseItem(purchaseState, 'ci', farFromFree, context);
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
    expect(formatInitialPlacementMessage(removeInitialItem(placed.state, placementCellCenter(free)), 'linter')).toBe(
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
