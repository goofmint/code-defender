import { describe, expect, it } from 'vitest';
import { ITEM_PAGE_SIZE } from './config';
import { ITEM_TYPES } from './item';
import {
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
