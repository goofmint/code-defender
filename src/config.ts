// ゲーム設定の仮の値を一か所に集める。後続のゲームバランス用の値もここに追加する。

// 仮: セルサイズ・列数・行数は CodeRabbit 実装計画(#2)の値。企画書には未記載。
export const CELL_SIZE = 60;
export const FIELD_COLS = 16;
export const FIELD_ROWS = 9;

// 仮・要確認: リリース地点のセル位置。右端の列・縦中央の行。企画書には位置の記載なし。
export const RELEASE_POINT_CELL = {
  col: FIELD_COLS - 1,
  row: Math.floor(FIELD_ROWS / 2),
} as const;

// 仮・要確認: エンジニアの出現セル。企画書には「出現場所の数は雇用したエンジニア数と同じ」とだけあり、
// 位置と初期の数（ここでは3か所）は未記載。ルートの本数はこの配列の長さと同じになる。
// これは初期値で、実行時には変更しない。追加分は route.ts の addRoute が返す。
export const ENGINEER_SPAWN_CELLS = [
  { col: 0, row: 1 },
  { col: 0, row: 4 },
  { col: 0, row: 7 },
] as const;

// 仮・要確認: エンジニア追加時に出現場所を置く列。企画書に位置の記載なし。
export const ENGINEER_SPAWN_COL = 0;

// 仮・要確認: 出現場所（＝ルート）の上限数。企画書に上限の記載なし。
// ENGINEER_SPAWN_COL の列に重ならず置ける数（行数）を上限にしている。
export const MAX_ENGINEER_ROUTES = FIELD_ROWS;

// 仮・要確認: ルートが縦方向に曲がる列の範囲（両端を含む）。企画書にはルートの形状の記載なし。
// 出現列（左端）とリリース列（右端）の内側にして、縦区間が他の出現セル・リリースセルを通らないようにする。
export const ROUTE_TURN_COL_MIN = 1;
export const ROUTE_TURN_COL_MAX = FIELD_COLS - 2;
// 仮・要確認: ルート1本あたりの曲がる列の個数の範囲（両端を含む）。
export const ROUTE_TURN_COUNT_MIN = 2;
export const ROUTE_TURN_COUNT_MAX = 4;

// 仮: 主人公のサイズ比率（セルに対する割合）。企画書には未記載。
export const PLAYER_SIZE_RATIO = 0.7;
// 仮: 主人公の初期位置のセル。フィールド中央のセルとする。
export const PLAYER_START_COL = Math.floor(FIELD_COLS / 2);
export const PLAYER_START_ROW = Math.floor(FIELD_ROWS / 2);
// 仮: 主人公の配色（肌・髪・服・ノートPC）。
export const PLAYER_COLORS = {
  skin: 0xf2c9a0,
  hair: 0x3b2a20,
  body: 0x3d7be0,
  laptop: 0xc8d0e0,
} as const;

// 仮: 主人公の移動速度（ピクセル/秒）。240 = 4セル/秒。後続のアイテム効果（速度倍率）の基準値。企画書には数値の記載なし。
export const PLAYER_SPEED = 240;
// 仮: 移動に使うキー。Phaser の KeyCodes のキー名（矢印キー + WASD）。企画書にはキー割り当ての記載なし。
export const PLAYER_MOVE_KEYS = {
  left: ['LEFT', 'A'],
  right: ['RIGHT', 'D'],
  up: ['UP', 'W'],
  down: ['DOWN', 'S'],
} as const;
// 仮: タッチ/マウス操作で、目標との距離がこの値（ピクセル）以内なら止まる（震え防止）。企画書には未記載。
export const PLAYER_POINTER_DEAD_ZONE = 4;

// 仮・要確認: 企画書(3-1)では不正なコードの種類ごとの見た目は未定。以下は正常/不正を見分けるための仮の見た目。
// コードのサイズ比率（セルに対する割合）。主人公(0.7)より小さくする。
export const CODE_SIZE_RATIO = 0.5;
// 仮: 正常コードは水色/白系、不正コードは赤系。既存色（ルート・出現地点・リリース地点・主人公）と重ならない色。
export const CODE_NORMAL_COLORS = {
  fill: 0xe8f6ff,
  stroke: 0x29b6f6,
  pattern: 0x29b6f6,
} as const;
export const CODE_MALICIOUS_COLORS = {
  fill: 0xe53935,
  stroke: 0x7f0000,
  pattern: 0xffffff,
} as const;
// 仮: 不正コード（星形）のトゲの数と、内径/外径の比。
export const CODE_STAR_SPIKES = 8;
export const CODE_STAR_INNER_RATIO = 0.6;
// 仮: 正常コード（角丸四角形）の角丸半径（コードのサイズに対する割合）と枠線の太さ。
export const CODE_CORNER_RADIUS_RATIO = 0.2;
export const CODE_STROKE_WIDTH = 2;

