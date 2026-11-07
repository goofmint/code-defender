import Phaser from 'phaser';
import { CELL_SIZE, FIELD_HEIGHT, FIELD_WIDTH, GRID_LINE_WIDTH } from './field';
import { burstParticleOffsets, getReleasePointLabel, RELEASE_POINT_CENTER, RELEASE_POINT_STYLE } from './releasePoint';
import {
  cellCenter,
  routeChevrons,
  routePixelPoints,
  SPAWN_MARKER_STYLE,
  VACATION_MARKER_STYLE,
} from './route';
import type { GridCell, Point, Route, RouteChevron } from './route';
import {
  CODE_CORNER_RADIUS_RATIO,
  CODE_SIZE,
  CODE_STAR_INNER_RATIO,
  CODE_STAR_SPIKES,
  CODE_STROKE_WIDTH,
  CODE_STYLES,
  starPoints,
} from './code';
import type { CodeKind } from './code';
import { getMaliciousCodeAppearance } from './maliciousCode';
import type { MaliciousCodeType } from './maliciousCode';
import {
  AI_AGENT_BUTTON_ORDER,
  ATTACK_EFFECT_COLOR,
  ATTACK_EFFECT_DURATION_MS,
  ATTACK_HIT_FLASH_DURATION_MS,
  BALANCE_GAUGE,
  BALANCE_STEP_BUTTON_LABELS,
  CODE_DECOR_ALPHA,
  CODE_DECOR_COLORS,
  DEFEAT_EFFECT_COLOR,
  DEFEAT_EFFECT_DURATION_MS,
  DEFEAT_EFFECT_END_RADIUS_RATIO,
  DEFEAT_EFFECT_START_RADIUS_RATIO,
  ELAPSED_DAYS_POSITION,
  ELAPSED_DAYS_STYLE,
  FIELD_FLOOR_COLORS,
  FIELD_FLOOR_STYLE,
  GAME_OVER_OVERLAY,
  HELP_ICON_FONT_SIZE,
  HELP_ICON_RECT,
  HELP_OVERLAY,
  HIRE_BUTTON_COLORS,
  HIRE_MESSAGE_DURATION_MS,
  HIRE_MESSAGE_POSITION,
  HUD_ICONS,
  MENU_FONT_SIZE,
  MENU_ICON_COLORS,
  MENU_ICON_DIM_ALPHA,
  MENU_ICON_GLYPH,
  MENU_ICON_STROKE_WIDTH,
  MENU_LINE_SPACING,
  MENU_PANEL_COLORS,
  MENU_PANEL_DEPTH,
  PENALTY_TEXT_COLOR,
  PENALTY_TEXT_DURATION_MS,
  PENALTY_TEXT_FONT_SIZE,
  PENALTY_TEXT_RISE_PX,
  PLAYER_SCREEN_GLOW_ALPHA,
  PLAYER_SHADOW_ALPHA,
  RELEASE_BURST,
  RELEASE_POINT_DECOR_COLORS,
  RELEASE_POINT_DECOR_STYLE,
  RELEASE_POINT_PULSE,
  ROUTE_COLORS,
  ROUTE_LINE_STYLE,
  SPAWN_MARKER_DECOR_COLORS,
  SPAWN_MARKER_DECOR_STYLE,
  STATUS_PANEL_COLORS,
  STATUS_PANEL_FONT_SIZE,
  STATUS_PANEL_LINE_SPACING,
  STATUS_PANEL_PAYMENT_COLOR,
  STATUS_PANEL_RECT,
  TECH_DEBT_OUTAGE_TEXT_COLOR,
  TECH_DEBT_OUTAGE_TEXT_DURATION_MS,
  TECH_DEBT_OUTAGE_TEXT_FONT_SIZE,
} from './config';
import { formatPenalty } from './penalty';
import { formatLevelAndDays } from './level';
import { formatFunds } from './funds';
import { formatCumulativeSales } from './score';
import { formatTechDebtStatus } from './techDebt';
import { getMessages } from './i18n';
import { buildGameOverLines } from './gameOver';
import {
  formatEngineerCount,
  formatEngineerPopoverLines,
  formatHireOption,
  formatSelectedEngineerLines,
  formatVacationButton,
} from './engineer';
import type { Engineer, EngineerRank, SalaryDirection } from './engineer';
import { getPlayerStartPosition, PLAYER_COLORS, PLAYER_SIZE } from './player';
import type { PlayerFacing } from './player';
import {
  ITEM_ATTACK_LINE,
  ITEM_BOX_SIZE,
  ITEM_BOX_STROKE,
  ITEM_BUTTON_COLORS,
  ITEM_COLORS,
  ITEM_MARK_STYLE,
  ITEM_MARKS,
  ITEM_MESSAGE_COLOR,
  ITEM_MESSAGE_DURATION_MS,
  ITEM_MESSAGE_POSITION,
  ENGINEER_CANDIDATE_OVERLAY,
  INITIAL_PLACEMENT_ENGINEER_BUTTON_POSITION,
  INITIAL_PLACEMENT_ENGINEER_BUTTON_SIZE,
  INITIAL_PLACEMENT_FONT_SIZE,
  INITIAL_PLACEMENT_LINE_SPACING,
  INITIAL_PLACEMENT_MESSAGE_COLOR,
  INITIAL_PLACEMENT_MESSAGE_DURATION_MS,
  INITIAL_PLACEMENT_MESSAGE_POSITION,
  INITIAL_PLACEMENT_PANEL_POSITION,
  INITIAL_PLACEMENT_REMOVE_BUTTON,
  INITIAL_PLACEMENT_SELECTED_COLORS,
  INITIAL_PLACEMENT_START_BUTTON_POSITION,
  INITIAL_PLACEMENT_START_BUTTON_SIZE,
  ITEM_PAGE_BUTTON_LABELS,
  PLACEMENT_CELL_SIZE,
  PLACEMENT_COLS,
  PLACEMENT_PREVIEW,
  PLACEMENT_ROWS,
  REVEALED_CODE_STYLE,
  VIRTUAL_PAD_CELL_SIZE,
  VIRTUAL_PAD_LABELS,
  VIRTUAL_PAD_RECT,
  VIRTUAL_PAD_STYLE,
} from './config';
import type { ItemPageDirection } from './itemBar';
import { placementCellCenter } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import type { PlacementPreviewView } from './placementPreview';
import { formatRefactoringAllocation, gaugeSegmentWidths } from './refactoringRatioControl';
import type { RefactoringRatioDirection } from './refactoringRatioControl';
import { formatAiAgentOption } from './aiAgent';
import type { AiAgentType } from './aiAgent';
import { MENU_KINDS, menuIconRect, menuPanelLayout, popoverLayout, splitRow } from './floatingMenu';
import type { MenuKind, PanelLayout } from './floatingMenu';
import type { Rect } from './geometry';
import { formatMonthEndPayment } from './monthBoundary';
import { helpLayout } from './help';
import { VIRTUAL_PAD_BUTTONS } from './virtualPad';
import { STATUS_PANEL_CELLS, statusPanelCellRect } from './statusPanel';

// 後続オブジェクトより常に下に描画する。
const FIELD_DEPTH = -1;
// 主人公はフィールドより手前に描画する。
const PLAYER_DEPTH = 1;

// 床（#144）: 濃紺2色の市松タイル、薄いグリッド線、外周を暗くする帯（ビネット）と縁取り。すべて1つの Graphics に描く。
// タイルとグリッド線はアイテムの配置グリッド（16px #151）で描き、見えるタイルと置く単位を合わせる。
// 最終行（y=528〜540）はフィールドの高さで切り詰め、グリッド線もフィールドの端で止める。
export const drawField = (scene: Phaser.Scene): void => {
  const g = scene.add.graphics();
  g.setDepth(FIELD_DEPTH);
  for (let row = 0; row < PLACEMENT_ROWS; row++) {
    const y = row * PLACEMENT_CELL_SIZE;
    const height = Math.min(PLACEMENT_CELL_SIZE, FIELD_HEIGHT - y);
    for (let col = 0; col < PLACEMENT_COLS; col++) {
      const x = col * PLACEMENT_CELL_SIZE;
      const width = Math.min(PLACEMENT_CELL_SIZE, FIELD_WIDTH - x);
      const color = (col + row) % 2 === 0 ? FIELD_FLOOR_COLORS.tileLight : FIELD_FLOOR_COLORS.tileDark;
      g.fillStyle(color, 1);
      g.fillRect(x, y, width, height);
    }
  }
  g.lineStyle(GRID_LINE_WIDTH, FIELD_FLOOR_COLORS.grid, FIELD_FLOOR_STYLE.gridAlpha);
  for (let col = 0; col <= PLACEMENT_COLS; col++) {
    const x = Math.min(col * PLACEMENT_CELL_SIZE, FIELD_WIDTH);
    g.lineBetween(x, 0, x, FIELD_HEIGHT);
  }
  for (let row = 0; row <= PLACEMENT_ROWS; row++) {
    const y = Math.min(row * PLACEMENT_CELL_SIZE, FIELD_HEIGHT);
    g.lineBetween(0, y, FIELD_WIDTH, y);
  }
  // ビネット: 外側の段ほど濃い帯を、フィールドの内側へ1段ずつ重ねる。
  const { vignetteSteps, vignetteStepWidth, vignetteMaxAlpha, frameWidth, frameAlpha } = FIELD_FLOOR_STYLE;
  for (let step = 0; step < vignetteSteps; step++) {
    const inset = step * vignetteStepWidth + vignetteStepWidth / 2;
    g.lineStyle(vignetteStepWidth, FIELD_FLOOR_COLORS.vignette, vignetteMaxAlpha * (1 - step / vignetteSteps));
    g.strokeRect(inset, inset, FIELD_WIDTH - inset * 2, FIELD_HEIGHT - inset * 2);
  }
  g.lineStyle(frameWidth, FIELD_FLOOR_COLORS.frame, frameAlpha);
  g.strokeRect(frameWidth / 2, frameWidth / 2, FIELD_WIDTH - frameWidth, FIELD_HEIGHT - frameWidth);
};

// 仮: フィールド（FIELD_DEPTH=-1）より手前、後続オブジェクトの邪魔にならない深さ。
const RELEASE_POINT_DEPTH = 0;

