import { describe, expect, it } from 'vitest';
import {
  AI_AGENT_BUTTON_ORDER,
  AI_AGENT_BUY_KEYS,
  AI_AGENT_BUTTON_SIZE,
  AI_AGENT_UI_POSITION,
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
  INITIAL_PLACEMENT_FONT_SIZE,
  INITIAL_PLACEMENT_LINE_HEIGHT,
  INITIAL_PLACEMENT_MESSAGE_POSITION,
  INITIAL_PLACEMENT_PANEL_LINES,
  INITIAL_PLACEMENT_PANEL_POSITION,
  INITIAL_PLACEMENT_START_BUTTON_POSITION,
  INITIAL_PLACEMENT_START_BUTTON_SIZE,
  INITIAL_PLACEMENT_TEXT,
  INITIAL_PLACEMENT_UI_BOUNDS,
  ITEM_BLOCKED_RECTS,
  ITEM_HUD_BOUNDS,
  ITEM_SHORT_NAMES,
  STAGE_POINTS_INITIAL,
  ATTACK_KEYS,
  GAME_OVER_RESTART_KEYS,
  ITEM_BUY_KEY_LABELS,
  ITEM_BUY_KEYS,
  ITEM_MESSAGE_POSITION,
  ITEM_PAGE_KEYS,
  ITEM_PAGE_SIZE,
  PLAYER_MOVE_KEYS,
  REFACTORING_RATIO_KEYS,
  SALARY_ADJUST_KEYS,
  SALARY_SELECT_KEYS,
  REFACTORING_RATIO_BUTTON_SIZE,
  REFACTORING_RATIO_FONT_SIZE,
  REFACTORING_RATIO_LABEL_WIDTH,
  REFACTORING_RATIO_STEP_PERCENT,
  REFACTORING_RATIO_UI_GAP,
  REFACTORING_RATIO_UI_HIRE_MIN_GAP,
  REFACTORING_RATIO_UI_POSITION,
  RELEASE_POINT_CELL,
  SALARY_BUTTON_ORDER,
  SALARY_BUTTON_SIZE,
  SALARY_UI_POSITION,
  SELECTED_ENGINEER_FONT_SIZE,
  SELECTED_ENGINEER_POSITION,
  TECH_DEBT_MAX,
  TECH_DEBT_POSITION,
} from './config';
import { createEngineerParameters, formatSelectedEngineer, getInitialSalary } from './engineer';
import { CELL_SIZE, FIELD_HEIGHT, FIELD_ROWS, FIELD_WIDTH } from './field';
import { ITEM_TYPES } from './item';
import { formatInitialPlacementPanel } from './initialPlacement';
import { getItemPageCount, getItemsOnPage, itemButtonRect, itemPageControlRects } from './itemBar';
import { formatItemButton } from './itemPlacement';
import { formatRefactoringAllocation } from './refactoringRatioControl';
import { SPAWN_MARKER_STYLE } from './route';
import { formatTechDebt } from './techDebt';

type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

// 辺が接するだけ（共有する面積が 0）なら交差しない。1px でも面積が重なれば交差する。
const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// inner が outer に完全に含まれる（辺が一致してもよい）。
const within = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

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

