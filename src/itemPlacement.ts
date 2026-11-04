// アイテムの購入・配置・攻撃対象の選択。Phaser には依存しない（テスト可能にするため）。
// 通貨は資金(funds)。購入の資金変更は main.ts が changeFunds(…, 'item') を通す（倒産判定 #21 がそのまま動く）。
import { canAttack, findAttackTarget } from './attack';
import type { AttackTarget } from './attack';
import {
  ITEM_ATTACK_COOLDOWN_MS,
  ITEM_BLOCKED_CELLS,
  ITEM_BLOCKED_ROWS,
  ITEM_MONTHLY_FEE_RATIO,
  ITEM_PRICE_TIER_BY_TYPE,
  ITEM_PRICE_TIERS,
  ITEM_SHORT_NAMES,
  RELEASE_POINT_CELL,
} from './config';
import { CELL_SIZE, FIELD_COLS, FIELD_ROWS } from './field';
import { getItemRange, ITEM_DEFINITIONS, ITEM_TYPES, itemTargetsNormalCode } from './item';
import type { ItemPayment, ItemType } from './item';
import { cellCenter } from './route';
import type { GridCell, Point, Route } from './route';

export type ItemPriceTier = keyof typeof ITEM_PRICE_TIERS;

// アイテムを置いたときに scene.events で発行するイベント名。
export const ITEM_PLACED_EVENT = 'item-placed';

export type PlacedItem = {
  readonly id: number;
  readonly itemType: ItemType;
  readonly cell: GridCell;
  // 最後に攻撃した時刻（ミリ秒）。まだ攻撃していなければ null（置いた直後からクールダウンなしで攻撃できる）。
  readonly lastAttackTime: number | null;
};

export type ItemPlacedPayload = {
  readonly item: PlacedItem;
  readonly price: number;
};

// リスタート時の初期状態。配置なし・id は 0 から。
export type ItemState = {
  readonly placedItems: readonly PlacedItem[];
  readonly nextId: number;
};

export const createItemState = (): ItemState => ({ placedItems: [], nextId: 0 });

const isSameCell = (a: GridCell, b: GridCell): boolean => a.col === b.col && a.row === b.row;

// アイテムの価格（円）。段階表と種類ごとの段階は引数で差し替えられる（既定値は config.ts）。
export const getItemPrice = (
  itemType: ItemType,
  tiers: Readonly<Record<ItemPriceTier, number>> = ITEM_PRICE_TIERS,
  tierByType: Readonly<Record<ItemType, ItemPriceTier>> = ITEM_PRICE_TIER_BY_TYPE,
): number => tiers[tierByType[itemType]];

// ピクセル座標を含むセル。セル境界ちょうどは次のセル（x=60 → col 1、x=59.99 → col 0）。
// フィールド外は範囲外のセル（負や FIELD_COLS 以上）をそのまま返す。置けるかは isPlaceableCell が判定する。
export const pointToCell = (point: Point, cellSize: number = CELL_SIZE): GridCell => ({
  col: Math.floor(point.x / cellSize),
  row: Math.floor(point.y / cellSize),
});

// ルートが通るセル（折れ点の間のセルも含む）。出現セルとリリースセルも含まれる。
export const getRouteCells = (route: Route): GridCell[] => {
  const cells: GridCell[] = [];
  route.waypoints.forEach((to, index) => {
    const from = index === 0 ? to : route.waypoints[index - 1];
    const colStep = Math.sign(to.col - from.col);
    const rowStep = Math.sign(to.row - from.row);
    const length = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
    for (let i = 0; i <= length; i++) {
      cells.push({ col: from.col + colStep * i, row: from.row + rowStep * i });
    }
  });
  return cells;
};

export type PlacementContext = {
  readonly routes: readonly Route[];
  readonly placedItems: readonly PlacedItem[];
  // UI と重なる行。既定は config の ITEM_BLOCKED_ROWS。
  readonly blockedRows?: readonly number[];
  // HUD と重なるセル。既定は config の ITEM_BLOCKED_CELLS。
  readonly blockedCells?: readonly GridCell[];
};

// 置ける地形か（フィールド内・ルート/出現/リリース地点・置けない行/セルでない）。既存アイテムは見ない。
const isOpenTerrain = (cell: GridCell, context: PlacementContext): boolean => {
  if (!Number.isInteger(cell.col) || !Number.isInteger(cell.row)) return false;
  if (cell.col < 0 || cell.col >= FIELD_COLS || cell.row < 0 || cell.row >= FIELD_ROWS) return false;
  if ((context.blockedRows ?? ITEM_BLOCKED_ROWS).includes(cell.row)) return false;
  if ((context.blockedCells ?? ITEM_BLOCKED_CELLS).some((blocked) => isSameCell(blocked, cell))) return false;
  if (isSameCell(cell, RELEASE_POINT_CELL)) return false;
  return !context.routes.some((route) => getRouteCells(route).some((c) => isSameCell(c, cell)));
};

// アイテムを置けるセルか。既にアイテムがあるセルは不可。
export const isPlaceableCell = (cell: GridCell, context: PlacementContext): boolean =>
  isOpenTerrain(cell, context) && !context.placedItems.some((item) => isSameCell(item.cell, cell));

export type PurchaseFailReason =
  | 'gameOver'
  | 'unknownItem'
  | 'notPlaceable'
  | 'occupied'
  | 'insufficientFunds';

export type PurchaseResult =
  | {
      readonly ok: true;
      readonly item: PlacedItem;
      readonly placedItems: readonly PlacedItem[];
      readonly fundsAfter: number;
      readonly price: number;
    }
  | { readonly ok: false; readonly reason: PurchaseFailReason };

