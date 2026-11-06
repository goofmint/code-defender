// ステージポイントによる初期配置(#47)の純粋関数。Phaser には依存しない（テスト可能にするため）。
// ステージポイントは資金(funds)とは別の単位。資金は変えない（changeFunds は通さない）。仮の規則は config.ts の #47 の注記を参照。
import {
  ENGINEER_SPAWN_COL,
  FIELD_ROWS,
  INITIAL_PLACEMENT_ENGINEER_ROUTE_ATTEMPTS,
  INITIAL_PLACEMENT_MIN_ENGINEERS,
  INITIAL_PLACEMENT_REMOVE_BUTTON,
  ITEM_PRICE_TIER_BY_TYPE,
  ITEM_SHORT_NAMES,
  RELEASE_POINT_CELL,
  STAGE_POINT_COST_BY_TIER,
  STAGE_POINTS_INITIAL,
} from './config';
import { assignEngineerRoute } from './engineer';
import type { Engineer, HireResult } from './engineer';
import { isBankrupt } from './gameOver';
import { pointInRect, rectIntersectsCircle, rectsOverlap } from './geometry';
import { getMessages, interpolate } from './i18n';
import { getItemPlacement, isItemUnlocked, ITEM_TYPES } from './item';
import type { ItemType } from './item';
import { createItemState, isPlaceableCell, itemFootprint, SPAWN_CLEARANCE_RADIUS } from './itemPlacement';
import type { ItemPriceTier, ItemState, PlacedItem, PlacementCell, PlacementContext } from './itemPlacement';
import { addRouteAt, cellCenter, removeRoute, SPAWN_MARKER_STYLE } from './route';
import type { GridCell, Point, Route } from './route';

export type InitialPlacementState = {
  readonly points: number;
  readonly itemState: ItemState;
};

// 初期配置の開始状態。ポイントは既定で STAGE_POINTS_INITIAL、配置なし・id は 0 から（createItemState と同じ）。
export const createInitialPlacementState = (points: number = STAGE_POINTS_INITIAL): InitialPlacementState => ({
  points,
  itemState: createItemState(),
});

// アイテムの配置コスト（ステージポイント）。価格の段階（ITEM_PRICE_TIER_BY_TYPE）をコスト表で換算する。コスト表は差し替えられる。
export const getStagePointCost = (
  itemType: ItemType,
  table: Readonly<Record<ItemPriceTier, number>> = STAGE_POINT_COST_BY_TIER,
): number => table[ITEM_PRICE_TIER_BY_TYPE[itemType]];

// locked は今のレベルではまだ解放されていない(#164)。
export type InitialPlacementFailReason = 'unknownItem' | 'locked' | 'notPlaceable' | 'occupied' | 'insufficientPoints';

export type InitialPlacementResult =
  | {
      readonly ok: true;
      readonly item: PlacedItem;
      readonly cost: number;
      readonly state: InitialPlacementState;
    }
  | { readonly ok: false; readonly reason: InitialPlacementFailReason };

export type InitialRemovalResult =
  | {
      readonly ok: true;
      readonly item: PlacedItem;
      readonly refund: number;
      readonly state: InitialPlacementState;
    }
  | { readonly ok: false; readonly reason: 'notFound' };

// 初期配置の判定に使う設定。placedItems は state から渡すので含めない。コスト表は差し替えられる。
export type InitialPlacementContext = Omit<PlacementContext, 'placedItems'> & {
  readonly costTable?: Readonly<Record<ItemPriceTier, number>>;
  // 今のレベル(#164)。初期配置の間は経過時間 0 なので Lv.1。必要レベルに届かないアイテムは置けない。省略できない（全解放の既定値は持たない）。
  readonly level: number;
};

const isItemType = (value: string): value is ItemType => (ITEM_TYPES as readonly string[]).includes(value);

