import { INCIDENT_DAMAGE_UNIT_YEN, INCIDENT_DEFAULT_DAMAGE_POINTS } from './config';
import type { CodeReleasedPayload } from './codeFlow';
import { getInitialHp } from './defeat';
import type { GameOverState } from './gameOver';
import { MALICIOUS_CODE_TYPE_DEFINITIONS } from './maliciousCode';
import type { MaliciousCodeType } from './maliciousCode';
import { subtractFunds } from './funds';

// 障害（不正コードのリリース）の純粋ロジック。Phaser に依存しない。

// 障害が起きたときに scene.events で発行するイベント名。
export const INCIDENT_EVENT = 'incident-occurred';

// 伝説のシニアの書き置き(#58)で障害を防いだときに scene.events で発行するイベント名。防いだ障害は損害・資金変動・INCIDENT_EVENT を出さない。
export const INCIDENT_PREVENTED_EVENT = 'incident-prevented';

// 防いだ障害。damage は防がなければ出ていた損害額（円）。
export type IncidentPreventedPayload = {
  readonly codeId: number;
  readonly maliciousType: MaliciousCodeType | undefined;
  readonly damage: number;
};

export type IncidentEvent = {
  // 障害を起こしたコードの id。コードを持たない障害（金曜日の夕方デプロイ #58 の予約した障害）では null。
  readonly codeId: number | null;
  // 種別を持たない不正コードでは undefined。
  readonly maliciousType: MaliciousCodeType | undefined;
  // 損害額（円）。
  readonly damage: number;
  readonly fundsBefore: number;
  readonly fundsAfter: number;
};

export const createIncidentEvent = (
  codeId: number | null,
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

// 攻撃で弱った不正コードの損害額(#173)。満額 × (残り hp ÷ 初期 hp) を [0, 1] に収めた割合で減らし、円単位で丸める。
// 残り hp が undefined・NaN・±Infinity のときは減らさず満額（残り hp を渡さない既存の呼び出し元と同じ結果にする）。
export const scaledIncidentDamage = (
  maliciousType: MaliciousCodeType | undefined,
  remainingHp: number | undefined,
): number => {
  const fullDamage = incidentDamage(maliciousType);
  if (remainingHp === undefined || !Number.isFinite(remainingHp)) {
    return fullDamage;
  }
  const ratio = Math.min(Math.max(remainingHp / getInitialHp(maliciousType), 0), 1);
  return Math.round(fullDamage * ratio);
};

// リリースされたコードの障害を精算する。ゲームオーバー後と正常コードは障害にならず null。
// 不正コードは損害ぶん資金を引く（マイナスもそのまま）。倒産判定は呼び出し側（checkBankruptcy）が行う。
// 損害は残り hp(#173)に応じて減らす（scaledIncidentDamage）。残り hp のないペイロードは満額。
export const settleIncident = (
  funds: number,
  payload: CodeReleasedPayload,
  gameOver: GameOverState,
): IncidentEvent | null => {
  if (gameOver.over || payload.kind !== 'malicious') {
    return null;
  }
  const damage = scaledIncidentDamage(payload.maliciousType, payload.remainingHp);
  return createIncidentEvent(
    payload.id,
    payload.maliciousType,
    damage,
    funds,
    subtractFunds(funds, damage),
  );
};

// 予約した障害（金曜日の夕方デプロイ #58）を精算する。コードを持たないので codeId・種別はなし。ゲームオーバー後は null。
// 損害ぶん資金を引く（マイナスもそのまま）。倒産判定は呼び出し側（checkBankruptcy）が行う。書き置き(#58)では防がない。
export const settleScheduledIncident = (
  funds: number,
  damage: number,
  gameOver: GameOverState,
): IncidentEvent | null => {
  if (gameOver.over) {
    return null;
  }
  return createIncidentEvent(null, undefined, damage, funds, subtractFunds(funds, damage));
};
