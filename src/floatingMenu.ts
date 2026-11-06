// 右上のアイコンで開くメニューと、出現地点で開くエンジニアのポップオーバー(#156)の状態と配置。Phaser には依存しない（テスト可能にするため）。
// render.ts の描画（drawMenuIcons・drawEngineerMenu など）と hudLayout.test.ts が同じ配置の計算を使う。
// パネルは「行」を上から縦に並べる。行は文字の行（lines 行ぶんの高さ）か、ボタンの行（count 個のボタンを横に等分して並べる）。
import {
  AI_AGENT_BUTTON_ORDER,
  ENGINEER_POPOVER_MARGIN,
  ENGINEER_POPOVER_OFFSET_X,
  ENGINEER_POPOVER_WIDTH,
  ENGINEER_RANKS,
  ITEM_PAGE_SIZE,
  MENU_BUTTON_GAP_X,
  MENU_BUTTON_HEIGHT,
  MENU_ICON_GAP,
  MENU_ICON_RIGHT,
  MENU_ICON_SIZE,
  MENU_ICON_TOP,
  MENU_LINE_HEIGHT,
  MENU_PANEL_GAP_Y,
  MENU_PANEL_PADDING,
  MENU_PANEL_WIDTH,
  MENU_ROW_GAP,
  VACATION_HINT_LINES,
} from './config';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';
import type { Rect } from './geometry';
import { getRefactoringRatioOptions } from './refactoringRatioControl';
import type { Point } from './route';

// 右上のアイコン（左から順に並べる）。
export const MENU_KINDS = ['engineer', 'item', 'balance'] as const;
export type MenuKind = (typeof MENU_KINDS)[number];

// アイコンを押したあとに開いているメニュー。開いているのと同じアイコンなら閉じ（null）、別のアイコンならそちらに切り替える（一度に1つだけ開く）。
export const toggleMenu = (current: MenuKind | null, clicked: MenuKind): MenuKind | null =>
  current === clicked ? null : clicked;

// アイコンの矩形。右端のアイコン（開発バランス）の右端が MENU_ICON_RIGHT で、左へ MENU_ICON_GAP ずつあけて並べる。
export const menuIconRect = (kind: MenuKind): Rect => {
  const fromRight = MENU_KINDS.length - 1 - MENU_KINDS.indexOf(kind);
  return {
    x: MENU_ICON_RIGHT - MENU_ICON_SIZE - fromRight * (MENU_ICON_SIZE + MENU_ICON_GAP),
    y: MENU_ICON_TOP,
    width: MENU_ICON_SIZE,
    height: MENU_ICON_SIZE,
  };
};

// パネルの1行の種類。text は lines 行ぶんの文字、buttons は count 個のボタンを横に並べた1行。
export type PanelRowSpec =
  | { readonly kind: 'text'; readonly lines: number }
  | { readonly kind: 'buttons'; readonly count: number };

const textRow = (lines: number): PanelRowSpec => ({ kind: 'text', lines });
const buttonRow = (count: number): PanelRowSpec => ({ kind: 'buttons', count });

const rowHeight = (row: PanelRowSpec): number => (row.kind === 'text' ? row.lines * MENU_LINE_HEIGHT : MENU_BUTTON_HEIGHT);

// パネルの高さ。内側の余白（上下）＋各行の高さ＋行と行の間。行がなければ余白だけ。
export const panelHeight = (rows: readonly PanelRowSpec[]): number =>
  MENU_PANEL_PADDING * 2 +
  rows.reduce((sum, row) => sum + rowHeight(row), 0) +
  Math.max(0, rows.length - 1) * MENU_ROW_GAP;

export type PanelLayout = {
  // パネル全体（背景）の矩形。
  readonly rect: Rect;
  // 行ごとの矩形（rows と同じ順）。幅はパネルの内側（余白を除く）。
  readonly rows: readonly Rect[];
};

// 左上 (x, y)・幅 width のパネルに、rows を上から順に並べる。
export const layoutPanel = (x: number, y: number, width: number, rows: readonly PanelRowSpec[]): PanelLayout => {
  const innerWidth = width - MENU_PANEL_PADDING * 2;
  const rects: Rect[] = [];
  let top = y + MENU_PANEL_PADDING;
  rows.forEach((row) => {
    const height = rowHeight(row);
    rects.push({ x: x + MENU_PANEL_PADDING, y: top, width: innerWidth, height });
    top += height + MENU_ROW_GAP;
  });
  return { rect: { x, y, width, height: panelHeight(rows) }, rows: rects };
};