// リリース地点(#144): 外側へ広がって消えるパルスのリング（ループ）・緑の円・内側の同心円リングと上向き矢印のアイコン・「リリース」のラベル。
// どれもシーンが持つ（create() で1回だけ作る）。scene.restart() でシーンごと破棄され、倒産時の tweens.pauseAll() でパルスも止まる。
export const drawReleasePoint = (scene: Phaser.Scene): void => {
  const { x, y } = RELEASE_POINT_CENTER;
  const {
    radius,
    fillColor,
    strokeColor,
    strokeWidth,
    labelFontSize,
    labelFontFamily,
    labelColor,
    labelGap,
  } = RELEASE_POINT_STYLE;
  // 配置判定（getReleasePointLabelBounds）と同じ現在の言語のラベル(#158)。
  const label = getReleasePointLabel();
  // パルスは円より先に作って円の後ろに重ねる。半径 radius から maxRadius まで広げながら消す。
  const pulse = scene.add
    .circle(x, y, radius)
    .setStrokeStyle(RELEASE_POINT_PULSE.strokeWidth, RELEASE_POINT_DECOR_COLORS.pulse, RELEASE_POINT_PULSE.startAlpha)
    .setDepth(RELEASE_POINT_DEPTH);
  scene.tweens.add({
    targets: pulse,
    scale: RELEASE_POINT_PULSE.maxRadius / radius,
    alpha: 0,
    duration: RELEASE_POINT_PULSE.durationMs,
    repeat: -1,
  });
  scene.add
    .circle(x, y, radius, fillColor)
    .setStrokeStyle(strokeWidth, strokeColor)
    .setDepth(RELEASE_POINT_DEPTH);
  // 内側の同心円リングと、中央の上向き矢印（矢じり・軸・下の台）。
  const { innerRingRadius, ringWidth, ringAlpha, iconSize, iconLineWidth } = RELEASE_POINT_DECOR_STYLE;
  const icon = scene.add.graphics();
  icon.lineStyle(ringWidth, RELEASE_POINT_DECOR_COLORS.ring, ringAlpha);
  icon.strokeCircle(0, 0, innerRingRadius);
  const half = iconSize / 2;
  const wing = half * 0.6;
  icon.lineStyle(iconLineWidth, RELEASE_POINT_DECOR_COLORS.icon, 1);
  icon.lineBetween(0, wing, 0, -half);
  icon.lineBetween(-wing, -half + wing, 0, -half);
  icon.lineBetween(wing, -half + wing, 0, -half);
  icon.lineBetween(-half, half, half, half);
  icon.setPosition(x, y).setDepth(RELEASE_POINT_DEPTH);
  scene.add
    .text(x, y - radius - labelGap, label, {
      fontSize: labelFontSize,
      fontFamily: labelFontFamily,
      color: labelColor,
      stroke: ELAPSED_DAYS_STYLE.strokeColor,
      strokeThickness: ELAPSED_DAYS_STYLE.strokeThickness,
    })
    .setOrigin(0.5, 1)
    .setDepth(RELEASE_POINT_DEPTH);
};

// 仮: フィールド(-1)より上、リリース地点(0)より下。
const ROUTE_DEPTH = -0.5;

// ルート1本ぶんの描画（線と出現場所の円、円の装飾）(#32, #144)。退職でルートが消えるときに destroy() する。
export type RouteDrawing = {
  readonly line: Phaser.GameObjects.Graphics;
  readonly spawnMarker: Phaser.GameObjects.Arc;
  // 出現場所の円の外側リングと内側の ▶ (#144)。
  readonly spawnDecoration: Phaser.GameObjects.Graphics;
};

// 進行方向の矢印（「>」の形）を、先端が angle の向きになるよう (x, y) を中心に描く。
const strokeChevron = (g: Phaser.GameObjects.Graphics, chevron: RouteChevron, size: number): void => {
  const half = size / 2;
  const cos = Math.cos(chevron.angle);
  const sin = Math.sin(chevron.angle);
  // 局所座標（先端 +x 方向）の点を回転して置く。
  const at = (lx: number, ly: number): Point => ({
    x: chevron.x + lx * cos - ly * sin,
    y: chevron.y + lx * sin + ly * cos,
  });
  const tip = at(half / 2, 0);
  const upper = at(-half / 2, -half);
  const lower = at(-half / 2, half);
  g.lineBetween(upper.x, upper.y, tip.x, tip.y);
  g.lineBetween(lower.x, lower.y, tip.x, tip.y);
};

