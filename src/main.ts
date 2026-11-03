import Phaser from 'phaser';
import './style.css';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';
import { CODE_SAMPLES, ENGINEER_SPAWN_CELLS } from './config';
import { drawCode, drawField, drawPlayer, drawReleasePoint, drawRoutes } from './render';
import { addRoute, cellCenter, createRoutes } from './route';
import type { Route } from './route';

class MainScene extends Phaser.Scene {
  private routes: Route[] = [];

  constructor() {
    super('main');
  }

  create(): void {
    drawField(this);
    this.routes = createRoutes(ENGINEER_SPAWN_CELLS);
    drawRoutes(this, this.routes);
    drawReleasePoint(this);
    drawPlayer(this);
    CODE_SAMPLES.forEach(({ kind, cell }) => drawCode(this, kind, cellCenter(cell)));
  }

  // エンジニアが増えたときに出現場所とルートを追加して描画する。上限などで追加できなければ undefined。
  addEngineerRoute(): Route | undefined {
    const route = addRoute(this.routes);
    if (route === undefined) return undefined;
    this.routes.push(route);
    drawRoutes(this, [route]);
    return route;
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
