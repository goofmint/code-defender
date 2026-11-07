# Code Defender

Webブラウザで動く2Dディフェンスゲーム。正常なコードに紛れ込む不正なコードを退治し、正常なコードだけをリリースしよう。

企画書: [docs/game_plan.md](docs/game_plan.md)

## 開発

```sh
npm install
npm run dev
```

開発サーバーは http://localhost:5173/ で、タイトルだけの空のゲーム画面を表示します。

```sh
npm run build
npm run preview
```

本番ビルドの公開パスは `/code-defender/` です。プレビューは http://localhost:4173/code-defender/ で確認できます。`main` への push で GitHub Actions が [GitHub Pages](https://goofmint.github.io/code-defender/) へデプロイします。Pages のソースは GitHub Actions に設定してください。

## ゲームの説明の編集

ゲーム内の ℹ️ で開く「ゲームの説明」は、言語ごとの Markdown ファイルが正本です。

- 日本語: `src/i18n/help/ja.md`
- 英語: `src/i18n/help/en.md`

ファイルはビルド時にバンドルへ取り込みます（Vite の `?raw`）。編集したら開発サーバーを再読み込みすれば反映されます。

### 書き方

使える記法は次の2つだけです。それ以外の行（`##` の見出し、段落、字下げした継続行、`*` や `1.` の箇条書きなど）があると、行番号付きのエラーになります。空行は無視します。

- `# 見出し`: パネルの見出し。項目より前に1つだけ書きます。
- `- 説明`: 説明の1行。上から順に表示します。1項目は1行で、途中で改行できません。

太字やリンクなどの装飾は使えません（Phaser のテキストにそのまま表示されます）。説明の行はパネルの内側の幅（推定幅）に収め、行数はフィールドの高さに収まる数にします。行の追加・削除・並べ替えは Markdown の編集だけでできますが、日本語と英語は同じ行数・同じ順序にそろえ、同じ位置の行では同じプレースホルダーを使います（テストで確認します）。

### プレースホルダー

`{名前}` は `src/config.ts` などの値に置き換わります（`src/help.ts` の `buildHelpParams`）。すべての行で共通の名前で、どの行でも使えます。辞書にない名前を書くとエラーになります。

| 名前 | 意味 |
| --- | --- |
| `{zeroFunds}` | 倒産の境目の資金（0円 / ¥0） |
| `{bankrupt}` | 倒産の条件の語句（以下 / 未満） |
| `{range}` | 攻撃の射程（px） |
| `{up}` `{down}` `{left}` `{right}` `{attack}` | バーチャルパッドのボタンの文字 |
| `{points}` | 初期配置のステージポイント |
| `{start}` | 開始ボタンの文言 |
| `{vacationReduction}` `{vacationMax}` `{vacationMin}` | 休暇1回で下がる不正率・下げられる上限・不正率の下限（パーセントポイント） |
| `{maxEngineers}` | エンジニアの上限人数 |
| `{levelUpDays}` | レベルが上がる間隔（日） |
| `{refactoring}` `{feature}` | 開発バランスのボタンの文字 |
| `{step}` | 開発バランスの1回の刻み（%） |
| `{daysIcon}` `{fundsIcon}` `{salesIcon}` `{paymentIcon}` | HUD の絵文字（経過日数・資金・累計売上・次の月末に払う額） |
| `{normal}` `{caution}` `{critical}` | 技術的負債の段階の絵文字 |
| `{normalMin}` `{normalMax}` `{cautionMin}` `{cautionMax}` `{criticalMin}` `{criticalMax}` | 技術的負債の段階の範囲 |
| `{outage}` | 大障害になる技術的負債の閾値 |
| `{outageDays}` | 閾値を超えたまま大障害になるまでの日数 |

編集したら `npm test` で、記法・行数・プレースホルダー・幅を確認してください。
