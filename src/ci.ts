// CI(#55) の固有効果（リリース直前の減速と確率阻止）の純粋ロジック。Phaser には依存しない（テスト可能にするため）。
// 状態の適用（移動・撃破の後処理・イベント発行）は main.ts の updateCodes が行う。
// 効果範囲は「リリース地点までの経路の残り距離」がゾーン長（getItemRange('ci')）以下の部分。CI を置いたセルの位置には依存しない。
import { CI_INTERCEPT_RATE, CI_SLOW_MULTIPLIER, ITEM_STRONG_AGAINST_MULTIPLIER } from './config';
import type { FlowingCode } from './codeFlow';
import { isItemSpecialty } from './item';
import type { MaliciousCodeType } from './maliciousCode';
import type { PlacedItem } from './itemPlacement';

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

// 置いたアイテムに CI が1個以上あるか。
export const hasActiveCi = (placedItems: readonly PlacedItem[]): boolean =>
  placedItems.some((item) => item.itemType === 'ci');

// CI の効果範囲を考慮した、このフレームの移動距離。advanceCode に渡す前に計算する。
// remaining はリリース地点までの残り距離。範囲外の部分は通常速度、範囲内の部分は multiplier 倍で進む。
// 1フレームで範囲の境界をまたぐときは、範囲外の残りを通常速度で進み、残る移動量だけに multiplier を掛ける。
// distance が 0 以下・非有限、zoneLength が 0 以下・非有限、remaining が非有限のときは distance をそのまま返す（休暇中の 0 は 0 のまま）。
// multiplier は [0, 1] に収め、非有限値は 1（減速なし）とする。
export const ciSlowedDistance = (
  remaining: number,
  distance: number,
  zoneLength: number,
  multiplier: number = CI_SLOW_MULTIPLIER,
): number => {
  if (!Number.isFinite(distance) || distance <= 0) return distance;
  if (!Number.isFinite(zoneLength) || zoneLength <= 0) return distance;
  if (!Number.isFinite(remaining)) return distance;
  const safeMultiplier = Number.isFinite(multiplier) ? clampUnit(multiplier) : 1;
  const outsideZone = Math.max(0, remaining - zoneLength);
  if (outsideZone >= distance) return distance;
  return outsideZone + (distance - outsideZone) * safeMultiplier;
};

// 不正なコード1体に対する CI 1個の阻止確率。得意な種類なら baseRate × ITEM_STRONG_AGAINST_MULTIPLIER。
// 結果は [0, 1] に収め、非有限値は 0（阻止しない）とする。種類なし(undefined)は得意でない扱いで baseRate。
export const getCiInterceptRate = (
  maliciousType: MaliciousCodeType | undefined,
  baseRate: number = CI_INTERCEPT_RATE,
): number => {
  const rate = isItemSpecialty('ci', maliciousType) ? baseRate * ITEM_STRONG_AGAINST_MULTIPLIER : baseRate;
  return Number.isFinite(rate) ? clampUnit(rate) : 0;
};

// リリースに到達した不正なコードを、置いた順に CI ごとに独立して1回ずつ判定する。random() < 阻止確率 で阻止。
// 最初に阻止した CI を返す（以降の CI は判定しない）。どの CI も阻止しなければ null。
// 正常なコード・CI が0個のときは乱数を呼ばずに null。乱数が NaN や 1 以上なら阻止しない。入力は変更しない。
export const rollCiInterception = (
  placedItems: readonly PlacedItem[],
  code: Pick<FlowingCode, 'kind' | 'maliciousType'>,
  random: () => number,
  baseRate: number = CI_INTERCEPT_RATE,
): PlacedItem | null => {
  if (code.kind !== 'malicious') return null;
  const rate = getCiInterceptRate(code.maliciousType, baseRate);
  for (const item of placedItems) {
    if (item.itemType !== 'ci') continue;
    if (random() < rate) return item;
  }
  return null;
};
