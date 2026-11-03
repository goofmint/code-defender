import { describe, expect, it } from 'vitest';
import {
  CODE_SAMPLES,
  ENGINEER_SPAWN_CELLS,
  PLAYER_START_COL,
  PLAYER_START_ROW,
  RELEASE_POINT_CELL,
} from './config';
import { CODE_SIZE, CODE_STAR_INNER_RATIO, CODE_STAR_SPIKES, CODE_STYLES, starPoints } from './code';
import type { CodeKind } from './code';
import { CELL_SIZE, FIELD_COLS, FIELD_ROWS } from './field';
import { PLAYER_SIZE } from './player';
import { createRoutes } from './route';
import type { GridCell } from './route';

const kinds: CodeKind[] = ['normal', 'malicious'];

const isOnRoute = (cell: GridCell): boolean =>
  createRoutes(ENGINEER_SPAWN_CELLS).some((route) =>
    route.waypoints.some((from, i) => {
      if (i === 0) return false;
      const to = route.waypoints[i - 1];
      return (
        cell.col >= Math.min(from.col, to.col) &&
        cell.col <= Math.max(from.col, to.col) &&
        cell.row >= Math.min(from.row, to.row) &&
        cell.row <= Math.max(from.row, to.row)
      );
    }),
  );

describe('コードの見た目', () => {
  it('正常・不正の両方にスタイルがある', () => {
    for (const kind of kinds) {
      expect(CODE_STYLES[kind]).toBeDefined();
    }
  });

  it('塗り色と形の識別子が両種類で異なる', () => {
    expect(CODE_STYLES.normal.fillColor).not.toBe(CODE_STYLES.malicious.fillColor);
    expect(CODE_STYLES.normal.shape).not.toBe(CODE_STYLES.malicious.shape);
  });

  it('サイズは 0 より大きく、セルと主人公より小さい', () => {
    expect(CODE_SIZE).toBeGreaterThan(0);
    expect(CODE_SIZE).toBeLessThan(CELL_SIZE);
    expect(CODE_SIZE).toBeLessThan(PLAYER_SIZE);
  });

  it('星形の頂点数はトゲ数の 2 倍である', () => {
    expect(starPoints(CODE_SIZE, CODE_STAR_SPIKES, CODE_STAR_INNER_RATIO)).toHaveLength(
      CODE_STAR_SPIKES * 2,
    );
  });

  it('星形の頂点は外径・内径の距離を交互に取る', () => {
    const points = starPoints(CODE_SIZE, CODE_STAR_SPIKES, CODE_STAR_INNER_RATIO);
    const outer = CODE_SIZE / 2;
    points.forEach((p, i) => {
      const expected = i % 2 === 0 ? outer : outer * CODE_STAR_INNER_RATIO;
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(expected);
    });
  });

  it('見本配置は両種類を含み、フィールド内のルート上のセルにある', () => {
    expect(new Set(CODE_SAMPLES.map((s) => s.kind))).toEqual(new Set(kinds));
    for (const { cell } of CODE_SAMPLES) {
      expect(cell.col).toBeGreaterThanOrEqual(0);
      expect(cell.col).toBeLessThan(FIELD_COLS);
      expect(cell.row).toBeGreaterThanOrEqual(0);
      expect(cell.row).toBeLessThan(FIELD_ROWS);
      expect(isOnRoute(cell)).toBe(true);
    }
  });

  it('見本配置は主人公の初期セルとリリース地点のセルに重ならない', () => {
    for (const { cell } of CODE_SAMPLES) {
      expect(cell).not.toEqual({ col: PLAYER_START_COL, row: PLAYER_START_ROW });
      expect(cell).not.toEqual(RELEASE_POINT_CELL);
    }
  });
});
