// 購入時に発動するアイテム(#58)の時限効果と、遅れて起きる障害の予約。Phaser には依存しない（テスト可能にするため）。
// 時刻はゲーム内の経過ミリ秒（MainScene.elapsedMs）。ゲームオーバーで止まり、リスタートで 0 に戻る。
// 状態の変更とイベントの発行は MainScene が行う。ここの関数は入力を変更せず、新しい配列を返す。
import {
  ENERGY_DRINK_BOOST_DURATION_MS,
  FRIDAY_DEPLOY_INCIDENT_PROBABILITY,
  ENERGY_DRINK_BOOST_SPEED_MULTIPLIER,
  ENERGY_DRINK_SLUMP_DURATION_MS,
  ENERGY_DRINK_SLUMP_SPEED_MULTIPLIER,
  PIZZA_SPAWN_INTERVAL_MULTIPLIER,
  WORKS_FINE_CODE_SPEED_MULTIPLIER,
} from './config';
import { addFunds } from './funds';

// 時限効果の種類。エナジードリンクは加速(energyBoost)の後に鈍化(energySlump)が続く。
export type TimedEffectKind = 'codeFreeze' | 'energyBoost' | 'energySlump' | 'pizza' | 'worksFine';

// 有効な時限効果。startMs 以上 endMs 未満の間だけ効く。
export type ActiveEffect = {
  readonly kind: TimedEffectKind;
  readonly startMs: number;
  readonly endMs: number;
};

// 効果を始める。同じ種類の効果があれば置き換える（効果量は足さず、残り時間を購入時点から数え直す）。
export const startEffect = (
  effects: readonly ActiveEffect[],
  kind: TimedEffectKind,
  startMs: number,
  durationMs: number,
): ActiveEffect[] => [
  ...effects.filter((effect) => effect.kind !== kind),
  { kind, startMs, endMs: startMs + durationMs },
];

// エナジードリンク: 加速期のすぐ後に鈍化期を続けて登録する。買い直すと両方を購入時点から数え直す。
export const startEnergyDrink = (
  effects: readonly ActiveEffect[],
  nowMs: number,
  boostMs: number = ENERGY_DRINK_BOOST_DURATION_MS,
  slumpMs: number = ENERGY_DRINK_SLUMP_DURATION_MS,
): ActiveEffect[] =>
  startEffect(startEffect(effects, 'energyBoost', nowMs, boostMs), 'energySlump', nowMs + boostMs, slumpMs);

// 期限切れ（nowMs が endMs 以上）の効果を除く。
export const expireEffects = (effects: readonly ActiveEffect[], nowMs: number): ActiveEffect[] =>
  effects.filter((effect) => nowMs < effect.endMs);

// その種類の効果が nowMs に効いているか。
export const isEffectActive = (
  effects: readonly ActiveEffect[],
  kind: TimedEffectKind,
  nowMs: number,
): boolean => effects.some((effect) => effect.kind === kind && effect.startMs <= nowMs && nowMs < effect.endMs);

// 全ルートの生成間隔に掛ける倍率。ピザの間は PIZZA_SPAWN_INTERVAL_MULTIPLIER（1未満でペースが上がる）。
export const spawnIntervalMultiplier = (effects: readonly ActiveEffect[], nowMs: number): number =>
  isEffectActive(effects, 'pizza', nowMs) ? PIZZA_SPAWN_INTERVAL_MULTIPLIER : 1;

// コードの移動距離に掛ける倍率。「動いてるからヨシ！」の間は WORKS_FINE_CODE_SPEED_MULTIPLIER。
export const codeMoveMultiplier = (effects: readonly ActiveEffect[], nowMs: number): number =>
  isEffectActive(effects, 'worksFine', nowMs) ? WORKS_FINE_CODE_SPEED_MULTIPLIER : 1;

// 主人公の移動速度に掛ける倍率。エナジードリンクの加速期は大きく、鈍化期は小さい。
export const playerSpeedMultiplier = (effects: readonly ActiveEffect[], nowMs: number): number => {
  if (isEffectActive(effects, 'energyBoost', nowMs)) return ENERGY_DRINK_BOOST_SPEED_MULTIPLIER;
  if (isEffectActive(effects, 'energySlump', nowMs)) return ENERGY_DRINK_SLUMP_SPEED_MULTIPLIER;
  return 1;
};

// 遅れて起きる障害（金曜日の夕方デプロイ #58）。atMs に達したら damage の損害を出す。
export type ScheduledIncident = {
  readonly atMs: number;
  readonly damage: number;
};

// 障害を予約する。入力は変更しない。
export const scheduleIncident = (
  scheduled: readonly ScheduledIncident[],
  atMs: number,
  damage: number,
): ScheduledIncident[] => [...scheduled, { atMs, damage }];

// nowMs までに時刻が来た予約(due)と、まだの予約(pending)に分ける（時刻ちょうども due）。どちらも元の並び順。
export const takeDueIncidents = (
  scheduled: readonly ScheduledIncident[],
  nowMs: number,
): { readonly due: ScheduledIncident[]; readonly pending: ScheduledIncident[] } => ({
  due: scheduled.filter((incident) => incident.atMs <= nowMs),
  pending: scheduled.filter((incident) => incident.atMs > nowMs),
});

// 金曜日の夕方デプロイ(#58)で週末に大障害が起きるか。random(0以上1未満) が確率未満なら起きる。
export const rollFridayDeployIncident = (
  random: () => number,
  probability: number = FRIDAY_DEPLOY_INCIDENT_PROBABILITY,
): boolean => random() < probability;

// 直前の障害の記録（ロールバックボタン #58）。damage は IncidentEvent の損害額。取り消したら rolledBack を true にする。
export type IncidentRecord = {
  readonly damage: number;
  readonly rolledBack: boolean;
};

// 障害が確定したときの記録。前の記録は置き換える（取り消せるのは直前の障害だけ）。
export const recordIncident = (damage: number): IncidentRecord => ({ damage, rolledBack: false });

// ロールバックできるか。記録があり、まだ取り消していなければできる。
export const canRollback = (record: IncidentRecord | null): boolean => record !== null && !record.rolledBack;

// 直前の障害の損害を返金する。取り消せない記録なら例外にする（購入の判定 noEligibleIncident で先に止める）。
export const rollbackIncident = (
  funds: number,
  record: IncidentRecord | null,
): { readonly fundsAfter: number; readonly record: IncidentRecord } => {
  if (record === null || record.rolledBack) throw new Error('取り消せる障害がありません');
  return { fundsAfter: addFunds(funds, record.damage), record: { ...record, rolledBack: true } };
};
