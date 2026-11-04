import {
  AI_AGENT_NONE_LABEL,
  AI_AGENT_SHORT_NAMES,
  ENGINEER_FATIGUE_RATE_MULTIPLIERS,
  ENGINEER_INITIAL_PARAMETERS,
  ENGINEER_MONTHLY_SALARY_BY_RANK,
  ENGINEER_PARAMETER_FALLBACK,
  ENGINEER_PARAMETER_MAX,
  ENGINEER_PARAMETER_MIN,
  ENGINEER_PERSONALITIES,
  ENGINEER_PERSONALITY_TENDENCIES,
  ENGINEER_PERSONALITY_WEIGHTS,
  ENGINEER_RANKS,
  ENGINEER_SALARY_MAX,
  ENGINEER_SALARY_MIN,
  ENGINEER_SALARY_STEP,
  ENGINEER_SPAWN_CELLS,
  ENGINEER_TENDENCY_OFFSETS,
  FUNDS_FORMAT,
  INITIAL_ENGINEER_RANKS,
  VACATION_MALICIOUS_RATE_REDUCTION,
  VACATION_MALICIOUS_RATE_REDUCTION_MAX,
} from './config';
import type { EngineerTendency } from './config';
import type { AiAgentType } from './aiAgent';
import { createRoutes } from './route';
import type { Route } from './route';

// エンジニア（雇用）の純粋ロジック。Phaser に依存しない。
// 給料(#33)は Engineer の salary フィールドに個人ごとに持たせる。初期額はランク表（ENGINEER_MONTHLY_SALARY_BY_RANK）で決まる。昇給・減給(#34)は adjustEngineerSalary。
// ランクごとの不正コード率(#12)はランク表の maliciousRate / maliciousRateMax 列で持ち、difficulty.ts の maliciousRateForRank で求める。
// 性格(#26)は Engineer の personality フィールドに持たせる（ランクとは独立）。性格ごとのパラメータの差(#29)は ENGINEER_PERSONALITY_TENDENCIES（傾向表）で持つ。

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
  // 雇ったときにランダムで付く性格(#26)。id/rank/routeId/パラメータとは独立。初期パラメータ(#29)と疲労の溜まりやすさの係数に使う。
  readonly personality: EngineerPersonalityId;
  // 休暇中か(#35)。数値パラメータではないので EngineerParameters には入れない（clamp の対象外）。
  // 仮・要確認(#35): 開始も終了もプレイヤーの操作だけで切り替える（期間・自動復帰・回数制限なし）。変えるのは setEngineerVacation / toggleEngineerVacation だけ。
  // 不正コード率への効果(#39)は vacationRateReduction に、休暇を始めたときに累積する（復帰後も維持する）。
  // 休暇中のコード停止(#36)・給料(#37)はそれぞれの issue で実装する。
  readonly onVacation: boolean;
  // 休暇による不正コード率の低下量（0 以上のパーセントポイント。0.1 で -10 ポイント）(#39)。雇ったとき・初期編成のときは 0。
  // 仮・要確認(#39): 休暇を始める（onVacation が false→true）たびに VACATION_MALICIOUS_RATE_REDUCTION を加え、
  // VACATION_MALICIOUS_RATE_REDUCTION_MAX で止める。休暇中・復帰後も維持する。変えるのは setEngineerVacation だけ。
  // 率への反映は difficulty.ts の vacationMaliciousRateModifiers → effectiveMaliciousRate。
  readonly vacationRateReduction: number;
  // 月給（円）(#33)。雇ったとき・初期編成のときにランクの初期額(getInitialSalary)が入る。ゲーム内1か月ごとにこの額を引く。
  // パラメータ（疲労度・集中力・技術力・愛着心）とは別。昇給・減給(#34)は adjustEngineerSalary でこの値を置き換える。
  readonly salary: number;
  // 月給の初期額（円）(#31)。雇ったとき・初期編成のときに salary と同じ額（getInitialSalary）が入り、その後は変えない。
  // 昇給・減給(#34)は salary だけを置き換える。愛着心への影響（salaryAttachment.ts）は salary とこの値の差額で決める。
  readonly initialSalary: number;
  // 付けている AIコーディングエージェントの種類(#53)。付けていなければ null。雇ったとき・初期編成のときは null。
  // 1人1個。変えるのは aiAgent.ts の equipAiAgent だけ（付け替えは上書き）。効果は aiAgent.ts の aiAgentSpawnIntervalMs / aiAgentMaliciousRateModifiers。
  readonly aiAgent: AiAgentType | null;
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

