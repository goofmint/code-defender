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
import type { Point, Route } from './route';
import {
  CODE_CORNER_RADIUS_RATIO,
  CODE_SIZE,
  CODE_STAR_INNER_RATIO,
  CODE_STAR_SPIKES,
  CODE_STROKE_WIDTH,
  CODE_STYLES,
  starPoints,
} from './code';
import type { CodeKind } from './code';
import {
  ATTACK_EFFECT_COLOR,
  ATTACK_EFFECT_DURATION_MS,
  ATTACK_HIT_FLASH_DURATION_MS,
} from './config';
import { getPlayerStartPosition, PLAYER_COLORS, PLAYER_SIZE } from './player';

// 後続オブジェクトより常に下に描画する。
const FIELD_DEPTH = -1;
// 主人公はフィールドより手前に描画する。
const PLAYER_DEPTH = 1;

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

// 主人公（エンジニア）を描く。ローカル原点を中心に PLAYER_SIZE 内へ収める。
export const drawPlayer = (scene: Phaser.Scene): Phaser.GameObjects.Graphics => {
  const g = scene.add.graphics();
  const u = PLAYER_SIZE;
  const headR = u * 0.2;
  const bodyW = u * 0.5;
  const bodyH = u * 0.4;
  // 図形全体（高さ 0.8u）が縦方向の中心に来るよう、上端を -0.4u にする。
  const top = -u * 0.4;
  const bodyTop = top + headR * 2;
  // 胴体
  g.fillStyle(PLAYER_COLORS.body, 1);
  g.fillRect(-bodyW / 2, bodyTop, bodyW, bodyH);
  // 頭と髪
  g.fillStyle(PLAYER_COLORS.skin, 1);
  g.fillCircle(0, top + headR, headR);
  g.fillStyle(PLAYER_COLORS.hair, 1);
  g.fillRect(-headR, top, headR * 2, headR * 0.6);
  // 胴体前のノートPC
  g.fillStyle(PLAYER_COLORS.laptop, 1);
  g.fillRect(-u * 0.25, bodyTop + bodyH * 0.5, u * 0.5, u * 0.2);
  const start = getPlayerStartPosition();
  g.setPosition(start.x, start.y);
  g.setDepth(PLAYER_DEPTH);
  return g;
};

// 仮: リリース地点(0)とプレイヤー(1)の間。
const CODE_DEPTH = 0.5;

// コードを描く。ローカル原点を中心に CODE_SIZE 内へ収め、position に置く。
export const drawCode = (
  scene: Phaser.Scene,
  kind: CodeKind,
  position: Point,
): Phaser.GameObjects.Graphics => {
  const g = scene.add.graphics();
  const style = CODE_STYLES[kind];
  const s = CODE_SIZE;
  const { shape, pattern } = style;
  g.fillStyle(style.fillColor, 1);
  g.lineStyle(CODE_STROKE_WIDTH, style.strokeColor, 1);
  switch (shape) {
    case 'roundedRect': {
      const r = s * CODE_CORNER_RADIUS_RATIO;
      g.fillRoundedRect(-s / 2, -s / 2, s, s, r);
      g.strokeRoundedRect(-s / 2, -s / 2, s, s, r);
      break;
    }
    case 'star': {
      const points = starPoints(s, CODE_STAR_SPIKES, CODE_STAR_INNER_RATIO);
      g.beginPath();
      points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.closePath();
      g.fillPath();
      g.strokePath();
      break;
    }
    default: {
      const unreachable: never = shape;
      throw new Error(`未対応の形: ${String(unreachable)}`);
    }
  }
  g.fillStyle(style.patternColor, 1);
  switch (pattern) {
    case 'lines': {
      // コードの行を表す短い横線 3 本（長さを変えて行らしくする）。
      const h = s * 0.08;
      const lengths = [0.5, 0.35, 0.45];
      lengths.forEach((ratio, i) => {
        g.fillRect(-s * 0.25, -s * 0.2 + i * s * 0.2, s * ratio, h);
      });
      break;
    }
    case 'exclamation': {
      // 「!」: 縦棒 + 点。
      const barW = s * 0.1;
      g.fillRect(-barW / 2, -s * 0.22, barW, s * 0.26);
      g.fillCircle(0, s * 0.16, s * 0.07);
      break;
    }
    default: {
      const unreachable: never = pattern;
      throw new Error(`未対応の模様: ${String(unreachable)}`);
    }
  }
  g.setPosition(position.x, position.y);
  g.setDepth(CODE_DEPTH);
  return g;
};

// 仮: 主人公(PLAYER_DEPTH=1)より上。
const ATTACK_EFFECT_DEPTH = 1.5;
// 仮: 射程の輪の線幅（ピクセル）。企画書には未記載。
const ATTACK_EFFECT_STROKE_WIDTH = 2;

// 攻撃エフェクト（射程の輪）を表示して、一定時間で消す。命中・空振りで共通。
export const drawAttackEffect = (scene: Phaser.Scene, position: Point, range: number): void => {
  const ring = scene.add
    .circle(position.x, position.y, range, ATTACK_EFFECT_COLOR, 0.2)
    .setStrokeStyle(ATTACK_EFFECT_STROKE_WIDTH, ATTACK_EFFECT_COLOR)
    .setDepth(ATTACK_EFFECT_DEPTH);
  scene.tweens.add({
    targets: ring,
    alpha: 0,
    duration: ATTACK_EFFECT_DURATION_MS,
    onComplete: () => ring.destroy(),
  });
};

// 命中したコードを点滅させる（表示は消さない）。
export const flashCode = (scene: Phaser.Scene, code: Phaser.GameObjects.Graphics): void => {
  scene.tweens.killTweensOf(code);
  code.setAlpha(1);
  scene.tweens.add({
    targets: code,
    alpha: 0.2,
    duration: ATTACK_HIT_FLASH_DURATION_MS / 4,
    yoyo: true,
    repeat: 1,
  });
};
