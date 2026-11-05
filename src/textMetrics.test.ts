import { describe, expect, it } from 'vitest';
import { HALF_WIDTH_CHAR_RATIO } from './config';
import { getCatalogue } from './i18n';
import { RELEASE_POINT_STYLE } from './releasePoint';
import { estimateTextWidth, isHalfWidthChar } from './textMetrics';

const RELEASE_LABEL_FONT_PX = parseInt(RELEASE_POINT_STYLE.labelFontSize, 10);

describe('isHalfWidthChar: 全角と半角の区別', () => {
  it.each([
    ['A', true],
    ['z', true],
    ['0', true],
    [' ', true],
    ['~', true],
    ['¥', true],
    ['é', true],
    ['ჿ', true],
    ['ᄀ', false],
    ['リ', false],
    ['休', false],
    ['Ａ', false],
    ['！', false],
    ['｠', false],
    ['｡', true],
    ['ｱ', true],
    ['ￜ', true],
    ['￝', false],
    ['￧', false],
    ['￨', true],
    ['￮', true],
    ['￯', false],
    ['◀', false],
  ])('%j は半角 = %s', (char, expected) => {
    expect(isHalfWidthChar(char)).toBe(expected);
  });

  it('空文字はエラー', () => {
    expect(() => isHalfWidthChar('')).toThrow('幅を見積もる文字が空です');
  });
});

describe('estimateTextWidth', () => {
  it('空文字は 0', () => {
    expect(estimateTextWidth('', 14)).toBe(0);
  });

  it('全角 1 文字はフォント px、半角 1 文字はフォント px × 比率', () => {
    expect(estimateTextWidth('リ', 14)).toBe(14);
    expect(estimateTextWidth('R', 10)).toBeCloseTo(10 * HALF_WIDTH_CHAR_RATIO);
  });

  it('全角と半角が混ざると、それぞれの幅の合計', () => {
    expect(estimateTextWidth('AI(強い)', 10)).toBeCloseTo(2 * 10 + 4 * 10 * HALF_WIDTH_CHAR_RATIO);
  });

  it('比率は引数で差し替えられる', () => {
    expect(estimateTextWidth('ab', 10, 0.5)).toBe(10);
    expect(estimateTextWidth('ab', 10, 1)).toBe(20);
  });

  it('サロゲートペアは 1 文字（全角）として数える', () => {
    expect(estimateTextWidth('𠮷', 14)).toBe(14);
  });

  it('日本語の「リリース」はリリースラベルの文字サイズ（14px）で 56px（従来の見積もりと同じ）', () => {
    expect(getCatalogue('ja').releasePoint.label).toBe('リリース');
    expect(estimateTextWidth(getCatalogue('ja').releasePoint.label, RELEASE_LABEL_FONT_PX)).toBe(56);
    expect(estimateTextWidth(RELEASE_POINT_STYLE.label, RELEASE_LABEL_FONT_PX)).toBe(56);
  });

  it('英語のリリースラベルは 60px 以下（中心 x=930 から画面右端まで 30px）', () => {
    expect(estimateTextWidth(getCatalogue('en').releasePoint.label, RELEASE_LABEL_FONT_PX)).toBeLessThanOrEqual(60);
  });
});
