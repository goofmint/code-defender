# ゲームの説明

- 正常なコードはリリースまで通し、不正なコードは倒す。資金が{zeroFunds}{bankrupt}になると倒産
- マウスを押し続けると主人公がそこへ動く。主人公をクリックすると{range}px以内の不正なコードを攻撃
- キーボード: 矢印かWASDで移動、スペースで攻撃。右下のパッド: {up}{down}{left}{right}で移動、中央の{attack}で攻撃
- 開始前: エンジニアのランクを選んで色付きの床へ（1人以上で開始）。アイテムを選んで床をクリック（{points}pt）。×で取消。「{start}」
- 出現地点をクリック: 昇給・減給・休暇・復職・解雇とAIエージェント
- 休暇: 不正率-{vacationReduction}pt/回・最大-{vacationMax}pt・下限{vacationMin}%。効果は復帰後も維持。給与は継続、休暇中は生産停止
- 右上のエンジニア: 雇用（最大{maxEngineers}人）。給料は月末に払う
- AIエージェント: 出力ペースが上がる。安いほど不正なコードが混ざりやすい。月額
- 右上のアイテム: 資金で買い、主人公の位置に置く。{levelUpDays}日ごとにレベルが上がり、使えるアイテムが増える
- 右上の開発バランス: ゲージの左が機能開発（売上）、右がリファクタリング（負債を返す）。{refactoring} {feature}で{step}%ずつ
- {daysIcon}経過日数 {fundsIcon}資金 {salesIcon}累計売上 {paymentIcon}次の月末に払う額
- 技術的負債: {normal}{normalMin}〜{normalMax} {caution}{cautionMin}〜{cautionMax} {critical}{criticalMin}〜{criticalMax}。{outage}を超えたまま{outageDays}日で大障害