export type PurchaseState = {
  readonly funds: number;
  readonly placedItems: readonly PlacedItem[];
  readonly nextId: number;
  readonly gameOver: boolean;
};

export type PurchaseOptions = Omit<PlacementContext, 'placedItems'> & {
  readonly tiers?: Readonly<Record<ItemPriceTier, number>>;
  readonly tierByType?: Readonly<Record<ItemType, ItemPriceTier>>;
};

const isItemType = (value: string): value is ItemType =>
  (ITEM_TYPES as readonly string[]).includes(value);

// アイテムを買って置く。判定順: ゲームオーバー → 不明なアイテム → 置けない場所 → 既にある → 資金不足。
// 資金がちょうど価格なら買えて 0 になる。入力は変更しない。
export const purchaseItem = (
  state: PurchaseState,
  itemType: string,
  cell: GridCell,
  options: PurchaseOptions,
): PurchaseResult => {
  if (state.gameOver) return { ok: false, reason: 'gameOver' };
  if (!isItemType(itemType)) return { ok: false, reason: 'unknownItem' };
  if (!isOpenTerrain(cell, { ...options, placedItems: state.placedItems })) {
    return { ok: false, reason: 'notPlaceable' };
  }
  if (state.placedItems.some((item) => isSameCell(item.cell, cell))) {
    return { ok: false, reason: 'occupied' };
  }
  const price = getItemPrice(itemType, options.tiers, options.tierByType);
  if (state.funds < price) return { ok: false, reason: 'insufficientFunds' };
  const item: PlacedItem = { id: state.nextId, itemType, cell, lastAttackTime: null };
  return {
    ok: true,
    item,
    placedItems: [...state.placedItems, item],
    fundsAfter: state.funds - price,
    price,
  };
};

// 購入結果のメッセージ。ゲームオーバー中は表示しないので空文字。
export const formatItemMessage = (result: PurchaseResult, itemType: string): string => {
  if (result.ok) return `${ITEM_SHORT_NAMES[result.item.itemType]}を置きました`;
  switch (result.reason) {
    case 'gameOver':
      return '';
    case 'unknownItem':
      return `不明なアイテムです: ${itemType}`;
    case 'insufficientFunds':
      return '資金が足りません';
    default:
      return 'そこには置けません';
  }
};

// ボタン表示の番号は 4 から（1〜3 は雇うキー）。
const ITEM_BUY_KEY_OFFSET = 4;

export const getItemPayment = (itemType: ItemType): ItemPayment => ITEM_DEFINITIONS[itemType].payment;

export const isMonthlyItem = (itemType: ItemType): boolean => getItemPayment(itemType) === 'monthly';

// 月額アイテム1個の月額。購入価格 × 倍率を四捨五入。1回払いは 0。
// 倍率が負・NaN・Infinity のときは 0 として扱う。ボタン表示と月の精算（itemFee.ts）で同じ計算を使う。
export const getItemMonthlyFee = (
  itemType: ItemType,
  ratio: number = ITEM_MONTHLY_FEE_RATIO,
): number => {
  if (!isMonthlyItem(itemType)) return 0;
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 0;
  return Math.round(getItemPrice(itemType) * safeRatio);
};

// 購入ボタンの文言。「[5] Linter 5万円」。月額払いは「[4] CodeRabbit 20万/月」（ボタン幅 154px に収めるため「円」を省く）。
// 月額払いは精算と同じ月額（getItemMonthlyFee）を表示する。
export const formatItemButton = (
  index: number,
  itemType: ItemType,
  ratio: number = ITEM_MONTHLY_FEE_RATIO,
): string => {
  const head = `[${index + ITEM_BUY_KEY_OFFSET}] ${ITEM_SHORT_NAMES[itemType]}`;
  if (isMonthlyItem(itemType)) return `${head} ${getItemMonthlyFee(itemType, ratio) / 10000}万/月`;
  return `${head} ${getItemPrice(itemType) / 10000}万円`;
};

// 攻撃対象の候補。設定が false なら不正なコードだけ、true なら正常も含む。入力は変更しない。
export const filterItemTargets = <T extends AttackTarget>(
  codes: readonly T[],
  targetsNormalCode: boolean,
): T[] => codes.filter((code) => targetsNormalCode || code.kind === 'malicious');

export type ItemTargetQuery = {
  readonly position: Point;
  readonly range: number;
  readonly targetsNormalCode: boolean;
};

// 位置・範囲・設定から範囲内で最も近い対象を選ぶ。境界ちょうどは範囲内。なければ null。
// 同じ距離のときは配列で先にあるもの（findAttackTarget と同じ。企画書にないため仮の扱い）。
export const findTargetFor = <T extends AttackTarget>(
  query: ItemTargetQuery,
  codes: readonly T[],
): T | null =>
  findAttackTarget(query.position, filterItemTargets(codes, query.targetsNormalCode), query.range);

// アイテムの範囲内で最も近い攻撃対象。アイテムの targetsNormalCode が false なら正常なコードは近くても除く。
export const findItemTarget = <T extends AttackTarget>(
  item: PlacedItem,
  codes: readonly T[],
): T | null =>
  findTargetFor(
    {
      position: cellCenter(item.cell),
      range: getItemRange(item.itemType),
      targetsNormalCode: itemTargetsNormalCode(item.itemType),
    },
    codes,
  );

// 攻撃できるか。初回(null)は常に可能。経過時間がクールダウン以上なら可能。
export const canItemAttack = (
  now: number,
  lastAttackTime: number | null,
  cooldownMs: number = ITEM_ATTACK_COOLDOWN_MS,
): boolean => canAttack(now, lastAttackTime, cooldownMs);
