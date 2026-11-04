import { DAYS_PER_GAME_MONTH, ELAPSED_DAYS_FORMAT, MS_PER_GAME_MONTH } from './config';

// ゲーム内時計。Phaser に依存しない純粋関数だけを置く。
// 時計は「経過msを累積する」形。個別の休暇(#36)ではゲーム時計を止めない。一時停止で時間を止めるかは未決定。
// 決まったら、停止中は advanceElapsedMs を呼ばない（累積を止める）だけで足せる。

export const MS_PER_GAME_DAY = MS_PER_GAME_MONTH / DAYS_PER_GAME_MONTH;

// 月が経過したときに scene.events で発行するイベント名。
// 後続タスクは `scene.events.on(MONTH_ELAPSED_EVENT, ...)` で接続する（#19 給料、#51 月額アイテム、#37 休暇中の給料など）。
export const MONTH_ELAPSED_EVENT = 'month-elapsed';

export type MonthElapsedEvent = {
  // 何か月目の境界か（1始まり）。
  readonly month: number;
  // 境界の時刻（ms）= month × MS_PER_GAME_MONTH。
  readonly elapsedMs: number;
  // その時点の経過日数。
  readonly days: number;
};

// 負値・NaN・Infinity は 0 として扱う。
const sanitize = (ms: number): number => (Number.isFinite(ms) && ms > 0 ? ms : 0);

// 経過msに delta を加算する。負・非有限の delta は加算しない。
export const advanceElapsedMs = (elapsedMs: number, deltaMs: number): number =>
  sanitize(elapsedMs) + sanitize(deltaMs);

// 経過日数（端数は切り捨て、0日から開始）。
export const getElapsedDays = (elapsedMs: number): number =>
  Math.floor(sanitize(elapsedMs) / MS_PER_GAME_DAY);

// 経過月数（端数は切り捨て）。
export const getElapsedMonths = (elapsedMs: number): number =>
  Math.floor(sanitize(elapsedMs) / MS_PER_GAME_MONTH);

// 区間 (prevMs, nextMs] で越えた月の境界（1始まりの月番号）を昇順で返す。
// 境界ちょうどに到達したらその月を含み、prev が境界ちょうどならその月は含まない（同じ境界を2回出さない）。
export const getCrossedMonths = (prevMs: number, nextMs: number): number[] => {
  const from = getElapsedMonths(prevMs);
  const to = getElapsedMonths(nextMs);
  const months: number[] = [];
  for (let month = from + 1; month <= to; month++) {
    months.push(month);
  }
  return months;
};

export const createMonthElapsedEvent = (month: number): MonthElapsedEvent => {
  const elapsedMs = month * MS_PER_GAME_MONTH;
  return { month, elapsedMs, days: getElapsedDays(elapsedMs) };
};

export const formatElapsedDays = (days: number): string =>
  `${ELAPSED_DAYS_FORMAT.prefix}${days}${ELAPSED_DAYS_FORMAT.suffix}`;