// 仮・要確認: ゲーム開始時のコードの移動速度（ピクセル/秒）。企画書に数値の記載なし。主人公(PLAYER_SPEED)より遅くする。
// 時間とともに速くなる(#14)。経過時間ごとの値は difficulty.ts の codeSpeedAt で求める。
export const CODE_SPEED = 80;
// 仮・要確認: ルートごとのコード生成間隔（ミリ秒）。企画書に数値の記載なし。
export const CODE_SPAWN_INTERVAL_MS = 2000;
// 仮・要確認: ゲーム開始時の不正コードの割合（0〜1）。企画書の「ランク別割合」(#12/#13)が入るまでの開始値。
// 時間とともに増える(#14)。経過時間ごとの値は difficulty.ts の maliciousRateAt で求める。
export const CODE_MALICIOUS_RATE = 0.3;

// 仮・要確認(#14): 企画書は「時間とともにコードの流れが速くなり、不正なコードも増える」とだけで、数値・増え方は未記載。
// 難易度を上げる間隔（ミリ秒）。経過時間をこの間隔で区切り、1段階ごとに速度と不正コード率を上げる。
export const DIFFICULTY_STEP_MS = 30000;
// 仮・要確認(#14): 1段階ごとのコード速度の増加量（ピクセル/秒）。
export const CODE_SPEED_INCREMENT = 8;
// 仮・要確認(#14): コード速度の上限（ピクセル/秒）。主人公(PLAYER_SPEED)より遅くする。
export const CODE_SPEED_MAX = 160;
// 仮・要確認(#14): 1段階ごとの不正コード率の増加量（0〜1）。
export const CODE_MALICIOUS_RATE_INCREMENT = 0.02;
// 仮・要確認(#14): 不正コード率の上限（0〜1）。
export const CODE_MALICIOUS_RATE_MAX = 0.5;

// 仮: 攻撃に使うキー。Phaser の KeyCodes のキー名。企画書には攻撃の操作方法の記載なし。
// 移動キーではないので、移動のキーボード優先判定には含めない。
export const ATTACK_KEYS = ['SPACE'] as const;
// 仮: 攻撃の射程（セルに対する比率）。射程 = CELL_SIZE × 比率（1.0 = 60px）。主人公の中心からコードの中心までの距離で判定する。企画書には未記載。
export const ATTACK_RANGE_RATIO = 1.0;
// 仮: 攻撃のクールダウン（ミリ秒）。企画書には未記載。
export const ATTACK_COOLDOWN_MS = 400;
// 仮: タッチ/マウスで攻撃するときの主人公のタップ判定領域（セルに対する比率）。主人公中心の正方形。
// 主人公(PLAYER_SIZE 42px)のままだと縮小表示時に小さすぎるため、少し大きめにする。企画書には未記載。
export const ATTACK_TAP_SIZE_RATIO = 1.0;
// 仮: 攻撃エフェクトの色（0xRRGGBB）。企画書には未記載。
export const ATTACK_EFFECT_COLOR = 0xffd54f;
// 仮: 攻撃エフェクト（射程の輪）の表示時間（ミリ秒）。命中・空振りで共通。企画書には未記載。
export const ATTACK_EFFECT_DURATION_MS = 200;
// 仮: 命中したコードの点滅時間（ミリ秒）。企画書には未記載。
export const ATTACK_HIT_FLASH_DURATION_MS = 300;

// 企画書(docs/game_plan.md)どおり: 現実の1分 = ゲーム内の1か月。単位はミリ秒。これは仮の値ではない。
export const MS_PER_GAME_MONTH = 60000;
// 仮: 1か月 = 30日。企画書には日数の記載なし。1日 = MS_PER_GAME_MONTH / DAYS_PER_GAME_MONTH = 2000ms になる。
export const DAYS_PER_GAME_MONTH = 30;
// 仮: 経過日数の表示書式。「経過日数: N日」。接頭辞と接尾辞で挟む。企画書には表示書式の記載なし。
export const ELAPSED_DAYS_FORMAT = { prefix: '経過日数: ', suffix: '日' } as const;
// 仮: 経過日数の表示位置。ゲーム画面左上からの余白（ピクセル）。企画書には未記載。
export const ELAPSED_DAYS_POSITION = { x: 12, y: 8 } as const;
// 仮: 経過日数の文字スタイル。フォントサイズ・色・縁取りの色と太さ。フィールド上でも読めるよう縁取りを付ける。
export const ELAPSED_DAYS_STYLE = {
  fontSize: '24px',
  fontFamily: 'sans-serif',
  color: '#ffffff',
  strokeColor: '#000000',
  strokeThickness: 4,
} as const;

// 仮・要確認: 企画書に記載なし。初期資金（円）。
export const INITIAL_FUNDS = 1000000;
// 仮・要確認: 企画書に記載なし。エンジニア1人の月給（円）。全ランク一律。ランク別は #23 以降。
export const ENGINEER_MONTHLY_SALARY = 300000;
// 仮・要確認(#17): 正常なコード1件をリリースしたときの売上（円）。企画書に数値の記載なし。
// 根拠: 1ルートは2秒に1件=ゲーム内1か月(60秒)に30件出る。正常率は70%→50%（#14）なので月21〜15件。
// 20000円なら正常コードを全部通したとき月420000〜300000円で、エンジニア1人の給料(300000円/月)を上回る〜同等になる。
// 10000円だと全部通しても給料に届かず常に赤字になる。
export const REVENUE_PER_NORMAL_CODE = 20000;
// 仮・要確認: 企画書に記載なし。資金の表示書式。「資金: 1,000,000円」。数値部分は3桁区切り。
export const FUNDS_FORMAT = { prefix: '資金: ', suffix: '円' } as const;
// 仮・要確認: 企画書に記載なし。資金の表示位置。経過日数表示のすぐ下。
export const FUNDS_POSITION = { x: 12, y: 40 } as const;

