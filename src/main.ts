import Phaser from 'phaser';
import './style.css';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';
import { drawField, drawReleasePoint } from './render';

class MainScene extends Phaser.Scene {
  constructor() {
    super('main');
  }

  create(): void {
    drawField(this);
    drawReleasePoint(this);
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
