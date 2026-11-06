import {
  DEFAULT_REFACTORING_RATIO,
  REFACTORING_MALICIOUS_RATE_REDUCTION_MAX,
  TECH_DEBT_LEVELS,
  TECH_DEBT_MALICIOUS_RATE_MAX_BONUS,
  TECH_DEBT_MAX,
  TECH_DEBT_PER_FEATURE_WORK,
  TECH_DEBT_REPAY_PER_REFACTORING_WORK,
  TECH_DEBT_SPAWN_INTERVAL_MAX_MULTIPLIER,
} from './config';
import { getMessages, interpolate } from './i18n';

// 技術的負債の状態。Phaser に依存しない純粋関数だけを置く（funds.ts と同じ構成）。
// 負債は 0〜上限の数値。資金や借入ではない（資金には影響しない）。
// 負債の影響のうち、開発スピード低下（コードの生成間隔が延びる、#44）は techDebtSpawnIntervalMs で実装済みだが、
// 設定（TECH_DEBT_SPAWN_INTERVAL_MAX_MULTIPLIER = 1、#150）で無効にしており、負債がいくつでも生成間隔は基準のまま（生産量は落とさない）。
// 倍率 1 で無効になるのは生成間隔の延長だけ。不具合率の増加(#45、techDebtMaliciousRateModifier。不正コード率の補正として生成時に合成する）と、
// 閾値超えの放置による大障害(#46、outage.ts)はそのまま残る。
// リファクタリングの割合による不正コード率の減少差分（#41）は refactoringMaliciousRateModifier で供給する（effectiveMaliciousRate の modifiers に渡す）。

// 技術的負債が変化したときに scene.events で発行するイベント名。
export const TECH_DEBT_CHANGED_EVENT = 'tech-debt-changed';

// 技術的負債が変化した理由。機能開発で溜まる、リファクタリングで返す、作業1単位の精算（両方の正味）、ピザ(#58)で溜まる。
export type TechDebtChangeReason = 'feature' | 'refactoring' | 'work' | 'pizza';

export type TechDebtChangedEvent = {
  readonly previous: number;
  readonly current: number;
  readonly delta: number;
  readonly reason: TechDebtChangeReason;
};

// 作業1単位の精算結果。accumulated / repaid は割合から計算した量（上限・0 で丸める前）。
export type WorkTechDebtResult = {
  readonly previous: number;
  readonly current: number;
  readonly accumulated: number;
  readonly repaid: number;
};

// 負・NaN・Infinity の amount は 0 として扱う（変化なし。funds.ts の sanitizeAmount と同じ方針）。
const sanitizeAmount = (amount: number): number =>
  Number.isFinite(amount) && amount > 0 ? amount : 0;

// 0〜max に丸める。NaN は 0、+Infinity は max、-Infinity は 0。
export const clampTechDebt = (value: number, max: number = TECH_DEBT_MAX): number => {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(max, Math.max(0, value));
};

// 負債を溜める。結果は上限で止める。
export const accumulateTechDebt = (debt: number, amount: number, max: number = TECH_DEBT_MAX): number =>
  clampTechDebt(debt + sanitizeAmount(amount), max);

// 負債を返す。結果は 0 未満にしない。
export const repayTechDebt = (debt: number, amount: number, max: number = TECH_DEBT_MAX): number =>
  clampTechDebt(debt - sanitizeAmount(amount), max);

// リファクタリングの割合を 0〜1 に丸める。NaN は既定の割合（DEFAULT_REFACTORING_RATIO）。
export const sanitizeRefactoringRatio = (
  ratio: number,
  defaultRatio: number = DEFAULT_REFACTORING_RATIO,
): number => {
  if (Number.isNaN(ratio)) {
    return defaultRatio;
  }
  return Math.min(1, Math.max(0, ratio));
};

// リファクタリングの割合による不正コード率の補正（#41）。effectiveMaliciousRate の modifiers に渡す差分（パーセントポイント）。
// 差分は −maxReduction × 割合。割合は sanitizeRefactoringRatio で 0〜1 に丸める（NaN は既定の割合）。
// 割合 0 なら 0（-0 を返さない）。下限 CODE_MALICIOUS_RATE_MIN への制限は effectiveMaliciousRate に任せる。
export const refactoringMaliciousRateModifier = (
  ratio: number,
  maxReduction: number = REFACTORING_MALICIOUS_RATE_REDUCTION_MAX,
): number => {
  const reduction = maxReduction * sanitizeRefactoringRatio(ratio);
  return reduction === 0 ? 0 : -reduction;
};

