// 不正なコードを倒す判定。Phaser には依存しない（テスト可能にするため）。
import { ATTACK_DAMAGE, DEFAULT_MALICIOUS_CODE_HP } from './config';
import { MALICIOUS_CODE_TYPE_DEFINITIONS } from './maliciousCode';
import type { MaliciousCodeType } from './maliciousCode';

// 撃破時にシーンが発行するイベント名。CODE_RELEASED_EVENT と同じ形式。
export const CODE_DEFEATED_EVENT = 'code-defeated';

export type CodeDefeatedPayload = {
  readonly id: number;
  readonly routeId: number;
  // 種類が割り当て済みのときだけ入る（種類の割り当ては未実装）。
  readonly maliciousType?: MaliciousCodeType;
};

// 1ヒットあたりのダメージ。
export { ATTACK_DAMAGE };

// 初期 hp。種類があれば #10 の hp、なければ既定値（仮）。
export const getInitialHp = (maliciousType?: MaliciousCodeType): number =>
  maliciousType === undefined
    ? DEFAULT_MALICIOUS_CODE_HP
    : MALICIOUS_CODE_TYPE_DEFINITIONS[maliciousType].hp;

// hp が 0 以下なら撃破済み。
export const isDefeated = (hp: number): boolean => hp <= 0;

// 負・NaN・Infinity のダメージは 0 として扱う（funds.ts の sanitizeAmount と同じ方針）。
const sanitizeDamage = (damage: number): number =>
  Number.isFinite(damage) && damage > 0 ? damage : 0;

export type HitResult = {
  readonly hp: number;
  // このヒットで撃破したときだけ true。撃破済みへの再ヒットは false で hp も変えない。
  readonly defeated: boolean;
};

// ヒットを適用する。hp は 0 未満になってもそのまま返す（撃破済みの判定は isDefeated）。入力は変更しない。
export const applyHit = (hp: number, damage: number = ATTACK_DAMAGE): HitResult => {
  if (isDefeated(hp)) return { hp, defeated: false };
  const next = hp - sanitizeDamage(damage);
  return { hp: next, defeated: isDefeated(next) };
};

export type CodeFate = 'flowing' | 'defeated' | 'released';

// 同一フレームで「撃破」と「リリース地点到達」が重なった場合は撃破を優先し、リリースしない（仮ルール）。
export const resolveCodeFate = (defeated: boolean, released: boolean): CodeFate => {
  if (defeated) return 'defeated';
  return released ? 'released' : 'flowing';
};
