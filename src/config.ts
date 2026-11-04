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
// 仮・要確認: 担当エンジニアがいないルートの、ゲーム開始時の不正コードの割合（0〜1）。
// 担当エンジニアがいるルートはランク表（ENGINEER_RANKS）の maliciousRate / maliciousRateMax を使う(#12)。
// 時間とともに増える(#14)。経過時間ごとの値は difficulty.ts の maliciousRateAt で求める。
export const CODE_MALICIOUS_RATE = 0.3;

// 仮・要確認(#14): 企画書は「時間とともにコードの流れが速くなり、不正なコードも増える」とだけで、数値・増え方は未記載。
// 難易度を上げる間隔（ミリ秒）。経過時間をこの間隔で区切り、1段階ごとに速度と不正コード率を上げる。
export const DIFFICULTY_STEP_MS = 30000;
// 仮・要確認(#14): 1段階ごとのコード速度の増加量（ピクセル/秒）。
export const CODE_SPEED_INCREMENT = 8;
// 仮・要確認(#14): コード速度の上限（ピクセル/秒）。主人公(PLAYER_SPEED)より遅くする。
export const CODE_SPEED_MAX = 160;
// 仮・要確認(#14): 1段階ごとの不正コード率の増加量（0〜1）。担当エンジニアのランク別の割合(#12)でも同じ増加量を使う。
export const CODE_MALICIOUS_RATE_INCREMENT = 0.02;
// 仮・要確認(#14): 担当エンジニアがいないルートの不正コード率の上限（0〜1）。
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
// 仮・要確認(#43): リファクタリングの割合（0〜1）の初期値。割合を指定するUIは別タスク（docs/tasks.md 8）。
// 0.2 なら作業1単位で 0.8×10 溜まり 0.2×20 返すので、正味 +4。リファクタリング 1/3 で増減 0 になる。
export const DEFAULT_REFACTORING_RATIO = 0.2;
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

// 仮・要確認(#23): 企画書(6)は「ジュニア・ミドル・シニアの3ランクから雇える」とだけで、費用・人数・上限・操作は未記載。以下はすべて仮の値。
// ランク表。表示名のほか、不正コード率(#12/#24)・性格(#26)の列を後から足せる。順序は画面のボタン順と同じ。
// 仮・要確認(#12): maliciousRate は担当ルートの開始時の不正コード率、maliciousRateMax は時間が経った後の上限（どちらも 0〜1）。
// 企画書(6)「不正なコードの割合」の叩き台（ジュニア 40%→60%・ミドル 25%→45%・シニア 10%→25%）。
// 数値は docs/tasks.md の「各ランクの不正コード率（開始時・上限）を確定する」で調整する。
// 増え方（増加量・間隔）は CODE_MALICIOUS_RATE_INCREMENT / DIFFICULTY_STEP_MS を共用する。
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
// 雇用費(ENGINEER_HIRE_COST: 100000/200000/300000円、雇うときの一時費用)と同じ順序で高くなる。昇給・減給(#34)は別 issue。
export const ENGINEER_MONTHLY_SALARY_BY_RANK: Readonly<Record<(typeof ENGINEER_RANKS)[number]['id'], number>> = {
  junior: 300000,
  middle: 400000,
  senior: 500000,
};
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
// 仮・要確認(#18): 企画書は「不正なコードがリリースされると障害になり、損害として資金が減る」とだけで、損害額は未記載。
// 損害1ポイントあたりの金額（円）。損害額 = 損害ポイント × この値。種別ごとの損害ポイントは MALICIOUS_CODE_PARAMS の damage。
export const INCIDENT_DAMAGE_UNIT_YEN = 10000;
// 仮・要確認(#18): 種別を持たない不正コード（種別の抽選が未実装）がリリースされたときの損害ポイント。
export const INCIDENT_DEFAULT_DAMAGE_POINTS = 10;
// 仮・要確認(#18): 障害の演出（画面全体の短い点滅）の継続時間（ミリ秒）と色（0xRRGGBB）。企画書には演出の記載なし。
export const INCIDENT_FLASH_DURATION_MS = 250;
export const INCIDENT_FLASH_COLOR = 0xff0000;

