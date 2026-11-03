import { INCIDENT_DAMAGE_UNIT_YEN, INCIDENT_DEFAULT_DAMAGE_POINTS } from './config';
import type { CodeReleasedPayload } from './codeFlow';
import type { GameOverState } from './gameOver';
import { MALICIOUS_CODE_TYPE_DEFINITIONS } from './maliciousCode';
import type { MaliciousCodeType } from './maliciousCode';
import { subtractFunds } from './funds';

// 障害（不正コードのリリース）の純粋ロジック。Phaser に依存しない。

// 障害が起きたときに scene.events で発行するイベント名。
export const INCIDENT_EVENT = 'incident-occurred';

export type IncidentEvent = {
  readonly codeId: number;
  // 種別を持たない不正コードでは undefined。
  readonly maliciousType: MaliciousCodeType | undefined;
  // 損害額（円）。
  readonly damage: number;
  readonly fundsBefore: number;
  readonly fundsAfter: number;
};

export const createIncidentEvent = (
  codeId: number,
  maliciousType: MaliciousCodeType | undefined,
  damage: number,
  fundsBefore: number,
  fundsAfter: number,
): IncidentEvent => ({ codeId, maliciousType, damage, fundsBefore, fundsAfter });

// 損害額（円）= 損害ポイント × 1ポイントあたりの円。負・NaN・Infinity は 0。
export const calculateDamage = (
  points: number,
  unitYen: number = INCIDENT_DAMAGE_UNIT_YEN,
): number => {
  const amount = points * unitYen;
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

// 種別があればその損害ポイント、なければ仮の既定損害ポイントで損害額を求める。
export const incidentDamage = (maliciousType: MaliciousCodeType | undefined): number =>
  calculateDamage(
    maliciousType === undefined
      ? INCIDENT_DEFAULT_DAMAGE_POINTS
      : MALICIOUS_CODE_TYPE_DEFINITIONS[maliciousType].damage,
  );

// リリースされたコードの障害を精算する。ゲームオーバー後と正常コードは障害にならず null。
// 不正コードは損害ぶん資金を引く（マイナスもそのまま）。倒産判定は呼び出し側（checkBankruptcy）が行う。
export const settleIncident = (
  funds: number,
  payload: CodeReleasedPayload,
  gameOver: GameOverState,
): IncidentEvent | null => {
  if (gameOver.over || payload.kind !== 'malicious') {
    return null;
  }
  const damage = incidentDamage(payload.maliciousType);
  return createIncidentEvent(
    payload.id,
    payload.maliciousType,
    damage,
    funds,
    subtractFunds(funds, damage),
  );
};
