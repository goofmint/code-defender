import Phaser from 'phaser';
import './style.css';

class MainScene extends Phaser.Scene {
  constructor() {
    super('main');
  }

  create(): void {
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Code Defender', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '48px',
        color: '#e8eef7',
      })
      .setOrigin(0.5);
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 540,
  backgroundColor: '#0b1020',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: MainScene,
};

new Phaser.Game(config);