// ステージポイントでアイテムを置く。判定順: 不明なアイテム → 解放前(#164) → 置かないアイテム（placement: none #58）・置けない場所 → 既にある → ポイント不足。
// 置かないアイテムは購入時に効果を発動するもので、セルに置けないため初期配置では notPlaceable にする。
// cell は配置グリッド（16px #151）のセル。「既にある」はフットプリント（itemFootprint）が既存アイテムと重なるか（辺の接触は重なりとしない）で判定し、
// 初期配置では主人公についてまわるアイテム（ペアプロ相棒 #58）も含める（初期配置の間は動かないため）。
// ポイントがちょうどコストなら置けて 0 になる。id と lastAttackTime は purchaseItem と同じ（id は nextId、lastAttackTime は null）。
// 失敗時は理由だけを返し、入力は変更しない。
export const placeInitialItem = (
  state: InitialPlacementState,
  itemType: string,
  cell: PlacementCell,
  context: InitialPlacementContext,
): InitialPlacementResult => {
  if (!isItemType(itemType)) return { ok: false, reason: 'unknownItem' };
  if (!isItemUnlocked(itemType, context.level)) return { ok: false, reason: 'locked' };
  if (getItemPlacement(itemType) === 'none') return { ok: false, reason: 'notPlaceable' };
  const placedItems = state.itemState.placedItems;
  // 既存アイテムを除いた地形だけで判定してから、占有を別に判定する（purchaseItem と同じく occupied を区別するため）。
  if (!isPlaceableCell(cell, { ...context, placedItems: [] })) return { ok: false, reason: 'notPlaceable' };
  const footprint = itemFootprint(cell);
  if (placedItems.some((item) => rectsOverlap(itemFootprint(item.cell), footprint))) return { ok: false, reason: 'occupied' };
  const cost = getStagePointCost(itemType, context.costTable);
  if (state.points < cost) return { ok: false, reason: 'insufficientPoints' };
  const item: PlacedItem = { id: state.itemState.nextId, itemType, cell, lastAttackTime: null };
  return {
    ok: true,
    item,
    cost,
    state: {
      points: state.points - cost,
      itemState: { placedItems: [...placedItems, item], nextId: item.id + 1 },
    },
  };
};

// 押した点（ピクセル）がフットプリントの内側にあるアイテムを撤去して、そのコストを全額返す(#151)。該当がなければ notFound（入力は変更しない）。
// フットプリントは重ならないので該当は最大 1 個。nextId は戻さない（撤去したアイテムの id を再利用しない）。
export const removeInitialItem = (
  state: InitialPlacementState,
  point: Point,
  costTable: Readonly<Record<ItemPriceTier, number>> = STAGE_POINT_COST_BY_TIER,
): InitialRemovalResult => {
  const item = state.itemState.placedItems.find((placed) => pointInRect(point, itemFootprint(placed.cell)));
  if (item === undefined) return { ok: false, reason: 'notFound' };
  const refund = getStagePointCost(item.itemType, costTable);
  return {
    ok: true,
    item,
    refund,
    state: {
      points: state.points + refund,
      itemState: {
        placedItems: state.itemState.placedItems.filter((placed) => placed.id !== item.id),
        nextId: state.itemState.nextId,
      },
    },
  };
};

// 初期配置を終えて、プレイ用の ItemState を返す。残ポイントはここで破棄する（持ち越さない）。
export const finishInitialPlacement = (state: InitialPlacementState): ItemState => state.itemState;

// 初期配置の結果メッセージ（formatItemMessage と同じ形式）。
export const formatInitialPlacementMessage = (
  result: InitialPlacementResult | InitialRemovalResult,
  itemType: string,
): string => {
  const { initialPlacement: text, common } = getMessages();
  if (result.ok) {
    const name = ITEM_SHORT_NAMES[result.item.itemType];
    return interpolate('refund' in result ? text.removed : text.placed, { name });
  }
  switch (result.reason) {
    case 'unknownItem':
      return interpolate(common.unknownItem, { item: itemType });
    case 'insufficientPoints':
      return text.insufficientPoints;
    case 'locked':
      return common.itemLocked;
    case 'notFound':
      return text.noItemThere;
    default:
      return common.notPlaceable;
  }
};

