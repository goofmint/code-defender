import Phaser from 'phaser';
import {
  CELL_SIZE,
  FIELD_COLORS,
  FIELD_COLS,
  FIELD_HEIGHT,
  FIELD_ROWS,
  FIELD_WIDTH,
  GRID_LINE_WIDTH,
} from './field';
import { RELEASE_POINT_CENTER, RELEASE_POINT_STYLE } from './releasePoint';
import {
  cellCenter,
  ROUTE_STYLE,
  routePixelPoints,
  SPAWN_MARKER_STYLE,
} from './route';
import type { Route } from './route';

// 後続オブジェクトより常に下に描画する。
const FIELD_DEPTH = -1;

export const drawField = (scene: Phaser.Scene): void => {
  const g = scene.add.graphics();
  g.setDepth(FIELD_DEPTH);
  g.fillStyle(FIELD_COLORS.ground, 1);
  g.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
  g.lineStyle(GRID_LINE_WIDTH, FIELD_COLORS.grid, 1);
  for (let col = 0; col <= FIELD_COLS; col++) {
    g.lineBetween(col * CELL_SIZE, 0, col * CELL_SIZE, FIELD_HEIGHT);
  }
  for (let row = 0; row <= FIELD_ROWS; row++) {
    g.lineBetween(0, row * CELL_SIZE, FIELD_WIDTH, row * CELL_SIZE);
  }
};

// 仮: フィールド（FIELD_DEPTH=-1）より手前、後続オブジェクトの邪魔にならない深さ。
const RELEASE_POINT_DEPTH = 0;

export const drawReleasePoint = (scene: Phaser.Scene): void => {
  const { x, y } = RELEASE_POINT_CENTER;
  const {
    radius,
    fillColor,
    strokeColor,
    strokeWidth,
    label,
    labelFontSize,
    labelFontFamily,
    labelColor,
    labelGap,
  } = RELEASE_POINT_STYLE;
  scene.add
    .circle(x, y, radius, fillColor)
    .setStrokeStyle(strokeWidth, strokeColor)
    .setDepth(RELEASE_POINT_DEPTH);
  scene.add
    .text(x, y - radius - labelGap, label, {
      fontSize: labelFontSize,
      fontFamily: labelFontFamily,
      color: labelColor,
    })
    .setOrigin(0.5, 1)
    .setDepth(RELEASE_POINT_DEPTH);
};

// 仮: フィールド(-1)より上、リリース地点(0)より下。
const ROUTE_DEPTH = -0.5;

export const drawRoutes = (scene: Phaser.Scene, routes: readonly Route[]): void => {
  const g = scene.add.graphics();
  g.setDepth(ROUTE_DEPTH);
  for (const route of routes) {
    g.lineStyle(ROUTE_STYLE.width, ROUTE_STYLE.color, ROUTE_STYLE.alpha);
    const points = routePixelPoints(route);
    for (let i = 1; i < points.length; i++) {
      g.lineBetween(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
    }
    const { x, y } = cellCenter(route.spawn);
    scene.add
      .circle(x, y, SPAWN_MARKER_STYLE.radius, SPAWN_MARKER_STYLE.fillColor)
      .setStrokeStyle(SPAWN_MARKER_STYLE.strokeWidth, SPAWN_MARKER_STYLE.strokeColor)
      .setDepth(ROUTE_DEPTH);
  }
};
