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
  ENGINEER_SALARY_MAX,
  ITEM_BLOCKED_CELLS,
  ITEM_BUTTON_SIZE,
  ITEM_BUY_KEYS,
  ITEM_MESSAGE_POSITION,
  ITEM_UI_POSITION,
  RELEASE_POINT_CELL,
  SALARY_BUTTON_ORDER,
  SALARY_BUTTON_SIZE,
  SALARY_UI_POSITION,
  SELECTED_ENGINEER_FONT_SIZE,
  SELECTED_ENGINEER_POSITION,
} from './config';
import { createEngineerParameters, formatSelectedEngineer } from './engineer';
import { CELL_SIZE, FIELD_COLS, FIELD_HEIGHT, FIELD_ROWS, FIELD_WIDTH } from './field';

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

  it('HUD の3行どうしが交差しない', () => {
    for (let i = 0; i < hudRects.length; i += 1) {
      for (let j = i + 1; j < hudRects.length; j += 1) {
        expect(intersects(hudRects[i].rect, hudRects[j].rect)).toBe(false);
      }
    }
  });
});

// 昇給・減給(#34)の情報行とボタン。
// 情報行は最長想定（id 2桁・最長のランク名・月給の上限）を全角相当で過大に見積もる。
const longestSelectedEngineer = formatSelectedEngineer({
  id: 99,
  rank: 'junior',
  routeId: null,
  personality: 'meticulous',
  salary: ENGINEER_SALARY_MAX,
  ...createEngineerParameters('junior'),
});
const selectedEngineerRect = textRect(
  SELECTED_ENGINEER_POSITION,
  longestSelectedEngineer,
  parseInt(SELECTED_ENGINEER_FONT_SIZE, 10),
);
const salaryButtonRects: readonly Rect[] = SALARY_BUTTON_ORDER.map((_, index) => ({
  x: SALARY_UI_POSITION.x + index * (SALARY_BUTTON_SIZE.width + SALARY_BUTTON_SIZE.gap),
  y: SALARY_UI_POSITION.y,
  width: SALARY_BUTTON_SIZE.width,
  height: SALARY_BUTTON_SIZE.height,
}));
const salaryRects: readonly { readonly name: string; readonly rect: Rect }[] = [
  { name: '選択中のエンジニア', rect: selectedEngineerRect },
  ...salaryButtonRects.map((rect, index) => ({ name: `給与ボタン${SALARY_BUTTON_ORDER[index]}`, rect })),
];
const itemButtonRects: readonly Rect[] = ITEM_BUY_KEYS.map((_, index) => ({
  x: ITEM_UI_POSITION.x + index * (ITEM_BUTTON_SIZE.width + ITEM_BUTTON_SIZE.gap),
  y: ITEM_UI_POSITION.y,
  width: ITEM_BUTTON_SIZE.width,
  height: ITEM_BUTTON_SIZE.height,
}));
const itemMessageRect = textRect(ITEM_MESSAGE_POSITION, 'あ'.repeat(HIRE_TEXT_MAX_CHARS), HIRE_TEXT_FONT_PX);

describe('昇給・減給パネルのレイアウト(#34)', () => {
  it('最長想定の情報行の文字列', () => {
    expect(longestSelectedEngineer).toBe('選択: #99 ジュニア 月給 1,000,000円');
  });

  it.each(salaryRects)('$name は HUD の3行と交差しない', ({ rect }) => {
    for (const hud of hudRects) {
      expect(intersects(rect, hud.rect)).toBe(false);
    }
  });

  it.each(salaryRects)('$name は出現列の全行のセルと交差しない', ({ rect }) => {
    for (let row = 0; row < FIELD_ROWS; row += 1) {
      expect(intersects(rect, cellRect(ENGINEER_SPAWN_COL, row))).toBe(false);
    }
  });

  it.each(salaryRects)('$name は雇用ボタン・エンジニア数・雇用メッセージと交差しない', ({ rect }) => {
    for (const other of [...hireButtonRects, ...hireTextRects]) {
      expect(intersects(rect, other)).toBe(false);
    }
  });

  it.each(salaryRects)('$name はリリース地点のセルと交差しない', ({ rect }) => {
    expect(intersects(rect, cellRect(RELEASE_POINT_CELL.col, RELEASE_POINT_CELL.row))).toBe(false);
  });

  it.each(salaryRects)('$name は購入ボタン・購入メッセージと交差しない', ({ rect }) => {
    for (const other of [...itemButtonRects, itemMessageRect]) {
      expect(intersects(rect, other)).toBe(false);
    }
  });

  it.each(salaryRects)('$name はフィールド内に収まる', ({ rect }) => {
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(FIELD_WIDTH);
    expect(rect.y + rect.height).toBeLessThanOrEqual(FIELD_HEIGHT);
  });

  it('情報行とボタンどうしが交差しない', () => {
    for (let i = 0; i < salaryRects.length; i += 1) {
      for (let j = i + 1; j < salaryRects.length; j += 1) {
        expect(intersects(salaryRects[i].rect, salaryRects[j].rect)).toBe(false);
      }
    }
  });

  it('ボタンと重なるセル（出現列を除く）はすべてアイテムを置けないセル', () => {
    for (const rect of salaryButtonRects) {
      for (let col = ENGINEER_SPAWN_COL + 1; col < FIELD_COLS; col += 1) {
        for (let row = 0; row < FIELD_ROWS; row += 1) {
          if (intersects(rect, cellRect(col, row))) {
            expect(ITEM_BLOCKED_CELLS).toContainEqual({ col, row });
          }
        }
      }
    }
  });
});