// 出現場所の円の装飾（外側の細いリングと内側の ▶）を、円の中心 (x, y) に描く。
const drawSpawnDecoration = (scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Graphics => {
  const g = scene.add.graphics();
  const { ringGap, ringWidth, ringAlpha, iconSize } = SPAWN_MARKER_DECOR_STYLE;
  g.lineStyle(ringWidth, SPAWN_MARKER_DECOR_COLORS.ring, ringAlpha);
  g.strokeCircle(0, 0, SPAWN_MARKER_STYLE.radius + ringGap);
  // ▶ は重心が中心に来るよう、左辺を -iconSize/3、先端を +iconSize*2/3 に置く。
  const half = iconSize / 2;
  g.fillStyle(SPAWN_MARKER_DECOR_COLORS.icon, 1);
  g.fillTriangle(-iconSize / 3, -half, -iconSize / 3, half, (iconSize * 2) / 3, 0);
  g.setPosition(x, y);
  g.setDepth(ROUTE_DEPTH);
  return g;
};

// ルートごとに線の Graphics と出現場所の円（と装飾）を1個ずつ作り、routeId をキーにして返す。
// 重なり順を変えないよう、先に全ルートの線を作ってから円を作る（線の上に円が来る）。
// 線の Graphics には、暗く太い下地線・明るい本線・進行方向の矢印の順に重ねる(#144)。create() 時などに一度だけ描く。
export const drawRoutes = (scene: Phaser.Scene, routes: readonly Route[]): Map<number, RouteDrawing> => {
  const lines = routes.map((route) => {
    const g = scene.add.graphics();
    g.setDepth(ROUTE_DEPTH);
    const points = routePixelPoints(route);
    const strokeRoute = (): void => {
      for (let i = 1; i < points.length; i++) {
        g.lineBetween(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
      }
    };
    g.lineStyle(ROUTE_LINE_STYLE.underlayWidth, ROUTE_COLORS.underlay, ROUTE_LINE_STYLE.underlayAlpha);
    strokeRoute();
    // 折れ点の角が欠けないよう、下地線の太さの丸を折れ点に置く。
    g.fillStyle(ROUTE_COLORS.underlay, ROUTE_LINE_STYLE.underlayAlpha);
    points.forEach((p) => g.fillCircle(p.x, p.y, ROUTE_LINE_STYLE.underlayWidth / 2));
    g.lineStyle(ROUTE_LINE_STYLE.mainWidth, ROUTE_COLORS.main, ROUTE_LINE_STYLE.mainAlpha);
    strokeRoute();
    g.lineStyle(ROUTE_LINE_STYLE.chevronWidth, ROUTE_COLORS.chevron, ROUTE_LINE_STYLE.chevronAlpha);
    routeChevrons(points, ROUTE_LINE_STYLE.chevronSpacing).forEach((chevron) =>
      strokeChevron(g, chevron, ROUTE_LINE_STYLE.chevronSize),
    );
    return g;
  });
  return new Map(
    routes.map((route, index): [number, RouteDrawing] => {
      const { x, y } = cellCenter(route.spawn);
      const spawnMarker = scene.add
        .circle(x, y, SPAWN_MARKER_STYLE.radius, SPAWN_MARKER_STYLE.fillColor)
        .setStrokeStyle(SPAWN_MARKER_STYLE.strokeWidth, SPAWN_MARKER_STYLE.strokeColor)
        .setDepth(ROUTE_DEPTH);
      const spawnDecoration = drawSpawnDecoration(scene, x, y);
      return [route.id, { line: lines[index], spawnMarker, spawnDecoration }];
    }),
  );
};

// 仮: ルート(-0.5)より上、リリース地点(0)より下。出現場所の円の上に重ねる。
const VACATION_MARKER_DEPTH = -0.4;

export type VacationMarker = {
  readonly container: Phaser.GameObjects.Container;
  // 休暇中なら灰色の円と「休」を表示する。勤務中は灰色の円を隠して通常の出現場所マーカーを見せ、「休」だけを薄く重ねる(#143)。
  readonly setOnVacation: (onVacation: boolean) => void;
};

// 出現場所の円に重ねる休暇マーカー(#35)。タップで onPress を呼ぶ（#156 からは休暇を直接切り替えず、エンジニアのポップオーバーを開く）。drawRoutes の線と円は変えない。
// マーカー上の pointerdown で移動・攻撃が起きないようにする処理は main.ts 側（メニューのボタンと同じく currentlyOver で判定）。
export const drawVacationMarker = (
  scene: Phaser.Scene,
  route: Route,
  onPress: () => void,
): VacationMarker => {
  const { x, y } = cellCenter(route.spawn);
  const { radius, strokeWidth } = SPAWN_MARKER_STYLE;
  const circle = scene.add
    .circle(0, 0, radius, VACATION_MARKER_STYLE.fillColor)
    .setStrokeStyle(strokeWidth, VACATION_MARKER_STYLE.strokeColor);
  const label = scene.add
    .text(0, 0, VACATION_MARKER_STYLE.label, {
      fontSize: VACATION_MARKER_STYLE.labelFontSize,
      fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
      color: VACATION_MARKER_STYLE.labelColor,
    })
    .setOrigin(0.5);
  const container = scene.add
    .container(x, y, [circle, label])
    .setSize(radius * 2, radius * 2)
    .setDepth(VACATION_MARKER_DEPTH);
  // 当たり判定は出現場所の円。InputManager は local 座標へ displayOrigin（幅・高さの半分）を加算するため、円の中心も半径ぶんずらす。
  container.setInteractive(new Phaser.Geom.Circle(radius, radius, radius), Phaser.Geom.Circle.Contains);
  // stopPropagation はしない。シーンの pointerdown も発行させ、main.ts が currentlyOver で移動・攻撃を止める。
  container.on('pointerdown', onPress);
  // コンテナ自体は表示したまま（非表示にすると当たり判定もなくなる）、中身の表示だけ切り替える。
  // 勤務中も「休」を薄く出し、出現場所の円を押すと休暇の操作ができることが分かるようにする(#143)。
  const setOnVacation = (onVacation: boolean): void => {
    circle.setVisible(onVacation);
    label.setAlpha(onVacation ? VACATION_MARKER_STYLE.vacationLabelAlpha : VACATION_MARKER_STYLE.workingLabelAlpha);
  };
  setOnVacation(false);
  return { container, setOnVacation };
};

// 仮(#144): 主人公の各部の位置・大きさ（PLAYER_SIZE に対する比率、ローカル原点が中心、+x が顔の向き）。
// 上端はヘッドセットのバンド（約 -0.46）、下端は影（約 +0.46）で、PLAYER_SIZE（42px）の中に収める。
const PLAYER_PARTS = {
  shadow: { y: 0.4, width: 0.62, height: 0.12 },
  leg: { offsetX: 0.09, top: 0.22, width: 0.12, height: 0.15, radius: 0.04 },
  arm: { offsetX: 0.275, top: -0.02, width: 0.11, height: 0.24, radius: 0.05 },
  body: { top: -0.06, width: 0.5, height: 0.34, radius: 0.08 },
  hair: { y: -0.25, radius: 0.19 },
  face: { y: -0.22, radius: 0.17 },
  eye: { offsetX: 0.06, frontShift: 0.03, y: -0.21, radius: 0.025 },
  headsetBand: { y: -0.24, radius: 0.205, width: 0.04 },
  earCup: { offsetX: 0.2, y: -0.24, width: 0.07, height: 0.11, radius: 0.03 },
  mic: { fromX: 0.2, fromY: -0.2, toX: 0.1, toY: -0.12, width: 0.025, tipRadius: 0.025 },
  laptopLid: { top: 0.02, width: 0.4, height: 0.18, radius: 0.02 },
  screenInset: 0.025,
  screenGlow: 0.04,
  laptopBase: { top: 0.2, width: 0.48, height: 0.05, radius: 0.02 },
  hand: { offsetX: 0.22, y: 0.2, radius: 0.05 },
} as const;

// 主人公（エンジニア）を描く。ローカル原点を中心に PLAYER_SIZE 内へ収める(#144)。
// 影・脚・腕・角丸の胴体・髪と顔・目・ヘッドセット・画面が光るノートPCの順に重ねる。既定は右向き（setPlayerFacing で反転）。
export const drawPlayer = (scene: Phaser.Scene): Phaser.GameObjects.Graphics => {
  const g = scene.add.graphics();
  const u = PLAYER_SIZE;
  const p = PLAYER_PARTS;
  // 影
  g.fillStyle(PLAYER_COLORS.shadow, PLAYER_SHADOW_ALPHA);
  g.fillEllipse(0, p.shadow.y * u, p.shadow.width * u, p.shadow.height * u);
  // 脚
  g.fillStyle(PLAYER_COLORS.limbs, 1);
  [-1, 1].forEach((side) => {
    const x = side * p.leg.offsetX * u - (p.leg.width * u) / 2;
    g.fillRoundedRect(x, p.leg.top * u, p.leg.width * u, p.leg.height * u, p.leg.radius * u);
  });
  // 腕（袖）
  g.fillStyle(PLAYER_COLORS.body, 1);
  [-1, 1].forEach((side) => {
    const x = side * p.arm.offsetX * u - (p.arm.width * u) / 2;
    g.fillRoundedRect(x, p.arm.top * u, p.arm.width * u, p.arm.height * u, p.arm.radius * u);
  });
  // 胴体
  g.fillRoundedRect((-p.body.width * u) / 2, p.body.top * u, p.body.width * u, p.body.height * u, p.body.radius * u);
  // 髪（後ろの円）と顔（少し下にずらした円）で、頭の上に髪が見えるようにする。
  g.fillStyle(PLAYER_COLORS.hair, 1);
  g.fillCircle(0, p.hair.y * u, p.hair.radius * u);
  g.fillStyle(PLAYER_COLORS.skin, 1);
  g.fillCircle(0, p.face.y * u, p.face.radius * u);
  // 目（顔の向きへ少し寄せる）
  g.fillStyle(PLAYER_COLORS.eyes, 1);
  [-1, 1].forEach((side) => {
    g.fillCircle((side * p.eye.offsetX + p.eye.frontShift) * u, p.eye.y * u, p.eye.radius * u);
  });
  // ヘッドセット（頭の上のバンド・両耳のカップ・顔の向きのマイク）
  g.lineStyle(p.headsetBand.width * u, PLAYER_COLORS.headset, 1);
  g.beginPath();
  g.arc(0, p.headsetBand.y * u, p.headsetBand.radius * u, Math.PI, Math.PI * 2);
  g.strokePath();
  g.fillStyle(PLAYER_COLORS.headset, 1);
  [-1, 1].forEach((side) => {
    const x = side * p.earCup.offsetX * u - (p.earCup.width * u) / 2;
    const y = p.earCup.y * u - (p.earCup.height * u) / 2;
    g.fillRoundedRect(x, y, p.earCup.width * u, p.earCup.height * u, p.earCup.radius * u);
  });
  g.lineStyle(p.mic.width * u, PLAYER_COLORS.headset, 1);
  g.lineBetween(p.mic.fromX * u, p.mic.fromY * u, p.mic.toX * u, p.mic.toY * u);
  g.fillCircle(p.mic.toX * u, p.mic.toY * u, p.mic.tipRadius * u);
  // ノートPC（画面の光・ふた・画面・本体）
  const lidX = (-p.laptopLid.width * u) / 2;
  const lidY = p.laptopLid.top * u;
  const lidW = p.laptopLid.width * u;
  const lidH = p.laptopLid.height * u;
  const glow = p.screenGlow * u;
  g.fillStyle(PLAYER_COLORS.screenGlow, PLAYER_SCREEN_GLOW_ALPHA);
  g.fillRoundedRect(lidX - glow, lidY - glow, lidW + glow * 2, lidH + glow * 2, p.laptopLid.radius * u + glow);
  g.fillStyle(PLAYER_COLORS.laptop, 1);
  g.fillRoundedRect(lidX, lidY, lidW, lidH, p.laptopLid.radius * u);
  const inset = p.screenInset * u;
  g.fillStyle(PLAYER_COLORS.screen, 1);
  g.fillRect(lidX + inset, lidY + inset, lidW - inset * 2, lidH - inset * 2);
  g.fillStyle(PLAYER_COLORS.laptop, 1);
  g.fillRoundedRect(
    (-p.laptopBase.width * u) / 2,
    p.laptopBase.top * u,
    p.laptopBase.width * u,
    p.laptopBase.height * u,
    p.laptopBase.radius * u,
  );
  // 手（ノートPCの本体に添える）
  g.fillStyle(PLAYER_COLORS.skin, 1);
  [-1, 1].forEach((side) => g.fillCircle(side * p.hand.offsetX * u, p.hand.y * u, p.hand.radius * u));
  const start = getPlayerStartPosition();
  g.setPosition(start.x, start.y);
  g.setDepth(PLAYER_DEPTH);
  return g;
};

// 主人公の向きを見た目だけ変える（scaleX を ±1 にする）(#144)。位置（x/y）と当たり判定・境界の計算には影響しない。
export const setPlayerFacing = (player: Phaser.GameObjects.Graphics, facing: PlayerFacing): void => {
  player.setScale(facing, 1);
};

// 仮: リリース地点(0)とプレイヤー(1)の間。
const CODE_DEPTH = 0.5;

// 仮(#144): コードの装飾の位置・大きさ（CODE_SIZE に対する比率、ローカル原点が中心）。影の下端は公称サイズから少しだけはみ出す。
const CODE_PARTS = {
  shadow: { y: 0.46, width: 0.75, height: 0.12 },
  // 正常コード: 上のヘッダー帯、右上の折れた角、シンタックスハイライト風の行（行ごとに [左端, 長さ, 色の番号] の区切り）。
  headerHeight: 0.22,
  fold: 0.28,
  syntaxLineHeight: 0.08,
  syntaxRows: [
    { y: -0.12, segments: [[-0.32, 0.16, 0], [-0.1, 0.3, 1]] },
    { y: 0.06, segments: [[-0.22, 0.2, 2], [0.04, 0.2, 0]] },
    { y: 0.24, segments: [[-0.32, 0.38, 1]] },
  ],
  // 不正コード: 外側の淡い光（大きい星）・内側の暗い星・左上のハイライト。
  glowSize: 1.15,
  innerStarSize: 0.6,
  highlight: { x: -0.14, y: -0.2, width: 0.16, height: 0.09 },
} as const;

const fillPolygon = (g: Phaser.GameObjects.Graphics, points: readonly Point[]): void => {
  g.beginPath();
  points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
  g.closePath();
  g.fillPath();
};

// コードを描く。ローカル原点を中心に CODE_SIZE 内へ収め、position に置く。
// 1つの Graphics に描く（命中時のアルファ点滅 flashCode がそのまま効く）。ループする Tween は付けない(#144)。
export const drawCode = (
  scene: Phaser.Scene,
  kind: CodeKind,
  position: Point,
  maliciousType?: MaliciousCodeType,
  // ラバーダック(#58)で正体がバレた不正なコードは、塗りと枠を REVEALED_CODE_STYLE の濃い色にする。
  revealed: boolean = false,
): Phaser.GameObjects.Graphics => {
  const g = scene.add.graphics();
  const style = CODE_STYLES[kind];
  const s = CODE_SIZE;
  const { shape, pattern } = style;
  // 本体の塗りと枠。正体がバレた不正なコード(#58)は REVEALED_CODE_STYLE の濃い色にする。影・光・ハイライトはそのまま重ねる(#144)。
  const fillColor = revealed ? REVEALED_CODE_STYLE.fillColor : style.fillColor;
  const strokeColor = revealed ? REVEALED_CODE_STYLE.strokeColor : style.strokeColor;
  // 影（両種類共通）
  g.fillStyle(CODE_DECOR_COLORS.shadow, CODE_DECOR_ALPHA.shadow);
  g.fillEllipse(0, CODE_PARTS.shadow.y * s, CODE_PARTS.shadow.width * s, CODE_PARTS.shadow.height * s);
  switch (shape) {
    case 'roundedRect': {
      const r = s * CODE_CORNER_RADIUS_RATIO;
      const fold = s * CODE_PARTS.fold;
      g.fillStyle(fillColor, 1);
      g.fillRoundedRect(-s / 2, -s / 2, s, s, r);
      // ヘッダー帯（折れた角の手前まで）
      g.fillStyle(CODE_DECOR_COLORS.normalHeader, 1);
      g.fillRoundedRect(-s / 2, -s / 2, s - fold, s * CODE_PARTS.headerHeight, { tl: r, tr: 0, bl: 0, br: 0 });
      // 右上の折れた角（めくれた三角）
      const foldLeft = s / 2 - fold;
      const foldBottom = -s / 2 + fold;
      g.fillStyle(CODE_DECOR_COLORS.normalFold, 1);
      g.fillTriangle(foldLeft, -s / 2, s / 2, foldBottom, foldLeft, foldBottom);
      g.lineStyle(CODE_STROKE_WIDTH, strokeColor, 1);
      g.strokeRoundedRect(-s / 2, -s / 2, s, s, r);
      g.lineBetween(foldLeft, -s / 2, s / 2, foldBottom);
      break;
    }
    case 'star': {
      g.fillStyle(CODE_DECOR_COLORS.maliciousGlow, CODE_DECOR_ALPHA.maliciousGlow);
      fillPolygon(g, starPoints(s * CODE_PARTS.glowSize, CODE_STAR_SPIKES, CODE_STAR_INNER_RATIO));
      const points = starPoints(s, CODE_STAR_SPIKES, CODE_STAR_INNER_RATIO);
      g.fillStyle(fillColor, 1);
      g.lineStyle(CODE_STROKE_WIDTH, strokeColor, 1);
      g.beginPath();
      points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.closePath();
      g.fillPath();
      g.strokePath();
      g.fillStyle(CODE_DECOR_COLORS.maliciousInner, 1);
      fillPolygon(g, starPoints(s * CODE_PARTS.innerStarSize, CODE_STAR_SPIKES, CODE_STAR_INNER_RATIO));
      const { highlight } = CODE_PARTS;
      g.fillStyle(CODE_DECOR_COLORS.highlight, CODE_DECOR_ALPHA.highlight);
      g.fillEllipse(highlight.x * s, highlight.y * s, highlight.width * s, highlight.height * s);
      break;
    }
    default: {
      const unreachable: never = shape;
      throw new Error(`未対応の形: ${String(unreachable)}`);
    }
  }
  switch (pattern) {
    case 'lines': {
      // シンタックスハイライト風のコード行（区切りごとに色を変える）。先頭の色は patternColor と同じ水色。
      const h = s * CODE_PARTS.syntaxLineHeight;
      CODE_PARTS.syntaxRows.forEach((row) => {
        row.segments.forEach(([x, width, colorIndex]) => {
          g.fillStyle(CODE_DECOR_COLORS.normalSyntax[colorIndex], 1);
          g.fillRect(x * s, row.y * s, width * s, h);
        });
      });
      break;
    }
    case 'exclamation': {
      // 「!」: 縦棒 + 点。
      g.fillStyle(style.patternColor, 1);
      const barW = s * 0.1;
      g.fillRect(-barW / 2, -s * 0.22, barW, s * 0.26);
      g.fillCircle(0, s * 0.16, s * 0.07);
      break;
    }
    default: {
      const unreachable: never = pattern;
      throw new Error(`未対応の模様: ${String(unreachable)}`);
    }
  }
  if (kind === 'malicious' && maliciousType !== undefined) {
    // 種類ごとの差分: 星の右上の小円（バッジ）。
    const badge = getMaliciousCodeAppearance(maliciousType);
    g.fillStyle(badge.badgeColor, 1);
    g.lineStyle(badge.badgeBorderWidth, badge.badgeBorderColor, 1);
    g.fillCircle(s * 0.35, -s * 0.35, badge.badgeRadius);
    g.strokeCircle(s * 0.35, -s * 0.35, badge.badgeRadius);
  }
  g.setPosition(position.x, position.y);
  g.setDepth(CODE_DEPTH);
  return g;
};

// 仮: 主人公(PLAYER_DEPTH=1)より上。
const ATTACK_EFFECT_DEPTH = 1.5;
// 仮: 射程の輪の線幅（ピクセル）。企画書には未記載。
const ATTACK_EFFECT_STROKE_WIDTH = 2;

// 攻撃エフェクト（射程の輪）を表示して、一定時間で消す。命中・空振りで共通。
export const drawAttackEffect = (scene: Phaser.Scene, position: Point, range: number): void => {
  const ring = scene.add
    .circle(position.x, position.y, range, ATTACK_EFFECT_COLOR, 0.2)
    .setStrokeStyle(ATTACK_EFFECT_STROKE_WIDTH, ATTACK_EFFECT_COLOR)
    .setDepth(ATTACK_EFFECT_DEPTH);
  scene.tweens.add({
    targets: ring,
    alpha: 0,
    duration: ATTACK_EFFECT_DURATION_MS,
    onComplete: () => ring.destroy(),
  });
};

// 命中したコードを点滅させる（表示は消さない）。
export const flashCode = (scene: Phaser.Scene, code: Phaser.GameObjects.Graphics): void => {
  scene.tweens.killTweensOf(code);
  code.setAlpha(1);
  scene.tweens.add({
    targets: code,
    alpha: 0.2,
    duration: ATTACK_HIT_FLASH_DURATION_MS / 4,
    yoyo: true,
    repeat: 1,
  });
};

// 撃破エフェクト（コード位置に広がって消える輪）。コード本体は呼び出し側で破棄する。
export const drawDefeatEffect = (scene: Phaser.Scene, position: Point): void => {
  const ring = scene.add
    .circle(position.x, position.y, CODE_SIZE * DEFEAT_EFFECT_START_RADIUS_RATIO, DEFEAT_EFFECT_COLOR, 0.4)
    .setStrokeStyle(ATTACK_EFFECT_STROKE_WIDTH, DEFEAT_EFFECT_COLOR)
    .setDepth(ATTACK_EFFECT_DEPTH);
  scene.tweens.add({
    targets: ring,
    scale: DEFEAT_EFFECT_END_RADIUS_RATIO / DEFEAT_EFFECT_START_RADIUS_RATIO,
    alpha: 0,
    duration: DEFEAT_EFFECT_DURATION_MS,
    onComplete: () => ring.destroy(),
  });
};

// 正常リリースのエフェクト(#144)。リリース地点から緑の輪が広がり、RELEASE_BURST.particleCount 個の粒が放射状に飛んで消える。
// 1回のリリースで作るのは輪1個と粒 particleCount 個だけで、どれも Tween の完了時に破棄する（drawDefeatEffect と同じ）。
export const drawReleaseBurst = (scene: Phaser.Scene): void => {
  const { x, y } = RELEASE_POINT_CENTER;
  const { radius } = RELEASE_POINT_STYLE;
  const ring = scene.add
    .circle(x, y, radius)
    .setStrokeStyle(RELEASE_BURST.ringStrokeWidth, RELEASE_BURST.ringColor)
    .setDepth(ATTACK_EFFECT_DEPTH);
  scene.tweens.add({
    targets: ring,
    scale: RELEASE_BURST.ringEndRadius / radius,
    alpha: 0,
    duration: RELEASE_BURST.durationMs,
    onComplete: () => ring.destroy(),
  });
  burstParticleOffsets(RELEASE_BURST.particleCount, RELEASE_BURST.particleDistance).forEach((offset) => {
    const particle = scene.add
      .circle(x, y, RELEASE_BURST.particleRadius, RELEASE_BURST.particleColor)
      .setDepth(ATTACK_EFFECT_DEPTH);
    scene.tweens.add({
      targets: particle,
      x: x + offset.x,
      y: y + offset.y,
      alpha: 0,
      duration: RELEASE_BURST.durationMs,
      onComplete: () => particle.destroy(),
    });
  });
};

// 減点表示（コード位置から浮かんで消える赤い文字）。
export const drawPenaltyText = (scene: Phaser.Scene, position: Point, amount: number): void => {
  const text = scene.add
    .text(position.x, position.y, formatPenalty(amount), {
      fontSize: PENALTY_TEXT_FONT_SIZE,
      fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
      color: PENALTY_TEXT_COLOR,
      stroke: ELAPSED_DAYS_STYLE.strokeColor,
      strokeThickness: ELAPSED_DAYS_STYLE.strokeThickness,
    })
    .setOrigin(0.5)
    .setDepth(ATTACK_EFFECT_DEPTH);
  scene.tweens.add({
    targets: text,
    y: position.y - PENALTY_TEXT_RISE_PX,
    alpha: 0,
    duration: PENALTY_TEXT_DURATION_MS,
    onComplete: () => text.destroy(),
  });
};

// 仮: 攻撃エフェクト(1.5)より上の最前面。
const ELAPSED_DAYS_DEPTH = 2;

// レベルと経過日数の表示（左上。「Lv.1 / 0日」#164）。返した Text の setText（formatLevelAndDays）で更新する。
export const drawElapsedDays = (scene: Phaser.Scene, level: number, days: number): Phaser.GameObjects.Text =>
  scene.add
    .text(ELAPSED_DAYS_POSITION.x, ELAPSED_DAYS_POSITION.y, formatLevelAndDays(level, days), {
      fontSize: ELAPSED_DAYS_STYLE.fontSize,
      fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
      color: ELAPSED_DAYS_STYLE.color,
      stroke: ELAPSED_DAYS_STYLE.strokeColor,
      strokeThickness: ELAPSED_DAYS_STYLE.strokeThickness,
    })
    .setDepth(ELAPSED_DAYS_DEPTH);

// 仮・要確認(#46): HUD(2)より上、ゲームオーバー表示(GAME_OVER_DEPTH=3)より下。
const OUTAGE_TEXT_DEPTH = 2.5;
// 大障害の通知（フィールド中央の文字）。フェードアウトして自身を破棄する（drawPenaltyText と同じ形）。
export const drawOutageText = (scene: Phaser.Scene): void => {
  const text = scene.add
    .text(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, getMessages().outage.major, {
      fontSize: TECH_DEBT_OUTAGE_TEXT_FONT_SIZE,
      fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
      color: TECH_DEBT_OUTAGE_TEXT_COLOR,
      stroke: ELAPSED_DAYS_STYLE.strokeColor,
      strokeThickness: ELAPSED_DAYS_STYLE.strokeThickness,
    })
    .setOrigin(0.5)
    .setDepth(OUTAGE_TEXT_DEPTH);
  scene.tweens.add({
    targets: text,
    alpha: 0,
    duration: TECH_DEBT_OUTAGE_TEXT_DURATION_MS,
    onComplete: () => text.destroy(),
  });
};

// 仮: HUD(2)より上。
const GAME_OVER_DEPTH = 3;
// ゲームオーバー表示（全面の半透明オーバーレイと中央のタイトル・スコア・経過日数・案内の4行テキスト）。返した Container を destroy すると消える。
export const drawGameOver = (
  scene: Phaser.Scene,
  score: number,
  elapsedDays: number,
): Phaser.GameObjects.Container => {
  const centerX = FIELD_WIDTH / 2;
  const centerY = FIELD_HEIGHT / 2;
  const overlay = scene.add.rectangle(
    centerX,
    centerY,
    FIELD_WIDTH,
    FIELD_HEIGHT,
    GAME_OVER_OVERLAY.color,
    GAME_OVER_OVERLAY.alpha,
  );
  const texts = buildGameOverLines(score, elapsedDays).map((line) =>
    scene.add
      .text(centerX, line.y, line.text, {
        fontSize: `${line.fontSize}px`,
        fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
        color: ELAPSED_DAYS_STYLE.color,
        stroke: ELAPSED_DAYS_STYLE.strokeColor,
        strokeThickness: ELAPSED_DAYS_STYLE.strokeThickness,
      })
      .setOrigin(0.5),
  );
  return scene.add.container(0, 0, [overlay, ...texts]).setDepth(GAME_OVER_DEPTH);
};

// 雇う画面の文字スタイル。既存 HUD と同じ（サイズだけ指定可）。
const hireTextStyle = (fontSize: string): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontSize,
  fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
  color: ELAPSED_DAYS_STYLE.color,
  stroke: ELAPSED_DAYS_STYLE.strokeColor,
  strokeThickness: ELAPSED_DAYS_STYLE.strokeThickness,
});

