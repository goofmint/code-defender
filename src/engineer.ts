import {
  ENGINEER_INITIAL_PARAMETERS,
  ENGINEER_PARAMETER_FALLBACK,
  ENGINEER_PARAMETER_MAX,
  ENGINEER_PARAMETER_MIN,
  ENGINEER_PERSONALITIES,
  ENGINEER_PERSONALITY_WEIGHTS,
  ENGINEER_RANKS,
  ENGINEER_SPAWN_CELLS,
  INITIAL_ENGINEER_RANKS,
} from './config';
import { createRoutes } from './route';
import type { Route } from './route';

// エンジニア（雇用）の純粋ロジック。Phaser に依存しない。
// 給料の個人差(#33)・ランクごとの不正コード率(#12/#24)は、ランク表（ENGINEER_RANKS）に列を足して扱う想定。
// 性格(#26)は Engineer の personality フィールドに持たせる（ランクとは独立）。性格ごとのパラメータの差(#29)は、性格表（ENGINEER_PERSONALITIES）に列を足して扱う想定。

export type EngineerRank = (typeof ENGINEER_RANKS)[number]['id'];

export type EngineerPersonalityId = (typeof ENGINEER_PERSONALITIES)[number]['id'];

export { ENGINEER_RANKS };

// 雇ったときに scene.events で発行するイベント名。#27（出現場所とルートを増やす）などが購読する。
export const ENGINEER_HIRED_EVENT = 'engineer-hired';

// routeId: 担当ルート。雇った直後はまだルートがないので null。ENGINEER_HIRED_EVENT を受けてルートを追加したあと assignEngineerRoute で付ける。
// パラメータ(#28): 疲労度・集中力・技術力・愛着心。Engineer にフラットな readonly フィールドとして持たせる。
// 値は ENGINEER_PARAMETER_MIN〜MAX の小数。値を動かすのは updateEngineerParameters / adjustEngineerParameter だけを使う
// （#30 疲労・#31 集中力・#32 愛着心/退職・#39 技術力 など）。効果（不正コード率・出すペースなど）はそれぞれの issue で実装する。
export type EngineerParameters = {
  readonly fatigue: number;
  readonly concentration: number;
  readonly skill: number;
  readonly attachment: number;
};

export type EngineerParameterKey = keyof EngineerParameters;

export type Engineer = {
  readonly id: number;
  readonly rank: EngineerRank;
  readonly routeId: number | null;
  // 雇ったときにランダムで付く性格(#26)。id/rank/routeId/パラメータとは独立。今回はどこにも効かせない（#29 で使う）。
  readonly personality: EngineerPersonalityId;
} & EngineerParameters;

export type EngineerHiredPayload = {
  readonly engineer: Engineer;
  readonly cost: number;
};

export type HireFailureReason = 'unknownRank' | 'limit' | 'insufficientFunds';

export type HireResult =
  | {
      readonly ok: true;
      readonly engineer: Engineer;
      readonly engineers: readonly Engineer[];
      readonly fundsAfter: number;
      readonly cost: number;
    }
  | { readonly ok: false; readonly reason: HireFailureReason };

export type HireState = {
  readonly engineers: readonly Engineer[];
  readonly funds: number;
  readonly nextId: number;
};

export type HireRules = {
  readonly max: number;
  readonly costs: Readonly<Record<EngineerRank, number>>;
};

export const isEngineerRank = (value: string): value is EngineerRank =>
  ENGINEER_RANKS.some((rank) => rank.id === value);

const isUsableWeight = (weight: number): boolean => Number.isFinite(weight) && weight > 0;

// 累積の重みで target が [累積前, 累積後) に入る性格。重み 0 の性格は区間が空なので選ばれない。
const pickByTarget = (
  entries: readonly { readonly id: EngineerPersonalityId; readonly weight: number }[],
  target: number,
): EngineerPersonalityId | undefined => {
  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.weight;
    if (target < cumulative) {
      return entry.id;
    }
  }
  return undefined;
};