// 初期配置で次に置くもの(#157)。最初は未選択。アイテムのメニュー(#156)でアイテムの種類を、エンジニアの選択ボタンでエンジニアを選ぶ。
export type InitialPlacementSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'item'; readonly itemType: ItemType }
  | { readonly kind: 'engineer' };

// 初期配置パネルの2行（残ポイント・選択中のもの）(#157)。行数は config の INITIAL_PLACEMENT_PANEL_LINES と同じ。
// 例: 「初期配置 残りポイント: 6pt」「選択: Linter 1pt」「選択: エンジニア」「選択: なし」。操作の説明は右上の ℹ️ のゲームの説明に移した(#165)。
export const formatInitialPlacementPanel = (points: number, selection: InitialPlacementSelection): readonly string[] => {
  const text = getMessages().initialPlacement;
  const selected = ((): string => {
    switch (selection.kind) {
      case 'item':
        return formatInitialPlacementItemButton(selection.itemType);
      case 'engineer':
        return text.selectionEngineer;
      case 'none':
        return text.selectionNone;
    }
  })();
  return [interpolate(text.header, { points }), interpolate(text.selected, { selection: selected })];
};

// 初期配置の間のアイテムのメニュー(#156)の枠の文言(#157)。「Linter 1pt」。金額の代わりにステージポイントのコストを出し、キーの表示は省く。
export const formatInitialPlacementItemButton = (itemType: ItemType): string =>
  interpolate(getMessages().initialPlacement.itemCost, { name: ITEM_SHORT_NAMES[itemType], cost: getStagePointCost(itemType) });

// エンジニアの選択ボタンの文言(#157)。「エンジニア 残り3人」（残りは未配置の初期エンジニアの人数）。
export const formatInitialPlacementEngineerButton = (unplaced: number): string =>
  interpolate(getMessages().initialPlacement.engineerButton, { count: unplaced });

// 未配置（routeId が null）のエンジニアの人数(#157)。初期配置の間に雇った人(#172)は、置くまで未配置。
export const countUnplacedEngineers = (engineers: readonly Engineer[]): number =>
  engineers.filter((engineer) => engineer.routeId === null).length;

// 配置済み（routeId がある）のエンジニアの人数(#172)。
const countPlacedEngineers = (engineers: readonly Engineer[]): number => engineers.length - countUnplacedEngineers(engineers);

// プレイを始められるか(#157)。エンジニア全員にルート（出現場所）があり、INITIAL_PLACEMENT_MIN_ENGINEERS 人以上を置いたときだけ始められる(#172)。
// アイテムは置かなくてもよい。
export const canStartPlay = (engineers: readonly Engineer[]): boolean =>
  countUnplacedEngineers(engineers) === 0 && countPlacedEngineers(engineers) >= INITIAL_PLACEMENT_MIN_ENGINEERS;

// 始められないときのメッセージ(#172)。未配置の人がいれば全員置くよう、いなければ（置いた人が足りなければ）雇って置くよう案内する。
// 始められる状態（canStartPlay が true）で呼ぶのは呼び出し側の誤りなので投げる。
export const formatStartPlayBlockedMessage = (engineers: readonly Engineer[]): string => {
  if (canStartPlay(engineers)) {
    throw new Error('プレイを始められる状態で、始められない理由を求めました');
  }
  const text = getMessages().initialPlacement;
  return countUnplacedEngineers(engineers) > 0 ? text.placeAllEngineers : text.hireAndPlaceEngineer;
};

