// 配置判定(#151)で使う矩形・円・線分の純粋な幾何関数。Phaser には依存しない（テスト可能にするため）。
import type { Point } from './route';

// 左上 (x, y) と幅・高さで表す矩形（ピクセル）。config.ts の INITIAL_PLACEMENT_UI_BOUNDS / ITEM_BLOCKED_RECTS の各要素と同じ形。
export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

// 2つの矩形が面積を持って重なるか。辺や角が接するだけ（共有する面積が 0）なら重ならない（hudLayout.test.ts の intersects と同じ規約）。
export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// inner が outer に完全に含まれるか。辺が一致してもよい。
export const rectWithin = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

// 点が矩形の内側にあるか。左端・上端は含み、右端・下端は含まない（pointToCell と同じく、境界ちょうどは次のセル側）。
export const pointInRect = (point: Point, rect: Rect): boolean =>
  point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height;

// 矩形と円が面積を持って重なるか。矩形の中で円の中心に最も近い点までの距離が半径未満なら重なる（ちょうど接するだけなら重ならない）。
export const rectIntersectsCircle = (rect: Rect, center: Point, radius: number): boolean => {
  const nearestX = Math.min(Math.max(center.x, rect.x), rect.x + rect.width);
  const nearestY = Math.min(Math.max(center.y, rect.y), rect.y + rect.height);
  return Math.hypot(nearestX - center.x, nearestY - center.y) < radius;
};

// 矩形と、水平または垂直な線分を clearance だけ四方に広げた帯（矩形）が面積を持って重なるか。
// 線分からの距離が clearance 未満なら重なり、ちょうど clearance（辺の接触）なら重ならない。
// ルートの区間は水平か垂直なので帯を矩形で表せる。斜めの線分はエラーにする。
export const rectIntersectsThickSegment = (rect: Rect, from: Point, to: Point, clearance: number): boolean => {
  if (from.x !== to.x && from.y !== to.y) {
    throw new Error(`斜めの線分は判定できません: (${from.x}, ${from.y})-(${to.x}, ${to.y})`);
  }
  const band: Rect = {
    x: Math.min(from.x, to.x) - clearance,
    y: Math.min(from.y, to.y) - clearance,
    width: Math.abs(to.x - from.x) + clearance * 2,
    height: Math.abs(to.y - from.y) + clearance * 2,
  };
  return rectsOverlap(rect, band);
};
