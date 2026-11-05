import { describe, expect, it, vi } from 'vitest';
import { pickRandomCode } from './cat';

type Code = { readonly id: number; readonly kind: 'normal' | 'malicious' };

const codes: readonly Code[] = [
  { id: 1, kind: 'normal' },
  { id: 2, kind: 'malicious' },
  { id: 3, kind: 'normal' },
];

describe('pickRandomCode（猫 #57）', () => {
  it('空配列は null（乱数は呼ばない）', () => {
    const random = vi.fn(() => 0);
    expect(pickRandomCode(random, [])).toBeNull();
    expect(random).not.toHaveBeenCalled();
  });

  it.each<[string, number, number]>([
    ['乱数 0 は先頭', 0, 1],
    ['乱数 1/3 ちょうどは2番目', 1 / 3, 2],
    ['乱数 1/3 の直前は先頭', 1 / 3 - Number.EPSILON, 1],
    ['乱数 0.999… は末尾', 1 - Number.EPSILON, 3],
    ['乱数 1 でも末尾を超えない', 1, 3],
  ])('%s', (_name, value, expectedId) => {
    expect(pickRandomCode(() => value, codes)?.id).toBe(expectedId);
  });

  it('1件の配列は乱数に関係なくその1件', () => {
    const only = [{ id: 9, kind: 'malicious' }] as const;
    expect(pickRandomCode(() => 0, only)?.id).toBe(9);
    expect(pickRandomCode(() => 1 - Number.EPSILON, only)?.id).toBe(9);
  });

  it('正常なコードも不正なコードも選ばれる', () => {
    expect(pickRandomCode(() => 0, codes)?.kind).toBe('normal');
    expect(pickRandomCode(() => 0.5, codes)?.kind).toBe('malicious');
  });

  it('乱数は1回だけ呼び、入力の配列は変更しない', () => {
    const random = vi.fn(() => 0.5);
    const input = [...codes];
    pickRandomCode(random, input);
    expect(random).toHaveBeenCalledTimes(1);
    expect(input).toEqual(codes);
  });
});
