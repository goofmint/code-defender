import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  formatNumber,
  formatShortAmount,
  formatYen,
  getCatalogue,
  getLocale,
  getMessages,
  getPlaceholderNames,
  interpolate,
  localizedRecord,
  setLocale,
} from './index';

describe('現在の言語', () => {
  afterEach(() => {
    setLocale('ja');
  });

  it('初期値は ja', () => {
    expect(getLocale()).toBe('ja');
    expect(getMessages()).toBe(getCatalogue('ja'));
  });

  it('setLocale で切り替えたカタログを返す', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(getMessages()).toBe(getCatalogue('en'));
    setLocale('ja');
    expect(getMessages()).toBe(getCatalogue('ja'));
  });
});

describe('interpolate', () => {
  it.each([
    ['', {}, ''],
    ['固定の文言', {}, '固定の文言'],
    ['{days}日', { days: 0 }, '0日'],
    ['Days: {days}', { days: 12 }, 'Days: 12'],
    ['{a}→{b}', { a: '1', b: '2' }, '1→2'],
    ['{a}{a}', { a: 'x' }, 'xx'],
    ['{value}万', { value: 0.5 }, '0.5万'],
    ['{a}', { a: 'x', unused: 'y' }, 'x'],
    ['{ a }', {}, '{ a }'],
  ])('interpolate(%j, %j) = %j', (template, params, expected) => {
    expect(interpolate(template, params)).toBe(expected);
  });

  it('値が渡されていないプレースホルダーはエラー', () => {
    expect(() => interpolate('{amount}円', {})).toThrow('文言のプレースホルダーに値が渡されていません: {amount}（{amount}円）');
    expect(() => interpolate('{a}{b}', { a: 1 })).toThrow('{b}');
  });

  it('継承したプロパティ名（toString など）は値として扱わない', () => {
    expect(() => interpolate('{toString}', {})).toThrow('{toString}');
  });
});

describe('getPlaceholderNames', () => {
  it.each([
    ['', []],
    ['文言', []],
    ['{a}', ['a']],
    ['{a}{b}{a}', ['a', 'b']],
    ['{value}万/月', ['value']],
  ])('%j → %j', (template, expected) => {
    expect(getPlaceholderNames(template)).toEqual(expected);
  });
});

describe('書式ヘルパー（日本語）', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1,000'],
    [-1000, '-1,000'],
    [Number.MAX_SAFE_INTEGER, '9,007,199,254,740,991'],
  ])('formatNumber(%d) = %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  it.each([
    [0, '0円'],
    [1, '1円'],
    [1000, '1,000円'],
    [-1, '-1円'],
    [-50000, '-50,000円'],
  ])('formatYen(%d) = %s', (amount, expected) => {
    expect(formatYen(amount)).toBe(expected);
  });

  it.each([
    [100000, 'oneTime', '10万円'],
    [5000, 'oneTime', '0.5万円'],
    [0, 'oneTime', '0万円'],
    [20000, 'monthly', '2万/月'],
    [15000, 'monthly', '1.5万/月'],
  ] as const)('formatShortAmount(%d, %s) = %s', (amount, payment, expected) => {
    expect(formatShortAmount(amount, payment)).toBe(expected);
  });
});

describe('書式ヘルパー（英語）', () => {
  beforeEach(() => {
    setLocale('en');
  });
  afterEach(() => {
    setLocale('ja');
  });

  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1,000'],
    [-1000, '-1,000'],
  ])('formatNumber(%d) = %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  it.each([
    [0, '¥0'],
    [1, '¥1'],
    [1000, '¥1,000'],
    [-1, '-¥1'],
    [-50000, '-¥50,000'],
  ])('formatYen(%d) = %s（負の符号は通貨記号の前）', (amount, expected) => {
    expect(formatYen(amount)).toBe(expected);
  });

  it.each([
    [100000, 'oneTime', '¥100K'],
    [500, 'oneTime', '¥0.5K'],
    [0, 'oneTime', '¥0K'],
    [20000, 'monthly', '¥20K/mo'],
    [1500, 'monthly', '¥1.5K/mo'],
  ] as const)('formatShortAmount(%d, %s) = %s', (amount, payment, expected) => {
    expect(formatShortAmount(amount, payment)).toBe(expected);
  });
});

describe('localizedRecord', () => {
  afterEach(() => {
    setLocale('ja');
  });

  const view = localizedRecord((messages) => messages.engineer.ranks);

  it('キーは既定言語のカタログと同じで、列挙できる', () => {
    expect(Object.keys(view)).toEqual(Object.keys(getCatalogue('ja').engineer.ranks));
    expect({ ...view }).toEqual(getCatalogue('ja').engineer.ranks);
  });

  it('読むたびに現在の言語の値を返す', () => {
    expect(view.junior).toBe('ジュニア');
    setLocale('en');
    expect(view.junior).toBe('Junior');
    setLocale('ja');
    expect(view.junior).toBe('ジュニア');
  });
});
