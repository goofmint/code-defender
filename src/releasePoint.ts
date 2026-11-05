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
  // 仮・要確認(#151): ラベルの行高さの見積もり（フォントpx に対する比率。縁取りを含めた余裕）。配置判定で使う RELEASE_POINT_LABEL_BOUNDS の高さに使う。
  labelLineHeightRatio: 1.25,
} as const;

// 「リリース」のラベルが占める範囲(#151)。render.ts の drawReleasePoint と同じ位置（円の上端から labelGap 上に下端を置き、中央揃え）。
// 幅は全角相当（1文字 = フォントpx）、高さはフォントpx × labelLineHeightRatio で過大に見積もる（hudLayout.test.ts の textRect と同じ見積もり）。
// ラベルは円（パルスの最大半径 RELEASE_POINT_PULSE.maxRadius）の外に出るので、配置判定ではこの矩形も置けない範囲にする。
const RELEASE_POINT_LABEL_FONT_PX = parseInt(RELEASE_POINT_STYLE.labelFontSize, 10);
const RELEASE_POINT_LABEL_WIDTH = RELEASE_POINT_STYLE.label.length * RELEASE_POINT_LABEL_FONT_PX;
const RELEASE_POINT_LABEL_HEIGHT = RELEASE_POINT_LABEL_FONT_PX * RELEASE_POINT_STYLE.labelLineHeightRatio;
export const RELEASE_POINT_LABEL_BOUNDS = {
  x: RELEASE_POINT_CENTER.x - RELEASE_POINT_LABEL_WIDTH / 2,
  y: RELEASE_POINT_CENTER.y - RELEASE_POINT_STYLE.radius - RELEASE_POINT_STYLE.labelGap - RELEASE_POINT_LABEL_HEIGHT,
  width: RELEASE_POINT_LABEL_WIDTH,
  height: RELEASE_POINT_LABEL_HEIGHT,
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
