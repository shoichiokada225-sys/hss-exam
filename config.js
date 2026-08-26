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
  passwordHash: "354948ef61d10149fa91ad1bf6a8676f94e7d6f2b0f7d1920797b8fbe56b3c81",

  // === メール設定 ===
  email: {
    // Google Apps Script Web App URL（デプロイ後に設定）
    webhookUrl: "https://script.google.com/macros/s/AKfycbx68TlMXd0nUJ7jzmP5SEcGA0psrzdwDNjE0NcTyZBbzhSqGWUF2ZHESkliBJZRGaKNNw/exec",
    // 管理者メールアドレス（GAS側でも設定）
    adminEmail: "so@oikk.co.jp",
    // メール件名テンプレート
    subjectExam: "【HSS認定試験】結果通知 - {name}",
    subjectConfirm: "【HSS認定試験】受験意志確認 - {name}",
  },

  // === 試験設定 ===
  test: {
    questionsPerTest: 60,   // 1回の試験で出題する問題数（Word本試験10問 + Excel50問 = 60問）
    excelRandomCount: 50,   // Excel(セットA69問)からランダム出題する数。Word(本試験)10問は必ず全問出題される
    timeLimit: 60,          // 制限時間（分）
    passRate: 70,           // 合格基準（%）
  },

  // === デモ問題（練習用・旧hss-exam-demoを統合） ===
  // 本試験とは別プールの固定5問。結果はどこにも送信せず、終了後に正解と解説を表示する。
  demo: {
    enabled: true,
    // デモ用パスワード（SHA-256ハッシュ）: 123
    // パスワード不要で開放したい場合は requirePassword を false にする
    requirePassword: true,
    passwordHash: "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
    questionsFile: "data/demo-questions.json",
    questionCount: 5,       // 問題数（UI表示用。demo-questions.jsonの問題数と一致させる）
    timeLimit: 5,           // 制限時間（分）
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
