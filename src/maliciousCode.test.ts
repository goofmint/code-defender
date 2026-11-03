import { describe, expect, it } from 'vitest';
import { CODE_STYLES } from './code';
import {
  getMaliciousCodeAppearance,
  MALICIOUS_CODE_TYPE_DEFINITIONS,
  MALICIOUS_CODE_TYPES,
} from './maliciousCode';

const SPEC_LABELS = [
  '脆弱性：クリティカル',
  '脆弱性：メジャー',
  '脆弱性：マイナー',
  '脆弱性：インフォ',
  'スパゲティコード',
  'バグ',
  'コード重複',
  '低パフォーマンス',
  'タイポ',
];

describe('不正なコードの種類', () => {
  it('9種類あり、重複がない', () => {
    expect(MALICIOUS_CODE_TYPES).toHaveLength(9);
    expect(new Set(MALICIOUS_CODE_TYPES).size).toBe(9);
  });

  it('各種類の label は空でなく、仕様書の9名称と一致する', () => {
    const labels = MALICIOUS_CODE_TYPES.map((t) => MALICIOUS_CODE_TYPE_DEFINITIONS[t].label);
    labels.forEach((label) => expect(label).not.toBe(''));
    expect([...labels].sort()).toEqual([...SPEC_LABELS].sort());
  });

  it('脆弱性は4つで、先頭に重大度順に並ぶ', () => {
    const vulns = MALICIOUS_CODE_TYPES.filter(
      (t) => MALICIOUS_CODE_TYPE_DEFINITIONS[t].group === 'vulnerability',
    );
    expect(vulns).toHaveLength(4);
    expect(MALICIOUS_CODE_TYPES.slice(0, 4)).toEqual([
      'vulnerabilityCritical',
      'vulnerabilityMajor',
      'vulnerabilityMinor',
      'vulnerabilityInfo',
    ]);
    expect(vulns).toEqual(MALICIOUS_CODE_TYPES.slice(0, 4));
  });

  it('全種類に見た目・hp・damage があり、hp と damage は正の整数', () => {
    for (const t of MALICIOUS_CODE_TYPES) {
      const def = MALICIOUS_CODE_TYPE_DEFINITIONS[t];
      expect(Number.isInteger(def.hp) && def.hp > 0).toBe(true);
      expect(Number.isInteger(def.damage) && def.damage > 0).toBe(true);
      expect(getMaliciousCodeAppearance(t)).toBeDefined();
    }
  });

  it('9種類の見た目が互いに異なる', () => {
    const appearances = MALICIOUS_CODE_TYPES.map((t) =>
      JSON.stringify(getMaliciousCodeAppearance(t)),
    );
    expect(new Set(appearances).size).toBe(9);
  });

  it('すべて不正コードの基本形（星形＋!）を保つ', () => {
    for (const t of MALICIOUS_CODE_TYPES) {
      expect(getMaliciousCodeAppearance(t)).toMatchObject(CODE_STYLES.malicious);
    }
  });

  it('脆弱性の damage は重大度順に単調非増加', () => {
    const damages = MALICIOUS_CODE_TYPES.slice(0, 4).map(
      (t) => MALICIOUS_CODE_TYPE_DEFINITIONS[t].damage,
    );
    damages.slice(1).forEach((d, i) => expect(d).toBeLessThanOrEqual(damages[i]));
  });

});
