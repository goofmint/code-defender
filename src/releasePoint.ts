// リリース地点の純粋ロジック。Phaser には依存しない（テスト可能にするため）。
import { RELEASE_POINT_CELL } from './config';
import { CELL_SIZE } from './field';

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
