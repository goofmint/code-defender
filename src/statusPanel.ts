// 右下の小さな指標(#156, #165)の配置。Phaser には依存しない（render.ts の描画と hudLayout.test.ts が同じ計算を使う）。
// 絵文字＋数字の4つを2列 × 2行に並べる。上の行は 💰 資金（列0）と 💸 月末に支払うお金（列1）、下の行は 📈 累計売上（列0）と技術的負債（列1）。
import {
  STATUS_PANEL_COLUMN_GAP,
  STATUS_PANEL_COLUMN_WIDTH,
  STATUS_PANEL_COLUMNS,
  STATUS_PANEL_LINE_HEIGHT,
  STATUS_PANEL_PADDING,
  STATUS_PANEL_RECT,
  STATUS_PANEL_ROWS,
} from './config';
import type { Rect } from './geometry';

// 枠（column 列目・row 行目、0 始まり）の矩形。左上は 背景の左上 + 余白 + 列 × (列の幅 + 列の間)・行 × 行の高さ。範囲外は例外にする。
export const statusPanelCellRect = (column: number, row: number): Rect => {
  if (!Number.isInteger(column) || column < 0 || column >= STATUS_PANEL_COLUMNS) {
    throw new RangeError(`右下の指標の列が不正です: ${column}`);
  }
  if (!Number.isInteger(row) || row < 0 || row >= STATUS_PANEL_ROWS) {
    throw new RangeError(`右下の指標の行が不正です: ${row}`);
  }
  return {
    x: STATUS_PANEL_RECT.x + STATUS_PANEL_PADDING + column * (STATUS_PANEL_COLUMN_WIDTH + STATUS_PANEL_COLUMN_GAP),
    y: STATUS_PANEL_RECT.y + STATUS_PANEL_PADDING + row * STATUS_PANEL_LINE_HEIGHT,
    width: STATUS_PANEL_COLUMN_WIDTH,
    height: STATUS_PANEL_LINE_HEIGHT,
  };
};

// 4つの指標の枠。render.ts はこの位置に文字を置く。
export const STATUS_PANEL_CELLS = {
  funds: { column: 0, row: 0 },
  monthEndPayment: { column: 1, row: 0 },
  sales: { column: 0, row: 1 },
  techDebt: { column: 1, row: 1 },
} as const;
