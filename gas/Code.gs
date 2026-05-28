/**
 * HSS認定試験 - Google Apps Script メール送信Webhook
 * ============================================================
 *
 * セットアップ手順:
 * 1. Google Apps Script (https://script.google.com) で新しいプロジェクトを作成
 * 2. このコードを貼り付ける
 * 3. ADMIN_EMAIL を管理者のメールアドレスに変更
 * 4. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」を選択
 *    - 説明: HSS Exam Webhook
 *    - 実行するユーザー: 自分
 *    - アクセスできるユーザー: 全員
 * 5. デプロイURLをコピーして config.js の webhookUrl に設定
 *
 * ============================================================
 */

// === 設定 ===
var ADMIN_EMAIL = "so@oikk.co.jp";

/**
 * POSTリクエストを処理
 */
function sanitize(val) {
  if (typeof val !== "string") return String(val || "");
  return val.replace(/[\r\n]/g, " ").substring(0, 500);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Input validation
    if (!data || !data.type || !data.name || typeof data.name !== "string") {
      return ContentService.createTextOutput(JSON.stringify({status: "error", message: "Invalid input"}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.type === "confirm") {
      handleConfirmation(data);
    } else if (data.type === "exam") {
      if (!Array.isArray(data.answers)) {
        return ContentService.createTextOutput(JSON.stringify({status: "error", message: "Invalid answers"}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      handleExamResult(data);
    }

    return ContentService.createTextOutput(JSON.stringify({status: "ok"}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log("Error: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * GETリクエスト（ヘルスチェック用）
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({status: "ok", service: "HSS Exam Webhook"}))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 受験意志確認の処理
 */
function handleConfirmation(data) {
  var name = sanitize(data.name);
  var answerJa = data.answer === "yes" ? "はい" : "いいえ";
  var subject = "【HSS認定試験】受験意志確認 - " + name;

  var body = "HSS認定試験 受験意志確認\n";
  body += "================================\n\n";
  body += "氏名: " + name + "\n";
  body += "回答: " + answerJa + "\n";
  body += "日時: " + sanitize(data.date) + "\n";
  body += "言語: " + sanitize(data.lang) + "\n";
  body += "\n================================\n";
  body += "※ このメールはHSS認定試験アプリから自動送信されています。\n";

  MailApp.sendEmail({
    to: ADMIN_EMAIL,
    subject: subject,
    body: body
  });

  // スプレッドシートにも記録（オプション）
  logToSheet("受験意志確認", [name, answerJa, sanitize(data.date), sanitize(data.lang)]);
}

/**
 * 試験結果の処理
 */
function handleExamResult(data) {
  var name = sanitize(data.name);
  var result = sanitize(data.result);
  var subject = "【HSS認定試験】結果通知 - " + name + " - " + result;

  var body = "HSS認定 本試験 結果報告\n";
  body += "================================\n\n";
  body += "受験者名: " + name + "\n";
  body += "受験日時: " + sanitize(data.date) + "\n";
  body += "所要時間: " + sanitize(data.elapsed) + (data.timedOut ? "（時間切れ）" : "") + "\n\n";
  body += "得点: " + sanitize(String(data.score)) + " / " + sanitize(String(data.total)) + "（" + sanitize(String(data.percentage)) + "%）\n";
  body += "合否: " + result + "（合格基準: " + sanitize(String(data.passRate)) + "%以上）\n";
  body += "制限時間: " + sanitize(String(data.timeLimit)) + "分\n\n";

  body += "--- 回答詳細 ---\n";
  if (data.answers && data.answers.length > 0) {
    data.answers.forEach(function(a) {
      var userAns = sanitize(a.userAnswer);
      var mark = userAns === "（未回答）" ? "[未回答]" : (a.correct ? "[○]" : "[×]");
      body += mark + " 問" + sanitize(String(a.num)) + "（" + sanitize(a.category) + "）: 「" + userAns + "」正解「" + sanitize(a.correctAnswer) + "」\n";
    });
  }
  body += "\n================================\n";
  body += "※ このメールはHSS認定試験アプリから自動送信されています。\n";

  MailApp.sendEmail({
    to: ADMIN_EMAIL,
    subject: subject,
    body: body
  });

  // スプレッドシートにも記録
  logToSheet("本試験結果", [
    name, sanitize(data.date), sanitize(String(data.score)) + "/" + sanitize(String(data.total)),
    sanitize(String(data.percentage)) + "%", result, sanitize(data.elapsed),
    data.timedOut ? "はい" : "いいえ", sanitize(data.lang)
  ]);
}

/**
 * スプレッドシートにログ記録（オプション）
 * 初回実行時にスプレッドシートが自動作成されます
 */
function logToSheet(sheetName, rowData) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      // スプレッドシートが紐づいていない場合はスキップ
      return;
    }
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      if (sheetName === "受験意志確認") {
        sheet.appendRow(["氏名", "回答", "日時", "言語"]);
      } else {
        sheet.appendRow(["氏名", "日時", "得点", "正答率", "合否", "所要時間", "時間切れ", "言語"]);
      }
    }
    sheet.appendRow(rowData);
  } catch (e) {
    Logger.log("Sheet log error: " + e.toString());
  }
}
