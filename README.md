# HSS認定試験アプリ

株式会社ヒラノ HSS認定制度の試験アプリケーション（PWA）

## 機能

### 1. 受験意志確認
- パスワード不要
- 氏名入力 → 「はい／いいえ」で回答
- 結果を管理者へ自動メール送信

### 2. 本試験
- パスワード認証（SHA-256ハッシュ）
- 80問から60問をランダム出題（四択形式）
- 制限時間60分（タイマー表示、時間超過で強制終了）
- 未回答は不正解扱い
- 結果を自動メール送信（改ざん防止）
- Excel結果レポート生成

### 3. 共通機能
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
  "en": { "question": "...", "answer": "...", "options": [...], "explanation": "..." },
  "vi": { "question": "...", "answer": "...", "options": [...], "explanation": "..." },
  "ind": { "question": "...", "answer": "...", "options": [...], "explanation": "..." }
}
```

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
│   └── questions.json  # 問題データ（80問、4言語）
├── icons/
│   ├── icon.svg        # SVGアイコン
│   ├── icon-192.png    # PWAアイコン 192x192
│   ├── icon-512.png    # PWAアイコン 512x512
│   └── generate-icons.html  # アイコン生成ツール
├── gas/
│   └── Code.gs         # Google Apps Script webhook
└── README.md
```

## 技術仕様

- フロントエンド: Vanilla HTML/CSS/JavaScript（フレームワーク不使用）
- メール送信: Google Apps Script Webhook（改ざん防止）
- Excel生成: SheetJS (xlsx.js) CDN
- QRコード: qrcode-generator CDN
- 認証: クライアントサイドSHA-256ハッシュ比較
