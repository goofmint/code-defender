# X Player Card 検証記録 (#63)

## 基本情報

- 検証日: Phase 1 は 2026-11-05 01:37 UTC に実施。Phase 2 は未実施
- 検証コミット: `4df6ff428d6d7df1873b5afd9b3cf2388e1a3274` (deploy.yml の最新成功実行の headSha。デプロイ済みコミット)
- 担当: Phase 1 は Claude (curl / gh のみ)。Phase 2 は人が実施 (担当者名: 未記入)

## 前提

- 従来の X Player Card のポリシーでは、プレイヤーは音声・動画用途に限られ、ゲームは認められていなかった。本ゲームが投稿内で起動するかどうかは、実際に投稿して確かめるまで分からない。
- 公式の Card Validator (`https://cards-dev.twitter.com/validator`) は現在プレビューを描画しない。2026-11-05 時点で curl でアクセスするとログイン画面 (`x.com/login`) にリダイレクトされるだけで、検証ツールとして使えない。確認手段は実投稿のみ。
- Player Card の公式ドキュメント URL は curl では確認できなかった。旧 URL (`developer.x.com/en/docs/x-for-websites/cards/overview/player-card`、`developer.twitter.com/en/docs/twitter-for-websites/cards/overview/player-card`) はどちらも `https://docs.x.com/overview` に転送され、Player Card のページには到達しなかった。そのため、ここでは根拠 URL を示さない。人が Phase 2 の前に docs.x.com で最新の記載を確認し、URL をここに追記すること。

## Phase 1: 事前確認結果 (2026-11-05 01:37 UTC)

| 項目 | 結果 |
| --- | --- |
| deploy.yml の最新実行 | success / completed。headSha `4df6ff4`、createdAt 2026-11-05T01:03:15Z。直前 2 件 (`f52ead7`, `bd14a1c`) も success |
| `GET /code-defender/` | HTTP/2 200、`content-type: text/html; charset=utf-8`、content-length 2692、last-modified 2026-11-05 01:03:36 GMT |
| `x-frame-options` | なし |
| `content-security-policy` (frame-ancestors) | なし |
| `access-control-allow-origin` | `*` |
| `cache-control` | `max-age=600` |
| twitter:card / title | `player` / `Code Defender` |
| twitter:player | `https://goofmint.github.io/code-defender/` |
| twitter:player:width / height | 640 / 360 |
| twitter:image | `https://goofmint.github.io/code-defender/twitter-card.png` |
| twitter:site | 未設定 (X アカウント未確定のため意図的に未設定) |
| og:* (type, url, title, image, image:width/height 1280x720, site_name, locale ja_JP) | 配信 HTML とワークツリーの index.html で一致 |
| 配信 HTML と index.html の meta 差分 | なし (twitter:* / og:* の行を比較して一致) |
| `GET /twitter-card.png` | HTTP/2 200、`content-type: image/png`、content-length 53878 バイト |
| JS `/code-defender/assets/index-BOEVluZJ.js` | 200 `application/javascript` |
| CSS `/code-defender/assets/index-XIIXC3xm.css` | 200 `text/css` |
| favicon `/code-defender/favicon.svg` | 200 `image/svg+xml` |
| iframe 描画の確認 | 未検証 (ブラウザ未使用) |
| 640x360 でのレスポンシブ確認 | 未検証 (ブラウザ未使用) |

補足: X-Frame-Options / CSP ヘッダーが無いことは iframe 埋め込みが技術的に妨げられないことを示すだけで、X 側が Player Card として受け入れるかどうかは別問題である。

## Phase 2: 検証マトリクス (すべて未検証)

環境ごとに次の項目を記録する。列は環境、行は確認項目。

| 確認項目 | x.com デスクトップブラウザ | x.com モバイルブラウザ | iOS アプリ | Android アプリ |
| --- | --- | --- | --- | --- |
| カードのプレビュー種別 (player / summary_large_image / リンクのみ) | 未検証 | 未検証 | 未検証 | 未検証 |
| 投稿内での起動 (再生ボタン等からゲームが開始する) | 未検証 | 未検証 | 未検証 | 未検証 |
| 入力: ポインター長押し移動 | 未検証 | 未検証 | 未検証 | 未検証 |
| 入力: タップ攻撃 | 未検証 | 未検証 | 未検証 | 未検証 |
| クリック後のキーボードフォーカス | 未検証 | 未検証 | 未検証 | 未検証 |
| 矢印キー / WASD | 未検証 | 未検証 | 未検証 | 未検証 |
| SPACE | 未検証 | 未検証 | 未検証 | 未検証 |
| 1 から 3 | 未検証 | 未検証 | 未検証 | 未検証 |
| Q / E / R / F | 未検証 | 未検証 | 未検証 | 未検証 |
| Z / X | 未検証 | 未検証 | 未検証 | 未検証 |
| V / B / N | 未検証 | 未検証 | 未検証 | 未検証 |
| G / H | 未検証 | 未検証 | 未検証 | 未検証 |
| 4 から 9 / 0 | 未検証 | 未検証 | 未検証 | 未検証 |
| ページスクロールの副作用 | 未検証 | 未検証 | 未検証 | 未検証 |
| 初回タップの誤動作 | 未検証 | 未検証 | 未検証 | 未検証 |
| HUD の可読性 | 未検証 | 未検証 | 未検証 | 未検証 |
| ボタンのタップ | 未検証 | 未検証 | 未検証 | 未検証 |
| ゲームオーバー後 1000 ms 経過後のタップでの再開 | 未検証 | 未検証 | 未検証 | 未検証 |
| ゲームオーバー後 1000 ms 経過後の ENTER での再開 | 未検証 | 未検証 | 未検証 | 未検証 |
| フォールバック: リンクからゲーム本体を開ける | 未検証 | 未検証 | 未検証 | 未検証 |

## 人が実施する手順

1. 投稿に使うアカウントを選ぶ (検証用か本アカウントかを記録する)。
2. 投稿作成画面に `https://goofmint.github.io/code-defender/` を貼り付け、下書き時点のプレビュー種別を記録する。
3. 投稿する。
4. 投稿の URL を記録する。
5. マトリクスの 4 環境で、各項目を確認して結果を記入する。
6. 投稿を残すか削除するかを決め、理由とともに記録する。

記録欄:

- 使用アカウント: 未記入
- 下書き時のプレビュー種別: 未記入
- 投稿 URL: 未記入
- 残す / 削除の判断: 未記入

## 結論

未記入 (Phase 2 未実施)

## 後続タスク候補

(なし。Phase 2 の結果、問題が見つかった場合にここへ追記する。)
