import { describe, expect, it } from 'vitest';
import { ITEM_PAGE_SIZE } from './config';
import { ITEM_TYPES, unlockedItemTypes } from './item';
import {
  clampItemPage,
  formatItemPage,
  getItemOnPageSlot,
  getItemPageCount,
  getItemsOnPage,
  stepItemPage,
} from './itemBar';

describe('getItemPageCount: ページ数', () => {
  it.each([
    [0, 1],
    [1, 1],
    [6, 1],
    [7, 2],
    [12, 2],
    [13, 3],
    [18, 3],
  ])('%i 個 → %i ページ（1ページ6枠）', (count, pages) => {
    expect(getItemPageCount(count, 6)).toBe(pages);
  });

  it.each([0, -1, 1.5, NaN])('枠数 %s は例外', (pageSize) => {
    expect(() => getItemPageCount(6, pageSize)).toThrow();
  });
});

describe('getItemsOnPage / getItemOnPageSlot', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('先頭から枠数ずつ区切る。最後のページは余りだけ', () => {
    expect(getItemsOnPage(items, 0, 2)).toEqual(['a', 'b']);
    expect(getItemsOnPage(items, 2, 2)).toEqual(['e']);
    expect(getItemsOnPage(items, 3, 2)).toEqual([]);
  });

  it('枠のアイテム。空の枠・範囲外の枠は undefined', () => {
    expect(getItemOnPageSlot(items, 1, 1, 2)).toBe('d');
    expect(getItemOnPageSlot(items, 2, 1, 2)).toBeUndefined();
    expect(getItemOnPageSlot(items, 0, 2, 2)).toBeUndefined();
    expect(getItemOnPageSlot(items, 0, -1, 2)).toBeUndefined();
  });

  it('18アイテムは3ページで、すべてのアイテムがちょうど1回ずつ現れる', () => {
    const pages = getItemPageCount(ITEM_TYPES.length);
    const shown = Array.from({ length: pages }, (_, page) =>
      Array.from({ length: ITEM_PAGE_SIZE }, (_, slot) => getItemOnPageSlot(ITEM_TYPES, page, slot)),
    ).flat();
    expect(shown).toEqual([...ITEM_TYPES]);
  });

  it('入力を変更しない', () => {
    const input = [...items];
    getItemsOnPage(input, 0, 2);
    expect(input).toEqual(items);
  });
});

describe('stepItemPage / formatItemPage', () => {
  it.each([
    [0, 'next', 1],
    [1, 'next', 2],
    [2, 'next', 0],
    [0, 'previous', 2],
    [2, 'previous', 1],
  ] as const)('%i ページ目から %s → %i（3ページで回り込む）', (page, direction, expected) => {
    expect(stepItemPage(page, direction, 3)).toBe(expected);
  });

  it('1ページだけなら動かない', () => {
    expect(stepItemPage(0, 'next', 1)).toBe(0);
    expect(stepItemPage(0, 'previous', 1)).toBe(0);
  });

  it('表示は 1 始まり', () => {
    expect(formatItemPage(0, 3)).toBe('1/3');
    expect(formatItemPage(2, 3)).toBe('3/3');
  });
});

describe('clampItemPage: 一覧が変わったときのページ(#164)', () => {
  it.each([
    [0, 1, 0],
    [0, 3, 0],
    [2, 3, 2],
    [3, 3, 2],
    [5, 3, 2],
    [-1, 3, 0],
  ])('ページ %i・%i ページ → %i', (page, pageCount, expected) => {
    expect(clampItemPage(page, pageCount)).toBe(expected);
  });
});

describe('解放済みのアイテムの一覧のページ(#164)', () => {
  it.each([
    [1, 3, 1],
    [2, 4, 1],
    [4, 6, 1],
    [5, 7, 2],
    [10, 12, 2],
    [11, 13, 3],
    [16, 18, 3],
    [17, 18, 3],
  ])('Lv.%i は %i 種類で %i ページ', (level, count, pages) => {
    expect(unlockedItemTypes(level)).toHaveLength(count);
    expect(getItemPageCount(unlockedItemTypes(level).length)).toBe(pages);
  });

  it('Lv.1 は1ページ目の3枠だけで、4〜6枠目は空', () => {
    const items = unlockedItemTypes(1);
    expect(getItemsOnPage(items, 0)).toEqual(['codeRabbit', 'linter', 'testTool']);
    expect(getItemOnPageSlot(items, 0, 2)).toBe('testTool');
    expect(getItemOnPageSlot(items, 0, 3)).toBeUndefined();
    expect(getItemOnPageSlot(items, 0, ITEM_PAGE_SIZE - 1)).toBeUndefined();
  });

  it('Lv.5 は2ページ目に1枠（猫）だけ', () => {
    const items = unlockedItemTypes(5);
    expect(getItemsOnPage(items, 1)).toEqual(['cat']);
    expect(getItemOnPageSlot(items, 1, 1)).toBeUndefined();
  });

  it('一覧が増えても今のページは残る（Lv.5 の2ページ目 → Lv.11 でも2ページ目）', () => {
    const before = getItemPageCount(unlockedItemTypes(5).length);
    const after = getItemPageCount(unlockedItemTypes(11).length);
    expect(clampItemPage(1, before)).toBe(1);
    expect(clampItemPage(1, after)).toBe(1);
  });

  it('一覧が減ったときは最後のページに寄せる（全解放の3ページ目 → Lv.1 では1ページ目）', () => {
    expect(clampItemPage(2, getItemPageCount(unlockedItemTypes(1).length))).toBe(0);
  });

  it('Lv.1 のページ切替は1ページの中で回り込む', () => {
    const pageCount = getItemPageCount(unlockedItemTypes(1).length);
    expect(stepItemPage(0, 'next', pageCount)).toBe(0);
    expect(stepItemPage(0, 'previous', pageCount)).toBe(0);
    expect(formatItemPage(0, pageCount)).toBe('1/1');
  });
});
