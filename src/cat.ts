// 猫(#57): 場にあるコードを一定間隔ごとにランダムに1つ消す。Phaser には依存しない（テスト可能にするため）。
// 正常なコードも不正なコードも区別せず、HP も見ずに消す。売上・技術的負債・インシデント・罰金は発生させない。
import type { CodeKind } from './code';
import type { MaliciousCodeType } from './maliciousCode';

// 猫がコードを消したときに scene.events で発行するイベント名。撃破(CODE_DEFEATED_EVENT)・リリース(CODE_RELEASED_EVENT)とは別。
export const CODE_DELETED_BY_CAT_EVENT = 'code-deleted-by-cat';

export type CodeDeletedByCatPayload = {
  readonly id: number;
  readonly kind: CodeKind;
  readonly routeId: number;
  readonly maliciousType?: MaliciousCodeType;
};

// 消すコードを一様乱数で1つ選ぶ。空配列なら null。乱数は1回だけ呼ぶ。
// random() が 1 以上を返しても末尾を超えないよう、添字は count - 1 で止める。入力は変更しない。
export const pickRandomCode = <T>(random: () => number, codes: readonly T[]): T | null => {
  const count = codes.length;
  if (count === 0) return null;
  return codes[Math.min(count - 1, Math.floor(random() * count))];
};
