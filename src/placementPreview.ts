// 置けるかどうかを示す枠（配置プレビュー #162）の中身を決める純粋関数。Phaser には依存しない（テスト可能にするため）。
// 枠の可否は、確定（クリック・購入）と同じ判定関数の結果だけから決める。プレビューと確定の結果が食い違わないようにするため。
import { placeInitialItem } from './initialPlacement';
import type { InitialPlacementContext, InitialPlacementSelection, InitialPlacementState } from './initialPlacement';
import { isPlaceableCell, isPointInField, pointToPlacementCell } from './itemPlacement';
import type { PlacementCell, PlacementContext } from './itemPlacement';
import type { Point } from './route';

// 枠の状態。出さない（visible: false）か、配置グリッド（16px #151）のセルに出して置けるか（placeable）を色で示すか。
export type PlacementPreviewView =
  | { readonly visible: false }
  | { readonly visible: true; readonly cell: PlacementCell; readonly placeable: boolean };

export const HIDDEN_PLACEMENT_PREVIEW: PlacementPreviewView = { visible: false };

// 2つの枠の状態が同じか。同じなら描き直さない（毎フレーム描き直さないため）。
export const isSamePlacementPreview = (a: PlacementPreviewView, b: PlacementPreviewView): boolean => {
  if (!a.visible || !b.visible) return a.visible === b.visible;
  return a.cell.col === b.cell.col && a.cell.row === b.cell.row && a.placeable === b.placeable;
};

// 初期配置(#47)のポインターの下の枠。押下（onInitialPlacementPointerDown）と同じ条件で出し分ける:
// ボタン・×ボタン・メニューなどの上（overUi）とフィールド外は出さない。アイテムを選んでいないとき（未選択・エンジニア）も出さない。
// 可否は押下と同じ placeInitialItem の結果（地形・既にある・ポイント不足・置かないアイテム）。結果の状態は使わない（入力は変えない）。
export const getSetupPlacementPreview = (
  point: Point,
  overUi: boolean,
  selection: InitialPlacementSelection,
  state: InitialPlacementState,
  context: InitialPlacementContext,
): PlacementPreviewView => {
  if (overUi || !isPointInField(point) || selection.kind !== 'item') return HIDDEN_PLACEMENT_PREVIEW;
  const cell = pointToPlacementCell(point);
  return { visible: true, cell, placeable: placeInitialItem(state, selection.itemType, cell, context).ok };
};

// プレイ中の枠。主人公の位置を含むセル（購入で置くセル）に出し、可否は既定の置けない範囲（ITEM_BLOCKED_RECTS）での isPlaceableCell。
// 何を買うかはまだ決まっていないので、地形と既存アイテムだけを見る（ペアプロ相棒・置かないアイテムの例外や資金は見ない）。
export const getPlayingPlacementPreview = (playerPosition: Point, context: PlacementContext): PlacementPreviewView => {
  const cell = pointToPlacementCell(playerPosition);
  return { visible: true, cell, placeable: isPlaceableCell(cell, context) };
};