// テストで境界を作るための差し替え用。省略した項目は config の値。
export type PersonalityTendencyTables = {
  readonly tendencies?: Readonly<Record<EngineerPersonalityId, Record<EngineerParameterKey, EngineerTendency>>>;
  readonly offsets?: Readonly<Record<EngineerTendency, number>>;
};

export type EngineerParameterTables = PersonalityTendencyTables & {
  readonly initial?: Readonly<Record<EngineerRank, EngineerParameters>>;
};

// 仮・要確認(#29): 基準値に性格の補正を足して [MIN, MAX] に収めた、4キーだけの新しいオブジェクトを返す。入力は変更しない。
// 補正を受けるのは集中力・技術力・愛着心。疲労度は基準値のまま（clamp のみ）。
// 補正値が不正（NaN・±Infinity）なら 0（補正なし）。小数は丸めない。throw しない。
export const applyPersonalityTendencies = (
  base: EngineerParameters,
  personality: EngineerPersonalityId,
  tables: PersonalityTendencyTables = {},
): EngineerParameters => {
  const tendencies = (tables.tendencies ?? ENGINEER_PERSONALITY_TENDENCIES)[personality];
  const offsets = tables.offsets ?? ENGINEER_TENDENCY_OFFSETS;
  const adjust = (key: Exclude<EngineerParameterKey, 'fatigue'>): number => {
    const offset = offsets[tendencies[key]];
    return clampEngineerParameter(base[key] + (Number.isFinite(offset) ? offset : 0), base[key]);
  };
  return {
    fatigue: clampEngineerParameter(base.fatigue, base.fatigue),
    concentration: adjust('concentration'),
    skill: adjust('skill'),
    attachment: adjust('attachment'),
  };
};

// ランクに応じた初期パラメータ。呼ぶたびに新しいオブジェクトを返す（エンジニア間で参照を共有しない）。
// personality を省略したらランクの初期値のまま。渡したら「ランクの初期値 + 性格の補正」(applyPersonalityTendencies)。
export const createEngineerParameters = (
  rank: EngineerRank,
  personality?: EngineerPersonalityId,
  tables: EngineerParameterTables = {},
): EngineerParameters => {
  const base = (tables.initial ?? ENGINEER_INITIAL_PARAMETERS)[rank];
  if (personality === undefined) {
    return { ...base };
  }
  return applyPersonalityTendencies(base, personality, tables);
};

