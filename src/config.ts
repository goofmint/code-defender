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
// これは初期値で、実行時には変更しない。追加分は route.ts の addRoute が返す。
export const ENGINEER_SPAWN_CELLS = [
  { col: 0, row: 1 },
  { col: 0, row: 4 },
  { col: 0, row: 7 },
] as const;

// 仮・要確認: エンジニア追加時に出現場所を置く列。企画書に位置の記載なし。
export const ENGINEER_SPAWN_COL = 0;

// 仮・要確認: 出現場所（＝ルート）の上限数。企画書に上限の記載なし。
// ENGINEER_SPAWN_COL の列に重ならず置ける数（行数）を上限にしている。
export const MAX_ENGINEER_ROUTES = FIELD_ROWS;

// 仮・要確認: ルートが縦方向に曲がる列。企画書にはルートの形状の記載なし。
export const ROUTE_TURN_COL = FIELD_COLS - 3;
