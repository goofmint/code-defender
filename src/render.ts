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

// 主人公（エンジニア）を描く。ローカル原点を中心に PLAYER_SIZE 内へ収める。
export const drawPlayer = (scene: Phaser.Scene): Phaser.GameObjects.Graphics => {
  const g = scene.add.graphics();
  const u = PLAYER_SIZE;
  const headR = u * 0.2;
  const bodyW = u * 0.5;
  const bodyH = u * 0.4;
  const bodyTop = -u / 2 + headR * 2;
  // 胴体
  g.fillStyle(PLAYER_COLORS.body, 1);
  g.fillRect(-bodyW / 2, bodyTop, bodyW, bodyH);
  // 頭と髪
  g.fillStyle(PLAYER_COLORS.skin, 1);
  g.fillCircle(0, -u / 2 + headR, headR);
  g.fillStyle(PLAYER_COLORS.hair, 1);
  g.fillRect(-headR, -u / 2, headR * 2, headR * 0.6);
  // 胴体前のノートPC
  g.fillStyle(PLAYER_COLORS.laptop, 1);
  g.fillRect(-u * 0.25, bodyTop + bodyH * 0.5, u * 0.5, u * 0.2);
  g.setPosition(getPlayerStartPosition().x, getPlayerStartPosition().y);
  g.setDepth(PLAYER_DEPTH);
  return g;
};
