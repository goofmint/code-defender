// アイテムの購入・配置・攻撃対象の選択。Phaser には依存しない（テスト可能にするため）。
// 通貨は資金(funds)。購入の資金変更は main.ts が changeFunds(…, 'item') を通す（倒産判定 #21 がそのまま動く）。
import { canAttack, findAttackTarget } from './attack';
import type { AttackTarget } from './attack';
import {
  ITEM_ATTACK_COOLDOWN_MS,
  ITEM_BLOCKED_RECTS,
  ITEM_BOX_SIZE,
  ITEM_MONTHLY_FEE_RATIO,
  ITEM_PRICE_TIER_BY_TYPE,
  ITEM_PRICE_TIERS,
  ITEM_ROUTE_CLEARANCE,
  ITEM_SHORT_NAMES,
  LINTER_HESITATION_PROBABILITY,
  PAIR_PROGRAMMER_FOLLOW_OFFSET,
  PLACEMENT_CELL_SIZE,
  PLACEMENT_COLS,
  PLACEMENT_ROWS,
  RELEASE_POINT_PULSE,
  SPAWN_MARKER_DECOR_STYLE,
} from './config';
import { CELL_SIZE, FIELD_HEIGHT, FIELD_WIDTH } from './field';
import { formatShortAmount, getMessages, interpolate } from './i18n';
import { pointInRect, rectIntersectsCircle, rectIntersectsThickSegment, rectsOverlap, rectWithin } from './geometry';
import type { Rect } from './geometry';
import {
  getItemPlacement,
  getItemRange,
  ITEM_DEFINITIONS,
  ITEM_TYPES,
  isFollowItem,
  isTargetInItemRange,
  isWithinRange,
  itemTargetsNormalCode,
} from './item';
import type { ItemEffect, ItemPayment, ItemType } from './item';
import { getReleasePointLabelBounds, RELEASE_POINT_CENTER } from './releasePoint';
import { cellCenter, routePixelPoints, SPAWN_MARKER_STYLE } from './route';
import type { GridCell, Point, Route } from './route';

export type ItemPriceTier = keyof typeof ITEM_PRICE_TIERS;

// アイテムを置いたときに scene.events で発行するイベント名。
export const ITEM_PLACED_EVENT = 'item-placed';
// 置かないアイテム（購入時に発動 #58）を使ったときに scene.events で発行するイベント名。
export const ITEM_USED_EVENT = 'item-used';

// 配置グリッド(#151)のセル座標。GridCell と同じ形だが単位は PLACEMENT_CELL_SIZE（16px）。ルートの GridCell（CELL_SIZE=60px）とは混ぜない。
export type PlacementCell = GridCell;

export type PlacedItem = {
  readonly id: number;
  readonly itemType: ItemType;
  // 置いた配置グリッド（16px #151）のセル。ルートの 60px セルではない。中心は placementCellCenter、見た目の範囲は itemFootprint。
  readonly cell: PlacementCell;
  // 最後に攻撃した時刻（ミリ秒）。まだ攻撃していなければ null（置いた直後からクールダウンなしで攻撃できる）。
  readonly lastAttackTime: number | null;
};

export type ItemPlacedPayload = {
  readonly item: PlacedItem;
  readonly price: number;
};

export type ItemUsedPayload = {
  readonly itemType: ItemType;
  readonly price: number;
};

// リスタート時の初期状態。配置なし・id は 0 から。
export type ItemState = {
  readonly placedItems: readonly PlacedItem[];
  readonly nextId: number;
};

export const createItemState = (): ItemState => ({ placedItems: [], nextId: 0 });

// アイテムの価格（円）。段階表と種類ごとの段階は引数で差し替えられる（既定値は config.ts）。
export const getItemPrice = (
  itemType: ItemType,
  tiers: Readonly<Record<ItemPriceTier, number>> = ITEM_PRICE_TIERS,
  tierByType: Readonly<Record<ItemType, ItemPriceTier>> = ITEM_PRICE_TIER_BY_TYPE,
): number => tiers[tierByType[itemType]];

// ピクセル座標を含むセル（汎用。既定はルートグリッドの CELL_SIZE）。セル境界ちょうどは次のセル（x=60 → col 1、x=59.99 → col 0）。
// フィールド外は範囲外のセル（負や FIELD_COLS 以上）をそのまま返す。
export const pointToCell = (point: Point, cellSize: number = CELL_SIZE): GridCell => ({
  col: Math.floor(point.x / cellSize),
  row: Math.floor(point.y / cellSize),
});

