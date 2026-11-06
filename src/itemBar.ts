// アイテムの購入枠のページ切替(#58)。Phaser には依存しない（テスト可能にするため）。
// #156 で下端の購入バーを右上のアイテムのメニューに移した。枠とページ行の配置は floatingMenu.ts（メニュー共通の縦の並び）で求める。
import { ITEM_PAGE_SIZE } from './config';

export type ItemPageDirection = 'previous' | 'next';

// ページ数。アイテムが 0 個でも 1 ページ（空のページ）とする。pageSize が 1 未満・整数でないときは例外にする。
export const getItemPageCount = (itemCount: number, pageSize: number = ITEM_PAGE_SIZE): number => {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error(`ページの枠数が不正です: ${pageSize}`);
  return Math.max(1, Math.ceil(itemCount / pageSize));
};

// そのページに並ぶアイテム（先頭から pageSize 個ずつ）。最後のページは pageSize 個未満のことがある。入力は変更しない。
export const getItemsOnPage = <T>(items: readonly T[], page: number, pageSize: number = ITEM_PAGE_SIZE): T[] =>
  items.slice(page * pageSize, (page + 1) * pageSize);

// ページ内の枠 slot のアイテム。枠が空（最後のページの余り・範囲外）なら undefined。
export const getItemOnPageSlot = <T>(
  items: readonly T[],
  page: number,
  slot: number,
  pageSize: number = ITEM_PAGE_SIZE,
): T | undefined => (slot >= 0 && slot < pageSize ? items[page * pageSize + slot] : undefined);

// 前・次のページ。端では反対側の端へ回り込む。
export const stepItemPage = (page: number, direction: ItemPageDirection, pageCount: number): number => {
  const step = direction === 'next' ? 1 : -1;
  return (((page + step) % pageCount) + pageCount) % pageCount;
};

// ページ表示の文言。「1/3」。page は 0 始まり。
export const formatItemPage = (page: number, pageCount: number): string => `${page + 1}/${pageCount}`;

// ページを 0〜pageCount−1 に収める(#164)。解放済みのアイテムの一覧が変わったときに、今のページがまだあればそのまま、なければ最後のページにする。
export const clampItemPage = (page: number, pageCount: number): number => Math.min(Math.max(0, page), pageCount - 1);
