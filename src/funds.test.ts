import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from './i18n';
import {
  addFunds,
  createFundsChangedEvent,
  formatFunds,
  FUNDS_CHANGED_EVENT,
  subtractFunds,
} from './funds';

describe('addFunds', () => {
  it.each([
    [100, 0, 100],
    [100, 1, 101],
    [100, 50, 150],
    [-100, 150, 50],
    [100, -1, 100],
    [100, NaN, 100],
    [100, Infinity, 100],
    [100, -Infinity, 100],
  ])('addFunds(%d, %d) = %d', (funds, amount, expected) => {
    expect(addFunds(funds, amount)).toBe(expected);
  });
});

describe('subtractFunds', () => {
  it.each([
    [100, 0, 100],
    [100, 1, 99],
    [100, 100, 0],
    [100, 101, -1],
    [-100, 50, -150],
    [100, -1, 100],
    [100, NaN, 100],
    [100, Infinity, 100],
  ])('subtractFunds(%d, %d) = %d', (funds, amount, expected) => {
    expect(subtractFunds(funds, amount)).toBe(expected);
  });
});

describe('formatFunds', () => {
  it.each([
    [0, '💰0円'],
    [1, '💰1円'],
    [999, '💰999円'],
    [1000, '💰1,000円'],
    [999999, '💰999,999円'],
    [1000000, '💰1,000,000円'],
    [Number.MAX_SAFE_INTEGER, '💰9,007,199,254,740,991円'],
    [-1, '💰-1円'],
    [-999, '💰-999円'],
    [-1000, '💰-1,000円'],
    [-300000, '💰-300,000円'],
  ])('formatFunds(%d) = %s', (funds, expected) => {
    expect(formatFunds(funds)).toBe(expected);
  });
});

describe('createFundsChangedEvent', () => {
  it('イベント名は funds-changed', () => {
    expect(FUNDS_CHANGED_EVENT).toBe('funds-changed');
  });

  it('減少: delta は負', () => {
    expect(createFundsChangedEvent(1000, 700, 'salary')).toEqual({
      previous: 1000,
      current: 700,
      delta: -300,
      reason: 'salary',
    });
  });

  it('変化なし: delta は 0', () => {
    expect(createFundsChangedEvent(500, 500, 'salary').delta).toBe(0);
  });
});

describe('formatFunds（英語 #158）', () => {
  beforeEach(() => {
    setLocale('en');
  });
  afterEach(() => {
    setLocale('ja');
  });

  it.each([
    [0, '💰¥0'],
    [999, '💰¥999'],
    [1000, '💰¥1,000'],
    [1000000, '💰¥1,000,000'],
    [-1, '💰-¥1'],
    [-300000, '💰-¥300,000'],
  ])('formatFunds(%d) = %s（負の符号は通貨記号の前）', (funds, expected) => {
    expect(formatFunds(funds)).toBe(expected);
  });
});