// ピクセル座標を含む配置グリッド(#151)のセル。セル境界ちょうどは次のセル（x=16 → col 1、x=15.99 → col 0）。
// フィールド外は範囲外のセルをそのまま返す。置けるかは isPlaceableCell が判定する。
export const pointToPlacementCell = (point: Point): PlacementCell => pointToCell(point, PLACEMENT_CELL_SIZE);

// 配置グリッド(#151)のセルの中心（ピクセル）。アイテムの描画位置と、攻撃・効果の起点。
export const placementCellCenter = (cell: PlacementCell): Point => ({
  x: (cell.col + 0.5) * PLACEMENT_CELL_SIZE,
  y: (cell.row + 0.5) * PLACEMENT_CELL_SIZE,
});

// アイテムのフットプリント(#151)。セルの中心を中心とする一辺 ITEM_BOX_SIZE の正方形で、描画する四角と同じ範囲。
export const itemFootprint = (cell: PlacementCell): Rect => {
  const center = placementCellCenter(cell);
  return {
    x: center.x - ITEM_BOX_SIZE / 2,
    y: center.y - ITEM_BOX_SIZE / 2,
    width: ITEM_BOX_SIZE,
    height: ITEM_BOX_SIZE,
  };
};

// フィールド全体の矩形。
const FIELD_RECT: Rect = { x: 0, y: 0, width: FIELD_WIDTH, height: FIELD_HEIGHT };

// 点がフィールドの内側か（0 ≤ x < FIELD_WIDTH かつ 0 ≤ y < FIELD_HEIGHT）。初期配置(#47)の押下をセルに変換する前に確かめる。
export const isPointInField = (point: Point): boolean => pointInRect(point, FIELD_RECT);

// 出現場所の円の外側リング（#144）の外周までの半径。フットプリントがこの円に重なると置けない(#151)。
export const SPAWN_CLEARANCE_RADIUS =
  SPAWN_MARKER_STYLE.radius + SPAWN_MARKER_DECOR_STYLE.ringGap + SPAWN_MARKER_DECOR_STYLE.ringWidth / 2;
// リリース地点のパルス（#144）の最大半径。フットプリントがこの円に重なると置けない(#151)。
export const RELEASE_CLEARANCE_RADIUS = RELEASE_POINT_PULSE.maxRadius;

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
  // UI と重なる矩形（ピクセル）。既定は config の ITEM_BLOCKED_RECTS。初期配置(#47)では INITIAL_PLACEMENT_UI_BOUNDS を足す。
  readonly blockedRects?: readonly Rect[];
};

// フットプリントがルートの線（中心線から ITEM_ROUTE_CLEARANCE 未満）に重なるか。区間ごとに判定する。
const intersectsRoute = (footprint: Rect, route: Route): boolean => {
  const points = routePixelPoints(route);
  return points.slice(1).some((to, i) => rectIntersectsThickSegment(footprint, points[i], to, ITEM_ROUTE_CLEARANCE));
};

// 置ける地形か(#151)。既存アイテムは見ない。判定順: 整数かつ配置グリッドの範囲内 → フットプリントがフィールドに収まる →
// 置けない矩形（UI） → ルートの線のクリアランス → 出現場所の円 → リリース地点の円と「リリース」のラベル。
// セル単位の予約はせず、見た目（描いている物）に重なるかだけで判定する。
const isOpenTerrain = (cell: PlacementCell, context: PlacementContext): boolean => {
  if (!Number.isInteger(cell.col) || !Number.isInteger(cell.row)) return false;
  if (cell.col < 0 || cell.col >= PLACEMENT_COLS || cell.row < 0 || cell.row >= PLACEMENT_ROWS) return false;
  const footprint = itemFootprint(cell);
  if (!rectWithin(footprint, FIELD_RECT)) return false;
  if ((context.blockedRects ?? ITEM_BLOCKED_RECTS).some((rect) => rectsOverlap(footprint, rect))) return false;
  if (context.routes.some((route) => intersectsRoute(footprint, route))) return false;
  if (context.routes.some((route) => rectIntersectsCircle(footprint, cellCenter(route.spawn), SPAWN_CLEARANCE_RADIUS))) {
    return false;
  }
  if (rectIntersectsCircle(footprint, RELEASE_POINT_CENTER, RELEASE_CLEARANCE_RADIUS)) return false;
  return !rectsOverlap(footprint, getReleasePointLabelBounds());
};

// フットプリントが既存アイテムのフットプリントと重なるか（辺の接触は重なりとしない）。
// 主人公についてまわるアイテム（ペアプロ相棒 #58）はセルにとどまらないので数えない。
const isOccupied = (cell: PlacementCell, placedItems: readonly PlacedItem[]): boolean => {
  const footprint = itemFootprint(cell);
  return placedItems.some((item) => !isFollowItem(item.itemType) && rectsOverlap(itemFootprint(item.cell), footprint));
};

