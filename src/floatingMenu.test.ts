import { describe, expect, it } from 'vitest';
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
  BALANCE_GAUGE,
  HELP_ICON_RECT,
  MENU_ROW_GAP,
} from './config';
import { CELL_SIZE, FIELD_HEIGHT, FIELD_ROWS, FIELD_WIDTH } from './field';
import {
  BALANCE_MENU_ROWS,
  ENGINEER_MENU_ROWS,
  ENGINEER_POPOVER_ROWS,
  ITEM_MENU_ROWS,
  layoutPanel,
  MENU_KINDS,
  menuIconRect,
  menuPanelLayout,
  panelHeight,
  popoverLayout,
  splitRow,
  toggleMenu,
} from './floatingMenu';
import type { MenuKind } from './floatingMenu';

describe('toggleMenu(#156)', () => {
  it.each(MENU_KINDS)('閉じているときに %s を押すと %s が開く', (kind) => {
    expect(toggleMenu(null, kind)).toBe(kind);
  });

  it.each(MENU_KINDS)('開いている %s をもう一度押すと閉じる', (kind) => {
    expect(toggleMenu(kind, kind)).toBeNull();
  });

  it.each(MENU_KINDS.flatMap((current) => MENU_KINDS.filter((clicked) => clicked !== current).map((clicked) => [current, clicked])))(
    '%s が開いているときに %s を押すとそちらに切り替わる（一度に1つだけ）',
    (current, clicked) => {
      expect(toggleMenu(current as MenuKind, clicked as MenuKind)).toBe(clicked);
    },
  );
});

describe('menuIconRect(#156)', () => {
  it('左からエンジニア・アイテム・開発バランスの順に間隔をあけて並び、右端は MENU_ICON_RIGHT（その右に間隔をあけてゲームの説明のアイコン #165）', () => {
    const [engineer, item, balance] = MENU_KINDS.map((kind) => menuIconRect(kind));
    expect(MENU_KINDS).toEqual(['engineer', 'item', 'balance']);
    expect(balance.x + balance.width).toBe(MENU_ICON_RIGHT);
    expect(item.x + item.width + MENU_ICON_GAP).toBe(balance.x);
    expect(engineer.x + engineer.width + MENU_ICON_GAP).toBe(item.x);
    expect(balance.x + balance.width + MENU_ICON_GAP).toBe(HELP_ICON_RECT.x);
    MENU_KINDS.forEach((kind) => {
      expect(menuIconRect(kind)).toMatchObject({ y: MENU_ICON_TOP, width: MENU_ICON_SIZE, height: MENU_ICON_SIZE });
    });
  });

  it('境界値: 既定の配置は x=784〜820・828〜864・872〜908、ゲームの説明は 916〜952（右端から 8px）、y=4〜40(#165)', () => {
    expect(MENU_KINDS.map((kind) => menuIconRect(kind))).toEqual([
      { x: 784, y: 4, width: 36, height: 36 },
      { x: 828, y: 4, width: 36, height: 36 },
      { x: 872, y: 4, width: 36, height: 36 },
    ]);
    expect(HELP_ICON_RECT).toEqual({ x: 916, y: 4, width: 36, height: 36 });
    expect(HELP_ICON_RECT.x + HELP_ICON_RECT.width).toBe(FIELD_WIDTH - 8);
  });
});

describe('パネルの行の並び(#156)', () => {
  it('panelHeight は 余白 × 2 + 各行の高さ + 行の間。行がなければ余白だけ', () => {
    expect(panelHeight([])).toBe(MENU_PANEL_PADDING * 2);
    expect(panelHeight([{ kind: 'text', lines: 1 }])).toBe(MENU_PANEL_PADDING * 2 + MENU_LINE_HEIGHT);
    expect(
      panelHeight([
        { kind: 'text', lines: 2 },
        { kind: 'buttons', count: 3 },
      ]),
    ).toBe(MENU_PANEL_PADDING * 2 + MENU_LINE_HEIGHT * 2 + MENU_ROW_GAP + MENU_BUTTON_HEIGHT);
  });

  it('layoutPanel は行を上から隙間 MENU_ROW_GAP で並べ、最後の行の下端 + 余白がパネルの下端', () => {
    const layout = layoutPanel(100, 50, 200, [
      { kind: 'text', lines: 1 },
      { kind: 'buttons', count: 1 },
    ]);
    expect(layout.rows).toEqual([
      { x: 108, y: 58, width: 184, height: MENU_LINE_HEIGHT },
      { x: 108, y: 58 + MENU_LINE_HEIGHT + MENU_ROW_GAP, width: 184, height: MENU_BUTTON_HEIGHT },
    ]);
    const last = layout.rows[1];
    expect(last.y + last.height + MENU_PANEL_PADDING).toBe(layout.rect.y + layout.rect.height);
  });

  it('splitRow はボタンを横に等分し、間は MENU_BUTTON_GAP_X、両端は行の端と一致する', () => {
    const row = { x: 10, y: 20, width: 100, height: 22 };
    const cells = splitRow(row, 3);
    expect(cells).toHaveLength(3);
    expect(cells[0].x).toBe(row.x);
    expect(cells[2].x + cells[2].width).toBeCloseTo(row.x + row.width);
    expect(cells[1].x - (cells[0].x + cells[0].width)).toBeCloseTo(MENU_BUTTON_GAP_X);
    expect(splitRow(row, 1)).toEqual([row]);
  });

  it.each([0, -1, 1.5])('splitRow のボタン数 %d は例外', (count) => {
    expect(() => splitRow({ x: 0, y: 0, width: 100, height: 22 }, count)).toThrow();
  });

  it('各メニューの行の数: エンジニアは人数・雇う（ランクの数）・選択中・前へ次へ・昇給減給、アイテムは枠（ページの枠数）とページ行', () => {
    expect(ENGINEER_MENU_ROWS).toHaveLength(1 + ENGINEER_RANKS.length + 3);
    expect(ITEM_MENU_ROWS).toHaveLength(ITEM_PAGE_SIZE + 1);
    expect(ITEM_MENU_ROWS.at(-1)).toEqual({ kind: 'buttons', count: 3 });
    // 開発バランスは見出し・ゲージ・割合の文言・◀ / ▶ のボタン(#165。11 段階の選択肢はやめた)。
    expect(BALANCE_MENU_ROWS).toEqual([
      { kind: 'text', lines: 1 },
      { kind: 'gauge' },
      { kind: 'text', lines: 1 },
      { kind: 'buttons', count: 2 },
    ]);
    // ポップオーバーは見出しと状態・休暇ボタン・AIエージェント（種類の数）。休暇の案内文はゲームの説明に移した(#165)。
    expect(ENGINEER_POPOVER_ROWS).toEqual([
      { kind: 'text', lines: 2 },
      { kind: 'buttons', count: 1 },
      ...AI_AGENT_BUTTON_ORDER.map(() => ({ kind: 'buttons', count: 1 })),
    ]);
  });

  it('ゲージの行の高さは BALANCE_GAUGE.height(#165)', () => {
    expect(panelHeight([{ kind: 'gauge' }])).toBe(MENU_PANEL_PADDING * 2 + BALANCE_GAUGE.height);
    expect(menuPanelLayout('balance').rows[1].height).toBe(BALANCE_GAUGE.height);
  });
});