// 仮・要確認: 企画書に記載なし。「資金がなくなったら」を残高ちょうど 0 も倒産とするか。false なら 0 未満のみ倒産。
export const BANKRUPT_INCLUDES_ZERO = true;
// 仮・要確認: 企画書に記載なし。ゲームオーバー画面の文言。案内はタッチ端末でも読める文言にしている。
export const GAME_OVER_TEXT = '倒産しました';
export const GAME_OVER_RESTART_TEXT = 'タップ / クリック / Enter でもう一度';
// 仮・要確認: 企画書に記載なし。ゲームオーバー中のリスタートキー（Phaser の KeyCodes のキー名）。
// Space は攻撃キーと同じだが、ゲームオーバー中は攻撃しないのでリスタートに使う。
export const GAME_OVER_RESTART_KEYS = ['ENTER', 'SPACE'] as const;
// 仮・要確認: 企画書に記載なし。ゲームオーバー直後の誤操作でリスタートしないための待ち時間（ミリ秒）。
export const GAME_OVER_RESTART_DELAY_MS = 1000;
// 仮・要確認: 企画書に記載なし。ゲームオーバー表示の全面オーバーレイ（半透明の黒）。
export const GAME_OVER_OVERLAY = { color: 0x000000, alpha: 0.6 } as const;
// 仮・要確認: 企画書に記載なし。ゲームオーバー表示の文字サイズ（タイトル・案内）。文字の色・縁取りは ELAPSED_DAYS_STYLE と同じ。
export const GAME_OVER_FONT_SIZES = { title: '48px', restart: '24px' } as const;

// 仮・要確認: 企画書(3-1)では不正なコードの種類ごとの見た目・強さ・損害額は未定。以下はすべて仮の値。
// 見た目: 不正コード共通の赤い星形＋「!」に、星の右上へ付ける小円（バッジ）の色と大きさで種類を区別する。
// 正常コードの水色/白と紛らわしくならないよう、水色・白は使わない。脆弱性は重大度が高いほど濃く・大きくする。
// 強さ(hp)・損害額(damage)は整数。脆弱性は重大度が高いほど大きい。
export const MALICIOUS_CODE_BADGE_BORDER_COLOR = 0xffffff;
export const MALICIOUS_CODE_BADGE_BORDER_WIDTH = 1;
export const MALICIOUS_CODE_PARAMS = {
  vulnerabilityCritical: { badgeColor: 0x4a0000, badgeRadiusRatio: 0.26, hp: 5, damage: 50 },
  vulnerabilityMajor: { badgeColor: 0xb71c1c, badgeRadiusRatio: 0.22, hp: 4, damage: 30 },
  vulnerabilityMinor: { badgeColor: 0xff6d00, badgeRadiusRatio: 0.18, hp: 3, damage: 15 },
  vulnerabilityInfo: { badgeColor: 0xffee58, badgeRadiusRatio: 0.14, hp: 2, damage: 5 },
  spaghetti: { badgeColor: 0xab47bc, badgeRadiusRatio: 0.18, hp: 4, damage: 20 },
  bug: { badgeColor: 0x43a047, badgeRadiusRatio: 0.18, hp: 2, damage: 10 },
  duplication: { badgeColor: 0x8d6e63, badgeRadiusRatio: 0.18, hp: 3, damage: 8 },
  lowPerformance: { badgeColor: 0x9e9e9e, badgeRadiusRatio: 0.18, hp: 3, damage: 12 },
  typo: { badgeColor: 0xec407a, badgeRadiusRatio: 0.18, hp: 1, damage: 3 },
} as const;

// 仮: 種類（#10）が未割り当ての不正なコードの hp。種類のランダム割り当ては未決定のため、当面は全員これを使う。企画書には未記載。
export const DEFAULT_MALICIOUS_CODE_HP = 3;
// 仮: 攻撃1回（1ヒット）あたりのダメージ。企画書には未記載。
export const ATTACK_DAMAGE = 1;
// 仮: 撃破エフェクト（コード位置に広がって消える輪）の色（0xRRGGBB）。企画書には未記載。
export const DEFEAT_EFFECT_COLOR = 0x69f0ae;
// 仮: 撃破エフェクトの表示時間（ミリ秒）。企画書には未記載。
export const DEFEAT_EFFECT_DURATION_MS = 300;
// 仮: 撃破エフェクトの輪の開始半径と終了半径（コードの大きさに対する比率）。企画書には未記載。
export const DEFEAT_EFFECT_START_RADIUS_RATIO = 0.4;
export const DEFEAT_EFFECT_END_RADIUS_RATIO = 1.2;
