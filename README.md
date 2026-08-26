# HSS認定試験アプリ

株式会社ヒラノ HSS認定制度の試験アプリケーション（PWA）

## 機能

### 1. 受験意志確認
- パスワード不要
- 氏名入力 → 「はい」で回答
- 結果を管理者へ自動メール送信

### 2. 本試験
- パスワード認証（SHA-256ハッシュ）
- 問題プール79問から60問を出題（四択形式）
  - Word（本試験）由来の10問は毎回必ず全問出題
  - Excel（セットA）由来の69問から50問をランダム出題
  - 出題順・選択肢の並びは受験ごとにシャッフル
- 制限時間60分（タイマー表示、時間超過で強制終了）
- 未回答は不正解扱い
- **終了確認ゲート**: 最終問で「提出する」を押しても即送信されず、確認ダイアログで「試験を終了する」を押して初めて採点・送信する。「戻って見直す」で何度でも見直せる（時間切れのみ強制終了）
- **受験者には結果を表示しない**: 合否・正答率・振り返りは出さず「試験終了しました。お疲れ様でした。」のみ。採点結果は管理者へ送信する
- **離脱検知**: 試験中に他アプリ・他タブへ移動すると回数と秒数を記録し、復帰時に警告バナーを出して管理者へ送信する（3秒未満は通知・誤タップとみなし記録しない／Wake Lockで自動画面ロックによる誤検知を抑止）
- 結果を自動メール送信（改ざん防止）
- Excel結果レポート生成

### 3. デモ問題（練習用・旧 hss-exam-demo を統合）
- 本試験とは別プールの固定5問・制限時間5分
- パスワード `123`（`config.js` の `demo.requirePassword` を `false` にすると不要になる）
- 終了後に**正答率・合否・カテゴリ別成績・正解と解説**を表示する（本試験と逆の扱い）
- 結果はどこにも送信しない
- 終了確認ゲートと離脱検知は本試験と同じく動作する（警告文言は「送信しない」版）

### 4. 共通機能
- PWA（ホーム画面に追加可能）
- 4言語対応（日本語・英語・ベトナム語・インドネシア語）
- ダークモード
- レスポンシブデザイン
- QRコード配布ページ

## セットアップ

### 1. GitHub Pagesにデプロイ

```bash
# リポジトリ作成
gh repo create hss-exam --public --source=. --push

# GitHub Pages有効化
# Settings → Pages → Source: main branch
```

### 2. Google Apps Script Webhook設定