// 作業1単位（正常なコードのリリース1件）を精算する。割合 r のぶんリファクタリング、残り (1 − r) を機能開発に充てる。
// 溜まる量 (1 − r) × perFeatureWork と返す量 r × repayPerRefactoringWork の正味を足し、0〜max に丸める。
export const resolveWorkTechDebt = (
  debt: number,
  refactoringRatio: number,
  {
    perFeatureWork = TECH_DEBT_PER_FEATURE_WORK,
    repayPerRefactoringWork = TECH_DEBT_REPAY_PER_REFACTORING_WORK,
    max = TECH_DEBT_MAX,
  }: {
    readonly perFeatureWork?: number;
    readonly repayPerRefactoringWork?: number;
    readonly max?: number;
  } = {},
): WorkTechDebtResult => {
  const ratio = sanitizeRefactoringRatio(refactoringRatio);
  const accumulated = (1 - ratio) * sanitizeAmount(perFeatureWork);
  const repaid = ratio * sanitizeAmount(repayPerRefactoringWork);
  return {
    previous: debt,
    current: clampTechDebt(debt + accumulated - repaid, max),
    accumulated,
    repaid,
  };
};

// 技術的負債による不正コード率の補正(#45)。effectiveMaliciousRate の modifiers に渡すパーセントポイントの差分（0 以上）。
// 負債を 0〜max に丸め、負債 ÷ max × maxBonus で線形に変換する（負債 0 で 0、max で maxBonus）。負債の NaN・±Infinity は clampTechDebt に従う。
// max が 0 以下・有限でない場合と、maxBonus が負・NaN・±Infinity の場合は 0（sanitizeAmount と同じ扱い）。
// [CODE_MALICIOUS_RATE_MIN, 1] への制限は差分ごとには行わず、合計後に effectiveMaliciousRate に任せる。
export const techDebtMaliciousRateModifier = (
  debt: number,
  {
    max = TECH_DEBT_MAX,
    maxBonus = TECH_DEBT_MALICIOUS_RATE_MAX_BONUS,
  }: {
    readonly max?: number;
    readonly maxBonus?: number;
  } = {},
): number => {
  if (!Number.isFinite(max) || max <= 0) {
    return 0;
  }
  const bonus = sanitizeAmount(maxBonus);
  if (bonus === 0) {
    return 0;
  }
  return (clampTechDebt(debt, max) / max) * bonus;
};

// 負債から生成間隔の倍率を求める（#44）。1 + 負債 / max × (maxMultiplier − 1)。負債0で1、上限で maxMultiplier。
// maxMultiplier が NaN・±Infinity・1未満なら1として扱う（負債で開発が速くならないようにする）。
// max が0以下・非有限なら倍率1（負債の割合が定まらないため）。負債は clampTechDebt で 0〜max に丸める。
const techDebtSpawnIntervalMultiplier = (debt: number, maxMultiplier: number, max: number): number => {
  if (!Number.isFinite(max) || max <= 0) {
    return 1;
  }
  if (!Number.isFinite(maxMultiplier) || maxMultiplier < 1) {
    return 1;
  }
  return 1 + (clampTechDebt(debt, max) / max) * (maxMultiplier - 1);
};

// 負債に応じて延ばしたコードの生成間隔（ミリ秒）。開発スピードの低下（#44）。負債0なら基準の間隔のまま。
export const techDebtSpawnIntervalMs = (
  debt: number,
  baseIntervalMs: number,
  {
    maxMultiplier = TECH_DEBT_SPAWN_INTERVAL_MAX_MULTIPLIER,
    max = TECH_DEBT_MAX,
  }: {
    readonly maxMultiplier?: number;
    readonly max?: number;
  } = {},
): number => baseIntervalMs * techDebtSpawnIntervalMultiplier(debt, maxMultiplier, max);

export const createTechDebtChangedEvent = (
  previous: number,
  current: number,
  reason: TechDebtChangeReason,
): TechDebtChangedEvent => ({ previous, current, delta: current - previous, reason });

// 四捨五入した整数で表示する。「技術的負債: 40」（英語は「Tech debt: 40」#158）の形。
export const formatTechDebt = (debt: number): string => interpolate(getMessages().hud.techDebt, { debt: Math.round(debt) });

// 右下の指標(#156)に出す技術的負債の段階。normal（0〜30）・caution（31〜60）・critical（61〜100）。
export type TechDebtLevel = keyof typeof TECH_DEBT_LEVELS;

// 技術的負債の段階(#156)。formatTechDebt と同じく四捨五入した整数で判定し（30.4 は normal、30.5 は caution）、0〜max の外は端に寄せる。
// NaN は負債なしとみなして normal にする（clampTechDebt と同じ扱い）。
export const getTechDebtLevel = (value: number, max: number = TECH_DEBT_MAX): TechDebtLevel => {
  if (Number.isNaN(value)) return 'normal';
  const rounded = Math.min(max, Math.max(0, Math.round(value)));
  if (rounded <= TECH_DEBT_LEVELS.normal.max) return 'normal';
  if (rounded <= TECH_DEBT_LEVELS.caution.max) return 'caution';
  return 'critical';
};

// 右下の指標(#156)の段階の語。「負債 正常」（英語は「Debt OK」#158）。
export const formatTechDebtLevel = (level: TechDebtLevel): string => {
  const { techDebtLevel, techDebtLevels } = getMessages().hud;
  return interpolate(techDebtLevel, { level: techDebtLevels[level] });
};
