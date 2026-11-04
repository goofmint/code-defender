import {
  DEFAULT_REFACTORING_RATIO,
  TECH_DEBT_FORMAT,
  TECH_DEBT_MAX,
  TECH_DEBT_PER_FEATURE_WORK,
  TECH_DEBT_REPAY_PER_REFACTORING_WORK,
} from './config';

// 技術的負債の状態。Phaser に依存しない純粋関数だけを置く（funds.ts と同じ構成）。
// 負債は 0〜上限の数値。資金や借入ではない（資金には影響しない）。
// 負債の影響（開発スピード低下・不具合率の増加・大障害）は後続タスクが TECH_DEBT_CHANGED_EVENT を購読して実装する。

// 技術的負債が変化したときに scene.events で発行するイベント名。
export const TECH_DEBT_CHANGED_EVENT = 'tech-debt-changed';

// 技術的負債が変化した理由。機能開発で溜まる、リファクタリングで返す、作業1単位の精算（両方の正味）。
// 後続タスク（ピザなど負債を返すアイテム）はここに理由を追加する。
export type TechDebtChangeReason = 'feature' | 'refactoring' | 'work';

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

export const createTechDebtChangedEvent = (
  previous: number,
  current: number,
  reason: TechDebtChangeReason,
): TechDebtChangedEvent => ({ previous, current, delta: current - previous, reason });

// 四捨五入した整数で表示する。「技術的負債: 40」の形。
export const formatTechDebt = (debt: number): string =>
  `${TECH_DEBT_FORMAT.prefix}${Math.round(debt)}${TECH_DEBT_FORMAT.suffix}`;