// 購入バー(#58): ページ内の枠（どのページも同じ位置）とページ切替UI（前・ページ表示・次）。
const itemPageControls = itemPageControlRects();
const itemBarRects: readonly Rect[] = [
  ...Array.from({ length: ITEM_PAGE_SIZE }, (_, slot) => itemButtonRect(slot)),
  itemPageControls.previous,
  itemPageControls.label,
  itemPageControls.next,
];

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

  it('技術的負債の表示はアイテムを置けない HUD の矩形（ITEM_HUD_BOUNDS）に収まる(#151)', () => {
    const rect = hudRects.find((entry) => entry.name === '技術的負債')?.rect;
    if (!rect) throw new Error('技術的負債の矩形がない');
    expect(within(rect, ITEM_HUD_BOUNDS)).toBe(true);
  });

  it('境界値: アイテムを置けない矩形（ITEM_BLOCKED_RECTS）は上帯（行0）・下帯（最終行）・HUD の矩形（x=72〜416、y=80〜298）の3つ(#151)', () => {
    expect(ITEM_HUD_BOUNDS).toEqual({ x: 72, y: 80, width: 344, height: 218 });
    expect(ITEM_BLOCKED_RECTS).toEqual([
      { x: 0, y: 0, width: FIELD_WIDTH, height: CELL_SIZE },
      { x: 0, y: FIELD_HEIGHT - CELL_SIZE, width: FIELD_WIDTH, height: CELL_SIZE },
      ITEM_HUD_BOUNDS,
    ]);
    // HUD の矩形は出現列（col 0）とリリース地点のセルに交差せず、上帯・下帯とも交差しない。
    for (let row = 0; row < FIELD_ROWS; row += 1) {
      expect(intersects(ITEM_HUD_BOUNDS, cellRect(ENGINEER_SPAWN_COL, row))).toBe(false);
    }
    expect(intersects(ITEM_HUD_BOUNDS, cellRect(RELEASE_POINT_CELL.col, RELEASE_POINT_CELL.row))).toBe(false);
    expect(intersects(ITEM_HUD_BOUNDS, ITEM_BLOCKED_RECTS[0])).toBe(false);
    expect(intersects(ITEM_HUD_BOUNDS, ITEM_BLOCKED_RECTS[1])).toBe(false);
  });
});

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

