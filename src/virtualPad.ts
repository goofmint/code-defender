// バーチャルパッド(#182)の純粋ロジック。Phaser には依存しない（テスト可能にするため）。
// パッドは VIRTUAL_PAD_RECT の 3 × 3 のセル（一辺 VIRTUAL_PAD_CELL_SIZE）で、上・下・左・右のセルで移動、中央のセルで攻撃、四隅とパッドの外は何もしない。
import { VIRTUAL_PAD_CELL_SIZE, VIRTUAL_PAD_CELLS, VIRTUAL_PAD_RECT } from './config';
import { NO_DIRECTION_INPUT } from './player';
import type { DirectionInput, Point } from './player';

export type VirtualPadZone = 'up' | 'down' | 'left' | 'right' | 'attack';

// 描画（render.ts）とゾーン判定で同じ並びを使う。col・row はパッドの左上からのセル位置。
export const VIRTUAL_PAD_BUTTONS: readonly { readonly zone: VirtualPadZone; readonly col: number; readonly row: number }[] = [
  { zone: 'up', col: 1, row: 0 },
  { zone: 'left', col: 0, row: 1 },
  { zone: 'attack', col: 1, row: 1 },
  { zone: 'right', col: 2, row: 1 },
  { zone: 'down', col: 1, row: 2 },
];

// ゲーム座標の点がどのボタンの上かを返す。セルは左上の辺を含み右下の辺を含まない（隣のセルとの境目は右・下のセル）。
// パッドの外（右端・下端ちょうどを含む）と四隅は null。
export const virtualPadZoneAt = (point: Point): VirtualPadZone | null => {
  const col = Math.floor((point.x - VIRTUAL_PAD_RECT.x) / VIRTUAL_PAD_CELL_SIZE);
  const row = Math.floor((point.y - VIRTUAL_PAD_RECT.y) / VIRTUAL_PAD_CELL_SIZE);
  if (col < 0 || row < 0 || col >= VIRTUAL_PAD_CELLS || row >= VIRTUAL_PAD_CELLS) {
    return null;
  }
  const button = VIRTUAL_PAD_BUTTONS.find((candidate) => candidate.col === col && candidate.row === row);
  return button === undefined ? null : button.zone;
};

// ボタンの上下左右の入力。上下左右のボタンはその向きだけを押している。中央（攻撃）・四隅・パッドの外は何も押していない。
export const directionInputForZone = (zone: VirtualPadZone | null): DirectionInput => {
  switch (zone) {
    case 'up':
      return { ...NO_DIRECTION_INPUT, up: true };
    case 'down':
      return { ...NO_DIRECTION_INPUT, down: true };
    case 'left':
      return { ...NO_DIRECTION_INPUT, left: true };
    case 'right':
      return { ...NO_DIRECTION_INPUT, right: true };
    case 'attack':
    case null:
      return NO_DIRECTION_INPUT;
  }
};
