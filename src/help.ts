// ゲームの説明(#165)。右上の ℹ️ で開くパネルの文言と配置を決める純粋関数だけを置く。Phaser には依存しない（テスト可能にするため）。
// 「「出現地点の「休」で休暇/復帰」とかそんな説明いらない。右上にℹ️アイコンを置いて、それをクリックしたらゲーム説明を出せば良い」(#165) への対応で、
// 常時出していた説明（初期配置の操作説明・ポップオーバーの休暇の案内文）はここに移した。
// 文言は言語カタログ（help）、数値は config.ts の値から埋め込む（値を変えれば説明も変わる）。操作はマウスだけなので、キーの名前は出さない。
import { ATTACK_RANGE } from './attack';
import {
  BALANCE_STEP_BUTTON_LABELS,
  BANKRUPT_INCLUDES_ZERO,
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
} from './config';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';
import { MS_PER_GAME_DAY } from './gameTime';
import type { Rect } from './geometry';
import { formatYen, getMessages, interpolate } from './i18n';
import type { Point } from './route';

// 0〜1 の割合をパーセントポイント（四捨五入した整数）にする。
const toPercentPoints = (ratio: number): number => Math.round(ratio * 100);

// 説明の行（見出しを除く。上から順）。目的・操作（押し続けて移動・クリックで攻撃）・初期配置・出現地点のポップオーバー・休暇の効果・
// 雇用と給料・AIエージェント・アイテムとレベル・開発バランスのゲージ・HUD の絵文字・技術的負債の段階。
export const buildHelpLines = (): readonly string[] => {
  const text = getMessages().help;
  const levels = TECH_DEBT_LEVELS;
  return [
    interpolate(text.goal, {
      funds: formatYen(0),
      bankrupt: BANKRUPT_INCLUDES_ZERO ? text.bankruptAtOrBelow : text.bankruptBelow,
    }),
    interpolate(text.controls, { range: ATTACK_RANGE }),
    interpolate(text.setup, { points: STAGE_POINTS_INITIAL, start: getMessages().initialPlacement.startButton }),
    text.popover,
    interpolate(text.vacation, {
      reduction: toPercentPoints(VACATION_MALICIOUS_RATE_REDUCTION),
      max: toPercentPoints(VACATION_MALICIOUS_RATE_REDUCTION_MAX),
      min: toPercentPoints(CODE_MALICIOUS_RATE_MIN),
    }),
    interpolate(text.hire, { max: MAX_ENGINEERS }),
    text.aiAgent,
    interpolate(text.items, { days: LEVEL_UP_INTERVAL_DAYS }),
    interpolate(text.balance, {
      refactoring: BALANCE_STEP_BUTTON_LABELS.refactoring,
      feature: BALANCE_STEP_BUTTON_LABELS.feature,
      step: REFACTORING_RATIO_STEP_PERCENT,
    }),
    interpolate(text.hudIcons, {
      days: HUD_ICONS.days,
      funds: HUD_ICONS.funds,
      sales: HUD_ICONS.sales,
      payment: HUD_ICONS.monthEndPayment,
    }),
    // 段階の範囲は四捨五入した整数（getTechDebtLevel）で、下の段階の上限の次の値から始まる（0〜30・31〜60・61〜100）。
    interpolate(text.techDebt, {
      normal: levels.normal.icon,
      normalMin: 0,
      normalMax: levels.normal.max,
      caution: levels.caution.icon,
      cautionMin: levels.normal.max + 1,
      cautionMax: levels.caution.max,
      critical: levels.critical.icon,
      criticalMin: levels.caution.max + 1,
      criticalMax: levels.critical.max,
      outage: TECH_DEBT_OUTAGE_THRESHOLD,
      days: TECH_DEBT_OUTAGE_GRACE_MS / MS_PER_GAME_DAY,
    }),
  ];
};

// 文字サイズ（'13px' など）の px。
const fontPx = (fontSize: string): number => parseInt(fontSize, 10);
// 1行の高さ。文字サイズ × 1.25（縁取りを含めた余裕）の切り上げ + 行の間隔（メニュー・初期配置と同じ見積もり）。
const LINE_HEIGHT_RATIO = 1.25;
const lineHeight = (fontSize: string, spacing: number): number => Math.ceil(fontPx(fontSize) * LINE_HEIGHT_RATIO) + spacing;

export type HelpLayout = {
  // パネル全体（背景）の矩形。
  readonly panel: Rect;
  // 見出しの左上。
  readonly title: Point;
  // 説明の行ごとの左上（lineCount 個、上から順）。
  readonly lines: readonly Point[];
  // ✕ の閉じるボタンの矩形（パネルの右上の内側）。
  readonly close: Rect;
  // 説明の行に使える幅（パネルの幅 − 余白 × 2）。
  readonly innerWidth: number;
};

// lineCount 行の説明を入れるパネルの配置。幅はフィールドの幅から左右の余白（HELP_OVERLAY.panelMarginX）を引いた幅で、
// 高さは 余白 + 見出し + 見出しの下の間 + 行 × lineCount + 余白。パネルはフィールドの中央に置く（はみ出すなら例外にする）。
export const helpLayout = (lineCount: number): HelpLayout => {
  if (!Number.isInteger(lineCount) || lineCount < 0) throw new RangeError(`説明の行数が不正です: ${lineCount}`);
  const { padding, panelMarginX, titleFontSize, lineFontSize, lineSpacing, titleGap, closeButtonSize } = HELP_OVERLAY;
  const width = FIELD_WIDTH - panelMarginX * 2;
  const titleHeight = lineHeight(titleFontSize, 0);
  const rowHeight = lineHeight(lineFontSize, lineSpacing);
  const height = padding * 2 + titleHeight + titleGap + rowHeight * lineCount;
  if (height > FIELD_HEIGHT) throw new RangeError(`ゲームの説明がフィールドの高さに収まりません: ${height}px`);
  const x = panelMarginX;
  const y = Math.round((FIELD_HEIGHT - height) / 2);
  const firstLineY = y + padding + titleHeight + titleGap;
  return {
    panel: { x, y, width, height },
    title: { x: x + padding, y: y + padding },
    lines: Array.from({ length: lineCount }, (_, index) => ({ x: x + padding, y: firstLineY + index * rowHeight })),
    close: { x: x + width - padding - closeButtonSize, y: y + padding, width: closeButtonSize, height: closeButtonSize },
    innerWidth: width - padding * 2,
  };
};

// ゲームの説明を開けるか。ゲームオーバー中（倒産後）は開かない（リスタートの押下と重ならないように）。初期配置の間とプレイ中は開ける。
export const canOpenHelp = (gameOver: boolean): boolean => !gameOver;
