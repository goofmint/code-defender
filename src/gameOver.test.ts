import { describe, expect, it } from 'vitest';
import { GAME_OVER_RESTART_DELAY_MS, INITIAL_FUNDS } from './config';
import {
  canRestart,
  checkBankruptcy,
  createGameOverEvent,
  GAME_OVER_EVENT,
  INITIAL_GAME_OVER_STATE,
  isBankrupt,
} from './gameOver';
import type { GameOverState } from './gameOver';
import { settleMonthlySalary } from './salary';

describe('isBankrupt（0 を含む）', () => {
  it.each([
    [1, false],
    [0.01, false],
    [0, true],
    [-0.01, true],
    [-1, true],
    [NaN, true],
    [-Infinity, true],
    [Infinity, false],
    [INITIAL_FUNDS, false],
  ])('%s → %s', (funds, expected) => {
    expect(isBankrupt(funds, true)).toBe(expected);
  });
});

describe('isBankrupt（0 を含まない）', () => {
  it.each([
    [1, false],
    [0, false],
    [-0.01, true],
    [-1, true],
    [NaN, true],
    [-Infinity, true],
    [Infinity, false],
  ])('%s → %s', (funds, expected) => {
    expect(isBankrupt(funds, false)).toBe(expected);
  });
});

describe('checkBankruptcy', () => {
  it('1 円では発火しない', () => {
    const result = checkBankruptcy(INITIAL_GAME_OVER_STATE, 1, 100);
    expect(result.triggered).toBe(false);
    expect(result.state).toBe(INITIAL_GAME_OVER_STATE);
  });

  it('0 円で発火する', () => {
    expect(checkBankruptcy(INITIAL_GAME_OVER_STATE, 0, 100)).toEqual({
      state: { over: true, at: 100 },
      triggered: true,
    });
  });

  it('-1 円で発火する', () => {
    expect(checkBankruptcy(INITIAL_GAME_OVER_STATE, -1, 200)).toEqual({
      state: { over: true, at: 200 },
      triggered: true,
    });
  });

  it('1 回の大きな変化で大きくマイナスになっても 1 回だけ発火する', () => {
    const first = checkBankruptcy(INITIAL_GAME_OVER_STATE, -10000000, 300);
    expect(first.triggered).toBe(true);
    const second = checkBankruptcy(first.state, -10000000, 301);
    expect(second.triggered).toBe(false);
  });

  it('0 を含まない設定では 0 円で発火しない', () => {
    expect(checkBankruptcy(INITIAL_GAME_OVER_STATE, 0, 100, false).triggered).toBe(false);
    expect(checkBankruptcy(INITIAL_GAME_OVER_STATE, -1, 100, false).triggered).toBe(true);
  });
});

describe('冪等性', () => {
  const over: GameOverState = { over: true, at: 500 };
  it.each([-2000000, 0, 5000000])('発火後に資金が %s になっても state も at も変わらない', (funds) => {
    const result = checkBankruptcy(over, funds, 999);
    expect(result.triggered).toBe(false);
    expect(result.state).toBe(over);
    expect(result.state.at).toBe(500);
  });
});

describe('canRestart', () => {
  const at = 1000;
  const over: GameOverState = { over: true, at };
  it('未ゲームオーバーなら false', () => {
    expect(canRestart(INITIAL_GAME_OVER_STATE, at + GAME_OVER_RESTART_DELAY_MS * 10)).toBe(false);
  });
  it('待ち時間の 1ms 前は false', () => {
    expect(canRestart(over, at + GAME_OVER_RESTART_DELAY_MS - 1)).toBe(false);
  });
  it('待ち時間ちょうどは true', () => {
    expect(canRestart(over, at + GAME_OVER_RESTART_DELAY_MS)).toBe(true);
  });
  it('待ち時間の 1ms 後は true', () => {
    expect(canRestart(over, at + GAME_OVER_RESTART_DELAY_MS + 1)).toBe(true);
  });
});

describe('settleMonthlySalary と checkBankruptcy の組み合わせ（純粋関数のみ。シーンの購読はブラウザで確認）', () => {
  it('初期資金 1,000,000・3 人（月 900,000）なら 2 か月目に倒産する', () => {
    const salaries = [300000, 300000, 300000];
    const month1 = settleMonthlySalary(INITIAL_FUNDS, 1, salaries);
    expect(month1.fundsAfter).toBe(100000);
    expect(checkBankruptcy(INITIAL_GAME_OVER_STATE, month1.fundsAfter, 1).triggered).toBe(false);
    const month2 = settleMonthlySalary(month1.fundsAfter, 2, salaries);
    expect(month2.fundsAfter).toBe(-800000);
    expect(checkBankruptcy(INITIAL_GAME_OVER_STATE, month2.fundsAfter, 2).triggered).toBe(true);
  });
});

describe('createGameOverEvent', () => {
  it('payload を返す', () => {
    expect(GAME_OVER_EVENT).toBe('game-over');
    expect(createGameOverEvent('bankruptcy', -800000, 120000)).toEqual({
      reason: 'bankruptcy',
      funds: -800000,
      elapsedMs: 120000,
    });
  });
});
