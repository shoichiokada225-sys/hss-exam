/**
 * HSS認定試験 設定ファイル
 * ============================================================
 * このファイルを編集して、試験の設定を変更できます。
 * パスワードを変更する場合は、SHA-256ハッシュ値を設定してください。
 *
 * ハッシュ生成方法（ブラウザのコンソールで実行）:
 *   async function hash(pw) {
 *     const buf = await crypto.subtle.digest('SHA-256',
 *       new TextEncoder().encode(pw));
 *     return [...new Uint8Array(buf)]
 *       .map(b => b.toString(16).padStart(2,'0')).join('');
 *   }
 *   hash('新しいパスワード').then(console.log);
 *
 * または bash:
 *   echo -n "新しいパスワード" | sha256sum
 * ============================================================
 */
var CONFIG = {
  // === パスワード（SHA-256ハッシュ） ===
  // デフォルト: "hss2024"
  passwordHash: "36467b08e2c583be2bca6926160e9fd6ab4da836dc97146c82f422dea7119101",

  // === メール設定 ===
  email: {
    // Google Apps Script Web App URL（デプロイ後に設定）
    webhookUrl: "",
    // 管理者メールアドレス（GAS側でも設定）
    adminEmail: "so@oikk.co.jp",
    // メール件名テンプレート
    subjectExam: "【HSS認定試験】結果通知 - {name}",
    subjectConfirm: "【HSS認定試験】受験意志確認 - {name}",
  },

  // === 試験設定 ===
  test: {
    questionsPerTest: 60,   // 1回の試験で出題する問題数
    timeLimit: 60,          // 制限時間（分）
    passRate: 70,           // 合格基準（%）
  },

  // === 会社情報 ===
  company: {
    name: "株式会社ヒラノ",
    system: "HSS認定制度",
    examTitle: "HSS認定 本試験",
  },

  // === QRコード配布URL ===
  // GitHub Pages等にデプロイ後、実際のURLに変更してください
  appUrl: "https://shoichiokada225-sys.github.io/hss-exam/",
};
