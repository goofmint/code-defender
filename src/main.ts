import Phaser from 'phaser';
import './style.css';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';
import {
  ATTACK_DAMAGE,
  CAT_DELETE_INTERVAL_MS,
  CI_INTERCEPT_RATE,
  CI_SLOW_MULTIPLIER,
  CODE_FREEZE_DURATION_MS,
  CODE_SPAWN_INTERVAL_MS,
  DEFAULT_REFACTORING_RATIO,
  ENGINEER_HIRE_COST,
  FRIDAY_DEPLOY_INCIDENT_DAMAGE_POINTS,
  FRIDAY_DEPLOY_INCIDENT_DELAY_MS,
  FRIDAY_DEPLOY_SALES,
  INCIDENT_FLASH_COLOR,
  INCIDENT_FLASH_DURATION_MS,
  INITIAL_FUNDS,
  INITIAL_PLACEMENT_START_BUTTON_ALPHA,
  INITIAL_PLACEMENT_UI_BOUNDS,
  ITEM_BLOCKED_RECTS,
  ITEM_PAGE_SIZE,
  MAX_ENGINEERS,
  PIZZA_DURATION_MS,
  PIZZA_TECH_DEBT,
  PLAYER_POINTER_DEAD_ZONE,
  PLAYER_SPEED,
  REVENUE_PER_NORMAL_CODE,
  TECH_DEBT_INITIAL,
  TECH_DEBT_OUTAGE_FLASH_COLOR,
  TECH_DEBT_OUTAGE_FLASH_DURATION_MS,
  WORKS_FINE_DURATION_MS,
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
import { clampToField, facingFromHorizontal, getPointerDirection, movePlayerToward } from './player';
import {
  drawAttackEffect,
  drawBalanceMenu,
  drawCode,
  drawDefeatEffect,
  drawElapsedDays,
  drawEngineerMenu,
  drawEngineerPopover,
  drawField,
  drawGameOver,
  drawHelpIcon,
  drawHelpOverlay,
  drawHireMessage,
  drawEngineerCandidateOverlay,
  drawInitialPlacementEngineerButton,
  drawInitialPlacementMessage,
  drawInitialPlacementPanel,
  drawInitialPlacementStartButton,
  drawItemAttackEffect,
  drawItemMenu,
  drawItemMessage,
  drawMenuIcons,
  drawOutageText,
  drawPlacedItem,
  drawPlacementPreview,
  drawPenaltyText,
  drawPlayer,
  drawReleaseBurst,
  drawReleasePoint,
  drawRemoveButton,
  drawRoutes,
  drawStatusPanel,
  drawVacationMarker,
  flashCode,
  setPlayerFacing,
  updatePlacementPreview,
} from './render';
import type {
  EngineerSelectButton,
  FloatingPanel,
  ItemMenuView,
  MenuIcons,
  RouteDrawing,
  StatusPanel,
  VacationMarker,
} from './render';
import {
  CODE_RELEASED_EVENT,
  advanceCode,
  initialSpawnElapsed,
  moveDistanceUnlessPaused,
  partitionCodesByRoute,
  pickCodeKind,
  remainingPathDistance,
  rewindCode,
  spawnCode,
  stepSpawnTimerUnlessPaused,
} from './codeFlow';
import type { CodeReleasedPayload, FlowingCode } from './codeFlow';
import {
  advanceElapsedMs,
  createMonthElapsedEvent,
  getCrossedMonths,
  getElapsedDays,
  MONTH_ELAPSED_EVENT,
} from './gameTime';
import type { MonthElapsedEvent } from './gameTime';
import { applyHit, CODE_DEFEATED_EVENT, getInitialHp, isDefeated, resolveCodeFate } from './defeat';
import type { CodeDefeatedPayload } from './defeat';
import { addFunds, createFundsChangedEvent, FUNDS_CHANGED_EVENT } from './funds';
import type { FundsChangedEvent, FundsChangeReason } from './funds';
import { accumulateScore, INITIAL_SCORE } from './score';
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
import {
  AI_AGENT_EQUIPPED_EVENT,
  aiAgentMaliciousRateModifiers,
  aiAgentSpawnIntervalMs,
  equipAiAgent,
  formatAiAgentMessage,
} from './aiAgent';
import type { AiAgentEquippedPayload, AiAgentType } from './aiAgent';
import { getMonthEndPaymentForecast, settleMonthBoundary } from './monthBoundary';
import {
  calculateDamage,
  INCIDENT_EVENT,
  INCIDENT_PREVENTED_EVENT,
  settleIncident,
  settleScheduledIncident,
} from './incident';
import type { IncidentEvent, IncidentPreventedPayload } from './incident';
import { advanceTechDebtNeglect, MAJOR_OUTAGE_EVENT, settleMajorOutage } from './outage';
import { getReleaseRevenue, sellReleasedCode } from './sales';
import {
  accumulateTechDebt,
  createTechDebtChangedEvent,
  refactoringMaliciousRateModifier,
  resolveWorkTechDebt,
  TECH_DEBT_CHANGED_EVENT,
  techDebtMaliciousRateModifier,
  techDebtSpawnIntervalMs,
} from './techDebt';
import type { TechDebtChangeReason, WorkTechDebtResult } from './techDebt';
import { stepRefactoringRatio } from './refactoringRatioControl';
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
  formatHireMessage,
  formatResignedMessage,
  formatSalaryMessage,
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
import { addRoute, cellCenter, pointToRouteCell, removeRoute } from './route';
import { CODE_DELETED_BY_CAT_EVENT, pickRandomCode } from './cat';
import type { CodeDeletedByCatPayload } from './cat';
import {
  getItemActivation,
  getItemDamage,
  getItemPlacement,
  getItemRange,
  isAttackItem,
  isFollowItem,
  isRandomDeleteItem,
  ITEM_DEFINITIONS,
  unlockedItemTypes,
} from './item';
import { formatLevelAndDays, levelAt } from './level';
import { advanceHold, applyHold, getItemHoldMs } from './itemHold';
import { ciSlowedDistance, hasActiveCi, rollCiInterception } from './ci';
import { pickMaliciousType } from './maliciousCode';
import type { ItemType } from './item';
import {
  canItemAttack,
  countItemsCovering,
  createItemState,
  findCodesToReveal,
  findItemTarget,
  formatItemMessage,
  formatItemOption,
  getItemAttackCooldownMs,
  getItemOrigin,
  isIncidentPreventedByNote,
  isPointInField,
  ITEM_PLACED_EVENT,
  ITEM_USED_EVENT,
  placementCellCenter,
  pointToPlacementCell,
  purchaseInstantItem,
  purchaseItem,
  shouldItemHesitate,
} from './itemPlacement';
import type { ItemPlacedPayload, ItemUsedPayload, PlacedItem } from './itemPlacement';
import {
  canStartPlay,
  countUnplacedEngineers,
  createInitialPlacementState,
  engineerRemoveButtonCenter,
  finishInitialPlacement,
  formatEngineerPlacementMessage,
  formatInitialPlacementEngineerButton,
  formatInitialPlacementItemButton,
  formatInitialPlacementMessage,
  formatInitialPlacementPanel,
  itemRemoveButtonCenter,
  listEngineerCandidateCells,
  placeInitialEngineer,
  placeInitialItem,
  removeInitialEngineer,
  removeInitialItem,
} from './initialPlacement';
import type { InitialPlacementContext, InitialPlacementSelection, InitialPlacementState } from './initialPlacement';
import {
  getPlayingPlacementPreview,
  getSetupPlacementPreview,
  HIDDEN_PLACEMENT_PREVIEW,
  isSamePlacementPreview,
} from './placementPreview';
import type { PlacementPreviewView } from './placementPreview';
import { clampItemPage, formatItemPage, getItemOnPageSlot, getItemPageCount, getItemsOnPage, stepItemPage } from './itemBar';
import type { ItemPageDirection } from './itemBar';
import {
  canRollback,
  codeMoveMultiplier,
  coffeeSpawnIntervalMultiplier,
  documentationMaliciousRateModifiers,
  expireEffects,
  isEffectActive,
  playerSpeedMultiplier,
  recordIncident,
  rollbackIncident,
  rollFridayDeployIncident,
  scheduleIncident,
  spawnIntervalMultiplier,
  startEffect,
  startEnergyDrink,
  takeDueIncidents,
} from './itemEffect';
import type { ActiveEffect, IncidentRecord, ScheduledIncident } from './itemEffect';
import { toggleMenu } from './floatingMenu';
import type { MenuKind } from './floatingMenu';
import { buildHelpLines, canOpenHelp } from './help';
import type { Point, Route } from './route';
import { getMessages, setLocale } from './i18n';
import { applyDocumentLang, getBrowserLanguages, getLocationSearch } from './i18n/browserEnvironment';
import { resolveLocale } from './i18n/resolveLocale';

// revealed はラバーダック(#58)で正体を暴いた不正なコード。一度暴いたら場から消えるまで true のまま。
type ActiveCode = FlowingCode & { readonly graphics: Phaser.GameObjects.Graphics; readonly revealed?: boolean };

class MainScene extends Phaser.Scene {
  private routes: Route[] = [];
  private player?: Phaser.GameObjects.Graphics;
  private codes: ActiveCode[] = [];
  private spawnElapsed = new Map<number, number>();
  private nextCodeId = 0;
  // 不正なコードの残り hp（コードIDがキー）。FlowingCode は変更しない。撃破・リリースで削除する。
  private codeHp = new Map<number, number>();
  // テストツールの足止め(#54)の残り時間（ミリ秒）。キーはコード id。足止め中のコードだけが持つ。
  private codeHold = new Map<number, number>();
  private lastAttackTime: number | null = null;
  // 主人公のタップで攻撃したポインターを離すまで true。この間はポインターでの移動を止める。
  private attackPointerHeld = false;
  // ゲーム内の経過ミリ秒（累積）。個別の休暇(#36)ではゲーム時計を止めない。一時停止で止めるかは未決定で、止める場合は加算をやめるだけでよい。
  private elapsedMs = 0;
  private elapsedDaysText?: Phaser.GameObjects.Text;
  private displayedDays = 0;
  private funds = 0;
  private score = INITIAL_SCORE;
  // 技術的負債（0〜TECH_DEBT_MAX）。資金とは別。変更は changeTechDebt に集約する。
  private techDebt = TECH_DEBT_INITIAL;
  // 右下の小さな指標（資金・累計売上・月末に支払うお金・技術的負債の段階）(#156)。左の HUD の文字表示に代わるもの。
  private statusPanel?: StatusPanel;
  // 技術的負債が閾値を超えたまま続けて放置された時間（ミリ秒）(#46)。閾値以下に下がる・大障害が起きると 0 に戻る。
  private techDebtNeglectMs = 0;
  // リファクタリングの割合（0〜1）。開発バランスのメニューのゲージの ◀ / ▶(#156, #165)で変える（Z/X キー #40 は #165 で廃止）。
  private refactoringRatio = DEFAULT_REFACTORING_RATIO;
  private gameOver: GameOverState = INITIAL_GAME_OVER_STATE;
  private engineers: Engineer[] = [];
  private nextEngineerId = 0;
  private hireMessageText?: Phaser.GameObjects.Text;
  // 昇給・減給(#34)の対象。名簿の並びではなく id で持つ（assignEngineerRoute などで配列が置き換わっても選択を保つ）。
  private selectedEngineerId: number | null = null;
  private placedItems: readonly PlacedItem[] = [];
  private nextItemId = 0;
  // 主人公についてまわるアイテム（ペアプロ相棒 #58）の表示（アイテム id がキー）。毎フレーム主人公の位置 + ずれへ動かす。
  private followItemViews = new Map<number, Phaser.GameObjects.Container>();
  private itemMessageText?: Phaser.GameObjects.Text;
  // アイテムのメニューの現在のページ（0 始まり）(#58)。メニューを閉じても保つ(#156)。
  private itemPage = 0;
  // 右上のアイコン(#156)と、開いているメニュー（一度に1つだけ。閉じていれば null）。メニューは開くときに作り、閉じるときに destroy() する。
  private menuIcons?: MenuIcons;
  private openMenu: MenuKind | null = null;
  private menuPanel?: FloatingPanel;
  // エンジニアのポップオーバー(#156)と、開いている出現地点のルートの id（閉じていれば null）。メニューとは同時に開かない。
  private engineerPopover?: FloatingPanel;
  private popoverRouteId: number | null = null;
  // 購入時に発動したアイテムの時限効果(#58)。時刻は elapsedMs。
  private activeEffects: readonly ActiveEffect[] = [];
  // 金曜日の夕方デプロイ(#58)で予約した障害。
  private scheduledIncidents: readonly ScheduledIncident[] = [];
  // 直前の障害の記録（ロールバックボタン #58）。まだ障害がなければ null。
  private lastIncident: IncidentRecord | null = null;
  // ドキュメント(#58)を最初に買った時刻（elapsedMs）。買っていなければ null。
  private documentationPurchasedAtMs: number | null = null;
  // 休暇マーカー（routeId がキー）(#35)。押すとエンジニアのポップオーバーを開く(#156)。
  private vacationMarkers = new Map<number, VacationMarker>();
  // ルートの線と出現場所の円（routeId がキー）(#32)。退職でルートが消えるときに destroy() する。
  private routeDrawings = new Map<number, RouteDrawing>();
  // 初期配置(#47)。setup の間は時間を止め、ステージポイントでアイテムを置く。開始操作で playing に移る。create() で毎回 setup に戻す。
  private phase: 'setup' | 'playing' = 'setup';
  private initialPlacement: InitialPlacementState = createInitialPlacementState();
  // 初期配置で次に置くもの（アイテムのメニューでアイテム #156、エンジニアの選択ボタンでエンジニアを選ぶ #157）。最初は未選択。
  private initialPlacementSelection: InitialPlacementSelection = { kind: 'none' };
  // 初期配置で置いたアイテムの描画（アイテム id がキー）。撤去で destroy() する。プレイ開始後は使わない。
  private initialPlacementDrawings = new Map<number, Phaser.GameObjects.Container>();
  // 初期配置の取消（×）ボタン(#157)。アイテム用はアイテム id、エンジニア用はエンジニア id がキー。撤去時・プレイ開始時に destroy() する。
  private itemRemoveButtons = new Map<number, Phaser.GameObjects.Container>();
  private engineerRemoveButtons = new Map<number, Phaser.GameObjects.Container>();
  // エンジニアを置ける床の色分け(#157)。置く・外すたびに描き直し、プレイ開始時に destroy() する。
  private engineerCandidateOverlay?: Phaser.GameObjects.Graphics;
  private initialPlacementEngineerButton?: EngineerSelectButton;
  private initialPlacementPanelText?: Phaser.GameObjects.Text;
  private initialPlacementStartButton?: Phaser.GameObjects.Container;
  private initialPlacementMessageText?: Phaser.GameObjects.Text;
  // 置けるかどうかを示す枠(#162)と、いま描いている状態（変わったときだけ描き直す）。create() で作る。
  // 初期配置ではポインターの下のセル、プレイ中は主人公がアイテムを置くセルに出す。
  private placementPreview?: Phaser.GameObjects.Rectangle;
  private placementPreviewView: PlacementPreviewView = HIDDEN_PLACEMENT_PREVIEW;
  // 初期配置で最後にポインターを動かした（押した）点と、その下にボタンなどの UI があったか。置く・外す・選ぶの直後に枠を出し直すのに使う。
  private lastSetupPointer: { readonly point: Point; readonly overUi: boolean } | null = null;
  // ゲームの説明(#165)。右上の ℹ️ で開き、背景か ✕ で閉じる。開いている間（helpOpen）は update() とシーンの押下を止める（時計も止まる）。
  private helpOpen = false;
  private helpOverlay?: FloatingPanel;

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
    // 経過時間 0 なので Lv.1（初期配置の間も Lv.1 / 0日のまま #164）。
    this.elapsedDaysText = drawElapsedDays(this, levelAt(this.elapsedMs), getElapsedDays(this.elapsedMs));
    this.funds = INITIAL_FUNDS;
    this.score = INITIAL_SCORE;
    this.techDebt = TECH_DEBT_INITIAL;
    this.techDebtNeglectMs = 0;
    this.refactoringRatio = DEFAULT_REFACTORING_RATIO;
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
    this.codeHold = new Map();
    this.routeDrawings = drawRoutes(this, this.routes);
    this.vacationMarkers = new Map();
    this.routes.forEach((route) => this.addVacationMarker(route));
    this.engineers = fleet.engineers;
    this.nextEngineerId = fleet.nextEngineerId;
    this.hireMessageText = undefined;
    // scene.restart() でも前回の選択を残さない。初期値は先頭のエンジニア（名簿が空なら null）。
    this.selectedEngineerId = selectAdjacentEngineerId(this.engineers, null, 'next');
    const itemState = createItemState();
    this.placedItems = itemState.placedItems;
    this.nextItemId = itemState.nextId;
    this.followItemViews = new Map();
    this.itemMessageText = undefined;
    this.activeEffects = [];
    this.scheduledIncidents = [];
    this.lastIncident = null;
    this.documentationPurchasedAtMs = null;
    this.itemPage = 0;
    // 初期配置(#47)。scene.restart() でも毎回 STAGE_POINTS_INITIAL・配置なしの setup から始める。
    this.phase = 'setup';
    this.initialPlacement = createInitialPlacementState();
    this.initialPlacementSelection = { kind: 'none' };
    this.initialPlacementDrawings = new Map();
    this.initialPlacementMessageText = undefined;
    // 置けるかどうかを示す枠(#162)。隠した状態で作る（前回の枠は Phaser が破棄済みなので作り直す）。
    this.placementPreview = drawPlacementPreview(this);
    this.placementPreviewView = HIDDEN_PLACEMENT_PREVIEW;
    this.lastSetupPointer = null;
    // 右下の指標(#156)。月末に支払うお金は setup の配置（initialPlacement）から求めるので、phase と初期配置を戻したあとに描く。
    this.statusPanel = drawStatusPanel(this, {
      funds: this.funds,
      score: this.score,
      monthEndPayment: this.getMonthEndPaymentForecast(),
      techDebt: this.techDebt,
    });
    // 右上のアイコン(#156)。scene.restart() でも閉じた状態から始める（前回のパネルは Phaser が破棄済みなので参照だけ捨てる）。
    this.openMenu = null;
    this.menuPanel = undefined;
    this.engineerPopover = undefined;
    this.popoverRouteId = null;
    this.menuIcons = drawMenuIcons(this, (kind) => this.onMenuIconPressed(kind));
    this.refreshMenuIcons();
    // ゲームの説明(#165)。scene.restart() でも閉じた状態から始める（前回の表示は Phaser が破棄済みなので参照だけ捨てる）。
    this.helpOpen = false;
    this.helpOverlay = undefined;
    drawHelpIcon(this, () => this.openHelp());
    this.initialPlacementPanelText = drawInitialPlacementPanel(
      this,
      formatInitialPlacementPanel(this.initialPlacement.points, this.initialPlacementSelection),
    );
    this.initialPlacementEngineerButton = drawInitialPlacementEngineerButton(
      this,
      formatInitialPlacementEngineerButton(countUnplacedEngineers(this.engineers)),
      () => this.selectInitialPlacementEngineer(),
    );
    this.initialPlacementStartButton = drawInitialPlacementStartButton(this, () => this.startPlay());
    // 初期エンジニアは既定の出現場所に置いた状態で始める（何もしなくても開始できる）。位置を変えるときは×で外して置き直す(#157)。
    this.itemRemoveButtons = new Map();
    this.engineerRemoveButtons = new Map();
    this.engineers.forEach((engineer) => this.addEngineerRemoveButton(engineer));
    this.engineerCandidateOverlay = undefined;
    this.refreshInitialPlacementControls();
    drawReleasePoint(this);
    this.player = drawPlayer(this);
    // キーボードの操作は登録しない(#165、マウスだけで操作する)。移動は押し続け、攻撃は主人公のクリック、開始・リスタートはボタンとクリック。
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      // ゲームの説明(#165)を開いている間は、押下を説明の背景・✕ だけが受け取る（置く・移動・攻撃・メニューの開閉をしない）。
      if (this.helpOpen) {
        return;
      }
      if (this.gameOver.over) {
        this.tryRestart();
        return;
      }
      // 初期配置(#47)の間は、押したセルにアイテムを置く・撤去する。主人公の移動・攻撃はしない。
      if (this.phase === 'setup') {
        // タッチ操作では pointermove が来ないことがあるので、押した点も置けるかどうかの枠(#162)の位置にする。
        this.lastSetupPointer = { point: { x: pointer.worldX, y: pointer.worldY }, overUi: currentlyOver.length > 0 };
        this.onInitialPlacementPointerDown({ x: pointer.worldX, y: pointer.worldY }, currentlyOver);
        this.refreshSetupPlacementPreview();
        return;
      }
      // アイコン・メニュー・ポップオーバー（背景を含む）・休暇マーカー上の押下では、離すまで主人公の移動・攻撃をしない。
      if (currentlyOver.length > 0) {
        this.attackPointerHeld = true;
        return;
      }
      // メニュー・ポップオーバーが開いている間のフィールドの押下は、閉じるだけにして消費する（離すまで移動・攻撃をしない）(#156)。
      if (this.openMenu !== null || this.popoverRouteId !== null) {
        this.closeFloatingUi();
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
    // 初期配置(#47)の間は、ポインターの下のセルに置けるかどうかの枠を出す(#162)。プレイ中の枠は update() で主人公の位置に出す。
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      // ゲームの説明(#165)を開いている間は枠を動かさない（閉じたあとの押下・移動で出し直す）。
      if (this.phase !== 'setup' || this.helpOpen) {
        return;
      }
      this.lastSetupPointer = { point: { x: pointer.worldX, y: pointer.worldY }, overUi: currentlyOver.length > 0 };
      this.refreshSetupPlacementPreview();
    });
  }

  // 置けるかどうかの枠(#162)を view にする。いま描いている状態と同じなら描き直さない。枠を作る前（create() の前）は何もしない。
  private showPlacementPreview(view: PlacementPreviewView): void {
    const preview = this.placementPreview;
    if (preview === undefined || isSamePlacementPreview(this.placementPreviewView, view)) {
      return;
    }
    this.placementPreviewView = view;
    updatePlacementPreview(preview, view);
  }

  // 初期配置(#47)のアイテムの判定に使う設定。押下とプレビュー(#162)で同じものを使う。
  // 初期配置UIの矩形（INITIAL_PLACEMENT_UI_BOUNDS #162）と重なる位置は、初期配置の間だけ置けない（UI はプレイ開始で消える）。
  private getInitialItemPlacementContext(): InitialPlacementContext {
    return { routes: this.routes, blockedRects: [...ITEM_BLOCKED_RECTS, ...INITIAL_PLACEMENT_UI_BOUNDS], level: this.currentLevel() };
  }

  // 初期配置の枠を、最後にポインターを動かした点で出し直す(#162)。ポインターを動かしていなければ出さない。
  // 可否は押下（onInitialPlacementPointerDown）と同じ placeInitialItem の結果で決める（getSetupPlacementPreview）。
  private refreshSetupPlacementPreview(): void {
    const pointer = this.lastSetupPointer;
    if (this.phase !== 'setup' || pointer === null) {
      this.showPlacementPreview(HIDDEN_PLACEMENT_PREVIEW);
      return;
    }
    this.showPlacementPreview(
      getSetupPlacementPreview(
        pointer.point,
        pointer.overUi,
        this.initialPlacementSelection,
        this.initialPlacement,
        this.getInitialItemPlacementContext(),
      ),
    );
  }

  // プレイ中の枠を、主人公がアイテムを置くセル（buyItem と同じく主人公の位置を含むセル）に出す(#162)。主人公がいなければ隠す。
  // 可否は既定の置けない範囲（ITEM_BLOCKED_RECTS）での isPlaceableCell。毎フレーム呼ぶが、セルか可否が変わったときだけ描き直す。
  private refreshPlayingPlacementPreview(): void {
    const player = this.player;
    if (!player) {
      this.showPlacementPreview(HIDDEN_PLACEMENT_PREVIEW);
      return;
    }
    this.showPlacementPreview(
      getPlayingPlacementPreview({ x: player.x, y: player.y }, { routes: this.routes, placedItems: this.placedItems }),
    );
  }

  // 初期配置(#47)で置くアイテムの種類を選び、パネルとアイテムのメニューの表示を更新する。
  private selectInitialPlacementItem(itemType: ItemType): void {
    this.initialPlacementSelection = { kind: 'item', itemType };
    this.refreshInitialPlacementControls();
  }

  // 初期配置で次に置くものをエンジニアにする(#157)。未配置のエンジニアがいなくても選べる（置こうとしたときにメッセージを出す）。
  private selectInitialPlacementEngineer(): void {
    if (this.phase !== 'setup') {
      return;
    }
    this.initialPlacementSelection = { kind: 'engineer' };
    this.refreshInitialPlacementControls();
  }

  // 初期配置UIの表示を今の状態に合わせる(#157)。パネル・エンジニアの選択ボタン・アイテムのメニューの強調・エンジニアを置ける床・開始ボタンの見た目。
  // 選ぶ・置く・外すたびに呼ぶ（アイテムを置くとエンジニアを置ける床が変わるため、床も毎回描き直す）。
  private refreshInitialPlacementControls(): void {
    this.initialPlacementPanelText?.setText([
      ...formatInitialPlacementPanel(this.initialPlacement.points, this.initialPlacementSelection),
    ]);
    this.initialPlacementEngineerButton?.setLabel(formatInitialPlacementEngineerButton(countUnplacedEngineers(this.engineers)));
    this.initialPlacementEngineerButton?.setSelected(this.initialPlacementSelection.kind === 'engineer');
    this.engineerCandidateOverlay?.destroy();
    this.engineerCandidateOverlay = drawEngineerCandidateOverlay(
      this,
      listEngineerCandidateCells(this.routes, this.initialPlacement.itemState.placedItems),
    );
    this.initialPlacementStartButton?.setAlpha(
      canStartPlay(this.engineers) ? INITIAL_PLACEMENT_START_BUTTON_ALPHA.enabled : INITIAL_PLACEMENT_START_BUTTON_ALPHA.disabled,
    );
    this.refreshItemMenu();
    // 選ぶ・置く・外すと可否が変わるので、置けるかどうかの枠も出し直す(#162)。
    this.refreshSetupPlacementPreview();
  }

  private showInitialPlacementMessage(message: string): void {
    this.initialPlacementMessageText?.destroy();
    this.initialPlacementMessageText = drawInitialPlacementMessage(this, message);
  }

  // 初期配置(#47)の押下。ボタン・マーカー・×ボタン上の押下（currentlyOver あり）とフィールド外の押下は何もしない（ボタン側の処理だけ動く）。
  // 未選択なら案内を出す。アイテムを選んでいれば押した点を含む配置グリッド（16px #151）のセルにその種類を置き（選択は残して続けて置ける）、
  // エンジニアを選んでいれば押した点を含むルートグリッド（60px）のセルに置く(#157)。撤去は×ボタンだけで行う。資金は変えない（changeFunds は通さない）。
  private onInitialPlacementPointerDown(
    point: { readonly x: number; readonly y: number },
    currentlyOver: readonly Phaser.GameObjects.GameObject[],
  ): void {
    if (this.phase !== 'setup' || currentlyOver.length > 0 || !isPointInField(point)) {
      return;
    }
    const selection = this.initialPlacementSelection;
    if (selection.kind === 'none') {
      this.showInitialPlacementMessage(getMessages().initialPlacement.selectFirst);
      return;
    }
    if (selection.kind === 'engineer') {
      this.placeInitialEngineerAt(point);
      return;
    }
    const itemType = selection.itemType;
    const cell = pointToPlacementCell(point);
    // 判定の設定は置けるかどうかの枠(#162)と同じ（getInitialItemPlacementContext）。
    const result = placeInitialItem(this.initialPlacement, itemType, cell, this.getInitialItemPlacementContext());
    this.showInitialPlacementMessage(formatInitialPlacementMessage(result, itemType));
    if (!result.ok) {
      return;
    }
    this.initialPlacement = result.state;
    this.initialPlacementDrawings.set(result.item.id, drawPlacedItem(this, result.item));
    this.addItemRemoveButton(result.item);
    this.refreshInitialPlacementControls();
    // 月額アイテムを置くと月末に支払うお金が増える(#156)。
    this.refreshMonthEndPayment();
  }

  // 初期配置で置いたアイテムの右上に取消（×）ボタンを付ける(#157)。
  private addItemRemoveButton(item: PlacedItem): void {
    this.itemRemoveButtons.set(
      item.id,
      drawRemoveButton(this, itemRemoveButtonCenter(item.cell), () => this.removeInitialPlacedItem(item)),
    );
  }

  // ×ボタンで初期配置のアイテムを撤去して、そのコストを全額返す(#157)。アイテムの描画と×ボタンを消す。
  // 撤去の判定は removeInitialItem にセルの中心（フットプリントの内側）を渡して行う。フットプリントは重ならないので対象はこのアイテムだけ。
  private removeInitialPlacedItem(item: PlacedItem): void {
    if (this.phase !== 'setup') {
      return;
    }
    const removal = removeInitialItem(this.initialPlacement, placementCellCenter(item.cell));
    if (!removal.ok || removal.item.id !== item.id) {
      throw new Error(`初期配置のアイテムが見つかりません: id=${item.id}`);
    }
    this.initialPlacement = removal.state;
    const drawing = this.initialPlacementDrawings.get(item.id);
    if (drawing === undefined) {
      throw new Error(`初期配置のアイテムの描画が見つかりません: id=${item.id}`);
    }
    drawing.destroy();
    this.initialPlacementDrawings.delete(item.id);
    this.itemRemoveButtons.get(item.id)?.destroy();
    this.itemRemoveButtons.delete(item.id);
    this.showInitialPlacementMessage(formatInitialPlacementMessage(removal, item.itemType));
    this.refreshInitialPlacementControls();
    this.refreshMonthEndPayment();
  }

  // 押した点を含むルートグリッド（60px）のセルに、未配置の初期エンジニアを1人置いてルートを自動で作る(#157)。
  // ルートと出現場所は雇用時（addEngineerRoute）と同じく1本だけ描き、休暇マーカーと×ボタンを付ける。未配置が0人になったら未選択に戻す。
  private placeInitialEngineerAt(point: { readonly x: number; readonly y: number }): void {
    const cell = pointToRouteCell(point);
    if (cell === undefined) {
      throw new Error(`フィールド内の点がルートグリッドのセルになりません: (${point.x}, ${point.y})`);
    }
    const result = placeInitialEngineer(
      this.engineers,
      this.routes,
      this.initialPlacement.itemState.placedItems,
      cell,
      Math.random,
    );
    this.showInitialPlacementMessage(formatEngineerPlacementMessage(result));
    if (!result.ok) {
      return;
    }
    this.routes = result.routes;
    this.engineers = result.engineers;
    this.drawAddedRoute(result.route);
    const engineer = this.engineers.find((candidate) => candidate.id === result.engineerId);
    if (engineer === undefined) {
      throw new Error(`配置したエンジニアが見つかりません: id=${result.engineerId}`);
    }
    this.addEngineerRemoveButton(engineer);
    if (countUnplacedEngineers(this.engineers) === 0) {
      this.initialPlacementSelection = { kind: 'none' };
    }
    this.refreshInitialPlacementControls();
  }

  // 配置済みのエンジニアの出現場所の右上に取消（×）ボタンを付ける(#157)。未配置（routeId が null）なら付けない。
  private addEngineerRemoveButton(engineer: Engineer): void {
    if (engineer.routeId === null) {
      return;
    }
    const routeId = engineer.routeId;
    const route = this.routes.find((candidate) => candidate.id === routeId);
    if (route === undefined) {
      throw new Error(`エンジニアのルートが見つかりません: engineerId=${engineer.id}, routeId=${routeId}`);
    }
    this.engineerRemoveButtons.set(
      engineer.id,
      drawRemoveButton(this, engineerRemoveButtonCenter(route.spawn), () => this.removeInitialPlacedEngineer(engineer.id)),
    );
  }

  // ×ボタンで初期配置のエンジニアを外す(#157)。ルートを除き、線・出現場所・休暇マーカーと×ボタンを消す。エンジニアは未配置に戻る（名簿には残る）。
  private removeInitialPlacedEngineer(engineerId: number): void {
    if (this.phase !== 'setup') {
      return;
    }
    const result = removeInitialEngineer(this.engineers, this.routes, engineerId);
    if (!result.ok) {
      throw new Error(`外すエンジニアが配置されていません: id=${engineerId}, reason=${result.reason}`);
    }
    this.routes = result.routes;
    this.engineers = result.engineers;
    this.destroyRouteDrawing(result.routeId);
    this.engineerRemoveButtons.get(engineerId)?.destroy();
    this.engineerRemoveButtons.delete(engineerId);
    this.showInitialPlacementMessage(getMessages().initialPlacement.engineerRemoved);
    this.refreshInitialPlacementControls();
  }

  // 初期配置(#47)を終えてプレイを始める。配置ゼロ・残ポイントありでも始められる（残ポイントは破棄）。
  // 未配置の初期エンジニアがいるときは始めず、メッセージを出して setup のままにする(#157)。
  // 順序: 配置を引き継ぐ → 初期配置UIを消す → playing にする → アイコンの薄い表示を戻し、アイテムのメニューを通常の表示（金額）に戻す
  // → 月末に支払うお金をプレイ中の配置で求め直す → 押したままのポインターで主人公が動かないようにする。
  private startPlay(): void {
    if (this.phase !== 'setup' || this.gameOver.over) {
      return;
    }
    if (!canStartPlay(this.engineers)) {
      this.showInitialPlacementMessage(getMessages().initialPlacement.placeAllEngineers);
      return;
    }
    const itemState = finishInitialPlacement(this.initialPlacement);
    this.placedItems = itemState.placedItems;
    this.nextItemId = itemState.nextId;
    this.initialPlacementPanelText?.destroy();
    this.initialPlacementPanelText = undefined;
    this.initialPlacementStartButton?.destroy();
    this.initialPlacementStartButton = undefined;
    this.initialPlacementMessageText?.destroy();
    this.initialPlacementMessageText = undefined;
    // エンジニアの選択ボタン・床の色分け・×ボタンを消す(#157)。残すとプレイ中のフィールドの押下を遮る。
    this.initialPlacementEngineerButton?.container.destroy();
    this.initialPlacementEngineerButton = undefined;
    this.engineerCandidateOverlay?.destroy();
    this.engineerCandidateOverlay = undefined;
    this.itemRemoveButtons.forEach((button) => button.destroy());
    this.itemRemoveButtons = new Map();
    this.engineerRemoveButtons.forEach((button) => button.destroy());
    this.engineerRemoveButtons = new Map();
    this.initialPlacementSelection = { kind: 'none' };
    // 初期配置の枠(#162)を消す。プレイ中は update() で主人公が置くセルに出す。
    this.lastSetupPointer = null;
    this.showPlacementPreview(HIDDEN_PLACEMENT_PREVIEW);
    // 初期配置で置いた主人公についてまわるアイテム（ペアプロ相棒 #58）は、購入時と同じく followItemViews で主人公に付ける。
    this.placedItems
      .filter((item) => isFollowItem(item.itemType))
      .forEach((item) => {
        const view = this.initialPlacementDrawings.get(item.id);
        if (view === undefined) {
          throw new Error(`初期配置のアイテムの描画が見つかりません: id=${item.id}`);
        }
        this.followItemViews.set(item.id, view);
      });
    // アイテムの描画はプレイ中も残す（撤去はもうしないので参照だけ捨てる）。
    this.initialPlacementDrawings = new Map();
    this.phase = 'playing';
    this.refreshMenuIcons();
    this.refreshItemMenu();
    this.refreshMonthEndPayment();
    this.attackPointerHeld = this.input.activePointer.isDown;
  }

  // 現在の攻撃対象（フィールド上を流れているコードの一覧）を返す。
  // 命中判定（findAttackTarget）は渡された一覧だけを見る。
  private getAttackTargets(): readonly ActiveCode[] {
    return this.codes;
  }

  // クールダウンが明けていれば攻撃する。射程内で最も近いコード1つに命中し、空振りでもクールダウンを消費する。
  // 命中時は CODE_HIT_EVENT を発行する。後続タスクは `scene.events.on(CODE_HIT_EVENT, ...)` で接続する。
  private tryAttack(): void {
    if (this.gameOver.over || this.phase === 'setup') {
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
    // ゲームの説明(#165)を開いている間は時間を止める（初期配置の間と同じく、時計・コード・アイテム・月の精算を進めない）。
    if (this.helpOpen) {
      return;
    }
    if (this.gameOver.over) {
      // ゲームオーバー中は置けるかどうかの枠(#162)を出さない。
      this.showPlacementPreview(HIDDEN_PLACEMENT_PREVIEW);
      return;
    }
    // 初期配置(#47)の間は時間を止める（時限効果の期限・予約した障害・時計・月の精算・コードの出現・アイテムの攻撃・愛着心・退職・大障害の判定をしない）。
    if (this.phase === 'setup') {
      return;
    }
    // 期限切れの時限効果(#58)をフレームの最初に外す。時刻はゲーム内の経過時間（elapsedMs）。
    this.activeEffects = expireEffects(this.activeEffects, this.elapsedMs);
    // 愛着心が最低になったエンジニアは毎フレーム判定して退職させる(#32)。月次処理（advanceClock）より前に置き、退職者に給料を払わない。
    this.resignEngineers();
    const prevElapsedMs = this.elapsedMs;
    this.advanceClock(delta);
    // 月の給料で倒産したら、同じフレームの移動・コードの更新はしない。
    if (this.gameOver.over) {
      return;
    }
    // 金曜日の夕方デプロイ(#58)で予約した障害のうち、時刻が来たものを起こす。
    this.fireScheduledIncidents();
    // 予約した障害で倒産したら、同じフレームの移動・コードの更新はしない。
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
    this.refreshPlayingPlacementPreview();
    this.moveFollowItems();
    this.updateCodes(delta);
    this.revealCodes();
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
    const position = { x: player.x, y: player.y };
    // エナジードリンク(#58)の加速期・鈍化期は主人公の速度に倍率を掛ける。
    const speed = PLAYER_SPEED * playerSpeedMultiplier(this.activeEffects, this.elapsedMs);

    // 移動はポインターだけ（キーボードの移動は #165 で廃止）。ポインター（タッチ・マウス）を押している間、ゲーム座標の押下位置へ向かう。
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
    const next = clampToField(movePlayerToward(position, target, direction, delta, speed));
    player.setPosition(next.x, next.y);
    this.updatePlayerFacing(player, direction.x);
  }

  // 水平方向の移動の向きが変わったときだけ、主人公の見た目の向きを反転する(#144)。水平に動かないときは向きを保つ。位置には影響しない。
  private updatePlayerFacing(player: Phaser.GameObjects.Graphics, dx: number): void {
    const facing = facingFromHorizontal(dx);
    if (facing !== null && player.scaleX !== facing) {
      setPlayerFacing(player, facing);
    }
  }

  // 経過時間を累積し、日数表示を更新して、越えた月ごとに MONTH_ELAPSED_EVENT を1回ずつ発行する。
  // 後続タスクは `scene.events.on(MONTH_ELAPSED_EVENT, ...)` で接続する（#19 の給料など）。
  private advanceClock(delta: number): void {
    const prev = this.elapsedMs;
    this.elapsedMs = advanceElapsedMs(prev, delta);
    const days = getElapsedDays(this.elapsedMs);
    const level = levelAt(this.elapsedMs);
    if (days !== this.displayedDays) {
      this.displayedDays = days;
      this.elapsedDaysText?.setText(formatLevelAndDays(level, days));
    }
    // レベルが上がったら(#164)解放済みのアイテムが増えるので、アイテムのメニューを描き直す（通知は出さない）。
    // 大きな delta で複数レベルを越えても、到達したレベルの一覧でまとめて1回描き直す。ページは残し、なくなっていれば最後のページに寄せる。
    if (level !== levelAt(prev)) {
      this.itemPage = clampItemPage(this.itemPage, getItemPageCount(unlockedItemTypes(level).length));
      this.refreshItemMenu();
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
    this.statusPanel?.setFunds(next);
    this.events.emit(FUNDS_CHANGED_EVENT, createFundsChangedEvent(previous, next, reason));
  }

  // 技術的負債を変更して、表示更新（右下の段階の絵文字と数字 #156, #165）と TECH_DEBT_CHANGED_EVENT の発行を一か所で行う（changeFunds と同じ形）。
  // 変化がないとき（上限・0 で止まったときなど）はイベントを発行しない。後続タスク（開発スピード低下・大障害など）はこのイベントを購読する。
  private changeTechDebt(result: WorkTechDebtResult, reason: TechDebtChangeReason): void {
    const previous = this.techDebt;
    this.techDebt = result.current;
    this.statusPanel?.setTechDebt(result.current);
    const event = createTechDebtChangedEvent(previous, result.current, reason);
    if (event.delta !== 0) {
      this.events.emit(TECH_DEBT_CHANGED_EVENT, event);
    }
  }

  // 機能開発とリファクタリングの割合を1段階寄せる(#40。#165 から開発バランスのメニューの ◀ / ▶)。ゲームオーバー中・初期配置の間と、両端で値が変わらないときは何もしない（applyRefactoringRatio）。
  // 次のリリースから resolveWorkTechDebt に新しい割合が使われる。
  private changeRefactoringRatio(direction: RefactoringRatioDirection): void {
    this.applyRefactoringRatio(stepRefactoringRatio(this.refactoringRatio, direction));
  }

  // changeRefactoringRatio の適用。ゲームオーバー中・初期配置の間・同じ値なら何もしない。
  // 変えたら開発バランスのメニューが開いていれば描き直す（ゲージと割合の文言を新しい値にする）。
  private applyRefactoringRatio(next: number): void {
    if (this.gameOver.over || this.phase === 'setup') {
      return;
    }
    if (next === this.refactoringRatio) {
      return;
    }
    this.refactoringRatio = next;
    this.refreshMenu('balance');
  }

  // ランクを指定して雇う。ゲームオーバー中は何もしない。費用は changeFunds を通して引く（倒産判定もここで動く）。
  // ルートの追加は ENGINEER_HIRED_EVENT を購読する onEngineerHired が行う。
  private hire(rank: string): void {
    if (this.gameOver.over || this.phase === 'setup') {
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
    // 選択中のエンジニアがいなければ（0人から雇ったときなど）、雇ったエンジニアを選ぶ。
    if (this.findSelectedEngineer() === null) {
      this.selectedEngineerId = result.engineer.id;
    }
    // エンジニアのメニューの人数・選択中の表示と、月末に支払うお金（雇った人の月給）を更新する(#156)。
    this.refreshSelectedEngineer();
    this.refreshMonthEndPayment();
    this.changeFunds(result.fundsAfter, 'hire');
    const payload: EngineerHiredPayload = { engineer: result.engineer, cost: result.cost };
    this.events.emit(ENGINEER_HIRED_EVENT, payload);
  }

  // 選択中のエンジニア。選択なし・名簿にいなければ null。
  private findSelectedEngineer(): Engineer | null {
    return this.engineers.find((engineer) => engineer.id === this.selectedEngineerId) ?? null;
  }

  // 選択中のエンジニア・人数の表示を更新する。#156 からはエンジニアのメニューの中にあるので、開いていれば描き直す（閉じていれば何もしない）。
  private refreshSelectedEngineer(): void {
    this.refreshMenu('engineer');
  }

  // 昇給・減給の対象を前・次のエンジニアに切り替える。ゲームオーバー中は何もしない。
  private selectEngineer(direction: EngineerSelectDirection): void {
    if (this.gameOver.over || this.phase === 'setup') {
      return;
    }
    this.selectedEngineerId = selectAdjacentEngineerId(this.engineers, this.selectedEngineerId, direction);
    this.refreshSelectedEngineer();
  }

  // 仮・要確認(#34): 選択中のエンジニアを昇給・減給する。ゲームオーバー中は何もしない。
  // 変えた額はすぐ Engineer.salary に入り、次の月次精算（onMonthElapsed → getEngineerSalaries）から支払う。手数料はかけない（changeFunds は呼ばない）。
  // メッセージは雇用メッセージと同じ場所に出し、直前の雇用・給与メッセージは消す。
  private adjustSalary(direction: SalaryDirection): void {
    if (this.gameOver.over || this.phase === 'setup') {
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
    this.refreshMonthEndPayment();
  }

  // アイテムのメニューの現在ページの枠 slot のアイテムを買う(#58)。空の枠なら何もしない（アイテムのメニューの枠のボタンから呼ぶ）。
  // 枠は今のレベルで解放済みのアイテム（unlockedItems #164）の並び。
  private buyItemSlot(slot: number): void {
    const itemType = getItemOnPageSlot(this.unlockedItems(), this.itemPage, slot);
    if (itemType === undefined) {
      return;
    }
    this.buyItem(itemType);
  }

  // アイテムのメニューのページを切り替える(#58)。ゲームオーバー中も切り替えられる（購入は buyItem が止める）。
  private changeItemPage(direction: ItemPageDirection): void {
    this.itemPage = stepItemPage(this.itemPage, direction, getItemPageCount(this.unlockedItems().length));
    this.refreshItemMenu();
  }

  // 今のレベル(#164)。別のカウンターは持たず、経過時間から求める（初期配置の間は経過時間 0 なので Lv.1）。
  private currentLevel(): number {
    return levelAt(this.elapsedMs);
  }

  // 今のレベルで解放済みのアイテム（ITEM_TYPES の定義順 #164）。アイテムのメニューの枠・ページ数はこの一覧を使う。
  private unlockedItems(): ItemType[] {
    return unlockedItemTypes(this.currentLevel());
  }

  // アイテムのメニューが開いていれば今のページ・phase で描き直す（閉じていれば何もしない）(#156)。
  private refreshItemMenu(): void {
    this.refreshMenu('item');
  }

  // アイテムのメニューの中身。初期配置の間は金額の代わりにステージポイントのコストを出し、選んでいるアイテムの枠を強調する(#157)。
  // 最後のページの空いた枠は null（ボタンを出さない）。
  private itemMenuView(): ItemMenuView {
    const setup = this.phase === 'setup';
    const unlocked = this.unlockedItems();
    const items = getItemsOnPage(unlocked, this.itemPage);
    const labels = Array.from({ length: ITEM_PAGE_SIZE }, (_, slot): string | null => {
      const itemType: ItemType | undefined = items[slot];
      if (itemType === undefined) return null;
      return setup ? formatInitialPlacementItemButton(itemType) : formatItemOption(itemType);
    });
    const selection = this.initialPlacementSelection;
    const selectedSlot = setup && selection.kind === 'item' ? items.indexOf(selection.itemType) : -1;
    return {
      labels,
      pageLabel: formatItemPage(this.itemPage, getItemPageCount(unlocked.length)),
      selectedSlot: selectedSlot === -1 ? null : selectedSlot,
    };
  }

  // 右上のアイコンを押したとき(#156)。ゲームオーバー中は何もしない。初期配置の間はアイテムだけ開ける（置くアイテムを選ぶため。他は薄く表示）。
  // 開いているのと同じアイコンなら閉じ、別のアイコンなら切り替える（toggleMenu）。メニューを開くときはエンジニアのポップオーバーを閉じる（一度に1つだけ）。
  private onMenuIconPressed(kind: MenuKind): void {
    if (this.gameOver.over || (this.phase === 'setup' && kind !== 'item')) {
      return;
    }
    this.closeEngineerPopover();
    this.openMenu = toggleMenu(this.openMenu, kind);
    this.redrawMenu();
  }

  // 初期配置の間は開けないアイコン（エンジニア・開発バランス）を薄くする。プレイ開始で戻す(#156)。
  private refreshMenuIcons(): void {
    const setup = this.phase === 'setup';
    this.menuIcons?.setDimmed('engineer', setup);
    this.menuIcons?.setDimmed('balance', setup);
  }

  // kind のメニューが開いていれば、今の状態で描き直す(#156)。
  private refreshMenu(kind: MenuKind): void {
    if (this.openMenu === kind) {
      this.redrawMenu();
    }
  }

  // 開いているメニュー（openMenu）を作り直す。前のパネルは destroy() し、閉じていれば作らない。アイコンの強調も合わせる。
  // ページ（itemPage）・初期配置の選択は開閉では初期化しない。
  private redrawMenu(): void {
    this.menuPanel?.destroy();
    this.menuPanel = undefined;
    this.menuIcons?.setOpen(this.openMenu);
    switch (this.openMenu) {
      case null:
        return;
      case 'engineer':
        this.menuPanel = drawEngineerMenu(
          this,
          {
            count: this.engineers.length,
            max: MAX_ENGINEERS,
            hireOptions: ENGINEER_RANKS.map((entry) => ({ rank: entry.id, cost: ENGINEER_HIRE_COST[entry.id] })),
            selected: this.findSelectedEngineer(),
          },
          {
            onHire: (rank) => this.hire(rank),
            onSelect: (direction) => this.selectEngineer(direction),
            onAdjust: (direction) => this.adjustSalary(direction),
          },
        );
        return;
      case 'item':
        this.menuPanel = drawItemMenu(this, this.itemMenuView(), {
          onBuySlot: (slot) => this.buyItemSlot(slot),
          onPage: (direction) => this.changeItemPage(direction),
        });
        return;
      case 'balance':
        this.menuPanel = drawBalanceMenu(this, { ratio: this.refactoringRatio }, (direction) =>
          this.changeRefactoringRatio(direction),
        );
        return;
    }
  }

  private closeMenu(): void {
    this.openMenu = null;
    this.redrawMenu();
  }

  // メニューとエンジニアのポップオーバーをどちらも閉じる（フィールドの押下・ゲームオーバー）(#156)。
  private closeFloatingUi(): void {
    this.closeMenu();
    this.closeEngineerPopover();
  }

  // 右上の ℹ️ を押したとき、ゲームの説明を開く(#165)。ゲームオーバー中（canOpenHelp）と、もう開いているときは何もしない。
  // 初期配置の間とプレイ中は開ける。開いているメニュー・ポップオーバーはそのまま残す（説明の背景が上に重なって押下を受け止める）。
  private openHelp(): void {
    if (!canOpenHelp(this.gameOver.over) || this.helpOpen) {
      return;
    }
    this.helpOpen = true;
    this.helpOverlay = drawHelpOverlay(this, getMessages().help.title, buildHelpLines(), () => this.closeHelp());
  }

  // ゲームの説明を閉じる（背景か ✕ の押下）(#165)。閉じた押下のまま主人公が動かないよう、プレイ開始（startPlay）と同じく離すまでポインター移動を止める。
  private closeHelp(): void {
    if (!this.helpOpen) {
      return;
    }
    this.helpOverlay?.destroy();
    this.helpOverlay = undefined;
    this.helpOpen = false;
    this.attackPointerHeld = this.input.activePointer.isDown;
  }

  // 出現地点（休暇マーカー）を押したとき、そのルートを担当するエンジニアのポップオーバーを開く(#156)。休暇・AIエージェントはここから操作する。
  // 初期配置の間・ゲームオーバー中・担当がいないときは何もしない。同じ出現地点をもう一度押すと閉じる。
  // 開くときは担当エンジニアを選択中にして（エンジニアのメニューの昇給・減給もこの人が対象になる）、メニューを閉じる（一度に1つだけ）。
  private openEngineerPopover(routeId: number): void {
    if (this.gameOver.over || this.phase === 'setup') {
      return;
    }
    if (this.popoverRouteId === routeId) {
      this.closeEngineerPopover();
      return;
    }
    const engineer = findEngineerByRoute(this.engineers, routeId);
    if (engineer === undefined) {
      return;
    }
    this.selectedEngineerId = engineer.id;
    this.closeMenu();
    this.popoverRouteId = routeId;
    this.redrawEngineerPopover();
  }

  // 開いているポップオーバー（popoverRouteId）を今の状態で作り直す。前のものは destroy() し、閉じていれば作らない。
  // AIエージェントは描いた時点の担当エンジニアの id に付ける（routeId と engineerId は同じとは限らない。選択中のエンジニアが変わっても対象は変わらない）。
  private redrawEngineerPopover(): void {
    this.engineerPopover?.destroy();
    this.engineerPopover = undefined;
    const routeId = this.popoverRouteId;
    if (routeId === null) {
      return;
    }
    const engineer = findEngineerByRoute(this.engineers, routeId);
    const route = this.routes.find((candidate) => candidate.id === routeId);
    if (engineer === undefined || route === undefined) {
      throw new Error(`ポップオーバーのエンジニアまたはルートが見つかりません: routeId=${routeId}`);
    }
    const engineerId = engineer.id;
    this.engineerPopover = drawEngineerPopover(this, cellCenter(route.spawn), engineer, {
      onToggleVacation: () => this.toggleVacation(routeId),
      onBuyAiAgent: (agentType) => this.buyAiAgent(agentType, engineerId),
    });
  }

  private closeEngineerPopover(): void {
    this.popoverRouteId = null;
    this.redrawEngineerPopover();
  }

  // 月末に支払うお金の予告（給料＋月額アイテム＋AIエージェントの月額）(#156)。初期配置の間は置いたアイテム（initialPlacement）、プレイ中は placedItems で求める。
  private getMonthEndPaymentForecast(): number {
    const placedItems = this.phase === 'setup' ? this.initialPlacement.itemState.placedItems : this.placedItems;
    return getMonthEndPaymentForecast(this.engineers, placedItems);
  }

  // 右下の指標の月末支払を更新する(#156)。雇用・退職・昇給減給・AIエージェントの装着・アイテムの配置（初期配置の配置・撤去を含む）・プレイ開始で呼ぶ。
  private refreshMonthEndPayment(): void {
    this.statusPanel?.setMonthEndPayment(this.getMonthEndPaymentForecast());
  }

  // 仮・要確認(#53): エンジニアに AIエージェントを付ける（付けていれば付け替える。前の種類の返金はしない）。ゲームオーバー中は何もしない。
  // 対象は engineerId（エンジニアのポップオーバー #156 が担当エンジニアの id を渡す）。省略したときは選択中のエンジニア。
  // 費用は changeFunds を通して引く（倒産判定もここで動く）。月額は次の月次精算（onMonthElapsed → settleMonthBoundary）から引く。
  // メッセージは昇給・減給と同じく雇用メッセージの場所に出し、直前の雇用・給与メッセージは消す。
  private buyAiAgent(agentType: AiAgentType, targetEngineerId?: number): void {
    if (this.gameOver.over || this.phase === 'setup') {
      return;
    }
    const engineerId = targetEngineerId === undefined ? (this.findSelectedEngineer()?.id ?? null) : targetEngineerId;
    const result = equipAiAgent(this.engineers, engineerId, agentType, {
      funds: this.funds,
      gameOver: this.gameOver.over,
    });
    this.hireMessageText?.destroy();
    this.hireMessageText = drawHireMessage(this, formatAiAgentMessage(result, agentType));
    if (!result.ok || engineerId === null) {
      return;
    }
    this.engineers = [...result.engineers];
    this.changeFunds(result.fundsAfter, 'aiAgent');
    // メニュー・ポップオーバーの AIエージェントの表示と、月末に支払うお金（AIエージェントの月額）を更新する(#156)。倒産して閉じていれば描き直さない。
    this.refreshSelectedEngineer();
    this.redrawEngineerPopover();
    this.refreshMonthEndPayment();
    const payload: AiAgentEquippedPayload = {
      engineerId,
      agentType,
      price: result.price,
      replaced: result.replaced,
    };
    this.events.emit(AI_AGENT_EQUIPPED_EVENT, payload);
  }

  // 主人公がいる配置グリッド（16px #151）のセルにアイテムを買って置く。ゲームオーバー中は何もしない。費用は changeFunds を通して引く（倒産判定もここで動く）。
  // 初期配置(#47)の間は買わず、置くアイテムの種類を選ぶだけにする（アイテムのメニューのページ切り替えは changeItemPage がそのまま動く）。
  // 置かないアイテム（placement: none #58）は useInstantItem で買って、その場で効果を発動する。
  private buyItem(itemType: ItemType): void {
    if (this.phase === 'setup') {
      this.selectInitialPlacementItem(itemType);
      return;
    }
    const player = this.player;
    if (this.gameOver.over || !player) {
      return;
    }
    if (getItemPlacement(itemType) === 'none') {
      this.useInstantItem(itemType);
      return;
    }
    const result = purchaseItem(
      {
        funds: this.funds,
        placedItems: this.placedItems,
        nextId: this.nextItemId,
        gameOver: this.gameOver.over,
        level: this.currentLevel(),
      },
      itemType,
      pointToPlacementCell({ x: player.x, y: player.y }),
      { routes: this.routes },
    );
    this.itemMessageText?.destroy();
    this.itemMessageText = drawItemMessage(this, formatItemMessage(result, itemType));
    if (!result.ok) {
      return;
    }
    this.placedItems = result.placedItems;
    this.nextItemId = result.item.id + 1;
    const view = drawPlacedItem(this, result.item);
    if (isFollowItem(result.item.itemType)) {
      const origin = getItemOrigin(result.item, { x: player.x, y: player.y });
      view.setPosition(origin.x, origin.y);
      this.followItemViews.set(result.item.id, view);
    }
    this.refreshMonthEndPayment();
    this.changeFunds(result.fundsAfter, 'item');
    const payload: ItemPlacedPayload = { item: result.item, price: result.price };
    this.events.emit(ITEM_PLACED_EVENT, payload);
  }

  // 置かないアイテム(#58)を買って効果を発動する。費用は changeFunds(…, 'item') で引き、倒産したら効果は発動しない。
  private useInstantItem(itemType: ItemType): void {
    if (this.phase === 'setup') {
      return;
    }
    const result = purchaseInstantItem(
      {
        funds: this.funds,
        gameOver: this.gameOver.over,
        hasRollbackTarget: canRollback(this.lastIncident),
        level: this.currentLevel(),
      },
      itemType,
    );
    this.itemMessageText?.destroy();
    this.itemMessageText = drawItemMessage(this, formatItemMessage(result, itemType));
    if (!result.ok) {
      return;
    }
    this.changeFunds(result.fundsAfter, 'item');
    // 購入で倒産したら効果は発動しない（ロールバックの返金で倒産から復帰させない）。
    if (this.gameOver.over) {
      return;
    }
    this.applyInstantItemEffect(itemType);
    const payload: ItemUsedPayload = { itemType, price: result.price };
    this.events.emit(ITEM_USED_EVENT, payload);
  }

  // 置かないアイテム(#58)の効果。時限効果は elapsedMs から数える。
  private applyInstantItemEffect(itemType: ItemType): void {
    const effect = ITEM_DEFINITIONS[itemType].effect;
    switch (effect) {
      case 'codeFreeze':
        this.activeEffects = startEffect(this.activeEffects, 'codeFreeze', this.elapsedMs, CODE_FREEZE_DURATION_MS);
        return;
      case 'specChangeStorm':
        this.rewindAllCodes();
        return;
      case 'energyDrink':
        this.activeEffects = startEnergyDrink(this.activeEffects, this.elapsedMs);
        return;
      case 'pizza': {
        this.activeEffects = startEffect(this.activeEffects, 'pizza', this.elapsedMs, PIZZA_DURATION_MS);
        const current = accumulateTechDebt(this.techDebt, PIZZA_TECH_DEBT);
        this.changeTechDebt({ previous: this.techDebt, current, accumulated: PIZZA_TECH_DEBT, repaid: 0 }, 'pizza');
        return;
      }
      case 'documentation':
        // 買い直しても最初の購入時刻のまま（効果量は足さない）。
        if (this.documentationPurchasedAtMs === null) {
          this.documentationPurchasedAtMs = this.elapsedMs;
        }
        return;
      case 'fridayDeploy':
        this.changeFunds(addFunds(this.funds, FRIDAY_DEPLOY_SALES), 'sales');
        if (rollFridayDeployIncident(Math.random)) {
          this.scheduledIncidents = scheduleIncident(
            this.scheduledIncidents,
            this.elapsedMs + FRIDAY_DEPLOY_INCIDENT_DELAY_MS,
            calculateDamage(FRIDAY_DEPLOY_INCIDENT_DAMAGE_POINTS),
          );
        }
        return;
      case 'rollback': {
        const rollback = rollbackIncident(this.funds, this.lastIncident);
        this.lastIncident = rollback.record;
        this.changeFunds(rollback.fundsAfter, 'rollback');
        return;
      }
      case 'worksFine':
        this.activeEffects = startEffect(this.activeEffects, 'worksFine', this.elapsedMs, WORKS_FINE_DURATION_MS);
        return;
      case 'attack':
      case 'deleteRandomCode':
      case 'reveal':
      case 'coffee':
      case 'seniorNote':
        throw new Error(`置くアイテムは購入時に発動しません: ${itemType}`);
      default: {
        const unreachable: never = effect;
        throw new Error(`未対応の効果: ${String(unreachable)}`);
      }
    }
  }

  // 仕様変更の嵐(#58): 流れているコードをすべてルートの始点に戻し、全ルートの生成タイマーを 0 にする（出現ペースのリセット）。
  // id・種類・hp はそのまま。
  private rewindAllCodes(): void {
    this.codes = this.codes.map((code) => {
      const rewound = rewindCode(code);
      rewound.graphics.setPosition(rewound.position.x, rewound.position.y);
      return rewound;
    });
    for (const route of this.routes) {
      this.spawnElapsed.set(route.id, 0);
    }
  }

  // 置いたアイテムが、範囲内で最も近い不正なコードを自動で攻撃する。ゲームオーバー中はしない。
  // 猫(#57)は攻撃せず、場のコードをランダムに1つ消す（deleteCodeByCat）。攻撃しないアイテム（ラバーダックなど #58）はここでは何もしない。
  // 攻撃間隔はアイテム別（Linter #58）。Linter は射程内に正常なコードがあると確率で発射を見送る（見送ってもクールダウンは消費する）。
  private updateItems(now: number): void {
    if (this.gameOver.over) {
      return;
    }
    const worksFine = isEffectActive(this.activeEffects, 'worksFine', this.elapsedMs);
    this.placedItems = this.placedItems.map((item) => {
      if (isRandomDeleteItem(item.itemType)) {
        return this.deleteCodeByCat(item, now);
      }
      // CI(releaseGate) は汎用攻撃をしない。効果は updateCodes のリリース直前の減速と阻止(#55)。
      if (getItemActivation(item.itemType) !== 'nearestTarget') {
        return item;
      }
      // 攻撃しないアイテム（ラバーダック・コーヒーマシン・書き置きなど #58）は、それぞれの処理（revealCodes など）で効く。
      if (!isAttackItem(item.itemType)) {
        return item;
      }
      // 「動いてるからヨシ！」(#58)の間は置いたアイテムは攻撃しない（主人公の攻撃は止めない）。
      if (worksFine) {
        return item;
      }
      if (!canItemAttack(now, item.lastAttackTime, getItemAttackCooldownMs(item.itemType))) {
        return item;
      }
      const origin = this.getItemOrigin(item);
      const target = findItemTarget(item, this.codes, origin);
      if (!target) {
        return item;
      }
      if (shouldItemHesitate(item.itemType, origin, this.codes, Math.random)) {
        return { ...item, lastAttackTime: now };
      }
      drawItemAttackEffect(this, origin, target.position);
      flashCode(this, target.graphics);
      this.damageMaliciousCode(target, getItemDamage(item.itemType, target.maliciousType));
      // テストツールは撃破されずに残った不正コードを足止めする(#54)。足止め時間 0 の種別では何もしない。
      const holdMs = getItemHoldMs(item.itemType);
      if (holdMs > 0 && this.codeHp.has(target.id)) {
        this.codeHold.set(target.id, applyHold(this.codeHold.get(target.id) ?? 0, holdMs));
      }
      return { ...item, lastAttackTime: now };
    });
  }

  // アイテムの攻撃の起点(#58)。主人公についてまわるアイテムは主人公の位置 + ずれ、それ以外は置いたセル（配置グリッド #151）の中心。
  private getItemOrigin(item: PlacedItem): Point {
    if (!isFollowItem(item.itemType)) {
      return placementCellCenter(item.cell);
    }
    const player = this.player;
    if (!player) {
      throw new Error(`主人公がいないため、ついてまわるアイテムの位置を決められません: id=${item.id}`);
    }
    return getItemOrigin(item, { x: player.x, y: player.y });
  }

  // 主人公についてまわるアイテム（ペアプロ相棒 #58）の表示を、攻撃の起点と同じ位置へ動かす。
  private moveFollowItems(): void {
    for (const item of this.placedItems) {
      const view = this.followItemViews.get(item.id);
      if (view === undefined) {
        continue;
      }
      const origin = this.getItemOrigin(item);
      view.setPosition(origin.x, origin.y);
    }
  }

  // ラバーダック(#58): 範囲内の不正なコードの正体を暴く。一度だけ濃い色で描き直し、その後は場から消えるまで濃いまま。
  // hp・攻撃・損害は変えない。種別のバッジは種別があるときだけ（drawCode と同じ）。
  private revealCodes(): void {
    if (this.gameOver.over) {
      return;
    }
    const revealIds = new Set(findCodesToReveal(this.placedItems, this.codes).map((code) => code.id));
    if (revealIds.size === 0) {
      return;
    }
    this.codes = this.codes.map((code) => {
      if (!revealIds.has(code.id)) {
        return code;
      }
      this.tweens.killTweensOf(code.graphics);
      code.graphics.destroy();
      const graphics = drawCode(this, code.kind, code.position, code.maliciousType, true);
      return { ...code, revealed: true, graphics };
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
    drawItemAttackEffect(this, placementCellCenter(item.cell), target.position);
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
    // 退職者の出現地点のポップオーバーを開いていれば閉じる(#156)。ルート・マーカーを消す前に閉じる（描き直しでルートを探さない）。
    if (payload.routeId !== null && payload.routeId === this.popoverRouteId) {
      this.closeEngineerPopover();
    }
    // 昇給・減給の選択中の人が退職したら、残る先頭の人を選ぶ（いなければ null）。
    if (this.findSelectedEngineer() === null) {
      this.selectedEngineerId = selectAdjacentEngineerId(this.engineers, null, 'next');
    }
    this.refreshSelectedEngineer();
    this.refreshMonthEndPayment();
    this.hireMessageText?.destroy();
    this.hireMessageText = drawHireMessage(this, formatResignedMessage(payload.engineer));
    const { routeId } = payload;
    if (routeId === null) {
      return;
    }
    this.routes = removeRoute(this.routes, routeId);
    this.destroyRouteDrawing(routeId);
    this.spawnElapsed.delete(routeId);
    const { remaining, removed } = partitionCodesByRoute(this.codes, routeId);
    removed.forEach((code) => this.discardCode(code));
    this.codes = remaining;
  }

  // ルート1本ぶんの描画（線・出現場所の円と装飾）と休暇マーカーを消す。退職(#32)と初期配置の取消(#157)で使う。
  private destroyRouteDrawing(routeId: number): void {
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
  }

  // 流れているコードを精算せずに消す(#32)。CI の阻止(#55)の後処理でも使う。codes 配列からの削除は呼び出し側で行う。
  private discardCode(code: ActiveCode): void {
    this.codeHp.delete(code.id);
    this.codeHold.delete(code.id);
    this.tweens.killTweensOf(code.graphics);
    code.graphics.destroy();
  }

  // 月の境界ごとに給料、続けて月額アイテムの費用（エンジニアに付けた AIエージェント(#53)の月額を含む）を引く。給料は雇っているエンジニアそれぞれのランク別月給の合計（主人公の給料は含めない）。
  // 給料の対象は this.engineers の全員（ルート未割当・休暇中も含む）(#37)。休暇などの状態で this.engineers を絞ってから渡さない。
  private onMonthElapsed(event: MonthElapsedEvent): void {
    const { salary, itemFee } = settleMonthBoundary(
      this.funds,
      event.month,
      getEngineerSalaries(this.engineers),
      this.placedItems,
      this.gameOver.over,
      this.engineers,
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
    this.statusPanel?.setScore(this.score);
    const result = checkBankruptcy(this.gameOver, event.current, this.time.now);
    this.gameOver = result.state;
    if (!result.triggered) {
      return;
    }
    // 予約した障害(#58)はゲームオーバーで捨てる（リスタートでも create で空にする）。
    this.scheduledIncidents = [];
    // 開いているメニュー・ポップオーバーは閉じる(#156)。ゲームオーバー中はアイコンもマーカーも開かない。
    this.closeFloatingUi();
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
      // 正常リリースの演出(#144)。ゲームオーバー中は Tween が止まり破棄されないため出さない。
      drawReleaseBurst(this);
    }
    const incident = settleIncident(this.funds, payload, this.gameOver);
    if (incident === null) {
      return;
    }
    // 伝説のシニアの書き置き(#58): リリース地点が範囲内なら、資金を変える前に障害を防ぐ（損害・演出・INCIDENT_EVENT・直前の障害の記録なし）。
    if (isIncidentPreventedByNote(this.placedItems)) {
      this.itemMessageText?.destroy();
      this.itemMessageText = drawItemMessage(this, getMessages().items.seniorNotePrevented);
      const prevented: IncidentPreventedPayload = {
        codeId: payload.id,
        maliciousType: incident.maliciousType,
        damage: incident.damage,
      };
      this.events.emit(INCIDENT_PREVENTED_EVENT, prevented);
      return;
    }
    this.applyIncident(incident);
  }

  // 確定した障害の損害を資金から引き、演出と INCIDENT_EVENT を出す（リリースの障害・予約した障害 #58 共通）。
  // ロールバックボタン(#58)で取り消せるよう、損害額を直前の障害として記録する（前の記録は置き換える）。
  private applyIncident(incident: IncidentEvent): void {
    this.lastIncident = recordIncident(incident.damage);
    this.changeFunds(incident.fundsAfter, 'damage');
    const { r, g, b } = Phaser.Display.Color.IntegerToRGB(INCIDENT_FLASH_COLOR);
    this.cameras.main.flash(INCIDENT_FLASH_DURATION_MS, r, g, b);
    this.events.emit(INCIDENT_EVENT, incident);
  }

  // 金曜日の夕方デプロイ(#58)で予約した障害のうち、elapsedMs までに時刻が来たものを予約順に起こす。書き置きでは防がない。
  // 倒産したら残りは起こさない（予約は onFundsChanged で捨てる）。
  private fireScheduledIncidents(): void {
    const { due, pending } = takeDueIncidents(this.scheduledIncidents, this.elapsedMs);
    if (due.length === 0) {
      return;
    }
    this.scheduledIncidents = pending;
    for (const scheduled of due) {
      const incident = settleScheduledIncident(this.funds, scheduled.damage, this.gameOver);
      if (incident === null) {
        return;
      }
      this.applyIncident(incident);
    }
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
  // #53 AIエージェント（担当エンジニア単位の増加。aiAgentMaliciousRateModifiers）。末尾に加える。
  // 今後の補正はこの配列に差分を追加して合成する。
  private maliciousRateModifiersFor(engineer: Engineer | undefined): readonly number[] {
    return [
      ...vacationMaliciousRateModifiers(engineer),
      techDebtMaliciousRateModifier(this.techDebt),
      refactoringMaliciousRateModifier(this.refactoringRatio),
      ...aiAgentMaliciousRateModifiers(engineer),
      // #58 ドキュメント（担当がジュニアのルートだけ、購入からの経過時間に応じて減少）。
      ...documentationMaliciousRateModifiers(engineer?.rank, this.documentationPurchasedAtMs, this.elapsedMs),
    ];
  }

  private updateCodes(delta: number): void {
    // 技術的負債に応じて生成間隔を延ばす(#44)。フレーム開始時の負債で1回だけ計算し、全ルートの基準の間隔にする（AIエージェントの倍率はルートごとに掛ける）。
    // フレーム内（リリース精算など）で負債が変わっても、反映は次のフレームから。
    // 新規ルートの初期値にも同じ間隔を渡し、負債があっても最初の更新ですぐ1個生成されるようにする（既存の挙動を維持）。
    // ピザ(#58)の間は全ルートの間隔に倍率を掛ける。
    const spawnIntervalMs =
      techDebtSpawnIntervalMs(this.techDebt, CODE_SPAWN_INTERVAL_MS) *
      spawnIntervalMultiplier(this.activeEffects, this.elapsedMs);
    // コードフリーズ(#58)の間は全ルートを休暇と同じく止める（生成・移動を止め、リリース・売上も止まる。ゲーム内時計は進める）。
    const frozen = isEffectActive(this.activeEffects, 'codeFreeze', this.elapsedMs);
    for (const route of this.routes) {
      // 担当者はルートごとに 1 回だけ検索し、休暇の判定(#36)と不正コード率の計算で使い回す。
      const engineer = findEngineerByRoute(this.engineers, route.id);
      // コーヒーマシン(#58): 出現場所（担当エンジニアの席）を範囲に含む台数で、このルートの間隔に倍率を掛ける。
      const coffeeIntervalMs =
        spawnIntervalMs *
        coffeeSpawnIntervalMultiplier(countItemsCovering(this.placedItems, 'coffee', cellCenter(route.spawn)));
      // 生成間隔は技術的負債で延びた実効間隔(#44)にアイテムの倍率(#58)を掛け、さらに担当者の AIエージェント(#53)の倍率を掛けた値を使う（ルートごと）。
      const routeSpawnIntervalMs = aiAgentSpawnIntervalMs(engineer, coffeeIntervalMs);
      // 担当者の休暇中・コードフリーズ(#58)中は生成タイマーを止める(#36)。解除後は止めた時点の経過時間から再開する。
      const step = stepSpawnTimerUnlessPaused(
        this.spawnElapsed.get(route.id) ?? initialSpawnElapsed(routeSpawnIntervalMs),
        delta,
        routeSpawnIntervalMs,
        isAssigneeOnVacation(engineer) || frozen,
      );
      this.spawnElapsed.set(route.id, step.elapsedMs);
      if (step.spawn) {
        // 担当エンジニアのランクに応じた割合(#12)に補正(#13)を加える。担当者がいないルートは既定の割合を使う。
        const rank = engineer?.rank;
        const rate = effectiveMaliciousRate(rank, this.elapsedMs, this.maliciousRateModifiersFor(engineer));
        // 不正なコードには種別を抽選して付ける(#56)。HP初期化・描画・アイテムの得意判定で同じ種別を使う。
        const kind = pickCodeKind(Math.random, rate);
        const maliciousType = kind === 'malicious' ? pickMaliciousType(Math.random) : undefined;
        const code = spawnCode(this.nextCodeId++, kind, route, maliciousType);
        if (code.kind === 'malicious') {
          this.codeHp.set(code.id, getInitialHp(code.maliciousType));
        }
        this.codes.push({ ...code, graphics: drawCode(this, code.kind, code.position, code.maliciousType) });
      }
    }

    const speed = codeSpeedAt(this.elapsedMs);
    // 「動いてるからヨシ！」(#58)の間はコードの移動距離に倍率を掛ける。
    const worksFineMultiplier = codeMoveMultiplier(this.activeEffects, this.elapsedMs);
    // CI(#55): 置いていればリリース地点までの残り距離がゾーン長以下の部分を減速する。複数あっても重ねがけしない。
    const ciActive = hasActiveCi(this.placedItems);
    const ciZoneLength = getItemRange('ci');
    const flowing: ActiveCode[] = [];
    for (const [index, active] of this.codes.entries()) {
      // 同じフレームで倒産したら、残りのコードは処理せず流れたままにする（追加の損害を出さない）。
      if (this.gameOver.over) {
        flowing.push(...this.codes.slice(index));
        break;
      }
      // テストツールの足止め中(#54)は、足止めが切れたあとの時間だけ進む。足止めのないコードは delta のまま。
      const movableMs = this.advanceCodeHold(active.id, delta);
      const distance = ((speed * movableMs) / 1000) * worksFineMultiplier;
      // 担当者の休暇中・コードフリーズ(#58)中はそのルートのコードを進めない(#36)。流れたまま残るので攻撃はできる。
      const unslowed = moveDistanceUnlessPaused(distance, isRouteOnVacation(this.engineers, active.routeId) || frozen);
      // CI の減速(#55)。休暇中の 0 は 0 のまま。正常・不正どちらのコードにも効く。
      const moved = ciActive
        ? ciSlowedDistance(remainingPathDistance(active), unslowed, ciZoneLength, CI_SLOW_MULTIPLIER)
        : unslowed;
      const next: ActiveCode = { ...advanceCode(active, moved), graphics: active.graphics };
      // hp を持つのは不正なコードだけ。正常なコードは撃破されない。
      const hp = this.codeHp.get(next.id);
      const fate = resolveCodeFate(hp !== undefined && isDefeated(hp), next.released);
      if (fate === 'defeated') {
        continue;
      }
      // 判定順は 撃破 → CI の阻止(#55) → リリース。阻止は撃破として扱い、リリース・資金・障害・売上は発生させない。
      const interceptor =
        fate === 'released' ? rollCiInterception(this.placedItems, next, Math.random, CI_INTERCEPT_RATE) : null;
      if (interceptor !== null) {
        drawItemAttackEffect(this, placementCellCenter(interceptor.cell), next.position);
        this.discardCode(next);
        drawDefeatEffect(this, next.position);
        const defeatedPayload: CodeDefeatedPayload = { id: next.id, routeId: next.routeId };
        this.events.emit(CODE_DEFEATED_EVENT, defeatedPayload);
        continue;
      }
      if (fate === 'released') {
        this.codeHp.delete(next.id);
        this.codeHold.delete(next.id);
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

  // コードの足止め(#54)を1フレーム進め、このフレームで移動に使える時間を返す。足止めが切れたら記録を消す。
  private advanceCodeHold(codeId: number, delta: number): number {
    const remainingMs = this.codeHold.get(codeId);
    if (remainingMs === undefined) {
      return delta;
    }
    const step = advanceHold(remainingMs, delta);
    if (step.remainingMs > 0) {
      this.codeHold.set(codeId, step.remainingMs);
    } else {
      this.codeHold.delete(codeId);
    }
    return step.movableMs;
  }

  // エンジニアが増えたときに出現場所とルートを追加して描画する。上限などで追加できなければ undefined。
  addEngineerRoute(): Route | undefined {
    const route = addRoute(this.routes, Math.random);
    if (route === undefined) return undefined;
    this.routes.push(route);
    this.drawAddedRoute(route);
    return route;
  }

  // 追加したルート1本の線・出現場所を描き、休暇マーカーを重ねる。雇用(addEngineerRoute)と初期配置のエンジニアの配置(#157)で使う。
  private drawAddedRoute(route: Route): void {
    drawRoutes(this, [route]).forEach((drawing, routeId) => this.routeDrawings.set(routeId, drawing));
    this.addVacationMarker(route);
  }

  // ルートの出現場所に休暇マーカーを重ねる(#35)。押すとエンジニアのポップオーバーを開く（休暇はポップオーバーのボタンで切り替える #156）。
  private addVacationMarker(route: Route): void {
    this.vacationMarkers.set(
      route.id,
      drawVacationMarker(this, route, () => this.openEngineerPopover(route.id)),
    );
  }

  // ルートを担当するエンジニアの休暇を切り替えて、マーカーの表示（と開いていればポップオーバー #156）を更新する(#35)。ゲームオーバー中・担当がいないときは何もしない。
  // 資金・スコアは変えない。コードの停止(#36)は次の updateCodes で onVacation から反映する。
  // 休暇中も給料は引く(#37): onMonthElapsed は this.engineers 全員の給料を引くので、ここでは給料の処理をしない。
  // 休暇を始めると担当エンジニアの不正コード率が下がる(#39、setEngineerVacation で累積し、次に生成するコードから反映)。
  // 休暇中は担当エンジニアの愛着心が時間経過で上がる(#30、update の advanceEngineersAttachment が onVacation から反映)。
  private toggleVacation(routeId: number): void {
    if (this.gameOver.over || this.phase === 'setup') {
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
    if (this.popoverRouteId === routeId) {
      this.redrawEngineerPopover();
    }
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

// 表示言語(#158)。URL の ?locale= → ブラウザーの言語設定 → 既定（日本語）の順に決め、ゲームを作る前に1回だけ設定する。
// 文言は呼び出し時にカタログから読むので、ここで設定すれば scene.restart() 後も同じ言語のまま。
const locale = resolveLocale(getLocationSearch(), getBrowserLanguages());
setLocale(locale);
applyDocumentLang(locale);

new Phaser.Game(config);
