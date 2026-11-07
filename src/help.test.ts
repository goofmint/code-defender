// ゲームの説明(#165)の文言と配置。数値が config.ts の値と一致すること、キーの名前をキーボード操作の行(#182)のほかに出さないこと、どの言語の行もパネルに収まることを確かめる。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ATTACK_RANGE } from './attack';
import {
  BALANCE_STEP_BUTTON_LABELS,
  CODE_MALICIOUS_RATE_MIN,
  HELP_OVERLAY,
  HUD_ICONS,
  LEVEL_UP_INTERVAL_DAYS,
  MAX_ENGINEERS,
  REFACTORING_RATIO_STEP_PERCENT,
  STAGE_POINTS_INITIAL,
  TECH_DEBT_LEVELS,
  TECH_DEBT_OUTAGE_GRACE_MS,
  TECH_DEBT_OUTAGE_THRESHOLD,
  VACATION_MALICIOUS_RATE_REDUCTION,
  VACATION_MALICIOUS_RATE_REDUCTION_MAX,
  VIRTUAL_PAD_LABELS,
} from './config';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';
import { MS_PER_GAME_DAY } from './gameTime';
import { buildHelpLines, canOpenHelp, helpLayout } from './help';
import { getMessages, setLocale } from './i18n';
import { SUPPORTED_LOCALES } from './i18n/resolveLocale';
import { estimateTextWidth } from './textMetrics';

type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
const within = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

const points = (ratio: number): number => Math.round(ratio * 100);
const lineFontPx = parseInt(HELP_OVERLAY.lineFontSize, 10);
const titleFontPx = parseInt(HELP_OVERLAY.titleFontSize, 10);

describe('buildHelpLines（日本語）(#165)', () => {
  const lines = buildHelpLines();
  const joined = lines.join('\n');

  it('目的・操作・キーボードとパッド(#182)・初期配置・ポップオーバー・休暇・雇用・AI・アイテム・開発バランス・絵文字・負債の12行', () => {
    expect(lines).toHaveLength(12);
    expect(lines[0]).toBe('正常なコードはリリースまで通し、不正なコードは倒す。資金が0円以下になると倒産');
    expect(lines[1]).toBe(`マウスを押し続けると主人公がそこへ動く。主人公をクリックすると${ATTACK_RANGE}px以内の不正なコードを攻撃`);
  });

  it('キーボードとバーチャルパッドの行(#182): 矢印かWASDで移動・スペースで攻撃、パッドのボタンの文字は config と同じで中央が攻撃', () => {
    const { up, down, left, right, attack } = VIRTUAL_PAD_LABELS;
    expect(lines[2]).toBe(`キーボード: 矢印かWASDで移動、スペースで攻撃。右下のパッド: ${up}${down}${left}${right}で移動、中央の${attack}で攻撃`);
  });

  it('休暇の効果の数値は config から作る（-10pt/回・最大-20pt・下限5%。給与は継続・休暇中は生産停止）', () => {
    expect(lines[5]).toBe(
      `休暇: 不正率-${points(VACATION_MALICIOUS_RATE_REDUCTION)}pt/回・最大-${points(VACATION_MALICIOUS_RATE_REDUCTION_MAX)}pt・下限${points(CODE_MALICIOUS_RATE_MIN)}%。効果は復帰後も維持。給与は継続、休暇中は生産停止`,
    );
    expect(joined).toContain('-10pt/回');
    expect(joined).toContain('最大-20pt');
    expect(joined).toContain('下限5%');
  });

  it('初期配置のポイント・開始ボタンの文言、雇用の上限、レベルの間隔、割合の刻みとボタンの文字は config と同じ', () => {
    expect(lines[3]).toContain(`（${STAGE_POINTS_INITIAL}pt）`);
    expect(lines[3]).toContain(`「${getMessages().initialPlacement.startButton}」`);
    // 初期は0人なので、初期配置の間にエンジニアのランクを選んで色付きの床に置く手順を書く(#172, #184)。
    expect(lines[3]).toContain('エンジニアのランクを選んで色付きの床へ');
    expect(lines[6]).toContain(`最大${MAX_ENGINEERS}人`);
    expect(lines[8]).toContain(`${LEVEL_UP_INTERVAL_DAYS}日ごと`);
    expect(lines[9]).toContain(`${BALANCE_STEP_BUTTON_LABELS.refactoring} ${BALANCE_STEP_BUTTON_LABELS.feature}で${REFACTORING_RATIO_STEP_PERCENT}%ずつ`);
  });

  it('HUD の絵文字の意味（📅 経過日数・💰 資金・📈 累計売上・💸 次の月末に払う額）', () => {
    expect(lines[10]).toBe(
      `${HUD_ICONS.days}経過日数 ${HUD_ICONS.funds}資金 ${HUD_ICONS.sales}累計売上 ${HUD_ICONS.monthEndPayment}次の月末に払う額`,
    );
  });

  it('境界値: 負債の段階の範囲は四捨五入の判定と同じ（🔵0〜30 🟡31〜60 🔴61〜100）。大障害の閾値と放置日数も config から作る', () => {
    const { normal, caution, critical } = TECH_DEBT_LEVELS;
    expect(lines[11]).toBe(
      `技術的負債: ${normal.icon}0〜${normal.max} ${caution.icon}${normal.max + 1}〜${caution.max} ${critical.icon}${caution.max + 1}〜${critical.max}。${TECH_DEBT_OUTAGE_THRESHOLD}を超えたまま${TECH_DEBT_OUTAGE_GRACE_MS / MS_PER_GAME_DAY}日で大障害`,
    );
    expect(lines[11]).toContain('🔵0〜30 🟡31〜60 🔴61〜100');
    expect(lines[11]).toContain('80を超えたまま30日');
  });
});

