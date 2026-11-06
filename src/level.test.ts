import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LEVEL_UP_INTERVAL_DAYS } from './config';
import { MS_PER_GAME_DAY } from './gameTime';
import { setLocale } from './i18n';
import { formatLevelAndDays, levelAt } from './level';

const days = (n: number): number => n * MS_PER_GAME_DAY;

describe('levelAt: 経過時間のレベル(#164)', () => {
  it('レベルを上げる間隔は30日', () => {
    expect(LEVEL_UP_INTERVAL_DAYS).toBe(30);
  });

  it.each([
    [0, 1],
    [29, 1],
    [30, 2],
    [59, 2],
    [60, 3],
    [89, 3],
    [90, 4],
  ])('境界値: %i日 → Lv.%i', (elapsedDays, level) => {
    expect(levelAt(days(elapsedDays))).toBe(level);
  });

  it('30日の 1ms 前は Lv.1、ちょうどで Lv.2（日数の切り捨てに合わせる）', () => {
    expect(levelAt(days(30) - 1)).toBe(1);
    expect(levelAt(days(30))).toBe(2);
  });

  it('上限はない（18種類すべてを解放する Lv.16 の後も上がる）', () => {
    expect(levelAt(days(450))).toBe(16);
    expect(levelAt(days(480))).toBe(17);
    expect(levelAt(days(3000))).toBe(101);
  });

  it('大きな時間差でも経過時間から直接求める（複数レベルを一度に越える）', () => {
    expect(levelAt(days(29) + days(61))).toBe(4);
  });

  it.each([-1, -days(30), Number.NaN, Infinity, -Infinity])('経過時間 %s は 0日として Lv.1', (elapsedMs) => {
    expect(levelAt(elapsedMs)).toBe(1);
  });
});

describe('formatLevelAndDays: 左上の表示(#164)', () => {
  it('日本語は「Lv.N / M日」', () => {
    expect(formatLevelAndDays(1, 0)).toBe('Lv.1 / 0日');
    expect(formatLevelAndDays(2, 30)).toBe('Lv.2 / 30日');
    expect(formatLevelAndDays(33334, 999999)).toBe('Lv.33334 / 999999日');
  });

  describe('英語', () => {
    beforeEach(() => {
      setLocale('en');
    });
    afterEach(() => {
      setLocale('ja');
    });

    it.each([
      [1, 0, 'Lv.1 / Day 0'],
      [2, 30, 'Lv.2 / Day 30'],
      [34, 1000, 'Lv.34 / Day 1000'],
    ])('Lv.%i・%i日 → %s', (level, elapsedDays, expected) => {
      expect(formatLevelAndDays(level, elapsedDays)).toBe(expected);
    });
  });
});
