import Phaser from 'phaser';
import {
  CELL_SIZE,
  FIELD_COLORS,
  FIELD_COLS,
  FIELD_HEIGHT,
  FIELD_ROWS,
  FIELD_WIDTH,
  GRID_LINE_WIDTH,
} from './field';
import { RELEASE_POINT_CENTER, RELEASE_POINT_STYLE } from './releasePoint';
import {
  cellCenter,
  ROUTE_STYLE,
  routePixelPoints,
  SPAWN_MARKER_STYLE,
  VACATION_MARKER_STYLE,
} from './route';
import type { Point, Route } from './route';
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
  ATTACK_EFFECT_COLOR,
  ATTACK_EFFECT_DURATION_MS,
  ATTACK_HIT_FLASH_DURATION_MS,
  DEFEAT_EFFECT_COLOR,
  DEFEAT_EFFECT_DURATION_MS,
  DEFEAT_EFFECT_END_RADIUS_RATIO,
  DEFEAT_EFFECT_START_RADIUS_RATIO,
  CUMULATIVE_SALES_POSITION,
  ELAPSED_DAYS_POSITION,
  ELAPSED_DAYS_STYLE,
  FUNDS_POSITION,
  GAME_OVER_OVERLAY,
  HIRE_BUTTON_COLORS,
  HIRE_BUTTON_FONT_SIZE,
  HIRE_BUTTON_SIZE,
  HIRE_COUNT_POSITION,
  HIRE_MESSAGE_DURATION_MS,
  HIRE_MESSAGE_POSITION,
  HIRE_UI_POSITION,
  PENALTY_TEXT_COLOR,
  PENALTY_TEXT_DURATION_MS,
  PENALTY_TEXT_FONT_SIZE,
  PENALTY_TEXT_RISE_PX,
  REFACTORING_RATIO_BUTTON_LABELS,
  REFACTORING_RATIO_BUTTON_SIZE,
  REFACTORING_RATIO_FONT_SIZE,
  REFACTORING_RATIO_LABEL_WIDTH,
  REFACTORING_RATIO_UI_GAP,
  REFACTORING_RATIO_UI_POSITION,
  SALARY_ADJUST_KEYS,
  SALARY_BUTTON_FONT_SIZE,
  SALARY_BUTTON_LABELS,
  SALARY_BUTTON_ORDER,
  SALARY_BUTTON_SIZE,
  SALARY_SELECT_KEYS,
  SALARY_UI_POSITION,
  SELECTED_ENGINEER_FONT_SIZE,
  SELECTED_ENGINEER_POSITION,
  TECH_DEBT_OUTAGE_TEXT,
  TECH_DEBT_OUTAGE_TEXT_COLOR,
  TECH_DEBT_OUTAGE_TEXT_DURATION_MS,
  TECH_DEBT_OUTAGE_TEXT_FONT_SIZE,
  TECH_DEBT_POSITION,
} from './config';
import { formatPenalty } from './penalty';
import { formatElapsedDays } from './gameTime';
import { formatFunds } from './funds';
import { formatCumulativeSales } from './score';
import { formatTechDebt } from './techDebt';
import { buildGameOverLines } from './gameOver';
import { formatEngineerCount, formatHireButton, formatSalaryButton, formatSelectedEngineer } from './engineer';
import type { Engineer, EngineerRank, EngineerSelectDirection, SalaryDirection } from './engineer';
import { getPlayerStartPosition, PLAYER_COLORS, PLAYER_SIZE } from './player';
import {
  ITEM_ATTACK_LINE,
  ITEM_BOX_RATIO,
  ITEM_BUTTON_COLORS,
  ITEM_BUTTON_FILL_ALPHA,
  ITEM_BUTTON_FONT_SIZE,
  ITEM_BUTTON_SIZE,
  ITEM_COLORS,
  ITEM_MARK_STYLE,
  ITEM_MARKS,
  ITEM_MESSAGE_COLOR,
  ITEM_MESSAGE_DURATION_MS,
  ITEM_MESSAGE_POSITION,
  ITEM_UI_POSITION,
  INITIAL_PLACEMENT_FONT_SIZE,
  INITIAL_PLACEMENT_LINE_SPACING,
  INITIAL_PLACEMENT_MESSAGE_COLOR,
  INITIAL_PLACEMENT_MESSAGE_DURATION_MS,
  INITIAL_PLACEMENT_MESSAGE_POSITION,
  INITIAL_PLACEMENT_PANEL_POSITION,
  INITIAL_PLACEMENT_START_BUTTON_POSITION,
  INITIAL_PLACEMENT_START_BUTTON_SIZE,
  INITIAL_PLACEMENT_TEXT,
} from './config';
import { formatItemButton } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import type { ItemType } from './item';
import type { RefactoringRatioDirection } from './refactoringRatioControl';

