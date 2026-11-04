import { describe, expect, it } from 'vitest';
import {
  CUMULATIVE_SALES_POSITION,
  ELAPSED_DAYS_POSITION,
  ELAPSED_DAYS_STYLE,
  ENGINEER_SPAWN_COL,
  FUNDS_POSITION,
  HIRE_BUTTON_SIZE,
  HIRE_COUNT_POSITION,
  HIRE_KEYS,
  HIRE_MESSAGE_POSITION,
  HIRE_UI_POSITION,
  ITEM_BLOCKED_CELLS,
  ITEM_BUTTON_SIZE,
  ITEM_UI_POSITION,
  RELEASE_POINT_CELL,
  TECH_DEBT_MAX,
  TECH_DEBT_POSITION,
} from './config';
import { CELL_SIZE, FIELD_COLS, FIELD_HEIGHT, FIELD_ROWS, FIELD_WIDTH } from './field';
import { ITEM_TYPES } from './item';
import { SPAWN_MARKER_STYLE } from './route';
import { formatTechDebt } from './techDebt';

type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

// 辺が接するだけ（共有する面積が 0）なら交差しない。1px でも面積が重なれば交差する。
const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const LINE_HEIGHT_RATIO = 1.25;

// 全角相当（1文字 = フォントpx）で過大に見積もった文字列の矩形。
const textRect = (position: { readonly x: number; readonly y: number }, text: string, fontPx: number): Rect => ({
  x: position.x,
  y: position.y,
  width: text.length * fontPx,
  height: fontPx * LINE_HEIGHT_RATIO,
});

const cellRect = (col: number, row: number): Rect => ({
  x: col * CELL_SIZE,
  y: row * CELL_SIZE,
  width: CELL_SIZE,
  height: CELL_SIZE,
});

const HUD_FONT_PX = parseInt(ELAPSED_DAYS_STYLE.fontSize, 10);
const HIRE_TEXT_FONT_PX = 20;
// 最長想定の文字列。
const hudRects: readonly { readonly name: string; readonly rect: Rect }[] = [
  { name: '経過日数', rect: textRect(ELAPSED_DAYS_POSITION, '経過日数: 99,999日', HUD_FONT_PX) },
  { name: '資金', rect: textRect(FUNDS_POSITION, '資金: -9,999,999,999円', HUD_FONT_PX) },
  { name: '累計売上', rect: textRect(CUMULATIVE_SALES_POSITION, '累計売上: 9,999,999,999円', HUD_FONT_PX) },
  // 技術的負債は上限で止まるため、上限値の表示が最長。
  { name: '技術的負債', rect: textRect(TECH_DEBT_POSITION, formatTechDebt(TECH_DEBT_MAX), HUD_FONT_PX) },
];

const hireButtonRects: readonly Rect[] = HIRE_KEYS.map((_, index) => ({
  x: HIRE_UI_POSITION.x + index * (HIRE_BUTTON_SIZE.width + HIRE_BUTTON_SIZE.gap),
  y: HIRE_UI_POSITION.y,
  width: HIRE_BUTTON_SIZE.width,
  height: HIRE_BUTTON_SIZE.height,
}));
// 人数表示・雇用メッセージの文字数は長めの 30 文字で過大に見積もる。
const HIRE_TEXT_MAX_CHARS = 30;
const hireTextRects: readonly Rect[] = [HIRE_COUNT_POSITION, HIRE_MESSAGE_POSITION].map((position) =>
  textRect(position, 'あ'.repeat(HIRE_TEXT_MAX_CHARS), HIRE_TEXT_FONT_PX),
);

