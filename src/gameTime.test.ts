import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from './i18n';
import {
  advanceElapsedMs,
  createMonthElapsedEvent,
  formatElapsedDays,
  getCrossedMonths,
  getElapsedDays,
  getElapsedMonths,
  MONTH_ELAPSED_EVENT,
  MS_PER_GAME_DAY,
} from './gameTime';

describe('getElapsedDays（日数変換）', () => {
  it('1日は2000msである', () => {
    expect(MS_PER_GAME_DAY).toBe(2000);
  });

  it.each([
    [0, 0],
    [1, 0],
    [1999, 0],
    [2000, 1],
    [2001, 1],
    [59999, 29],
    [60000, 30],
    [60001, 30],
    [119999, 59],
    [120000, 60],
    [120001, 60],
  ])('%dms は %d日', (ms, days) => {
    expect(getElapsedDays(ms)).toBe(days);
  });

  it.each([-1, -2000, Number.NaN, Infinity, -Infinity])('%s は0日として扱う', (ms) => {
    expect(getElapsedDays(ms)).toBe(0);
  });
});

describe('getElapsedMonths（月の境界）', () => {
  it.each([
    [0, 0],
    [59999, 0],
    [60000, 1],
    [60001, 1],
    [119999, 1],
    [120000, 2],
  ])('%dms は %d か月', (ms, months) => {
    expect(getElapsedMonths(ms)).toBe(months);
  });

  it('負値・NaN・Infinity は0か月として扱う', () => {
    expect(getElapsedMonths(-1)).toBe(0);
    expect(getElapsedMonths(Number.NaN)).toBe(0);
    expect(getElapsedMonths(Infinity)).toBe(0);
  });
});

describe('getCrossedMonths（越えた月の境界）', () => {
  it('0→59999 は空', () => {
    expect(getCrossedMonths(0, 59999)).toEqual([]);
  });

  it('59999→60000 は [1]（境界ちょうどに到達したら含む）', () => {
    expect(getCrossedMonths(59999, 60000)).toEqual([1]);
  });

  it('60000→60001 は空（同じ境界を2回出さない）', () => {
    expect(getCrossedMonths(60000, 60001)).toEqual([]);
  });

  it('59999→120000 は [1,2]（大きな delta で2境界）', () => {
    expect(getCrossedMonths(59999, 120000)).toEqual([1, 2]);
  });

  it('0→180000 は [1,2,3]', () => {
    expect(getCrossedMonths(0, 180000)).toEqual([1, 2, 3]);
  });

  it('prev と next が同じなら空', () => {
    expect(getCrossedMonths(60000, 60000)).toEqual([]);
    expect(getCrossedMonths(0, 0)).toEqual([]);
  });

  it('next が prev より小さい場合は空', () => {
    expect(getCrossedMonths(120000, 0)).toEqual([]);
  });

  it('16.7ms 刻みで 0→125000ms まで進めても、各境界はちょうど1回ずつ', () => {
    const crossed: number[] = [];
    let elapsed = 0;
    while (elapsed < 125000) {
      const next = advanceElapsedMs(elapsed, 16.7);
      crossed.push(...getCrossedMonths(elapsed, next));
      elapsed = next;
    }
    expect(crossed).toEqual([1, 2]);
  });
});

describe('advanceElapsedMs（累積）', () => {
  it('通常は加算する', () => {
    expect(advanceElapsedMs(1000, 16)).toBe(1016);
  });

  it('0 を加算しても変わらない', () => {
    expect(advanceElapsedMs(1000, 0)).toBe(1000);
  });

  it.each([-1, -1000, Number.NaN, Infinity, -Infinity])('delta が %s なら加算しない', (delta) => {
    expect(advanceElapsedMs(1000, delta)).toBe(1000);
  });
});

describe('formatElapsedDays', () => {
  it('「経過日数: N日」にする', () => {
    expect(formatElapsedDays(0)).toBe('経過日数: 0日');
    expect(formatElapsedDays(30)).toBe('経過日数: 30日');
  });
});

describe('月経過イベント', () => {
  it('イベント名は month-elapsed', () => {
    expect(MONTH_ELAPSED_EVENT).toBe('month-elapsed');
  });

  it('ペイロードは境界の時刻と経過日数を持つ', () => {
    expect(createMonthElapsedEvent(1)).toEqual({ month: 1, elapsedMs: 60000, days: 30 });
    expect(createMonthElapsedEvent(2)).toEqual({ month: 2, elapsedMs: 120000, days: 60 });
  });
});

describe('formatElapsedDays（英語 #158）', () => {
  beforeEach(() => {
    setLocale('en');
  });
  afterEach(() => {
    setLocale('ja');
  });

  it.each([
    [0, 'Days elapsed: 0'],
    [1, 'Days elapsed: 1'],
    [1000, 'Days elapsed: 1000'],
  ])('formatElapsedDays(%d) = %s', (days, expected) => {
    expect(formatElapsedDays(days)).toBe(expected);
  });
});
