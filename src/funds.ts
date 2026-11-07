import { HUD_ICONS } from './config';
import { formatYen, getMessages, interpolate } from './i18n';

// 資金の状態。Phaser に依存しない純粋関数だけを置く。
// 資金は整数の数値。マイナス残高は許可する（倒産判定はここではしない: #21）。

// 資金が変化したときに scene.events で発行するイベント名。
export const FUNDS_CHANGED_EVENT = 'funds-changed';

// 資金が変化した理由。給料、売上、正常なコードを攻撃した減点、障害による損害、アイテムの購入費、月額アイテムの費用、
// AIエージェント(#53)の購入費、
// ロールバックボタン(#58)による直前の障害の損害の返金（売上ではないのでスコアには入らない）。
// エンジニアを雇うときの費用はない(#179)ので、雇用は資金を変えず、理由にもない。
export type FundsChangeReason =
  | 'salary'
  | 'sales'
  | 'penalty'
  | 'damage'
  | 'item'
  | 'itemFee'
  | 'aiAgent'
  | 'rollback';

export type FundsChangedEvent = {
  readonly previous: number;
  readonly current: number;
  readonly delta: number;
  readonly reason: FundsChangeReason;
};

// 負・NaN・Infinity の amount は 0 として扱う（変化なし）。
const sanitizeAmount = (amount: number): number =>
  Number.isFinite(amount) && amount > 0 ? amount : 0;

// 資金を増やす。#17（売上で加算）がこれを使う想定。
export const addFunds = (funds: number, amount: number): number => funds + sanitizeAmount(amount);

// 資金を減らす。結果がマイナスになってもそのまま返す。#18（損害で減算）がこれを使う想定。
export const subtractFunds = (funds: number, amount: number): number =>
  funds - sanitizeAmount(amount);

export const createFundsChangedEvent = (
  previous: number,
  current: number,
  reason: FundsChangeReason,
): FundsChangedEvent => ({ previous, current, delta: current - previous, reason });

// 3桁区切りで整形する。マイナスは「💰-300,000円」（英語は「💰-¥300,000」#158, #165）の形。
export const formatFunds = (funds: number): string =>
  interpolate(getMessages().hud.funds, { icon: HUD_ICONS.funds, amount: formatYen(funds) });
