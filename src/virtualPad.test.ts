import { describe, expect, it } from 'vitest';
import { VIRTUAL_PAD_CELL_SIZE, VIRTUAL_PAD_CELLS, VIRTUAL_PAD_RECT } from './config';
import { NO_DIRECTION_INPUT } from './player';
import { directionInputForZone, VIRTUAL_PAD_BUTTONS, virtualPadZoneAt } from './virtualPad';

// パッドの左上からのセル (col, row) の中心と左上の点。
const cellCenter = (col: number, row: number) => ({
  x: VIRTUAL_PAD_RECT.x + (col + 0.5) * VIRTUAL_PAD_CELL_SIZE,
  y: VIRTUAL_PAD_RECT.y + (row + 0.5) * VIRTUAL_PAD_CELL_SIZE,
});
const cellTopLeft = (col: number, row: number) => ({
  x: VIRTUAL_PAD_RECT.x + col * VIRTUAL_PAD_CELL_SIZE,
  y: VIRTUAL_PAD_RECT.y + row * VIRTUAL_PAD_CELL_SIZE,
});

describe('バーチャルパッドのゾーン判定(#182)', () => {
  it('パッドは 3 × 3 のセルで、矩形の一辺はセル × 3', () => {
    expect(VIRTUAL_PAD_CELLS).toBe(3);
    expect(VIRTUAL_PAD_RECT.width).toBe(VIRTUAL_PAD_CELL_SIZE * VIRTUAL_PAD_CELLS);
    expect(VIRTUAL_PAD_RECT.height).toBe(VIRTUAL_PAD_CELL_SIZE * VIRTUAL_PAD_CELLS);
  });

  it('中央のセルは攻撃、上・下・左・右のセルはその向き', () => {
    expect(virtualPadZoneAt(cellCenter(1, 1))).toBe('attack');
    expect(virtualPadZoneAt(cellCenter(1, 0))).toBe('up');
    expect(virtualPadZoneAt(cellCenter(1, 2))).toBe('down');
    expect(virtualPadZoneAt(cellCenter(0, 1))).toBe('left');
    expect(virtualPadZoneAt(cellCenter(2, 1))).toBe('right');
  });

  it('四隅のセルは何もしない（null）', () => {
    for (const [col, row] of [
      [0, 0],
      [2, 0],
      [0, 2],
      [2, 2],
    ] as const) {
      expect(virtualPadZoneAt(cellCenter(col, row))).toBeNull();
    }
  });

  it('境界値: セルの境目は右・下のセル（左上の辺を含み、1px 手前は前のセル）', () => {
    const attack = cellTopLeft(1, 1);
    expect(virtualPadZoneAt(attack)).toBe('attack');
    expect(virtualPadZoneAt({ x: attack.x - 1, y: attack.y + 1 })).toBe('left');
    expect(virtualPadZoneAt({ x: attack.x + 1, y: attack.y - 1 })).toBe('up');
    const right = cellTopLeft(2, 1);
    expect(virtualPadZoneAt(right)).toBe('right');
    expect(virtualPadZoneAt({ x: right.x - 1, y: right.y })).toBe('attack');
    const down = cellTopLeft(1, 2);
    expect(virtualPadZoneAt(down)).toBe('down');
    expect(virtualPadZoneAt({ x: down.x, y: down.y - 1 })).toBe('attack');
  });

  it('境界値: パッドの外は null（左端・上端は内側、右端・下端ちょうどと 1px 外は外側）', () => {
    const { x, y, width, height } = VIRTUAL_PAD_RECT;
    const midY = y + height / 2;
    const midX = x + width / 2;
    expect(virtualPadZoneAt({ x, y: midY })).toBe('left');
    expect(virtualPadZoneAt({ x: x - 1, y: midY })).toBeNull();
    expect(virtualPadZoneAt({ x: x + width - 1, y: midY })).toBe('right');
    expect(virtualPadZoneAt({ x: x + width, y: midY })).toBeNull();
    expect(virtualPadZoneAt({ x: midX, y })).toBe('up');
    expect(virtualPadZoneAt({ x: midX, y: y - 1 })).toBeNull();
    expect(virtualPadZoneAt({ x: midX, y: y + height - 1 })).toBe('down');
    expect(virtualPadZoneAt({ x: midX, y: y + height })).toBeNull();
  });

  it('ボタンの一覧の各セルは、その位置のゾーンと一致する（描画と判定が同じ並び）', () => {
    expect(VIRTUAL_PAD_BUTTONS.map((button) => button.zone).sort()).toEqual(['attack', 'down', 'left', 'right', 'up']);
    for (const button of VIRTUAL_PAD_BUTTONS) {
      expect(virtualPadZoneAt(cellCenter(button.col, button.row))).toBe(button.zone);
    }
  });
});

describe('ゾーンの上下左右の入力(#182)', () => {
  it('上下左右のボタンはその向きだけを押している', () => {
    expect(directionInputForZone('up')).toEqual({ ...NO_DIRECTION_INPUT, up: true });
    expect(directionInputForZone('down')).toEqual({ ...NO_DIRECTION_INPUT, down: true });
    expect(directionInputForZone('left')).toEqual({ ...NO_DIRECTION_INPUT, left: true });
    expect(directionInputForZone('right')).toEqual({ ...NO_DIRECTION_INPUT, right: true });
  });

  it('中央（攻撃）・四隅・パッドの外は何も押していない', () => {
    expect(directionInputForZone('attack')).toEqual(NO_DIRECTION_INPUT);
    expect(directionInputForZone(null)).toEqual(NO_DIRECTION_INPUT);
  });
});