// 仮・要確認(#26): 重みに応じて性格を1つ選ぶ。random() は1回だけ呼ぶ。区間は [累積前, 累積後)（左閉右開）。
// random が NaN・負・-Infinity なら 0（先頭）、1 以上・+Infinity なら 1 未満の最大（重み>0 の最後の性格）として扱う。
// 重みが不正（負・NaN・Infinity）なら 0 扱い。重みの合計が 0 以下なら先頭の性格。throw しない。
export const pickRandomPersonality = (
  random: () => number,
  weights: Readonly<Record<EngineerPersonalityId, number>> = ENGINEER_PERSONALITY_WEIGHTS,
): EngineerPersonalityId => {
  const raw = random();
  const effective = ENGINEER_PERSONALITIES.map((entry) => ({
    id: entry.id,
    weight: isUsableWeight(weights[entry.id]) ? weights[entry.id] : 0,
  }));
  const total = effective.reduce((sum, entry) => sum + entry.weight, 0);
  const candidates = effective.filter((entry) => entry.weight > 0);
  if (!(total > 0) || candidates.length === 0) {
    return ENGINEER_PERSONALITIES[0].id;
  }
  const last = candidates[candidates.length - 1].id;
  if (raw >= 1) {
    return last;
  }
  const target = Number.isNaN(raw) || raw < 0 ? 0 : raw * total;
  return pickByTarget(effective, target) ?? last;
};

export const getPersonalityLabel = (personality: EngineerPersonalityId): string =>
  ENGINEER_PERSONALITIES.find((entry) => entry.id === personality)?.label ?? personality;

// ランクに応じた初期パラメータ。呼ぶたびに新しいオブジェクトを返す（エンジニア間で参照を共有しない）。
export const createEngineerParameters = (rank: EngineerRank): EngineerParameters => ({
  ...ENGINEER_INITIAL_PARAMETERS[rank],
});

const clampToRange = (value: number): number =>
  Math.min(ENGINEER_PARAMETER_MAX, Math.max(ENGINEER_PARAMETER_MIN, value));

// 値を [MIN, MAX] に収める。小数は丸めない。±Infinity は MAX/MIN。
// NaN は fallback（現在値など）を返す。NaN を MIN 扱いにすると、愛着心が最低→自主退職(#32)を誤って起こすため。
// fallback 自体が NaN のときは ENGINEER_PARAMETER_FALLBACK、範囲外のときは範囲内に収めた値。throw しない。
export const clampEngineerParameter = (value: number, fallback: number): number => {
  if (!Number.isNaN(value)) {
    return clampToRange(value);
  }
  return Number.isNaN(fallback) ? ENGINEER_PARAMETER_FALLBACK : clampToRange(fallback);
};

// 指定したキーだけ丸めて設定した新しい Engineer を返す。NaN のキーは現在値のまま。入力は変更しない。
export const updateEngineerParameters = (
  engineer: Engineer,
  patch: Partial<EngineerParameters>,
): Engineer => {
  const next: { -readonly [K in EngineerParameterKey]: number } = {
    fatigue: engineer.fatigue,
    concentration: engineer.concentration,
    skill: engineer.skill,
    attachment: engineer.attachment,
  };
  (Object.keys(next) as EngineerParameterKey[]).forEach((key) => {
    const value = patch[key];
    if (value !== undefined) {
      next[key] = clampEngineerParameter(value, engineer[key]);
    }
  });
  return { ...engineer, ...next };
};

// 現在値 + delta を丸めた新しい Engineer を返す。delta が NaN なら変化なし。入力は変更しない。
export const adjustEngineerParameter = (
  engineer: Engineer,
  key: EngineerParameterKey,
  delta: number,
): Engineer =>
  updateEngineerParameters(engineer, {
    [key]: Number.isNaN(delta) ? engineer[key] : engineer[key] + delta,
  });

// 初期エンジニア。性格はランダム（random を注入できる）。パラメータは性格で変えない（#29 で createEngineerParameters に性格を足せば効く）。routes と ranks を同じ順序で対応させる（短い方に合わせる）。id は 0 からの連番。
export const createInitialEngineers = (
  routes: readonly Route[],
  ranks: readonly EngineerRank[],
  random: () => number = Math.random,
): Engineer[] =>
  routes.slice(0, ranks.length).map((route, index) => ({
    id: index,
    rank: ranks[index],
    routeId: route.id,
    personality: pickRandomPersonality(random),
    ...createEngineerParameters(ranks[index]),
  }));