// 雇った結果のメッセージ。一定時間後に消す。置き換えるときは前のものを破棄してから呼ぶ。
export const drawHireMessage = (scene: Phaser.Scene, message: string): Phaser.GameObjects.Text => {
  const text = scene.add
    .text(HIRE_MESSAGE_POSITION.x, HIRE_MESSAGE_POSITION.y, message, hireTextStyle('20px'))
    .setDepth(ELAPSED_DAYS_DEPTH);
  scene.time.delayedCall(HIRE_MESSAGE_DURATION_MS, () => text.destroy());
  return text;
};

// 置いたアイテム（色付き四角と短い文字）。主人公(1)より下、コード(0.5)と同じ深さ。
const ITEM_DEPTH = 0.4;

// 表示（四角と文字の Container）を返す(#58)。位置は配置グリッド（16px #151）のセルの中心、四角の一辺は ITEM_BOX_SIZE（配置判定のフットプリントと同じ）。
// 初期配置(#47)で撤去するときはこの Container を destroy() する。主人公についてまわるアイテム（ペアプロ相棒）は MainScene が毎フレーム setPosition で動かす。
export const drawPlacedItem = (scene: Phaser.Scene, item: PlacedItem): Phaser.GameObjects.Container => {
  const { x, y } = placementCellCenter(item.cell);
  const size = ITEM_BOX_SIZE;
  const box = scene.add.rectangle(0, 0, size, size, ITEM_COLORS[item.itemType]).setStrokeStyle(ITEM_BOX_STROKE.width, ITEM_BOX_STROKE.color);
  const mark = scene.add
    .text(0, 0, ITEM_MARKS[item.itemType], {
      fontSize: ITEM_MARK_STYLE.fontSize,
      fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
      color: ITEM_MARK_STYLE.color,
      stroke: ITEM_MARK_STYLE.strokeColor,
      strokeThickness: ITEM_MARK_STYLE.strokeThickness,
    })
    .setOrigin(0.5);
  return scene.add.container(x, y, [box, mark]).setDepth(ITEM_DEPTH);
};

