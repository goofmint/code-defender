import { TECH_DEBT_OUTAGE_DAMAGE, TECH_DEBT_OUTAGE_GRACE_MS, TECH_DEBT_OUTAGE_THRESHOLD } from './config';
import type { GameOverState } from './gameOver';
import { subtractFunds } from './funds';

// 技術的負債の放置による大障害の純粋ロジック。Phaser に依存しない（techDebt.ts / incident.ts と同じ構成）。
// 負債が上限に張り付くと TECH_DEBT_CHANGED_EVENT は発行されないため、放置時間はシーンのフレームループで経過時間から進める。

// 大障害が起きたときに scene.events で発行するイベント名。
export const MAJOR_OUTAGE_EVENT = 'major-outage-occurred';

export type MajorOutageEvent = {
  // 大障害が起きた時点の技術的負債。
  readonly techDebt: number;
  // 閾値を超えたまま続けて放置された時間（ミリ秒）。
  readonly neglectedMs: number;
  // 損害額（円）。
  readonly damage: number;
  readonly fundsBefore: number;
  readonly fundsAfter: number;
};

export type TechDebtNeglectResult = {
  // 次のフレームに持ち越す放置時間（ミリ秒）。大障害が起きたら 0。
  readonly neglectMs: number;
  // このフレームで大障害が起きたか。
  readonly outage: boolean;
  // このフレームまでに続けて放置された時間（ミリ秒、0 に戻す前の値）。
  readonly neglectedMs: number;
};

// 負・NaN・Infinity は 0 として扱う（gameTime.ts の sanitize と同じ方針）。
const sanitizeMs = (ms: number): number => (Number.isFinite(ms) && ms > 0 ? ms : 0);

// 負・NaN・Infinity の損害額は 0 として扱う（incident.ts の calculateDamage と同じ方針）。
const sanitizeDamage = (damage: number): number =>
  Number.isFinite(damage) && damage > 0 ? damage : 0;

// 技術的負債が閾値を超えているか。ちょうどは超えていない。NaN は超えていない。
export const isTechDebtOverOutageThreshold = (
  debt: number,
  threshold: number = TECH_DEBT_OUTAGE_THRESHOLD,
): boolean => debt > threshold;

// 放置時間を deltaMs 進める。閾値以下なら 0 に戻す。閾値超過が grace 以上続いたら大障害を1回起こして 0 に戻す。
// grace を超えた分は持ち越さない（1フレームの deltaMs が grace の何倍でも大障害は1回）。
export const advanceTechDebtNeglect = (
  neglectMs: number,
  debt: number,
  deltaMs: number,
  {
    threshold = TECH_DEBT_OUTAGE_THRESHOLD,
    graceMs = TECH_DEBT_OUTAGE_GRACE_MS,
  }: {
    readonly threshold?: number;
    readonly graceMs?: number;
  } = {},
): TechDebtNeglectResult => {
  if (!isTechDebtOverOutageThreshold(debt, threshold)) {
    return { neglectMs: 0, outage: false, neglectedMs: 0 };
  }
  const neglectedMs = sanitizeMs(neglectMs) + sanitizeMs(deltaMs);
  if (neglectedMs >= graceMs) {
    return { neglectMs: 0, outage: true, neglectedMs };
  }
  return { neglectMs: neglectedMs, outage: false, neglectedMs };
};

// 大障害を精算する。ゲームオーバー後は null。損害ぶん資金を引く（マイナスもそのまま）。
// 倒産判定は呼び出し側（changeFunds → checkBankruptcy）が行う。
export const settleMajorOutage = (
  funds: number,
  techDebt: number,
  neglectedMs: number,
  gameOver: GameOverState,
  damage: number = TECH_DEBT_OUTAGE_DAMAGE,
): MajorOutageEvent | null => {
  if (gameOver.over) {
    return null;
  }
  const amount = sanitizeDamage(damage);
  return {
    techDebt,
    neglectedMs,
    damage: amount,
    fundsBefore: funds,
    fundsAfter: subtractFunds(funds, amount),
  };
};
