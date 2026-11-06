import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMessages, setLocale } from './i18n';
import {
  ENGINEER_SPAWN_COL,
  FIELD_ROWS,
  INITIAL_PLACEMENT_ENGINEER_ROUTE_ATTEMPTS,
  INITIAL_PLACEMENT_PANEL_LINES,
  INITIAL_PLACEMENT_REMOVE_BUTTON,
  INITIAL_PLACEMENT_UI_BOUNDS,
  ITEM_BLOCKED_RECTS,
  ITEM_PRICE_TIER_BY_TYPE,
  ITEM_SHORT_NAMES,
  MAX_ENGINEER_ROUTES,
  PLACEMENT_COLS,
  PLACEMENT_ROWS,
  STAGE_POINT_COST_BY_TIER,
  RELEASE_POINT_CELL,
  STAGE_POINTS_INITIAL,
} from './config';
import { createInitialFleet } from './engineer';
import type { Engineer } from './engineer';
import { rectIntersectsCircle } from './geometry';
import { CELL_SIZE, FIELD_COLS } from './field';
import { getItemPlacement, ITEM_REQUIRED_LEVELS, ITEM_TYPES } from './item';
import type { ItemType } from './item';
import {
  canStartPlay,
  countUnplacedEngineers,
  createInitialPlacementState,
  ENGINEER_REMOVE_BUTTON_OFFSET,
  engineerRemoveButtonCenter,
  finishInitialPlacement,
  formatEngineerPlacementMessage,
  formatInitialPlacementEngineerButton,
  formatInitialPlacementItemButton,
  formatInitialPlacementMessage,
  formatInitialPlacementPanel,
  getStagePointCost,
  isEngineerCandidateCell,
  itemRemoveButtonCenter,
  listEngineerCandidateCells,
  placeInitialEngineer,
  placeInitialItem,
  removeInitialEngineer,
  removeInitialItem,
} from './initialPlacement';
import type { InitialPlacementSelection, InitialPlacementState } from './initialPlacement';
import {
  isPlaceableCell,
  itemFootprint,
  placementCellCenter,
  pointToPlacementCell,
  purchaseItem,
  SPAWN_CLEARANCE_RADIUS,
} from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import { RELEASE_POINT_CENTER } from './releasePoint';
import { addRouteAt, cellCenter, SPAWN_MARKER_STYLE } from './route';
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
// すべてのアイテムを解放したレベル(#164)。解放の判定以外のテストは解放済みで行う。
const ALL_UNLOCKED_LEVEL = Math.max(...Object.values(ITEM_REQUIRED_LEVELS));
const context = { routes: [route], level: ALL_UNLOCKED_LEVEL };
// 置けるセル。中心 (488, 136)・フットプリント x=480〜496 / y=128〜144（16px #154）で、初期配置UI（x≦464 #156）・ルート（y≧202）・上帯（y<60）に重ならない。
const free: GridCell = { col: 30, row: 8 };
// free の 3 セル右（x=528〜544。フットプリントは 32px 空く）と、さらに 3 セル右。
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
    // フットプリント（16px）が重ならないよう 3 セル（48px）ずつ右へずらす。
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
    expect(reasonAt({ col: 0, row: 20 })).toBe('ok'); // x=0〜16（左端に接する）
    expect(reasonAt({ col: -1, row: 20 })).toBe('notPlaceable'); // x=-16〜0
    expect(reasonAt({ col: PLACEMENT_COLS - 1, row: 8 })).toBe('ok'); // x=944〜960（右端に接する）
    expect(reasonAt({ col: PLACEMENT_COLS, row: 8 })).toBe('notPlaceable'); // x=960〜976
    expect(reasonAt({ col: 27, row: 4 })).toBe('ok'); // y=64〜80（上帯の直下）
    expect(reasonAt({ col: 27, row: 29 })).toBe('ok'); // y=464〜480（下帯の直上）
    expect(reasonAt({ col: 27, row: PLACEMENT_ROWS - 1 })).toBe('notPlaceable'); // y=528〜544（12px の最終行。下へはみ出す）
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
    expect(reasonAt({ col: 27, row: 3 })).toBe('notPlaceable'); // y=48〜64（上帯に 4px 重なる）
    expect(reasonAt({ col: 27, row: 4 })).toBe('ok'); // y=64〜80
    expect(reasonAt({ col: 27, row: 30 })).toBe('notPlaceable'); // y=480〜496（下帯の次のセル）
    expect(reasonAt({ col: 27, row: 29 })).toBe('ok'); // y=464〜480（下帯に辺が接する）
  });

  it('ルートの線・出現場所・リリース地点に重なると notPlaceable、クリアランスの外は置ける', () => {
    expect(reasonAt(onRoute)).toBe('notPlaceable');
    expect(reasonAt({ col: 28, row: 20 })).toBe('notPlaceable'); // 行5の線（y=330）の上
    expect(reasonAt(spawnCell)).toBe('notPlaceable');
    expect(reasonAt(releaseCell)).toBe('notPlaceable');
    expect(reasonAt({ col: 28, row: 18 })).toBe('ok'); // 下端 y=304、行5の線のクリアランス（y≧324 #162）の上
    expect(reasonAt({ col: 28, row: 21 })).toBe('ok'); // 上端 y=336、描いている線の外形（y<336）に接するだけ(#162)
    expect(reasonAt({ col: 28, row: 22 })).toBe('ok'); // 上端 y=352、クリアランスの下
    expect(reasonAt({ col: 55, row: 16 })).toBe('ok'); // 右端 x=896、リリース地点の円（半径 28。左端 x=902）の左
    expect(reasonAt({ col: 56, row: 16 })).toBe('notPlaceable'); // 右端 x=912、円に重なる
    expect(reasonAt({ col: 1, row: 20 })).toBe('ok'); // 出現列でもルートが無い位置
  });

  it('左の HUD を撤去した範囲（旧 x=72〜416、y=80〜362 #156）は、プレイ中の既定の置けない矩形では置ける', () => {
    expect(reasonAt({ col: 25, row: 10 })).toBe('ok'); // x=400〜416
    expect(reasonAt({ col: 4, row: 10 })).toBe('ok'); // x=64〜80
    expect(reasonAt({ col: 10, row: 5 })).toBe('ok'); // y=80〜96
    expect(reasonAt({ col: 10, row: 19 })).toBe('ok'); // y=304〜320（旧 休暇の案内文）
    expect(reasonAt({ col: 10, row: 22 })).toBe('ok'); // y=352〜368
  });

  it('blockedRects に初期配置UIの矩形を足すと、パネル・ボタン・メッセージの上は notPlaceable、その間と外は置ける。プレイ中の既定では置ける', () => {
    const setupContext = { ...context, blockedRects: [...ITEM_BLOCKED_RECTS, ...INITIAL_PLACEMENT_UI_BOUNDS] };
    const reasonInSetup = (cell: GridCell): string => {
      const result = placeInitialItem(big, 'linter', cell, setupContext);
      return result.ok ? 'ok' : result.reason;
    };
    // 初期配置UIは左上（#156）。#162 で外接矩形（x=72〜464、y=68〜188）をパネル・エンジニアの選択ボタン・開始ボタン・メッセージの矩形に分けた。
    expect(INITIAL_PLACEMENT_UI_BOUNDS).toEqual([
      { x: 72, y: 68, width: 392, height: 60 },
      { x: 72, y: 134, width: 150, height: 28 },
      { x: 228, y: 134, width: 128, height: 28 },
      { x: 72, y: 168, width: 392, height: 20 },
    ]);
    // 本体の上は置けない（プレイ中の既定では置ける）。
    const onEngineerButton: GridCell = { col: 10, row: 8 }; // x=160〜176、y=128〜144（エンジニアの選択ボタン y≧134 に重なる）
    expect(reasonInSetup(onEngineerButton)).toBe('notPlaceable');
    expect(reasonAt(onEngineerButton)).toBe('ok');
    expect(reasonInSetup({ col: 10, row: 5 })).toBe('notPlaceable'); // x=160〜176、y=80〜96（パネル）
    expect(reasonInSetup({ col: 16, row: 9 })).toBe('notPlaceable'); // x=256〜272、y=144〜160（開始ボタン）
    expect(reasonInSetup({ col: 10, row: 11 })).toBe('notPlaceable'); // x=160〜176、y=176〜192（メッセージ）
    // 開始ボタンの右（x=356〜464、y=128〜168）は何も描いていないので置ける(#162)。#156 の外接矩形では置けなかった。
    expect(reasonInSetup({ col: 23, row: 9 })).toBe('ok'); // x=368〜384、y=144〜160（開始ボタンの右端 356 まで 12px 空く）
    expect(reasonInSetup({ col: 22, row: 9 })).toBe('notPlaceable'); // x=352〜368（開始ボタンの右端 356 に 4px 重なる）
    expect(reasonInSetup({ col: 28, row: 8 })).toBe('ok'); // x=448〜464、y=128〜144（上端がパネルの下端 128 に接するだけ）
    expect(reasonInSetup({ col: 25, row: 7 })).toBe('notPlaceable'); // y=112〜128（パネル）
    expect(reasonInSetup({ col: 25, row: 9 })).toBe('ok'); // y=144〜160（パネルとメッセージの間）
    expect(reasonInSetup({ col: 25, row: 10 })).toBe('notPlaceable'); // y=160〜176（メッセージの上端 168 に 8px 重なる）
    // 外接矩形の外側の辺は #156 と同じ。
    expect(reasonInSetup({ col: 4, row: 8 })).toBe('notPlaceable'); // x=64〜80（エンジニアの選択ボタンの左端 72 に 8px 重なる）
    expect(reasonInSetup({ col: 3, row: 8 })).toBe('ok'); // x=48〜64（8px 空く）
    expect(reasonInSetup({ col: 28, row: 5 })).toBe('notPlaceable'); // x=448〜464（パネルの中。右端に内側から接する）
    expect(reasonInSetup({ col: 29, row: 5 })).toBe('ok'); // x=464〜480（パネルの右端 464 に辺が接する）
    expect(reasonInSetup({ col: 25, row: 11 })).toBe('notPlaceable'); // y=176〜192（メッセージの下端 188 に 4px 重なる）
    expect(reasonInSetup({ col: 25, row: 12 })).toBe('ok'); // y=192〜208（4px 空く。ルートの線からも離れている）
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
  it('置いたセルに2個目は occupied。辺が接する隣・角が接する斜め隣・2 セル隣は置ける（16px #154）', () => {
    const state = placeOrThrow(createInitialPlacementState(), 'linter', free);
    expect(placeInitialItem(state, 'testTool', free, context)).toEqual({ ok: false, reason: 'occupied' });
    expect(placeInitialItem(state, 'linter', { col: free.col + 1, row: free.row }, context).ok).toBe(true); // 右隣（辺が接する）
    expect(placeInitialItem(state, 'linter', { col: free.col, row: free.row + 1 }, context).ok).toBe(true); // 下隣
    expect(placeInitialItem(state, 'linter', { col: free.col + 1, row: free.row + 1 }, context).ok).toBe(true); // 右下（角が接する）
    expect(placeInitialItem(state, 'linter', { col: free.col - 1, row: free.row - 1 }, context).ok).toBe(true); // 左上
    expect(placeInitialItem(state, 'linter', { col: free.col + 2, row: free.row }, context).ok).toBe(true); // 2 セル隣（16px 空く）
    expect(placeInitialItem(state, 'linter', besideFree, context).ok).toBe(true);
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

  it('同じセル内の中心ではない点を押しても撤去する（フットプリントがセルと一致 #154）', () => {
    const state = placeOrThrow(createInitialPlacementState(), 'linter', free);
    const { x, y } = itemFootprint(free);
    // 中心 (488, 136) ではなく、セルの左上寄り (x+1, y+1) と右下寄り (x+15, y+15)。
    expect(removeInitialItem(state, { x: x + 1, y: y + 1 }).ok).toBe(true);
    const removal = removeInitialItem(state, { x: x + 15, y: y + 15 });
    expect(removal.ok && removal.item.cell).toEqual(free);
  });

  it('隣のセルを押すと撤去せず、そのセルに新しく置ける（隣のセルはフットプリントの外 #154）', () => {
    const state = placeOrThrow(createInitialPlacementState(), 'linter', free);
    const neighbour: GridCell = { col: free.col + 1, row: free.row };
    expect(removeInitialItem(state, placementCellCenter(neighbour))).toEqual({ ok: false, reason: 'notFound' });
    const placedNext = placeInitialItem(state, 'testTool', neighbour, context);
    expect(placedNext.ok && placedNext.state.itemState.placedItems).toHaveLength(2);
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
    const purchaseState = {
      funds: 1000000,
      placedItems: itemState.placedItems,
      nextId: itemState.nextId,
      gameOver: false,
      level: ALL_UNLOCKED_LEVEL,
    };
    const bought = purchaseItem(purchaseState, 'ci', farFromFree, context);
    expect(bought.ok && bought.item.id).toBe(2);
    expect(purchaseItem(purchaseState, 'ci', free, context)).toEqual({ ok: false, reason: 'occupied' });
  });
});

// 解放前のアイテム(#164)。初期配置の間は Lv.1 で、CI（Lv.2）から先は置けない。
describe('placeInitialItem: レベルによる解放(#164)', () => {
  it('境界値: CI は Lv.1 で locked、Lv.2 ちょうどで置ける', () => {
    const state = createInitialPlacementState();
    expect(placeInitialItem(state, 'ci', free, { ...context, level: 1 })).toEqual({ ok: false, reason: 'locked' });
    expect(placeInitialItem(state, 'ci', free, { ...context, level: 2 }).ok).toBe(true);
  });

  it('Lv.1 で置けるのは CodeRabbit・Linter・テストツールだけ', () => {
    const state = createInitialPlacementState(100);
    for (const itemType of CELL_ITEM_TYPES) {
      const result = placeInitialItem(state, itemType, free, { ...context, level: 1 });
      const unlocked = ['codeRabbit', 'linter', 'testTool'].includes(itemType);
      expect(result.ok ? 'ok' : result.reason).toBe(unlocked ? 'ok' : 'locked');
    }
  });

  it('置かないアイテムは解放前なら locked（解放の判定が先）、解放後は notPlaceable', () => {
    const state = createInitialPlacementState();
    expect(placeInitialItem(state, 'codeFreeze', free, { ...context, level: 6 })).toEqual({ ok: false, reason: 'locked' });
    expect(placeInitialItem(state, 'codeFreeze', free, { ...context, level: 7 })).toEqual({
      ok: false,
      reason: 'notPlaceable',
    });
  });

  it.each([
    ['不明（レベルに関係なく unknownItem）', createInitialPlacementState(), 'x', free, 'unknownItem'],
    ['解放前かつ置けない場所', createInitialPlacementState(), 'ci', { col: -1, row: 0 }, 'locked'],
    ['解放前かつポイント不足', createInitialPlacementState(0), 'ci', free, 'locked'],
  ] as const)('判定順: %s → %s', (_name, state, itemType, cell, reason) => {
    expect(placeInitialItem(state, itemType, cell, { ...context, level: 1 })).toEqual({ ok: false, reason });
  });

  it('拒否してもポイント・配置・id を変えない', () => {
    const state = placeOrThrow(createInitialPlacementState(), 'linter', besideFree);
    const snapshot = structuredClone(state);
    expect(placeInitialItem(state, 'ci', free, { ...context, level: 1 })).toEqual({ ok: false, reason: 'locked' });
    expect(state).toEqual(snapshot);
  });

  it.each([0, -1, 1.5, Number.NaN])('レベル %s は呼び出し側の誤りなので例外にする', (level) => {
    expect(() => placeInitialItem(createInitialPlacementState(), 'linter', free, { ...context, level })).toThrow(
      RangeError,
    );
  });

  it('メッセージ: 日本語は「まだ使えないアイテムです」', () => {
    expect(formatInitialPlacementMessage({ ok: false, reason: 'locked' }, 'ci')).toBe('まだ使えないアイテムです');
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

  it('パネルは INITIAL_PLACEMENT_PANEL_LINES 行で、残ポイントと選択中のもの（アイテムとコスト・エンジニア・なし）とマウス操作の説明を出す(#157)', () => {
    const lines = formatInitialPlacementPanel(STAGE_POINTS_INITIAL, { kind: 'item', itemType: 'linter' });
    expect(INITIAL_PLACEMENT_PANEL_LINES).toBe(3);
    expect(lines).toHaveLength(INITIAL_PLACEMENT_PANEL_LINES);
    expect(lines[0]).toContain(`${STAGE_POINTS_INITIAL}pt`);
    expect(lines[1]).toBe(`選択: ${ITEM_SHORT_NAMES.linter} ${linterCost}pt`);
    expect(lines[2]).toBe('右上のアイテムアイコンから選択し、床をクリック／×で取消');
    expect(lines[0]).toBe(`初期配置 残りポイント: ${STAGE_POINTS_INITIAL}pt`);
    expect(formatInitialPlacementPanel(0, { kind: 'item', itemType: 'cat' })[0]).toContain('0pt');
    expect(formatInitialPlacementPanel(STAGE_POINTS_INITIAL, { kind: 'engineer' })[1]).toBe('選択: エンジニア');
    expect(formatInitialPlacementPanel(STAGE_POINTS_INITIAL, { kind: 'none' })[1]).toBe('選択: なし');
  });

  it('パネルにキーボード操作の説明（キー名・ENTER）を出さない(#157)', () => {
    const selections: readonly InitialPlacementSelection[] = [
      { kind: 'none' },
      { kind: 'engineer' },
      ...ITEM_TYPES.map((itemType): InitialPlacementSelection => ({ kind: 'item', itemType })),
    ];
    for (const selection of selections) {
      for (const line of formatInitialPlacementPanel(STAGE_POINTS_INITIAL, selection)) {
        expect(line).not.toMatch(/ENTER|\[|4〜9/);
      }
    }
    expect(getMessages().initialPlacement.startButton).not.toContain('ENTER');
  });
});

// ---- エンジニアの初期配置(#157) ----
// シード付き擬似乱数（mulberry32。route.test.ts と同じ）。0 以上 1 未満を返す。
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
// 初期の3人（出現行 1・4・7、id 0〜2）とそのルート。
const fleet = () => createInitialFleet(seededRandom(1));
const spawnRow = (row: number): GridCell => ({ col: ENGINEER_SPAWN_COL, row });
const itemAt = (id: number, cell: GridCell): PlacedItem => ({ id, itemType: 'linter', cell, lastAttackTime: null });
// 出現行0のルートは必ず出現セルから右へ水平に出る（最初の曲がり列は ROUTE_TURN_COL_MIN 以上）。その線上（y=30）で、
// 出現場所の円（中心 (30, 30)、半径 SPAWN_CLEARANCE_RADIUS）には重ならないアイテム。行0のどのルートとも重なる。
const onRow0Line: GridCell = pointToPlacementCell({ x: 72, y: 24 });
// 指定したエンジニアを外した名簿とルート。
const withoutEngineers = (ids: readonly number[]): { readonly engineers: Engineer[]; readonly routes: Route[] } =>
  ids.reduce(
    (state, id) => {
      const result = removeInitialEngineer(state.engineers, state.routes, id);
      if (!result.ok) throw new Error(`外せませんでした: ${result.reason}`);
      return { engineers: result.engineers, routes: result.routes };
    },
    { engineers: fleet().engineers, routes: fleet().routes },
  );

describe('isEngineerCandidateCell / listEngineerCandidateCells: エンジニアを置ける床(#157)', () => {
  it('前提: onRow0Line は行0の出現場所の円に重ならず、行0から出るルートの最初の区間に重なる', () => {
    expect(rectIntersectsCircle(itemFootprint(onRow0Line), cellCenter(spawnRow(0)), SPAWN_CLEARANCE_RADIUS)).toBe(false);
    const route = addRouteAt([], spawnRow(0), seededRandom(3));
    if (route === undefined) throw new Error('ルートを作れませんでした');
    expect(isPlaceableCell(onRow0Line, { routes: [route], placedItems: [], blockedRects: [] })).toBe(false);
  });

  it('境界値: 出現列の行0と最終行（FIELD_ROWS - 1）は置け、範囲外（-1・FIELD_ROWS）と小数の行は置けない', () => {
    const { routes } = fleet();
    expect(isEngineerCandidateCell(spawnRow(0), routes, [])).toBe(true);
    expect(isEngineerCandidateCell(spawnRow(FIELD_ROWS - 1), routes, [])).toBe(true);
    expect(isEngineerCandidateCell(spawnRow(-1), routes, [])).toBe(false);
    expect(isEngineerCandidateCell(spawnRow(FIELD_ROWS), routes, [])).toBe(false);
    expect(isEngineerCandidateCell(spawnRow(0.5), routes, [])).toBe(false);
  });

  it('境界値: 出現列の右隣（列 ENGINEER_SPAWN_COL + 1）は置けない。リリースセルも置けない', () => {
    const { routes } = fleet();
    expect(isEngineerCandidateCell({ col: ENGINEER_SPAWN_COL + 1, row: 0 }, routes, [])).toBe(false);
    expect(isEngineerCandidateCell(RELEASE_POINT_CELL, routes, [])).toBe(false);
  });

  it('使用中の出現セルは置けず、外すと置けるようになる', () => {
    const { routes } = fleet();
    expect(isEngineerCandidateCell(spawnRow(4), routes, [])).toBe(false);
    expect(isEngineerCandidateCell(spawnRow(4), withoutEngineers([1]).routes, [])).toBe(true);
  });

  it('境界値: アイテムの見た目の四角が出現場所の外側リングに重なると置けず、重ならない最初の位置なら置ける', () => {
    const { routes } = fleet();
    const center = cellCenter(spawnRow(0));
    const row = pointToPlacementCell(center).row;
    // 行0の中心と同じ高さで、左から右へずらして最初に重ならなくなる列を探す（ITEM_BOX_SIZE が変わっても成り立つ）。
    const firstClear = Array.from({ length: PLACEMENT_COLS }, (_, col) => col).find(
      (col) => !rectIntersectsCircle(itemFootprint({ col, row }), center, SPAWN_CLEARANCE_RADIUS),
    );
    if (firstClear === undefined || firstClear === 0) throw new Error('境界の列が見つかりません');
    expect(isEngineerCandidateCell(spawnRow(0), routes, [itemAt(0, { col: firstClear - 1, row })])).toBe(false);
    expect(isEngineerCandidateCell(spawnRow(0), routes, [itemAt(0, { col: firstClear, row })])).toBe(true);
  });

  it('一覧は出現列の空いた行を上から返す（初期の行 1・4・7 を除く）', () => {
    const { routes } = fleet();
    expect(listEngineerCandidateCells(routes, [])).toEqual([0, 2, 3, 5, 6, 8].map(spawnRow));
    expect(listEngineerCandidateCells([], [])).toHaveLength(FIELD_ROWS);
    expect(listEngineerCandidateCells(withoutEngineers([0, 1, 2]).routes, [])).toHaveLength(FIELD_ROWS);
  });
});

describe('placeInitialEngineer: エンジニアを置いてルートを自動で作る(#157)', () => {
  it('未配置の最初のエンジニアに、指定セルから出るルートを割り当てる。id は既存の最大 + 1', () => {
    const { engineers, routes } = withoutEngineers([1]);
    const result = placeInitialEngineer(engineers, routes, [], spawnRow(0), seededRandom(5));
    if (!result.ok) throw new Error(`置けませんでした: ${result.reason}`);
    expect(result.engineerId).toBe(1);
    expect(result.route.spawn).toEqual(spawnRow(0));
    expect(result.route.waypoints[0]).toEqual(spawnRow(0));
    expect(result.route.waypoints[result.route.waypoints.length - 1]).toEqual(RELEASE_POINT_CELL);
    expect(result.route.id).toBe(Math.max(...routes.map((route) => route.id)) + 1);
    expect(result.routes).toEqual([...routes, result.route]);
    expect(result.engineers.find((engineer) => engineer.id === 1)?.routeId).toBe(result.route.id);
    expect(countUnplacedEngineers(result.engineers)).toBe(0);
  });

  it('未配置が複数なら名簿の並びで最初の人から置く', () => {
    const { engineers, routes } = withoutEngineers([2, 0]);
    const first = placeInitialEngineer(engineers, routes, [], spawnRow(8), seededRandom(5));
    if (!first.ok) throw new Error(`置けませんでした: ${first.reason}`);
    expect(first.engineerId).toBe(0);
    const second = placeInitialEngineer(first.engineers, first.routes, [], spawnRow(0), seededRandom(6));
    if (!second.ok) throw new Error(`置けませんでした: ${second.reason}`);
    expect(second.engineerId).toBe(2);
  });

  it('判定順: 置けないセル → 未配置のエンジニアがいない → アイテムと重なる', () => {
    const full = fleet();
    // 全員配置済みでも、置けないセルなら notCandidate。
    expect(placeInitialEngineer(full.engineers, full.routes, [], { col: 1, row: 0 }, seededRandom(1))).toEqual({
      ok: false,
      reason: 'notCandidate',
    });
    expect(placeInitialEngineer(full.engineers, full.routes, [], spawnRow(0), seededRandom(1))).toEqual({
      ok: false,
      reason: 'noUnplacedEngineer',
    });
    const { engineers, routes } = withoutEngineers([0]);
    expect(placeInitialEngineer(engineers, routes, [], spawnRow(4), seededRandom(1))).toEqual({
      ok: false,
      reason: 'notCandidate',
    });
    expect(placeInitialEngineer(engineers, routes, [itemAt(0, onRow0Line)], spawnRow(0), seededRandom(1))).toEqual({
      ok: false,
      reason: 'overlapsItem',
    });
  });

  it('作ったルートは配置済みアイテムの見た目の四角に重ならない（多数のシード）', () => {
    const { engineers, routes } = withoutEngineers([0]);
    // 行0から出て、下りる列によっては通る位置（x=200 付近、行0の線上）のアイテム。
    const items = [itemAt(0, pointToPlacementCell({ x: 200, y: 24 }))];
    for (let seed = 1; seed <= 50; seed++) {
      const result = placeInitialEngineer(engineers, routes, items, spawnRow(0), seededRandom(seed));
      if (!result.ok) continue;
      expect(isPlaceableCell(items[0].cell, { routes: [result.route], placedItems: [], blockedRects: [] })).toBe(true);
    }
  });

  it('境界値: 作り直しの上限回数ちょうどで重ならないルートが出れば置け、上限が1回少なければ overlapsItem', () => {
    const { engineers, routes } = withoutEngineers([0]);
    const items = [itemAt(0, pointToPlacementCell({ x: 200, y: 24 }))];
    // 同じ乱数列で何回目に重ならないルートが出るかを数え、2回目以降に出るシードを使う。
    const firstAvoidingAttempt = (seed: number): number | undefined => {
      const random = seededRandom(seed);
      for (let attempt = 1; attempt <= INITIAL_PLACEMENT_ENGINEER_ROUTE_ATTEMPTS; attempt++) {
        const route = addRouteAt(routes, spawnRow(0), random);
        if (route === undefined) throw new Error('ルートを作れませんでした');
        if (isPlaceableCell(items[0].cell, { routes: [route], placedItems: [], blockedRects: [] })) return attempt;
      }
      return undefined;
    };
    const seed = Array.from({ length: 200 }, (_, i) => i + 1).find((candidate) => (firstAvoidingAttempt(candidate) ?? 0) >= 2);
    if (seed === undefined) throw new Error('2回目以降に重ならないルートが出るシードが見つかりません');
    const attempts = firstAvoidingAttempt(seed);
    if (attempts === undefined) throw new Error('回数が数えられません');
    expect(placeInitialEngineer(engineers, routes, items, spawnRow(0), seededRandom(seed), attempts).ok).toBe(true);
    expect(placeInitialEngineer(engineers, routes, items, spawnRow(0), seededRandom(seed), attempts - 1)).toEqual({
      ok: false,
      reason: 'overlapsItem',
    });
  });

  it('既定の上限（INITIAL_PLACEMENT_ENGINEER_ROUTE_ATTEMPTS）まで毎回重なれば overlapsItem で、入力を変更しない', () => {
    const { engineers, routes } = withoutEngineers([0]);
    const items = [itemAt(0, onRow0Line)];
    const snapshot = structuredClone({ engineers, routes, items });
    let calls = 0;
    const random = seededRandom(9);
    const counting = (): number => {
      calls += 1;
      return random();
    };
    expect(placeInitialEngineer(engineers, routes, items, spawnRow(0), counting)).toEqual({ ok: false, reason: 'overlapsItem' });
    expect(calls).toBeGreaterThanOrEqual(INITIAL_PLACEMENT_ENGINEER_ROUTE_ATTEMPTS);
    expect({ engineers, routes, items }).toEqual(snapshot);
  });

  it('出現列の全行に置ける（ルートの上限 MAX_ENGINEER_ROUTES = 行数に収まる）', () => {
    const engineers: Engineer[] = Array.from({ length: MAX_ENGINEER_ROUTES }, (_, id) => ({
      ...fleet().engineers[0],
      id,
      routeId: null,
    }));
    const final = Array.from({ length: FIELD_ROWS }, (_, row) => row).reduce(
      (state, row) => {
        const result = placeInitialEngineer(state.engineers, state.routes, [], spawnRow(row), seededRandom(row + 1));
        if (!result.ok) throw new Error(`行${row}に置けませんでした: ${result.reason}`);
        return { engineers: result.engineers, routes: result.routes };
      },
      { engineers, routes: [] as Route[] },
    );
    expect(final.routes).toHaveLength(MAX_ENGINEER_ROUTES);
    expect(canStartPlay(final.engineers)).toBe(true);
  });
});

describe('removeInitialEngineer / canStartPlay: エンジニアを外す・開始の条件(#157)', () => {
  it('外すとルートを除き routeId を null に戻す。名簿からは外さず、他の人とルートは変えない', () => {
    const { engineers, routes } = fleet();
    const result = removeInitialEngineer(engineers, routes, 1);
    if (!result.ok) throw new Error(`外せませんでした: ${result.reason}`);
    expect(result.routeId).toBe(engineers[1].routeId);
    expect(result.engineers).toHaveLength(engineers.length);
    expect(result.engineers[1].routeId).toBeNull();
    expect(result.engineers[0]).toBe(engineers[0]);
    expect(result.routes).toEqual(routes.filter((route) => route.id !== engineers[1].routeId));
    expect(engineers[1].routeId).not.toBeNull();
  });

  it('いない id は notFound、配置していない人は notPlaced', () => {
    const { engineers, routes } = withoutEngineers([1]);
    expect(removeInitialEngineer(engineers, routes, 99)).toEqual({ ok: false, reason: 'notFound' });
    expect(removeInitialEngineer(engineers, routes, 1)).toEqual({ ok: false, reason: 'notPlaced' });
  });

  it('境界値: 全員（N 人）配置なら開始でき、N-1 人なら開始できない', () => {
    const { engineers } = fleet();
    expect(countUnplacedEngineers(engineers)).toBe(0);
    expect(canStartPlay(engineers)).toBe(true);
    const missingOne = withoutEngineers([2]).engineers;
    expect(countUnplacedEngineers(missingOne)).toBe(1);
    expect(canStartPlay(missingOne)).toBe(false);
    expect(canStartPlay(withoutEngineers([0, 1, 2]).engineers)).toBe(false);
  });
});

describe('初期配置の文言と×ボタンの位置(#157)', () => {
  it('購入バーの文言はステージポイントのコストで、キーと金額を出さない', () => {
    expect(formatInitialPlacementItemButton('linter')).toBe(`${ITEM_SHORT_NAMES.linter} ${linterCost}pt`);
    for (const itemType of ITEM_TYPES) {
      expect(formatInitialPlacementItemButton(itemType)).toBe(`${ITEM_SHORT_NAMES[itemType]} ${getStagePointCost(itemType)}pt`);
    }
  });

  it('エンジニアの選択ボタンは未配置の人数を出す', () => {
    expect(formatInitialPlacementEngineerButton(0)).toBe('エンジニア 残り0人');
    expect(formatInitialPlacementEngineerButton(3)).toBe('エンジニア 残り3人');
  });

  it('エンジニアの配置の結果メッセージ', () => {
    const { engineers, routes } = withoutEngineers([0]);
    expect(formatEngineerPlacementMessage(placeInitialEngineer(engineers, routes, [], spawnRow(0), seededRandom(1)))).toBe(
      'エンジニアを置きました',
    );
    expect(formatEngineerPlacementMessage({ ok: false, reason: 'notCandidate' })).toBe('エンジニアはここに置けません');
    expect(formatEngineerPlacementMessage({ ok: false, reason: 'noUnplacedEngineer' })).toBe('置けるエンジニアがいません');
    expect(formatEngineerPlacementMessage({ ok: false, reason: 'overlapsItem' })).toBe('アイテムと重なるため置けません');
  });

  it('アイテムの×ボタンは見た目の四角（フットプリント）の右上の角が中心', () => {
    const { x, y, width } = itemFootprint(free);
    expect(itemRemoveButtonCenter(free)).toEqual({ x: x + width, y });
  });

  it('境界値: エンジニアの×ボタンは休暇マーカーの当たり判定（半径 SPAWN_MARKER_STYLE.radius）の外で、1px 内側に寄せると重なる。出現セルに収まる', () => {
    const { size } = INITIAL_PLACEMENT_REMOVE_BUTTON;
    const buttonRect = (offset: number, spawn: GridCell) => {
      const center = cellCenter(spawn);
      return { x: center.x + offset - size / 2, y: center.y - offset - size / 2, width: size, height: size };
    };
    for (let row = 0; row < FIELD_ROWS; row++) {
      const spawn = spawnRow(row);
      const center = engineerRemoveButtonCenter(spawn);
      expect(center).toEqual({ x: cellCenter(spawn).x + ENGINEER_REMOVE_BUTTON_OFFSET, y: cellCenter(spawn).y - ENGINEER_REMOVE_BUTTON_OFFSET });
      const rect = buttonRect(ENGINEER_REMOVE_BUTTON_OFFSET, spawn);
      expect(rectIntersectsCircle(rect, cellCenter(spawn), SPAWN_MARKER_STYLE.radius)).toBe(false);
      expect(rectIntersectsCircle(buttonRect(ENGINEER_REMOVE_BUTTON_OFFSET - 1, spawn), cellCenter(spawn), SPAWN_MARKER_STYLE.radius)).toBe(
        true,
      );
      const cellLeft = cellCenter(spawn).x - CELL_SIZE / 2;
      const cellTop = cellCenter(spawn).y - CELL_SIZE / 2;
      expect(rect.x).toBeGreaterThanOrEqual(cellLeft);
      expect(rect.y).toBeGreaterThanOrEqual(cellTop);
      expect(rect.x + rect.width).toBeLessThanOrEqual(cellLeft + CELL_SIZE);
    }
  });
});

describe('初期配置の文言（英語 #158）', () => {
  beforeEach(() => {
    setLocale('en');
  });
  afterEach(() => {
    setLocale('ja');
  });

  it('パネルの3行（残ポイント・選択中のもの・操作説明）', () => {
    const lines = formatInitialPlacementPanel(STAGE_POINTS_INITIAL, { kind: 'item', itemType: 'linter' });
    expect(lines).toHaveLength(INITIAL_PLACEMENT_PANEL_LINES);
    expect(lines[0]).toBe(`Setup - Points left: ${STAGE_POINTS_INITIAL}pt`);
    expect(lines[1]).toBe(`Selected: Linter ${linterCost}pt`);
    expect(lines[2]).toBe('Pick from the item icon, click floor; × undo');
    expect(formatInitialPlacementPanel(0, { kind: 'engineer' })).toEqual([
      'Setup - Points left: 0pt',
      'Selected: Engineer',
      'Pick from the item icon, click floor; × undo',
    ]);
    expect(formatInitialPlacementPanel(0, { kind: 'none' })[1]).toBe('Selected: None');
  });

  it('アイテムの枠・エンジニアの選択ボタン', () => {
    expect(formatInitialPlacementItemButton('linter')).toBe(`Linter ${linterCost}pt`);
    expect(formatInitialPlacementEngineerButton(0)).toBe('Engineers left: 0');
    expect(formatInitialPlacementEngineerButton(3)).toBe('Engineers left: 3');
  });

  it('結果メッセージ', () => {
    expect(formatInitialPlacementMessage({ ok: false, reason: 'insufficientPoints' }, 'linter')).toBe('Not enough stage points');
    expect(formatInitialPlacementMessage({ ok: false, reason: 'notPlaceable' }, 'linter')).toBe("Can't place it there");
    expect(formatInitialPlacementMessage({ ok: false, reason: 'notFound' }, 'linter')).toBe('No item there');
    expect(formatInitialPlacementMessage({ ok: false, reason: 'unknownItem' }, 'foo')).toBe('Unknown item: foo');
    expect(formatInitialPlacementMessage({ ok: false, reason: 'locked' }, 'ci')).toBe('Item not unlocked yet');
    expect(formatEngineerPlacementMessage({ ok: false, reason: 'notCandidate' })).toBe("Engineers can't go here");
    expect(formatEngineerPlacementMessage({ ok: false, reason: 'noUnplacedEngineer' })).toBe('No engineer left to place');
    expect(formatEngineerPlacementMessage({ ok: false, reason: 'overlapsItem' })).toBe("Can't place: overlaps an item");
    expect(getMessages().initialPlacement.startButton).toBe('Start');
  });
});