// 置けるかどうかを示す枠（配置プレビュー #162）。塗りのない一辺 ITEM_BOX_SIZE の四角（アイテムの見た目・フットプリントと同じ大きさ）。
// create() で1つだけ作り、隠した状態で返す。位置・色・表示は updatePlacementPreview で変える。
export const drawPlacementPreview = (scene: Phaser.Scene): Phaser.GameObjects.Rectangle =>
  scene.add
    .rectangle(0, 0, ITEM_BOX_SIZE, ITEM_BOX_SIZE)
    .setStrokeStyle(PLACEMENT_PREVIEW.lineWidth, PLACEMENT_PREVIEW.okColor, PLACEMENT_PREVIEW.alpha)
    .setDepth(PLACEMENT_PREVIEW.depth)
    .setVisible(false);

// 枠を状態に合わせる(#162)。出さないなら隠すだけ。出すならセルの中心（placementCellCenter）に動かし、置けるかどうかで枠の色を変える。
export const updatePlacementPreview = (preview: Phaser.GameObjects.Rectangle, view: PlacementPreviewView): void => {
  if (!view.visible) {
    preview.setVisible(false);
    return;
  }
  const { x, y } = placementCellCenter(view.cell);
  preview
    .setPosition(x, y)
    .setStrokeStyle(
      PLACEMENT_PREVIEW.lineWidth,
      view.placeable ? PLACEMENT_PREVIEW.okColor : PLACEMENT_PREVIEW.ngColor,
      PLACEMENT_PREVIEW.alpha,
    )
    .setVisible(true);
};

// アイテムの攻撃演出（アイテムから対象への線）。一定時間表示して消す。
export const drawItemAttackEffect = (scene: Phaser.Scene, from: Point, to: Point): void => {
  const line = scene.add
    .line(0, 0, from.x, from.y, to.x, to.y, ITEM_ATTACK_LINE.color)
    .setOrigin(0)
    .setLineWidth(ITEM_ATTACK_LINE.width)
    .setDepth(ATTACK_EFFECT_DEPTH);
  // 倒産すると tweens.pauseAll() で Tween が止まるため、破棄は Tween の onComplete ではなく delayedCall で行う（drawItemMessage と同じ）。
  scene.time.delayedCall(ITEM_ATTACK_LINE.durationMs, () => line.destroy());
};

// アイテム購入の結果メッセージ。一定時間後に消す。置き換えるときは前のものを破棄してから呼ぶ。
export const drawItemMessage = (scene: Phaser.Scene, message: string): Phaser.GameObjects.Text => {
  const text = scene.add
    .text(ITEM_MESSAGE_POSITION.x, ITEM_MESSAGE_POSITION.y, message, {
      ...hireTextStyle('20px'),
      color: ITEM_MESSAGE_COLOR,
    })
    .setDepth(ELAPSED_DAYS_DEPTH);
  scene.time.delayedCall(ITEM_MESSAGE_DURATION_MS, () => text.destroy());
  return text;
};

// 初期配置(#47)のパネル（残ポイント・選択中のアイテムとコスト・操作説明）。返した Text の setText(formatInitialPlacementPanel(...)) で更新する。
// プレイ開始時に MainScene が destroy() する。
export const drawInitialPlacementPanel = (scene: Phaser.Scene, lines: readonly string[]): Phaser.GameObjects.Text =>
  scene.add
    .text(INITIAL_PLACEMENT_PANEL_POSITION.x, INITIAL_PLACEMENT_PANEL_POSITION.y, [...lines], {
      ...hireTextStyle(INITIAL_PLACEMENT_FONT_SIZE),
      lineSpacing: INITIAL_PLACEMENT_LINE_SPACING,
    })
    .setDepth(ELAPSED_DAYS_DEPTH);

// 初期配置(#47)の開始ボタン。クリックで onStart() を呼ぶ。見た目は雇うボタンと同じ色（HIRE_BUTTON_COLORS）、当たり判定は表示範囲と一致させる。
// stopPropagation はしない（main.ts が currentlyOver で配置を止める）。プレイ開始時に MainScene が destroy() する。
export const drawInitialPlacementStartButton = (
  scene: Phaser.Scene,
  onStart: () => void,
): Phaser.GameObjects.Container => {
  const { width, height } = INITIAL_PLACEMENT_START_BUTTON_SIZE;
  const background = scene.add
    .rectangle(0, 0, width, height, HIRE_BUTTON_COLORS.fill)
    .setOrigin(0)
    .setStrokeStyle(2, HIRE_BUTTON_COLORS.stroke);
  const label = scene.add
    .text(width / 2, height / 2, getMessages().initialPlacement.startButton, {
      fontSize: INITIAL_PLACEMENT_FONT_SIZE,
      fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
      color: HIRE_BUTTON_COLORS.text,
    })
    .setOrigin(0.5);
  const button = scene.add
    .container(INITIAL_PLACEMENT_START_BUTTON_POSITION.x, INITIAL_PLACEMENT_START_BUTTON_POSITION.y, [background, label])
    .setSize(width, height)
    .setDepth(ELAPSED_DAYS_DEPTH);
  button.setInteractive(
    new Phaser.Geom.Rectangle(width / 2, height / 2, width, height),
    Phaser.Geom.Rectangle.Contains,
  );
  button.on('pointerdown', () => onStart());
  return button;
};

// 初期配置(#47)の結果メッセージ。一定時間後に消す。置き換えるときは前のものを破棄してから呼ぶ（drawItemMessage と同じ形）。
export const drawInitialPlacementMessage = (scene: Phaser.Scene, message: string): Phaser.GameObjects.Text => {
  const text = scene.add
    .text(INITIAL_PLACEMENT_MESSAGE_POSITION.x, INITIAL_PLACEMENT_MESSAGE_POSITION.y, message, {
      ...hireTextStyle(INITIAL_PLACEMENT_FONT_SIZE),
      color: INITIAL_PLACEMENT_MESSAGE_COLOR,
    })
    .setDepth(ELAPSED_DAYS_DEPTH);
  scene.time.delayedCall(INITIAL_PLACEMENT_MESSAGE_DURATION_MS, () => text.destroy());
  return text;
};

// 初期配置(#157)のエンジニアの選択ボタン。クリックで onSelect() を呼ぶ。見た目・当たり判定・深さは開始ボタンと同じ。
// 文言（残りの人数）は setLabel、選んでいる間の強調は setSelected で切り替える。プレイ開始時に MainScene が container を destroy() する。
export type EngineerSelectButton = {
  readonly container: Phaser.GameObjects.Container;
  readonly setLabel: (text: string) => void;
  readonly setSelected: (selected: boolean) => void;
};

