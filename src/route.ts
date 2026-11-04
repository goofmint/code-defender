// ルートの純粋ロジック。Phaser には依存しない（テスト可能にするため）。
import {
  ENGINEER_SPAWN_COL,
  FIELD_ROWS,
  MAX_ENGINEER_ROUTES,
  PLAYER_START_COL,
  PLAYER_START_ROW,
  RELEASE_POINT_CELL,
  ROUTE_TURN_COL_MAX,
  ROUTE_TURN_COL_MIN,
  ROUTE_TURN_COUNT_MAX,
  ROUTE_TURN_COUNT_MIN,
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

const range = (min: number, max: number): number[] =>
  Array.from({ length: max - min + 1 }, (_, i) => min + i);

// 0 以上 count 未満の整数。random() が 1 に近くても範囲外にならないよう上限で止める。
const randomInt = (random: () => number, count: number): number =>
  Math.min(count - 1, Math.floor(random() * count));

const pickOne = (random: () => number, items: readonly number[]): number =>
  items[randomInt(random, items.length)];

const pickDistinct = (
  random: () => number,
  items: readonly number[],
  count: number,
): number[] => {
  const rest = [...items];
  const picked: number[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(...rest.splice(randomInt(random, rest.length), 1));
  }
  return picked;
};

// 左から右へ単調に進む曲がりくねったルートを random で作る。random は 0 以上 1 未満の値を返す関数（注入）。
// 曲がり列 c1<…<ck（k は ROUTE_TURN_COUNT の範囲）と、中間行 r1…r(k-1) を選ぶ。
// 点列: 出現セル → (c1, 出現行) → (c1, r1) → (c2, r1) → … → (ck, r(k-1)) → (ck, リリース行) → リリースセル。
// 仮・要確認: 主人公の初期セルを通らないよう、リトライではなく次の規則で構造的に保証する。
//  - 曲がり列に PLAYER_START_COL を使わない（縦区間が主人公の列を通らない）
//  - 中間行に PLAYER_START_ROW を使わない（主人公の列をまたぐ水平区間が主人公の行にならない）
//  - 最後の曲がり列 ck は PLAYER_START_COL より右（最後の水平区間はリリース行＝主人公の行のため）
//  - 出現行が PLAYER_START_ROW なら c1 は PLAYER_START_COL より左（最初の水平区間は出現行のため）
// 仮・要確認: ルート同士の重なり・交差は許す。
export const createRoute = (
  id: number,
  spawn: GridCell,
  release: GridCell,
  random: () => number,
): Route => {
  const turnCount =
    ROUTE_TURN_COUNT_MIN +
    randomInt(random, ROUTE_TURN_COUNT_MAX - ROUTE_TURN_COUNT_MIN + 1);
  const columns = range(ROUTE_TURN_COL_MIN, ROUTE_TURN_COL_MAX).filter(
    (col) => col !== PLAYER_START_COL,
  );
  const lastCol = pickOne(
    random,
    columns.filter((col) => col > PLAYER_START_COL),
  );
  const earlier = columns.filter((col) => col < lastCol);
  const firstPool =
    spawn.row === PLAYER_START_ROW
      ? earlier.filter((col) => col < PLAYER_START_COL)
      : earlier;
  const first = pickOne(random, firstPool);
  const others = pickDistinct(
    random,
    earlier.filter((col) => col !== first),
    turnCount - 2,
  );
  const turnCols = [first, ...others].sort((a, b) => a - b);
  turnCols.push(lastCol);

  const corners: GridCell[] = [spawn];
  let row = spawn.row;
  turnCols.forEach((col, i) => {
    corners.push({ col, row });
    if (i === turnCols.length - 1) {
      corners.push({ col, row: release.row });
      return;
    }
    const nextRow = pickOne(
      random,
      range(0, FIELD_ROWS - 1).filter(
        (r) => r !== row && r !== PLAYER_START_ROW,
      ),
    );
    corners.push({ col, row: nextRow });
    row = nextRow;
  });
  corners.push(release);

  const distinct = corners.filter(
    (cell, i) => i === 0 || !isSameCell(cell, corners[i - 1]),
  );
  // 一直線上の中間点は曲がらないので除く。
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

// 仮・要確認: ルートは作る時点でそのルートだけ生成し、既存ルートは作り直さない（流れているコードの path とずれないため）。
export const createRoutes = (
  spawns: readonly GridCell[],
  random: () => number,
): Route[] =>
  spawns.map((spawn, i) => createRoute(i, spawn, RELEASE_POINT_CELL, random));

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
export const addRoute = (
  routes: readonly Route[],
  random: () => number,
): Route | undefined => {
  if (routes.length >= MAX_ENGINEER_ROUTES) return undefined;
  const spawn = nextSpawnCell(routes.map((route) => route.spawn));
  if (spawn === undefined) return undefined;
  const id = routes.reduce((max, route) => Math.max(max, route.id), -1) + 1;
  return createRoute(id, spawn, RELEASE_POINT_CELL, random);
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

// 仮・要確認(#35): 休暇中の出現場所マーカーの見た目（出現場所の円に重ねる）。大きさは SPAWN_MARKER_STYLE と同じ。
export const VACATION_MARKER_STYLE = {
  fillColor: 0x8a8f98,
  strokeColor: 0xffffff,
  label: '休',
  labelFontSize: '18px',
  labelColor: '#ffffff',
} as const;
