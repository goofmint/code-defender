import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from './i18n';
import { GAME_OVER_RESTART_DELAY_MS, INITIAL_FUNDS } from './config';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';
import {
  buildGameOverLines,
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

describe('buildGameOverLines（行の文言）', () => {
  it.each([
    [0, 'スコア: 0円'],
    [1, 'スコア: 1円'],
    [999, 'スコア: 999円'],
    [1000, 'スコア: 1,000円'],
    [Number.MAX_SAFE_INTEGER, 'スコア: 9,007,199,254,740,991円'],
  ])('スコア %i → %s', (score, expected) => {
    expect(buildGameOverLines(score, 0)[1].text).toBe(expected);
  });

  it.each([
    [0, '経過日数: 0日'],
    [1, '経過日数: 1日'],
    [123456, '経過日数: 123456日'],
  ])('経過日数 %i → %s', (days, expected) => {
    expect(buildGameOverLines(0, days)[2].text).toBe(expected);
  });

  it('タイトル→スコア→経過日数→案内の順で並ぶ', () => {
    const lines = buildGameOverLines(20000, 12);
    expect(lines.map((line) => line.text)).toEqual([
      '倒産しました',
      'スコア: 20,000円',
      '経過日数: 12日',
      'タップ / クリック / Enter でもう一度',
    ]);
  });
});

describe('buildGameOverLines（レイアウト）', () => {
  const worstCase = buildGameOverLines(Number.MAX_SAFE_INTEGER, 999999);
  // 全角相当（文字数×文字サイズ）に過大見積もりした幅、高さは文字サイズの1.25倍。
  const rectOf = (line: { text: string; fontSize: number; y: number }) => {
    const halfWidth = (line.text.length * line.fontSize) / 2;
    const halfHeight = (line.fontSize * 1.25) / 2;
    return {
      left: FIELD_WIDTH / 2 - halfWidth,
      right: FIELD_WIDTH / 2 + halfWidth,
      top: line.y - halfHeight,
      bottom: line.y + halfHeight,
    };
  };

  it.each(worstCase.map((line, index) => [index, line] as const))(
    '行%i は画面内に収まる',
    (_index, line) => {
      const rect = rectOf(line);
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(FIELD_WIDTH);
      expect(rect.top).toBeGreaterThanOrEqual(0);
      expect(rect.bottom).toBeLessThanOrEqual(FIELD_HEIGHT);
    },
  );

  it.each([0, 1, 2])('行%i と次の行は縦に重ならない', (index) => {
    expect(rectOf(worstCase[index]).bottom).toBeLessThanOrEqual(rectOf(worstCase[index + 1]).top);
  });
});

describe('buildGameOverLines（英語 #158）', () => {
  beforeEach(() => {
    setLocale('en');
  });
  afterEach(() => {
    setLocale('ja');
  });

  it('タイトル→スコア→経過日数→案内の4行を英語で並べる', () => {
    expect(buildGameOverLines(20000, 12).map((line) => line.text)).toEqual([
      'You went bankrupt',
      'Score: ¥20,000',
      'Days elapsed: 12',
      'Tap / Click / Enter to play again',
    ]);
  });

  it.each([
    [0, 'Score: ¥0'],
    [999, 'Score: ¥999'],
    [1000, 'Score: ¥1,000'],
    [Number.MAX_SAFE_INTEGER, 'Score: ¥9,007,199,254,740,991'],
  ])('スコア %i → %s', (score, expected) => {
    expect(buildGameOverLines(score, 0)[1].text).toBe(expected);
  });

  it.each([
    [0, 'Days elapsed: 0'],
    [1, 'Days elapsed: 1'],
    [123456, 'Days elapsed: 123456'],
  ])('経過日数 %i → %s', (days, expected) => {
    expect(buildGameOverLines(0, days)[2].text).toBe(expected);
  });

  it('最長の行も画面内に収まり、隣の行と縦に重ならない（全角相当の過大見積もり）', () => {
    const lines = buildGameOverLines(Number.MAX_SAFE_INTEGER, 999999);
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      expect(line.text.length * line.fontSize).toBeLessThanOrEqual(FIELD_WIDTH);
    }
    for (let index = 0; index < lines.length - 1; index++) {
      const bottom = lines[index].y + (lines[index].fontSize * 1.25) / 2;
      const nextTop = lines[index + 1].y - (lines[index + 1].fontSize * 1.25) / 2;
      expect(bottom).toBeLessThanOrEqual(nextTop);
    }
  });
});
