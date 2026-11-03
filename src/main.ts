import Phaser from 'phaser';
import './style.css';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';
import { CODE_SAMPLES, ENGINEER_SPAWN_CELLS } from './config';
import { drawCode, drawField, drawPlayer, drawReleasePoint, drawRoutes } from './render';
import { cellCenter, createRoutes } from './route';

class MainScene extends Phaser.Scene {
  constructor() {
    super('main');
  }

  create(): void {
    drawField(this);
    drawRoutes(this, createRoutes(ENGINEER_SPAWN_CELLS));
    drawReleasePoint(this);
    drawPlayer(this);
    CODE_SAMPLES.forEach(({ kind, cell }) => drawCode(this, kind, cellCenter(cell)));
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: FIELD_WIDTH,
  height: FIELD_HEIGHT,
  backgroundColor: '#0b1020',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: MainScene,
};

new Phaser.Game(config);