// 対象のエンジニアだけ routeId を差し替えた新しい配列を返す。他のエンジニアは同じ参照のまま。入力は変更しない。
// 該当 id がなければ同じ内容の配列。
export const assignEngineerRoute = (
  engineers: readonly Engineer[],
  engineerId: number,
  routeId: number | null,
): Engineer[] =>
  engineers.map((engineer) => (engineer.id === engineerId ? { ...engineer, routeId } : engineer));

// そのルートを担当するエンジニア。いなければ undefined。退職(#32)・休暇(#36)でルートを外す・止めるときに使う。
export const findEngineerByRoute = (
  engineers: readonly Engineer[],
  routeId: number,
): Engineer | undefined => engineers.find((engineer) => engineer.routeId === routeId);

// そのエンジニアの担当ルート id。エンジニアがいない、またはルートなしなら null。
export const findRouteIdOfEngineer = (
  engineers: readonly Engineer[],
  engineerId: number,
): number | null => engineers.find((engineer) => engineer.id === engineerId)?.routeId ?? null;

// 仮・要確認(#27): ゲームオーバー中に雇用イベントを受けたらルートを追加しない（雇ったエンジニア自体は人数に入る）。
export const shouldAddRouteOnHire = (gameOver: boolean): boolean => !gameOver;

// ゲーム開始・やり直しの初期状態。呼ぶたびに新しいルートとエンジニアを作る（前回の雇用状態は残らない）。
export const createInitialFleet = (
  random: () => number,
): { readonly routes: Route[]; readonly engineers: Engineer[]; readonly nextEngineerId: number } => {
  const routes = createRoutes(ENGINEER_SPAWN_CELLS, random);
  const engineers = createInitialEngineers(routes, INITIAL_ENGINEER_RANKS, random);
  return { routes, engineers, nextEngineerId: engineers.length };
};

// 費用が不正（負・NaN・Infinity）なら雇えない扱いにする。
const isValidCost = (cost: number): boolean => Number.isFinite(cost) && cost >= 0;

// 雇えるか判定して結果を返す。判定順は unknownRank → limit → insufficientFunds。入力は変更しない。
export const hireEngineer = (
  state: HireState,
  rank: string,
  rules: HireRules,
  random: () => number = Math.random,
): HireResult => {
  if (!isEngineerRank(rank)) {
    return { ok: false, reason: 'unknownRank' };
  }
  if (state.engineers.length >= rules.max) {
    return { ok: false, reason: 'limit' };
  }
  const cost = rules.costs[rank];
  if (!isValidCost(cost) || !(state.funds >= cost)) {
    return { ok: false, reason: 'insufficientFunds' };
  }
  const engineer: Engineer = {
    id: state.nextId,
    rank,
    routeId: null,
    personality: pickRandomPersonality(random),
    ...createEngineerParameters(rank),
  };
  return {
    ok: true,
    engineer,
    engineers: [...state.engineers, engineer],
    fundsAfter: state.funds - cost,
    cost,
  };
};

export const getRankLabel = (rank: EngineerRank): string =>
  ENGINEER_RANKS.find((entry) => entry.id === rank)?.label ?? rank;

export const formatEngineerCount = (count: number, max: number): string =>
  `エンジニア: ${count}/${max}`;

export const formatHireButton = (index: number, rank: EngineerRank, cost: number): string =>
  `[${index + 1}] ${getRankLabel(rank)} ${cost / 10000}万円`;

export const formatHireMessage = (
  result: HireResult,
  rank: string,
): string => {
  if (result.ok) {
    return `${getRankLabel(result.engineer.rank)}を雇いました`;
  }
  if (result.reason === 'limit') {
    return 'これ以上雇えません';
  }
  if (result.reason === 'insufficientFunds') {
    return '資金が足りません';
  }
  return `不明なランクです: ${rank}`;
};
