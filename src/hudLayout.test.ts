// 画面の常時表示（左上の経過日数・右上のアイコン・右下の指標）、アイコンで開くメニュー、エンジニアのポップオーバー、初期配置UIの配置(#156)。
// #165 で右上にゲームの説明のアイコン（ℹ️）を足し、右下の指標を絵文字＋数字の2列 × 2行にした。
// 文字列の幅は textMetrics.ts の推定幅（全角 1 文字 = フォントpx、半角はその比率 #158）で見積もり、重ならないこと・枠に収まることを確かめる。
// 文言に依存する検査は対応言語ごとに行う(#158)。言語が変わってもレイアウトの値（位置・大きさ）は変えず、収まらない文言は短くする。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AI_AGENT_BUTTON_ORDER,
  ELAPSED_DAYS_POSITION,
  ELAPSED_DAYS_STYLE,
  ENGINEER_HIRE_COST,
  ENGINEER_POPOVER_WIDTH,
  ENGINEER_RANKS,
  ENGINEER_SALARY_MAX,
  ENGINEER_SPAWN_COL,
  HELP_ICON_RECT,
  HUD_ICONS,
  HIRE_MESSAGE_POSITION,
  INITIAL_PLACEMENT_ENGINEER_BUTTON_POSITION,
  INITIAL_PLACEMENT_ENGINEER_BUTTON_SIZE,
  INITIAL_PLACEMENT_FONT_SIZE,
  INITIAL_PLACEMENT_LINE_HEIGHT,
  INITIAL_PLACEMENT_MESSAGE_POSITION,
  INITIAL_PLACEMENT_PANEL_LINES,
  INITIAL_PLACEMENT_PANEL_POSITION,
  INITIAL_PLACEMENT_START_BUTTON_POSITION,
  INITIAL_PLACEMENT_START_BUTTON_SIZE,
  INITIAL_PLACEMENT_UI_BOUNDS,
  ITEM_BLOCKED_RECTS,
  ITEM_MESSAGE_POSITION,
  ITEM_PAGE_SIZE,
  ITEM_SHORT_NAMES,
  MAX_ENGINEERS,
  MENU_FONT_SIZE,
  RELEASE_POINT_CELL,
  STAGE_POINTS_INITIAL,
  BALANCE_STEP_BUTTON_LABELS,
  STATUS_PANEL_COLUMN_WIDTH,
  STATUS_PANEL_FONT_SIZE,
  STATUS_PANEL_LINE_HEIGHT,
  STATUS_PANEL_PADDING,
  STATUS_PANEL_RECT,
  STATUS_PANEL_ROWS,
  TECH_DEBT_LEVELS,
} from './config';
import { formatAiAgentMessage, formatAiAgentOption } from './aiAgent';
import {
  createEngineerParameters,
  formatEngineerCount,
  formatEngineerPopoverLines,
  formatHireMessage,
  formatHireOption,
  formatResignedMessage,
  formatSalaryMessage,
  formatSelectedEngineerLines,
  formatVacationButton,
  getInitialSalary,
} from './engineer';
import type { Engineer } from './engineer';
import { CELL_SIZE, FIELD_HEIGHT, FIELD_ROWS, FIELD_WIDTH } from './field';
import { MENU_KINDS, menuIconRect, menuPanelLayout, panelHeight, popoverLayout, splitRow, ENGINEER_POPOVER_ROWS } from './floatingMenu';
import { formatCumulativeSales } from './score';
import { formatFunds } from './funds';
import { ITEM_TYPES } from './item';
import { formatInitialPlacementEngineerButton, formatInitialPlacementItemButton, formatInitialPlacementPanel } from './initialPlacement';
import type { InitialPlacementSelection } from './initialPlacement';
import { formatItemPage, getItemPageCount } from './itemBar';
import { formatItemOption } from './itemPlacement';
import { formatMonthEndPayment } from './monthBoundary';
import { formatRefactoringAllocation, stepRefactoringRatio } from './refactoringRatioControl';
import { SPAWN_MARKER_STYLE } from './route';
import { formatLevelAndDays, levelAt } from './level';
import { MS_PER_GAME_DAY } from './gameTime';
import { getCatalogue, getMessages, interpolate, setLocale } from './i18n';
import { SUPPORTED_LOCALES } from './i18n/resolveLocale';
import { STATUS_PANEL_CELLS, statusPanelCellRect } from './statusPanel';
import { formatTechDebtStatus } from './techDebt';
import { estimateTextWidth } from './textMetrics';

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

