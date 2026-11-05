// アイテム購入バーのページ切替(#58)とボタンの配置。Phaser には依存しない（テスト可能にするため）。
// render.ts の drawItemButtons と hudLayout.test.ts が同じ配置の計算を使う。
import { ITEM_BUTTON_SIZE, ITEM_PAGE_SIZE, ITEM_PAGE_UI_SIZE, ITEM_UI_POSITION } from './config';

export type ItemPageDirection = 'previous' | 'next';

export type ItemBarRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

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

// ページ内の枠 slot の購入ボタンの矩形。
export const itemButtonRect = (slot: number): ItemBarRect => ({
  x: ITEM_UI_POSITION.x + slot * (ITEM_BUTTON_SIZE.width + ITEM_BUTTON_SIZE.gap),
  y: ITEM_UI_POSITION.y,
  width: ITEM_BUTTON_SIZE.width,
  height: ITEM_BUTTON_SIZE.height,
});

// ページ切替UIの矩形。最後の枠の右に [前のページ][ページ表示][次のページ] を並べる。
export const itemPageControlRects = (
  pageSize: number = ITEM_PAGE_SIZE,
): { readonly previous: ItemBarRect; readonly label: ItemBarRect; readonly next: ItemBarRect } => {
  const { width, gap } = ITEM_PAGE_UI_SIZE;
  const lastSlot = itemButtonRect(pageSize - 1);
  const startX = lastSlot.x + lastSlot.width + ITEM_BUTTON_SIZE.gap;
  const rectAt = (index: number): ItemBarRect => ({
    x: startX + index * (width + gap),
    y: ITEM_UI_POSITION.y,
    width,
    height: ITEM_BUTTON_SIZE.height,
  });
  return { previous: rectAt(0), label: rectAt(1), next: rectAt(2) };
};
