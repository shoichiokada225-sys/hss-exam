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
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (data.type === "confirm") {
      handleConfirmation(data);
    } else if (data.type === "exam") {
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
  var answerJa = data.answer === "yes" ? "はい" : "いいえ";
  var subject = "【HSS認定試験】受験意志確認 - " + data.name;

  var body = "HSS認定試験 受験意志確認\n";
  body += "================================\n\n";
  body += "氏名: " + data.name + "\n";
  body += "回答: " + answerJa + "\n";
  body += "日時: " + data.date + "\n";
  body += "言語: " + data.lang + "\n";
  body += "\n================================\n";
  body += "※ このメールはHSS認定試験アプリから自動送信されています。\n";

  MailApp.sendEmail({
    to: ADMIN_EMAIL,
    subject: subject,
    body: body
  });

  // スプレッドシートにも記録（オプション）
  logToSheet("受験意志確認", [data.name, answerJa, data.date, data.lang]);
}

/**
 * 試験結果の処理
 */
function handleExamResult(data) {
  var subject = "【HSS認定試験】結果通知 - " + data.name + " - " + data.result;

  var body = "HSS認定 本試験 結果報告\n";
  body += "================================\n\n";
  body += "受験者名: " + data.name + "\n";
  body += "受験日時: " + data.date + "\n";
  body += "所要時間: " + data.elapsed + (data.timedOut ? "（時間切れ）" : "") + "\n\n";
  body += "得点: " + data.score + " / " + data.total + "（" + data.percentage + "%）\n";
  body += "合否: " + data.result + "（合格基準: " + data.passRate + "%以上）\n";
  body += "制限時間: " + data.timeLimit + "分\n\n";

  body += "--- 回答詳細 ---\n";
  if (data.answers && data.answers.length > 0) {
    data.answers.forEach(function(a) {
      var mark = a.userAnswer === "（未回答）" ? "[未回答]" : (a.correct ? "[○]" : "[×]");
      body += mark + " 問" + a.num + "（" + a.category + "）: 「" + a.userAnswer + "」正解「" + a.correctAnswer + "」\n";
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
    data.name, data.date, data.score + "/" + data.total,
    data.percentage + "%", data.result, data.elapsed,
    data.timedOut ? "はい" : "いいえ", data.lang
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