// 仮・要確認(#50): 企画書(8, 10)ではアイテムの範囲・攻撃力は「段階」だけで、具体的な数値は未定。以下はすべて仮の値。
// 範囲(段階→距離): CELL_SIZE に対する比率。近距離=1.5(90px)、中距離=2.5(150px)、長距離=4(240px)。主人公の攻撃範囲(60px)より大きい。
export const ITEM_RANGE_RATIOS = { short: 1.5, middle: 2.5, long: 4 } as const;
// 仮・要確認(#50): 攻撃力(段階→1ヒットのダメージ)。主人公の ATTACK_DAMAGE=1 と整数の hp(#10) に合わせて整数にする。
export const ITEM_POWER_DAMAGE = { weak: 1, medium: 2, strong: 3 } as const;
// 仮・要確認(#50): 得意な種類の不正コードに対するダメージ倍率。
// 得意でない種類にも等倍で効く（企画書「マイナー・インフォは CodeRabbit や Linter でも倒せる」より）。
// 万能型(all)は得意ボーナスなしで全種類に等倍（「クリティカル・メジャーはスキャナーがないと苦戦」と矛盾させないため）。
// 種類なしの不正コード(maliciousType undefined)は得意でない扱いで等倍。
export const ITEM_STRONG_AGAINST_MULTIPLIER = 2;