// ボタンの行を count 個に横に等分する（間は MENU_BUTTON_GAP_X）。count が 1 未満・整数でないときは例外にする。
export const splitRow = (row: Rect, count: number): readonly Rect[] => {
  if (!Number.isInteger(count) || count < 1) throw new Error(`ボタンの数が不正です: ${count}`);
  const width = (row.width - MENU_BUTTON_GAP_X * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    x: row.x + index * (width + MENU_BUTTON_GAP_X),
    y: row.y,
    width,
    height: row.height,
  }));
};

// エンジニアのメニュー: 人数（1行）、雇うボタン（ランクごとに1行）、選択中のエンジニア（2行）、前へ・次へ、昇給・減給。
export const ENGINEER_MENU_ROWS: readonly PanelRowSpec[] = [
  textRow(1),
  ...ENGINEER_RANKS.map(() => buttonRow(1)),
  textRow(2),
  buttonRow(2),
  buttonRow(2),
];
// アイテムのメニュー: ページ内の枠（ITEM_PAGE_SIZE 個、1枠1行）と、ページ行（前のページ・ページ表示・次のページ）。
export const ITEM_MENU_ROWS: readonly PanelRowSpec[] = [...Array.from({ length: ITEM_PAGE_SIZE }, () => buttonRow(1)), buttonRow(3)];
// 開発バランスのメニュー: 見出し（1行）と、リファクタリングの割合の選択肢（getRefactoringRatioOptions、1つ1行）。
export const BALANCE_MENU_ROWS: readonly PanelRowSpec[] = [textRow(1), ...getRefactoringRatioOptions().map(() => buttonRow(1))];
// エンジニアのポップオーバー: 見出しと休暇の状態（2行）、休暇／復帰ボタン、AIエージェントのボタン（種類ごとに1行）、休暇の案内文。
export const ENGINEER_POPOVER_ROWS: readonly PanelRowSpec[] = [
  textRow(2),
  buttonRow(1),
  ...AI_AGENT_BUTTON_ORDER.map(() => buttonRow(1)),
  textRow(VACATION_HINT_LINES),
];

export const MENU_ROWS: Readonly<Record<MenuKind, readonly PanelRowSpec[]>> = {
  engineer: ENGINEER_MENU_ROWS,
  item: ITEM_MENU_ROWS,
  balance: BALANCE_MENU_ROWS,
};

// アイコンの下に開くメニューの配置。右端をアイコンの右端に揃え（左端がフィールドの外に出るなら 0 に寄せる）、上端はアイコンの下端から MENU_PANEL_GAP_Y 下。
export const menuPanelLayout = (kind: MenuKind): PanelLayout => {
  const icon = menuIconRect(kind);
  const width = MENU_PANEL_WIDTH[kind];
  const x = Math.max(0, icon.x + icon.width - width);
  return layoutPanel(x, icon.y + icon.height + MENU_PANEL_GAP_Y, width, MENU_ROWS[kind]);
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

// エンジニアのポップオーバーの配置。anchor は出現地点の中心。左端は anchor から ENGINEER_POPOVER_OFFSET_X 右、縦は anchor を中心にする。
// どちらもフィールドの端から ENGINEER_POPOVER_MARGIN の内側に収める（上端・下端の行の出現地点でもはみ出さない）。
export const popoverLayout = (anchor: Point): PanelLayout => {
  const height = panelHeight(ENGINEER_POPOVER_ROWS);
  const x = clamp(
    anchor.x + ENGINEER_POPOVER_OFFSET_X,
    ENGINEER_POPOVER_MARGIN,
    FIELD_WIDTH - ENGINEER_POPOVER_MARGIN - ENGINEER_POPOVER_WIDTH,
  );
  const y = clamp(
    Math.round(anchor.y - height / 2),
    ENGINEER_POPOVER_MARGIN,
    FIELD_HEIGHT - ENGINEER_POPOVER_MARGIN - height,
  );
  return layoutPanel(x, y, ENGINEER_POPOVER_WIDTH, ENGINEER_POPOVER_ROWS);
};
