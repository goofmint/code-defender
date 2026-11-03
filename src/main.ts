import Phaser from 'phaser';
import './style.css';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';
import {
  CODE_MALICIOUS_RATE,
  CODE_SPAWN_INTERVAL_MS,
  CODE_SPEED,
  ENGINEER_SPAWN_CELLS,
  PLAYER_MOVE_KEYS,
  PLAYER_POINTER_DEAD_ZONE,
} from './config';
import {
  clampToField,
  getMoveDirection,
  getPointerDirection,
  movePlayer,
  movePlayerToward,
} from './player';
import { drawCode, drawField, drawPlayer, drawReleasePoint, drawRoutes } from './render';
import {
  CODE_RELEASED_EVENT,
  advanceCode,
  initialSpawnElapsed,
  pickCodeKind,
  spawnCode,
  stepSpawnTimer,
} from './codeFlow';
import type { CodeReleasedPayload, FlowingCode } from './codeFlow';
import { addRoute, createRoutes } from './route';
import type { Route } from './route';

type ActiveCode = FlowingCode & { readonly graphics: Phaser.GameObjects.Graphics };

type MoveKeys = Record<keyof typeof PLAYER_MOVE_KEYS, Phaser.Input.Keyboard.Key[]>;

class MainScene extends Phaser.Scene {
  private routes: Route[] = [];
  private player?: Phaser.GameObjects.Graphics;
  private moveKeys?: MoveKeys;
  private codes: ActiveCode[] = [];
  private spawnElapsed = new Map<number, number>();
  private nextCodeId = 0;

  constructor() {
    super('main');
  }

  create(): void {
    drawField(this);
    this.routes = createRoutes(ENGINEER_SPAWN_CELLS);
    this.codes = [];
    this.spawnElapsed = new Map();
    this.nextCodeId = 0;
    drawRoutes(this, this.routes);
    drawReleasePoint(this);
    this.player = drawPlayer(this);
    const keyboard = this.input.keyboard;
    if (keyboard) {
      const register = (names: readonly string[]): Phaser.Input.Keyboard.Key[] =>
        names.map((name) => keyboard.addKey(name));
      this.moveKeys = {
        left: register(PLAYER_MOVE_KEYS.left),
        right: register(PLAYER_MOVE_KEYS.right),
        up: register(PLAYER_MOVE_KEYS.up),
        down: register(PLAYER_MOVE_KEYS.down),
      };
    }
  }

  update(_time: number, delta: number): void {
    this.updatePlayer(delta);
    this.updateCodes(delta);
  }

  private updatePlayer(delta: number): void {
    const player = this.player;
    if (!player) {
      return;
    }
    const keys = this.moveKeys;
    const isDown = (list: Phaser.Input.Keyboard.Key[]): boolean => list.some((key) => key.isDown);
    const anyKeyDown = keys
      ? isDown(keys.left) || isDown(keys.right) || isDown(keys.up) || isDown(keys.down)
      : false;
    const keyDirection = keys
      ? getMoveDirection({
          left: isDown(keys.left),
          right: isDown(keys.right),
          up: isDown(keys.up),
          down: isDown(keys.down),
        })
      : { x: 0, y: 0 };
    const position = { x: player.x, y: player.y };

    // いずれかの移動キーが押されていればキーボード優先。方向が相殺されてゼロでもポインターには切り替えない。
    if (anyKeyDown) {
      if (keyDirection.x !== 0 || keyDirection.y !== 0) {
        const next = clampToField(movePlayer(position, keyDirection, delta));
        player.setPosition(next.x, next.y);
      }
      return;
    }

    // ポインター（タッチ・マウス）を押している間、ゲーム座標の押下位置へ向かう。
    const pointer = this.input.activePointer;
    if (!pointer.isDown) {
      return;
    }
    const target = { x: pointer.worldX, y: pointer.worldY };
    const direction = getPointerDirection(position, target, PLAYER_POINTER_DEAD_ZONE);
    if (direction.x === 0 && direction.y === 0) {
      return;
    }
    const next = clampToField(movePlayerToward(position, target, direction, delta));
    player.setPosition(next.x, next.y);
  }

  private updateCodes(delta: number): void {
    for (const route of this.routes) {
      const step = stepSpawnTimer(
        this.spawnElapsed.get(route.id) ?? initialSpawnElapsed(CODE_SPAWN_INTERVAL_MS),
        delta,
        CODE_SPAWN_INTERVAL_MS,
      );
      this.spawnElapsed.set(route.id, step.elapsedMs);
      if (step.spawn) {
        const code = spawnCode(this.nextCodeId++, pickCodeKind(Math.random, CODE_MALICIOUS_RATE), route);
        this.codes.push({ ...code, graphics: drawCode(this, code.kind, code.position) });
      }
    }

    const distance = (CODE_SPEED * delta) / 1000;
    const flowing: ActiveCode[] = [];
    for (const active of this.codes) {
      const next: ActiveCode = { ...advanceCode(active, distance), graphics: active.graphics };
      if (next.released) {
        next.graphics.destroy();
        const payload: CodeReleasedPayload = { id: next.id, kind: next.kind, routeId: next.routeId };
        this.events.emit(CODE_RELEASED_EVENT, payload);
      } else {
        next.graphics.setPosition(next.position.x, next.position.y);
        flowing.push(next);
      }
    }
    this.codes = flowing;
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
