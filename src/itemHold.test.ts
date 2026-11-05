import { describe, expect, it } from 'vitest';
import { TEST_TOOL_HOLD_MS } from './config';
import { ITEM_TYPES } from './item';
import { advanceHold, applyHold, getItemHoldMs } from './itemHold';

const HOLD = TEST_TOOL_HOLD_MS;

describe('getItemHoldMs（種別ごとの足止め時間 #54）', () => {
  it('設定値は正の値', () => {
    expect(HOLD).toBeGreaterThan(0);
  });

  it.each(ITEM_TYPES.filter((type) => type !== 'testTool'))('%s は足止めしない（0）', (itemType) => {
    expect(getItemHoldMs(itemType)).toBe(0);
  });

  it('testTool は設定値の時間だけ足止めする', () => {
    expect(getItemHoldMs('testTool')).toBe(HOLD);
  });

  it('全種別のうち正の値を返すのは testTool だけ', () => {
    expect(ITEM_TYPES.filter((type) => getItemHoldMs(type) > 0)).toEqual(['testTool']);
  });

  it.each([1, 250, 1000])('注入した設定値 %d をそのまま返す', (holdMs) => {
    expect(getItemHoldMs('testTool', holdMs)).toBe(holdMs);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    '不正な設定値 %d は 0 として扱う',
    (holdMs) => {
      expect(getItemHoldMs('testTool', holdMs)).toBe(0);
    },
  );

  it('注入した設定値は他の種別には影響しない', () => {
    expect(getItemHoldMs('linter', 1000)).toBe(0);
  });
});

describe('applyHold（足止めの再適用・境界値）', () => {
  it.each([
    ['残り 0', 0, HOLD],
    ['残り 持続時間 − 1', HOLD - 1, HOLD],
    ['残り 持続時間ちょうど', HOLD, HOLD],
    ['残り 持続時間 + 1', HOLD + 1, HOLD + 1],
  ])('%s に持続時間を付け直すと %d → 長い方 %d が残る', (_name, current, expected) => {
    expect(applyHold(current, HOLD)).toBe(expected);
  });

  it('重ね掛けしても加算しない', () => {
    expect(applyHold(applyHold(0, HOLD), HOLD)).toBe(HOLD);
  });

  it('持続時間 0 では残り時間は変わらない', () => {
    expect(applyHold(HOLD - 1, 0)).toBe(HOLD - 1);
    expect(applyHold(0, 0)).toBe(0);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('不正な残り時間 %d は 0 として扱う', (current) => {
    expect(applyHold(current, HOLD)).toBe(HOLD);
  });
});

describe('advanceHold（1フレーム分の足止め・境界値）', () => {
  const DELTA = 16;

  it.each([
    ['残り = delta − 1', DELTA - 1, DELTA, 0, 1],
    ['残り = delta ちょうど', DELTA, DELTA, 0, 0],
    ['残り = delta + 1', DELTA + 1, DELTA, 1, 0],
    ['残り 0（足止めなし）', 0, DELTA, 0, DELTA],
    ['delta 0', HOLD, 0, HOLD, 0],
    ['大きな delta', HOLD, HOLD * 10, 0, HOLD * 9],
  ])('%s: 残り %d・delta %d → 残り %d・移動できる時間 %d', (_name, remaining, delta, remainingMs, movableMs) => {
    expect(advanceHold(remaining, delta)).toEqual({ remainingMs, movableMs });
  });

  it('残り時間と移動できる時間の合計は、足止めが切れるフレームで delta に一致する', () => {
    const step = advanceHold(DELTA - 1, DELTA);
    expect(DELTA - 1 + step.movableMs).toBe(DELTA);
  });

  it.each([-1, Number.NaN])('不正な delta %d では進めない', (delta) => {
    expect(advanceHold(HOLD, delta)).toEqual({ remainingMs: HOLD, movableMs: 0 });
  });
});