export const drawInitialPlacementEngineerButton = (
  scene: Phaser.Scene,
  text: string,
  onSelect: () => void,
): EngineerSelectButton => {
  const { width, height } = INITIAL_PLACEMENT_ENGINEER_BUTTON_SIZE;
  const background = scene.add
    .rectangle(0, 0, width, height, HIRE_BUTTON_COLORS.fill)
    .setOrigin(0)
    .setStrokeStyle(2, HIRE_BUTTON_COLORS.stroke);
  const label = scene.add
    .text(width / 2, height / 2, text, {
      fontSize: INITIAL_PLACEMENT_FONT_SIZE,
      fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
      color: HIRE_BUTTON_COLORS.text,
    })
    .setOrigin(0.5);
  const container = scene.add
    .container(INITIAL_PLACEMENT_ENGINEER_BUTTON_POSITION.x, INITIAL_PLACEMENT_ENGINEER_BUTTON_POSITION.y, [background, label])
    .setSize(width, height)
    .setDepth(ELAPSED_DAYS_DEPTH);
  container.setInteractive(
    new Phaser.Geom.Rectangle(width / 2, height / 2, width, height),
    Phaser.Geom.Rectangle.Contains,
  );
  // stopPropagation はしない（main.ts が currentlyOver で配置を止める）。
  container.on('pointerdown', () => onSelect());
  return {
    container,
    setLabel: (next) => {
      label.setText(next);
    },
    setSelected: (selected) => {
      background
        .setFillStyle(selected ? INITIAL_PLACEMENT_SELECTED_COLORS.fill : HIRE_BUTTON_COLORS.fill)
        .setStrokeStyle(2, selected ? INITIAL_PLACEMENT_SELECTED_COLORS.stroke : HIRE_BUTTON_COLORS.stroke);
    },
  };
};

// 初期配置(#157)でエンジニアを置ける床（ルートグリッド 60px のセル）を半透明で塗る。入力は持たない。
// 置く・外すたびに MainScene が destroy() して描き直し、プレイ開始時に destroy() する（drawField は変えない）。
export const drawEngineerCandidateOverlay = (
  scene: Phaser.Scene,
  cells: readonly GridCell[],
): Phaser.GameObjects.Graphics => {
  const g = scene.add.graphics();
  g.setDepth(ENGINEER_CANDIDATE_OVERLAY.depth);
  const { fillColor, fillAlpha, strokeColor, strokeWidth, strokeAlpha } = ENGINEER_CANDIDATE_OVERLAY;
  // 枠線はセルの内側に収める（隣のセルの枠と重ならないよう、線幅の半分だけ内側に描く）。
  const inset = strokeWidth / 2;
  cells.forEach((cell) => {
    const x = cell.col * CELL_SIZE;
    const y = cell.row * CELL_SIZE;
    g.fillStyle(fillColor, fillAlpha);
    g.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    g.lineStyle(strokeWidth, strokeColor, strokeAlpha);
    g.strokeRect(x + inset, y + inset, CELL_SIZE - strokeWidth, CELL_SIZE - strokeWidth);
  });
  return g;
};

// 初期配置(#157)の取消（×）ボタン。center を中心とする一辺 INITIAL_PLACEMENT_REMOVE_BUTTON.size の正方形で、クリックで onRemove() を呼ぶ。
// 当たり判定は見た目の正方形と同じ（setSize と半分ずらした矩形）。
// stopPropagation はしない。シーンの pointerdown も発行させ、main.ts が currentlyOver で配置を止める。撤去時・プレイ開始時に MainScene が destroy() する。
export const drawRemoveButton = (
  scene: Phaser.Scene,
  center: Point,
  onRemove: () => void,
): Phaser.GameObjects.Container => {
  const { size, fillColor, strokeColor, strokeWidth, label, fontSize, labelColor, depth } = INITIAL_PLACEMENT_REMOVE_BUTTON;
  const background = scene.add
    .rectangle(0, 0, size, size, fillColor)
    .setOrigin(0)
    .setStrokeStyle(strokeWidth, strokeColor);
  const mark = scene.add
    .text(size / 2, size / 2, label, {
      fontSize,
      fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
      color: labelColor,
    })
    .setOrigin(0.5);
  const container = scene.add
    .container(center.x - size / 2, center.y - size / 2, [background, mark])
    .setSize(size, size)
    .setDepth(depth);
  container.setInteractive(new Phaser.Geom.Rectangle(size / 2, size / 2, size, size), Phaser.Geom.Rectangle.Contains);
  container.on('pointerdown', () => onRemove());
  return container;
};

// メニュー・ポップオーバー(#156)の文字スタイル。小さい文字なので縁取りは付けない（背景の上に出す）。
const menuTextStyle = (): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontSize: MENU_FONT_SIZE,
  fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
  color: HIRE_BUTTON_COLORS.text,
  lineSpacing: MENU_LINE_SPACING,
});

// 右上のアイコン(#156)。開いているアイコンの強調（setOpen）と、初期配置の間に開けないアイコンを薄くする（setDimmed）を MainScene が切り替える。
export type MenuIcons = {
  readonly setOpen: (kind: MenuKind | null) => void;
  readonly setDimmed: (kind: MenuKind, dimmed: boolean) => void;
};

// アイコンの絵（Graphics）。座標はアイコンの左上を原点に、一辺 size に対する比率（MENU_ICON_GLYPH）から求める。
const drawMenuIconGlyph = (g: Phaser.GameObjects.Graphics, kind: MenuKind, size: number): void => {
  const glyph = MENU_ICON_GLYPH;
  switch (kind) {
    case 'engineer':
      // 人: 頭の円と胴体の角丸の四角。
      g.fillStyle(MENU_ICON_COLORS.glyph);
      g.fillCircle(size * glyph.headX, size * glyph.headY, size * glyph.headRadius);
      g.fillRoundedRect(
        size * glyph.bodyX,
        size * glyph.bodyY,
        size * glyph.bodyWidth,
        size * glyph.bodyHeight,
        size * glyph.bodyRadius,
      );
      return;
    case 'item':
      // 箱: 四角の輪郭と、ふたの線。
      g.lineStyle(glyph.lineWidth, MENU_ICON_COLORS.glyph);
      g.strokeRect(size * glyph.boxX, size * glyph.boxY, size * glyph.boxSize, size * glyph.boxSize);
      g.lineBetween(size * glyph.boxX, size * glyph.lidY, size * (glyph.boxX + glyph.boxSize), size * glyph.lidY);
      return;
    case 'balance': {
      // 開発バランス: 機能開発とリファクタリングの2色に分けた横棒。
      const barX = size * glyph.barX;
      const barY = size * glyph.barY;
      const barWidth = size * glyph.barWidth;
      const barHeight = size * glyph.barHeight;
      const featureWidth = barWidth * glyph.featureRatio;
      g.fillStyle(MENU_ICON_COLORS.feature);
      g.fillRect(barX, barY, featureWidth, barHeight);
      g.fillStyle(MENU_ICON_COLORS.refactoring);
      g.fillRect(barX + featureWidth, barY, barWidth - featureWidth, barHeight);
      return;
    }
  }
};

// 右上の3つのアイコン(#156)。クリックで onPress(種類) を呼ぶ。位置は menuIconRect（floatingMenu.ts）。
// 当たり判定は見た目の正方形と同じ（drawRemoveButton と同じく setSize と半分ずらした矩形）。stopPropagation はしない（main.ts が currentlyOver で移動・攻撃・配置を止める）。
export const drawMenuIcons = (scene: Phaser.Scene, onPress: (kind: MenuKind) => void): MenuIcons => {
  const icons = MENU_KINDS.map((kind) => {
    const rect = menuIconRect(kind);
    const background = scene.add
      .rectangle(0, 0, rect.width, rect.height, MENU_ICON_COLORS.fill)
      .setOrigin(0)
      .setStrokeStyle(MENU_ICON_STROKE_WIDTH, MENU_ICON_COLORS.stroke);
    const glyph = scene.add.graphics();
    drawMenuIconGlyph(glyph, kind, rect.width);
    const container = scene.add
      .container(rect.x, rect.y, [background, glyph])
      .setSize(rect.width, rect.height)
      .setDepth(ELAPSED_DAYS_DEPTH);
    container.setInteractive(
      new Phaser.Geom.Rectangle(rect.width / 2, rect.height / 2, rect.width, rect.height),
      Phaser.Geom.Rectangle.Contains,
    );
    container.on('pointerdown', () => onPress(kind));
    return { kind, background, container };
  });
  return {
    setOpen: (openKind) => {
      icons.forEach((icon) => {
        const open = icon.kind === openKind;
        icon.background
          .setFillStyle(open ? INITIAL_PLACEMENT_SELECTED_COLORS.fill : MENU_ICON_COLORS.fill)
          .setStrokeStyle(MENU_ICON_STROKE_WIDTH, open ? INITIAL_PLACEMENT_SELECTED_COLORS.stroke : MENU_ICON_COLORS.stroke);
      });
    },
    setDimmed: (kind, dimmed) => {
      icons.find((icon) => icon.kind === kind)?.container.setAlpha(dimmed ? MENU_ICON_DIM_ALPHA : 1);
    },
  };
};

// 開いているメニュー・ポップオーバー(#156)。開くときに作り、閉じるとき（別のものを開く・外を押す・ゲームオーバー）に destroy() する。
export type FloatingPanel = { readonly destroy: () => void };

// パネルのボタン1つ。selected は現在値・選択中の強調。colors は通常の色（アイテムの枠だけ ITEM_BUTTON_COLORS）。
type PanelButton = {
  readonly label: string;
  readonly onPress: () => void;
  readonly selected: boolean;
};
type PanelButtonColors = { readonly fill: number; readonly stroke: number; readonly text: string };

// パネルの1行の中身。text は文字の行、buttons は横に並べるボタン（null の枠は文字だけを出す。ページ表示に使う）、
// gauge は開発バランスの2色のゲージ（ratio はリファクタリングの割合 #165）。
type PanelEntry =
  | { readonly kind: 'text'; readonly lines: readonly string[] }
  | { readonly kind: 'buttons'; readonly buttons: readonly (PanelButton | { readonly label: string; readonly onPress: null })[] }
  | { readonly kind: 'gauge'; readonly ratio: number };

