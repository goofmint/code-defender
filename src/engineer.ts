import { ENGINEER_RANKS } from './config';
import type { Route } from './route';

// エンジニア（雇用）の純粋ロジック。Phaser に依存しない。
// ランクごとの給料(#25/#33)・不正コード率(#12/#24)・性格(#26)は、ランク表（ENGINEER_RANKS）に列を足して扱う想定。

export type EngineerRank = (typeof ENGINEER_RANKS)[number]['id'];

export { ENGINEER_RANKS };

// 雇ったときに scene.events で発行するイベント名。#27（出現場所とルートを増やす）などが購読する。
export const ENGINEER_HIRED_EVENT = 'engineer-hired';

// routeId: 担当ルート。雇った直後はまだルートがないので null（#27 で付ける）。
export type Engineer = {
  readonly id: number;
  readonly rank: EngineerRank;
  readonly routeId: number | null;
};

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

// 初期エンジニア。routes と ranks を同じ順序で対応させる（短い方に合わせる）。id は 0 からの連番。
export const createInitialEngineers = (
  routes: readonly Route[],
  ranks: readonly EngineerRank[],
): Engineer[] =>
  routes.slice(0, ranks.length).map((route, index) => ({
    id: index,
    rank: ranks[index],
    routeId: route.id,
  }));

// 費用が不正（負・NaN・Infinity）なら雇えない扱いにする。
const isValidCost = (cost: number): boolean => Number.isFinite(cost) && cost >= 0;

// 雇えるか判定して結果を返す。判定順は unknownRank → limit → insufficientFunds。入力は変更しない。
export const hireEngineer = (
  state: HireState,
  rank: string,
  rules: HireRules,
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
  const engineer: Engineer = { id: state.nextId, rank, routeId: null };
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
