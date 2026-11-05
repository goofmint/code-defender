// ゲーム設定の仮の値を一か所に集める。後続のゲームバランス用の値もここに追加する。

// 仮: セルサイズ・列数・行数は CodeRabbit 実装計画(#2)の値。企画書には未記載。
// CELL_SIZE はルートグリッド（出現セル・折れ点・リリースセル）と射程（ITEM_RANGE_RATIOS × CELL_SIZE）の基準。
// フィールドの大きさは CELL_SIZE × FIELD_COLS/ROWS（960×540）。アイテムの配置は別の 16px グリッド（PLACEMENT_CELL_SIZE #151）で行う。
export const CELL_SIZE = 60;
export const FIELD_COLS = 16;
export const FIELD_ROWS = 9;
// 仮・要確認(#151): アイテムの配置グリッド。「タイルをもっと細かく（16×16）」より、配置の単位を 16px にする（ルートグリッドと世界の大きさは変えない）。
// 列数はフィールド幅から 60、行数はフィールド高さから 34（最終行 y=528〜540 は 12px の端数の行。アイテムがフィールドに収まるかは
// フットプリント（ITEM_BOX_SIZE）で別に判定する）。
export const PLACEMENT_CELL_SIZE = 16;
export const PLACEMENT_COLS = Math.ceil((CELL_SIZE * FIELD_COLS) / PLACEMENT_CELL_SIZE);
export const PLACEMENT_ROWS = Math.ceil((CELL_SIZE * FIELD_ROWS) / PLACEMENT_CELL_SIZE);

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
// 仮(#144): 影・手足（ズボンと靴）・目・ヘッドセット・ノートPCの画面と画面の光を追加。
export const PLAYER_COLORS = {
  skin: 0xf2c9a0,
  hair: 0x3b2a20,
  body: 0x3d7be0,
  laptop: 0xc8d0e0,
  shadow: 0x000000,
  limbs: 0x2b3550,
  eyes: 0x1a1a2e,
  headset: 0x263238,
  screen: 0x7fe7ff,
  screenGlow: 0x7fe7ff,
} as const;
// 仮(#144): 主人公の影と画面の光の不透明度。
export const PLAYER_SHADOW_ALPHA = 0.35;
export const PLAYER_SCREEN_GLOW_ALPHA = 0.3;

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
// 仮(#144): コードの影・ハイライトなどの装飾色。正常コードは水色系（ヘッダー・折れた角・シンタックスハイライト風の行）、
// 不正コードは赤系（外側の淡い光・内側の暗い星）のまま、色と形で見分けられるようにする。
export const CODE_DECOR_COLORS = {
  shadow: 0x000000,
  highlight: 0xffffff,
  normalHeader: 0x29b6f6,
  normalFold: 0xb3e5fc,
  // 先頭は CODE_NORMAL_COLORS.pattern と同じ水色。
  normalSyntax: [CODE_NORMAL_COLORS.pattern, 0x26a69a, 0x7e57c2],
  maliciousGlow: 0xff5252,
  maliciousInner: 0xb71c1c,
} as const;
// 仮(#144): コードの影・ハイライト・不正コードの光の不透明度。
export const CODE_DECOR_ALPHA = {
  shadow: 0.3,
  highlight: 0.45,
  maliciousGlow: 0.3,
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
// 仮・要確認: 担当エンジニアがいないルートの、ゲーム開始時の不正コードの割合（0〜1）。
// 担当エンジニアがいるルートはランク表（ENGINEER_RANKS）の maliciousRate / maliciousRateMax を使う(#12)。
// 時間とともに増える(#14)。経過時間ごとの値は difficulty.ts の maliciousRateAt で求める。
export const CODE_MALICIOUS_RATE = 0.3;

// 仮・要確認(#14): 企画書は「時間とともにコードの流れが速くなり、不正なコードも増える」とだけで、数値・増え方は未記載。
// コード速度を上げる間隔（ミリ秒）。経過時間をこの間隔で区切り、1段階ごとに速度を上げる。
// 仮・要確認(#150): 不正コード率の間隔はこの値を共用せず、MALICIOUS_RATE_STEP_MS（ゲーム内10日）で別に刻む。
export const DIFFICULTY_STEP_MS = 30000;
// 仮・要確認(#14): 1段階ごとのコード速度の増加量（ピクセル/秒）。
export const CODE_SPEED_INCREMENT = 8;
// 仮・要確認(#14): コード速度の上限（ピクセル/秒）。主人公(PLAYER_SPEED)より遅くする。
export const CODE_SPEED_MAX = 160;
// 仮・要確認(#150): 1段階（MALICIOUS_RATE_STEP_MS = ゲーム内10日）ごとの不正コード率の増加量（0〜1）。0.03 で +3 ポイント。
// 担当エンジニアのランク別の割合(#12)でも同じ増加量を使う。#14 の 0.02（30秒ごと）から「10日ごとに3%刻み」(#150) に変更。
export const CODE_MALICIOUS_RATE_INCREMENT = 0.03;
// 仮・要確認(#14): 担当エンジニアがいないルートの不正コード率の上限（0〜1）。
export const CODE_MALICIOUS_RATE_MAX = 0.5;
// 仮・要確認(#13): 補正後の不正コード率の下限（0〜1）。企画書(6)「一定以上の割合を確保する」(docs/game_plan.md) に対応する。
// 休暇・リファクタリング等の補正（difficulty.ts の effectiveMaliciousRate）を加えた後の割合にだけ適用し、
// maliciousRateForRank の基礎率には適用しない。全ランクの maliciousRate と CODE_MALICIOUS_RATE 以下にする。
export const CODE_MALICIOUS_RATE_MIN = 0.05;
// 仮・要確認(#39): 休暇を1回始めるごとに、担当エンジニアの不正コード率を下げる量（0〜1 のパーセントポイントの差分。0.1 で -10 ポイント）。
// 企画書(6)「休暇を与えると不正コード率が下がる」(docs/game_plan.md) に対応する。数値は企画書に記載がなく叩き台。
// 低下量は休暇中・復帰後も維持する。補正後の割合の下限は CODE_MALICIOUS_RATE_MIN で守る（difficulty.ts の effectiveMaliciousRate）。
export const VACATION_MALICIOUS_RATE_REDUCTION = 0.1;
// 仮・要確認(#39): 休暇による低下量の累積の上限（0〜1 のパーセントポイントの差分）。VACATION_MALICIOUS_RATE_REDUCTION 以上 1 以下にする。
export const VACATION_MALICIOUS_RATE_REDUCTION_MAX = 0.2;

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
// ゲーム内1日のミリ秒（gameTime.ts の MS_PER_GAME_DAY と同じ計算。config は gameTime を読み込めないためここで求める）。
const GAME_DAY_MS = MS_PER_GAME_MONTH / DAYS_PER_GAME_MONTH;
// 仮・要確認(#150): 不正コード率を1段階上げる間隔（ゲーム内の日数と、そのミリ秒）。10日 = 20,000ms。
// コード速度の間隔（DIFFICULTY_STEP_MS）とは分け、1段階ごとに CODE_MALICIOUS_RATE_INCREMENT（+3 ポイント）ずつ上げる（difficulty.ts の maliciousRateAt）。
export const MALICIOUS_RATE_STEP_DAYS = 10;
export const MALICIOUS_RATE_STEP_MS = GAME_DAY_MS * MALICIOUS_RATE_STEP_DAYS;
// 仮: 経過日数の表示書式。「経過日数: N日」。接頭辞と接尾辞で挟む。企画書には表示書式の記載なし。
export const ELAPSED_DAYS_FORMAT = { prefix: '経過日数: ', suffix: '日' } as const;
// 仮・要確認(#59追加対応): HUD（経過日数・資金・累計売上）の左端 x。企画書には未記載。
// 出現列（ENGINEER_SPAWN_COL、x=0〜CELL_SIZE）の右隣に余白12pxを置く。出現場所は列0の行0〜8のどこにでも出るため、列0の右に置いて重ならないようにする。
// リリース地点（x=900〜960）よりはるかに左で、最長想定の「累計売上: 9,999,999,999円」(24px×21文字≒504px)でも x≈576 までに収まる。
const HUD_LEFT_X = CELL_SIZE * (ENGINEER_SPAWN_COL + 1) + 12;
// 仮・要確認(#59追加対応): HUD 1行目の上端 y。雇用UI（ボタン y=8〜36、エンジニア数・雇用メッセージ y=42〜約67）の下端より下に置く。
// 3行は ELAPSED_DAYS_STYLE（24px、行高さ約30px）で 32px 間隔。上端 y=80 は雇用UI下端（約67）より下。
const HUD_TOP_Y = 80;
const HUD_ROW_HEIGHT = 32;
// 仮・要確認(#59追加対応): 経過日数の表示位置（HUD 1行目）。
// 重ならない根拠: 出現列 x<60 の右（x=72〜）、雇用UI y≦約67 の下（y=80〜）、リリース地点 x≥900 の左。
export const ELAPSED_DAYS_POSITION = { x: HUD_LEFT_X, y: HUD_TOP_Y } as const;
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
// 仮・要確認(#17): 正常なコード1件をリリースしたときの売上（円）。企画書に数値の記載なし。
// 根拠: 1ルートは2秒に1件=ゲーム内1か月(60秒)に30件出る。正常率は70%→50%（#14）なので月21〜15件。
// 20000円なら正常コードを全部通したとき月420000〜300000円で、ジュニア1人の給料(300000円/月、ENGINEER_MONTHLY_SALARY_BY_RANK)を上回る〜同等になる。
// 10000円だと全部通しても給料に届かず常に赤字になる。ミドル・シニアは月給が上がるぶん、正常率が高い間でないと黒字にならない（仮）。
// 仮・要確認(#42): この値は既定の配分（DEFAULT_REFACTORING_RATIO）のときの単価。実際の売上は機能開発の割合 (1 − r) に比例する
// （getFeatureRevenueMultiplier）。リファクタリング 0%（r=0）で 25000円、100%（r=1）で 0円。
export const REVENUE_PER_NORMAL_CODE = 20000;
// 仮・要確認: 企画書に記載なし。資金の表示書式。「資金: 1,000,000円」。数値部分は3桁区切り。
export const FUNDS_FORMAT = { prefix: '資金: ', suffix: '円' } as const;
// 仮・要確認(#59追加対応): 企画書に記載なし。資金の表示位置（HUD 2行目）。経過日数表示の1行下。
// 重ならない根拠: 出現列 x<60 の右、雇用UI y≦約67 の下、リリース地点 x≥900 の左。
export const FUNDS_POSITION = { x: HUD_LEFT_X, y: HUD_TOP_Y + HUD_ROW_HEIGHT } as const;
// 仮・要確認(#59): 企画書は「スコアは倒産までの累計売上」とだけで、プレイ中の表示書式は未記載。「累計売上: 20,000円」。数値部分は3桁区切り。
export const CUMULATIVE_SALES_FORMAT = { prefix: '累計売上: ', suffix: '円' } as const;
// 仮・要確認(#59追加対応): 累計売上の表示位置（HUD 3行目）。資金表示の1行下。文字スタイルは資金表示と同じ ELAPSED_DAYS_STYLE（24px）。
// 重ならない根拠: 出現列 x<60 の右、雇用UI y≦約67 の下（y=144〜約174）、リリース地点 x≥900 の左。
export const CUMULATIVE_SALES_POSITION = { x: HUD_LEFT_X, y: HUD_TOP_Y + HUD_ROW_HEIGHT * 2 } as const;

// 仮・要確認(#43): 企画書(7)は「機能開発に偏ると技術的負債が溜まる」とだけで、溜まり方・返し方の数値は未定（docs/tasks.md の「技術的負債の具体的な数値」）。以下はすべて仮の値。
// 負債は 0〜TECH_DEBT_MAX の数値。資金や借入ではない（資金には影響しない）。
// 仮・要確認(#43): ゲーム開始時の技術的負債。
export const TECH_DEBT_INITIAL = 0;
// 仮・要確認(#43): 技術的負債の上限。これ以上は溜まらない。
export const TECH_DEBT_MAX = 100;
// 仮・要確認(#43): 正常なコードのリリース1件を作業1単位とする。作業1単位をすべて機能開発に充てたときに溜まる負債。
export const TECH_DEBT_PER_FEATURE_WORK = 10;
// 仮・要確認(#43): 作業1単位をすべてリファクタリングに充てたときに返す負債。
export const TECH_DEBT_REPAY_PER_REFACTORING_WORK = 20;
// 仮・要確認(#43): リファクタリングの割合（0〜1）の初期値。割合はプレイ中に画面左上の割合UI（REFACTORING_RATIO_UI_POSITION、#40）で変えられる。
// 初期値は REFACTORING_RATIO_STEP_PERCENT の刻み（10%）の上に置く（UI の段階変更で同じ値に戻れるようにする）。
// 0.2 なら作業1単位で 0.8×10 溜まり 0.2×20 返すので、正味 +4。リファクタリング 1/3 で増減 0 になる。
// 売上の基準配分でもある（#42）。この割合のとき正常コード1件の売上は REVENUE_PER_NORMAL_CODE ちょうど（倍率 1）。
export const DEFAULT_REFACTORING_RATIO = 0.2;
// 仮・要確認(#45): 技術的負債が TECH_DEBT_MAX のときに不正コード率へ加える量（0〜1 のパーセントポイントの差分。0.2 で +20 ポイント）。
// 倍率ではなく割合への加算差分。負債 0 で 0、TECH_DEBT_MAX でこの値になるよう負債に比例させる（techDebt.ts の techDebtMaliciousRateModifier）。
// 企画書(7)「技術的負債が増えると、不具合率（不正コード率）が徐々に増えていく」(docs/game_plan.md) に対応する。関数形（線形）と数値は企画書に記載がなく叩き台。
// 補正後の割合は [CODE_MALICIOUS_RATE_MIN, 1] に収める（difficulty.ts の effectiveMaliciousRate）。
export const TECH_DEBT_MALICIOUS_RATE_MAX_BONUS = 0.2;
// 仮・要確認(#41): リファクタリングの割合 1（すべてリファクタリング）のときに不正コード率を下げる最大量
// （0〜1 のパーセントポイントの差分。0.2 で -20 ポイント）。割合 r のときの差分は −r × この値（techDebt.ts の refactoringMaliciousRateModifier）。
// 企画書(7)「リファクタリングを強化するとプロダクトの品質は良くなる」(docs/game_plan.md) に対応する。数値は企画書に記載がなく叩き台。0 以上 1 以下にする。
// 補正後の割合の下限 CODE_MALICIOUS_RATE_MIN は difficulty.ts の effectiveMaliciousRate で適用する。
export const REFACTORING_MALICIOUS_RATE_REDUCTION_MAX = 0.2;
// 仮・要確認(#44): 企画書(7)は「技術的負債が増えると、開発スピードが低下する」とだけで、下がり方は未定。
// 開発スピードはコードの生成頻度と解釈し、生成間隔（CODE_SPAWN_INTERVAL_MS）に倍率を掛けて延ばす。コードの移動速度には掛けない。
// 倍率は負債に比例し、負債0で1（既存の挙動と同じ）、負債が上限（TECH_DEBT_MAX）でこの値。2 なら上限で生成間隔が2倍（2000ms→4000ms）。
// 仮・要確認(#150): 「25日過ぎると一気に生産性が落ちる」ため 2→1 にし、負債で生産量（コード＋バグの総生成数）を落とさないようにする。
// 1 なら負債がいくつでも生成間隔は基準のまま（techDebt.ts の techDebtSpawnIntervalMs）。倍率 1 で無効になるのは生成間隔の延長だけで、
// 負債による不正コード率の増加(#45)と、閾値超えの放置による大障害(#46、main.ts の updateTechDebtNeglect)はそのまま残る。
export const TECH_DEBT_SPAWN_INTERVAL_MAX_MULTIPLIER = 1;
// 仮・要確認(#43): 技術的負債の表示書式。「技術的負債: 40」。数値は四捨五入した整数。
export const TECH_DEBT_FORMAT = { prefix: '技術的負債: ', suffix: '' } as const;
// 仮・要確認(#43): 技術的負債の表示位置（HUD 4行目）。累計売上の1行下（y=176〜約206）。文字スタイルは ELAPSED_DAYS_STYLE（24px）。
// 重ならない根拠: 出現列 x<60 の右、雇用UI y≦約67 の下、リリース地点 x≥900 の左。
export const TECH_DEBT_POSITION = { x: HUD_LEFT_X, y: HUD_TOP_Y + HUD_ROW_HEIGHT * 3 } as const;

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
// 仮・要確認(#60): 企画書に記載なし。ゲームオーバー画面の各行の文字サイズ(px)と、画面中央から行の中心までの縦のずれ(px、下が正)。
// 並びはタイトル→スコア→経過日数→案内。スコアを主役にするため文字を大きくする（最長の MAX_SAFE_INTEGER でも画面幅に収まる大きさ）。
// 行の高さは文字サイズの約1.25倍。隣り合う行が重ならないよう間隔をあけている。文字の色・縁取りは ELAPSED_DAYS_STYLE と同じ。
export const GAME_OVER_LAYOUT = {
  title: { fontSize: 48, offsetY: -80 },
  score: { fontSize: 32, offsetY: -20 },
  elapsedDays: { fontSize: 24, offsetY: 30 },
  restart: { fontSize: 24, offsetY: 80 },
} as const;

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

// 仮・要確認(#56): 通常生成の不正なコードには、上の9種類から一様抽選で種類を割り当てる（maliciousCode.ts の pickMaliciousType）。
// 種類ごとの出現割合と導入順（ゲーム序盤から全種類を出すか）は企画書で未決定。決まったら抽選を差し替える。
// 仮: 種類（#10）が未割り当ての不正なコードの hp。通常生成では種類を割り当てるため、種類なしで生成したときだけ使う。企画書には未記載。
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

// 仮・要確認(#22): 企画書は「スコアは倒産までの累計売上」とだけで、表示の書式・位置は未記載。
// ゲームオーバー画面のスコア表示書式。「スコア: 20,000円」。数値部分は3桁区切り。
export const SCORE_FORMAT = { prefix: 'スコア: ', suffix: '円' } as const;

// 仮・要確認: 企画書には「正常なコードを攻撃すると減点」としかない。スコアは累計売上で減らさない方針のため、減点は資金から引く。
export const NORMAL_CODE_PENALTY_TARGET = 'funds' as const;
// 仮・要確認: 正常なコードを1回攻撃したときの減点額（円）。企画書には未記載。
export const NORMAL_CODE_PENALTY = 50000;
// 仮・要確認: 正常なコードは攻撃されても消えず、そのまま流れる。
export const NORMAL_CODE_REMOVED_ON_HIT = false;
// 仮: 減点表示（コード位置に浮かんで消える赤い文字）。色・表示時間（ミリ秒）・上への移動量（ピクセル）・文字サイズ。
export const PENALTY_TEXT_COLOR = '#ff1744';
export const PENALTY_TEXT_DURATION_MS = 800;
export const PENALTY_TEXT_RISE_PX = 40;
export const PENALTY_TEXT_FONT_SIZE = '20px';

// 仮・要確認(#158): 文字列の幅の見積もり（textMetrics.ts の estimateTextWidth）。全角文字は 1 文字 = フォント px、
// 半角文字（英数字など）はフォント px にこの比率を掛けた幅とする。sans-serif の英字の平均幅（約 0.5〜0.55 倍）より少し広く見積もり、はみ出しを防ぐ。
export const HALF_WIDTH_CHAR_RATIO = 0.6;


// 仮・要確認(#23): 企画書(6)は「ジュニア・ミドル・シニアの3ランクから雇える」とだけで、費用・人数・上限・操作は未記載。以下はすべて仮の値。
// ランク表。表示名のほか、不正コード率(#12/#24)・性格(#26)の列を後から足せる。順序は画面のボタン順と同じ。
// 仮・要確認(#12): maliciousRate は担当ルートの開始時の不正コード率、maliciousRateMax は時間が経った後の上限（どちらも 0〜1）。
// 企画書(6)「不正なコードの割合」の叩き台（ジュニア 40%→60%・ミドル 25%→45%・シニア 10%→25%）。
// 数値は docs/tasks.md の「各ランクの不正コード率（開始時・上限）を確定する」で調整する。
// 増え方（増加量・間隔）は CODE_MALICIOUS_RATE_INCREMENT / MALICIOUS_RATE_STEP_MS(#150) を共用する。
export const ENGINEER_RANKS = [
  { id: 'junior', label: 'ジュニア', maliciousRate: 0.4, maliciousRateMax: 0.6 },
  { id: 'middle', label: 'ミドル', maliciousRate: 0.25, maliciousRateMax: 0.45 },
  { id: 'senior', label: 'シニア', maliciousRate: 0.1, maliciousRateMax: 0.25 },
] as const;
// 仮・要確認(#25): 企画書(6)は「ランクによって、一定期間ごとの支払い（給料）が変わる」とだけで金額は未記載。以下はすべて仮の値。
// ランク別の月給の初期額（円）(#33)。雇ったとき・初期編成のときに、この額がエンジニア個人の月給（Engineer.salary）になる。
// ゲーム内1か月（60秒）ごとに、雇っている全員の月給（Engineer.salary）の合計を引く。
// ジュニアは従来の月給300000円を維持（REVENUE_PER_NORMAL_CODE の釣り合いの根拠と同じ）。
// ミドル400000円・シニア500000円は CodeRabbit の計画どおりの仮値（ジュニア＋100000円ずつ）。
// 雇用費(ENGINEER_HIRE_COST: 100000/200000/300000円、雇うときの一時費用)と同じ順序で高くなる。
// 雇ったあとはプレイヤーが昇給・減給(#34、engineer.ts の adjustEngineerSalary)で個人の月給を変えられる。
export const ENGINEER_MONTHLY_SALARY_BY_RANK: Readonly<Record<(typeof ENGINEER_RANKS)[number]['id'], number>> = {
  junior: 300000,
  middle: 400000,
  senior: 500000,
};
// 仮・要確認(#34): 企画書(6)は「プレイヤーはいつでも昇給・減給できる」とだけで、刻み・上限・下限は未記載。以下はすべて仮の値。
// 1回の昇給・減給で変わる額（円）。全ランクの初期額との差が、この額の倍数になるようにする（初期額から刻みどおりに上下できる）。
export const ENGINEER_SALARY_STEP = 50000;
// 月給の下限・上限（円、両端を含む）。昇給・減給の結果はこの範囲に収める。全ランクの初期額はこの範囲に入る。
// パラメータ（ENGINEER_PARAMETER_MIN〜MAX の 0〜100）とは別の範囲。
export const ENGINEER_SALARY_MIN = 100000;
export const ENGINEER_SALARY_MAX = 1000000;
// 仮・要確認(#31): 給料が愛着心に与える影響。企画書(6)は「昇給は飽和曲線（例: 1 - e^(-k × 昇給額)）、減給は大きめの係数をかけた直線」とだけで、係数は未記載。以下はすべて仮の値。
// 差額 = 現在の月給（Engineer.salary）− 初期額（Engineer.initialSalary）。ゲーム内1か月ごとに、差額に応じた量を愛着心（0〜100）に足す。
// 昇給時の1か月あたりの愛着心の最大増加量。差額が大きくなるほどこの値に近づくが、超えない。
export const SALARY_ATTACHMENT_RAISE_MAX_GAIN = 5;
// 昇給時の飽和係数 k（1円あたり）。増加量 = 最大増加量 × (1 − e^(−k × 差額))。1/100000 なら +100000円で約 3.16、+200000円で約 4.32。
export const SALARY_ATTACHMENT_RAISE_SATURATION_PER_YEN = 1 / 100000;
// 減給時の係数（1円あたり）。減少量 = 係数 × |差額|。10/100000 なら −50000円で 5、−100000円で 10 下がる。
// 同じ差額なら、減給の減少量が昇給の増加量より大きくなるようにする（最大増加量 × k ≦ この係数なら、どの差額でも成り立つ）。
export const SALARY_ATTACHMENT_CUT_PER_YEN = 10 / 100000;
// 仮・要確認(#28): 企画書(8)はパラメータ（疲労度・集中力・技術力・愛着心）の効果だけで、範囲・初期値・刻みは未記載。以下はすべて仮の値。
// パラメータの範囲（両端を含む）。
export const ENGINEER_PARAMETER_MIN = 0;
export const ENGINEER_PARAMETER_MAX = 100;
// 仮・要確認(#28): 値が NaN で、呼び出し側の現在値（fallback）も不正なときに使う既定値。範囲の中央。
export const ENGINEER_PARAMETER_FALLBACK = 50;
// 仮・要確認(#28): ランク別の初期値。疲労度は 0（雇った直後は疲れていない）、他は中央値。
// 企画書では技術力は「ランクとは別の個人差」なので、ランクでは変えない（仮）。変えたくなったらこの表の値を変えるだけでよい。
// 性格(#26/#29)による差もここには入れない（性格の補正は ENGINEER_PERSONALITY_TENDENCIES / ENGINEER_TENDENCY_OFFSETS で後から足す）。
export const ENGINEER_INITIAL_PARAMETERS: Readonly<
  Record<
    (typeof ENGINEER_RANKS)[number]['id'],
    {
      readonly fatigue: number;
      readonly concentration: number;
      readonly skill: number;
      readonly attachment: number;
    }
  >
> = {
  junior: { fatigue: 0, concentration: 50, skill: 50, attachment: 50 },
  middle: { fatigue: 0, concentration: 50, skill: 50, attachment: 50 },
  senior: { fatigue: 0, concentration: 50, skill: 50, attachment: 50 },
};
// 仮・要確認(#26): 企画書(6)の性格8種。順序は企画書の表どおり。雇ったときにランダムで1つ付く。
// 性格ごとのパラメータの傾向は、この表とは別に ENGINEER_PERSONALITY_TENDENCIES に持つ(#29)。
// 性格は画面には出さない（仮）。#59 の表示と衝突するため。
export const ENGINEER_PERSONALITIES = [
  { id: 'meticulous', label: '几帳面' },
  { id: 'passive', label: '消極的' },
  { id: 'careless', label: '適当' },
  { id: 'slacker', label: 'サボりがち' },
  { id: 'earnest', label: '真面目' },
  { id: 'calm', label: '冷静沈着' },
  { id: 'cheerful', label: '陽気' },
  { id: 'gloomy', label: '根暗' },
] as const;
// 仮・要確認(#26): 性格を選ぶ重み。企画書に偏りの記載はないので全部 1（均等）。Record なので過不足は型エラーになる。
export const ENGINEER_PERSONALITY_WEIGHTS: Readonly<
  Record<(typeof ENGINEER_PERSONALITIES)[number]['id'], number>
> = {
  meticulous: 1,
  passive: 1,
  careless: 1,
  slacker: 1,
  earnest: 1,
  calm: 1,
  cheerful: 1,
  gloomy: 1,
};
// 傾向の3段階（企画書(6)の「高い・普通・低い」）。
export type EngineerTendency = 'high' | 'normal' | 'low';
// 企画書(6)「性格」の表を写したもの（確定。値は企画書どおり）。
// fatigue は「疲労の溜まりやすさ」＝疲労度の初期値ではなく溜まる速さ。→ ENGINEER_FATIGUE_RATE_MULTIPLIERS の係数として使う。
// concentration / skill / attachment は初期値の補正。→ ENGINEER_TENDENCY_OFFSETS を足す。
// 表にない項目（疲労度の初期値、集中力・技術力・愛着心の変化の速さ）は「普通」＝補正なし。
// Record なので、性格の過不足は型エラーになる。
export const ENGINEER_PERSONALITY_TENDENCIES: Readonly<
  Record<
    (typeof ENGINEER_PERSONALITIES)[number]['id'],
    {
      readonly fatigue: EngineerTendency;
      readonly concentration: EngineerTendency;
      readonly skill: EngineerTendency;
      readonly attachment: EngineerTendency;
    }
  >
> = {
  meticulous: { fatigue: 'normal', concentration: 'normal', skill: 'high', attachment: 'normal' },
  passive: { fatigue: 'normal', concentration: 'low', skill: 'normal', attachment: 'normal' },
  careless: { fatigue: 'low', concentration: 'high', skill: 'low', attachment: 'normal' },
  slacker: { fatigue: 'low', concentration: 'low', skill: 'normal', attachment: 'low' },
  earnest: { fatigue: 'high', concentration: 'high', skill: 'normal', attachment: 'high' },
  calm: { fatigue: 'low', concentration: 'normal', skill: 'high', attachment: 'normal' },
  cheerful: { fatigue: 'low', concentration: 'normal', skill: 'normal', attachment: 'high' },
  gloomy: { fatigue: 'high', concentration: 'high', skill: 'high', attachment: 'low' },
};
// 仮・要確認(#29): 傾向ごとの初期値への加算補正。企画書は3段階だけで具体的な数値は試作で調整するとしている。
export const ENGINEER_TENDENCY_OFFSETS: Readonly<Record<EngineerTendency, number>> = {
  high: 20,
  normal: 0,
  low: -20,
};
// 仮・要確認(#29): 傾向ごとの「疲労が溜まる量」に掛ける係数（疲労の溜まりやすさ）。
export const ENGINEER_FATIGUE_RATE_MULTIPLIERS: Readonly<Record<EngineerTendency, number>> = {
  high: 1.5,
  normal: 1,
  low: 0.5,
};
// 仮・要確認(#30): 愛着心の時間変化。企画書(6)は「休暇で愛着心が上がり、疲労度が高いまま働かせると下がる」とだけで、数値の記載はない。
// highFatigueThreshold: 疲労度がこの値以上（境界を含む）で配属中かつ休暇中でないと愛着心が下がる。
// *PerGameDay: ゲーム内1日（MS_PER_GAME_DAY = 2000ms）あたりの愛着心の変化量。経過ミリ秒に比例して連続的に変える（フレームの分け方に依存しない）。
export const ENGINEER_ATTACHMENT_CHANGE: {
  readonly highFatigueThreshold: number;
  readonly vacationAttachmentGainPerGameDay: number;
  readonly highFatigueAttachmentLossPerGameDay: number;
} = {
  highFatigueThreshold: 70,
  vacationAttachmentGainPerGameDay: 1,
  highFatigueAttachmentLossPerGameDay: 1,
};
// 仮・要確認(#23): 雇う費用（円）。1回払いで資金から引く。月給とは別。
export const ENGINEER_HIRE_COST = { junior: 100000, middle: 200000, senior: 300000 } as const;
// 仮・要確認(#23): 最初のエンジニアのランク。ENGINEER_SPAWN_CELLS と同じ数・順序（初期ルートと1対1）。
export const INITIAL_ENGINEER_RANKS = ['junior', 'junior', 'junior'] as const;
// 仮・要確認(#23): エンジニアの上限人数。#27 で1人1ルートになるため、ルートの上限と揃える。
export const MAX_ENGINEERS = MAX_ENGINEER_ROUTES;
// 仮・要確認(#23): 雇うキー（ENGINEER_RANKS の順に対応）。移動・攻撃・リスタートのキーと重ならない。Phaser の KeyCodes のキー名。
export const HIRE_KEYS = ['ONE', 'TWO', 'THREE'] as const;
// 仮・要確認(#23): 雇う画面の配置。上端の行（出現セル列0・リリース地点と重ならない）。経過日数・資金表示の右。
export const HIRE_UI_POSITION = { x: 300, y: 8 } as const;
export const HIRE_BUTTON_SIZE = { width: 170, height: 28, gap: 10 } as const;
export const HIRE_BUTTON_COLORS = { fill: 0x1e2a4a, stroke: 0x6c8cff, text: '#ffffff' } as const;
export const HIRE_BUTTON_FONT_SIZE = '16px';
// 仮・要確認(#23): 人数表示とメッセージの位置（ボタンの下）、メッセージの表示時間（ミリ秒）。
export const HIRE_COUNT_POSITION = { x: 300, y: 42 } as const;
export const HIRE_MESSAGE_POSITION = { x: 480, y: 42 } as const;
export const HIRE_MESSAGE_DURATION_MS = 2000;
// 仮・要確認(#40): 企画書(7)は「プレイヤーが機能開発とリファクタリングの割合を指定できる」とだけで、操作方法・刻み・表示は未記載。以下はすべて仮の値。
// 割合UIの1回の操作で変えるリファクタリングの割合（パーセント、整数）。100 を割り切れる値にする（0% と 100% に止まれるように）。
export const REFACTORING_RATIO_STEP_PERCENT = 10;
// 仮・要確認(#40): 割合を変えるキー（Phaser の KeyCodes のキー名）。feature は機能開発へ寄せる、refactoring はリファクタリングへ寄せる。
// 移動(矢印/WASD)・攻撃(SPACE)・リスタート(ENTER/SPACE)・雇う(1〜3)・アイテム購入(4〜9)・昇給減給（#34 の Q/E/R/F）と重ならない。
export const REFACTORING_RATIO_KEYS = { feature: 'Z', refactoring: 'X' } as const;
// 仮・要確認(#40): 割合UIのボタンの文字。左（機能開発へ寄せる）は左向き、右（リファクタリングへ寄せる）は右向きの矢印とキー名。
export const REFACTORING_RATIO_BUTTON_LABELS = {
  feature: `◀${REFACTORING_RATIO_KEYS.feature}`,
  refactoring: `${REFACTORING_RATIO_KEYS.refactoring}▶`,
} as const;
// 仮・要確認(#40): 割合の表示書式。「機能80:リファ20」。両方の割合（整数パーセント、合計100）を出す。
export const REFACTORING_ALLOCATION_FORMAT = { feature: '機能', separator: ':', refactoring: 'リファ' } as const;
// 仮・要確認(#40): 割合UIの配置。上端の行（行0）で、HUD と同じ左端（出現列 x<60 の右、x=72）、雇うボタンと同じ上端（y=8）。
// 左から [機能開発へ寄せるボタン][割合の表示][リファクタリングへ寄せるボタン] の順に横に並べる。
export const REFACTORING_RATIO_UI_POSITION = { x: HUD_LEFT_X, y: HIRE_UI_POSITION.y } as const;
// 仮・要確認(#40): ボタンの幅・高さ・枠線の太さ、割合表示の幅、要素間の間隔（ピクセル）。高さは雇うボタンと同じ。
// 全体の幅は 32+4+140+4+32 = 212 で x=72〜284。割合表示の幅は最長の「機能100:リファ0」（10文字×14px=140）が収まる幅。
export const REFACTORING_RATIO_BUTTON_SIZE = { width: 32, height: HIRE_BUTTON_SIZE.height, strokeWidth: 2 } as const;
export const REFACTORING_RATIO_LABEL_WIDTH = 140;
export const REFACTORING_RATIO_UI_GAP = 4;
export const REFACTORING_RATIO_FONT_SIZE = '14px';
// 仮・要確認(#40): 割合UI全体（枠線を含む）の右端と、雇うボタン（枠線を含む）の左端との最小の間隔（ピクセル）。
export const REFACTORING_RATIO_UI_HIRE_MIN_GAP = 8;
// 仮・要確認(#34): 昇給・減給の操作。企画書には操作方法の記載なし。「選択中のエンジニア」の情報行と、前へ・次へ・昇給・減給の4つのボタン・キーで操作する。
// キーは移動(矢印/WASD)・攻撃(SPACE)・雇う(1〜3)・アイテム購入(4〜9)・リスタート(ENTER/SPACE)と重ならない。Phaser の KeyCodes のキー名。
export const SALARY_SELECT_KEYS = { previous: 'Q', next: 'E' } as const;
export const SALARY_ADJUST_KEYS = { raise: 'R', cut: 'F' } as const;
// 仮・要確認(#34): ボタンの並び順（左から）とラベル。ラベルの前にキー名を「[Q] 前へ」の形で付ける。
export const SALARY_BUTTON_ORDER = ['previous', 'next', 'raise', 'cut'] as const;
export const SALARY_BUTTON_LABELS = { previous: '前へ', next: '次へ', raise: '昇給', cut: '減給' } as const;
// 仮・要確認(#34): 選択中のエンジニアの情報行（HUD 4行目=技術的負債の1行下、左端は HUD と同じ）と文字サイズ。
// 重ならない根拠: HUD 4行目（技術的負債）は y=176〜約206、情報行は y=208〜約233。出現列 x<60 の右、リリース地点 x≥900 の左。
export const SELECTED_ENGINEER_POSITION = { x: HUD_LEFT_X, y: HUD_TOP_Y + HUD_ROW_HEIGHT * 4 } as const;
export const SELECTED_ENGINEER_FONT_SIZE = '20px';
// 仮・要確認(#34): 前へ・次へ・昇給・減給ボタンの配置（情報行の下、y=238〜266、x=72〜416）。色は雇うボタン(HIRE_BUTTON_COLORS)と同じ。
// 情報行（20px、行高さ約25px）の上端からボタン上端までの間隔。
const SELECTED_ENGINEER_ROW_HEIGHT = 30;
export const SALARY_UI_POSITION = {
  x: SELECTED_ENGINEER_POSITION.x,
  y: SELECTED_ENGINEER_POSITION.y + SELECTED_ENGINEER_ROW_HEIGHT,
} as const;
export const SALARY_BUTTON_SIZE = { width: 80, height: 28, gap: 8 } as const;
export const SALARY_BUTTON_FONT_SIZE = '14px';
// 仮・要確認(#53): AIコーディングエージェント（強い・普通・安い）。企画書(8)は「エンジニアに付けて出力ペースを上げる」「普通は強いより、安いは最も不正なコードを混ぜやすい」
// 「価格は高い・普通・安い」「月額」とだけで、具体的な数値・操作は未記載。以下はすべて仮の値。
// 価格の段階（ITEM_PRICE_TIERS のキー）。強い=高い、普通=普通、安い=安い（企画書 8 の価格列）。月額は ITEM_MONTHLY_FEE_RATIO を掛けた額（aiAgent.ts）。
export const AI_AGENT_PRICE_TIER_BY_TYPE = { strong: 'expensive', normal: 'normal', cheap: 'cheap' } as const;
// 仮・要確認(#53): 装着中のエンジニアが担当するルートのコード生成間隔に掛ける倍率。0.5 なら間隔が半分（出力ペース2倍）。
// 企画書は3種とも「出力ペースを上げる」とだけで差の記載がないため、全種同じ値にする。0 以下・有限でない値は 1（効果なし）として扱う。
export const AI_AGENT_SPAWN_INTERVAL_MULTIPLIER_BY_TYPE = { strong: 0.5, normal: 0.5, cheap: 0.5 } as const;
// 仮・要確認(#53): 装着中のエンジニアの不正コード率に加える差分（0〜1 のパーセントポイント。0.05 で +5 ポイント）。
// 強い=0（増えない）、普通=+5、安い=+10 ポイント（「強いより混ぜやすい」「最も混ぜやすい」の順）。[CODE_MALICIOUS_RATE_MIN, 1] への制限は effectiveMaliciousRate に任せる。
export const AI_AGENT_MALICIOUS_RATE_MODIFIER_BY_TYPE = { strong: 0, normal: 0.05, cheap: 0.1 } as const;
// 仮・要確認(#53): 倍率を掛けた後のコード生成間隔の下限（ミリ秒）。倍率の調整で生成が速くなりすぎないようにする。
export const CODE_SPAWN_INTERVAL_MIN_MS = 500;
// 仮・要確認(#53): ボタン・メッセージ・選択中のエンジニアの情報行に使う短い名前。
export const AI_AGENT_SHORT_NAMES = { strong: '強い', normal: '普通', cheap: '安い' } as const;
// 仮・要確認(#53): 選択中のエンジニアの情報行で、AIエージェントを付けていないときの表示。
export const AI_AGENT_NONE_LABEL = 'なし';
// 仮・要確認(#53): AIエージェントを選択中のエンジニアに付けるキー（strong / normal / cheap）。Phaser の KeyCodes のキー名。
// 移動(矢印/WASD)・攻撃(SPACE)・リスタート(ENTER/SPACE)・雇う(1〜3)・アイテム購入(4〜9)・昇給減給(Q/E/R/F)・割合UI(Z/X)と重ならない。
export const AI_AGENT_BUY_KEYS = { strong: 'V', normal: 'B', cheap: 'N' } as const;
// 仮・要確認(#53): AIエージェントのボタンの並び順（左から）。
export const AI_AGENT_BUTTON_ORDER = ['strong', 'normal', 'cheap'] as const;
// 仮・要確認(#53): AIエージェントのボタンの配置。昇給・減給ボタン（y=238〜266）の下に間隔 4px をあけて並べる（y=270〜298、x=72〜416）。
// 右端は昇給・減給ボタンと同じ 416 で、アイテムを置けない HUD の矩形（ITEM_HUD_BOUNDS #151）の右端になる（下端は休暇の案内文 #150）。色は雇うボタン(HIRE_BUTTON_COLORS)と同じ。
const AI_AGENT_UI_GAP_Y = 4;
export const AI_AGENT_UI_POSITION = {
  x: SALARY_UI_POSITION.x,
  y: SALARY_UI_POSITION.y + SALARY_BUTTON_SIZE.height + AI_AGENT_UI_GAP_Y,
} as const;
export const AI_AGENT_BUTTON_SIZE = { width: 112, height: 28, gap: 4 } as const;
export const AI_AGENT_BUTTON_FONT_SIZE = '12px';
// 仮・要確認(#150): 休暇の操作方法と効果の案内文（HUD に常時表示。setup 中・プレイ中とも表示し、入力は受け付けない）。
// 「休憩する機能が見当たらない」(#150) への対応で、既存の休暇(#35/#39)の操作を案内する。休暇のロジックは変えない。
// 3 行で、数値は config から作る（engineer.ts の formatVacationHint）: 1回あたりの低下量 VACATION_MALICIOUS_RATE_REDUCTION、
// 累積の上限 VACATION_MALICIOUS_RATE_REDUCTION_MAX、補正後の下限 CODE_MALICIOUS_RATE_MIN（いずれもパーセントポイント・四捨五入した整数）。
//   出現地点の「休」で休暇/復帰（プレイ開始後）
//   不正率-10pt/回・最大-20pt・下限5%
//   効果は復帰後も維持。休暇中は生産停止・給与継続
// 休暇の切り替えは setup 中は受け付けない（toggleVacation）ので「プレイ開始後」を添える。低下量は復帰後も維持し(#39)、休暇中は生成・移動が止まり(#36)、給料は引かれる(#37)。
// 各行は HUD の矩形の幅（ITEM_HUD_BOUNDS、x=72〜416）に収める。全角 1 文字 = 14px で見積もって 24 文字以内（hudLayout.test.ts で検証）。
export const VACATION_HINT_FORMAT = {
  operation: '出現地点の「休」で休暇/復帰（プレイ開始後）',
  ratePrefix: '不正率-',
  perVacationSuffix: 'pt/回・最大-',
  capSuffix: 'pt・下限',
  floorSuffix: '%',
  persistence: '効果は復帰後も維持。休暇中は生産停止・給与継続',
} as const;
export const VACATION_HINT_LINES = 3;
// 仮・要確認(#150): 案内文の配置。AIエージェントのボタン（y=270〜298）の下に間隔 4px をあける（y=302〜362、x=72〜）。
// 置けない HUD の矩形（ITEM_HUD_BOUNDS）の中に入れ、案内文の下端が矩形の下端になる（文字の下にアイテムを置けないようにする）。
// 重ならない根拠: 出現列 x<60 の右、昇給減給・AIエージェントのボタン y≦298 の下、購入バー y≧506 の上、初期配置UI（x≧668・y≦228）の左下、リリース地点（x≧900）の左。
const VACATION_HINT_GAP_Y = 4;
export const VACATION_HINT_POSITION = {
  x: AI_AGENT_UI_POSITION.x,
  y: AI_AGENT_UI_POSITION.y + AI_AGENT_BUTTON_SIZE.height + VACATION_HINT_GAP_Y,
} as const;
export const VACATION_HINT_FONT_SIZE = '14px';
// 仮・要確認(#150): 行の間隔（ピクセル。Phaser Text の lineSpacing）と 1 行の高さ。初期配置UI（INITIAL_PLACEMENT_LINE_HEIGHT）と同じ見積もり方で、
// 文字サイズ × 1.25（縁取りを含めた余裕）を切り上げ + 行の間隔 = 20px。高さ = 行の高さ × 行数 = 60px。
export const VACATION_HINT_LINE_SPACING = 2;
const VACATION_HINT_LINE_HEIGHT_RATIO = 1.25;
export const VACATION_HINT_LINE_HEIGHT =
  Math.ceil(parseInt(VACATION_HINT_FONT_SIZE, 10) * VACATION_HINT_LINE_HEIGHT_RATIO) + VACATION_HINT_LINE_SPACING;
export const VACATION_HINT_HEIGHT = VACATION_HINT_LINE_HEIGHT * VACATION_HINT_LINES;
// 仮・要確認(#18): 企画書は「不正なコードがリリースされると障害になり、損害として資金が減る」とだけで、損害額は未記載。
// 損害1ポイントあたりの金額（円）。損害額 = 損害ポイント × この値。種別ごとの損害ポイントは MALICIOUS_CODE_PARAMS の damage。
export const INCIDENT_DAMAGE_UNIT_YEN = 10000;
// 仮・要確認(#18): 種別を持たない不正コード（種別の抽選が未実装）がリリースされたときの損害ポイント。
export const INCIDENT_DEFAULT_DAMAGE_POINTS = 10;
// 仮・要確認(#18): 障害の演出（画面全体の短い点滅）の継続時間（ミリ秒）と色（0xRRGGBB）。企画書には演出の記載なし。
export const INCIDENT_FLASH_DURATION_MS = 250;
export const INCIDENT_FLASH_COLOR = 0xff0000;

// 仮・要確認(#46): 企画書(7)は「技術的負債が一定量を超えて放置すると、大障害が起きる」とだけで、閾値・放置時間・損害額は未定
// （docs/tasks.md の「技術的負債の具体的な数値」）。以下はすべて仮の値。
// 仮・要確認(#46): 大障害の閾値。技術的負債がこの値を「超えて」いる間（ちょうどは含まない）を放置とみなす。0〜TECH_DEBT_MAX の内側。
export const TECH_DEBT_OUTAGE_THRESHOLD = 80;
// 仮・要確認(#46): 閾値を超えたまま続けて放置できる時間（ミリ秒）。ゲーム内1か月。これ以上続くと大障害が1回起き、放置時間は 0 に戻る。
// 閾値以下に下がったら放置時間は 0 に戻る（累積しない）。
export const TECH_DEBT_OUTAGE_GRACE_MS = MS_PER_GAME_MONTH;
// 仮・要確認(#46): 大障害の損害ポイント。損害額 = この値 × INCIDENT_DAMAGE_UNIT_YEN。種別なしの不正コード(INCIDENT_DEFAULT_DAMAGE_POINTS)より大きくする。
export const TECH_DEBT_OUTAGE_DAMAGE_POINTS = 100;
// 仮・要確認(#46): 大障害の損害額（円）。
export const TECH_DEBT_OUTAGE_DAMAGE = TECH_DEBT_OUTAGE_DAMAGE_POINTS * INCIDENT_DAMAGE_UNIT_YEN;
// 仮・要確認(#46): 大障害の演出（画面全体の点滅）。通常の障害(INCIDENT_FLASH_DURATION_MS)より長くする。企画書には演出の記載なし。
export const TECH_DEBT_OUTAGE_FLASH_DURATION_MS = 600;
export const TECH_DEBT_OUTAGE_FLASH_COLOR = 0xff0000;
// 仮・要確認(#46): 大障害の通知（フィールド中央に出てフェードアウトする文字）の文言・文字サイズ・色・表示時間（ミリ秒）。
export const TECH_DEBT_OUTAGE_TEXT = '大障害発生!';
export const TECH_DEBT_OUTAGE_TEXT_FONT_SIZE = '48px';
export const TECH_DEBT_OUTAGE_TEXT_COLOR = '#ff1744';
export const TECH_DEBT_OUTAGE_TEXT_DURATION_MS = 1500;

// 仮・要確認(#50): 企画書(8, 10)ではアイテムの範囲・攻撃力は「段階」だけで、具体的な数値は未定。以下はすべて仮の値。
// 範囲(段階→距離): CELL_SIZE に対する比率。近距離=1.5(90px)、中距離=2.5(150px)、長距離=4(240px)。主人公の攻撃範囲(60px)より大きい。
export const ITEM_RANGE_RATIOS = { short: 1.5, middle: 2.5, long: 4 } as const;
// 仮・要確認(#50): 攻撃力(段階→1ヒットのダメージ)。主人公の ATTACK_DAMAGE=1 と整数の hp(#10) に合わせて整数にする。
// none は攻撃しないアイテム（猫 #57）の攻撃力で、ダメージ 0。
export const ITEM_POWER_DAMAGE = { none: 0, weak: 1, medium: 2, strong: 3 } as const;
// 仮・要確認(#50): 得意な種類の不正コードに対するダメージ倍率。
// 得意でない種類にも等倍で効く（企画書「マイナー・インフォは CodeRabbit や Linter でも倒せる」より）。
// 万能型(all)は得意ボーナスなしで全種類に等倍（「クリティカル・メジャーはスキャナーがないと苦戦」と矛盾させないため）。
// 種類なしの不正コード(maliciousType undefined)は得意でない扱いで等倍。
export const ITEM_STRONG_AGAINST_MULTIPLIER = 2;

// 仮・要確認(#48): 企画書(8)は「リリースで稼いだポイントでプレイ中にアイテムを追加できる」とだけで、通貨・操作・置ける場所は未記載。以下はすべて仮の値。
// 通貨: 別のポイントは作らず資金(funds)で買う。正常コードのリリースは売上として資金に入り(#17)、スコアも累計売上(#22)で、別通貨が存在しないため。
// 価格の段階(円)。企画書の「安い・普通・高い」に対応。1回の購入額。月額払いの毎月の引き落としは #51。
export const ITEM_PRICE_TIERS = { cheap: 25000, normal: 50000, expensive: 100000 } as const;
// アイテムごとの価格の段階（企画書 8 の価格列）。
export const ITEM_PRICE_TIER_BY_TYPE = {
  codeRabbit: 'expensive',
  linter: 'cheap',
  testTool: 'normal',
  ci: 'normal',
  securityScanner: 'expensive',
  pairProgrammer: 'normal',
  cat: 'cheap',
  // 仮・要確認(#58): 以下 11 個は企画書 8 の価格列（安い・普通・高い）どおり。
  rubberDuck: 'cheap',
  codeFreeze: 'normal',
  specChangeStorm: 'normal',
  coffeeMachine: 'cheap',
  energyDrink: 'cheap',
  pizza: 'cheap',
  documentation: 'normal',
  fridayDeploy: 'cheap',
  rollbackButton: 'expensive',
  worksFine: 'cheap',
  seniorNote: 'expensive',
} as const;
// 仮・要確認(#48, #43): HUD（経過日数・資金・累計売上・技術的負債の4行）が占める範囲。幅は「資金: 1,000,000円」で約300px、
// 高さは最下行（技術的負債）の上端から文字の行高さ約30px（ELAPSED_DAYS_STYLE 24px）まで。
const ITEM_HUD_WIDTH = 300;
const ITEM_HUD_LINE_HEIGHT = 30;
// 仮・要確認(#48, #43, #34, #53): HUD は x=ELAPSED_DAYS_POSITION.x（72）〜372、y=80〜約206。昇給・減給の情報行・ボタン（y=208〜266、
// ボタンは x=72〜416）と AIエージェントのボタン（y=270〜298、x=72〜416）も含める。
const salaryUiRight =
  SALARY_UI_POSITION.x +
  SALARY_BUTTON_ORDER.length * SALARY_BUTTON_SIZE.width +
  (SALARY_BUTTON_ORDER.length - 1) * SALARY_BUTTON_SIZE.gap;
const aiAgentUiRight =
  AI_AGENT_UI_POSITION.x +
  AI_AGENT_BUTTON_ORDER.length * AI_AGENT_BUTTON_SIZE.width +
  (AI_AGENT_BUTTON_ORDER.length - 1) * AI_AGENT_BUTTON_SIZE.gap;
// 仮・要確認(#151): HUD・昇給減給UI・AIエージェントのボタン・休暇の案内文(#150)の外接矩形（ピクセル。x=72〜416、y=80〜362）。
// #151 までは 60px セルに切り上げて「行1〜4 × col 1〜6」を置けないセルにしていたが、画素の矩形をそのまま置けない範囲にする。
// 下端は休暇の案内文の下端（VACATION_HINT_POSITION.y + VACATION_HINT_HEIGHT = 362）。案内文の下にアイテムを置けないようにする(#150)。
export const ITEM_HUD_BOUNDS = {
  x: ELAPSED_DAYS_POSITION.x,
  y: ELAPSED_DAYS_POSITION.y,
  width: Math.max(ELAPSED_DAYS_POSITION.x + ITEM_HUD_WIDTH, salaryUiRight, aiAgentUiRight) - ELAPSED_DAYS_POSITION.x,
  height:
    Math.max(
      TECH_DEBT_POSITION.y + ITEM_HUD_LINE_HEIGHT,
      SALARY_UI_POSITION.y + SALARY_BUTTON_SIZE.height,
      AI_AGENT_UI_POSITION.y + AI_AGENT_BUTTON_SIZE.height,
      VACATION_HINT_POSITION.y + VACATION_HINT_HEIGHT,
    ) - ELAPSED_DAYS_POSITION.y,
} as const;
// 仮・要確認(#48, #151): アイテムを置けない範囲（ピクセル矩形）。アイテムのフットプリント（ITEM_BOX_SIZE = 16px の正方形）が 1px でも重なると置けない
// （辺や角が接するだけなら置ける）。上帯（行0: 雇うボタン・割合UI・エンジニア数）と下帯（最終行: アイテム購入ボタン）はルートグリッドの行の高さ（CELL_SIZE）のまま。
export const ITEM_BLOCKED_RECTS = [
  { x: 0, y: 0, width: CELL_SIZE * FIELD_COLS, height: CELL_SIZE },
  { x: 0, y: CELL_SIZE * (FIELD_ROWS - 1), width: CELL_SIZE * FIELD_COLS, height: CELL_SIZE },
  ITEM_HUD_BOUNDS,
] as const;
// 仮・要確認(#48): アイテム購入キー（購入バーの現在ページの枠の順に対応）。移動(矢印/WASD)・攻撃(SPACE)・雇う(1〜3)・昇給・減給(Q/E/R/F)・リスタートと重ならない。Phaser の KeyCodes のキー名。
// 仮・要確認(#58): アイテムが 18 個になったため、購入バーをページ切替式にした。キー 4〜9 は現在ページの 1〜6 枠目を買う（#57 の猫のキー 0 は廃止）。
export const ITEM_BUY_KEYS = ['FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'] as const;
// 購入ボタンに表示するキーの文字（ITEM_BUY_KEYS と同じ順序）。
export const ITEM_BUY_KEY_LABELS = ['4', '5', '6', '7', '8', '9'] as const;
// 仮・要確認(#58): 購入バー1ページの枠数。購入キーの数と同じ。
export const ITEM_PAGE_SIZE = ITEM_BUY_KEYS.length;
// 仮・要確認(#58): 購入バーのページ切替キー（前のページ・次のページ）。他の操作キーと重ならない。端では反対側の端へ回り込む。
export const ITEM_PAGE_KEYS = { previous: 'G', next: 'H' } as const;
export const ITEM_PAGE_BUTTON_LABELS = {
  previous: `◀${ITEM_PAGE_KEYS.previous}`,
  next: `${ITEM_PAGE_KEYS.next}▶`,
} as const;
// 仮・要確認(#48): ボタン・メッセージに使う短い名前と、フィールド上の短い文字。
export const ITEM_SHORT_NAMES = {
  codeRabbit: 'CodeRabbit',
  linter: 'Linter',
  testTool: 'Test',
  ci: 'CI',
  securityScanner: 'Scanner',
  pairProgrammer: 'Pair',
  cat: 'Cat',
  rubberDuck: 'Duck',
  codeFreeze: 'Freeze',
  specChangeStorm: 'SpecStorm',
  coffeeMachine: 'Coffee',
  energyDrink: 'Energy',
  pizza: 'Pizza',
  documentation: 'Docs',
  fridayDeploy: 'FriDeploy',
  rollbackButton: 'Rollback',
  worksFine: 'Yoshi!',
  seniorNote: 'Senior',
} as const;
export const ITEM_MARKS = {
  codeRabbit: 'CR',
  linter: 'Lint',
  testTool: 'Test',
  ci: 'CI',
  securityScanner: 'Sec',
  pairProgrammer: 'Pair',
  cat: 'Cat',
  // 仮・要確認(#58): フィールドに置くのはラバーダック・コーヒーマシン・書き置きだけ。他は購入時に発動して置かないが、表の形を揃えるために持つ。
  rubberDuck: 'Duck',
  codeFreeze: 'Frz',
  specChangeStorm: 'Spec',
  coffeeMachine: 'Cof',
  energyDrink: 'Enr',
  pizza: 'Piz',
  documentation: 'Doc',
  fridayDeploy: 'Fri',
  rollbackButton: 'RB',
  worksFine: 'Yoshi',
  seniorNote: 'Note',
} as const;
// 仮・要確認(#48): アイテムの攻撃間隔（ミリ秒）。全アイテム共通。置いた直後はクールダウンなしで攻撃できる。
export const ITEM_ATTACK_COOLDOWN_MS = 1000;
// 仮・要確認(#54): テストツールが攻撃した不正コードを足止めする時間（ミリ秒）。企画書(8)は「足止め」とだけで、時間は未定。
// ITEM_ATTACK_COOLDOWN_MS より短くし、テストツール1つで同じコードを止め続けられないようにする（次の攻撃までに必ず少し動く）。
export const TEST_TOOL_HOLD_MS = 500;
// 仮・要確認(#57): 猫がコードを1つ消す間隔（ミリ秒）。企画書は「ランダムで消す」だけで間隔は未記載。
// 正常なコードも消して売上を減らすため、攻撃間隔(ITEM_ATTACK_COOLDOWN_MS)より長くする。置いた直後は待たずに消せる。
export const CAT_DELETE_INTERVAL_MS = 5000;
// 仮・要確認(#48): アイテムの見た目。色付き四角（ルートグリッドのセル CELL_SIZE に対する比率）と文字。色は種類ごと。
// 仮・要確認(#154): アイテムの四角が占める配置グリッドのマス数（一辺）。配置グリッドを 16px にした(#151)のに四角が 36px のままでは細かい配置の意味がないため、1マスにする。
export const ITEM_BOX_CELLS = 1;
// 仮・要確認(#151, #154): アイテムの四角の一辺（16px = 配置グリッド 1マス）。描画と、配置判定のフットプリント（置けるか・重なるかを判定する正方形）で共有する。
// フットプリントは辺や角が接するだけなら重ならない扱いなので、隣のマス（辺・角）にもアイテムを置ける。
export const ITEM_BOX_SIZE = PLACEMENT_CELL_SIZE * ITEM_BOX_CELLS;
export const ITEM_COLORS = {
  codeRabbit: 0xff8a3d,
  linter: 0x4db6ac,
  testTool: 0x7e57c2,
  ci: 0x42a5f5,
  securityScanner: 0xe53935,
  pairProgrammer: 0xfdd835,
  cat: 0x8d6e63,
  // 仮・要確認(#58)
  rubberDuck: 0xffeb3b,
  codeFreeze: 0x81d4fa,
  specChangeStorm: 0xab47bc,
  coffeeMachine: 0x6d4c41,
  energyDrink: 0x76ff03,
  pizza: 0xff7043,
  documentation: 0xeceff1,
  fridayDeploy: 0xf06292,
  rollbackButton: 0x26a69a,
  worksFine: 0x9ccc65,
  seniorNote: 0xbcaaa4,
} as const;
// 仮・要確認(#154): 四角が 16px になったため、文字は 8px・黒縁は 1px に縮める（実際の読みやすさは目視で確認する）。
export const ITEM_MARK_STYLE = { fontSize: '8px', color: '#ffffff', strokeColor: '#000000', strokeThickness: 1 } as const;
// 仮・要確認(#154): アイテムの四角の縁取り。16px の四角に対して 2px は太いため 1px にする。
export const ITEM_BOX_STROKE = { width: 1, color: 0xffffff } as const;
// 仮・要確認(#48): アイテムの攻撃演出（アイテムから対象への線）の色・太さ・表示時間（ミリ秒）。
export const ITEM_ATTACK_LINE = { color: 0xffffff, width: 3, durationMs: 150 } as const;
// 仮・要確認(#48): 購入ボタンの配置。画面下端の行（アイテムを置けない行）に横に並べる。
// 仮・要確認(#35): 左端 x は出現列（ENGINEER_SPAWN_COL、x=0〜CELL_SIZE）の右端。出現場所は列0の行0〜8のどこにでも出るため、
// 行8の出現場所・休暇マーカー（当たり判定 x=14〜46）と重ならないようにする。
// 仮・要確認(#57): 猫で7個になったため幅を 146→124 に縮め、7個で x=60〜952 とフィールド幅960に収める。
// 仮・要確認(#58): ページ切替式にしたため1ページは6枠（x=60〜824）。幅は #57 の 124 のまま。
export const ITEM_UI_POSITION = { x: CELL_SIZE * (ENGINEER_SPAWN_COL + 1), y: FIELD_ROWS * CELL_SIZE - 34 } as const;
export const ITEM_BUTTON_SIZE = { width: 124, height: 28, gap: 4 } as const;
// 仮・要確認(#58): ページ切替UI。6枠目の右（x=828）から [前のページ][ページ表示][次のページ] を並べる。高さは購入ボタンと同じ。
// 右端は 828 + 40 × 3 + 4 × 2 = 956 でフィールド幅960に収まる。
export const ITEM_PAGE_UI_SIZE = { width: 40, gap: 4 } as const;
export const ITEM_BUTTON_COLORS = { fill: 0x1e3a2a, stroke: 0x6cff9c, text: '#ffffff' } as const;
// 仮・要確認(#48): 購入ボタンの背景の不透明度。下端の行を流れるコードがボタン越しに見えるよう半透明にする。
export const ITEM_BUTTON_FILL_ALPHA = 0.7;
// 仮・要確認(#57): 幅 124px に最長の「[4] CodeRabbit 20万/月」（sans-serif 11px で約114px）が収まるよう 13px→11px にする。
export const ITEM_BUTTON_FONT_SIZE = '11px';
// 仮・要確認(#48): 結果メッセージ（「Linterを置きました」など）の位置・色・表示時間（ミリ秒）。雇うメッセージ(y=42)と重ならない下側、購入ボタンの上。
export const ITEM_MESSAGE_POSITION = { x: 8, y: FIELD_ROWS * CELL_SIZE - 70 } as const;
export const ITEM_MESSAGE_COLOR = '#b9f6ca';
export const ITEM_MESSAGE_DURATION_MS = 2000;
// 仮・要確認(#51): 月額 = Math.round(購入価格 × この倍率)。企画書の月額アイテムの「価格」を月額の価格と読み、購入時と同じ額（倍率 1）にした。数値の調整口。
export const ITEM_MONTHLY_FEE_RATIO = 1;

// 仮(#144): 床・ルート・出現場所の見た目。座標・セルサイズ・当たり判定は変えず、色と線だけを決める。
// 床は濃紺2色の市松タイル（旧来の単色 0x16203a と同系色、背景色 #0b1020 と区別できる明るさ）。HUD の白文字と黒縁取りが読めるよう暗いままにする。
export const FIELD_FLOOR_COLORS = {
  tileLight: 0x182443,
  tileDark: 0x131c35,
  grid: 0x2a3a62,
  frame: 0x5b8def,
  vignette: 0x05070f,
} as const;
// 仮(#144): グリッド線の不透明度、外周の縁取りの太さ・不透明度、外周を暗くする帯（ビネット）の段数・1段の幅・最外段の不透明度。
export const FIELD_FLOOR_STYLE = {
  gridAlpha: 0.45,
  frameWidth: 2,
  frameAlpha: 0.6,
  vignetteSteps: 4,
  vignetteStepWidth: 4,
  vignetteMaxAlpha: 0.35,
} as const;
// 仮(#144): ルートの色。暗く太い下地線に明るい本線を重ね、進行方向の矢印（シェブロン）を描く。
export const ROUTE_COLORS = {
  underlay: 0x0a1128,
  main: 0x6c9cff,
  chevron: 0xd6e4ff,
} as const;
// 仮(#144): ルートの線の太さ・不透明度と、矢印の間隔・大きさ（px）。間隔を CELL_SIZE にすると、矢印がセルの境目（折れ点の間）に並ぶ。
export const ROUTE_LINE_STYLE = {
  underlayWidth: 12,
  underlayAlpha: 0.85,
  mainWidth: 4,
  mainAlpha: 0.9,
  chevronSpacing: CELL_SIZE,
  chevronSize: 8,
  chevronWidth: 2,
  chevronAlpha: 0.85,
} as const;
// 仮・要確認(#151): ルートの中心線からアイテムのフットプリントを離す距離（px）。下地線の幅の半分（6px）と矢印の大きさ（8px）を覆う値。
// フットプリントとルートの中心線の距離がこの値未満なら置けない（ちょうどは置ける）。
export const ITEM_ROUTE_CLEARANCE = Math.max(ROUTE_LINE_STYLE.underlayWidth / 2, ROUTE_LINE_STYLE.chevronSize);
// 仮(#144): 出現場所の円（半径 SPAWN_MARKER_STYLE.radius）の外側の細いリングと、内側の小さな再生マーク（▶）の見た目。
// リングはセル内（中心から CELL_SIZE / 2 未満）に収め、休暇マーカーの当たり判定（円の半径）は変えない。
export const SPAWN_MARKER_DECOR_COLORS = {
  ring: 0xffd180,
  icon: 0xffffff,
} as const;
export const SPAWN_MARKER_DECOR_STYLE = {
  ringGap: 3,
  ringWidth: 1,
  ringAlpha: 0.8,
  iconSize: 10,
} as const;

// 仮(#144): リリース地点（半径 RELEASE_POINT_STYLE.radius の緑の円）の装飾。内側の同心円リング・中央の上向き矢印（デプロイ）のアイコン、
// 外側に広がって消えるパルス（ループ）。パルスの外端（半径 + 線幅の半分）はセル内（中心から CELL_SIZE / 2 = 30px 以内）に収める。
export const RELEASE_POINT_DECOR_COLORS = {
  ring: 0x1b5e20,
  icon: 0xffffff,
  pulse: 0xb9f6ca,
} as const;
export const RELEASE_POINT_DECOR_STYLE = {
  innerRingRadius: 17,
  ringWidth: 2,
  ringAlpha: 0.7,
  iconSize: 14,
  iconLineWidth: 3,
} as const;
export const RELEASE_POINT_PULSE = {
  maxRadius: 28,
  strokeWidth: 2,
  startAlpha: 0.8,
  durationMs: 1200,
} as const;
// 仮(#144): 正常なコードをリリースしたときの一時エフェクト。リリース地点から緑の輪が広がり、決まった数の粒が放射状に飛んで消える。
export const RELEASE_BURST = {
  ringColor: 0x69f0ae,
  ringStrokeWidth: 3,
  ringEndRadius: 44,
  particleColor: 0xb9f6ca,
  particleCount: 8,
  particleRadius: 3,
  particleDistance: 36,
  durationMs: 450,
} as const;

// 仮・要確認(#47): 企画書(8)は「ステージポイントによる初期配置」とだけで、ポイントの初期値・コスト・返却・持ち越し・開始条件は未記載。以下はすべて仮の値（要調整。一次資料に定義なし）。
// 仮の規則: ステージポイントは資金(funds)とは別の単位で、プレイ開始前（初期配置フェーズ）にだけ使う。資金は変えない。
// 配置済みのセルをもう一度押すと撤去して、そのコストを全額返す。配置ゼロ・残ポイントありでも開始でき、残ポイントは開始時に破棄する（持ち越さない）。
// 再開始（倒産後のリスタート）では毎回 STAGE_POINTS_INITIAL・配置なしから始める。月額アイテムの月額費用は、プレイ中に買ったものと同じく資金から引く(#51)。
// 仮・要確認(#47): ステージ開始時のステージポイント。
export const STAGE_POINTS_INITIAL = 6;
// 仮・要確認(#47): 価格の段階（ITEM_PRICE_TIER_BY_TYPE）ごとの配置コスト（ステージポイント）。安い < 普通 < 高い の順を保つ。
export const STAGE_POINT_COST_BY_TIER = { cheap: 1, normal: 2, expensive: 3 } as const;
// 仮・要確認(#47): 初期配置を終えてプレイを始めるキー。Phaser の KeyCodes のキー名。
// 移動(矢印/WASD)・攻撃(SPACE)・雇う(1〜3)・アイテム(4〜9・ページ G/H)・AIエージェント(V/B/N)・昇給減給(Q/E/R/F)・割合(Z/X)と重ならない。
// リスタート(ENTER/SPACE)と同じ ENTER だが、リスタートはゲームオーバー中だけ、開始は初期配置フェーズ中だけ動くため衝突しない。
export const INITIAL_PLACEMENT_START_KEYS = ['ENTER'] as const;
// 仮・要確認(#47): 初期配置UI（残ポイント・選択中のアイテム・操作説明のパネル、開始ボタン、メッセージ）の配置。
// 右上の行1〜3（col 11〜15、x=660〜960・y=60〜240）に置く。行0の雇用UI（人数・メッセージは y≦約67）の下、
// HUD（x≦約576）・昇給減給パネル（x≦416）の右、選択中のエンジニアの情報行（y≧208。AIエージェントの表示 #53 で右へ伸びる）の上、リリース地点（行4）の上。
// この範囲（INITIAL_PLACEMENT_UI_BOUNDS）に重なる位置は初期配置フェーズの間だけ置けない（#151 で矩形のまま判定する）。
const INITIAL_PLACEMENT_UI_LEFT_COL = 11;
const INITIAL_PLACEMENT_UI_MARGIN = 8;
export const INITIAL_PLACEMENT_PANEL_POSITION = {
  x: CELL_SIZE * INITIAL_PLACEMENT_UI_LEFT_COL + INITIAL_PLACEMENT_UI_MARGIN,
  y: 68,
} as const;
// 仮・要確認(#47): パネル・開始ボタン・メッセージの文字サイズと行の間隔（ピクセル）。パネルは4行（残ポイント・選択中・操作説明2行）。
// 1行の高さは 文字サイズ × 1.25（縁取りを含めた余裕）を切り上げ + 行の間隔 = 20px として範囲を見積もる。
export const INITIAL_PLACEMENT_FONT_SIZE = '14px';
// 行の間隔は 2px。選択中のエンジニアの情報行（y=208〜、AIエージェントの表示 #53 で右へ長くなった）と重ならないよう、メッセージの下端を y=208 に収める。
export const INITIAL_PLACEMENT_LINE_SPACING = 2;
export const INITIAL_PLACEMENT_PANEL_LINES = 4;
const INITIAL_PLACEMENT_LINE_HEIGHT_RATIO = 1.25;
export const INITIAL_PLACEMENT_LINE_HEIGHT =
  Math.ceil(parseInt(INITIAL_PLACEMENT_FONT_SIZE, 10) * INITIAL_PLACEMENT_LINE_HEIGHT_RATIO) + INITIAL_PLACEMENT_LINE_SPACING;
// 仮・要確認(#47): パネル・開始ボタン・メッセージの間の縦の余白（ピクセル）。
const INITIAL_PLACEMENT_UI_GAP = 6;
// 仮・要確認(#47): パネルの文言。
export const INITIAL_PLACEMENT_TEXT = {
  title: '初期配置',
  points: '残りポイント: ',
  pointUnit: 'pt',
  selected: '選択: ',
  instructionSelect: '[4〜9]/下のボタンで選択',
  instructionPlace: 'クリックで配置・撤去',
  startButton: '[ENTER] プレイ開始',
} as const;
// 仮・要確認(#47): 開始ボタンの位置・大きさ（パネルの下、y=154〜182）。色は雇うボタン(HIRE_BUTTON_COLORS)と同じ。
export const INITIAL_PLACEMENT_START_BUTTON_SIZE = { width: 200, height: 28 } as const;
export const INITIAL_PLACEMENT_START_BUTTON_POSITION = {
  x: INITIAL_PLACEMENT_PANEL_POSITION.x,
  y: INITIAL_PLACEMENT_PANEL_POSITION.y + INITIAL_PLACEMENT_PANEL_LINES * INITIAL_PLACEMENT_LINE_HEIGHT + INITIAL_PLACEMENT_UI_GAP,
} as const;
// 仮・要確認(#47): 初期配置の結果メッセージ（「Linterを置きました」など）の位置・色・表示時間（ミリ秒）。開始ボタンの下（y=188〜208）。
export const INITIAL_PLACEMENT_MESSAGE_POSITION = {
  x: INITIAL_PLACEMENT_PANEL_POSITION.x,
  y: INITIAL_PLACEMENT_START_BUTTON_POSITION.y + INITIAL_PLACEMENT_START_BUTTON_SIZE.height + INITIAL_PLACEMENT_UI_GAP,
} as const;
export const INITIAL_PLACEMENT_MESSAGE_COLOR = ITEM_MESSAGE_COLOR;
export const INITIAL_PLACEMENT_MESSAGE_DURATION_MS = ITEM_MESSAGE_DURATION_MS;
// 仮・要確認(#47): 初期配置UIが占める範囲の右端・下端（ピクセル）。右端はフィールド右端から余白を引いた位置、
// 下端はメッセージ（1行）の下端。この矩形に重なる位置は初期配置の間だけ置けない（プレイ開始で UI を消すので、プレイ中の購入では置ける #151）。
const INITIAL_PLACEMENT_UI_RIGHT = FIELD_COLS * CELL_SIZE - INITIAL_PLACEMENT_UI_MARGIN;
const INITIAL_PLACEMENT_UI_BOTTOM = INITIAL_PLACEMENT_MESSAGE_POSITION.y + INITIAL_PLACEMENT_LINE_HEIGHT;
export const INITIAL_PLACEMENT_UI_BOUNDS = {
  x: INITIAL_PLACEMENT_PANEL_POSITION.x,
  y: INITIAL_PLACEMENT_PANEL_POSITION.y,
  width: INITIAL_PLACEMENT_UI_RIGHT - INITIAL_PLACEMENT_PANEL_POSITION.x,
  height: INITIAL_PLACEMENT_UI_BOTTOM - INITIAL_PLACEMENT_PANEL_POSITION.y,
} as const;

// 仮・要確認(#58): 企画書(8)の「その他のアイテム」の効果の数値は未定。以下はすべて仮の値（試作で調整する）。
// 時限効果の時刻はゲーム内の経過ミリ秒（elapsedMs）で測る。同じ効果を重ねて買っても効果量は足さず、残り時間だけ延ばす（買い直した時点から数え直す）。
// 仮・要確認(#58): 静的解析ツール（Linter）の攻撃間隔（ミリ秒）。企画書「連射が速い」より、共通の ITEM_ATTACK_COOLDOWN_MS より短くする。
export const LINTER_ATTACK_COOLDOWN_MS = 400;
// 仮・要確認(#58): Linter の射程内に正常なコードがあるとき、発射を見送る確率（企画書「怪しい見た目の正常コードに反応しかけて、ときどき止まる」）。
// 見送ってもクールダウンは消費する。正常なコードは攻撃しない。
export const LINTER_HESITATION_PROBABILITY = 0.3;
// 仮・要確認(#58): ペアプロ相棒が主人公についてまわるときの、主人公の中心からのずれ（ピクセル）。攻撃の起点もこの位置。
export const PAIR_PROGRAMMER_FOLLOW_OFFSET = { x: CELL_SIZE * 0.6, y: -CELL_SIZE * 0.6 } as const;
// 仮・要確認(#58): ラバーダックで正体がバレた不正なコードの見た目。塗りと枠を濃い色にする。
export const REVEALED_CODE_STYLE = { fillColor: 0x8b0000, strokeColor: 0x3d0000 } as const;
// ゲーム内1日のミリ秒 GAME_DAY_MS は DAYS_PER_GAME_MONTH の直後で定義している。
// 仮・要確認(#58): コードフリーズの継続時間（ミリ秒）。ゲーム内5日。
export const CODE_FREEZE_DURATION_MS = GAME_DAY_MS * 5;
// 仮・要確認(#58): コーヒーマシン。範囲内（担当ルートの出現場所が範囲内のエンジニア）の台数がクラッシュ閾値以下なら生成間隔に BOOST を掛け、
// 閾値を超えるとカフェイン切れで CRASH を掛ける。台数が 0 なら掛けない。
export const COFFEE_SPAWN_INTERVAL_BOOST_MULTIPLIER = 0.75;
export const COFFEE_SPAWN_INTERVAL_CRASH_MULTIPLIER = 1.5;
export const COFFEE_CRASH_THRESHOLD = 2;
// 仮・要確認(#58): エナジードリンク。購入から BOOST の時間は主人公の速度に BOOST 倍率、その後 SLUMP の時間は SLUMP 倍率を掛ける。
export const ENERGY_DRINK_BOOST_DURATION_MS = GAME_DAY_MS * 3;
export const ENERGY_DRINK_BOOST_SPEED_MULTIPLIER = 2;
export const ENERGY_DRINK_SLUMP_DURATION_MS = GAME_DAY_MS * 5;
export const ENERGY_DRINK_SLUMP_SPEED_MULTIPLIER = 0.5;
// 仮・要確認(#58): ピザ。継続時間の間、全ルートの生成間隔に倍率を掛ける（ペースが上がる）。購入時に技術的負債を少し溜める。
export const PIZZA_DURATION_MS = GAME_DAY_MS * 10;
export const PIZZA_SPAWN_INTERVAL_MULTIPLIER = 0.7;
export const PIZZA_TECH_DEBT = 5;
// 仮・要確認(#58): ドキュメント。最初に買った時点から、担当がジュニアのルートの不正コード率をゲーム内1か月あたり PER_MONTH ずつ下げ、MAX で止める。
// 買い直しても購入時刻は最初のまま（効果量は足さない）。
export const DOCUMENTATION_RATE_REDUCTION_PER_MONTH = 0.05;
export const DOCUMENTATION_RATE_REDUCTION_MAX = 0.15;
// 仮・要確認(#58): ドキュメントが効く担当エンジニアのランク（企画書「ジュニアの不正コード率が少しずつ下がる」）。ENGINEER_RANKS の id。
export const DOCUMENTATION_TARGET_RANK = 'junior';
// 仮・要確認(#58): 金曜日の夕方デプロイ。購入時に売上を入れ、PROBABILITY の確率で DELAY 後（週末）に大障害を起こす。
export const FRIDAY_DEPLOY_SALES = 400000;
export const FRIDAY_DEPLOY_INCIDENT_PROBABILITY = 0.7;
export const FRIDAY_DEPLOY_INCIDENT_DELAY_MS = GAME_DAY_MS * 2;
// 仮・要確認(#58): 金曜デプロイの大障害の損害ポイント。損害額 = この値 × INCIDENT_DAMAGE_UNIT_YEN。
export const FRIDAY_DEPLOY_INCIDENT_DAMAGE_POINTS = 50;
// 仮・要確認(#58): 「動いてるからヨシ！」。継続時間の間、コードの移動距離に倍率を掛け、置いたアイテムは攻撃しない（主人公の攻撃は止めない）。
export const WORKS_FINE_DURATION_MS = GAME_DAY_MS * 5;
export const WORKS_FINE_CODE_SPEED_MULTIPLIER = 2;
// 仮・要確認(#58): 伝説のシニアの書き置きで障害を防いだときのメッセージ。
export const SENIOR_NOTE_PREVENTED_MESSAGE = '書き置きのおかげで障害を防いだ（中身は誰も読めない）';

// 仮・要確認(#55): 企画書(8)は CI を「リリース直前で不正なコードを確率で止める・減速させる」とだけで、数値は未定。以下はすべて仮の値。
// 効果範囲の長さは CI の範囲（getItemRange('ci')、近距離）を、リリース地点までの経路の残り距離として使う。
// 基本の阻止確率（0〜1）。CI 1個ごとに独立に判定する。得意な種類（bug・lowPerformance）は ITEM_STRONG_AGAINST_MULTIPLIER 倍（上限 1）。
export const CI_INTERCEPT_RATE = 0.4;
// 効果範囲内の移動速度の倍率（0〜1）。正常・不正どちらのコードにも効く。CI が複数あっても重ねがけしない。
export const CI_SLOW_MULTIPLIER = 0.8;
