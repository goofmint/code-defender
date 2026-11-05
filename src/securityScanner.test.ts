// セキュリティスキャナー(#56)の「対象選択 → ダメージ算定 → HP減算」を純粋関数だけで結合して確かめる。
// 数値（攻撃力・倍率・範囲・HP）は config.ts の仮の値から求め、テストには書き込まない。
import { describe, expect, it } from 'vitest';
import type { AttackTarget } from './attack';
import { ITEM_POWER_DAMAGE, ITEM_STRONG_AGAINST_MULTIPLIER } from './config';
import { applyHit, getInitialHp } from './defeat';
import type { HitResult } from './defeat';
import { getItemDamage, getItemRange, ITEM_DEFINITIONS } from './item';
import { findItemTarget, placementCellCenter } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import type { MaliciousCodeType } from './maliciousCode';

type ScannerTarget = AttackTarget & {
  readonly id: number;
  readonly hp: number;
  readonly maliciousType?: MaliciousCodeType;
};

const scanner: PlacedItem = { id: 0, itemType: 'securityScanner', cell: { col: 5, row: 5 }, lastAttackTime: null };
const center = placementCellCenter(scanner.cell);
const range = getItemRange('securityScanner');
const basePower = ITEM_POWER_DAMAGE[ITEM_DEFINITIONS.securityScanner.power];

const malicious = (id: number, dx: number, dy: number, maliciousType?: MaliciousCodeType): ScannerTarget => ({
  id,
  kind: 'malicious',
  position: { x: center.x + dx, y: center.y + dy },
  hp: getInitialHp(maliciousType),
  ...(maliciousType === undefined ? {} : { maliciousType }),
});

const normal = (id: number, dx: number, dy: number): ScannerTarget => ({
  id,
  kind: 'normal',
  position: { x: center.x + dx, y: center.y + dy },
  hp: getInitialHp(),
});

type ScanResult = { readonly targetId: number; readonly damage: number; readonly hit: HitResult } | null;

// main.ts の updateItems → damageMaliciousCode と同じ順で、1回の攻撃を適用する。
const scanOnce = (codes: readonly ScannerTarget[]): ScanResult => {
  const target = findItemTarget(scanner, codes);
  if (target === null) return null;
  const damage = getItemDamage(scanner.itemType, target.maliciousType);
  return { targetId: target.id, damage, hit: applyHit(target.hp, damage) };
};

const expectHit = (result: ScanResult): NonNullable<ScanResult> => {
  if (result === null) throw new Error('スキャナーが攻撃しませんでした');
  return result;
};

describe('セキュリティスキャナー: 種別ごとのダメージと撃破境界', () => {
  // strong は企画書 8 の「得意」（脆弱性クリティカル・メジャー）。得意なら攻撃力 × 倍率、それ以外は等倍。
  const cases: readonly [string, MaliciousCodeType | undefined, boolean][] = [
    ['脆弱性：クリティカル（得意）', 'vulnerabilityCritical', true],
    ['脆弱性：メジャー（得意）', 'vulnerabilityMajor', true],
    ['脆弱性：マイナー（等倍）', 'vulnerabilityMinor', false],
    ['脆弱性：インフォ（等倍）', 'vulnerabilityInfo', false],
    ['種別なし（等倍）', undefined, false],
    ['バグ（得意でない種別・等倍）', 'bug', false],
    ['スパゲティコード（得意でない種別・等倍）', 'spaghetti', false],
  ];

  it.each(cases)('%s', (_label, maliciousType, strong) => {
    const hp = getInitialHp(maliciousType);
    const expectedDamage = strong ? basePower * ITEM_STRONG_AGAINST_MULTIPLIER : basePower;

    const { damage, hit } = expectHit(scanOnce([malicious(1, 0, 0, maliciousType)]));

    expect(damage).toBe(expectedDamage);
    expect(hit.hp).toBe(hp - expectedDamage);
    expect(hit.defeated).toBe(hp - expectedDamage <= 0);
  });

  it('得意な種別（クリティカル・メジャー）は得意でない種別より大きいダメージになる', () => {
    const critical = expectHit(scanOnce([malicious(1, 0, 0, 'vulnerabilityCritical')]));
    const minor = expectHit(scanOnce([malicious(1, 0, 0, 'vulnerabilityMinor')]));
    expect(critical.damage).toBeGreaterThan(minor.damage);
  });

  it('クリティカルは1回の攻撃で撃破でき、得意でない攻撃力のままでは撃破できない（現在の仮の値）', () => {
    const hp = getInitialHp('vulnerabilityCritical');
    expect(expectHit(scanOnce([malicious(1, 0, 0, 'vulnerabilityCritical')])).hit.defeated).toBe(true);
    expect(applyHit(hp, basePower).defeated).toBe(false);
  });

  it('HP がちょうど 0 になる種別（マイナー）は撃破になる', () => {
    const { hit } = expectHit(scanOnce([malicious(1, 0, 0, 'vulnerabilityMinor')]));
    expect(hit.hp).toBe(0);
    expect(hit.defeated).toBe(true);
  });
});

describe('セキュリティスキャナー: 射程（セル中心からの距離・境界値）', () => {
  it('射程は 150px（中距離）', () => {
    expect(range).toBe(150);
  });

  it.each([
    ['射程 − 1px（水平）', range - 1, 0],
    ['射程ちょうど（水平）', range, 0],
    ['射程ちょうど（斜め 90,120）', 90, 120],
  ])('%s は攻撃する', (_label, dx, dy) => {
    const result = expectHit(scanOnce([malicious(1, dx, dy, 'vulnerabilityCritical')]));
    expect(result.targetId).toBe(1);
    expect(result.hit.defeated).toBe(true);
  });

  it('射程 + 1px は対象なしで、HP は変わらない', () => {
    const code = malicious(1, range + 1, 0, 'vulnerabilityCritical');
    expect(scanOnce([code])).toBeNull();
    expect(code.hp).toBe(getInitialHp('vulnerabilityCritical'));
  });
});

describe('セキュリティスキャナー: 対象の選び方', () => {
  it('最寄りの正常コードは無視し、近い得意でない不正コードを遠いクリティカルより優先する', () => {
    const codes = [
      normal(1, 10, 0),
      malicious(2, 50, 0, 'spaghetti'),
      malicious(3, 100, 0, 'vulnerabilityCritical'),
    ];

    const { targetId, damage, hit } = expectHit(scanOnce(codes));

    expect(targetId).toBe(2);
    expect(damage).toBe(basePower);
    expect(hit.hp).toBe(getInitialHp('spaghetti') - basePower);
  });

  it('同じ距離なら配列で先にあるものを選ぶ（得意な種別でも後ろなら選ばない）', () => {
    const codes = [malicious(1, 50, 0, 'spaghetti'), malicious(2, 0, 50, 'vulnerabilityCritical')];
    expect(expectHit(scanOnce(codes)).targetId).toBe(1);
    expect(expectHit(scanOnce([...codes].reverse())).targetId).toBe(2);
  });

  it('正常なコードしかいなければ攻撃しない', () => {
    expect(scanOnce([normal(1, 0, 0)])).toBeNull();
  });
});