// 後続オブジェクトより常に下に描画する。
const FIELD_DEPTH = -1;
// 主人公はフィールドより手前に描画する。
const PLAYER_DEPTH = 1;

export const drawField = (scene: Phaser.Scene): void => {
  const g = scene.add.graphics();
  g.setDepth(FIELD_DEPTH);
  g.fillStyle(FIELD_COLORS.ground, 1);
  g.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
  g.lineStyle(GRID_LINE_WIDTH, FIELD_COLORS.grid, 1);
  for (let col = 0; col <= FIELD_COLS; col++) {
    g.lineBetween(col * CELL_SIZE, 0, col * CELL_SIZE, FIELD_HEIGHT);
  }
  for (let row = 0; row <= FIELD_ROWS; row++) {
    g.lineBetween(0, row * CELL_SIZE, FIELD_WIDTH, row * CELL_SIZE);
  }
};

// 仮: フィールド（FIELD_DEPTH=-1）より手前、後続オブジェクトの邪魔にならない深さ。
const RELEASE_POINT_DEPTH = 0;

export const drawReleasePoint = (scene: Phaser.Scene): void => {
  const { x, y } = RELEASE_POINT_CENTER;
  const {
    radius,
    fillColor,
    strokeColor,
    strokeWidth,
    label,
    labelFontSize,
    labelFontFamily,
    labelColor,
    labelGap,
  } = RELEASE_POINT_STYLE;
  scene.add
    .circle(x, y, radius, fillColor)
    .setStrokeStyle(strokeWidth, strokeColor)
    .setDepth(RELEASE_POINT_DEPTH);
  scene.add
    .text(x, y - radius - labelGap, label, {
      fontSize: labelFontSize,
      fontFamily: labelFontFamily,
      color: labelColor,
    })
    .setOrigin(0.5, 1)
    .setDepth(RELEASE_POINT_DEPTH);
};

// 仮: フィールド(-1)より上、リリース地点(0)より下。
const ROUTE_DEPTH = -0.5;

// ルート1本ぶんの描画（線と出現場所の円）(#32)。退職でルートが消えるときに destroy() する。
export type RouteDrawing = {
  readonly line: Phaser.GameObjects.Graphics;
  readonly spawnMarker: Phaser.GameObjects.Arc;
};

