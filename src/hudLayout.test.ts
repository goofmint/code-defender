// 画面の常時表示（左上の経過日数・右上のアイコン・右下の指標）、アイコンで開くメニュー、エンジニアのポップオーバー、初期配置UIの配置(#156)。
// 文字列の幅は textMetrics.ts の推定幅（全角 1 文字 = フォントpx、半角はその比率 #158）で見積もり、重ならないこと・枠に収まることを確かめる。
// 文言に依存する検査は対応言語ごとに行う(#158)。言語が変わってもレイアウトの値（位置・大きさ）は変えず、収まらない文言は短くする。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AI_AGENT_BUTTON_ORDER,
  AI_AGENT_BUY_KEYS,
  ATTACK_KEYS,
  CODE_MALICIOUS_RATE_MIN,
  ELAPSED_DAYS_POSITION,
  ELAPSED_DAYS_STYLE,
  ENGINEER_HIRE_COST,
  ENGINEER_POPOVER_WIDTH,
  ENGINEER_RANKS,
  ENGINEER_SALARY_MAX,
  ENGINEER_SPAWN_COL,
  GAME_OVER_RESTART_KEYS,
  HIRE_KEYS,
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
  ITEM_BUY_KEYS,
  ITEM_MESSAGE_POSITION,
  ITEM_PAGE_KEYS,
  ITEM_PAGE_SIZE,
  ITEM_SHORT_NAMES,
  MAX_ENGINEERS,
  MENU_FONT_SIZE,
  PLAYER_MOVE_KEYS,
  REFACTORING_RATIO_KEYS,
  RELEASE_POINT_CELL,
  SALARY_ADJUST_KEYS,
  SALARY_SELECT_KEYS,
  STAGE_POINTS_INITIAL,
  STATUS_PANEL_FONT_SIZE,
  STATUS_PANEL_INDICATOR_GAP,
  STATUS_PANEL_INDICATOR_RADIUS,
  STATUS_PANEL_INDICATOR_WIDTH,
  STATUS_PANEL_LINE_HEIGHT,
  STATUS_PANEL_LINES,
  STATUS_PANEL_PADDING,
  STATUS_PANEL_RECT,
  TECH_DEBT_LEVELS,
  VACATION_HINT_LINES,
  VACATION_MALICIOUS_RATE_REDUCTION,
  VACATION_MALICIOUS_RATE_REDUCTION_MAX,
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
  formatVacationHint,
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
import { formatRefactoringAllocation, getRefactoringRatioOptions } from './refactoringRatioControl';
import { SPAWN_MARKER_STYLE } from './route';
import { formatElapsedDays } from './gameTime';
import { getCatalogue, getMessages, interpolate, setLocale } from './i18n';
import { SUPPORTED_LOCALES } from './i18n/resolveLocale';
import { formatTechDebtLevel } from './techDebt';
import type { TechDebtLevel } from './techDebt';
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

// 経過日数（左上。最長想定の日数）。現在の言語の文言で見積もる(#158)。
const elapsedDaysRect = (): Rect =>
  textRect(ELAPSED_DAYS_POSITION, formatElapsedDays(999_999), parseInt(ELAPSED_DAYS_STYLE.fontSize, 10));