describe('intersects（ヘルパー）', () => {
  const base: Rect = { x: 10, y: 10, width: 10, height: 10 };

  it('辺が接するだけなら交差しない（右・下・左・上）', () => {
    expect(intersects(base, { x: 20, y: 10, width: 10, height: 10 })).toBe(false);
    expect(intersects(base, { x: 10, y: 20, width: 10, height: 10 })).toBe(false);
    expect(intersects(base, { x: 0, y: 10, width: 10, height: 10 })).toBe(false);
    expect(intersects(base, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it('角だけが接しても交差しない', () => {
    expect(intersects(base, { x: 20, y: 20, width: 10, height: 10 })).toBe(false);
  });

  it('1px 重なれば交差する', () => {
    expect(intersects(base, { x: 19, y: 10, width: 10, height: 10 })).toBe(true);
    expect(intersects(base, { x: 10, y: 19, width: 10, height: 10 })).toBe(true);
    expect(intersects(base, { x: 1, y: 10, width: 10, height: 10 })).toBe(true);
    expect(intersects(base, { x: 10, y: 1, width: 10, height: 10 })).toBe(true);
  });

  it('包含していれば交差する', () => {
    expect(intersects(base, { x: 12, y: 12, width: 2, height: 2 })).toBe(true);
  });
});

describe('HUD のレイアウト', () => {
  it.each(hudRects)('$name は出現列の全行のセルと交差しない', ({ rect }) => {
    for (let row = 0; row < FIELD_ROWS; row += 1) {
      expect(intersects(rect, cellRect(ENGINEER_SPAWN_COL, row))).toBe(false);
    }
  });

  it.each(hudRects)('$name は雇用ボタン・エンジニア数・雇用メッセージと交差しない', ({ rect }) => {
    for (const other of [...hireButtonRects, ...hireTextRects]) {
      expect(intersects(rect, other)).toBe(false);
    }
  });

  it.each(hudRects)('$name はリリース地点のセルと交差しない', ({ rect }) => {
    expect(intersects(rect, cellRect(RELEASE_POINT_CELL.col, RELEASE_POINT_CELL.row))).toBe(false);
  });

  it.each(hudRects)('$name はフィールド内に収まる', ({ rect }) => {
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(FIELD_WIDTH);
    expect(rect.y + rect.height).toBeLessThanOrEqual(FIELD_HEIGHT);
  });

  it('HUD の4行どうしが交差しない', () => {
    for (let i = 0; i < hudRects.length; i += 1) {
      for (let j = i + 1; j < hudRects.length; j += 1) {
        expect(intersects(hudRects[i].rect, hudRects[j].rect)).toBe(false);
      }
    }
  });

  it('技術的負債の表示と重なるセルはすべてアイテムを置けない（ITEM_BLOCKED_CELLS）', () => {
    const rect = hudRects.find((entry) => entry.name === '技術的負債')?.rect;
    if (!rect) throw new Error('技術的負債の矩形がない');
    const overlapped = Array.from({ length: FIELD_ROWS }, (_, row) => row).flatMap((row) =>
      Array.from({ length: FIELD_COLS }, (_, col) => ({ col, row })).filter(
        ({ col }) => col !== ENGINEER_SPAWN_COL && intersects(rect, cellRect(col, row)),
      ),
    );
    expect(overlapped.length).toBeGreaterThan(0);
    for (const cell of overlapped) {
      expect(ITEM_BLOCKED_CELLS).toContainEqual(cell);
    }
  });
});

describe('休暇マーカーとボタンのレイアウト（#35）', () => {
  // drawItemButtons と同じ計算。
  const itemButtonRects: readonly Rect[] = ITEM_TYPES.map((_, index) => ({
    x: ITEM_UI_POSITION.x + index * (ITEM_BUTTON_SIZE.width + ITEM_BUTTON_SIZE.gap),
    y: ITEM_UI_POSITION.y,
    width: ITEM_BUTTON_SIZE.width,
    height: ITEM_BUTTON_SIZE.height,
  }));
  // 休暇マーカーの当たり判定（出現セル中心の半径 SPAWN_MARKER_STYLE.radius の円）を外接する正方形で過大に見積もる。
  const vacationMarkerRect = (row: number): Rect => {
    const { radius } = SPAWN_MARKER_STYLE;
    return {
      x: ENGINEER_SPAWN_COL * CELL_SIZE + CELL_SIZE / 2 - radius,
      y: row * CELL_SIZE + CELL_SIZE / 2 - radius,
      width: radius * 2,
      height: radius * 2,
    };
  };
  const spawnRows = Array.from({ length: FIELD_ROWS }, (_, row) => row);

  it('境界値: 行8（最下行）のマーカーは x=14〜46・y=494〜526、最初の購入ボタンは出現列の右（x≧60）から始まる', () => {
    expect(vacationMarkerRect(FIELD_ROWS - 1)).toEqual({ x: 14, y: 494, width: 32, height: 32 });
    expect(itemButtonRects[0].x).toBeGreaterThanOrEqual((ENGINEER_SPAWN_COL + 1) * CELL_SIZE);
  });

  it.each(spawnRows)('行%i の休暇マーカーはどの購入ボタン・雇用ボタンとも交差しない', (row) => {
    const marker = vacationMarkerRect(row);
    for (const button of [...itemButtonRects, ...hireButtonRects]) {
      expect(intersects(marker, button)).toBe(false);
    }
  });

  it('購入ボタンはすべてフィールド内に収まる', () => {
    for (const rect of itemButtonRects) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(FIELD_WIDTH);
      expect(rect.y + rect.height).toBeLessThanOrEqual(FIELD_HEIGHT);
    }
  });
});