// 仮・要確認(#29): 性格の「疲労の溜まりやすさ」の係数。疲労が溜まるとき(#30)に
// adjustEngineerParameter(e, 'fatigue', 量 * getFatigueRateMultiplier(e.personality)) のように使う。
// 不正な係数（NaN・負・±Infinity）は 1（普通）。0 は有効（溜まらない）。throw しない。
export const getFatigueRateMultiplier = (
  personality: EngineerPersonalityId,
  multipliers: Readonly<Record<EngineerTendency, number>> = ENGINEER_FATIGUE_RATE_MULTIPLIERS,
): number => {
  const multiplier = multipliers[ENGINEER_PERSONALITY_TENDENCIES[personality].fatigue];
  return Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : 1;
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

// 初期エンジニア。性格はランダム（random を注入できる）。パラメータは性格の補正つき(#29)。routes と ranks を同じ順序で対応させる（短い方に合わせる）。id は 0 からの連番。
export const createInitialEngineers = (
  routes: readonly Route[],
  ranks: readonly EngineerRank[],
  random: () => number = Math.random,
): Engineer[] =>
  routes.slice(0, ranks.length).map((route, index) => {
    const personality = pickRandomPersonality(random);
    return {
      id: index,
      rank: ranks[index],
      routeId: route.id,
      personality,
      onVacation: false,
      vacationRateReduction: 0,
      salary: getInitialSalary(ranks[index]),
      initialSalary: getInitialSalary(ranks[index]),
      aiAgent: null,
      ...createEngineerParameters(ranks[index], personality),
    };
  });

// 対象のエンジニアだけ routeId を差し替えた新しい配列を返す。他のエンジニアは同じ参照のまま。入力は変更しない。
// 該当 id がなければ同じ内容の配列。
export const assignEngineerRoute = (
  engineers: readonly Engineer[],
  engineerId: number,
  routeId: number | null,
): Engineer[] =>
  engineers.map((engineer) => (engineer.id === engineerId ? { ...engineer, routeId } : engineer));

// 休暇を始めたときの低下量(#39)。現在値に VACATION_MALICIOUS_RATE_REDUCTION を加え、VACATION_MALICIOUS_RATE_REDUCTION_MAX で止める。
// 現在値が有限でない・負なら 0 として扱ってから加える。
const addVacationRateReduction = (current: number): number =>
  Math.min(
    (Number.isFinite(current) && current > 0 ? current : 0) + VACATION_MALICIOUS_RATE_REDUCTION,
    VACATION_MALICIOUS_RATE_REDUCTION_MAX,
  );

// 対象のエンジニアだけ休暇状態を onVacation にした新しい配列を返す(#35)。他のエンジニアは同じ参照のまま。入力は変更しない。
// routeId・性格・パラメータは変えない（資金・スコアにも触れない）。該当 id がなければ同じ内容の配列。
// 休暇を始める（休暇中でない → 休暇）ときだけ、不正コード率の低下量(vacationRateReduction)を加える(#39)。それ以外の切り替えでは変えない。
export const setEngineerVacation = (
  engineers: readonly Engineer[],
  engineerId: number,
  onVacation: boolean,
): Engineer[] =>
  engineers.map((engineer) => {
    if (engineer.id !== engineerId) {
      return engineer;
    }
    const starting = !engineer.onVacation && onVacation;
    return {
      ...engineer,
      onVacation,
      vacationRateReduction: starting
        ? addVacationRateReduction(engineer.vacationRateReduction)
        : engineer.vacationRateReduction,
    };
  });

// 対象のエンジニアの休暇を切り替える（休暇中なら終了、そうでなければ開始）。該当 id がなければ同じ内容の配列。入力は変更しない。
export const toggleEngineerVacation = (engineers: readonly Engineer[], engineerId: number): Engineer[] => {
  const target = engineers.find((engineer) => engineer.id === engineerId);
  if (target === undefined) {
    return [...engineers];
  }
  return setEngineerVacation(engineers, engineerId, !isEngineerOnVacation(target));
};

// 休暇中か。#36（休暇中はコードを止める）などの後続でも使う。
export const isEngineerOnVacation = (engineer: Engineer): boolean => engineer.onVacation;

// そのルートを担当するエンジニア。いなければ undefined。退職(#32)・休暇(#36)でルートを外す・止めるときに使う。
export const findEngineerByRoute = (
  engineers: readonly Engineer[],
  routeId: number,
): Engineer | undefined => engineers.find((engineer) => engineer.routeId === routeId);

// 担当者が休暇中か(#36)。担当者がいない（undefined）なら false。検索済みの担当者を使い回すときに使う。
export const isAssigneeOnVacation = (engineer: Engineer | undefined): boolean =>
  engineer !== undefined && isEngineerOnVacation(engineer);

// そのルートの担当者が休暇中か(#36)。担当者がいないルートは止めないので false。新しい状態は持たず、onVacation から求める。
export const isRouteOnVacation = (engineers: readonly Engineer[], routeId: number): boolean =>
  isAssigneeOnVacation(findEngineerByRoute(engineers, routeId));

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
  const personality = pickRandomPersonality(random);
  const engineer: Engineer = {
    id: state.nextId,
    rank,
    routeId: null,
    personality,
    onVacation: false,
    vacationRateReduction: 0,
    salary: getInitialSalary(rank),
    initialSalary: getInitialSalary(rank),
    aiAgent: null,
    ...createEngineerParameters(rank, personality),
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

// ランクで決まる月給の初期額（円）(#33)。雇ったとき・初期編成のときに Engineer.salary に入れる。雇用費(ENGINEER_HIRE_COST)とは別。
export const getInitialSalary = (rank: EngineerRank): number => ENGINEER_MONTHLY_SALARY_BY_RANK[rank];

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

// 仮・要確認(#34): 昇給・減給。企画書(6)は「プレイヤーはいつでも昇給・減給できる」とだけで、刻み・範囲・反映時期は未記載。
// 変えた額はすぐ Engineer.salary に入り、次の月次精算（getEngineerSalaries）から支払う。手数料はかけない。愛着心への影響は #31 で扱う。
export type SalaryDirection = 'raise' | 'cut';

export type SalaryAdjustFailureReason = 'not-found' | 'invalid-salary' | 'at-max' | 'at-min';

export type SalaryAdjustResult =
  | {
      readonly ok: true;
      readonly direction: SalaryDirection;
      readonly engineer: Engineer;
      readonly engineers: readonly Engineer[];
      readonly salaryBefore: number;
      readonly salaryAfter: number;
    }
  | {
      readonly ok: false;
      readonly direction: SalaryDirection;
      readonly engineerId: number | null;
      readonly reason: SalaryAdjustFailureReason;
    };

// 対象のエンジニアの月給を「現在額 ± ENGINEER_SALARY_STEP」を [ENGINEER_SALARY_MIN, ENGINEER_SALARY_MAX] に収めた額にした結果を返す。
// engineerId が null（選択なし）または名簿にない id なら not-found。判定順は not-found → invalid-salary（現在額が NaN・±Infinity）→ at-max / at-min（その方向に額が動かない）。
// 成功時は対象だけ { ...engineer, salary } で置き換えた新しい配列（他のエンジニアは同じ参照）。失敗時は名簿を返さない。入力は変更しない。
export const adjustEngineerSalary = (
  engineers: readonly Engineer[],
  engineerId: number | null,
  direction: SalaryDirection,
): SalaryAdjustResult => {
  const target = engineers.find((engineer) => engineer.id === engineerId);
  if (target === undefined) {
    return { ok: false, direction, engineerId, reason: 'not-found' };
  }
  const salaryBefore = target.salary;
  if (!Number.isFinite(salaryBefore)) {
    return { ok: false, direction, engineerId, reason: 'invalid-salary' };
  }
  const delta = direction === 'raise' ? ENGINEER_SALARY_STEP : -ENGINEER_SALARY_STEP;
  const salaryAfter = Math.min(ENGINEER_SALARY_MAX, Math.max(ENGINEER_SALARY_MIN, salaryBefore + delta));
  if (direction === 'raise' && salaryAfter <= salaryBefore) {
    return { ok: false, direction, engineerId, reason: 'at-max' };
  }
  if (direction === 'cut' && salaryAfter >= salaryBefore) {
    return { ok: false, direction, engineerId, reason: 'at-min' };
  }
  const engineer: Engineer = { ...target, salary: salaryAfter };
  return {
    ok: true,
    direction,
    engineer,
    engineers: engineers.map((entry) => (entry.id === engineerId ? engineer : entry)),
    salaryBefore,
    salaryAfter,
  };
};

// 金額の表示（資金表示と同じ3桁区切り + 円）。
const formatYen = (amount: number): string => `${amount.toLocaleString('ja-JP')}${FUNDS_FORMAT.suffix}`;

export const formatSalaryMessage = (result: SalaryAdjustResult): string => {
  if (result.ok) {
    const action = result.direction === 'raise' ? '昇給' : '減給';
    return `#${result.engineer.id} ${action}: ${formatYen(result.salaryBefore)}→${formatYen(result.salaryAfter)}`;
  }
  if (result.reason === 'at-max') {
    return `これ以上昇給できません（上限 ${formatYen(ENGINEER_SALARY_MAX)}）`;
  }
  if (result.reason === 'at-min') {
    return `これ以上減給できません（下限 ${formatYen(ENGINEER_SALARY_MIN)}）`;
  }
  if (result.reason === 'invalid-salary') {
    return `#${result.engineerId} の月給が不正です`;
  }
  return '対象のエンジニアがいません';
};

export type EngineerSelectDirection = 'previous' | 'next';

// 仮・要確認(#34): 選択中のエンジニアの前・次の id（名簿の並び順で、端では反対側へ回る）。
// 名簿が空なら null。currentId が null または名簿にない（退職などでいなくなった）なら先頭の id。入力は変更しない。
export const selectAdjacentEngineerId = (
  engineers: readonly Engineer[],
  currentId: number | null,
  direction: EngineerSelectDirection,
): number | null => {
  if (engineers.length === 0) {
    return null;
  }
  const index = engineers.findIndex((engineer) => engineer.id === currentId);
  if (index === -1) {
    return engineers[0].id;
  }
  const offset = direction === 'next' ? 1 : -1;
  return engineers[(index + offset + engineers.length) % engineers.length].id;
};

// 選択中のエンジニアの情報行。「選択: #id ランク 月給 300,000円 AI: 強い」（AIエージェント(#53)を付けていなければ「AI: なし」）。
// 対象がいなければ「選択: 対象なし」。
export const formatSelectedEngineer = (engineer: Engineer | null): string =>
  engineer === null
    ? '選択: 対象なし'
    : `選択: #${engineer.id} ${getRankLabel(engineer.rank)} 月給 ${formatYen(engineer.salary)} AI: ${
        engineer.aiAgent === null ? AI_AGENT_NONE_LABEL : AI_AGENT_SHORT_NAMES[engineer.aiAgent]
      }`;

// 昇給・減給の操作ボタンのラベル。「[Q] 前へ」。
export const formatSalaryButton = (key: string, label: string): string => `[${key}] ${label}`;
