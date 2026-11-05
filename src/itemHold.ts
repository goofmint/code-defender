// テストツールの足止め(#54)の純粋関数。Phaser には依存しない（テスト可能にするため）。
// 足止め中のコードは移動しない。残り時間はシーンの update と同じ delta で減らし、切れたフレームでは残りの時間だけ進む。
import { TEST_TOOL_HOLD_MS } from './config';
import type { ItemType } from './item';

// 負・NaN・Infinity は 0 として扱う（item.ts の calculateItemDamage と同じ方針）。
const sanitize = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

// アイテムの1ヒットで付与する足止め時間（ミリ秒）。テストツールだけが足止めし、他の種別は 0。
export const getItemHoldMs = (itemType: ItemType, testToolHoldMs: number = TEST_TOOL_HOLD_MS): number =>
  itemType === 'testTool' ? sanitize(testToolHoldMs) : 0;

// 足止めを付け直したあとの残り時間。重ね掛けは加算せず、長い方を残す。
export const applyHold = (currentRemainingMs: number, holdMs: number): number =>
  Math.max(sanitize(currentRemainingMs), sanitize(holdMs));

export type HoldStep = {
  // このフレーム後の残り足止め時間。
  readonly remainingMs: number;
  // このフレームで移動に使える時間。足止めのないコードは deltaMs そのまま。
  readonly movableMs: number;
};

// 1フレーム分、足止めを進める。
export const advanceHold = (remainingMs: number, deltaMs: number): HoldStep => {
  const remaining = sanitize(remainingMs);
  const delta = sanitize(deltaMs);
  return {
    remainingMs: Math.max(0, remaining - delta),
    movableMs: Math.max(0, delta - remaining),
  };
};