// 推定幅（textMetrics.ts）で見積もった文字列の矩形。
const textRect = (position: { readonly x: number; readonly y: number }, text: string, fontPx: number): Rect => ({
  x: position.x,
  y: position.y,
  width: estimateTextWidth(text, fontPx),
  height: fontPx * LINE_HEIGHT_RATIO,
});

const cellRect = (col: number, row: number): Rect => ({
  x: col * CELL_SIZE,
  y: row * CELL_SIZE,
  width: CELL_SIZE,
  height: CELL_SIZE,
});

const field: Rect = { x: 0, y: 0, width: FIELD_WIDTH, height: FIELD_HEIGHT };
const topBand: Rect = ITEM_BLOCKED_RECTS[0];
const bottomBand: Rect = ITEM_BLOCKED_RECTS[1];

// レベルと経過日数（左上 #164。最長想定の日数と、その日数のレベル）。現在の言語の文言で見積もる(#158)。
const LONGEST_DAYS = 999_999;
const elapsedDaysRect = (): Rect =>
  textRect(
    ELAPSED_DAYS_POSITION,
    formatLevelAndDays(levelAt(LONGEST_DAYS * MS_PER_GAME_DAY), LONGEST_DAYS),
    parseInt(ELAPSED_DAYS_STYLE.fontSize, 10),
  );
// 通知（雇用・昇給減給・AIエージェント・退職のメッセージ）。文字数は長めの 30 文字で過大に見積もる。
const NOTIFICATION_FONT_PX = 20;
const NOTIFICATION_MAX_CHARS = 30;
const notificationRect = textRect(HIRE_MESSAGE_POSITION, 'あ'.repeat(NOTIFICATION_MAX_CHARS), NOTIFICATION_FONT_PX);
// 購入結果のメッセージ（最長の書き置きのメッセージ）。現在の言語の文言で見積もる(#158)。
const itemMessageRect = (): Rect => textRect(ITEM_MESSAGE_POSITION, getMessages().items.seniorNotePrevented, NOTIFICATION_FONT_PX);
// 右上のアイコン。メニューの3つとゲームの説明(#165)の4つ。
const iconRects: readonly { readonly kind: string; readonly rect: Rect }[] = [
  ...MENU_KINDS.map((kind) => ({ kind, rect: menuIconRect(kind) })),
  { kind: 'help', rect: HELP_ICON_RECT },
];

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

const MENU_FONT_PX = parseInt(MENU_FONT_SIZE, 10);
// 文字列がその幅に収まるか（推定幅 #158）。
const fitsWidth = (text: string, width: number, fontPx: number = MENU_FONT_PX): boolean => estimateTextWidth(text, fontPx) <= width;
const salaryButtons = () => getMessages().engineer.salaryButtons;

// 最長想定のエンジニア（id 2 桁・シニア・月給上限・AIエージェントあり／なし・休暇中）。
const longestEngineer = (aiAgent: Engineer['aiAgent'], onVacation: boolean): Engineer => ({
  id: MAX_ENGINEERS * 10,
  rank: 'senior',
  routeId: 0,
  personality: 'meticulous',
  onVacation,
  vacationRateReduction: 0,
  salary: ENGINEER_SALARY_MAX,
  initialSalary: getInitialSalary('senior'),
  aiAgent,
  ...createEngineerParameters('senior', 'meticulous'),
});
const engineerVariants: readonly Engineer[] = [null, ...AI_AGENT_BUTTON_ORDER].flatMap((aiAgent) =>
  [false, true].map((onVacation) => longestEngineer(aiAgent, onVacation)),
);