// 開発バランスのゲージ(#165)。行の矩形 row いっぱいに、左から機能開発・リファクタリングの幅（gaugeSegmentWidths）で塗り、外枠を描く。入力は受け付けない。
const drawBalanceGauge = (scene: Phaser.Scene, row: Rect, ratio: number): Phaser.GameObjects.Graphics => {
  const { feature, refactoring } = gaugeSegmentWidths(ratio, row.width);
  const g = scene.add.graphics().setDepth(MENU_PANEL_DEPTH);
  g.fillStyle(BALANCE_GAUGE.featureColor);
  g.fillRect(row.x, row.y, feature, row.height);
  g.fillStyle(BALANCE_GAUGE.refactoringColor);
  g.fillRect(row.x + feature, row.y, refactoring, row.height);
  g.lineStyle(BALANCE_GAUGE.strokeWidth, BALANCE_GAUGE.strokeColor);
  g.strokeRect(row.x, row.y, row.width, row.height);
  return g;
};

// パネルのボタン（Rectangle と Text の Container）。当たり判定は drawRemoveButton と同じく、表示範囲と一致させるため矩形を半分ずらす。
const drawPanelButton = (
  scene: Phaser.Scene,
  rect: Rect,
  button: PanelButton,
  colors: PanelButtonColors,
): Phaser.GameObjects.Container => {
  const { width, height } = rect;
  const background = scene.add
    .rectangle(0, 0, width, height, button.selected ? INITIAL_PLACEMENT_SELECTED_COLORS.fill : colors.fill)
    .setOrigin(0)
    .setStrokeStyle(MENU_ICON_STROKE_WIDTH, button.selected ? INITIAL_PLACEMENT_SELECTED_COLORS.stroke : colors.stroke);
  const label = scene.add
    .text(width / 2, height / 2, button.label, { ...menuTextStyle(), color: colors.text })
    .setOrigin(0.5);
  const container = scene.add
    .container(rect.x, rect.y, [background, label])
    .setSize(width, height)
    .setDepth(MENU_PANEL_DEPTH);
  container.setInteractive(
    new Phaser.Geom.Rectangle(width / 2, height / 2, width, height),
    Phaser.Geom.Rectangle.Contains,
  );
  container.on('pointerdown', button.onPress);
  return container;
};

// メニュー・ポップオーバーの共通の描画(#156)。半透明の背景の上に、行ごとの中身（entries。layout.rows と同じ順・同じ数）を並べる。
// 背景全体を interactive にして、背景・余白・ボタンの間の押下も currentlyOver に入れる（main.ts が移動・攻撃・配置を止め、パネルも閉じない）。
// stopPropagation はしない。背景とボタンは同じ深さで、後から作るボタンが手前になり、押下はボタンに届く。
export const drawFloatingPanel = (
  scene: Phaser.Scene,
  layout: PanelLayout,
  entries: readonly PanelEntry[],
  buttonColors: PanelButtonColors = HIRE_BUTTON_COLORS,
): FloatingPanel => {
  if (entries.length !== layout.rows.length) {
    throw new Error(`パネルの行数が配置と一致しません: entries=${entries.length}, rows=${layout.rows.length}`);
  }
  const { rect } = layout;
  const background = scene.add
    .rectangle(rect.x, rect.y, rect.width, rect.height, MENU_PANEL_COLORS.fill, MENU_PANEL_COLORS.fillAlpha)
    .setOrigin(0)
    .setStrokeStyle(MENU_PANEL_COLORS.strokeWidth, MENU_PANEL_COLORS.stroke)
    .setDepth(MENU_PANEL_DEPTH);
  background.setInteractive(new Phaser.Geom.Rectangle(0, 0, rect.width, rect.height), Phaser.Geom.Rectangle.Contains);
  const objects: Phaser.GameObjects.GameObject[] = [background];
  entries.forEach((entry, index) => {
    const row = layout.rows[index];
    if (entry.kind === 'text') {
      objects.push(scene.add.text(row.x, row.y, [...entry.lines], menuTextStyle()).setDepth(MENU_PANEL_DEPTH));
      return;
    }
    if (entry.kind === 'gauge') {
      objects.push(drawBalanceGauge(scene, row, entry.ratio));
      return;
    }
    splitRow(row, entry.buttons.length).forEach((cell, cellIndex) => {
      const button = entry.buttons[cellIndex];
      if (button.onPress === null) {
        objects.push(
          scene.add
            .text(cell.x + cell.width / 2, cell.y + cell.height / 2, button.label, menuTextStyle())
            .setOrigin(0.5)
            .setDepth(MENU_PANEL_DEPTH),
        );
        return;
      }
      objects.push(drawPanelButton(scene, cell, button, buttonColors));
    });
  });
  return { destroy: () => objects.forEach((object) => object.destroy()) };
};

// エンジニアのメニュー(#156)の中身。人数、雇うボタン（ランクごと）、選択中のエンジニア。
export type EngineerMenuView = {
  readonly count: number;
  readonly max: number;
  // 雇うときの費用はない(#179)ので、雇うボタンはランクだけで作る。
  readonly hireOptions: readonly { readonly rank: EngineerRank }[];
  readonly selected: Engineer | null;
};
// 前へ・次へと昇給・減給のボタンは #186 で外した（昇給・減給はエンジニアのポップオーバーで操作する）。
export type EngineerMenuCallbacks = {
  readonly onHire: (rank: EngineerRank) => void;
};

export const drawEngineerMenu = (
  scene: Phaser.Scene,
  view: EngineerMenuView,
  callbacks: EngineerMenuCallbacks,
): FloatingPanel =>
  drawFloatingPanel(scene, menuPanelLayout('engineer'), [
    { kind: 'text', lines: [formatEngineerCount(view.count, view.max)] },
    ...view.hireOptions.map(
      (option): PanelEntry => ({
        kind: 'buttons',
        buttons: [{ label: formatHireOption(option.rank), onPress: () => callbacks.onHire(option.rank), selected: false }],
      }),
    ),
    { kind: 'text', lines: formatSelectedEngineerLines(view.selected) },
  ]);

// アイテムのメニュー(#156)の中身。ページ内の枠の文言（ITEM_PAGE_SIZE 個。最後のページの空きは null で、ボタンを出さない）、ページ表示、
// 強調する枠（初期配置で選んでいるアイテム #157。強調しないなら null）。
export type ItemMenuView = {
  readonly labels: readonly (string | null)[];
  readonly pageLabel: string;
  // 総ページ数（1以上）。1ページしかないときは ◀ ▶ を出さない(#187)。
  readonly pageCount: number;
  readonly selectedSlot: number | null;
};
export type ItemMenuCallbacks = {
  readonly onBuySlot: (slot: number) => void;
  readonly onPage: (direction: ItemPageDirection) => void;
};

export const drawItemMenu = (scene: Phaser.Scene, view: ItemMenuView, callbacks: ItemMenuCallbacks): FloatingPanel =>
  drawFloatingPanel(
    scene,
    menuPanelLayout('item'),
    [
      ...view.labels.map(
        (label, slot): PanelEntry =>
          label === null
            ? { kind: 'text', lines: [] }
            : {
                kind: 'buttons',
                buttons: [{ label, onPress: () => callbacks.onBuySlot(slot), selected: slot === view.selectedSlot }],
              },
      ),
      {
        kind: 'buttons',
        buttons: [
          // 1ページ（以下）のときは矢印を空の非対話セルにする(#187)。3セルの構成とパネル背景の入力遮断は保つ。
          view.pageCount > 1
            ? { label: ITEM_PAGE_BUTTON_LABELS.previous, onPress: () => callbacks.onPage('previous'), selected: false }
            : { label: '', onPress: null },
          { label: view.pageLabel, onPress: null },
          view.pageCount > 1
            ? { label: ITEM_PAGE_BUTTON_LABELS.next, onPress: () => callbacks.onPage('next'), selected: false }
            : { label: '', onPress: null },
        ],
      },
    ],
    ITEM_BUTTON_COLORS,
  );

// 開発バランスのメニュー(#156, #165)。見出し、2色のゲージ（左が機能開発・右がリファクタリング）、割合の文言「機能80:リファ20」、
// ◀ / ▶ のボタンを縦に並べる。◀ はリファクタリングへ、▶ は機能開発へ1段階寄せる（onStep に向きを渡す。刻みは MainScene の stepRefactoringRatio）。
export const drawBalanceMenu = (
  scene: Phaser.Scene,
  view: { readonly ratio: number },
  onStep: (direction: RefactoringRatioDirection) => void,
): FloatingPanel =>
  drawFloatingPanel(scene, menuPanelLayout('balance'), [
    { kind: 'text', lines: [getMessages().balance.title] },
    { kind: 'gauge', ratio: view.ratio },
    { kind: 'text', lines: [formatRefactoringAllocation(view.ratio)] },
    {
      kind: 'buttons',
      buttons: [
        { label: BALANCE_STEP_BUTTON_LABELS.refactoring, onPress: () => onStep('refactoring'), selected: false },
        { label: BALANCE_STEP_BUTTON_LABELS.feature, onPress: () => onStep('feature'), selected: false },
      ],
    },
  ]);

export type EngineerPopoverCallbacks = {
  readonly onAdjustSalary: (direction: SalaryDirection) => void;
  readonly onToggleVacation: () => void;
  readonly onDismiss: () => void;
  readonly onBuyAiAgent: (agentType: AiAgentType) => void;
};

// エンジニアのポップオーバー(#156)。出現地点（anchor はその中心）の右に、見出し「#id ランク AI: 種類」・休暇の状態と月給・
// 昇給／減給・休暇／復職と解雇(#186)・AIエージェントのボタン（価格付き。付けている種類を強調）を縦に並べる。位置は popoverLayout（フィールドの内側に収める）。
// 休暇の案内文(#150)は #165 でゲームの説明（help.ts）に移した。
export const drawEngineerPopover = (
  scene: Phaser.Scene,
  anchor: Point,
  engineer: Engineer,
  callbacks: EngineerPopoverCallbacks,
): FloatingPanel =>
  drawFloatingPanel(scene, popoverLayout(anchor), [
    { kind: 'text', lines: formatEngineerPopoverLines(engineer) },
    {
      kind: 'buttons',
      buttons: [
        { label: getMessages().engineer.salaryButtons.raise, onPress: () => callbacks.onAdjustSalary('raise'), selected: false },
        { label: getMessages().engineer.salaryButtons.cut, onPress: () => callbacks.onAdjustSalary('cut'), selected: false },
      ],
    },
    {
      kind: 'buttons',
      buttons: [
        { label: formatVacationButton(engineer), onPress: callbacks.onToggleVacation, selected: false },
        { label: getMessages().engineer.dismiss, onPress: callbacks.onDismiss, selected: false },
      ],
    },
    ...AI_AGENT_BUTTON_ORDER.map(
      (agentType): PanelEntry => ({
        kind: 'buttons',
        buttons: [
          {
            label: formatAiAgentOption(agentType),
            onPress: () => callbacks.onBuyAiAgent(agentType),
            selected: engineer.aiAgent === agentType,
          },
        ],
      }),
    ),
  ]);

