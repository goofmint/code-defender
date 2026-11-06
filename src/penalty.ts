import { canAttack, findAttackTarget } from './attack';
import type { AttackTarget } from './attack';
import type { CodeKind } from './code';
import { NORMAL_CODE_PENALTY } from './config';
import { subtractFunds } from './funds';
import { formatYen, getMessages, interpolate } from './i18n';
import type { Point } from './route';

// 正常なコードを攻撃したときの減点。Phaser に依存しない純粋関数だけを置く。
// 計算は純粋関数、状態更新とイベント発行はシーン側（salary.ts と同じ構成）。

// 減点したときに scene.events で発行するイベント名。
export const NORMAL_CODE_PENALIZED_EVENT = 'normal-code-penalized';

export type NormalCodePenalizedPayload = {
  readonly id: number;
  readonly routeId: number;
  readonly amount: number;
};

export type NormalCodePenaltyResult = {
  readonly applied: boolean;
  readonly fundsAfter: number;
  // 実際に引いた額。減点しないときは 0。
  readonly amount: number;
};

// 負・NaN・Infinity の減点額は 0 として扱う（funds.ts の sanitizeAmount と同じ方針）。
const sanitizePenalty = (penalty: number): number =>
  Number.isFinite(penalty) && penalty > 0 ? penalty : 0;

// 命中したコードの減点を計算する。不正なコード・ゲームオーバー後・減点額 0 は減点しない。
// 結果がマイナスでもそのまま返す（倒産判定は changeFunds 経由の #21 に任せる）。
export const resolveNormalCodePenalty = ({
  kind,
  funds,
  gameOver,
  penalty = NORMAL_CODE_PENALTY,
}: {
  readonly kind: CodeKind;
  readonly funds: number;
  readonly gameOver: boolean;
  readonly penalty?: number;
}): NormalCodePenaltyResult => {
  const amount = sanitizePenalty(penalty);
  if (kind !== 'normal' || gameOver || amount === 0) {
    return { applied: false, fundsAfter: funds, amount: 0 };
  }
  return { applied: true, fundsAfter: subtractFunds(funds, amount), amount };
};

export type AttackPenaltyResult<T extends AttackTarget> = {
  // 攻撃が実行されたか（クールダウン中・ゲームオーバー後は false）。
  readonly attacked: boolean;
  readonly lastAttackTime: number | null;
  readonly hit: T | null;
  readonly penalty: NormalCodePenaltyResult;
};

// 攻撃可否 → 命中 → 減点の流れを1つにまとめた検証用ヘルパー。シーンの tryAttack / onCodeHit と同じ順序。
export const resolveAttackPenalty = <T extends AttackTarget>({
  now,
  lastAttackTime,
  cooldownMs,
  playerPosition,
  targets,
  range,
  funds,
  gameOver,
  penalty,
}: {
  readonly now: number;
  readonly lastAttackTime: number | null;
  readonly cooldownMs: number;
  readonly playerPosition: Point;
  readonly targets: readonly T[];
  readonly range: number;
  readonly funds: number;
  readonly gameOver: boolean;
  readonly penalty?: number;
}): AttackPenaltyResult<T> => {
  const none: NormalCodePenaltyResult = { applied: false, fundsAfter: funds, amount: 0 };
  if (gameOver || !canAttack(now, lastAttackTime, cooldownMs)) {
    return { attacked: false, lastAttackTime, hit: null, penalty: none };
  }
  const hit = findAttackTarget(playerPosition, targets, range);
  if (!hit) {
    return { attacked: true, lastAttackTime: now, hit: null, penalty: none };
  }
  return {
    attacked: true,
    lastAttackTime: now,
    hit,
    penalty: resolveNormalCodePenalty({ kind: hit.kind, funds, gameOver, penalty }),
  };
};

// 「-50,000円」（英語は「-¥50,000」）の形(#158)。amount は引いた額（正の値）。
export const formatPenalty = (amount: number): string =>
  interpolate(getMessages().penalty.amount, { amount: formatYen(amount) });
