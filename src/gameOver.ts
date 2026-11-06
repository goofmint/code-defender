import { BANKRUPT_INCLUDES_ZERO, GAME_OVER_LAYOUT, GAME_OVER_RESTART_DELAY_MS } from './config';
import { FIELD_HEIGHT } from './field';
import { getMessages, interpolate } from './i18n';
import { formatScore } from './score';

// ゲームオーバー（倒産）の判定。Phaser に依存しない純粋関数だけを置く。

// ゲームオーバーになったときに scene.events で発行するイベント名。
export const GAME_OVER_EVENT = 'game-over';

// ゲームオーバーの理由。今は倒産のみ。理由が増えたらここに足す。
export type GameOverReason = 'bankruptcy';

export type GameOverEvent = {
  readonly reason: GameOverReason;
  // ゲームオーバー時点の資金。
  readonly funds: number;
  // ゲームオーバー時点のゲーム内経過ミリ秒。
  readonly elapsedMs: number;
};

export type GameOverState = {
  readonly over: boolean;
  // ゲームオーバーになった scene 時刻（ミリ秒）。未ゲームオーバーなら null。
  readonly at: number | null;
};

export const INITIAL_GAME_OVER_STATE: GameOverState = { over: false, at: null };

// 倒産かどうか。includesZero が true なら残高 0 以下、false なら 0 未満。
// NaN と -Infinity は倒産、+Infinity は倒産しない。
export const isBankrupt = (funds: number, includesZero: boolean = BANKRUPT_INCLUDES_ZERO): boolean =>
  includesZero ? !(funds > 0) : !(funds >= 0);

export const createGameOverEvent = (
  reason: GameOverReason,
  funds: number,
  elapsedMs: number,
): GameOverEvent => ({ reason, funds, elapsedMs });

// 資金の変化ごとに倒産を判定する。すでにゲームオーバーなら state をそのまま返し、再発火しない。
export const checkBankruptcy = (
  state: GameOverState,
  funds: number,
  now: number,
  includesZero: boolean = BANKRUPT_INCLUDES_ZERO,
): { readonly state: GameOverState; readonly triggered: boolean } => {
  if (state.over || !isBankrupt(funds, includesZero)) {
    return { state, triggered: false };
  }
  return { state: { over: true, at: now }, triggered: true };
};

// ゲームオーバー後、待ち時間を過ぎていればリスタートできる。
export const canRestart = (
  state: GameOverState,
  now: number,
  delayMs: number = GAME_OVER_RESTART_DELAY_MS,
): boolean => state.over && state.at !== null && now - state.at >= delayMs;

export type GameOverLine = {
  readonly text: string;
  // 文字サイズ(px)。
  readonly fontSize: number;
  // 行の中心の y 座標。
  readonly y: number;
};

// ゲームオーバー画面の行（タイトル→スコア→経過日数→案内）を上から順に返す。文言は現在の言語のカタログの4行(#158)。
export const buildGameOverLines = (score: number, elapsedDays: number): GameOverLine[] => {
  const messages = getMessages().gameOver;
  const centerY = FIELD_HEIGHT / 2;
  const line = (text: string, layout: { readonly fontSize: number; readonly offsetY: number }): GameOverLine => ({
    text,
    fontSize: layout.fontSize,
    y: centerY + layout.offsetY,
  });
  return [
    line(messages.title, GAME_OVER_LAYOUT.title),
    line(formatScore(score), GAME_OVER_LAYOUT.score),
    line(interpolate(messages.elapsedDays, { days: elapsedDays }), GAME_OVER_LAYOUT.elapsedDays),
    line(messages.restart, GAME_OVER_LAYOUT.restart),
  ];
};