describe('休暇マーカーとボタンのレイアウト（#35）', () => {
  // drawItemButtons と同じ計算（ページ内の枠とページ切替UI #58）。
  const itemButtonRects: readonly Rect[] = itemBarRects;

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

describe('機能開発とリファクタリングの割合UIのレイアウト（#40）', () => {
  // 枠線の分だけ広げた矩形（枠線は辺の上に描かれるため、太さぶん広げて過大に見積もる）。
  const expand = (rect: Rect, strokeWidth: number): Rect => ({
    x: rect.x - strokeWidth,
    y: rect.y - strokeWidth,
    width: rect.width + strokeWidth * 2,
    height: rect.height + strokeWidth * 2,
  });
  // render.ts の drawHireButtons の枠線の太さ（setStrokeStyle(2, ...)）と同じ。
  const HIRE_BUTTON_STROKE_WIDTH = 2;
  // drawRefactoringRatioControl と同じ計算。
  const { width, height, strokeWidth } = REFACTORING_RATIO_BUTTON_SIZE;
  const { x, y } = REFACTORING_RATIO_UI_POSITION;
  const labelRect: Rect = { x: x + width + REFACTORING_RATIO_UI_GAP, y, width: REFACTORING_RATIO_LABEL_WIDTH, height };
  const featureButtonRect: Rect = expand({ x, y, width, height }, strokeWidth);
  const refactoringButtonRect: Rect = expand(
    { x: labelRect.x + labelRect.width + REFACTORING_RATIO_UI_GAP, y, width, height },
    strokeWidth,
  );
  const controlRects: readonly { readonly name: string; readonly rect: Rect }[] = [
    { name: '機能開発へ寄せるボタン', rect: featureButtonRect },
    { name: '割合の表示', rect: labelRect },
    { name: 'リファクタリングへ寄せるボタン', rect: refactoringButtonRect },
  ];
  // UI 全体（両ボタンの枠線を含む外接矩形）。
  const controlBounds: Rect = {
    x: featureButtonRect.x,
    y: featureButtonRect.y,
    width: refactoringButtonRect.x + refactoringButtonRect.width - featureButtonRect.x,
    height: featureButtonRect.height,
  };
  const hireButtonsWithStroke = hireButtonRects.map((rect) => expand(rect, HIRE_BUTTON_STROKE_WIDTH));
  const labelFontPx = parseInt(REFACTORING_RATIO_FONT_SIZE, 10);
  const steps = 100 / REFACTORING_RATIO_STEP_PERCENT;
  const gridRatios = Array.from({ length: steps + 1 }, (_, k) => k / steps);
  // 行0の上端・下端と、HUD 1行目の上端（HUD_TOP_Y = 経過日数の y）。
  const row0Bottom = CELL_SIZE;
  const hudTopY = ELAPSED_DAYS_POSITION.y;

  it('刻みのすべての割合（11通り）のラベルが割合の表示の領域に収まる', () => {
    expect(gridRatios).toHaveLength(11);
    for (const ratio of gridRatios) {
      const rect = textRect(labelRect, formatRefactoringAllocation(ratio), labelFontPx);
      expect(rect.width).toBeLessThanOrEqual(labelRect.width);
      expect(rect.height).toBeLessThanOrEqual(labelRect.height);
    }
  });

  it.each(controlRects)('$name はフィールド内・行0（y<60）内に収まる', ({ rect }) => {
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(FIELD_WIDTH);
    expect(rect.y + rect.height).toBeLessThanOrEqual(row0Bottom);
  });

  it('UI 全体の右端は、雇うボタン（枠線を含む）の左端から間隔をあけた位置以下', () => {
    const hireLeft = Math.min(...hireButtonsWithStroke.map((rect) => rect.x));
    expect(controlBounds.x + controlBounds.width).toBeLessThanOrEqual(hireLeft - REFACTORING_RATIO_UI_HIRE_MIN_GAP);
  });

  it.each(controlRects)('$name は雇うボタン（枠線を含む）・エンジニア数・雇用メッセージと交差しない', ({ rect }) => {
    for (const other of [...hireButtonsWithStroke, ...hireTextRects]) {
      expect(intersects(rect, other)).toBe(false);
    }
  });

  it.each(controlRects)('$name は出現列の全行のセル・休暇マーカー（枠線を含む）と交差しない', ({ rect }) => {
    const { radius, strokeWidth: markerStroke } = SPAWN_MARKER_STYLE;
    for (let row = 0; row < FIELD_ROWS; row += 1) {
      expect(intersects(rect, cellRect(ENGINEER_SPAWN_COL, row))).toBe(false);
      const marker = expand(
        {
          x: ENGINEER_SPAWN_COL * CELL_SIZE + CELL_SIZE / 2 - radius,
          y: row * CELL_SIZE + CELL_SIZE / 2 - radius,
          width: radius * 2,
          height: radius * 2,
        },
        markerStroke,
      );
      expect(intersects(rect, marker)).toBe(false);
    }
  });

  it.each(controlRects)('$name は HUD の4行と交差しない', ({ rect }) => {
    for (const hud of hudRects) {
      expect(intersects(rect, hud.rect)).toBe(false);
    }
  });

  it('UI 全体の下端は、雇うボタンの下端（y=36、枠線を除く）と HUD_TOP_Y 以下', () => {
    expect(y + height).toBeLessThanOrEqual(HIRE_UI_POSITION.y + HIRE_BUTTON_SIZE.height);
    expect(controlBounds.y + controlBounds.height).toBeLessThanOrEqual(hudTopY);
  });
});

// 昇給・減給(#34)の情報行とボタン。
// 情報行は最長想定（id 2桁・最長のランク名・月給の上限）を全角相当で過大に見積もる。
const longestSelectedEngineer = formatSelectedEngineer({
  id: 99,
  rank: 'junior',
  routeId: null,
  personality: 'meticulous',
  onVacation: false,
  vacationRateReduction: 0,
  salary: ENGINEER_SALARY_MAX,
  initialSalary: getInitialSalary('junior'),
  aiAgent: null,
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
const itemMessageRect = textRect(ITEM_MESSAGE_POSITION, 'あ'.repeat(HIRE_TEXT_MAX_CHARS), HIRE_TEXT_FONT_PX);

describe('昇給・減給パネルのレイアウト(#34)', () => {
  it('最長想定の情報行の文字列', () => {
    expect(longestSelectedEngineer).toBe('選択: #99 ジュニア 月給 1,000,000円 AI: なし');
  });

  it('境界値: 情報行は技術的負債の行（HUD 4行目）の下、ボタンは情報行の下に並ぶ', () => {
    expect(SELECTED_ENGINEER_POSITION).toEqual({ x: 72, y: 208 });
    expect(salaryButtonRects[0]).toEqual({ x: 72, y: 238, width: 80, height: 28 });
    expect(salaryButtonRects[salaryButtonRects.length - 1].x + SALARY_BUTTON_SIZE.width).toBe(416);
  });

  it('技術的負債の行・情報行・各ボタンはどの2つも交差しない', () => {
    const techDebtRect = hudRects.find((entry) => entry.name === '技術的負債')?.rect;
    if (!techDebtRect) throw new Error('技術的負債の矩形がない');
    const rects = [techDebtRect, ...salaryRects.map((entry) => entry.rect)];
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        expect(intersects(rects[i], rects[j])).toBe(false);
      }
    }
  });

  it.each(salaryRects)('$name は HUD の4行（技術的負債を含む）と交差しない', ({ rect }) => {
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
    for (const other of [...itemBarRects, itemMessageRect]) {
      expect(intersects(rect, other)).toBe(false);
    }
  });

  it.each(salaryRects)('$name は出現列の全行の休暇マーカーと交差しない', ({ rect }) => {
    for (const row of spawnRows) {
      expect(intersects(rect, vacationMarkerRect(row))).toBe(false);
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

  it('ボタンはすべてアイテムを置けない HUD の矩形（ITEM_HUD_BOUNDS）に収まる(#151)', () => {
    for (const rect of salaryButtonRects) {
      expect(within(rect, ITEM_HUD_BOUNDS)).toBe(true);
    }
  });
});

// AIエージェント(#53)のボタン。drawAiAgentButtons と同じ計算。
const aiAgentButtonRects: readonly { readonly name: string; readonly rect: Rect }[] = AI_AGENT_BUTTON_ORDER.map(
  (agentType, index) => ({
    name: `AIボタン${agentType}`,
    rect: {
      x: AI_AGENT_UI_POSITION.x + index * (AI_AGENT_BUTTON_SIZE.width + AI_AGENT_BUTTON_SIZE.gap),
      y: AI_AGENT_UI_POSITION.y,
      width: AI_AGENT_BUTTON_SIZE.width,
      height: AI_AGENT_BUTTON_SIZE.height,
    },
  }),
);

describe('AIエージェントのボタンのレイアウト(#53)', () => {
  it('境界値: 昇給・減給ボタン（y=238〜266）の下 y=270〜298、x=72〜416', () => {
    expect(aiAgentButtonRects[0]?.rect).toEqual({ x: 72, y: 270, width: 112, height: 28 });
    const last = aiAgentButtonRects[aiAgentButtonRects.length - 1]?.rect;
    if (!last) throw new Error('AIボタンがない');
    expect(last.x + last.width).toBe(416);
  });

  it('ボタンどうしが交差しない', () => {
    for (let i = 0; i < aiAgentButtonRects.length; i += 1) {
      for (let j = i + 1; j < aiAgentButtonRects.length; j += 1) {
        expect(intersects(aiAgentButtonRects[i].rect, aiAgentButtonRects[j].rect)).toBe(false);
      }
    }
  });

  it.each(aiAgentButtonRects)('$name は HUD の4行・選択中のエンジニア・昇給減給ボタンと交差しない', ({ rect }) => {
    for (const other of [...hudRects, ...salaryRects]) {
      expect(intersects(rect, other.rect)).toBe(false);
    }
  });

  it.each(aiAgentButtonRects)('$name は雇用ボタン・エンジニア数・雇用メッセージと交差しない', ({ rect }) => {
    for (const other of [...hireButtonRects, ...hireTextRects]) {
      expect(intersects(rect, other)).toBe(false);
    }
  });

  it.each(aiAgentButtonRects)('$name は購入ボタン・購入メッセージと交差しない', ({ rect }) => {
    for (const other of [...itemBarRects, itemMessageRect]) {
      expect(intersects(rect, other)).toBe(false);
    }
  });

  it.each(aiAgentButtonRects)('$name は出現列の全行のセル・休暇マーカーと交差しない', ({ rect }) => {
    for (const row of spawnRows) {
      expect(intersects(rect, cellRect(ENGINEER_SPAWN_COL, row))).toBe(false);
      expect(intersects(rect, vacationMarkerRect(row))).toBe(false);
    }
  });

  it.each(aiAgentButtonRects)('$name はリリース地点のセルと交差しない', ({ rect }) => {
    expect(intersects(rect, cellRect(RELEASE_POINT_CELL.col, RELEASE_POINT_CELL.row))).toBe(false);
  });

  it.each(aiAgentButtonRects)('$name はフィールド内に収まる', ({ rect }) => {
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(FIELD_WIDTH);
    expect(rect.y + rect.height).toBeLessThanOrEqual(FIELD_HEIGHT);
  });

  it('ボタンはすべてアイテムを置けない HUD の矩形（ITEM_HUD_BOUNDS）に収まり、右端・下端は矩形の右端・下端と一致する(#151)', () => {
    for (const { rect } of aiAgentButtonRects) {
      expect(within(rect, ITEM_HUD_BOUNDS)).toBe(true);
    }
    const last = aiAgentButtonRects[aiAgentButtonRects.length - 1]?.rect;
    if (!last) throw new Error('AIエージェントのボタンの矩形がない');
    expect(last.x + last.width).toBe(ITEM_HUD_BOUNDS.x + ITEM_HUD_BOUNDS.width);
    expect(last.y + last.height).toBe(ITEM_HUD_BOUNDS.y + ITEM_HUD_BOUNDS.height);
  });
});

describe('購入バーのレイアウト（ページ切替 #58）', () => {
  const itemButtonRects = itemBarRects;
  const pageCount = getItemPageCount(ITEM_TYPES.length);

  it('購入キー・キー表示・ページの枠数はすべて6で一致し、18個は3ページになる', () => {
    expect(ITEM_BUY_KEYS).toHaveLength(6);
    expect(ITEM_BUY_KEY_LABELS).toHaveLength(ITEM_BUY_KEYS.length);
    expect(ITEM_PAGE_SIZE).toBe(ITEM_BUY_KEYS.length);
    expect(ITEM_TYPES).toHaveLength(18);
    expect(pageCount).toBe(3);
  });

  it('ページ切替キーは他の操作キーと重ならない', () => {
    const others: readonly string[] = [
      ...ITEM_BUY_KEYS,
      ...HIRE_KEYS,
      ...Object.values(PLAYER_MOVE_KEYS).flat(),
      ...ATTACK_KEYS,
      ...GAME_OVER_RESTART_KEYS,
      ...Object.values(SALARY_SELECT_KEYS),
      ...Object.values(SALARY_ADJUST_KEYS),
      ...Object.values(REFACTORING_RATIO_KEYS),
      ...Object.values(AI_AGENT_BUY_KEYS),
    ];
    for (const key of Object.values(ITEM_PAGE_KEYS)) {
      expect(others).not.toContain(key);
    }
  });

  it('境界値: 先頭は x=60 から、6枠目の右端は x=824、ページ切替UIの右端は x=956 でフィールド幅以内', () => {
    expect(itemButtonRect(0).x).toBe((ENGINEER_SPAWN_COL + 1) * CELL_SIZE);
    const lastSlot = itemButtonRect(ITEM_PAGE_SIZE - 1);
    expect(lastSlot.x + lastSlot.width).toBe(824);
    const { next } = itemPageControlRects();
    expect(next.x + next.width).toBe(956);
    expect(next.x + next.width).toBeLessThanOrEqual(FIELD_WIDTH);
  });

  // 幅 124px・11px に収まることを確かめた最長の文言（config.ts の ITEM_BUTTON_FONT_SIZE の注記 #57）より長くしない。
  const LONGEST_FITTING_LABEL = formatItemButton(0, 'codeRabbit');
  it.each(Array.from({ length: pageCount }, (_, page) => page))('%i ページ目: 全ボタンの文言は最長の既存の文言以下の長さ', (page) => {
    const labels = getItemsOnPage(ITEM_TYPES, page).map((itemType, slot) => formatItemButton(slot, itemType));
    expect(labels).toHaveLength(ITEM_PAGE_SIZE);
    for (const label of labels) {
      expect(label.length).toBeLessThanOrEqual(LONGEST_FITTING_LABEL.length);
    }
  });

  it.each(itemButtonRects.map((rect, index) => ({ index, rect })))('$index 番目の矩形はフィールド内に収まる', ({ rect }) => {
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(FIELD_WIDTH);
    expect(rect.y + rect.height).toBeLessThanOrEqual(FIELD_HEIGHT);
  });

  it('ボタンどうし（ページ切替UIを含む）が交差しない', () => {
    for (let i = 0; i < itemButtonRects.length; i += 1) {
      for (let j = i + 1; j < itemButtonRects.length; j += 1) {
        expect(intersects(itemButtonRects[i], itemButtonRects[j])).toBe(false);
      }
    }
  });

  it.each(spawnRows)('行%i の休暇マーカーと交差しない', (row) => {
    for (const button of itemButtonRects) {
      expect(intersects(vacationMarkerRect(row), button)).toBe(false);
    }
  });

  it('HUD の4行（技術的負債を含む）・昇給減給パネル・雇用UI・購入メッセージと交差しない', () => {
    const others = [
      ...hudRects.map((entry) => entry.rect),
      ...salaryRects.map((entry) => entry.rect),
      ...hireButtonRects,
      ...hireTextRects,
      itemMessageRect,
    ];
    for (const button of itemButtonRects) {
      for (const other of others) {
        expect(intersects(button, other)).toBe(false);
      }
    }
  });
});

describe('初期配置UIのレイアウト(#47)', () => {
  const fontPx = parseInt(INITIAL_PLACEMENT_FONT_SIZE, 10);
  // 最長想定のパネルの行。残ポイントは初期値より増えない（撤去しても初期値まで）ので、初期値で全アイテムを選んだときの最長。
  const panelLines = ITEM_TYPES.flatMap((itemType) => formatInitialPlacementPanel(STAGE_POINTS_INITIAL, itemType));
  const longestPanelChars = Math.max(...panelLines.map((line) => line.length));
  const panelRect: Rect = {
    x: INITIAL_PLACEMENT_PANEL_POSITION.x,
    y: INITIAL_PLACEMENT_PANEL_POSITION.y,
    width: longestPanelChars * fontPx,
    height: INITIAL_PLACEMENT_PANEL_LINES * INITIAL_PLACEMENT_LINE_HEIGHT,
  };
  const startButtonRect: Rect = {
    ...INITIAL_PLACEMENT_START_BUTTON_POSITION,
    width: INITIAL_PLACEMENT_START_BUTTON_SIZE.width,
    height: INITIAL_PLACEMENT_START_BUTTON_SIZE.height,
  };
  // メッセージの最長想定は「〇〇を撤去しました」（最長の短い名前）と固定の失敗メッセージ。
  const longestName = Math.max(...ITEM_TYPES.map((itemType) => ITEM_SHORT_NAMES[itemType].length));
  const messageRect = textRect(
    INITIAL_PLACEMENT_MESSAGE_POSITION,
    'あ'.repeat(Math.max(longestName + 'を撤去しました'.length, 'そこにはアイテムがありません'.length)),
    fontPx,
  );
  const setupRects: readonly { readonly name: string; readonly rect: Rect }[] = [
    { name: 'パネル', rect: panelRect },
    { name: '開始ボタン', rect: startButtonRect },
    { name: 'メッセージ', rect: messageRect },
  ];
  // 割合UI(#40)の外接矩形（両ボタンの枠線を含めて過大に見積もる）。
  const ratioStroke = REFACTORING_RATIO_BUTTON_SIZE.strokeWidth;
  const ratioRect: Rect = {
    x: REFACTORING_RATIO_UI_POSITION.x - ratioStroke,
    y: REFACTORING_RATIO_UI_POSITION.y - ratioStroke,
    width:
      REFACTORING_RATIO_BUTTON_SIZE.width * 2 + REFACTORING_RATIO_LABEL_WIDTH + REFACTORING_RATIO_UI_GAP * 2 + ratioStroke * 2,
    height: REFACTORING_RATIO_BUTTON_SIZE.height + ratioStroke * 2,
  };
  it('境界値: パネル・開始ボタン・メッセージは上から順に重ならず並び、開始ボタンの文字はボタン幅に収まる', () => {
    expect(panelRect.y + panelRect.height).toBeLessThanOrEqual(startButtonRect.y);
    expect(startButtonRect.y + startButtonRect.height).toBeLessThanOrEqual(messageRect.y);
    expect(INITIAL_PLACEMENT_TEXT.startButton.length * fontPx).toBeLessThanOrEqual(INITIAL_PLACEMENT_START_BUTTON_SIZE.width);
  });

  it.each(setupRects)('$name は初期配置UIの範囲（INITIAL_PLACEMENT_UI_BOUNDS）とフィールドの内側に収まる', ({ rect }) => {
    expect(within(rect, INITIAL_PLACEMENT_UI_BOUNDS)).toBe(true);
    expect(within(rect, { x: 0, y: 0, width: FIELD_WIDTH, height: FIELD_HEIGHT })).toBe(true);
  });

  it.each(setupRects)('$name は HUD の4行・選択中のエンジニア・昇給減給パネルと交差しない', ({ rect }) => {
    for (const other of [...hudRects, ...salaryRects]) {
      expect(intersects(rect, other.rect)).toBe(false);
    }
  });

  it.each(setupRects)('$name は雇用ボタン・エンジニア数・雇用メッセージ・割合UIと交差しない', ({ rect }) => {
    for (const other of [...hireButtonRects, ...hireTextRects, ratioRect]) {
      expect(intersects(rect, other)).toBe(false);
    }
  });

  it.each(setupRects)('$name は購入ボタン・ページ切替UI・購入メッセージ・全行の休暇マーカー・リリース地点と交差しない', ({ rect }) => {
    for (const other of [...itemBarRects, itemMessageRect, ...spawnRows.map((row) => vacationMarkerRect(row))]) {
      expect(intersects(rect, other)).toBe(false);
    }
    expect(intersects(rect, cellRect(RELEASE_POINT_CELL.col, RELEASE_POINT_CELL.row))).toBe(false);
  });

  it.each(setupRects)('$name は AIエージェントのボタン(#53)と交差しない', ({ rect }) => {
    for (const other of aiAgentButtonRects) {
      expect(intersects(rect, other.rect)).toBe(false);
    }
  });

  it('境界値: 初期配置UIの範囲（INITIAL_PLACEMENT_UI_BOUNDS）は AIエージェントのボタン・購入バーと交差しない', () => {
    for (const other of [...aiAgentButtonRects.map((entry) => entry.rect), ...itemBarRects]) {
      expect(intersects(INITIAL_PLACEMENT_UI_BOUNDS, other)).toBe(false);
    }
  });

  it('境界値: 初期配置UIの範囲（INITIAL_PLACEMENT_UI_BOUNDS）は行1〜3 × col 11〜15 に収まり、置けない矩形（ITEM_BLOCKED_RECTS）と交差しない(#151)', () => {
    const rows1to3cols11to15: Rect = {
      x: cellRect(11, 1).x,
      y: cellRect(11, 1).y,
      width: cellRect(15, 3).x + CELL_SIZE - cellRect(11, 1).x,
      height: cellRect(15, 3).y + CELL_SIZE - cellRect(11, 1).y,
    };
    expect(within(INITIAL_PLACEMENT_UI_BOUNDS, rows1to3cols11to15)).toBe(true);
    expect(INITIAL_PLACEMENT_UI_BOUNDS).toEqual({ x: 668, y: 68, width: 284, height: 140 });
    for (const rect of ITEM_BLOCKED_RECTS) {
      expect(intersects(INITIAL_PLACEMENT_UI_BOUNDS, rect)).toBe(false);
    }
  });
});
