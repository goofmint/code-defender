// ステージポイントによる初期配置(#47)の純粋関数。Phaser には依存しない（テスト可能にするため）。
// ステージポイントは資金(funds)とは別の単位。資金は変えない（changeFunds は通さない）。仮の規則は config.ts の #47 の注記を参照。
import {
  INITIAL_PLACEMENT_TEXT,
  ITEM_PRICE_TIER_BY_TYPE,
  ITEM_SHORT_NAMES,
  STAGE_POINT_COST_BY_TIER,
  STAGE_POINTS_INITIAL,
} from './config';
import { getItemPlacement, ITEM_TYPES } from './item';
import type { ItemType } from './item';
import { createItemState, isPlaceableCell } from './itemPlacement';
import type { ItemPriceTier, ItemState, PlacedItem, PlacementContext } from './itemPlacement';
import type { GridCell } from './route';

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

export type InitialPlacementFailReason = 'unknownItem' | 'notPlaceable' | 'occupied' | 'insufficientPoints';

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
};

const isItemType = (value: string): value is ItemType => (ITEM_TYPES as readonly string[]).includes(value);

const isSameCell = (a: GridCell, b: GridCell): boolean => a.col === b.col && a.row === b.row;

// ステージポイントでアイテムを置く。判定順: 不明なアイテム → 置かないアイテム（placement: none #58）・置けない場所 → 既にある → ポイント不足。
// 置かないアイテムは購入時に効果を発動するもので、セルに置けないため初期配置では notPlaceable にする。
// ポイントがちょうどコストなら置けて 0 になる。id と lastAttackTime は purchaseItem と同じ（id は nextId、lastAttackTime は null）。
// 失敗時は理由だけを返し、入力は変更しない。
export const placeInitialItem = (
  state: InitialPlacementState,
  itemType: string,
  cell: GridCell,
  context: InitialPlacementContext,
): InitialPlacementResult => {
  if (!isItemType(itemType)) return { ok: false, reason: 'unknownItem' };
  if (getItemPlacement(itemType) === 'none') return { ok: false, reason: 'notPlaceable' };
  const placedItems = state.itemState.placedItems;
  // 既存アイテムを除いた地形だけで判定してから、占有を別に判定する（purchaseItem と同じく occupied を区別するため）。
  if (!isPlaceableCell(cell, { ...context, placedItems: [] })) return { ok: false, reason: 'notPlaceable' };
  if (placedItems.some((item) => isSameCell(item.cell, cell))) return { ok: false, reason: 'occupied' };
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

// セルに置いたアイテムを撤去して、そのコストを全額返す。空のセルは notFound（入力は変更しない）。
// nextId は戻さない（撤去したアイテムの id を再利用しない）。
export const removeInitialItem = (
  state: InitialPlacementState,
  cell: GridCell,
  costTable: Readonly<Record<ItemPriceTier, number>> = STAGE_POINT_COST_BY_TIER,
): InitialRemovalResult => {
  const item = state.itemState.placedItems.find((placed) => isSameCell(placed.cell, cell));
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
  if (result.ok) {
    const name = ITEM_SHORT_NAMES[result.item.itemType];
    return 'refund' in result ? `${name}を撤去しました` : `${name}を置きました`;
  }
  switch (result.reason) {
    case 'unknownItem':
      return `不明なアイテムです: ${itemType}`;
    case 'insufficientPoints':
      return 'ステージポイントが足りません';
    case 'notFound':
      return 'そこにはアイテムがありません';
    default:
      return 'そこには置けません';
  }
};

// 初期配置パネルの4行（残ポイント・選択中のアイテムとコスト・操作説明2行）。行数は config の INITIAL_PLACEMENT_PANEL_LINES と同じ。
// 例: 「初期配置 残りポイント: 6pt」「選択: Linter 1pt」。キーは購入ボタンに出ているので、パネル幅に収めるため省く。
export const formatInitialPlacementPanel = (points: number, selected: ItemType): readonly string[] => {
  const text = INITIAL_PLACEMENT_TEXT;
  return [
    `${text.title} ${text.points}${points}${text.pointUnit}`,
    `${text.selected}${ITEM_SHORT_NAMES[selected]} ${getStagePointCost(selected)}${text.pointUnit}`,
    text.instructionSelect,
    text.instructionPlace,
  ];
};
