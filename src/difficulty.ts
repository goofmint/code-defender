import {
  CODE_MALICIOUS_RATE,
  CODE_MALICIOUS_RATE_INCREMENT,
  CODE_MALICIOUS_RATE_MAX,
  CODE_SPEED,
  CODE_SPEED_INCREMENT,
  CODE_SPEED_MAX,
  DIFFICULTY_STEP_MS,
  ENGINEER_RANKS,
} from './config';
import type { EngineerRank } from './engineer';

// 難易度（時間とともにコードの流れが速くなり、不正なコードも増える）。Phaser に依存しない純粋関数だけを置く。
// 開始値・増加量・上限・間隔は末尾の省略可能引数で、既定値は config.ts。後続(#12/#13)で差し替えやすくする。

// 負値・NaN・Infinity は 0 として扱う（gameTime.ts と同じ規則）。
const sanitize = (ms: number): number => (Number.isFinite(ms) && ms > 0 ? ms : 0);

// 難易度の段階（0始まり）。経過時間を間隔で区切って切り捨てる。
const stepAt = (elapsedMs: number, stepMs: number): number => Math.floor(sanitize(elapsedMs) / stepMs);

// 経過時間でのコードの移動速度（ピクセル/秒）。上限で止まる。
export const codeSpeedAt = (
  elapsedMs: number,
  startSpeed: number = CODE_SPEED,
  increment: number = CODE_SPEED_INCREMENT,
  maxSpeed: number = CODE_SPEED_MAX,
  stepMs: number = DIFFICULTY_STEP_MS,
): number => Math.min(startSpeed + stepAt(elapsedMs, stepMs) * increment, maxSpeed);

// 経過時間での不正コードの割合（0〜1）。上限で止まる。
export const maliciousRateAt = (
  elapsedMs: number,
  startRate: number = CODE_MALICIOUS_RATE,
  increment: number = CODE_MALICIOUS_RATE_INCREMENT,
  maxRate: number = CODE_MALICIOUS_RATE_MAX,
  stepMs: number = DIFFICULTY_STEP_MS,
): number => Math.min(Math.max(Math.min(startRate + stepAt(elapsedMs, stepMs) * increment, maxRate), 0), 1);

// 担当エンジニアのランクに応じた、経過時間での不正コードの割合（0〜1）(#12)。
// 開始値・上限はランク表（ENGINEER_RANKS）の maliciousRate / maliciousRateMax。増加量・間隔は maliciousRateAt の既定値と同じ。
// 担当エンジニアがいないルート（rank が undefined）は、maliciousRateAt の既定値（CODE_MALICIOUS_RATE〜CODE_MALICIOUS_RATE_MAX）を使う。
// 時間の基準はゲーム全体の経過時間。上限・[0,1] への収め方・不正な経過時間の扱いは maliciousRateAt に任せる。
export const maliciousRateForRank = (rank: EngineerRank | undefined, elapsedMs: number): number => {
  if (rank === undefined) return maliciousRateAt(elapsedMs);
  const entry = ENGINEER_RANKS.find((candidate) => candidate.id === rank);
  if (entry === undefined) throw new Error(`ランク表に存在しないランクです: ${rank}`);
  return maliciousRateAt(
    elapsedMs,
    entry.maliciousRate,
    CODE_MALICIOUS_RATE_INCREMENT,
    entry.maliciousRateMax,
    DIFFICULTY_STEP_MS,
  );
};