// ルートごとに線の Graphics と出現場所の円を1個ずつ作り、routeId をキーにして返す。
// 重なり順を変えないよう、先に全ルートの線を作ってから円を作る（線の上に円が来る）。
export const drawRoutes = (scene: Phaser.Scene, routes: readonly Route[]): Map<number, RouteDrawing> => {
  const lines = routes.map((route) => {
    const g = scene.add.graphics();
    g.setDepth(ROUTE_DEPTH);
    g.lineStyle(ROUTE_STYLE.width, ROUTE_STYLE.color, ROUTE_STYLE.alpha);
    const points = routePixelPoints(route);
    for (let i = 1; i < points.length; i++) {
      g.lineBetween(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
    }
    return g;
  });
  return new Map(
    routes.map((route, index): [number, RouteDrawing] => {
      const { x, y } = cellCenter(route.spawn);
      const spawnMarker = scene.add
        .circle(x, y, SPAWN_MARKER_STYLE.radius, SPAWN_MARKER_STYLE.fillColor)
        .setStrokeStyle(SPAWN_MARKER_STYLE.strokeWidth, SPAWN_MARKER_STYLE.strokeColor)
        .setDepth(ROUTE_DEPTH);
      return [route.id, { line: lines[index], spawnMarker }];
    }),
  );
};

// 仮: ルート(-0.5)より上、リリース地点(0)より下。出現場所の円の上に重ねる。
const VACATION_MARKER_DEPTH = -0.4;

export type VacationMarker = {
  readonly container: Phaser.GameObjects.Container;
  // 休暇中なら灰色の円と「休」を表示し、そうでなければ隠して通常の出現場所マーカーを見せる。
  readonly setOnVacation: (onVacation: boolean) => void;
};

// 出現場所の円に重ねる休暇の切り替えマーカー(#35)。タップで onToggle を呼ぶ。drawRoutes の線と円は変えない。
// マーカー上の pointerdown で移動・攻撃が起きないようにする処理は main.ts 側（drawHireButtons と同じく currentlyOver で判定）。
export const drawVacationMarker = (
  scene: Phaser.Scene,
  route: Route,
  onToggle: () => void,
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
  container.on('pointerdown', onToggle);
  // コンテナ自体は表示したまま（非表示にすると当たり判定もなくなる）、中身の表示だけ切り替える。
  const setOnVacation = (onVacation: boolean): void => {
    circle.setVisible(onVacation);
    label.setVisible(onVacation);
  };
  setOnVacation(false);
  return { container, setOnVacation };
};

// 主人公（エンジニア）を描く。ローカル原点を中心に PLAYER_SIZE 内へ収める。
export const drawPlayer = (scene: Phaser.Scene): Phaser.GameObjects.Graphics => {
  const g = scene.add.graphics();
  const u = PLAYER_SIZE;
  const headR = u * 0.2;
  const bodyW = u * 0.5;
  const bodyH = u * 0.4;
  // 図形全体（高さ 0.8u）が縦方向の中心に来るよう、上端を -0.4u にする。
  const top = -u * 0.4;
  const bodyTop = top + headR * 2;
  // 胴体
  g.fillStyle(PLAYER_COLORS.body, 1);
  g.fillRect(-bodyW / 2, bodyTop, bodyW, bodyH);
  // 頭と髪
  g.fillStyle(PLAYER_COLORS.skin, 1);
  g.fillCircle(0, top + headR, headR);
  g.fillStyle(PLAYER_COLORS.hair, 1);
  g.fillRect(-headR, top, headR * 2, headR * 0.6);
  // 胴体前のノートPC
  g.fillStyle(PLAYER_COLORS.laptop, 1);
  g.fillRect(-u * 0.25, bodyTop + bodyH * 0.5, u * 0.5, u * 0.2);
  const start = getPlayerStartPosition();
  g.setPosition(start.x, start.y);
  g.setDepth(PLAYER_DEPTH);
  return g;
};

// 仮: リリース地点(0)とプレイヤー(1)の間。
const CODE_DEPTH = 0.5;

// コードを描く。ローカル原点を中心に CODE_SIZE 内へ収め、position に置く。
export const drawCode = (
  scene: Phaser.Scene,
  kind: CodeKind,
  position: Point,
  maliciousType?: MaliciousCodeType,
): Phaser.GameObjects.Graphics => {
  const g = scene.add.graphics();
  const style = CODE_STYLES[kind];
  const s = CODE_SIZE;
  const { shape, pattern } = style;
  g.fillStyle(style.fillColor, 1);
  g.lineStyle(CODE_STROKE_WIDTH, style.strokeColor, 1);
  switch (shape) {
    case 'roundedRect': {
      const r = s * CODE_CORNER_RADIUS_RATIO;
      g.fillRoundedRect(-s / 2, -s / 2, s, s, r);
      g.strokeRoundedRect(-s / 2, -s / 2, s, s, r);
      break;
    }
    case 'star': {
      const points = starPoints(s, CODE_STAR_SPIKES, CODE_STAR_INNER_RATIO);
      g.beginPath();
      points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.closePath();
      g.fillPath();
      g.strokePath();
      break;
    }
    default: {
      const unreachable: never = shape;
      throw new Error(`未対応の形: ${String(unreachable)}`);
    }
  }
  g.fillStyle(style.patternColor, 1);
  switch (pattern) {
    case 'lines': {
      // コードの行を表す短い横線 3 本（長さを変えて行らしくする）。
      const h = s * 0.08;
      const lengths = [0.5, 0.35, 0.45];
      lengths.forEach((ratio, i) => {
        g.fillRect(-s * 0.25, -s * 0.2 + i * s * 0.2, s * ratio, h);
      });
      break;
    }
    case 'exclamation': {
      // 「!」: 縦棒 + 点。
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

// 経過日数の表示（左上）。返した Text の setText で更新する。
export const drawElapsedDays = (scene: Phaser.Scene, days: number): Phaser.GameObjects.Text =>
  scene.add
    .text(ELAPSED_DAYS_POSITION.x, ELAPSED_DAYS_POSITION.y, formatElapsedDays(days), {
      fontSize: ELAPSED_DAYS_STYLE.fontSize,
      fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
      color: ELAPSED_DAYS_STYLE.color,
      stroke: ELAPSED_DAYS_STYLE.strokeColor,
      strokeThickness: ELAPSED_DAYS_STYLE.strokeThickness,
    })
    .setDepth(ELAPSED_DAYS_DEPTH);

export const drawFunds = (scene: Phaser.Scene, funds: number): Phaser.GameObjects.Text =>
  scene.add
    .text(FUNDS_POSITION.x, FUNDS_POSITION.y, formatFunds(funds), {
      fontSize: ELAPSED_DAYS_STYLE.fontSize,
      fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
      color: ELAPSED_DAYS_STYLE.color,
      stroke: ELAPSED_DAYS_STYLE.strokeColor,
      strokeThickness: ELAPSED_DAYS_STYLE.strokeThickness,
    })
    .setDepth(ELAPSED_DAYS_DEPTH);

export const drawCumulativeSales = (scene: Phaser.Scene, score: number): Phaser.GameObjects.Text =>
  scene.add
    .text(CUMULATIVE_SALES_POSITION.x, CUMULATIVE_SALES_POSITION.y, formatCumulativeSales(score), {
      fontSize: ELAPSED_DAYS_STYLE.fontSize,
      fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
      color: ELAPSED_DAYS_STYLE.color,
      stroke: ELAPSED_DAYS_STYLE.strokeColor,
      strokeThickness: ELAPSED_DAYS_STYLE.strokeThickness,
    })
    .setDepth(ELAPSED_DAYS_DEPTH);

// 技術的負債（HUD 4行目）。値が変わったら MainScene が setText() で更新する。
export const drawTechDebt = (scene: Phaser.Scene, debt: number): Phaser.GameObjects.Text =>
  scene.add
    .text(TECH_DEBT_POSITION.x, TECH_DEBT_POSITION.y, formatTechDebt(debt), {
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
    .text(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, TECH_DEBT_OUTAGE_TEXT, {
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

// ランク別の「雇う」ボタン（HUD と同じ深さ）。クリックで onHire(rank) を呼ぶ。
// ボタン上の pointerdown でフィールドの移動・攻撃が起きないようにする処理は main.ts 側（currentlyOver で判定）。
export const drawHireButtons = (
  scene: Phaser.Scene,
  entries: readonly { readonly rank: EngineerRank; readonly cost: number }[],
  onHire: (rank: EngineerRank) => void,
): Phaser.GameObjects.Container[] =>
  entries.map((entry, index) => {
    const { width, height, gap } = HIRE_BUTTON_SIZE;
    const x = HIRE_UI_POSITION.x + index * (width + gap);
    const background = scene.add
      .rectangle(0, 0, width, height, HIRE_BUTTON_COLORS.fill)
      .setOrigin(0)
      .setStrokeStyle(2, HIRE_BUTTON_COLORS.stroke);
    const label = scene.add
      .text(width / 2, height / 2, formatHireButton(index, entry.rank, entry.cost), {
        fontSize: HIRE_BUTTON_FONT_SIZE,
        fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
        color: HIRE_BUTTON_COLORS.text,
      })
      .setOrigin(0.5);
    const button = scene.add
      .container(x, HIRE_UI_POSITION.y, [background, label])
      .setSize(width, height)
      .setDepth(ELAPSED_DAYS_DEPTH);
    // コンテナの表示位置は左上、原点は中心。InputManager は判定時に local 座標へ displayOrigin（幅・高さの半分）を加算するため、
    // 矩形を半分ずらして、表示範囲（左上 0,0〜width,height）と当たり判定を一致させる。
    button.setInteractive(
      new Phaser.Geom.Rectangle(width / 2, height / 2, width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    // stopPropagation はしない。シーンの pointerdown も発行させ、main.ts が currentlyOver で移動・攻撃を止める。
    button.on('pointerdown', () => onHire(entry.rank));
    return button;
  });

// 機能開発とリファクタリングの割合UI(#40)。左から [機能開発へ寄せるボタン][割合の表示][リファクタリングへ寄せるボタン]。
// ボタンは drawHireButtons と同じ構成（Rectangle と Text の Container、当たり判定は半分ずらす、深さは HUD と同じ）。
// 返した割合表示の Text を MainScene が setText() で更新する。
export const drawRefactoringRatioControl = (
  scene: Phaser.Scene,
  initialLabel: string,
  onChange: (direction: RefactoringRatioDirection) => void,
): Phaser.GameObjects.Text => {
  const { width, height, strokeWidth } = REFACTORING_RATIO_BUTTON_SIZE;
  const { x, y } = REFACTORING_RATIO_UI_POSITION;
  const labelX = x + width + REFACTORING_RATIO_UI_GAP;
  const buttons: readonly { readonly direction: RefactoringRatioDirection; readonly x: number }[] = [
    { direction: 'feature', x },
    { direction: 'refactoring', x: labelX + REFACTORING_RATIO_LABEL_WIDTH + REFACTORING_RATIO_UI_GAP },
  ];
  buttons.forEach((entry) => {
    const background = scene.add
      .rectangle(0, 0, width, height, HIRE_BUTTON_COLORS.fill)
      .setOrigin(0)
      .setStrokeStyle(strokeWidth, HIRE_BUTTON_COLORS.stroke);
    const label = scene.add
      .text(width / 2, height / 2, REFACTORING_RATIO_BUTTON_LABELS[entry.direction], {
        fontSize: REFACTORING_RATIO_FONT_SIZE,
        fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
        color: HIRE_BUTTON_COLORS.text,
      })
      .setOrigin(0.5);
    const button = scene.add
      .container(entry.x, y, [background, label])
      .setSize(width, height)
      .setDepth(ELAPSED_DAYS_DEPTH);
    // drawHireButtons と同じく、矩形を半分ずらして表示範囲と当たり判定を一致させる。
    button.setInteractive(
      new Phaser.Geom.Rectangle(width / 2, height / 2, width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    // stopPropagation はしない。シーンの pointerdown も発行させ、main.ts が currentlyOver で移動・攻撃を止める。
    button.on('pointerdown', () => onChange(entry.direction));
  });
  // 割合の表示の領域（x=labelX〜+REFACTORING_RATIO_LABEL_WIDTH、ボタンと同じ高さ）に当たり判定を置く。
  // 表示の上で押し続けても主人公が動かないよう、ボタンと同じく currentlyOver に入れる（main.ts が移動・攻撃を止める）。
  // 文字列の幅は割合で変わるため、Text ではなく領域と同じ大きさの Zone に当たり判定を持たせる。押下時の処理はない。
  scene.add
    .zone(labelX, y, REFACTORING_RATIO_LABEL_WIDTH, height)
    .setOrigin(0)
    .setDepth(ELAPSED_DAYS_DEPTH)
    .setInteractive(
      new Phaser.Geom.Rectangle(0, 0, REFACTORING_RATIO_LABEL_WIDTH, height),
      Phaser.Geom.Rectangle.Contains,
    );
  return scene.add
    .text(labelX + REFACTORING_RATIO_LABEL_WIDTH / 2, y + height / 2, initialLabel, {
      fontSize: REFACTORING_RATIO_FONT_SIZE,
      fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
      color: ELAPSED_DAYS_STYLE.color,
      stroke: ELAPSED_DAYS_STYLE.strokeColor,
      strokeThickness: ELAPSED_DAYS_STYLE.strokeThickness,
    })
    .setOrigin(0.5)
    .setDepth(ELAPSED_DAYS_DEPTH);
};

export const drawEngineerCount = (
  scene: Phaser.Scene,
  count: number,
  max: number,
): Phaser.GameObjects.Text =>
  scene.add
    .text(HIRE_COUNT_POSITION.x, HIRE_COUNT_POSITION.y, formatEngineerCount(count, max), hireTextStyle('20px'))
    .setDepth(ELAPSED_DAYS_DEPTH);

// 雇った結果のメッセージ。一定時間後に消す。置き換えるときは前のものを破棄してから呼ぶ。
export const drawHireMessage = (scene: Phaser.Scene, message: string): Phaser.GameObjects.Text => {
  const text = scene.add
    .text(HIRE_MESSAGE_POSITION.x, HIRE_MESSAGE_POSITION.y, message, hireTextStyle('20px'))
    .setDepth(ELAPSED_DAYS_DEPTH);
  scene.time.delayedCall(HIRE_MESSAGE_DURATION_MS, () => text.destroy());
  return text;
};

// 選択中のエンジニアの情報行(#34)。返した Text の setText(formatSelectedEngineer(...)) で更新する。
export const drawSelectedEngineer = (scene: Phaser.Scene, engineer: Engineer | null): Phaser.GameObjects.Text =>
  scene.add
    .text(
      SELECTED_ENGINEER_POSITION.x,
      SELECTED_ENGINEER_POSITION.y,
      formatSelectedEngineer(engineer),
      hireTextStyle(SELECTED_ENGINEER_FONT_SIZE),
    )
    .setDepth(ELAPSED_DAYS_DEPTH);

// 昇給・減給の操作ボタン(#34)。左から前へ・次へ・昇給・減給（SALARY_BUTTON_ORDER）。前へ・次へは onSelect、昇給・減給は onAdjust を呼ぶ。
// 見た目・当たり判定・深さは drawHireButtons と同じ。stopPropagation はしない（main.ts が currentlyOver で移動・攻撃を止める）。
export const drawSalaryButtons = (
  scene: Phaser.Scene,
  onSelect: (direction: EngineerSelectDirection) => void,
  onAdjust: (direction: SalaryDirection) => void,
): Phaser.GameObjects.Container[] => {
  const keys = { ...SALARY_SELECT_KEYS, ...SALARY_ADJUST_KEYS };
  const press = (action: (typeof SALARY_BUTTON_ORDER)[number]): void => {
    if (action === 'previous' || action === 'next') {
      onSelect(action);
      return;
    }
    onAdjust(action);
  };
  return SALARY_BUTTON_ORDER.map((action, index) => {
    const { width, height, gap } = SALARY_BUTTON_SIZE;
    const x = SALARY_UI_POSITION.x + index * (width + gap);
    const background = scene.add
      .rectangle(0, 0, width, height, HIRE_BUTTON_COLORS.fill)
      .setOrigin(0)
      .setStrokeStyle(2, HIRE_BUTTON_COLORS.stroke);
    const label = scene.add
      .text(width / 2, height / 2, formatSalaryButton(keys[action], SALARY_BUTTON_LABELS[action]), {
        fontSize: SALARY_BUTTON_FONT_SIZE,
        fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
        color: HIRE_BUTTON_COLORS.text,
      })
      .setOrigin(0.5);
    const button = scene.add
      .container(x, SALARY_UI_POSITION.y, [background, label])
      .setSize(width, height)
      .setDepth(ELAPSED_DAYS_DEPTH);
    // drawHireButtons と同じ。表示範囲と当たり判定を一致させるため矩形を半分ずらす。
    button.setInteractive(
      new Phaser.Geom.Rectangle(width / 2, height / 2, width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    button.on('pointerdown', () => press(action));
    return button;
  });
};

// 置いたアイテム（セル内の色付き四角と短い文字）。主人公(1)より下、コード(0.5)と同じ深さ。
const ITEM_DEPTH = 0.4;

// 置いたアイテムの描画。初期配置(#47)で撤去するときに box と mark を destroy() する。
export type PlacedItemDrawing = {
  readonly box: Phaser.GameObjects.Rectangle;
  readonly mark: Phaser.GameObjects.Text;
};

export const drawPlacedItem = (scene: Phaser.Scene, item: PlacedItem): PlacedItemDrawing => {
  const { x, y } = cellCenter(item.cell);
  const size = CELL_SIZE * ITEM_BOX_RATIO;
  const box = scene.add
    .rectangle(x, y, size, size, ITEM_COLORS[item.itemType])
    .setStrokeStyle(2, 0xffffff)
    .setDepth(ITEM_DEPTH);
  const mark = scene.add
    .text(x, y, ITEM_MARKS[item.itemType], {
      fontSize: ITEM_MARK_STYLE.fontSize,
      fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
      color: ITEM_MARK_STYLE.color,
      stroke: ITEM_MARK_STYLE.strokeColor,
      strokeThickness: ITEM_MARK_STYLE.strokeThickness,
    })
    .setOrigin(0.5)
    .setDepth(ITEM_DEPTH);
  return { box, mark };
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

// 仮: 購入ボタンはコード(0.5)より下に描く。下端の行を流れるコードを隠さないため。コードは当たり判定を持たないのでクリックはボタンに届く。
const ITEM_BUTTON_DEPTH = 0.45;

// アイテム購入ボタン（画面下端）。クリックで onBuy(itemType) を呼ぶ。
// ボタン上の pointerdown で移動・攻撃が起きないようにする処理は main.ts 側（currentlyOver で判定）。
export const drawItemButtons = (
  scene: Phaser.Scene,
  itemTypes: readonly ItemType[],
  onBuy: (itemType: ItemType) => void,
): Phaser.GameObjects.Container[] =>
  itemTypes.map((itemType, index) => {
    const { width, height, gap } = ITEM_BUTTON_SIZE;
    const x = ITEM_UI_POSITION.x + index * (width + gap);
    const background = scene.add
      .rectangle(0, 0, width, height, ITEM_BUTTON_COLORS.fill, ITEM_BUTTON_FILL_ALPHA)
      .setOrigin(0)
      .setStrokeStyle(2, ITEM_BUTTON_COLORS.stroke);
    const label = scene.add
      .text(width / 2, height / 2, formatItemButton(index, itemType), {
        fontSize: ITEM_BUTTON_FONT_SIZE,
        fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
        color: ITEM_BUTTON_COLORS.text,
      })
      .setOrigin(0.5);
    const button = scene.add
      .container(x, ITEM_UI_POSITION.y, [background, label])
      .setSize(width, height)
      .setDepth(ITEM_BUTTON_DEPTH);
    // drawHireButtons と同じ。表示範囲と当たり判定を一致させるため矩形を半分ずらす。
    button.setInteractive(
      new Phaser.Geom.Rectangle(width / 2, height / 2, width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    button.on('pointerdown', () => onBuy(itemType));
    return button;
  });

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

// 初期配置(#47)の開始ボタン。クリックで onStart() を呼ぶ。見た目・当たり判定・深さは drawHireButtons と同じ。
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
    .text(width / 2, height / 2, INITIAL_PLACEMENT_TEXT.startButton, {
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