// 仮・要確認(#48): 企画書(8)は「リリースで稼いだポイントでプレイ中にアイテムを追加できる」とだけで、通貨・操作・置ける場所は未記載。以下はすべて仮の値。
// 通貨: 別のポイントは作らず資金(funds)で買う。正常コードのリリースは売上として資金に入り(#17)、スコアも累計売上(#22)で、別通貨が存在しないため。
// 価格の段階(円)。企画書の「安い・普通・高い」に対応。1回の購入額。月額払いの毎月の引き落としは #51。
export const ITEM_PRICE_TIERS = { cheap: 50000, normal: 100000, expensive: 200000 } as const;
// アイテムごとの価格の段階（企画書 8 の価格列）。
export const ITEM_PRICE_TIER_BY_TYPE = {
  codeRabbit: 'expensive',
  linter: 'cheap',
  testTool: 'normal',
  ci: 'normal',
  securityScanner: 'expensive',
  pairProgrammer: 'normal',
} as const;
// 仮・要確認(#48): アイテムを置けない行（UI と重なる行）。上端=雇うボタン・HUD、下端=アイテム購入ボタン。
export const ITEM_BLOCKED_ROWS = [0, FIELD_ROWS - 1] as const;
// 仮・要確認(#48, #43): HUD（経過日数・資金・累計売上・技術的負債の4行）が占める範囲。幅は「資金: 1,000,000円」で約300px、
// 高さは最下行（技術的負債）の上端から文字の行高さ約30px（ELAPSED_DAYS_STYLE 24px）まで。
const ITEM_HUD_WIDTH = 300;
const ITEM_HUD_LINE_HEIGHT = 30;
// 仮・要確認(#48, #43): アイテムを置けないセル。HUD は x=ELAPSED_DAYS_POSITION.x（72）〜372、y=80〜約206 で、行1〜3 × col 1〜6 と重なる。
// 範囲は ELAPSED_DAYS_POSITION / TECH_DEBT_POSITION / CELL_SIZE から計算する（右端・下端ちょうどがセル境界なら次のセルは含めない）。
// col 0 は出現列（ルートがあれば元々置けない）なので含めない。
const itemHudMinCol = Math.floor(ELAPSED_DAYS_POSITION.x / CELL_SIZE);
const itemHudMaxCol = Math.ceil((ELAPSED_DAYS_POSITION.x + ITEM_HUD_WIDTH) / CELL_SIZE) - 1;
const itemHudMinRow = Math.floor(ELAPSED_DAYS_POSITION.y / CELL_SIZE);
const itemHudMaxRow = Math.ceil((TECH_DEBT_POSITION.y + ITEM_HUD_LINE_HEIGHT) / CELL_SIZE) - 1;
export const ITEM_BLOCKED_CELLS = Array.from(
  { length: itemHudMaxRow - itemHudMinRow + 1 },
  (_, r) => itemHudMinRow + r,
).flatMap((row) =>
  Array.from({ length: itemHudMaxCol - itemHudMinCol + 1 }, (_, c) => ({ col: itemHudMinCol + c, row })),
);
// 仮・要確認(#48): アイテム購入キー（ITEM_TYPES の順に対応）。移動(矢印/WASD)・攻撃(SPACE)・雇う(1〜3)・リスタートと重ならない。Phaser の KeyCodes のキー名。
export const ITEM_BUY_KEYS = ['FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'] as const;
// 仮・要確認(#48): ボタン・メッセージに使う短い名前と、フィールド上の短い文字。
export const ITEM_SHORT_NAMES = {
  codeRabbit: 'CodeRabbit',
  linter: 'Linter',
  testTool: 'Test',
  ci: 'CI',
  securityScanner: 'Scanner',
  pairProgrammer: 'Pair',
} as const;
export const ITEM_MARKS = {
  codeRabbit: 'CR',
  linter: 'Lint',
  testTool: 'Test',
  ci: 'CI',
  securityScanner: 'Sec',
  pairProgrammer: 'Pair',
} as const;
// 仮・要確認(#48): アイテムの攻撃間隔（ミリ秒）。全アイテム共通。置いた直後はクールダウンなしで攻撃できる。
export const ITEM_ATTACK_COOLDOWN_MS = 1000;
// 仮・要確認(#48): アイテムの見た目。セル内の色付き四角（セルに対する比率）と文字。色は種類ごと。
export const ITEM_BOX_RATIO = 0.6;
export const ITEM_COLORS = {
  codeRabbit: 0xff8a3d,
  linter: 0x4db6ac,
  testTool: 0x7e57c2,
  ci: 0x42a5f5,
  securityScanner: 0xe53935,
  pairProgrammer: 0xfdd835,
} as const;
export const ITEM_MARK_STYLE = { fontSize: '14px', color: '#ffffff', strokeColor: '#000000', strokeThickness: 3 } as const;
// 仮・要確認(#48): アイテムの攻撃演出（アイテムから対象への線）の色・太さ・表示時間（ミリ秒）。
export const ITEM_ATTACK_LINE = { color: 0xffffff, width: 3, durationMs: 150 } as const;
// 仮・要確認(#48): 購入ボタンの配置。画面下端の行（アイテムを置けない行）に6個を横に並べる。
export const ITEM_UI_POSITION = { x: 8, y: FIELD_ROWS * CELL_SIZE - 34 } as const;
export const ITEM_BUTTON_SIZE = { width: 154, height: 28, gap: 4 } as const;
export const ITEM_BUTTON_COLORS = { fill: 0x1e3a2a, stroke: 0x6cff9c, text: '#ffffff' } as const;
// 仮・要確認(#48): 購入ボタンの背景の不透明度。下端の行を流れるコードがボタン越しに見えるよう半透明にする。
export const ITEM_BUTTON_FILL_ALPHA = 0.7;
export const ITEM_BUTTON_FONT_SIZE = '13px';
// 仮・要確認(#48): 結果メッセージ（「Linterを置きました」など）の位置・色・表示時間（ミリ秒）。雇うメッセージ(y=42)と重ならない下側、購入ボタンの上。
export const ITEM_MESSAGE_POSITION = { x: 8, y: FIELD_ROWS * CELL_SIZE - 70 } as const;
export const ITEM_MESSAGE_COLOR = '#b9f6ca';
export const ITEM_MESSAGE_DURATION_MS = 2000;
// 仮・要確認(#51): 月額 = Math.round(購入価格 × この倍率)。企画書の月額アイテムの「価格」を月額の価格と読み、購入時と同じ額（倍率 1）にした。数値の調整口。
export const ITEM_MONTHLY_FEE_RATIO = 1;
