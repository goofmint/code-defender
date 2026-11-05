// リリース地点の純粋ロジック。Phaser には依存しない（テスト可能にするため）。
import { RELEASE_POINT_CELL } from './config';
import { CELL_SIZE } from './field';
import type { Point } from './route';

// セル位置から中心座標を算出する。座標はここでは重複定義しない。
export const RELEASE_POINT_CENTER = {
  x: (RELEASE_POINT_CELL.col + 0.5) * CELL_SIZE,
  y: (RELEASE_POINT_CELL.row + 0.5) * CELL_SIZE,
} as const;

// 仮: 見た目の値（半径・色・ラベル）。企画書には未記載。
export const RELEASE_POINT_STYLE = {
  radius: 24,
  fillColor: 0x2ecc71,
  strokeColor: 0xffffff,
  strokeWidth: 2,
  label: 'リリース',
  labelFontSize: '14px',
  labelFontFamily: 'system-ui, sans-serif',
  labelColor: '#ffffff',
  // 円の上端からラベル下端までの間隔(px)。
  labelGap: 4,
} as const;

// 正常リリース時のエフェクト(#144)で粒を飛ばす先（中心からの相対座標）。真上から時計回りに等間隔で count 個並べる。
// count が正の整数でない・distance が負または数値でないときはエラーにする。
export const burstParticleOffsets = (count: number, distance: number): Point[] => {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`粒の数は正の整数にしてください: ${count}`);
  }
  if (!(distance >= 0)) {
    throw new Error(`粒の飛ぶ距離は 0 以上にしてください: ${distance}`);
  }
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  });
};
