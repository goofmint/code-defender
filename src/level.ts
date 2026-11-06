// レベル(#164)。経過時間から求める純粋関数だけを置く。Phaser には依存しない（テスト可能にするため）。
// レベルは別のカウンターを持たず、毎回ゲーム内の経過日数（gameTime.ts の getElapsedDays）から求める。scene.restart() で経過時間が 0 に戻れば Lv.1 に戻る。
import { LEVEL_UP_INTERVAL_DAYS } from './config';
import { getElapsedDays } from './gameTime';
import { getMessages, interpolate } from './i18n';

// 経過時間（ms）のレベル。1 + floor(経過日数 / LEVEL_UP_INTERVAL_DAYS)。0〜29日が Lv.1、30日ちょうどで Lv.2。上限はない。
// 負値・NaN・Infinity の経過時間は getElapsedDays が 0日として扱うので Lv.1。
export const levelAt = (elapsedMs: number): number =>
  1 + Math.floor(getElapsedDays(elapsedMs) / LEVEL_UP_INTERVAL_DAYS);

// 左上の表示「Lv.2 / 30日」（英語は「Lv.2 / Day 30」）。日数は区切らない。
export const formatLevelAndDays = (level: number, days: number): string =>
  interpolate(getMessages().hud.levelAndDays, { level, days });