// 右下の小さな指標(#156, #165)。絵文字＋数字の4つを2列 × 2行に並べる（上の行は 💰 資金と 💸 月末に支払うお金、下の行は 📈 累計売上と 🔵🟡🔴 技術的負債）。
// 💸 は赤文字（STATUS_PANEL_PAYMENT_COLOR）。負債は段階の絵文字と数字（formatTechDebtStatus）。
// 入力は受け付けない（setInteractive しない）ので、currentlyOver に入らず主人公の移動・攻撃を妨げない。値が変わったら MainScene が各 set で更新する。
export type StatusPanel = {
  readonly setFunds: (funds: number) => void;
  readonly setScore: (score: number) => void;
  readonly setMonthEndPayment: (amount: number) => void;
  readonly setTechDebt: (techDebt: number) => void;
};

export type StatusPanelValues = {
  readonly funds: number;
  readonly score: number;
  readonly monthEndPayment: number;
  readonly techDebt: number;
};

export const drawStatusPanel = (scene: Phaser.Scene, initial: StatusPanelValues): StatusPanel => {
  const rect = STATUS_PANEL_RECT;
  scene.add
    .rectangle(rect.x, rect.y, rect.width, rect.height, STATUS_PANEL_COLORS.fill, STATUS_PANEL_COLORS.fillAlpha)
    .setOrigin(0)
    .setDepth(ELAPSED_DAYS_DEPTH);
  const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    fontSize: STATUS_PANEL_FONT_SIZE,
    fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
    color: ELAPSED_DAYS_STYLE.color,
    lineSpacing: STATUS_PANEL_LINE_SPACING,
  };
  const cell = (
    position: { readonly column: number; readonly row: number },
    text: string,
    color: string = ELAPSED_DAYS_STYLE.color,
  ): Phaser.GameObjects.Text => {
    const { x, y } = statusPanelCellRect(position.column, position.row);
    return scene.add.text(x, y, text, { ...textStyle, color }).setDepth(ELAPSED_DAYS_DEPTH);
  };
  const funds = cell(STATUS_PANEL_CELLS.funds, formatFunds(initial.funds));
  const payment = cell(STATUS_PANEL_CELLS.monthEndPayment, formatMonthEndPayment(initial.monthEndPayment), STATUS_PANEL_PAYMENT_COLOR);
  const sales = cell(STATUS_PANEL_CELLS.sales, formatCumulativeSales(initial.score));
  const techDebt = cell(STATUS_PANEL_CELLS.techDebt, formatTechDebtStatus(initial.techDebt));
  return {
    setFunds: (value) => {
      funds.setText(formatFunds(value));
    },
    setScore: (value) => {
      sales.setText(formatCumulativeSales(value));
    },
    setMonthEndPayment: (value) => {
      payment.setText(formatMonthEndPayment(value));
    },
    setTechDebt: (value) => {
      techDebt.setText(formatTechDebtStatus(value));
    },
  };
};

// ゲームの説明のアイコン(#165)。右上の一番右（HELP_ICON_RECT）に、メニューのアイコンと同じ見た目の正方形と ℹ️ の文字を描く。
// クリックで onPress() を呼ぶ。当たり判定は見た目の正方形と同じ。stopPropagation はしない（main.ts が currentlyOver で移動・攻撃・配置を止める）。
export const drawHelpIcon = (scene: Phaser.Scene, onPress: () => void): Phaser.GameObjects.Container => {
  const rect = HELP_ICON_RECT;
  const background = scene.add
    .rectangle(0, 0, rect.width, rect.height, MENU_ICON_COLORS.fill)
    .setOrigin(0)
    .setStrokeStyle(MENU_ICON_STROKE_WIDTH, MENU_ICON_COLORS.stroke);
  const glyph = scene.add
    .text(rect.width / 2, rect.height / 2, HUD_ICONS.help, { fontSize: HELP_ICON_FONT_SIZE, fontFamily: ELAPSED_DAYS_STYLE.fontFamily })
    .setOrigin(0.5);
  const container = scene.add
    .container(rect.x, rect.y, [background, glyph])
    .setSize(rect.width, rect.height)
    .setDepth(ELAPSED_DAYS_DEPTH);
  container.setInteractive(
    new Phaser.Geom.Rectangle(rect.width / 2, rect.height / 2, rect.width, rect.height),
    Phaser.Geom.Rectangle.Contains,
  );
  container.on('pointerdown', () => onPress());
  return container;
};

// ゲームの説明(#165)。全面の半透明の背景（押すと onClose）、中央のパネル（見出しと説明の行。押しても閉じない）、右上の ✕（押すと onClose）。
// 背景とパネルは interactive にして、下にあるボタン・アイコン・フィールドへの押下をすべて受け止める（Phaser の topOnly で一番上だけが受け取る）。
// 深さはゲームオーバー表示（GAME_OVER_DEPTH）より上（HELP_OVERLAY.depth）。開くときに作り、閉じるときに destroy() する。
export const drawHelpOverlay = (
  scene: Phaser.Scene,
  title: string,
  lines: readonly string[],
  onClose: () => void,
): FloatingPanel => {
  const layout = helpLayout(lines.length);
  const { panel, close } = layout;
  const depth = HELP_OVERLAY.depth;
  const backdrop = scene.add
    .rectangle(0, 0, FIELD_WIDTH, FIELD_HEIGHT, HELP_OVERLAY.backdropColor, HELP_OVERLAY.backdropAlpha)
    .setOrigin(0)
    .setDepth(depth);
  backdrop.setInteractive(new Phaser.Geom.Rectangle(0, 0, FIELD_WIDTH, FIELD_HEIGHT), Phaser.Geom.Rectangle.Contains);
  backdrop.on('pointerdown', () => onClose());
  const background = scene.add
    .rectangle(panel.x, panel.y, panel.width, panel.height, MENU_PANEL_COLORS.fill, MENU_PANEL_COLORS.fillAlpha)
    .setOrigin(0)
    .setStrokeStyle(MENU_PANEL_COLORS.strokeWidth, MENU_PANEL_COLORS.stroke)
    .setDepth(depth);
  background.setInteractive(new Phaser.Geom.Rectangle(0, 0, panel.width, panel.height), Phaser.Geom.Rectangle.Contains);
  const textStyle = (fontSize: string): Phaser.Types.GameObjects.Text.TextStyle => ({
    fontSize,
    fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
    color: HIRE_BUTTON_COLORS.text,
  });
  const titleText = scene.add.text(layout.title.x, layout.title.y, title, textStyle(HELP_OVERLAY.titleFontSize)).setDepth(depth);
  const lineTexts = lines.map((line, index) =>
    scene.add.text(layout.lines[index].x, layout.lines[index].y, line, textStyle(HELP_OVERLAY.lineFontSize)).setDepth(depth),
  );
  const closeBackground = scene.add
    .rectangle(0, 0, close.width, close.height, HIRE_BUTTON_COLORS.fill)
    .setOrigin(0)
    .setStrokeStyle(MENU_ICON_STROKE_WIDTH, HIRE_BUTTON_COLORS.stroke);
  const closeLabel = scene.add
    .text(close.width / 2, close.height / 2, HELP_OVERLAY.closeButtonLabel, textStyle(HELP_OVERLAY.closeButtonFontSize))
    .setOrigin(0.5);
  const closeButton = scene.add
    .container(close.x, close.y, [closeBackground, closeLabel])
    .setSize(close.width, close.height)
    .setDepth(depth);
  closeButton.setInteractive(
    new Phaser.Geom.Rectangle(close.width / 2, close.height / 2, close.width, close.height),
    Phaser.Geom.Rectangle.Contains,
  );
  closeButton.on('pointerdown', () => onClose());
  const objects: Phaser.GameObjects.GameObject[] = [backdrop, background, titleText, ...lineTexts, closeButton];
  return { destroy: () => objects.forEach((object) => object.destroy()) };
};

// バーチャルパッド(#182)。VIRTUAL_PAD_RECT の 3 × 3 のセルのうち、上下左右と中央（攻撃）の5つのボタンを半透明で描く（四隅は描かず、押下も受け取らない）。
// 押すと onPress(pointer) を呼ぶ。どのボタンかは main.ts が押した位置（virtualPadZoneAt）で決める（押したまま隣のボタンへ指を滑らせたときも同じ判定にする）。
// 当たり判定は見た目の正方形と同じ。stopPropagation はしない（main.ts が currentlyOver で移動・攻撃・配置を止める）。
export const drawVirtualPad = (scene: Phaser.Scene, onPress: (pointer: Phaser.Input.Pointer) => void): void => {
  const size = VIRTUAL_PAD_CELL_SIZE;
  VIRTUAL_PAD_BUTTONS.forEach(({ zone, col, row }) => {
    const background = scene.add
      .rectangle(0, 0, size, size, VIRTUAL_PAD_STYLE.fill)
      .setOrigin(0)
      .setStrokeStyle(VIRTUAL_PAD_STYLE.strokeWidth, VIRTUAL_PAD_STYLE.stroke);
    const glyph = scene.add
      .text(size / 2, size / 2, VIRTUAL_PAD_LABELS[zone], {
        fontSize: VIRTUAL_PAD_STYLE.glyphFontSize,
        fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
        color: VIRTUAL_PAD_STYLE.glyphColor,
      })
      .setOrigin(0.5);
    const container = scene.add
      .container(VIRTUAL_PAD_RECT.x + col * size, VIRTUAL_PAD_RECT.y + row * size, [background, glyph])
      .setSize(size, size)
      .setDepth(VIRTUAL_PAD_STYLE.depth)
      .setAlpha(VIRTUAL_PAD_STYLE.alpha);
    container.setInteractive(new Phaser.Geom.Rectangle(size / 2, size / 2, size, size), Phaser.Geom.Rectangle.Contains);
    container.on('pointerdown', (pointer: Phaser.Input.Pointer) => onPress(pointer));
  });
};
