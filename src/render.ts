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
  GAME_OVER_FONT_SIZES,
  GAME_OVER_OVERLAY,
  GAME_OVER_RESTART_TEXT,
  GAME_OVER_SCORE_FONT_SIZE,
  GAME_OVER_TEXT,
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
} from './config';
import { formatPenalty } from './penalty';
import { formatElapsedDays } from './gameTime';
import { formatFunds } from './funds';
import { formatCumulativeSales, formatScore } from './score';
import { formatEngineerCount, formatHireButton } from './engineer';
import type { EngineerRank } from './engineer';
import { getPlayerStartPosition, PLAYER_COLORS, PLAYER_SIZE } from './player';

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

export const drawRoutes = (scene: Phaser.Scene, routes: readonly Route[]): void => {
  const g = scene.add.graphics();
  g.setDepth(ROUTE_DEPTH);
  for (const route of routes) {
    g.lineStyle(ROUTE_STYLE.width, ROUTE_STYLE.color, ROUTE_STYLE.alpha);
    const points = routePixelPoints(route);
    for (let i = 1; i < points.length; i++) {
      g.lineBetween(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
    }
    const { x, y } = cellCenter(route.spawn);
    scene.add
      .circle(x, y, SPAWN_MARKER_STYLE.radius, SPAWN_MARKER_STYLE.fillColor)
      .setStrokeStyle(SPAWN_MARKER_STYLE.strokeWidth, SPAWN_MARKER_STYLE.strokeColor)
      .setDepth(ROUTE_DEPTH);
  }
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

// 仮: HUD(2)より上。
const GAME_OVER_DEPTH = 3;
// 仮: タイトルの縦位置（タイトル中心を画面中央から上にずらす量）。
const GAME_OVER_TEXT_OFFSET_Y = 30;
// 仮・要確認(#22): スコア行の縦位置（画面中央から下にずらす量）。タイトル(48px)の下端(-6)と案内の上端の間に収める。
const GAME_OVER_SCORE_OFFSET_Y = 14;
// 仮・要確認(#22): 案内の縦位置（画面中央から下にずらす量）。スコア行(24px)の下に置く。
const GAME_OVER_RESTART_OFFSET_Y = 50;

// ゲームオーバー表示（全面の半透明オーバーレイと中央のタイトル・スコア・案内の3行テキスト）。返した Container を destroy すると消える。
export const drawGameOver = (
  scene: Phaser.Scene,
  score: number,
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
  const makeText = (y: number, text: string, fontSize: string): Phaser.GameObjects.Text =>
    scene.add
      .text(centerX, y, text, {
        fontSize,
        fontFamily: ELAPSED_DAYS_STYLE.fontFamily,
        color: ELAPSED_DAYS_STYLE.color,
        stroke: ELAPSED_DAYS_STYLE.strokeColor,
        strokeThickness: ELAPSED_DAYS_STYLE.strokeThickness,
      })
      .setOrigin(0.5);
  const title = makeText(centerY - GAME_OVER_TEXT_OFFSET_Y, GAME_OVER_TEXT, GAME_OVER_FONT_SIZES.title);
  const scoreLine = makeText(
    centerY + GAME_OVER_SCORE_OFFSET_Y,
    formatScore(score),
    GAME_OVER_SCORE_FONT_SIZE,
  );
  const restart = makeText(
    centerY + GAME_OVER_RESTART_OFFSET_Y,
    GAME_OVER_RESTART_TEXT,
    GAME_OVER_FONT_SIZES.restart,
  );
  return scene.add.container(0, 0, [overlay, title, scoreLine, restart]).setDepth(GAME_OVER_DEPTH);
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
