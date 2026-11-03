// ルートの純粋ロジック。Phaser には依存しない（テスト可能にするため）。
import {
  ENGINEER_SPAWN_COL,
  FIELD_ROWS,
  MAX_ENGINEER_ROUTES,
  RELEASE_POINT_CELL,
  ROUTE_TURN_COL,
} from './config';
import { CELL_SIZE } from './field';

export type GridCell = { readonly col: number; readonly row: number };
export type Point = { readonly x: number; readonly y: number };

// id はエンジニア（出現場所）との対応に使う。初期は出現セル配列のインデックス、追加分は既存の最大 id + 1。
export type Route = {
  readonly id: number;
  readonly spawn: GridCell;
  // 出現セルからリリースセルまでの折れ点（セル座標）。連続する点は水平または垂直に並ぶ。
  readonly waypoints: readonly GridCell[];
};

const isSameCell = (a: GridCell, b: GridCell): boolean =>
  a.col === b.col && a.row === b.row;

// 出現行を横に進み、曲がり列で縦に進み、リリース行を横に進む。同じ入力から常に同じルートを返す。
export const createRoute = (
  id: number,
  spawn: GridCell,
  release: GridCell,
): Route => {
  const corners: GridCell[] = [
    spawn,
    { col: ROUTE_TURN_COL, row: spawn.row },
    { col: ROUTE_TURN_COL, row: release.row },
    release,
  ];
  const distinct = corners.filter(
    (cell, i) => i === 0 || !isSameCell(cell, corners[i - 1]),
  );
  // 一直線上の中間点は曲がらないので除く（出現行とリリース行が同じなら直線になる）。
  const waypoints = distinct.filter((cell, i) => {
    if (i === 0 || i === distinct.length - 1) return true;
    const prev = distinct[i - 1];
    const next = distinct[i + 1];
    const straight =
      (prev.col === cell.col && cell.col === next.col) ||
      (prev.row === cell.row && cell.row === next.row);
    return !straight;
  });
  return { id, spawn, waypoints };
};

export const createRoutes = (spawns: readonly GridCell[]): Route[] =>
  spawns.map((spawn, i) => createRoute(i, spawn, RELEASE_POINT_CELL));

// 追加する出現セルを決める。ENGINEER_SPAWN_COL 列を上の行から調べ、使用中でもリリース地点でもない最初のセルを返す。
export const nextSpawnCell = (
  usedSpawns: readonly GridCell[],
): GridCell | undefined => {
  for (let row = 0; row < FIELD_ROWS; row++) {
    const cell: GridCell = { col: ENGINEER_SPAWN_COL, row };
    const used = usedSpawns.some((spawn) => isSameCell(spawn, cell));
    if (!used && !isSameCell(cell, RELEASE_POINT_CELL)) return cell;
  }
  return undefined;
};

// エンジニアが増えたときの新しいルートを返す。入力は変更しない。上限または空きなしなら undefined。
// id は既存の最大 id + 1（空なら 0）。将来ルートが消えても id が重複しない。
export const addRoute = (routes: readonly Route[]): Route | undefined => {
  if (routes.length >= MAX_ENGINEER_ROUTES) return undefined;
  const spawn = nextSpawnCell(routes.map((route) => route.spawn));
  if (spawn === undefined) return undefined;
  const id = routes.reduce((max, route) => Math.max(max, route.id), -1) + 1;
  return createRoute(id, spawn, RELEASE_POINT_CELL);
};

export const cellCenter = (cell: GridCell): Point => ({
  x: (cell.col + 0.5) * CELL_SIZE,
  y: (cell.row + 0.5) * CELL_SIZE,
});

// コードの移動などで使うピクセル座標の折れ線。
export const routePixelPoints = (route: Route): Point[] =>
  route.waypoints.map(cellCenter);

// 仮: 見た目の値。企画書には未記載。
export const ROUTE_STYLE = {
  color: 0x5b8def,
  width: 4,
  alpha: 0.6,
} as const;

// 仮: 出現場所マーカーの見た目。大きさは CELL_SIZE に収める。
export const SPAWN_MARKER_STYLE = {
  radius: 16,
  fillColor: 0xf5a623,
  strokeColor: 0xffffff,
  strokeWidth: 2,
} as const;
