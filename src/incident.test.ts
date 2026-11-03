import { describe, expect, it } from 'vitest';
import { INCIDENT_DAMAGE_UNIT_YEN, INCIDENT_DEFAULT_DAMAGE_POINTS } from './config';
import type { CodeReleasedPayload } from './codeFlow';
import { checkBankruptcy, INITIAL_GAME_OVER_STATE } from './gameOver';
import type { GameOverState } from './gameOver';
import {
  calculateDamage,
  createIncidentEvent,
  incidentDamage,
  INCIDENT_EVENT,
  settleIncident,
} from './incident';
import { MALICIOUS_CODE_TYPE_DEFINITIONS, MALICIOUS_CODE_TYPES } from './maliciousCode';

const malicious = (id: number, maliciousType?: CodeReleasedPayload['maliciousType']): CodeReleasedPayload => ({
  id,
  kind: 'malicious',
  routeId: 0,
  maliciousType,
});
const normal = (id: number): CodeReleasedPayload => ({ id, kind: 'normal', routeId: 0 });

const DEFAULT_DAMAGE = INCIDENT_DEFAULT_DAMAGE_POINTS * INCIDENT_DAMAGE_UNIT_YEN;

describe('INCIDENT_EVENT / createIncidentEvent', () => {
  it('イベント名と内容', () => {
    expect(INCIDENT_EVENT).toBe('incident-occurred');
    expect(createIncidentEvent(1, 'bug', 100, 500, 400)).toEqual({
      codeId: 1,
      maliciousType: 'bug',
      damage: 100,
      fundsBefore: 500,
      fundsAfter: 400,
    });
  });
});

describe('calculateDamage', () => {
  it.each([
    [0, 10, 0],
    [1, 10, 10],
    [5, 10000, 50000],
    [-1, 10, 0],
    [5, -10, 0],
    [NaN, 10, 0],
    [5, NaN, 0],
    [Infinity, 10, 0],
    [5, Infinity, 0],
    [-Infinity, 10, 0],
  ])('calculateDamage(%d, %d) = %d', (points, unit, expected) => {
    expect(calculateDamage(points, unit)).toBe(expected);
  });
});

describe('incidentDamage', () => {
  it.each(MALICIOUS_CODE_TYPES.map((type) => [type, MALICIOUS_CODE_TYPE_DEFINITIONS[type].damage] as const))(
    '種別 %s は損害ポイント %d × 単位円',
    (type, points) => {
      expect(incidentDamage(type)).toBe(points * INCIDENT_DAMAGE_UNIT_YEN);
    },
  );

  it('種別なしは既定の損害ポイント × 単位円', () => {
    expect(incidentDamage(undefined)).toBe(DEFAULT_DAMAGE);
  });
});

describe('settleIncident', () => {
  it('正常コードは障害にならない', () => {
    expect(settleIncident(1000000, normal(1), INITIAL_GAME_OVER_STATE)).toBeNull();
  });

  it.each([
    ['ちょうど 0 になる', DEFAULT_DAMAGE, 0],
    ['1 円残る', DEFAULT_DAMAGE + 1, 1],
    ['負になる', DEFAULT_DAMAGE - 1, -1],
    ['すでに負', -500, -500 - DEFAULT_DAMAGE],
  ])('種別なしの不正コードで資金が%s', (_name, funds, expected) => {
    expect(settleIncident(funds, malicious(7), INITIAL_GAME_OVER_STATE)).toEqual({
      codeId: 7,
      maliciousType: undefined,
      damage: DEFAULT_DAMAGE,
      fundsBefore: funds,
      fundsAfter: expected,
    });
  });

  it.each(MALICIOUS_CODE_TYPES)('種別 %s の不正コードは種別の損害を引く', (type) => {
    const damage = MALICIOUS_CODE_TYPE_DEFINITIONS[type].damage * INCIDENT_DAMAGE_UNIT_YEN;
    expect(settleIncident(1000000, malicious(3, type), INITIAL_GAME_OVER_STATE)).toEqual({
      codeId: 3,
      maliciousType: type,
      damage,
      fundsBefore: 1000000,
      fundsAfter: 1000000 - damage,
    });
  });
});

describe('ゲームオーバー後のリリース', () => {
  it('不正コードでも障害にならない', () => {
    expect(settleIncident(1000000, malicious(1), { over: true, at: 50 })).toBeNull();
  });
});

// シーンと同じ順序: settleIncident → 資金更新 → checkBankruptcy（funds-changed → onFundsChanged）。
const releaseAll = (funds: number, payloads: readonly CodeReleasedPayload[]) => {
  let currentFunds = funds;
  let state: GameOverState = INITIAL_GAME_OVER_STATE;
  let count = 0;
  for (const payload of payloads) {
    const incident = settleIncident(currentFunds, payload, state);
    if (incident === null) continue;
    count += 1;
    currentFunds = incident.fundsAfter;
    state = checkBankruptcy(state, currentFunds, 100).state;
  }
  return { funds: currentFunds, state, count };
};

describe('同一フレームの複数リリース', () => {
  it('正常コードだけなら資金は減らない', () => {
    expect(releaseAll(1000, [normal(1), normal(2)])).toEqual({
      funds: 1000,
      state: INITIAL_GAME_OVER_STATE,
      count: 0,
    });
  });

  it.each([
    ['3件とも精算して 1 円残り倒産せず', DEFAULT_DAMAGE * 3 + 1, 3, 1, false],
    ['2件目でちょうど 0 になり倒産、3件目は引かない', DEFAULT_DAMAGE * 2, 2, 0, true],
    ['1件目で負になり倒産、2件目以降は引かない', DEFAULT_DAMAGE - 1, 1, -1, true],
    ['2件目で負になり3件目は引かない', DEFAULT_DAMAGE * 2 - 1, 2, -1, true],
  ])('3件のリリース: %s', (_name, funds, count, expectedFunds, over) => {
    const result = releaseAll(funds, [malicious(1), malicious(2), malicious(3)]);
    expect(result.count).toBe(count);
    expect(result.funds).toBe(expectedFunds);
    expect(result.state.over).toBe(over);
    expect(result.state.at).toBe(over ? 100 : null);
  });

  it('正常コードを挟んでも不正コードだけ精算する', () => {
    const result = releaseAll(1000000, [malicious(1, 'typo'), normal(2), malicious(3, 'bug')]);
    expect(result.count).toBe(2);
    expect(result.funds).toBe(1000000 - (3 + 10) * INCIDENT_DAMAGE_UNIT_YEN);
  });
});
