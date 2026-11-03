import { ENGINEER_RANKS, ENGINEER_SPAWN_CELLS, INITIAL_ENGINEER_RANKS } from './config';
import { createRoutes } from './route';
import type { Route } from './route';

// エンジニア（雇用）の純粋ロジック。Phaser に依存しない。
// ランクごとの給料(#25/#33)・不正コード率(#12/#24)・性格(#26)は、ランク表（ENGINEER_RANKS）に列を足して扱う想定。

export type EngineerRank = (typeof ENGINEER_RANKS)[number]['id'];

export { ENGINEER_RANKS };

// 雇ったときに scene.events で発行するイベント名。#27（出現場所とルートを増やす）などが購読する。
export const ENGINEER_HIRED_EVENT = 'engineer-hired';

// routeId: 担当ルート。雇った直後はまだルートがないので null。ENGINEER_HIRED_EVENT を受けてルートを追加したあと assignEngineerRoute で付ける。
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
  const engineers = createInitialEngineers(routes, INITIAL_ENGINEER_RANKS);
  return { routes, engineers, nextEngineerId: engineers.length };
};

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