// アイテムを置けるセルか。既存アイテムのフットプリントと重なるセルは不可。
export const isPlaceableCell = (cell: PlacementCell, context: PlacementContext): boolean =>
  isOpenTerrain(cell, context) && !isOccupied(cell, context.placedItems);

// noEligibleIncident はロールバックボタン(#58)専用。取り消せる直前の障害がない。
export type PurchaseFailReason =
  | 'gameOver'
  | 'unknownItem'
  | 'notPlaceable'
  | 'occupied'
  | 'insufficientFunds'
  | 'noEligibleIncident';

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
// 置かないアイテム（placement: none #58）は purchaseInstantItem で買う。ここに渡すと notPlaceable。
// 主人公についてまわるアイテム（ペアプロ相棒 #58）はセルにとどまらないので、置けない場所・既にあるの判定をしない（cell は購入時の位置として記録する）。
export const purchaseItem = (
  state: PurchaseState,
  itemType: string,
  cell: PlacementCell,
  options: PurchaseOptions,
): PurchaseResult => {
  if (state.gameOver) return { ok: false, reason: 'gameOver' };
  if (!isItemType(itemType)) return { ok: false, reason: 'unknownItem' };
  if (getItemPlacement(itemType) === 'none') return { ok: false, reason: 'notPlaceable' };
  if (!isFollowItem(itemType)) {
    if (!isOpenTerrain(cell, { ...options, placedItems: state.placedItems })) {
      return { ok: false, reason: 'notPlaceable' };
    }
    if (isOccupied(cell, state.placedItems)) {
      return { ok: false, reason: 'occupied' };
    }
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

export type InstantPurchaseResult =
  | {
      readonly ok: true;
      readonly itemType: ItemType;
      readonly fundsAfter: number;
      readonly price: number;
    }
  | { readonly ok: false; readonly reason: PurchaseFailReason };

export type InstantPurchaseState = {
  readonly funds: number;
  readonly gameOver: boolean;
  // 取り消せる直前の障害があるか（ロールバックボタン #58 の判定だけに使う）。
  readonly hasRollbackTarget: boolean;
};

// 置かないアイテム（placement: none #58）を買う。セルは見ない。placedItems にも入れない。
// 判定順: ゲームオーバー → 不明なアイテム → 置くアイテム（notPlaceable。purchaseItem で買う） → ロールバックの対象なし → 資金不足。
// 資金がちょうど価格なら買えて 0 になる。効果の発動は呼び出し側（MainScene）が行う。入力は変更しない。
export const purchaseInstantItem = (
  state: InstantPurchaseState,
  itemType: string,
  options: Pick<PurchaseOptions, 'tiers' | 'tierByType'> = {},
): InstantPurchaseResult => {
  if (state.gameOver) return { ok: false, reason: 'gameOver' };
  if (!isItemType(itemType)) return { ok: false, reason: 'unknownItem' };
  if (getItemPlacement(itemType) !== 'none') return { ok: false, reason: 'notPlaceable' };
  if (ITEM_DEFINITIONS[itemType].effect === 'rollback' && !state.hasRollbackTarget) {
    return { ok: false, reason: 'noEligibleIncident' };
  }
  const price = getItemPrice(itemType, options.tiers, options.tierByType);
  if (state.funds < price) return { ok: false, reason: 'insufficientFunds' };
  return { ok: true, itemType, fundsAfter: state.funds - price, price };
};

// 購入結果のメッセージ。ゲームオーバー中は表示しないので空文字。置かないアイテム(#58)は「〜を使いました」。
export const formatItemMessage = (result: PurchaseResult | InstantPurchaseResult, itemType: string): string => {
  const messages = getMessages();
  if (result.ok) {
    return 'item' in result
      ? interpolate(messages.items.placed, { name: ITEM_SHORT_NAMES[result.item.itemType] })
      : interpolate(messages.items.used, { name: ITEM_SHORT_NAMES[result.itemType] });
  }
  switch (result.reason) {
    case 'gameOver':
      return '';
    case 'unknownItem':
      return interpolate(messages.common.unknownItem, { item: itemType });
    case 'insufficientFunds':
      return messages.common.insufficientFunds;
    case 'noEligibleIncident':
      return messages.items.noEligibleIncident;
    default:
      return messages.common.notPlaceable;
  }
};

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

// アイテムのメニュー(#156)の枠の文言。「Linter 2.5万円」。月額払いは「CodeRabbit 10万/月」（幅に収めるため「円」を省く）。キー名（4〜9）は出さない。
// 月額払いは精算と同じ月額（getItemMonthlyFee）を表示する。
// 英語は「Linter ¥25K」「CodeRabbit ¥100K/mo」(#158)。金額の計算は変えず、短い金額の書式（formatShortAmount）だけを言語で変える。
export const formatItemOption = (itemType: ItemType, ratio: number = ITEM_MONTHLY_FEE_RATIO): string => {
  const price = isMonthlyItem(itemType)
    ? formatShortAmount(getItemMonthlyFee(itemType, ratio), 'monthly')
    : formatShortAmount(getItemPrice(itemType), 'oneTime');
  return interpolate(getMessages().items.option, { name: ITEM_SHORT_NAMES[itemType], price });
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
// origin は攻撃の起点。既定は置いたセル（配置グリッド #151）の中心。主人公についてまわるアイテム（ペアプロ相棒 #58）は主人公の位置からのずれを渡す。
export const findItemTarget = <T extends AttackTarget>(
  item: PlacedItem,
  codes: readonly T[],
  origin: Point = placementCellCenter(item.cell),
): T | null =>
  findTargetFor(
    {
      position: origin,
      range: getItemRange(item.itemType),
      targetsNormalCode: itemTargetsNormalCode(item.itemType),
    },
    codes,
  );

// アイテムの攻撃間隔（ミリ秒）。アイテム別の間隔（Linter #58）があればそれ、なければ共通の ITEM_ATTACK_COOLDOWN_MS。
export const getItemAttackCooldownMs = (itemType: ItemType): number =>
  ITEM_DEFINITIONS[itemType].attackCooldownMs ?? ITEM_ATTACK_COOLDOWN_MS;

// 攻撃できるか。初回(null)は常に可能。経過時間がクールダウン以上なら可能。
export const canItemAttack = (
  now: number,
  lastAttackTime: number | null,
  cooldownMs: number = ITEM_ATTACK_COOLDOWN_MS,
): boolean => canAttack(now, lastAttackTime, cooldownMs);

// アイテムの攻撃・効果の起点(#58)。主人公についてまわるアイテム（ペアプロ相棒）は主人公の位置 + ずれ、それ以外は置いたセルの中心。
export const getItemOrigin = (
  item: PlacedItem,
  playerPosition: Point,
  followOffset: Point = PAIR_PROGRAMMER_FOLLOW_OFFSET,
): Point =>
  isFollowItem(item.itemType)
    ? { x: playerPosition.x + followOffset.x, y: playerPosition.y + followOffset.y }
    : placementCellCenter(item.cell);

// 効果 effect のアイテムのうち、point を範囲に含む（置いたセルの中心から範囲以内の）台数(#58)。境界ちょうども範囲内。
// コーヒーマシン（担当ルートの出現場所）・ラバーダック（コードの位置）・書き置き（リリース地点）で使う。入力は変更しない。
export const countItemsCovering = (
  placedItems: readonly PlacedItem[],
  effect: ItemEffect,
  point: Point,
): number =>
  placedItems.filter(
    (item) =>
      ITEM_DEFINITIONS[item.itemType].effect === effect &&
      isTargetInItemRange(item.itemType, placementCellCenter(item.cell), point),
  ).length;

// Linter(#58) が発射を見送るか（企画書「怪しい見た目の正常コードに反応しかけて、ときどき止まる」）。
// 起点から射程内に正常なコードがあり、random(0以上1未満) が確率未満なら見送る。Linter 以外は見送らない。
// 見送るかの判定だけで、正常なコードを攻撃することはない（対象の選択は findItemTarget）。
export const shouldItemHesitate = (
  itemType: ItemType,
  origin: Point,
  codes: readonly AttackTarget[],
  random: () => number,
  probability: number = LINTER_HESITATION_PROBABILITY,
): boolean => {
  if (itemType !== 'linter') return false;
  const range = getItemRange(itemType);
  if (!codes.some((code) => code.kind === 'normal' && isWithinRange(origin, code.position, range))) return false;
  return random() < probability;
};

// ラバーダック(#58)で正体を暴く不正なコード。ラバーダックの範囲内にいて、まだ暴いていない（revealed が true でない）ものだけ。入力は変更しない。
export const findCodesToReveal = <T extends AttackTarget & { readonly revealed?: boolean }>(
  placedItems: readonly PlacedItem[],
  codes: readonly T[],
): T[] =>
  codes.filter(
    (code) =>
      code.kind === 'malicious' && code.revealed !== true && countItemsCovering(placedItems, 'reveal', code.position) > 0,
  );

// 伝説のシニアの書き置き(#58)で障害を防ぐか。リリース地点が書き置きの範囲内なら防ぐ。
export const isIncidentPreventedByNote = (
  placedItems: readonly PlacedItem[],
  releasePoint: Point = RELEASE_POINT_CENTER,
): boolean => countItemsCovering(placedItems, 'seniorNote', releasePoint) > 0;