describe('intersects（ヘルパー）', () => {
  const base: Rect = { x: 10, y: 10, width: 10, height: 10 };

  it('辺が接するだけなら交差しない（右・下・左・上）', () => {
    expect(intersects(base, { x: 20, y: 10, width: 10, height: 10 })).toBe(false);
    expect(intersects(base, { x: 10, y: 20, width: 10, height: 10 })).toBe(false);
    expect(intersects(base, { x: 0, y: 10, width: 10, height: 10 })).toBe(false);
    expect(intersects(base, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it('1px 重なれば交差する', () => {
    expect(intersects(base, { x: 19, y: 10, width: 10, height: 10 })).toBe(true);
    expect(intersects(base, { x: 10, y: 19, width: 10, height: 10 })).toBe(true);
  });
});

describe('置けない矩形と上帯・下帯(#151, #156)', () => {
  it('境界値: アイテムを置けない矩形は上帯（行0）と下帯（最終行）の2つだけ（左の HUD の矩形は撤去）', () => {
    expect(ITEM_BLOCKED_RECTS).toEqual([
      { x: 0, y: 0, width: FIELD_WIDTH, height: CELL_SIZE },
      { x: 0, y: FIELD_HEIGHT - CELL_SIZE, width: FIELD_WIDTH, height: CELL_SIZE },
    ]);
  });
});

describe.each(SUPPORTED_LOCALES)('言語 %s(#158)', (locale) => {
  beforeEach(() => {
    setLocale(locale);
  });
  afterEach(() => {
    setLocale('ja');
  });

  describe('経過日数（左上）のレイアウト(#156)', () => {
    it('境界値: 上帯（y=0〜60）の内側で、出現列（x<60）の右（x=72）から始まる', () => {
      expect(ELAPSED_DAYS_POSITION).toEqual({ x: 72, y: 15 });
      expect(within(elapsedDaysRect(), topBand)).toBe(true);
      expect(elapsedDaysRect().x).toBeGreaterThanOrEqual((ENGINEER_SPAWN_COL + 1) * CELL_SIZE);
    });

    it('最長想定はレベルも付いた「Lv.33334」の文言で見積もる(#164)', () => {
      expect(levelAt(LONGEST_DAYS * MS_PER_GAME_DAY)).toBe(33334);
      expect(formatLevelAndDays(33334, LONGEST_DAYS)).toContain('Lv.33334');
    });

    it('経過日数は語の代わりに 📅 で出し、言語によらず同じ文字列（「Lv.33334 📅999999」#165）', () => {
      expect(formatLevelAndDays(33334, LONGEST_DAYS)).toBe(`Lv.33334 ${HUD_ICONS.days}999999`);
      expect(formatLevelAndDays(33334, LONGEST_DAYS)).not.toMatch(/日|Day/);
    });

    it('通知・右上のアイコンと交差しない', () => {
      expect(intersects(elapsedDaysRect(), notificationRect)).toBe(false);
      for (const { rect } of iconRects) expect(intersects(elapsedDaysRect(), rect)).toBe(false);
    });
  });

  describe('右上のアイコンのレイアウト(#156, #165)', () => {
    it('アイコンはメニューの3つとゲームの説明の4つで、ゲームの説明が一番右', () => {
      expect(iconRects.map(({ kind }) => kind)).toEqual(['engineer', 'item', 'balance', 'help']);
      const rights = iconRects.map(({ rect }) => rect.x);
      rights.slice(1).forEach((x, index) => expect(x).toBeGreaterThan(rights[index]));
    });

    it.each(iconRects)('$kind のアイコンは上帯の内側に収まる', ({ rect }) => {
      expect(within(rect, topBand)).toBe(true);
    });

    it.each(iconRects)('$kind のアイコンは経過日数・通知・リリース地点と交差しない', ({ rect }) => {
      expect(intersects(rect, elapsedDaysRect())).toBe(false);
      expect(intersects(rect, notificationRect)).toBe(false);
      expect(intersects(rect, cellRect(RELEASE_POINT_CELL.col, RELEASE_POINT_CELL.row))).toBe(false);
    });

    it('境界値: アイコンの下端（y=40）は通知の上端（y=42）より上', () => {
      const bottom = Math.max(...iconRects.map(({ rect }) => rect.y + rect.height));
      expect(bottom).toBe(40);
      expect(bottom).toBeLessThanOrEqual(HIRE_MESSAGE_POSITION.y);
    });

    it('アイコンどうしが交差しない', () => {
      for (let i = 0; i < iconRects.length; i += 1) {
        for (let j = i + 1; j < iconRects.length; j += 1) {
          expect(intersects(iconRects[i].rect, iconRects[j].rect)).toBe(false);
        }
      }
    });
  });

  describe('メニューのレイアウト(#156)', () => {
    it.each(MENU_KINDS)('%s のメニューはフィールドの内側に収まり、上帯の下端より下まで伸びる（アイコンの直下に開く）', (kind) => {
      const { rect } = menuPanelLayout(kind);
      expect(within(rect, field)).toBe(true);
      expect(rect.y + rect.height).toBeGreaterThan(topBand.height);
    });

    it.each(MENU_KINDS)('%s のメニューはアイコン・経過日数と交差しない', (kind) => {
      const { rect } = menuPanelLayout(kind);
      for (const icon of iconRects) expect(intersects(rect, icon.rect)).toBe(false);
      expect(intersects(rect, elapsedDaysRect())).toBe(false);
    });

    it('エンジニアのメニューの文言は行の幅に収まる（人数・雇うボタン・選択中の2行・前へ次へ・昇給減給）', () => {
      const { rows } = menuPanelLayout('engineer');
      const [countRow, ...rest] = rows;
      const hireRows = rest.slice(0, ENGINEER_RANKS.length);
      const [selectedRow, selectRow, salaryRow] = rest.slice(ENGINEER_RANKS.length);
      expect(fitsWidth(formatEngineerCount(MAX_ENGINEERS, MAX_ENGINEERS), countRow.width)).toBe(true);
      ENGINEER_RANKS.forEach((entry, index) => {
        expect(fitsWidth(formatHireOption(entry.id, ENGINEER_HIRE_COST[entry.id]), hireRows[index].width)).toBe(true);
      });
      for (const engineer of [null, ...engineerVariants]) {
        for (const line of formatSelectedEngineerLines(engineer)) expect(fitsWidth(line, selectedRow.width)).toBe(true);
      }
      const [previous, next] = splitRow(selectRow, 2);
      expect(fitsWidth(salaryButtons().previous, previous.width)).toBe(true);
      expect(fitsWidth(salaryButtons().next, next.width)).toBe(true);
      const [raise, cut] = splitRow(salaryRow, 2);
      expect(fitsWidth(salaryButtons().raise, raise.width)).toBe(true);
      expect(fitsWidth(salaryButtons().cut, cut.width)).toBe(true);
    });

    it('アイテムのメニューの枠の文言（プレイ中の金額・初期配置のポイント）とページ表示は幅に収まる', () => {
      const { rows } = menuPanelLayout('item');
      const slotWidth = rows[0].width;
      for (const itemType of ITEM_TYPES) {
        expect(fitsWidth(formatItemOption(itemType), slotWidth)).toBe(true);
        expect(fitsWidth(formatInitialPlacementItemButton(itemType), slotWidth)).toBe(true);
      }
      const pageCount = getItemPageCount(ITEM_TYPES.length);
      const [, label] = splitRow(rows[ITEM_PAGE_SIZE], 3);
      expect(fitsWidth(formatItemPage(pageCount - 1, pageCount), label.width)).toBe(true);
    });

    it('半額にした価格(#164)の文言（日本語「1.25万円」、英語「¥12.5K」）も枠の幅に収まる', () => {
      const slotWidth = menuPanelLayout('item').rows[0].width;
      const expected = locale === 'ja' ? 'FriDeploy 1.25万円' : 'FriDeploy ¥12.5K';
      expect(formatItemOption('fridayDeploy')).toBe(expected);
      expect(fitsWidth(expected, slotWidth)).toBe(true);
      expect(formatItemOption('codeRabbit')).toBe(locale === 'ja' ? 'CodeRabbit 5万/月' : 'CodeRabbit ¥50K/mo');
      expect(fitsWidth(formatItemOption('codeRabbit'), slotWidth)).toBe(true);
    });

    it('開発バランスのメニューの見出し、ゲージの下の 11 段階の文言（機能100:リファ0 など）と ◀ / ▶ は幅に収まる(#165)', () => {
      const { rows } = menuPanelLayout('balance');
      const [titleRow, gaugeRow, allocationRow, buttonRow] = rows;
      expect(rows).toHaveLength(4);
      expect(fitsWidth(getMessages().balance.title, titleRow.width)).toBe(true);
      // 0 からリファクタリングへ1段階ずつ寄せた11段階（0%〜100%。◀ を押していく）。
      const ratios = [0];
      while (ratios.length < 11) ratios.push(stepRefactoringRatio(ratios[ratios.length - 1], 'refactoring'));
      expect(ratios.at(-1)).toBe(1);
      for (const ratio of ratios) expect(fitsWidth(formatRefactoringAllocation(ratio), allocationRow.width)).toBe(true);
      expect(gaugeRow.width).toBe(allocationRow.width);
      const [left, right] = splitRow(buttonRow, 2);
      expect(fitsWidth(BALANCE_STEP_BUTTON_LABELS.refactoring, left.width)).toBe(true);
      expect(fitsWidth(BALANCE_STEP_BUTTON_LABELS.feature, right.width)).toBe(true);
    });

    it('キー名（[1] や ◀G など）を出さない(#156。キー操作は #165 で廃止)', () => {
      const labels = [
        ...ENGINEER_RANKS.map((entry) => formatHireOption(entry.id, ENGINEER_HIRE_COST[entry.id])),
        ...Object.values(salaryButtons()),
        ...ITEM_TYPES.map((itemType) => formatItemOption(itemType)),
        ...AI_AGENT_BUTTON_ORDER.map((agentType) => formatAiAgentOption(agentType)),
      ];
      for (const label of labels) expect(label).not.toMatch(/\[/);
    });
  });

  describe('エンジニアのポップオーバーのレイアウト(#156)', () => {
    const height = panelHeight(ENGINEER_POPOVER_ROWS);

    it.each(spawnRows)('行%i の出現地点のポップオーバーはフィールドの内側に収まり、どの行の休暇マーカーとも交差しない', (row) => {
      const { rect } = popoverLayout({ x: CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 });
      expect(within(rect, field)).toBe(true);
      for (const markerRow of spawnRows) expect(intersects(rect, vacationMarkerRect(markerRow))).toBe(false);
      expect(rect.height).toBe(height);
    });

    it('見出し・状態・休暇ボタン・AIエージェントのボタンは幅（ENGINEER_POPOVER_WIDTH）の内側に収まる（休暇の案内文は #165 でゲームの説明に移した）', () => {
      const { rows } = popoverLayout({ x: CELL_SIZE / 2, y: 270 });
      const [headingRow, vacationRow, ...aiRows] = rows;
      expect(aiRows).toHaveLength(AI_AGENT_BUTTON_ORDER.length);
      for (const engineer of engineerVariants) {
        for (const line of formatEngineerPopoverLines(engineer)) expect(fitsWidth(line, headingRow.width)).toBe(true);
        expect(fitsWidth(formatVacationButton(engineer), vacationRow.width)).toBe(true);
      }
      AI_AGENT_BUTTON_ORDER.forEach((agentType, index) => {
        expect(fitsWidth(formatAiAgentOption(agentType), aiRows[index].width)).toBe(true);
      });
      expect(headingRow.width).toBeLessThan(ENGINEER_POPOVER_WIDTH);
    });
  });

  describe('右下の指標のレイアウト(#156, #165)', () => {
    const statusFontPx = parseInt(STATUS_PANEL_FONT_SIZE, 10);
    const cells = Object.entries(STATUS_PANEL_CELLS).map(([name, { column, row }]) => ({ name, rect: statusPanelCellRect(column, row) }));
    // 各枠の最長想定の文言（現在の言語。数値は 10 桁の円額・負債の上限）。
    const longestTexts = (): Readonly<Record<keyof typeof STATUS_PANEL_CELLS, string>> => ({
      funds: formatFunds(-9_999_999_999),
      monthEndPayment: formatMonthEndPayment(9_999_999_999),
      sales: formatCumulativeSales(9_999_999_999),
      techDebt: formatTechDebtStatus(TECH_DEBT_LEVELS.critical.max),
    });

    it('境界値: 下帯（y=480〜540）の右端に収まる（x=684〜952、y=496〜532）', () => {
      expect(STATUS_PANEL_RECT).toEqual({ x: 684, y: 496, width: 268, height: 36 });
      expect(within(STATUS_PANEL_RECT, bottomBand)).toBe(true);
      expect(STATUS_PANEL_RECT.height).toBe(STATUS_PANEL_LINE_HEIGHT * STATUS_PANEL_ROWS + STATUS_PANEL_PADDING * 2);
      expect(STATUS_PANEL_RECT.x + STATUS_PANEL_RECT.width).toBe(FIELD_WIDTH - 8);
    });

    it('購入結果のメッセージ・最終行の休暇マーカー・リリース地点・左上の表示と交差しない', () => {
      expect(intersects(STATUS_PANEL_RECT, itemMessageRect())).toBe(false);
      expect(intersects(STATUS_PANEL_RECT, vacationMarkerRect(FIELD_ROWS - 1))).toBe(false);
      expect(intersects(STATUS_PANEL_RECT, cellRect(RELEASE_POINT_CELL.col, RELEASE_POINT_CELL.row))).toBe(false);
      expect(intersects(STATUS_PANEL_RECT, elapsedDaysRect())).toBe(false);
    });

    it('4つの枠（💰・💸・📈・負債）は背景の内側で、互いに重ならない', () => {
      expect(cells.map(({ name }) => name)).toEqual(['funds', 'monthEndPayment', 'sales', 'techDebt']);
      for (const { rect } of cells) expect(within(rect, STATUS_PANEL_RECT)).toBe(true);
      cells.forEach((a, i) => cells.slice(i + 1).forEach((b) => expect(intersects(a.rect, b.rect)).toBe(false)));
    });

    it('最長想定の文言（💰-9,999,999,999円・💸9,999,999,999円・📈9,999,999,999円・🔴100）は枠の幅に収まる（絵文字は全角で見積もる）', () => {
      const texts = longestTexts();
      for (const { name, rect } of cells) {
        const text = texts[name as keyof typeof STATUS_PANEL_CELLS];
        expect(fitsWidth(text, rect.width, statusFontPx), text).toBe(true);
        expect(rect.width).toBe(STATUS_PANEL_COLUMN_WIDTH);
      }
    });

    it('語（資金・累計売上・月末支払・負債・Funds など）を出さず、絵文字と数字だけにする', () => {
      const texts = Object.values(longestTexts());
      expect(texts[0].startsWith(HUD_ICONS.funds)).toBe(true);
      expect(texts[1].startsWith(HUD_ICONS.monthEndPayment)).toBe(true);
      expect(texts[2].startsWith(HUD_ICONS.sales)).toBe(true);
      expect(texts[3]).toBe(`${TECH_DEBT_LEVELS.critical.icon}100`);
      for (const text of texts) expect(text).not.toMatch(/資金|売上|支払|負債|Funds|sales|costs|Debt/i);
    });

    it('境界値: 負債の枠は 30 が 🔵、31 が 🟡、60 が 🟡、61 が 🔴', () => {
      expect(formatTechDebtStatus(30)).toBe('🔵30');
      expect(formatTechDebtStatus(31)).toBe('🟡31');
      expect(formatTechDebtStatus(60)).toBe('🟡60');
      expect(formatTechDebtStatus(61)).toBe('🔴61');
    });
  });

  describe('アイテムのメニューのページ', () => {
    it('ページの枠数は6で、18個は3ページになる（購入キーは #165 で廃止）', () => {
      expect(ITEM_PAGE_SIZE).toBe(6);
      expect(ITEM_TYPES).toHaveLength(18);
      expect(getItemPageCount(ITEM_TYPES.length)).toBe(3);
    });
  });

  describe('初期配置UIのレイアウト(#47, #156)', () => {
    const fontPx = parseInt(INITIAL_PLACEMENT_FONT_SIZE, 10);
    // 最長想定のパネルの行。残ポイントは初期値より増えない（撤去しても初期値まで）ので、初期値で全アイテム・エンジニア・未選択を選んだときの最長(#157)。
    const selections: readonly InitialPlacementSelection[] = [
      { kind: 'none' },
      { kind: 'engineer' },
      ...ITEM_TYPES.map((itemType): InitialPlacementSelection => ({ kind: 'item', itemType })),
    ];
    // 文言は現在の言語で見積もる（言語は beforeEach で決まるので、検査の中で呼ぶ #158）。
    const panelRect = (): Rect => {
      const panelLines = selections.flatMap((selection) => formatInitialPlacementPanel(STAGE_POINTS_INITIAL, selection));
      return {
        x: INITIAL_PLACEMENT_PANEL_POSITION.x,
        y: INITIAL_PLACEMENT_PANEL_POSITION.y,
        width: Math.max(...panelLines.map((line) => estimateTextWidth(line, fontPx))),
        height: INITIAL_PLACEMENT_PANEL_LINES * INITIAL_PLACEMENT_LINE_HEIGHT,
      };
    };
    const startButtonRect: Rect = {
      ...INITIAL_PLACEMENT_START_BUTTON_POSITION,
      width: INITIAL_PLACEMENT_START_BUTTON_SIZE.width,
      height: INITIAL_PLACEMENT_START_BUTTON_SIZE.height,
    };
    // エンジニアの選択ボタン(#157)。開始ボタンの左に同じ高さで並ぶ。
    const engineerButtonRect: Rect = {
      ...INITIAL_PLACEMENT_ENGINEER_BUTTON_POSITION,
      width: INITIAL_PLACEMENT_ENGINEER_BUTTON_SIZE.width,
      height: INITIAL_PLACEMENT_ENGINEER_BUTTON_SIZE.height,
    };
    // メッセージの最長想定は「〇〇を撤去しました」「〇〇を置きました」（全アイテムの短い名前）と固定の失敗メッセージ、エンジニアのメッセージ(#157)。
    const messageRect = (): Rect => {
      const text = getMessages().initialPlacement;
      const messages = [
        ...ITEM_TYPES.flatMap((itemType) => [
          interpolate(text.removed, { name: ITEM_SHORT_NAMES[itemType] }),
          interpolate(text.placed, { name: ITEM_SHORT_NAMES[itemType] }),
        ]),
        text.insufficientPoints,
        text.noItemThere,
        getMessages().common.notPlaceable,
        text.engineerPlaced,
        text.engineerRemoved,
        text.engineerNotCandidate,
        text.engineerOverlapsItem,
        text.noUnplacedEngineer,
        text.selectFirst,
        text.placeAllEngineers,
      ];
      const longest = messages.reduce((a, b) => (estimateTextWidth(a, fontPx) >= estimateTextWidth(b, fontPx) ? a : b));
      return textRect(INITIAL_PLACEMENT_MESSAGE_POSITION, longest, fontPx);
    };
    const setupRects: readonly { readonly name: string; readonly rect: () => Rect }[] = [
      { name: 'パネル', rect: panelRect },
      { name: 'エンジニアの選択ボタン', rect: () => engineerButtonRect },
      { name: '開始ボタン', rect: () => startButtonRect },
      { name: 'メッセージ', rect: messageRect },
    ];

    it('パネルは2行で、操作説明の行は出さない（説明は右上の ℹ️ のゲームの説明 #165）', () => {
      expect(INITIAL_PLACEMENT_PANEL_LINES).toBe(2);
      for (const selection of selections) {
        expect(formatInitialPlacementPanel(STAGE_POINTS_INITIAL, selection)).toHaveLength(INITIAL_PLACEMENT_PANEL_LINES);
      }
      expect(Object.keys(getCatalogue(locale).initialPlacement)).not.toContain('instruction');
    });

    it('境界値: 初期配置UIの矩形はパネル・エンジニアの選択ボタン・開始ボタン・メッセージの4つで(#162)、上帯の下端（y=60）より下、出現列（x<60）の右', () => {
      expect(INITIAL_PLACEMENT_UI_BOUNDS).toEqual([
        { x: 72, y: 68, width: 392, height: 40 },
        { x: 72, y: 114, width: 150, height: 28 },
        { x: 228, y: 114, width: 128, height: 28 },
        { x: 72, y: 148, width: 392, height: 20 },
      ]);
      for (const uiRect of INITIAL_PLACEMENT_UI_BOUNDS) {
        expect(uiRect.y).toBeGreaterThanOrEqual(topBand.height);
        expect(uiRect.x).toBeGreaterThanOrEqual((ENGINEER_SPAWN_COL + 1) * CELL_SIZE);
        for (const rect of ITEM_BLOCKED_RECTS) expect(intersects(uiRect, rect)).toBe(false);
      }
    });

    it('境界値: 初期配置UIの矩形どうしは重ならない（間は置ける #162）', () => {
      INITIAL_PLACEMENT_UI_BOUNDS.forEach((a, i) => {
        INITIAL_PLACEMENT_UI_BOUNDS.slice(i + 1).forEach((b) => expect(intersects(a, b)).toBe(false));
      });
    });

    it('境界値: パネル・ボタンの行・メッセージは上から順に重ならず並び、メッセージの下端はメッセージの矩形の下端と一致する', () => {
      expect(panelRect().y + panelRect().height).toBeLessThanOrEqual(startButtonRect.y);
      expect(startButtonRect.y + startButtonRect.height).toBeLessThanOrEqual(messageRect().y);
      expect(INITIAL_PLACEMENT_MESSAGE_POSITION.y + INITIAL_PLACEMENT_LINE_HEIGHT).toBe(168);
      expect(estimateTextWidth(getMessages().initialPlacement.startButton, fontPx)).toBeLessThanOrEqual(INITIAL_PLACEMENT_START_BUTTON_SIZE.width);
    });

    it('境界値: エンジニアの選択ボタンは開始ボタンの左に同じ行で重ならず並び、人数が最大（MAX_ENGINEERS）の文言もボタン幅に収まる(#157)', () => {
      expect(engineerButtonRect.y).toBe(startButtonRect.y);
      expect(engineerButtonRect.x + engineerButtonRect.width).toBeLessThanOrEqual(startButtonRect.x);
      expect(estimateTextWidth(formatInitialPlacementEngineerButton(MAX_ENGINEERS), fontPx)).toBeLessThanOrEqual(engineerButtonRect.width);
    });

    // #162: UI の要素ごとに、どれか1つの矩形（INITIAL_PLACEMENT_UI_BOUNDS）に収まる（矩形の間の隙間にはみ出さない）。
    it.each(setupRects)('$name は初期配置UIの矩形のどれか1つ（INITIAL_PLACEMENT_UI_BOUNDS）とフィールドの内側に収まる', ({ rect }) => {
      expect(INITIAL_PLACEMENT_UI_BOUNDS.some((uiRect) => within(rect(), uiRect))).toBe(true);
      expect(within(rect(), field)).toBe(true);
    });

    it('矩形は経過日数・右上のアイコン・通知・購入結果のメッセージ・右下の指標と交差しない', () => {
      for (const uiRect of INITIAL_PLACEMENT_UI_BOUNDS) {
        for (const other of [elapsedDaysRect(), notificationRect, itemMessageRect(), STATUS_PANEL_RECT, ...iconRects.map(({ rect }) => rect)]) {
          expect(intersects(uiRect, other)).toBe(false);
        }
      }
    });

    it('矩形は初期配置の間に開くアイテムのメニューと交差しない（メニューを開いたまま床を押して置ける）', () => {
      for (const uiRect of INITIAL_PLACEMENT_UI_BOUNDS) expect(intersects(uiRect, menuPanelLayout('item').rect)).toBe(false);
    });

    it('矩形は全行の休暇マーカー・リリース地点と交差しない', () => {
      for (const uiRect of INITIAL_PLACEMENT_UI_BOUNDS) {
        for (const row of spawnRows) expect(intersects(uiRect, vacationMarkerRect(row))).toBe(false);
        expect(intersects(uiRect, cellRect(RELEASE_POINT_CELL.col, RELEASE_POINT_CELL.row))).toBe(false);
      }
    });
  });

  describe('通知の文言(#158)', () => {
    it('雇用・昇給減給・AIエージェント・退職の通知は通知の矩形（全角30文字相当）に収まる', () => {
      const messages = [
        formatHireMessage({ ok: false, reason: 'limit' }, 'junior'),
        formatHireMessage({ ok: false, reason: 'insufficientFunds' }, 'junior'),
        formatSalaryMessage({ ok: false, direction: 'raise', engineerId: 99, reason: 'at-max' }),
        formatSalaryMessage({ ok: false, direction: 'cut', engineerId: 99, reason: 'at-min' }),
        formatSalaryMessage({ ok: false, direction: 'raise', engineerId: 99, reason: 'invalid-salary' }),
        formatAiAgentMessage({ ok: false, reason: 'alreadyEquipped' }, 'strong'),
        formatResignedMessage(longestEngineer(null, false)),
      ];
      for (const message of messages) {
        expect(estimateTextWidth(message, NOTIFICATION_FONT_PX)).toBeLessThanOrEqual(notificationRect.width);
      }
    });
  });
});
