import Phaser from 'phaser';
import './style.css';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';
import {
  ATTACK_DAMAGE,
  ATTACK_KEYS,
  CODE_SPAWN_INTERVAL_MS,
  ENGINEER_HIRE_COST,
  ENGINEER_MONTHLY_SALARY,
  ENGINEER_SPAWN_CELLS,
  GAME_OVER_RESTART_KEYS,
  HIRE_KEYS,
  INITIAL_ENGINEER_RANKS,
  INITIAL_FUNDS,
  MAX_ENGINEERS,
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
import { codeSpeedAt, maliciousRateAt } from './difficulty';
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
  drawDefeatEffect,
  drawElapsedDays,
  drawField,
  drawFunds,
  drawEngineerCount,
  drawGameOver,
  drawHireButtons,
  drawHireMessage,
  drawPenaltyText,
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
import { applyHit, CODE_DEFEATED_EVENT, getInitialHp, isDefeated, resolveCodeFate } from './defeat';
import type { CodeDefeatedPayload } from './defeat';
import { createFundsChangedEvent, formatFunds, FUNDS_CHANGED_EVENT } from './funds';
import type { FundsChangedEvent, FundsChangeReason } from './funds';
import {
  canRestart,
  checkBankruptcy,
  createGameOverEvent,
  GAME_OVER_EVENT,
  INITIAL_GAME_OVER_STATE,
} from './gameOver';
import type { GameOverState } from './gameOver';
import { NORMAL_CODE_PENALIZED_EVENT, resolveNormalCodePenalty } from './penalty';
import type { NormalCodePenalizedPayload } from './penalty';
import { getEngineerSalaries, SALARY_PAID_EVENT, settleMonthlySalary } from './salary';
import { getReleaseRevenue, sellReleasedCode } from './sales';
import {
  createInitialEngineers,
  ENGINEER_HIRED_EVENT,
  ENGINEER_RANKS,
  formatEngineerCount,
  formatHireMessage,
  hireEngineer,
} from './engineer';
import type { Engineer, EngineerHiredPayload } from './engineer';
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
  // 不正なコードの残り hp（コードIDがキー）。FlowingCode は変更しない。撃破・リリースで削除する。
  private codeHp = new Map<number, number>();
  private lastAttackTime: number | null = null;
  // 主人公のタップで攻撃したポインターを離すまで true。この間はポインターでの移動を止める。
  private attackPointerHeld = false;
  // ゲーム内の経過ミリ秒（累積）。一時停止・休暇中に止めるかは未決定。止める場合は加算をやめるだけでよい。
  private elapsedMs = 0;
  private elapsedDaysText?: Phaser.GameObjects.Text;
  private displayedDays = 0;
  private funds = 0;
  private fundsText?: Phaser.GameObjects.Text;
  private gameOver: GameOverState = INITIAL_GAME_OVER_STATE;
  private engineers: Engineer[] = [];
  private nextEngineerId = 0;
  private engineerCountText?: Phaser.GameObjects.Text;
  private hireMessageText?: Phaser.GameObjects.Text;

  constructor() {
    super('main');
  }

  create(): void {
    // scene.restart() は同じインスタンスで create() を再実行し、クラスフィールドの初期値は再設定されない。ここで初期化する。
    this.elapsedMs = 0;
    this.displayedDays = 0;
    this.lastAttackTime = null;
    // タップでリスタートしたとき、押したままのポインターで主人公が動かないよう、離すまでポインター移動を止める（updatePlayer で解除）。
    this.attackPointerHeld = this.input.activePointer.isDown;
    this.gameOver = INITIAL_GAME_OVER_STATE;
    drawField(this);
    this.elapsedDaysText = drawElapsedDays(this, getElapsedDays(this.elapsedMs));
    this.funds = INITIAL_FUNDS;
    this.fundsText = drawFunds(this, this.funds);
    this.events.on(MONTH_ELAPSED_EVENT, this.onMonthElapsed, this);
    this.events.on(FUNDS_CHANGED_EVENT, this.onFundsChanged, this);
    this.events.on(CODE_HIT_EVENT, this.onCodeHit, this);
    this.events.on(CODE_RELEASED_EVENT, this.onCodeReleased, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(MONTH_ELAPSED_EVENT, this.onMonthElapsed, this);
      this.events.off(FUNDS_CHANGED_EVENT, this.onFundsChanged, this);
      this.events.off(CODE_HIT_EVENT, this.onCodeHit, this);
      this.events.off(CODE_RELEASED_EVENT, this.onCodeReleased, this);
    });
    this.routes = createRoutes(ENGINEER_SPAWN_CELLS, Math.random);
    this.codes = [];
    this.spawnElapsed = new Map();
    this.nextCodeId = 0;
    this.codeHp = new Map();
    drawRoutes(this, this.routes);
    this.engineers = createInitialEngineers(this.routes, INITIAL_ENGINEER_RANKS);
    this.nextEngineerId = this.engineers.length;
    this.hireMessageText = undefined;
    this.engineerCountText = drawEngineerCount(this, this.engineers.length, MAX_ENGINEERS);
    drawHireButtons(
      this,
      ENGINEER_RANKS.map((entry) => ({ rank: entry.id, cost: ENGINEER_HIRE_COST[entry.id] })),
      (rank) => this.hire(rank),
    );
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
      HIRE_KEYS.forEach((name, index) =>
        keyboard.addKey(name).on('down', () => this.hire(ENGINEER_RANKS[index].id)),
      );
      register(GAME_OVER_RESTART_KEYS).forEach((key) => key.on('down', () => this.tryRestart()));
    }
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      if (this.gameOver.over) {
        this.tryRestart();
        return;
      }
      // 雇うボタン上の押下では、離すまで主人公の移動・攻撃をしない。
      if (currentlyOver.length > 0) {
        this.attackPointerHeld = true;
        return;
      }
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
    if (this.gameOver.over) {
      return;
    }
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
    if (this.gameOver.over) {
      return;
    }
    this.advanceClock(delta);
    // 月の給料で倒産したら、同じフレームの移動・コードの更新はしない。
    if (this.gameOver.over) {
      return;
    }
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
      // 倒産したら残りの月は発行しない（倒産後に給料を引かない）。
      if (this.gameOver.over) {
        break;
      }
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

  // ランクを指定して雇う。ゲームオーバー中は何もしない。費用は changeFunds を通して引く（倒産判定もここで動く）。
  // 雇ってもルートは増やさない（#27 が ENGINEER_HIRED_EVENT を購読して追加する）。
  private hire(rank: string): void {
    if (this.gameOver.over) {
      return;
    }
    const result = hireEngineer(
      { engineers: this.engineers, funds: this.funds, nextId: this.nextEngineerId },
      rank,
      { max: MAX_ENGINEERS, costs: ENGINEER_HIRE_COST },
    );
    this.hireMessageText?.destroy();
    this.hireMessageText = drawHireMessage(this, formatHireMessage(result, rank));
    if (!result.ok) {
      return;
    }
    this.engineers = [...result.engineers];
    this.nextEngineerId = result.engineer.id + 1;
    this.engineerCountText?.setText(formatEngineerCount(this.engineers.length, MAX_ENGINEERS));
    this.changeFunds(result.fundsAfter, 'hire');
    const payload: EngineerHiredPayload = { engineer: result.engineer, cost: result.cost };
    this.events.emit(ENGINEER_HIRED_EVENT, payload);
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

  // 正常なコードがリリースされたら売上を加算する。不正コード（売上 0）では資金を変えない。
  private onCodeReleased(payload: CodeReleasedPayload): void {
    if (getReleaseRevenue(payload.kind) > 0) {
      this.changeFunds(sellReleasedCode(this.funds, payload.kind), 'sales');
    }
  }

  // 資金の変化ごとに倒産を判定する。倒産したら Tween を止めてゲームオーバー表示を出す。
  private onFundsChanged(event: FundsChangedEvent): void {
    const result = checkBankruptcy(this.gameOver, event.current, this.time.now);
    this.gameOver = result.state;
    if (!result.triggered) {
      return;
    }
    this.tweens.pauseAll();
    drawGameOver(this);
    this.events.emit(GAME_OVER_EVENT, createGameOverEvent('bankruptcy', event.current, this.elapsedMs));
  }

  // ゲームオーバー中で待ち時間を過ぎていれば、最初からやり直す。
  private tryRestart(): void {
    if (canRestart(this.gameOver, this.time.now)) {
      this.scene.restart();
    }
  }

  // 命中した不正なコードの hp を減らし、0以下なら撃破する。対象は id で特定する。正常なコードは資金を減点する（コードは消えない）。
  private onCodeHit(event: CodeHitEvent<ActiveCode>): void {
    const target = this.codes.find((code) => code.id === event.code.id);
    if (target && target.kind === 'normal') {
      const penalty = resolveNormalCodePenalty({
        kind: target.kind,
        funds: this.funds,
        gameOver: this.gameOver.over,
      });
      if (penalty.applied) {
        this.changeFunds(penalty.fundsAfter, 'penalty');
        // 倒産すると tweens.pauseAll() で Tween が止まり、文字の破棄が走らず画面に残るため、倒産時は描画しない。
        if (!this.gameOver.over) {
          drawPenaltyText(this, target.position, penalty.amount);
        }
        const payload: NormalCodePenalizedPayload = {
          id: target.id,
          routeId: target.routeId,
          amount: penalty.amount,
        };
        this.events.emit(NORMAL_CODE_PENALIZED_EVENT, payload);
      }
      return;
    }
    const hp = this.codeHp.get(event.code.id);
    if (!target || target.kind !== 'malicious' || hp === undefined) {
      return;
    }
    const result = applyHit(hp, ATTACK_DAMAGE);
    this.codeHp.set(target.id, result.hp);
    if (!result.defeated) {
      return;
    }
    this.codes = this.codes.filter((code) => code.id !== target.id);
    this.codeHp.delete(target.id);
    this.tweens.killTweensOf(target.graphics);
    drawDefeatEffect(this, target.position);
    target.graphics.destroy();
    const payload: CodeDefeatedPayload = { id: target.id, routeId: target.routeId };
    this.events.emit(CODE_DEFEATED_EVENT, payload);
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
        const code = spawnCode(this.nextCodeId++, pickCodeKind(Math.random, maliciousRateAt(this.elapsedMs)), route);
        if (code.kind === 'malicious') {
          this.codeHp.set(code.id, getInitialHp());
        }
        this.codes.push({ ...code, graphics: drawCode(this, code.kind, code.position) });
      }
    }

    const distance = (codeSpeedAt(this.elapsedMs) * delta) / 1000;
    const flowing: ActiveCode[] = [];
    for (const active of this.codes) {
      const next: ActiveCode = { ...advanceCode(active, distance), graphics: active.graphics };
      // hp を持つのは不正なコードだけ。正常なコードは撃破されない。
      const hp = this.codeHp.get(next.id);
      const fate = resolveCodeFate(hp !== undefined && isDefeated(hp), next.released);
      if (fate === 'defeated') {
        continue;
      }
      if (fate === 'released') {
        this.codeHp.delete(next.id);
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
