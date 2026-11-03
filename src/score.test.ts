import { describe, expect, it } from 'vitest';
import { createFundsChangedEvent } from './funds';
import type { FundsChangedEvent, FundsChangeReason } from './funds';
import { accumulateScore, formatScore, INITIAL_SCORE } from './score';

const event = (delta: number, reason: FundsChangeReason): FundsChangedEvent => ({
  previous: 0,
  current: delta,
  delta,
  reason,
});

// FundsChangeReason の全値。理由が増えたらここに足すと、下のテストが自動で対象にする。
const ALL_REASONS: readonly FundsChangeReason[] = ['salary', 'sales'];
const NON_SALES_REASONS = ALL_REASONS.filter((reason) => reason !== 'sales');

describe('accumulateScore: 売上の件数', () => {
  it('売上 0 件ならスコアは初期値 0', () => {
    expect(INITIAL_SCORE).toBe(0);
  });

  it('売上 1 件で delta が加算される', () => {
    expect(accumulateScore(INITIAL_SCORE, event(20000, 'sales'), false)).toBe(20000);
  });

  it('複数件を連続で適用すると合計になる', () => {
    const deltas = [20000, 20000, 30000];
    const total = deltas.reduce(
      (score, delta) => accumulateScore(score, event(delta, 'sales'), false),
      INITIAL_SCORE,
    );
    expect(total).toBe(70000);
  });

  it('createFundsChangedEvent が作ったイベントでも加算される', () => {
    expect(accumulateScore(100, createFundsChangedEvent(500, 520, 'sales'), false)).toBe(120);
  });
});

describe('accumulateScore: delta の境界値', () => {
  it.each([
    [1, 101],
    [0, 100],
    [-1, 100],
    [-20000, 100],
    [NaN, 100],
    [Infinity, 100],
    [-Infinity, 100],
  ])('sales の delta %d → スコア %d', (delta, expected) => {
    expect(accumulateScore(100, event(delta, 'sales'), false)).toBe(expected);
  });
});

describe('accumulateScore: 理由', () => {
  it('salary は加算しない', () => {
    expect(accumulateScore(100, event(300000, 'salary'), false)).toBe(100);
  });

  it.each(NON_SALES_REASONS)('sales 以外の理由 %s は加算しない', (reason) => {
    expect(accumulateScore(100, event(20000, reason), false)).toBe(100);
  });

  it('資金が減るイベント（負の delta）はスコアを減らさない', () => {
    expect(accumulateScore(100, event(-300000, 'salary'), false)).toBe(100);
  });
});

describe('accumulateScore: 倒産フレームとリトライ', () => {
  it.each([
    [false, 20100],
    [true, 100],
  ])('gameOver=%s のときの売上 → スコア %d', (gameOver, expected) => {
    expect(accumulateScore(100, event(20000, 'sales'), gameOver)).toBe(expected);
  });

  it('gameOver=false の最後の売上は加算され、gameOver=true になった後の売上は加算されない', () => {
    const last = accumulateScore(100, event(20000, 'sales'), false);
    const after = accumulateScore(last, event(20000, 'sales'), true);
    expect(last).toBe(20100);
    expect(after).toBe(20100);
  });

  it('リトライ後は INITIAL_SCORE から始まる', () => {
    const beforeRetry = accumulateScore(INITIAL_SCORE, event(20000, 'sales'), false);
    expect(beforeRetry).toBe(20000);
    const afterRetry = accumulateScore(INITIAL_SCORE, event(20000, 'sales'), false);
    expect(afterRetry).toBe(20000);
  });
});

describe('accumulateScore: 入力を変更しない', () => {
  it('event を変更しない', () => {
    const input = event(20000, 'sales');
    const snapshot = { ...input };
    accumulateScore(0, input, false);
    expect(input).toEqual(snapshot);
  });
});

describe('formatScore', () => {
  it.each([
    [0, 'スコア: 0円'],
    [1, 'スコア: 1円'],
    [999, 'スコア: 999円'],
    [1000, 'スコア: 1,000円'],
    [20000, 'スコア: 20,000円'],
    [999999, 'スコア: 999,999円'],
    [1000000, 'スコア: 1,000,000円'],
  ])('formatScore(%d) = %s', (score, expected) => {
    expect(formatScore(score)).toBe(expected);
  });
});