// 初期配置の間の雇用(#172)。雇うと資金が倒産の額（isBankrupt）になるときは、雇えた結果を資金不足（insufficientFunds）に置き換える。
// 開始前に倒産してゲームオーバーにならないようにするため。雇えなかった結果と、倒産しない額で雇えた結果はそのまま返す。
export const refuseSetupHireIntoBankruptcy = (result: HireResult): HireResult =>
  result.ok && isBankrupt(result.fundsAfter) ? { ok: false, reason: 'insufficientFunds' } : result;

const isSameCell = (a: GridCell, b: GridCell): boolean => a.col === b.col && a.row === b.row;

// エンジニアを置けるセルか(#157)。cell はルートグリッド（60px）のセル。条件: 整数で ENGINEER_SPAWN_COL の列・行が範囲内、
// 既存ルートの出現セルでもリリースセルでもない、出現場所の円の外側リング（SPAWN_CLEARANCE_RADIUS）が配置済みアイテムの見た目の四角に重ならない。
// 列を ENGINEER_SPAWN_COL に限るのは、createRoute が出現列を左端として右向きに進み、主人公の初期セルを避ける前提のため（雇用時の nextSpawnCell と同じ列）。
export const isEngineerCandidateCell = (
  cell: GridCell,
  routes: readonly Route[],
  placedItems: readonly PlacedItem[],
): boolean => {
  if (!Number.isInteger(cell.row) || cell.col !== ENGINEER_SPAWN_COL) return false;
  if (cell.row < 0 || cell.row >= FIELD_ROWS) return false;
  if (routes.some((route) => isSameCell(route.spawn, cell))) return false;
  if (isSameCell(cell, RELEASE_POINT_CELL)) return false;
  const center = cellCenter(cell);
  return !placedItems.some((item) => rectIntersectsCircle(itemFootprint(item.cell), center, SPAWN_CLEARANCE_RADIUS));
};

// エンジニアを置けるセルの一覧（上の行から）(#157)。setup の間の床の色分けに使う。
export const listEngineerCandidateCells = (
  routes: readonly Route[],
  placedItems: readonly PlacedItem[],
): GridCell[] =>
  Array.from({ length: FIELD_ROWS }, (_, row): GridCell => ({ col: ENGINEER_SPAWN_COL, row })).filter((cell) =>
    isEngineerCandidateCell(cell, routes, placedItems),
  );

export type EngineerPlacementFailReason = 'notCandidate' | 'noUnplacedEngineer' | 'overlapsItem';

export type EngineerPlacementResult =
  | {
      readonly ok: true;
      readonly engineerId: number;
      readonly route: Route;
      readonly routes: Route[];
      readonly engineers: Engineer[];
    }
  | { readonly ok: false; readonly reason: EngineerPlacementFailReason };

// ルートが配置済みアイテムの見た目の四角に重ならないか。アイテムを置くときと同じ判定（isPlaceableCell）を、そのルートだけ・UI の矩形なしで行う。
const routeAvoidsItems = (route: Route, placedItems: readonly PlacedItem[]): boolean =>
  placedItems.every((item) => isPlaceableCell(item.cell, { routes: [route], placedItems: [], blockedRects: [] }));