describe.each(SUPPORTED_LOCALES)('ゲームの説明（言語 %s #165）', (locale) => {
  beforeEach(() => {
    setLocale(locale);
  });
  afterEach(() => {
    setLocale('ja');
  });

  it('キーの名前（Enter・Space・キー・[1] など）は、キーボードとパッドの行(#182)のほかには出さない（ほかの操作はマウスだけ）', () => {
    const lines = buildHelpLines();
    for (const line of [getMessages().help.title, ...lines.filter((_, index) => index !== 2)]) {
      expect(line).not.toMatch(/\b(enter|space|shift|esc|key|keys|wasd)\b|キー|スペース|矢印|\[\d\]|\b[A-Z]\/[A-Z]\b/i);
    }
  });

  it('キーボードとパッドの行(#182)は、移動の WASD・攻撃のスペース・パッドの5つのボタンの文字を含み、ほかのキーの名前は出さない', () => {
    const line = buildHelpLines()[2];
    expect(line).toContain('WASD');
    expect(line).toContain(locale === 'ja' ? 'スペース' : 'Space');
    for (const label of Object.values(VIRTUAL_PAD_LABELS)) expect(line).toContain(label);
    expect(line).not.toMatch(/\b(enter|shift|esc)\b|\[\d\]/i);
  });

  it('初期配置の行は、ランクを選んで床をクリックして置き、1人以上で始められることを含み、全員の配置は求めない(#178, #184)', () => {
    const setupLine = buildHelpLines()[3];
    if (locale === 'ja') {
      expect(setupLine).toContain('ランクを選んで');
      expect(setupLine).toContain('1人以上で開始');
      expect(setupLine).not.toContain('全員');
    } else {
      expect(setupLine).toContain('pick a rank');
      expect(setupLine).toContain('start with 1 or more');
      expect(setupLine).not.toContain('place all');
    }
  });

  it('プレースホルダーが残らない', () => {
    for (const line of buildHelpLines()) expect(line).not.toMatch(/[{}]/);
  });

  it('説明の行はどれもパネルの内側の幅に収まる（推定幅）', () => {
    const lines = buildHelpLines();
    const layout = helpLayout(lines.length);
    for (const line of lines) {
      expect(estimateTextWidth(line, lineFontPx), line).toBeLessThanOrEqual(layout.innerWidth);
    }
  });

  it('見出しは ✕ のボタンと重ならない', () => {
    const layout = helpLayout(buildHelpLines().length);
    expect(layout.title.x + estimateTextWidth(getMessages().help.title, titleFontPx)).toBeLessThanOrEqual(layout.close.x);
  });
});

describe('helpLayout(#165)', () => {
  const field: Rect = { x: 0, y: 0, width: FIELD_WIDTH, height: FIELD_HEIGHT };
  const lineCount = buildHelpLines().length;
  const layout = helpLayout(lineCount);
  const lineHeight = Math.ceil(lineFontPx * 1.25) + HELP_OVERLAY.lineSpacing;

  it('パネルはフィールドの内側で、横は左右の余白 panelMarginX、縦は中央', () => {
    expect(within(layout.panel, field)).toBe(true);
    expect(layout.panel.x).toBe(HELP_OVERLAY.panelMarginX);
    expect(layout.panel.x + layout.panel.width).toBe(FIELD_WIDTH - HELP_OVERLAY.panelMarginX);
    expect(Math.abs(layout.panel.y - (FIELD_HEIGHT - (layout.panel.y + layout.panel.height)))).toBeLessThanOrEqual(1);
    expect(layout.innerWidth).toBe(layout.panel.width - HELP_OVERLAY.padding * 2);
  });

  it('✕ のボタンはパネルの右上の内側', () => {
    expect(within(layout.close, layout.panel)).toBe(true);
    expect(layout.close.x + layout.close.width).toBe(layout.panel.x + layout.panel.width - HELP_OVERLAY.padding);
    expect(layout.close.y).toBe(layout.panel.y + HELP_OVERLAY.padding);
  });

  it('説明の行は見出しの下に1行の高さずつ並び、最後の行の下端 + 余白がパネルの下端', () => {
    expect(layout.lines).toHaveLength(lineCount);
    expect(layout.lines[0].y).toBeGreaterThan(layout.title.y);
    layout.lines.slice(1).forEach((line, index) => expect(line.y - layout.lines[index].y).toBe(lineHeight));
    const last = layout.lines[lineCount - 1];
    expect(last.y + lineHeight + HELP_OVERLAY.padding).toBe(layout.panel.y + layout.panel.height);
  });

  it('境界値: 0 行はできる。負・整数でない行数と、フィールドの高さを超える行数は例外', () => {
    expect(helpLayout(0).lines).toEqual([]);
    expect(() => helpLayout(-1)).toThrow(RangeError);
    expect(() => helpLayout(1.5)).toThrow(RangeError);
    expect(() => helpLayout(100)).toThrow(RangeError);
  });
});

describe('canOpenHelp(#165)', () => {
  it('ゲームオーバー中は開けない。それ以外（初期配置・プレイ中）は開ける', () => {
    expect(canOpenHelp(true)).toBe(false);
    expect(canOpenHelp(false)).toBe(true);
  });
});