// 通知（雇用・昇給減給・AIエージェント・退職のメッセージ）。文字数は長めの 30 文字で過大に見積もる。
const NOTIFICATION_FONT_PX = 20;
const NOTIFICATION_MAX_CHARS = 30;
const notificationRect = textRect(HIRE_MESSAGE_POSITION, 'あ'.repeat(NOTIFICATION_MAX_CHARS), NOTIFICATION_FONT_PX);
// 購入結果のメッセージ（最長の書き置きのメッセージ）。現在の言語の文言で見積もる(#158)。
const itemMessageRect = (): Rect => textRect(ITEM_MESSAGE_POSITION, getMessages().items.seniorNotePrevented, NOTIFICATION_FONT_PX);
const iconRects = MENU_KINDS.map((kind) => ({ kind, rect: menuIconRect(kind) }));

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

    it('通知・右上のアイコンと交差しない', () => {
      expect(intersects(elapsedDaysRect(), notificationRect)).toBe(false);
      for (const { rect } of iconRects) expect(intersects(elapsedDaysRect(), rect)).toBe(false);
    });
  });

  describe('右上のアイコンのレイアウト(#156)', () => {
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

    it('開発バランスのメニューの見出しと 11 段階の文言（機能100:リファ0 など）は幅に収まる', () => {
      const { rows } = menuPanelLayout('balance');
      expect(fitsWidth(getMessages().balance.title, rows[0].width)).toBe(true);
      const options = getRefactoringRatioOptions();
      expect(options).toHaveLength(11);
      options.forEach((ratio, index) => {
        expect(fitsWidth(formatRefactoringAllocation(ratio), rows[index + 1].width)).toBe(true);
      });
    });

    it('キー名（[1] や ◀G など）を出さない（キー操作は残す）', () => {
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

    it('見出し・状態・休暇ボタン・AIエージェントのボタン・休暇の案内文は幅（ENGINEER_POPOVER_WIDTH）の内側に収まる', () => {
      const { rows } = popoverLayout({ x: CELL_SIZE / 2, y: 270 });
      const [headingRow, vacationRow, ...rest] = rows;
      const aiRows = rest.slice(0, AI_AGENT_BUTTON_ORDER.length);
      const hintRow = rest[AI_AGENT_BUTTON_ORDER.length];
      for (const engineer of engineerVariants) {
        for (const line of formatEngineerPopoverLines(engineer)) expect(fitsWidth(line, headingRow.width)).toBe(true);
        expect(fitsWidth(formatVacationButton(engineer), vacationRow.width)).toBe(true);
      }
      AI_AGENT_BUTTON_ORDER.forEach((agentType, index) => {
        expect(fitsWidth(formatAiAgentOption(agentType), aiRows[index].width)).toBe(true);
      });
      for (const line of formatVacationHint()) expect(fitsWidth(line, hintRow.width)).toBe(true);
      expect(hintRow.width).toBeLessThan(ENGINEER_POPOVER_WIDTH);
    });
  });

  describe('右下の指標のレイアウト(#156)', () => {
    const statusFontPx = parseInt(STATUS_PANEL_FONT_SIZE, 10);
    const linesWidth = STATUS_PANEL_RECT.width - STATUS_PANEL_INDICATOR_WIDTH;

    it('境界値: 下帯（y=480〜540）の右端に収まる（x=612〜952、y=480〜532）', () => {
      expect(STATUS_PANEL_RECT).toEqual({ x: 612, y: 480, width: 340, height: 52 });
      expect(within(STATUS_PANEL_RECT, bottomBand)).toBe(true);
      expect(STATUS_PANEL_RECT.height).toBe(STATUS_PANEL_LINE_HEIGHT * STATUS_PANEL_LINES + STATUS_PANEL_PADDING * 2);
    });

    it('購入結果のメッセージ・最終行の休暇マーカー・リリース地点と交差しない', () => {
      expect(intersects(STATUS_PANEL_RECT, itemMessageRect())).toBe(false);
      expect(intersects(STATUS_PANEL_RECT, vacationMarkerRect(FIELD_ROWS - 1))).toBe(false);
      expect(intersects(STATUS_PANEL_RECT, cellRect(RELEASE_POINT_CELL.col, RELEASE_POINT_CELL.row))).toBe(false);
    });

    it('資金・累計売上・月末支払の最長想定の文言は3行の欄に収まる', () => {
      expect(fitsWidth(formatFunds(-9_999_999_999), linesWidth, statusFontPx)).toBe(true);
      expect(fitsWidth(formatCumulativeSales(9_999_999_999), linesWidth, statusFontPx)).toBe(true);
      expect(fitsWidth(formatMonthEndPayment(9_999_999_999), linesWidth, statusFontPx)).toBe(true);
    });

    it('負債の丸と最長の段階の語（「負債 要解消」）は左の欄に収まる', () => {
      const levels = Object.keys(TECH_DEBT_LEVELS) as TechDebtLevel[];
      const longest = Math.max(...levels.map((level) => estimateTextWidth(formatTechDebtLevel(level), statusFontPx)));
      const indicator = STATUS_PANEL_PADDING + STATUS_PANEL_INDICATOR_RADIUS * 2 + STATUS_PANEL_INDICATOR_GAP + longest;
      expect(indicator).toBeLessThanOrEqual(STATUS_PANEL_INDICATOR_WIDTH);
    });
  });

  describe('キー操作（画面には出さないが残す #156）', () => {
    it('購入キー・ページの枠数はすべて6で一致し、18個は3ページになる', () => {
      expect(ITEM_BUY_KEYS).toHaveLength(6);
      expect(ITEM_PAGE_SIZE).toBe(ITEM_BUY_KEYS.length);
      expect(ITEM_TYPES).toHaveLength(18);
      expect(getItemPageCount(ITEM_TYPES.length)).toBe(3);
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

    it('操作説明は右上のアイテムのアイコンから選ぶ手順にする(#156)', () => {
      expect(getCatalogue('ja').initialPlacement.instruction).toContain('右上のアイテムアイコン');
      expect(getCatalogue('ja').initialPlacement.instruction).toContain('×で取消');
      expect(getMessages().initialPlacement.instruction).toContain('×');
    });

    it('境界値: 初期配置UIの矩形はパネル・エンジニアの選択ボタン・開始ボタン・メッセージの4つで(#162)、上帯の下端（y=60）より下、出現列（x<60）の右', () => {
      expect(INITIAL_PLACEMENT_UI_BOUNDS).toEqual([
        { x: 72, y: 68, width: 392, height: 60 },
        { x: 72, y: 134, width: 150, height: 28 },
        { x: 228, y: 134, width: 128, height: 28 },
        { x: 72, y: 168, width: 392, height: 20 },
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
      expect(INITIAL_PLACEMENT_MESSAGE_POSITION.y + INITIAL_PLACEMENT_LINE_HEIGHT).toBe(188);
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

// 休暇の案内文の日本語の文言と数値の組み立て（英語の文言は engineer.test.ts で確かめる #158）。
describe('休暇の案内文(#150, #156)', () => {
  const points = (ratio: number): number => Math.round(ratio * 100);

  it('文言は 3 行で、1回の低下量・累積の上限・下限を config から作る（0.1 / 0.2 / 0.05 → -10pt/回・最大-20pt・下限5%）', () => {
    const lines = formatVacationHint();
    expect(lines).toHaveLength(VACATION_HINT_LINES);
    expect(lines).toEqual([
      '休暇ボタンで休暇/復帰（給与は継続）',
      `不正率-${points(VACATION_MALICIOUS_RATE_REDUCTION)}pt/回・最大-${points(VACATION_MALICIOUS_RATE_REDUCTION_MAX)}pt・下限${points(CODE_MALICIOUS_RATE_MIN)}%`,
      '効果は復帰後も維持。休暇中は生産停止',
    ]);
    const joined = lines.join('\n');
    expect(joined).toContain('-10pt/回');
    expect(joined).toContain('最大-20pt');
    expect(joined).toContain('下限5%');
    expect(joined).toContain('復帰後も維持');
    expect(joined).toContain('生産停止');
    expect(joined).toContain('給与は継続');
  });

  it('境界値: 数値は四捨五入した整数（0.004 → 0、0.005 → 1、0.2 → 20）', () => {
    expect(formatVacationHint(0.004, 0.004, 0.004)[1]).toBe('不正率-0pt/回・最大-0pt・下限0%');
    expect(formatVacationHint(0.005, 0.005, 0.005)[1]).toBe('不正率-1pt/回・最大-1pt・下限1%');
    expect(formatVacationHint(0.2, 0.2, 0.2)[1]).toBe('不正率-20pt/回・最大-20pt・下限20%');
  });
});
