// テスト専用の fixture(#172)。製品コードからは import しない。
// #172 でゲーム開始時のエンジニアを0人（ENGINEER_SPAWN_CELLS・INITIAL_ENGINEER_RANKS を空）にしたため、
// 3人・3ルートを前提にしていたテストは、従来の初期配置（左端の列の行1・4・7 にジュニア3人）をここから明示的に作る。
import { createInitialEngineers } from './engineer';
import type { Engineer, EngineerRank } from './engineer';
import { createRoutes } from './route';
import type { GridCell, Route } from './route';

// 従来の初期の出現セル（左端の列の行1・4・7）。
export const FIXTURE_SPAWN_CELLS: readonly GridCell[] = [
  { col: 0, row: 1 },
  { col: 0, row: 4 },
  { col: 0, row: 7 },
];

// 従来の初期のランク。FIXTURE_SPAWN_CELLS と同じ数・順序（ルートと1対1）。
export const FIXTURE_ENGINEER_RANKS: readonly EngineerRank[] = ['junior', 'junior', 'junior'];

// 従来の createInitialFleet と同じ手順（ルート → エンジニア、同じ random を続けて使う）で3人・3ルートを作る。
export const createFixtureFleet = (
  random: () => number,
): { readonly routes: Route[]; readonly engineers: Engineer[]; readonly nextEngineerId: number } => {
  const routes = createRoutes(FIXTURE_SPAWN_CELLS, random);
  const engineers = createInitialEngineers(routes, FIXTURE_ENGINEER_RANKS, random);
  return { routes, engineers, nextEngineerId: engineers.length };
};
