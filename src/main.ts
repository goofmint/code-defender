import Phaser from 'phaser';
import './style.css';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';
import {
  ATTACK_DAMAGE,
  ATTACK_KEYS,
  CAT_DELETE_INTERVAL_MS,
  CODE_SPAWN_INTERVAL_MS,
  DEFAULT_REFACTORING_RATIO,
  ENGINEER_HIRE_COST,
  GAME_OVER_RESTART_KEYS,
  HIRE_KEYS,
  INCIDENT_FLASH_COLOR,
  INCIDENT_FLASH_DURATION_MS,
  INITIAL_FUNDS,
  ITEM_BUY_KEYS,
  MAX_ENGINEERS,
  PLAYER_MOVE_KEYS,
  PLAYER_POINTER_DEAD_ZONE,
  REFACTORING_RATIO_KEYS,
  REVENUE_PER_NORMAL_CODE,
  SALARY_ADJUST_KEYS,
  SALARY_SELECT_KEYS,
  TECH_DEBT_INITIAL,
  TECH_DEBT_OUTAGE_FLASH_COLOR,
  TECH_DEBT_OUTAGE_FLASH_DURATION_MS,
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
import { codeSpeedAt, effectiveMaliciousRate, vacationMaliciousRateModifiers } from './difficulty';
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
  drawCumulativeSales,
  drawFunds,
  drawEngineerCount,
  drawGameOver,
  drawHireButtons,
  drawHireMessage,
  drawItemAttackEffect,
  drawItemButtons,
  drawItemMessage,
  drawOutageText,
  drawPlacedItem,
  drawPenaltyText,
  drawPlayer,
  drawRefactoringRatioControl,
  drawReleasePoint,
  drawRoutes,
  drawSalaryButtons,
  drawSelectedEngineer,
  drawTechDebt,
  drawVacationMarker,
  flashCode,
} from './render';
import type { RouteDrawing, VacationMarker } from './render';
import {
  CODE_RELEASED_EVENT,
  advanceCode,
  initialSpawnElapsed,
  moveDistanceUnlessPaused,
  partitionCodesByRoute,
  pickCodeKind,
  spawnCode,
  stepSpawnTimerUnlessPaused,
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
import { accumulateScore, formatCumulativeSales, INITIAL_SCORE } from './score';
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
import { getEngineerSalaries, SALARY_PAID_EVENT } from './salary';
import { applySalaryToAttachment } from './salaryAttachment';
import { ITEM_FEE_PAID_EVENT } from './itemFee';
import { settleMonthBoundary } from './monthBoundary';
import { INCIDENT_EVENT, settleIncident } from './incident';
import { advanceTechDebtNeglect, MAJOR_OUTAGE_EVENT, settleMajorOutage } from './outage';
import { getReleaseRevenue, sellReleasedCode } from './sales';
import {
  createTechDebtChangedEvent,
  formatTechDebt,
  refactoringMaliciousRateModifier,
  resolveWorkTechDebt,
  TECH_DEBT_CHANGED_EVENT,
  techDebtMaliciousRateModifier,
  techDebtSpawnIntervalMs,
} from './techDebt';
import type { TechDebtChangeReason, WorkTechDebtResult } from './techDebt';
import { formatRefactoringAllocation, stepRefactoringRatio } from './refactoringRatioControl';
import type { RefactoringRatioDirection } from './refactoringRatioControl';
import {
  adjustEngineerSalary,
  advanceEngineersAttachment,
  assignEngineerRoute,
  createInitialFleet,
  ENGINEER_HIRED_EVENT,
  ENGINEER_RANKS,
  ENGINEER_RESIGNED_EVENT,
  findEngineerByRoute,
  formatEngineerCount,
  formatHireMessage,
  formatResignedMessage,
  formatSalaryMessage,
  formatSelectedEngineer,
  hireEngineer,
  isAssigneeOnVacation,
  selectAdjacentEngineerId,
  isEngineerOnVacation,
  isRouteOnVacation,
  partitionResignedEngineers,
  shouldAddRouteOnHire,
  toggleEngineerVacation,
} from './engineer';
import type {
  Engineer,
  EngineerHiredPayload,
  EngineerResignedPayload,
  EngineerSelectDirection,
  SalaryDirection,
} from './engineer';
import { addRoute, cellCenter, removeRoute } from './route';
import { CODE_DELETED_BY_CAT_EVENT, pickRandomCode } from './cat';
import type { CodeDeletedByCatPayload } from './cat';
import { getItemDamage, isRandomDeleteItem, ITEM_TYPES } from './item';
import type { ItemType } from './item';
import {
  canItemAttack,
  createItemState,
  findItemTarget,
  formatItemMessage,
  ITEM_PLACED_EVENT,
  pointToCell,
  purchaseItem,
} from './itemPlacement';
import type { ItemPlacedPayload, PlacedItem } from './itemPlacement';
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
  // ゲーム内の経過ミリ秒（累積）。個別の休暇(#36)ではゲーム時計を止めない。一時停止で止めるかは未決定で、止める場合は加算をやめるだけでよい。
  private elapsedMs = 0;
  private elapsedDaysText?: Phaser.GameObjects.Text;
  private displayedDays = 0;
  private funds = 0;
  private fundsText?: Phaser.GameObjects.Text;
  private score = INITIAL_SCORE;
  private salesText?: Phaser.GameObjects.Text;
  // 技術的負債（0〜TECH_DEBT_MAX）。資金とは別。変更は changeTechDebt に集約する。
  private techDebt = TECH_DEBT_INITIAL;
  private techDebtText?: Phaser.GameObjects.Text;
  // 技術的負債が閾値を超えたまま続けて放置された時間（ミリ秒）(#46)。閾値以下に下がる・大障害が起きると 0 に戻る。
  private techDebtNeglectMs = 0;
  // リファクタリングの割合（0〜1）。割合を指定するUI（docs/tasks.md 8）が変更する想定。今は初期値のまま。
  private refactoringRatio = DEFAULT_REFACTORING_RATIO;
  // 割合UI(#40)の割合表示。割合の値そのものは refactoringRatio だけに持つ。
  private refactoringRatioText?: Phaser.GameObjects.Text;
  private gameOver: GameOverState = INITIAL_GAME_OVER_STATE;
  private engineers: Engineer[] = [];
  private nextEngineerId = 0;
  private engineerCountText?: Phaser.GameObjects.Text;
  private hireMessageText?: Phaser.GameObjects.Text;
  // 昇給・減給(#34)の対象。名簿の並びではなく id で持つ（assignEngineerRoute などで配列が置き換わっても選択を保つ）。
  private selectedEngineerId: number | null = null;
  private selectedEngineerText?: Phaser.GameObjects.Text;
  private placedItems: readonly PlacedItem[] = [];
  private nextItemId = 0;
  private itemMessageText?: Phaser.GameObjects.Text;
  // 休暇の切り替えマーカー（routeId がキー）(#35)。
  private vacationMarkers = new Map<number, VacationMarker>();
  // ルートの線と出現場所の円（routeId がキー）(#32)。退職でルートが消えるときに destroy() する。
  private routeDrawings = new Map<number, RouteDrawing>();

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
    this.score = INITIAL_SCORE;
    this.salesText = drawCumulativeSales(this, this.score);
    this.techDebt = TECH_DEBT_INITIAL;
    this.techDebtNeglectMs = 0;
    this.refactoringRatio = DEFAULT_REFACTORING_RATIO;
    this.techDebtText = drawTechDebt(this, this.techDebt);
    this.refactoringRatioText = drawRefactoringRatioControl(
      this,
      formatRefactoringAllocation(this.refactoringRatio),
      (direction) => this.changeRefactoringRatio(direction),
    );
    this.events.on(MONTH_ELAPSED_EVENT, this.onMonthElapsed, this);
    this.events.on(FUNDS_CHANGED_EVENT, this.onFundsChanged, this);
    this.events.on(CODE_HIT_EVENT, this.onCodeHit, this);
    this.events.on(CODE_RELEASED_EVENT, this.onCodeReleased, this);
    this.events.on(ENGINEER_HIRED_EVENT, this.onEngineerHired, this);
    this.events.on(ENGINEER_RESIGNED_EVENT, this.onEngineerResigned, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(MONTH_ELAPSED_EVENT, this.onMonthElapsed, this);
      this.events.off(FUNDS_CHANGED_EVENT, this.onFundsChanged, this);
      this.events.off(CODE_HIT_EVENT, this.onCodeHit, this);
      this.events.off(CODE_RELEASED_EVENT, this.onCodeReleased, this);
      this.events.off(ENGINEER_HIRED_EVENT, this.onEngineerHired, this);
      this.events.off(ENGINEER_RESIGNED_EVENT, this.onEngineerResigned, this);
    });
    const fleet = createInitialFleet(Math.random);
    this.routes = fleet.routes;
    this.codes = [];
    this.spawnElapsed = new Map();
    this.nextCodeId = 0;
    this.codeHp = new Map();
    this.routeDrawings = drawRoutes(this, this.routes);
    this.vacationMarkers = new Map();
    this.routes.forEach((route) => this.addVacationMarker(route));
    this.engineers = fleet.engineers;
    this.nextEngineerId = fleet.nextEngineerId;
    this.hireMessageText = undefined;
    this.engineerCountText = drawEngineerCount(this, this.engineers.length, MAX_ENGINEERS);
    drawHireButtons(
      this,
      ENGINEER_RANKS.map((entry) => ({ rank: entry.id, cost: ENGINEER_HIRE_COST[entry.id] })),
      (rank) => this.hire(rank),
    );
    // scene.restart() でも前回の選択を残さない。初期値は先頭のエンジニア（名簿が空なら null）。
    this.selectedEngineerId = selectAdjacentEngineerId(this.engineers, null, 'next');
    this.selectedEngineerText = drawSelectedEngineer(this, this.findSelectedEngineer());
    drawSalaryButtons(
      this,
      (direction) => this.selectEngineer(direction),
      (direction) => this.adjustSalary(direction),
    );
    const itemState = createItemState();
    this.placedItems = itemState.placedItems;
    this.nextItemId = itemState.nextId;
    this.itemMessageText = undefined;
    drawItemButtons(this, ITEM_TYPES, (itemType) => this.buyItem(itemType));
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
      keyboard.addKey(SALARY_SELECT_KEYS.previous).on('down', () => this.selectEngineer('previous'));
      keyboard.addKey(SALARY_SELECT_KEYS.next).on('down', () => this.selectEngineer('next'));
      keyboard.addKey(SALARY_ADJUST_KEYS.raise).on('down', () => this.adjustSalary('raise'));
      keyboard.addKey(SALARY_ADJUST_KEYS.cut).on('down', () => this.adjustSalary('cut'));
      ITEM_BUY_KEYS.forEach((name, index) =>
        keyboard.addKey(name).on('down', () => this.buyItem(ITEM_TYPES[index])),
      );
      keyboard.addKey(REFACTORING_RATIO_KEYS.feature).on('down', () => this.changeRefactoringRatio('feature'));
      keyboard.addKey(REFACTORING_RATIO_KEYS.refactoring).on('down', () => this.changeRefactoringRatio('refactoring'));
      register(GAME_OVER_RESTART_KEYS).forEach((key) => key.on('down', () => this.tryRestart()));
    }
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      if (this.gameOver.over) {
        this.tryRestart();
        return;
      }
      // 雇うボタン・休暇マーカー上の押下では、離すまで主人公の移動・攻撃をしない。
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
    // 愛着心が最低になったエンジニアは毎フレーム判定して退職させる(#32)。月次処理（advanceClock）より前に置き、退職者に給料を払わない。
    this.resignEngineers();
    const prevElapsedMs = this.elapsedMs;
    this.advanceClock(delta);
    // 月の給料で倒産したら、同じフレームの移動・コードの更新はしない。
    if (this.gameOver.over) {
      return;
    }
    // ゲーム内時計と同じ経過時間（サニタイズ済みの差分）で技術的負債の放置時間を進める(#46)。
    this.updateTechDebtNeglect(this.elapsedMs - prevElapsedMs);
    // 大障害で倒産したら、同じフレームの移動・コードの更新はしない。
    if (this.gameOver.over) {
      return;
    }
    // ゲーム内時計と同じ経過時間で愛着心を進める(#30、休暇中は上がり、配属中に高疲労なら下がる)。
    this.engineers = advanceEngineersAttachment(this.engineers, this.elapsedMs - prevElapsedMs);
    this.updatePlayer(delta);
    this.updateCodes(delta);
    this.updateItems(this.time.now);
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

  // 技術的負債を変更して、表示更新と TECH_DEBT_CHANGED_EVENT の発行を一か所で行う（changeFunds と同じ形）。
  // 変化がないとき（上限・0 で止まったときなど）はイベントを発行しない。後続タスク（開発スピード低下・大障害など）はこのイベントを購読する。
  private changeTechDebt(result: WorkTechDebtResult, reason: TechDebtChangeReason): void {
    const previous = this.techDebt;
    this.techDebt = result.current;
    this.techDebtText?.setText(formatTechDebt(result.current));
    const event = createTechDebtChangedEvent(previous, result.current, reason);
    if (event.delta !== 0) {
      this.events.emit(TECH_DEBT_CHANGED_EVENT, event);
    }
  }

  // 機能開発とリファクタリングの割合を1段階寄せる(#40)。ゲームオーバー中と、両端で値が変わらないときは何もしない。
  // 次のリリースから resolveWorkTechDebt に新しい割合が使われる。
  private changeRefactoringRatio(direction: RefactoringRatioDirection): void {
    if (this.gameOver.over) {
      return;
    }
    const next = stepRefactoringRatio(this.refactoringRatio, direction);
    if (next === this.refactoringRatio) {
      return;
    }
    this.refactoringRatio = next;
    this.refactoringRatioText?.setText(formatRefactoringAllocation(next));
  }

  // ランクを指定して雇う。ゲームオーバー中は何もしない。費用は changeFunds を通して引く（倒産判定もここで動く）。
  // ルートの追加は ENGINEER_HIRED_EVENT を購読する onEngineerHired が行う。
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
    // 選択中のエンジニアがいなければ（0人から雇ったときなど）、雇ったエンジニアを選ぶ。
    if (this.findSelectedEngineer() === null) {
      this.selectedEngineerId = result.engineer.id;
    }
    this.refreshSelectedEngineer();
    this.changeFunds(result.fundsAfter, 'hire');
    const payload: EngineerHiredPayload = { engineer: result.engineer, cost: result.cost };
    this.events.emit(ENGINEER_HIRED_EVENT, payload);
  }

  // 選択中のエンジニア。選択なし・名簿にいなければ null。
  private findSelectedEngineer(): Engineer | null {
    return this.engineers.find((engineer) => engineer.id === this.selectedEngineerId) ?? null;
  }

  private refreshSelectedEngineer(): void {
    this.selectedEngineerText?.setText(formatSelectedEngineer(this.findSelectedEngineer()));
  }

  // 昇給・減給の対象を前・次のエンジニアに切り替える。ゲームオーバー中は何もしない。
  private selectEngineer(direction: EngineerSelectDirection): void {
    if (this.gameOver.over) {
      return;
    }
    this.selectedEngineerId = selectAdjacentEngineerId(this.engineers, this.selectedEngineerId, direction);
    this.refreshSelectedEngineer();
  }

  // 仮・要確認(#34): 選択中のエンジニアを昇給・減給する。ゲームオーバー中は何もしない。
  // 変えた額はすぐ Engineer.salary に入り、次の月次精算（onMonthElapsed → getEngineerSalaries）から支払う。手数料はかけない（changeFunds は呼ばない）。
  // メッセージは雇用メッセージと同じ場所に出し、直前の雇用・給与メッセージは消す。
  private adjustSalary(direction: SalaryDirection): void {
    if (this.gameOver.over) {
      return;
    }
    const result = adjustEngineerSalary(this.engineers, this.selectedEngineerId, direction);
    this.hireMessageText?.destroy();
    this.hireMessageText = drawHireMessage(this, formatSalaryMessage(result));
    if (!result.ok) {
      return;
    }
    this.engineers = [...result.engineers];
    this.refreshSelectedEngineer();
  }

  // 主人公がいるセルにアイテムを買って置く。ゲームオーバー中は何もしない。費用は changeFunds を通して引く（倒産判定もここで動く）。
  private buyItem(itemType: ItemType): void {
    const player = this.player;
    if (this.gameOver.over || !player) {
      return;
    }
    const result = purchaseItem(
      { funds: this.funds, placedItems: this.placedItems, nextId: this.nextItemId, gameOver: this.gameOver.over },
      itemType,
      pointToCell({ x: player.x, y: player.y }),
      { routes: this.routes },
    );
    this.itemMessageText?.destroy();
    this.itemMessageText = drawItemMessage(this, formatItemMessage(result, itemType));
    if (!result.ok) {
      return;
    }
    this.placedItems = result.placedItems;
    this.nextItemId = result.item.id + 1;
    drawPlacedItem(this, result.item);
    this.changeFunds(result.fundsAfter, 'item');
    const payload: ItemPlacedPayload = { item: result.item, price: result.price };
    this.events.emit(ITEM_PLACED_EVENT, payload);
  }

  // 置いたアイテムが、範囲内で最も近い不正なコードを自動で攻撃する。ゲームオーバー中はしない。
  // 猫(#57)は攻撃せず、場のコードをランダムに1つ消す（deleteCodeByCat）。
  private updateItems(now: number): void {
    if (this.gameOver.over) {
      return;
    }
    this.placedItems = this.placedItems.map((item) => {
      if (isRandomDeleteItem(item.itemType)) {
        return this.deleteCodeByCat(item, now);
      }
      if (!canItemAttack(now, item.lastAttackTime)) {
        return item;
      }
      const target = findItemTarget(item, this.codes);
      if (!target) {
        return item;
      }
      drawItemAttackEffect(this, cellCenter(item.cell), target.position);
      flashCode(this, target.graphics);
      this.damageMaliciousCode(target, getItemDamage(item.itemType, target.maliciousType));
      return { ...item, lastAttackTime: now };
    });
  }

  // 猫(#57): 発動間隔ごとに、その時点の this.codes から正常・不正を問わず1つ選んで消す。HP・売上・罰金・インシデントは通さない。
  // 消すコードがなければ何もせず、最後に消した時刻も変えない（コードが出たらすぐ消せる）。
  // 同じフレームに猫が複数いても、猫ごとに最新の this.codes を読み直すので同じコードを二度消さない。
  private deleteCodeByCat(item: PlacedItem, now: number): PlacedItem {
    if (!canItemAttack(now, item.lastAttackTime, CAT_DELETE_INTERVAL_MS)) {
      return item;
    }
    const target = pickRandomCode(Math.random, this.codes);
    if (!target) {
      return item;
    }
    this.removeActiveCode(target);
    drawItemAttackEffect(this, cellCenter(item.cell), target.position);
    const payload: CodeDeletedByCatPayload = {
      id: target.id,
      kind: target.kind,
      routeId: target.routeId,
      maliciousType: target.maliciousType,
    };
    this.events.emit(CODE_DELETED_BY_CAT_EVENT, payload);
    return { ...item, lastAttackTime: now };
  }

  // 雇ったらルートと出現場所を追加し、雇ったエンジニアに割り当てる。ゲームオーバー中・追加できないときは routeId を null のままにする。
  private onEngineerHired(payload: EngineerHiredPayload): void {
    if (!shouldAddRouteOnHire(this.gameOver.over)) {
      return;
    }
    const route = this.addEngineerRoute();
    if (route === undefined) {
      return;
    }
    this.engineers = assignEngineerRoute(this.engineers, payload.engineer.id, route.id);
  }

  // 愛着心が最低のエンジニアを名簿から外し、1人ずつ ENGINEER_RESIGNED_EVENT を発行する(#32)。
  // 二重に退職させないよう、発行より前に this.engineers を残る人の配列に置き換える。
  private resignEngineers(): void {
    const { remaining, resigned } = partitionResignedEngineers(this.engineers);
    if (resigned.length === 0) {
      return;
    }
    this.engineers = remaining;
    for (const engineer of resigned) {
      const payload: EngineerResignedPayload = { engineer, routeId: engineer.routeId };
      this.events.emit(ENGINEER_RESIGNED_EVENT, payload);
    }
  }

  // 退職者のルートと関連状態（線・出現場所・休暇マーカー・生成タイマー・流れているコード）を片付ける(#32)。
  // 流れているコードは精算せずに消す（撃破エフェクト・資金・売上・技術的負債・障害・CODE_DEFEATED/CODE_RELEASED イベントなし）。
  // 全員が退職してもゲームは続ける（0人から雇い直せる）。
  private onEngineerResigned(payload: EngineerResignedPayload): void {
    this.engineerCountText?.setText(formatEngineerCount(this.engineers.length, MAX_ENGINEERS));
    // 昇給・減給の選択中の人が退職したら、残る先頭の人を選ぶ（いなければ null）。
    if (this.findSelectedEngineer() === null) {
      this.selectedEngineerId = selectAdjacentEngineerId(this.engineers, null, 'next');
    }
    this.refreshSelectedEngineer();
    this.hireMessageText?.destroy();
    this.hireMessageText = drawHireMessage(this, formatResignedMessage(payload.engineer));
    const { routeId } = payload;
    if (routeId === null) {
      return;
    }
    this.routes = removeRoute(this.routes, routeId);
    const drawing = this.routeDrawings.get(routeId);
    if (drawing !== undefined) {
      drawing.line.destroy();
      drawing.spawnMarker.destroy();
      drawing.spawnDecoration.destroy();
      this.routeDrawings.delete(routeId);
    }
    // マーカーを destroy() すると入力も外れ、toggleVacation のコールバックは呼ばれなくなる。
    this.vacationMarkers.get(routeId)?.container.destroy();
    this.vacationMarkers.delete(routeId);
    this.spawnElapsed.delete(routeId);
    const { remaining, removed } = partitionCodesByRoute(this.codes, routeId);
    removed.forEach((code) => this.discardCode(code));
    this.codes = remaining;
  }

  // 流れているコードを精算せずに消す(#32)。codes 配列からの削除は呼び出し側で行う。
  private discardCode(code: ActiveCode): void {
    this.codeHp.delete(code.id);
    this.tweens.killTweensOf(code.graphics);
    code.graphics.destroy();
  }

  // 月の境界ごとに給料、続けて月額アイテムの費用を引く。給料は雇っているエンジニアそれぞれのランク別月給の合計（主人公の給料は含めない）。
  // 給料の対象は this.engineers の全員（ルート未割当・休暇中も含む）(#37)。休暇などの状態で this.engineers を絞ってから渡さない。
  private onMonthElapsed(event: MonthElapsedEvent): void {
    const { salary, itemFee } = settleMonthBoundary(
      this.funds,
      event.month,
      getEngineerSalaries(this.engineers),
      this.placedItems,
      this.gameOver.over,
    );
    this.changeFunds(salary.fundsAfter, 'salary');
    this.events.emit(SALARY_PAID_EVENT, salary);
    // 給料を払ったあと、ゲームオーバーでなければ月給と初期額の差で愛着心を動かす(#31)。給料で倒産した月とそれ以降は動かさない。
    if (!this.gameOver.over) {
      this.engineers = applySalaryToAttachment(this.engineers);
    }
    // 給料のあとに月額アイテムの費用を引く（給料で倒産していたら itemFee は null）。
    if (itemFee === null) return;
    this.changeFunds(itemFee.fundsAfter, 'itemFee');
    this.events.emit(ITEM_FEE_PAID_EVENT, itemFee);
  }

  // 資金の変化ごとに倒産を判定する。倒産したら Tween を止めてゲームオーバー表示を出す。
  private onFundsChanged(event: FundsChangedEvent): void {
    this.score = accumulateScore(this.score, event, this.gameOver.over);
    this.salesText?.setText(formatCumulativeSales(this.score));
    const result = checkBankruptcy(this.gameOver, event.current, this.time.now);
    this.gameOver = result.state;
    if (!result.triggered) {
      return;
    }
    this.tweens.pauseAll();
    drawGameOver(this, this.score, getElapsedDays(this.elapsedMs));
    this.events.emit(GAME_OVER_EVENT, createGameOverEvent('bankruptcy', event.current, this.elapsedMs));
  }

  // 正常なコードがリリースされたら売上を加算する。不正コード（売上 0）では売上は変えない。
  // 不正コードのリリースは障害として扱い、損害ぶん資金を減らす。倒産判定は FUNDS_CHANGED_EVENT 経由（onFundsChanged）。
  private onCodeReleased(payload: CodeReleasedPayload): void {
    // 売上は現在の配分（機能開発の割合）に比例する。リファクタリング100%では売上 0 なので資金は変えない。
    if (getReleaseRevenue(payload.kind, REVENUE_PER_NORMAL_CODE, this.refactoringRatio) > 0) {
      this.changeFunds(
        sellReleasedCode(this.funds, payload.kind, REVENUE_PER_NORMAL_CODE, this.refactoringRatio),
        'sales',
      );
    }
    // 正常なコードのリリース1件を作業1単位として技術的負債を精算する（売上が 0 でも精算する）。ゲームオーバー中は精算しない。
    if (payload.kind === 'normal' && !this.gameOver.over) {
      this.changeTechDebt(resolveWorkTechDebt(this.techDebt, this.refactoringRatio), 'work');
    }
    const incident = settleIncident(this.funds, payload, this.gameOver);
    if (incident === null) {
      return;
    }
    this.changeFunds(incident.fundsAfter, 'damage');
    const { r, g, b } = Phaser.Display.Color.IntegerToRGB(INCIDENT_FLASH_COLOR);
    this.cameras.main.flash(INCIDENT_FLASH_DURATION_MS, r, g, b);
    this.events.emit(INCIDENT_EVENT, incident);
  }

  // 技術的負債が閾値を超えたまま猶予時間を過ぎたら大障害を起こし、損害ぶん資金を減らす(#46)。
  // 倒産判定は FUNDS_CHANGED_EVENT 経由（onFundsChanged）。演出とイベントの順序は onCodeReleased の障害と同じ。
  private updateTechDebtNeglect(deltaMs: number): void {
    const neglect = advanceTechDebtNeglect(this.techDebtNeglectMs, this.techDebt, deltaMs);
    this.techDebtNeglectMs = neglect.neglectMs;
    if (!neglect.outage) {
      return;
    }
    const outage = settleMajorOutage(this.funds, this.techDebt, neglect.neglectedMs, this.gameOver);
    if (outage === null) {
      return;
    }
    this.changeFunds(outage.fundsAfter, 'damage');
    const { r, g, b } = Phaser.Display.Color.IntegerToRGB(TECH_DEBT_OUTAGE_FLASH_COLOR);
    this.cameras.main.flash(TECH_DEBT_OUTAGE_FLASH_DURATION_MS, r, g, b);
    // 倒産すると tweens.pauseAll() で Tween が止まり、文字の破棄が走らず画面に残るため、倒産時は描画しない。
    if (!this.gameOver.over) {
      drawOutageText(this);
    }
    this.events.emit(MAJOR_OUTAGE_EVENT, outage);
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
    if (!target) {
      return;
    }
    this.damageMaliciousCode(target, ATTACK_DAMAGE);
  }

  // 不正なコードの hp を減らし、0以下なら撃破する（主人公・アイテム共通）。正常なコードや hp を持たないコードは何もしない。
  private damageMaliciousCode(target: ActiveCode, damage: number): void {
    const hp = this.codeHp.get(target.id);
    if (target.kind !== 'malicious' || hp === undefined) {
      return;
    }
    const result = applyHit(hp, damage);
    this.codeHp.set(target.id, result.hp);
    if (!result.defeated) {
      return;
    }
    this.removeActiveCode(target);
    drawDefeatEffect(this, target.position);
    const payload: CodeDefeatedPayload = { id: target.id, routeId: target.routeId };
    this.events.emit(CODE_DEFEATED_EVENT, payload);
  }

  // 流れているコードを精算せずに場から取り除く（撃破・猫 #57 共通）。this.codes から外し、hp・tween・描画は discardCode(#32) で片付ける。
  // イベントは呼び出し側が、この後（配列を更新した後）に発行する。
  private removeActiveCode(target: ActiveCode): void {
    this.codes = this.codes.filter((code) => code.id !== target.id);
    this.discardCode(target);
  }

  // 不正コード率の補正（パーセントポイントの差分）の一覧(#13)。effectiveMaliciousRate に渡す。
  // 実装済み: #39 休暇（担当エンジニア単位の減少。vacationMaliciousRateModifiers）、
  // #45 技術的負債（プロダクト全体の増加。techDebtMaliciousRateModifier。負債 0 では差分 0 を加える）。
  // 負債はコード生成のたびに this.techDebt から計算する。同じフレームのリリースで負債が変わった場合は、次回の updateCodes の生成から反映される。
  // #41 リファクタリング（プロダクト全体の減少。refactoringMaliciousRateModifier）。
  // 今後の補正はこの配列に差分を追加して合成する。
  private maliciousRateModifiersFor(engineer: Engineer | undefined): readonly number[] {
    return [
      ...vacationMaliciousRateModifiers(engineer),
      techDebtMaliciousRateModifier(this.techDebt),
      refactoringMaliciousRateModifier(this.refactoringRatio),
    ];
  }

  private updateCodes(delta: number): void {
    // 技術的負債に応じて生成間隔を延ばす(#44)。フレーム開始時の負債で1回だけ計算し、全ルートに同じ間隔を使う。
    // フレーム内（リリース精算など）で負債が変わっても、反映は次のフレームから。
    // 新規ルートの初期値にも同じ間隔を渡し、負債があっても最初の更新ですぐ1個生成されるようにする（既存の挙動を維持）。
    const spawnIntervalMs = techDebtSpawnIntervalMs(this.techDebt, CODE_SPAWN_INTERVAL_MS);
    for (const route of this.routes) {
      // 担当者はルートごとに 1 回だけ検索し、休暇の判定(#36)と不正コード率の計算で使い回す。
      const engineer = findEngineerByRoute(this.engineers, route.id);
      // 担当者の休暇中は生成タイマーを止める(#36)。解除後は止めた時点の経過時間から再開する。
      // 生成間隔は技術的負債で延びた実効間隔(#44)を使う。
      const step = stepSpawnTimerUnlessPaused(
        this.spawnElapsed.get(route.id) ?? initialSpawnElapsed(spawnIntervalMs),
        delta,
        spawnIntervalMs,
        isAssigneeOnVacation(engineer),
      );
      this.spawnElapsed.set(route.id, step.elapsedMs);
      if (step.spawn) {
        // 担当エンジニアのランクに応じた割合(#12)に補正(#13)を加える。担当者がいないルートは既定の割合を使う。
        const rank = engineer?.rank;
        const rate = effectiveMaliciousRate(rank, this.elapsedMs, this.maliciousRateModifiersFor(engineer));
        const code = spawnCode(this.nextCodeId++, pickCodeKind(Math.random, rate), route);
        if (code.kind === 'malicious') {
          this.codeHp.set(code.id, getInitialHp());
        }
        this.codes.push({ ...code, graphics: drawCode(this, code.kind, code.position) });
      }
    }

    const distance = (codeSpeedAt(this.elapsedMs) * delta) / 1000;
    const flowing: ActiveCode[] = [];
    for (const [index, active] of this.codes.entries()) {
      // 同じフレームで倒産したら、残りのコードは処理せず流れたままにする（追加の損害を出さない）。
      if (this.gameOver.over) {
        flowing.push(...this.codes.slice(index));
        break;
      }
      // 担当者の休暇中はそのルートのコードを進めない(#36)。流れたまま残るので攻撃はできる。
      const moved = moveDistanceUnlessPaused(distance, isRouteOnVacation(this.engineers, active.routeId));
      const next: ActiveCode = { ...advanceCode(active, moved), graphics: active.graphics };
      // hp を持つのは不正なコードだけ。正常なコードは撃破されない。
      const hp = this.codeHp.get(next.id);
      const fate = resolveCodeFate(hp !== undefined && isDefeated(hp), next.released);
      if (fate === 'defeated') {
        continue;
      }
      if (fate === 'released') {
        this.codeHp.delete(next.id);
        next.graphics.destroy();
        const payload: CodeReleasedPayload = {
          id: next.id,
          kind: next.kind,
          routeId: next.routeId,
          maliciousType: next.maliciousType,
        };
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
    drawRoutes(this, [route]).forEach((drawing, routeId) => this.routeDrawings.set(routeId, drawing));
    this.addVacationMarker(route);
    return route;
  }

  // ルートの出現場所に休暇の切り替えマーカーを重ねる(#35)。
  private addVacationMarker(route: Route): void {
    this.vacationMarkers.set(
      route.id,
      drawVacationMarker(this, route, () => this.toggleVacation(route.id)),
    );
  }

  // ルートを担当するエンジニアの休暇を切り替えて、マーカーの表示を更新する(#35)。ゲームオーバー中・担当がいないときは何もしない。
  // 資金・スコアは変えない。コードの停止(#36)は次の updateCodes で onVacation から反映する。
  // 休暇中も給料は引く(#37): onMonthElapsed は this.engineers 全員の給料を引くので、ここでは給料の処理をしない。
  // 休暇を始めると担当エンジニアの不正コード率が下がる(#39、setEngineerVacation で累積し、次に生成するコードから反映)。
  // 休暇中は担当エンジニアの愛着心が時間経過で上がる(#30、update の advanceEngineersAttachment が onVacation から反映)。
  private toggleVacation(routeId: number): void {
    if (this.gameOver.over) {
      return;
    }
    const engineer = findEngineerByRoute(this.engineers, routeId);
    if (engineer === undefined) {
      return;
    }
    const marker = this.vacationMarkers.get(routeId);
    if (marker === undefined) {
      throw new Error(`休暇マーカーが見つかりません: routeId=${routeId}`);
    }
    this.engineers = toggleEngineerVacation(this.engineers, engineer.id);
    const updated = findEngineerByRoute(this.engineers, routeId);
    if (updated === undefined) {
      throw new Error(`休暇を切り替えたエンジニアが見つかりません: routeId=${routeId}`);
    }
    marker.setOnVacation(isEngineerOnVacation(updated));
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
