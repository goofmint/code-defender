// ゲーム設定の仮の値を一か所に集める。後続のゲームバランス用の値もここに追加する。

// 仮: セルサイズ・列数・行数は CodeRabbit 実装計画(#2)の値。企画書には未記載。
export const CELL_SIZE = 60;
export const FIELD_COLS = 16;
export const FIELD_ROWS = 9;

// 仮・要確認: リリース地点のセル位置。右端の列・縦中央の行。企画書には位置の記載なし。
export const RELEASE_POINT_CELL = {
  col: FIELD_COLS - 1,
  row: Math.floor(FIELD_ROWS / 2),
} as const;

// 仮・要確認: エンジニアの出現セル。企画書には「出現場所の数は雇用したエンジニア数と同じ」とだけあり、
// 位置と初期の数（ここでは3か所）は未記載。ルートの本数はこの配列の長さと同じになる。
export const ENGINEER_SPAWN_CELLS = [
  { col: 0, row: 1 },
  { col: 0, row: 4 },
  { col: 0, row: 7 },
] as const;

// 仮・要確認: ルートが縦方向に曲がる列。企画書にはルートの形状の記載なし。
export const ROUTE_TURN_COL = FIELD_COLS - 3;

// 仮: 主人公のサイズ比率（セルに対する割合）。企画書には未記載。
export const PLAYER_SIZE_RATIO = 0.7;
// 仮: 主人公の初期位置のセル。フィールド中央のセルとする。
export const PLAYER_START_COL = Math.floor(FIELD_COLS / 2);
export const PLAYER_START_ROW = Math.floor(FIELD_ROWS / 2);
// 仮: 主人公の配色（肌・髪・服・ノートPC）。
export const PLAYER_COLORS = {
  skin: 0xf2c9a0,
  hair: 0x3b2a20,
  body: 0x3d7be0,
  laptop: 0xc8d0e0,
} as const;

// 仮: 主人公の移動速度（ピクセル/秒）。240 = 4セル/秒。後続のアイテム効果（速度倍率）の基準値。企画書には数値の記載なし。
export const PLAYER_SPEED = 240;
// 仮: 移動に使うキー。Phaser の KeyCodes のキー名（矢印キー + WASD）。企画書にはキー割り当ての記載なし。
export const PLAYER_MOVE_KEYS = {
  left: ['LEFT', 'A'],
  right: ['RIGHT', 'D'],
  up: ['UP', 'W'],
  down: ['DOWN', 'S'],
} as const;
// 仮: タッチ/マウス操作で、目標との距離がこの値（ピクセル）以内なら止まる（震え防止）。企画書には未記載。
export const PLAYER_POINTER_DEAD_ZONE = 4;