1. [Google Apps Script](https://script.google.com) で新しいプロジェクトを作成
2. `gas/Code.gs` の内容を貼り付け
3. `ADMIN_EMAIL` を変更
4. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」
   - 実行: 自分
   - アクセス: 全員
5. デプロイURLをコピー
6. `config.js` の `webhookUrl` に設定

### 3. 設定変更

#### パスワード変更
ブラウザのコンソールで:
```javascript
async function hash(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
}
hash('新しいパスワード').then(console.log);
```
出力されたハッシュを `config.js` の `passwordHash` に設定。

デフォルトパスワード: `hss2024`

#### 問題の追加・編集
`data/questions.json` を編集。各問題の構造:
```json
{
  "question": "日本語の問題文",
  "answer": "正解（optionsの中の1つと完全一致）",
  "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
  "category": "カテゴリ名",
  "explanation": "解説",
  "source": "setA-1.0",
  "en":  { "question": "...", "options": [...] },
  "vi":  { "question": "...", "options": [...] },
  "ind": { "question": "...", "options": [...] }
}
```

- `source` が `honshiken` で始まる問題は Word（本試験）由来として毎回必出。それ以外は Excel（セットA）プール扱い
- 各言語ブロックは `question` と `options` のみを持つ。`answer` / `explanation` は翻訳せず日本語にフォールバックする（`index.html` の `getQ()`）
- 各言語の `options` は**日本語 `options` と同じ順序・同じ要素数**であること。表示はインデックス対応（`q[lang].options[origIdx]`）のため、順序がずれると別の選択肢が表示される
- ベトナム語は声調記号を必ず付ける（ASCII化しない）
- カテゴリは次の7種: 繁殖・分娩／子豚・育成／衛生・防疫／飼料・栄養／飼養環境・施設／肉豚・出荷・肉／経営理念・行動規範

#### デモ問題の設定
`config.js` の `demo` セクションで変更する:
- `enabled`: `false` にするとホーム画面からデモのカードが消える
- `requirePassword`: `false` にするとパスワードなしでデモを開放する
- `passwordHash`: デモ用パスワードのSHA-256（既定は `123`）
- `questionsFile` / `timeLimit` / `passRate`

デモの問題は `data/demo-questions.json`（本試験の `data/questions.json` とは別プール・重複0件）。
`explanation` は結果画面にそのまま表示されるため、デモでは必ず記入する。

#### その他の設定
`config.js` で以下を変更可能:
- 出題数、制限時間、合格基準
- メール設定（送信先、件名テンプレート）
- 会社名・制度名
- アプリURL

## ファイル構成

```
hss-exam/
├── index.html          # メインアプリ（全画面統合）
├── config.js           # 設定ファイル（パスワード、メール等）
├── manifest.json       # PWAマニフェスト
├── sw.js               # Service Worker
├── qr.html             # QRコード配布ページ
├── data/
│   ├── questions.json  # 本試験の問題データ（79問、4言語）
│   ├── demo-questions.json  # デモ問題の問題データ（固定5問、4言語、解説つき）
│   └── questions_backup_*.json  # 過去バージョンのバックアップ
├── icons/
│   ├── icon.svg        # SVGアイコン
│   ├── icon-192.png    # PWAアイコン 192x192
│   ├── icon-512.png    # PWAアイコン 512x512
│   └── generate-icons.html  # アイコン生成ツール
├── gas/
│   ├── Code.gs         # Google Apps Script webhook
│   └── DEPLOY.md       # GASデプロイ手順
├── handbook/           # 養豚基礎ハンドブック（PDF閲覧ページ）
├── validate_questions.py  # 問題データの検証（データ整合性）
├── verify_logic.js        # 出題・採点ロジックのシミュレーション検証
├── build_questions.py     # 問題データ生成スクリプト
├── build_from_edited.py   # 編集済みデータからの再ビルド
├── add_en.py              # 英語訳の付与スクリプト
└── README.md
```

## 本番試験の当日運用（重要）

PWAはcache-first方式のため、**デプロイ直後の1回目の起動では旧版が表示され、2回目の起動から新版になる**。試験当日に確実に新版で受験させるため:

1. デプロイ後、管理者自身の端末で**最低2回起動**して新版を目視確認する（sw.jsの`CACHE_NAME`はデプロイの度にインクリメントする）
2. 受験者への事前案内に「**試験前日までに、電波のある場所でアプリを1度開いて閉じておく**」を含める
3. 試験官が立ち会う場合は、開始直前に「一度アプリを完全に閉じて、開き直してから始める」よう指示する
4. iOSではホーム画面の**アイコン画像だけはインストール時のまま固定**される（アプリの中身は更新される）。アイコンを最新にするには再インストールが必要だが、必須ではない
5. **index.html を変更してデプロイしたら、sw.js の `CACHE_NAME` も必ずインクリメントする**（新SWが制御を握った時点でアプリが自動リロードして新版を即反映する仕組みを入れてあるが、CACHE_NAMEが同じだと更新検出が曖昧になる）
6. **結果の監視体制を決めてから実施する**: 結果はスプレッドシートに記録されるだけで、管理者への能動通知（メール等）は存在しない（日次サマリーは2026-08-03に停止済み）。試験当日は (a)管理者がシートを開いて監視する、または (b)試験期間中だけGASの `installDailyTrigger` を再開する、のどちらかを事前に決めること。「受験したのに誰も結果を見ていない」が最大の運用事故

### セキュリティ上の既知の限界（運用でカバーする前提）
- `data/questions.json` は静的公開のため、技術知識があれば正解込みで直接閲覧できる（静的サイトの構造的限界）。試験官の立会い・離脱記録・問題プールの拡充で緩和する
- 離脱検知はタブが「非表示」になった場合のみ反応する。**PC上で2窓を並べる・タブレットの画面分割は検知できない**。別端末での検索も検知不能。真の防止は試験官の目視のみ
- 採点はクライアント側のため改ざんの完全防止は不可。GAS側で`answers`から得点を再計算し「検算」列に不一致を記録する仕組みで素朴な改ざんは検出できる

## 検証

問題データやロジックを変更したら、コミット前に両方を実行する（ビルド工程・依存パッケージは不要）。

```bash
python validate_questions.py   # データ整合性（終了コード 0=PASS / 1=FAIL）
node verify_logic.js           # 出題ルール1000回試行 + 全問の採点ロジック
```

`validate_questions.py` は出題数・カテゴリ・多言語フィールド・選択肢の対応・ベトナム語の声調記号などを検査する。
出題数の期待値は `config.js` の `questionsPerTest` / `excelRandomCount` から読み取るため、設定を変えれば検証もそれに追随する。

## 技術仕様

- フロントエンド: Vanilla HTML/CSS/JavaScript（フレームワーク不使用）
- メール送信: Google Apps Script Webhook（改ざん防止）
- Excel生成: SheetJS (xlsx.js) CDN
- QRコード: qrcode-generator CDN
- 認証: クライアントサイドSHA-256ハッシュ比較