// 未配置の初期エンジニアのうち名簿で最初の1人を cell に置き、ルートを自動で作る(#157)。判定順: 置けないセル → 未配置のエンジニアがいない →
// アイテムと重なる。ルートが配置済みアイテムに重なるときは random で作り直し、INITIAL_PLACEMENT_ENGINEER_ROUTE_ATTEMPTS 回（最初の1回を含む）
// すべて重なったら overlapsItem にする（アイテムは撤去しない）。失敗時は理由だけを返し、入力は変更しない。
export const placeInitialEngineer = (
  engineers: readonly Engineer[],
  routes: readonly Route[],
  placedItems: readonly PlacedItem[],
  cell: GridCell,
  random: () => number,
  attempts: number = INITIAL_PLACEMENT_ENGINEER_ROUTE_ATTEMPTS,
): EngineerPlacementResult => {
  if (!isEngineerCandidateCell(cell, routes, placedItems)) return { ok: false, reason: 'notCandidate' };
  const engineer = engineers.find((candidate) => candidate.routeId === null);
  if (engineer === undefined) return { ok: false, reason: 'noUnplacedEngineer' };
  for (let attempt = 0; attempt < attempts; attempt++) {
    const route = addRouteAt(routes, cell, random);
    // 候補のセルは使用中の出現セルを除いた ENGINEER_SPAWN_COL の行なので、ルートは上限（MAX_ENGINEER_ROUTES = 行数）に達しない。
    if (route === undefined) throw new Error(`ルートの上限で出現場所を追加できません: (${cell.col}, ${cell.row})`);
    if (routeAvoidsItems(route, placedItems)) {
      return {
        ok: true,
        engineerId: engineer.id,
        route,
        routes: [...routes, route],
        engineers: assignEngineerRoute(engineers, engineer.id, route.id),
      };
    }
  }
  return { ok: false, reason: 'overlapsItem' };
};

export type EngineerRemovalResult =
  | { readonly ok: true; readonly routeId: number; readonly routes: Route[]; readonly engineers: Engineer[] }
  | { readonly ok: false; readonly reason: 'notFound' | 'notPlaced' };

// 置いたエンジニアを外す(#157)。そのエンジニアのルートを除き、routeId を null に戻す（名簿からは外さない）。入力は変更しない。
export const removeInitialEngineer = (
  engineers: readonly Engineer[],
  routes: readonly Route[],
  engineerId: number,
): EngineerRemovalResult => {
  const engineer = engineers.find((candidate) => candidate.id === engineerId);
  if (engineer === undefined) return { ok: false, reason: 'notFound' };
  if (engineer.routeId === null) return { ok: false, reason: 'notPlaced' };
  return {
    ok: true,
    routeId: engineer.routeId,
    routes: removeRoute(routes, engineer.routeId),
    engineers: assignEngineerRoute(engineers, engineerId, null),
  };
};

// エンジニアの配置の結果メッセージ(#157)。
export const formatEngineerPlacementMessage = (result: EngineerPlacementResult): string => {
  const text = getMessages().initialPlacement;
  if (result.ok) return text.engineerPlaced;
  switch (result.reason) {
    case 'notCandidate':
      return text.engineerNotCandidate;
    case 'noUnplacedEngineer':
      return text.noUnplacedEngineer;
    case 'overlapsItem':
      return text.engineerOverlapsItem;
  }
};

// アイテムの取消（×）ボタンの中心(#157)。見た目の四角（itemFootprint）の右上の角。四角の大きさが変わっても角に付く。
export const itemRemoveButtonCenter = (cell: PlacementCell): Point => {
  const footprint = itemFootprint(cell);
  return { x: footprint.x + footprint.width, y: footprint.y };
};

// エンジニアの取消（×）ボタンの中心から出現場所の円の中心までの、右・上それぞれのずれ(#157)。
// ボタンの左下の角が休暇マーカーの当たり判定（半径 SPAWN_MARKER_STYLE.radius の円）の外になる最小の整数（radius / √2 + size / 2 を切り上げ）。
export const ENGINEER_REMOVE_BUTTON_OFFSET = Math.ceil(
  SPAWN_MARKER_STYLE.radius / Math.SQRT2 + INITIAL_PLACEMENT_REMOVE_BUTTON.size / 2,
);

// エンジニアの取消（×）ボタンの中心(#157)。spawn はルートグリッド（60px）の出現セルで、円の中心から右上へ ENGINEER_REMOVE_BUTTON_OFFSET ずらす。
export const engineerRemoveButtonCenter = (spawn: GridCell): Point => {
  const center = cellCenter(spawn);
  return { x: center.x + ENGINEER_REMOVE_BUTTON_OFFSET, y: center.y - ENGINEER_REMOVE_BUTTON_OFFSET };
};
