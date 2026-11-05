import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from './i18n';
import { CODE_STYLES } from './code';
import {
  getMaliciousCodeAppearance,
  getMaliciousCodeLabel,
  MALICIOUS_CODE_TYPE_DEFINITIONS,
  MALICIOUS_CODE_TYPES,
  pickMaliciousType,
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
    const labels = MALICIOUS_CODE_TYPES.map((t) => getMaliciousCodeLabel(t));
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

describe('pickMaliciousType（一様抽選・境界値）', () => {
  const count = MALICIOUS_CODE_TYPES.length;
  const EPSILON = 1e-9;
  const first = MALICIOUS_CODE_TYPES[0];
  const second = MALICIOUS_CODE_TYPES[1];
  const secondLast = MALICIOUS_CODE_TYPES[count - 2];
  const last = MALICIOUS_CODE_TYPES[count - 1];

  it.each([
    ['0 は先頭', 0, first],
    ['1/種類数 − ε は先頭', 1 / count - EPSILON, first],
    ['1/種類数 は2番目', 1 / count, second],
    ['(種類数−1)/種類数 − ε は末尾の1つ前', (count - 1) / count - EPSILON, secondLast],
    ['(種類数−1)/種類数 は末尾', (count - 1) / count, last],
    ['1 − ε は末尾', 1 - EPSILON, last],
  ])('random = %s', (_label, value, expected) => {
    expect(pickMaliciousType(() => value)).toBe(expected);
  });

  it.each([
    ['1 は末尾に丸める', 1, last],
    ['1 より大きい値は末尾に丸める', 2, last],
    ['負の値は先頭に丸める', -0.5, first],
    ['NaN は先頭に丸める', Number.NaN, first],
  ])('範囲外: %s', (_label, value, expected) => {
    expect(pickMaliciousType(() => value)).toBe(expected);
  });

  it('各区間の中央の乱数で9種類すべてに到達する', () => {
    const picked = MALICIOUS_CODE_TYPES.map((_, index) => pickMaliciousType(() => (index + 0.5) / count));
    expect(picked).toEqual([...MALICIOUS_CODE_TYPES]);
  });

  it('乱数は1回だけ使う', () => {
    let calls = 0;
    pickMaliciousType(() => {
      calls += 1;
      return 0;
    });
    expect(calls).toBe(1);
  });
});

describe('不正なコードの表示名（英語 #158）', () => {
  beforeEach(() => {
    setLocale('en');
  });
  afterEach(() => {
    setLocale('ja');
  });

  it('9種類すべてにあり、重複しない', () => {
    const labels = MALICIOUS_CODE_TYPES.map((t) => getMaliciousCodeLabel(t));
    expect(labels.every((label) => label !== '')).toBe(true);
    expect(new Set(labels).size).toBe(MALICIOUS_CODE_TYPES.length);
    expect(getMaliciousCodeLabel('vulnerabilityCritical')).toBe('Vulnerability: Critical');
  });
});
