import Phaser from 'phaser';
import './style.css';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';
import {
  ATTACK_KEYS,
  CODE_MALICIOUS_RATE,
  CODE_SPAWN_INTERVAL_MS,
  CODE_SPEED,
  ENGINEER_MONTHLY_SALARY,
  ENGINEER_SPAWN_CELLS,
  INITIAL_FUNDS,
  PLAYER_MOVE_KEYS,
  PLAYER_POINTER_DEAD_ZONE,
} from './config';
import {
  ATTACK_COOLDOWN_MS,
  ATTACK_RANGE,
  canAttack,
  CODE_HIT_EVENT,
  findAttackTarget,
  isInsideTapArea,
} from './attack';
import type { CodeHitEvent } from './attack';
import {
  clampToField,
  getMoveDirection,
  getPointerDirection,
  movePlayer,
  movePlayerToward,
} from './player';
import {
  drawAttackEffect,
  drawCode,
  drawElapsedDays,
  drawField,
  drawFunds,
  drawPlayer,
  drawReleasePoint,
  drawRoutes,
  flashCode,
} from './render';
import {
  CODE_RELEASED_EVENT,
  advanceCode,
  initialSpawnElapsed,
  pickCodeKind,
  spawnCode,
  stepSpawnTimer,
} from './codeFlow';
import type { CodeReleasedPayload, FlowingCode } from './codeFlow';
import {
  advanceElapsedMs,
  createMonthElapsedEvent,
  formatElapsedDays,
  getCrossedMonths,
  getElapsedDays,
  MONTH_ELAPSED_EVENT,
} from './gameTime';
import type { MonthElapsedEvent } from './gameTime';
import { createFundsChangedEvent, formatFunds, FUNDS_CHANGED_EVENT } from './funds';
import type { FundsChangeReason } from './funds';
import { getEngineerSalaries, SALARY_PAID_EVENT, settleMonthlySalary } from './salary';
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
  private lastAttackTime: number | null = null;
  // 主人公のタップで攻撃したポインターを離すまで true。この間はポインターでの移動を止める。
  private attackPointerHeld = false;
  // ゲーム内の経過ミリ秒（累積）。一時停止・休暇中に止めるかは未決定。止める場合は加算をやめるだけでよい。
  private elapsedMs = 0;
  private elapsedDaysText?: Phaser.GameObjects.Text;
  private displayedDays = 0;
  private funds = 0;
  private fundsText?: Phaser.GameObjects.Text;

  constructor() {
    super('main');
  }

  create(): void {
    drawField(this);
    this.elapsedDaysText = drawElapsedDays(this, getElapsedDays(this.elapsedMs));
    this.funds = INITIAL_FUNDS;
    this.fundsText = drawFunds(this, this.funds);
    this.events.on(MONTH_ELAPSED_EVENT, this.onMonthElapsed, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(MONTH_ELAPSED_EVENT, this.onMonthElapsed, this);
    });
    this.routes = createRoutes(ENGINEER_SPAWN_CELLS, Math.random);
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
      // 'down' イベントで発動する（短い押下の取りこぼし防止）。emitOnRepeat は既定 false なので押しっぱなしでは連発しない。
      register(ATTACK_KEYS).forEach((key) => key.on('down', () => this.tryAttack()));
    }
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const player = this.player;
      if (!player) {
        return;
      }
      // ゲーム座標（worldX/worldY）で判定する。DOM 座標は使わない。
      const inside = isInsideTapArea(
        { x: pointer.worldX, y: pointer.worldY },
        { x: player.x, y: player.y },
      );
      if (inside) {
        this.attackPointerHeld = true;
        this.tryAttack();
      }
    });
  }

  // 現在の攻撃対象（フィールド上を流れているコードの一覧）を返す。
  // 命中判定（findAttackTarget）は渡された一覧だけを見る。
  private getAttackTargets(): readonly ActiveCode[] {
    return this.codes;
  }

  // クールダウンが明けていれば攻撃する。射程内で最も近いコード1つに命中し、空振りでもクールダウンを消費する。
  // 命中時は CODE_HIT_EVENT を発行する。後続タスクは `scene.events.on(CODE_HIT_EVENT, ...)` で接続する。
  private tryAttack(): void {
    const player = this.player;
    const now = this.time.now;
    if (!player || !canAttack(now, this.lastAttackTime, ATTACK_COOLDOWN_MS)) {
      return;
    }
    this.lastAttackTime = now;
    const playerPosition = { x: player.x, y: player.y };
    drawAttackEffect(this, playerPosition, ATTACK_RANGE);
    const hit = findAttackTarget(playerPosition, this.getAttackTargets(), ATTACK_RANGE);
    if (!hit) {
      return;
    }
    flashCode(this, hit.graphics);
    const payload: CodeHitEvent<ActiveCode> = { code: hit, playerPosition, time: now };
    this.events.emit(CODE_HIT_EVENT, payload);
  }

  update(_time: number, delta: number): void {
    this.advanceClock(delta);
    this.updatePlayer(delta);
    this.updateCodes(delta);
  }

  private updatePlayer(delta: number): void {
    const player = this.player;
    if (!player) {
      return;
    }
    if (!this.input.activePointer.isDown) {
      this.attackPointerHeld = false;
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
    if (this.attackPointerHeld) {
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

  // 経過時間を累積し、日数表示を更新して、越えた月ごとに MONTH_ELAPSED_EVENT を1回ずつ発行する。
  // 後続タスクは `scene.events.on(MONTH_ELAPSED_EVENT, ...)` で接続する（#19 の給料など）。
  private advanceClock(delta: number): void {
    const prev = this.elapsedMs;
    this.elapsedMs = advanceElapsedMs(prev, delta);
    const days = getElapsedDays(this.elapsedMs);
    if (days !== this.displayedDays) {
      this.displayedDays = days;
      this.elapsedDaysText?.setText(formatElapsedDays(days));
    }
    for (const month of getCrossedMonths(prev, this.elapsedMs)) {
      this.events.emit(MONTH_ELAPSED_EVENT, createMonthElapsedEvent(month));
    }
  }

  // 資金を変更して、表示更新と FUNDS_CHANGED_EVENT の発行を一か所で行う。#17（売上）・#18（損害）もここを通す想定。
  private changeFunds(next: number, reason: FundsChangeReason): void {
    const previous = this.funds;
    this.funds = next;
    this.fundsText?.setText(formatFunds(next));
    this.events.emit(FUNDS_CHANGED_EVENT, createFundsChangedEvent(previous, next, reason));
  }

  // 月の境界ごとに給料を引く。エンジニア数は仮に現在のルート数とする（主人公の給料は含めない）。
  private onMonthElapsed(event: MonthElapsedEvent): void {
    const paid = settleMonthlySalary(
      this.funds,
      event.month,
      getEngineerSalaries(this.routes.length, ENGINEER_MONTHLY_SALARY),
    );
    this.changeFunds(paid.fundsAfter, 'salary');
    this.events.emit(SALARY_PAID_EVENT, paid);
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
    const route = addRoute(this.routes, Math.random);
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