describe('menuPanelLayout(#156)', () => {
  it.each(MENU_KINDS)('%s のメニューはアイコンの直下（間 MENU_PANEL_GAP_Y）に開き、右端をアイコンの右端に揃える', (kind) => {
    const icon = menuIconRect(kind);
    const { rect } = menuPanelLayout(kind);
    expect(rect.y).toBe(icon.y + icon.height + MENU_PANEL_GAP_Y);
    expect(rect.x + rect.width).toBe(icon.x + icon.width);
    expect(rect.width).toBe(MENU_PANEL_WIDTH[kind]);
  });

  it.each(MENU_KINDS)('%s のメニューはフィールドの内側に収まる', (kind) => {
    const { rect } = menuPanelLayout(kind);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(FIELD_WIDTH);
    expect(rect.y + rect.height).toBeLessThanOrEqual(FIELD_HEIGHT);
  });
});

describe('popoverLayout: 位置の制限(#156)', () => {
  const height = panelHeight(ENGINEER_POPOVER_ROWS);
  const spawnCenter = (row: number) => ({ x: CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 });

  it('中央の行では出現地点の中心の右 ENGINEER_POPOVER_OFFSET_X、縦は中心に合わせる', () => {
    const anchor = spawnCenter(4);
    const { rect } = popoverLayout(anchor);
    expect(rect.x).toBe(anchor.x + ENGINEER_POPOVER_OFFSET_X);
    expect(rect.y).toBe(Math.round(anchor.y - height / 2));
    expect(rect.width).toBe(ENGINEER_POPOVER_WIDTH);
    expect(rect.height).toBe(height);
  });

  it('境界値: 行0（上端）では上端が ENGINEER_POPOVER_MARGIN に、最終行（下端）では下端が FIELD_HEIGHT − MARGIN に寄る', () => {
    expect(popoverLayout(spawnCenter(0)).rect.y).toBe(ENGINEER_POPOVER_MARGIN);
    const bottom = popoverLayout(spawnCenter(FIELD_ROWS - 1)).rect;
    expect(bottom.y + bottom.height).toBe(FIELD_HEIGHT - ENGINEER_POPOVER_MARGIN);
  });

  it('境界値: 上端がちょうど MARGIN になる中心（MARGIN + 高さ/2）では寄せず、1px 上なら寄せる', () => {
    const exactY = ENGINEER_POPOVER_MARGIN + height / 2;
    expect(popoverLayout({ x: 30, y: exactY }).rect.y).toBe(Math.round(exactY - height / 2));
    expect(popoverLayout({ x: 30, y: exactY - 1 }).rect.y).toBe(ENGINEER_POPOVER_MARGIN);
  });

  it('境界値: 右端に寄った基準点では右端が FIELD_WIDTH − MARGIN、左端に寄った基準点では左端が MARGIN', () => {
    const right = popoverLayout({ x: FIELD_WIDTH, y: 270 }).rect;
    expect(right.x + right.width).toBe(FIELD_WIDTH - ENGINEER_POPOVER_MARGIN);
    const left = popoverLayout({ x: -1000, y: 270 }).rect;
    expect(left.x).toBe(ENGINEER_POPOVER_MARGIN);
  });

  it.each(Array.from({ length: FIELD_ROWS }, (_, row) => row))('行%i の出現地点のポップオーバーはフィールドの内側に収まり、出現列（x<60）に重ならない', (row) => {
    const { rect } = popoverLayout(spawnCenter(row));
    expect(rect.x).toBeGreaterThanOrEqual(CELL_SIZE);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(FIELD_WIDTH);
    expect(rect.y + rect.height).toBeLessThanOrEqual(FIELD_HEIGHT);
  });
});
