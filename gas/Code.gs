/**
 * HSS認定試験 - 結果記録Webhook（150人同時対応・堅牢版）
 * ============================================================
 * 【設計方針】
 *  - 受験ごとの個別メールは送らない（個人Gmailの100通/日上限を回避）
 *  - 結果は必ずスプレッドシートに記録（= 正本）。LockServiceで同時書込を直列化
 *  - 同じ送信は submissionId で重複排除（クライアント自動再送に対応）
 *  - クライアントは JSONP(doGet?action=verify) で「記録されたか」を確認し、
 *    未記録なら自動再送 → 取りこぼしゼロ
 *  - 管理者へは「1日1回のサマリーメール」だけ（時間主導トリガーで sendDailySummary を実行）
 *
 * 【セットアップ手順】
 *  1. Apps Script に貼り付け、ADMIN_EMAIL を確認
 *  2. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」
 *       実行するユーザー: 自分 / アクセスできるユーザー: 全員
 *     ※ コードを直したら必ず「デプロイを管理」→ 鉛筆 →「新バージョン」で再デプロイ
 *  3. デプロイURL（/exec）を config.js の webhookUrl に設定（変わらなければそのまま）
 *  4. 一度 doGet を実行 or ブラウザでURLを開き、初回の記録用スプレッドシートを自動作成
 *     （作成URLは実行ログとサマリーメールに出ます）
 *  5. 「トリガー」→ sendDailySummary を「日付ベースのタイマー / 毎日 20:00頃」で追加
 * ============================================================
 */

var ADMIN_EMAIL = "so@oikk.co.jp";
var SHEET_ID = ""; // 任意: 既存スプレッドシートID。空なら自動作成しIDを保存

// ---- 入力サニタイズ ----
function sanitize(val) {
  if (typeof val !== "string") return String(val == null ? "" : val);
  return val.replace(/[\r\n]/g, " ").substring(0, 500);
}

// ---- 記録用スプレッドシートを取得（standaloneでも動くようID永続化） ----
function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = SHEET_ID || props.getProperty("HSS_SHEET_ID");
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* 失われていたら作り直す */ }
  }
  // active（コンテナバインド）があれば優先
  var active = null;
  try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (active) { props.setProperty("HSS_SHEET_ID", active.getId()); return active; }
  // 新規作成
  var ss = SpreadsheetApp.create("HSS試験記録_" + new Date().getFullYear());
  props.setProperty("HSS_SHEET_ID", ss.getId());
  Logger.log("記録用スプレッドシートを作成: " + ss.getUrl());
  return ss;
}

function getSheet_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (sheetName === "受験意志確認") {
      sheet.appendRow(["氏名", "回答", "受験者日時", "言語", "ID", "サーバー受信時刻"]);
    } else {
      sheet.appendRow(["氏名", "受験者日時", "得点", "正答率", "合否", "所要時間", "時間切れ", "言語", "ID", "サーバー受信時刻"]);
    }
  }
  return sheet;
}

// ---- POST: 記録（メールは送らない） ----
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (!data || !data.type || !data.name || typeof data.name !== "string") {
      return jsonOut_({ status: "error", message: "Invalid input" });
    }
    var id = sanitize(data.submissionId || "");
    if (!id) id = data.type + "_" + sanitize(data.name) + "_" + new Date().getTime();

    var cache = CacheService.getScriptCache();
    // 既に記録済み（再送）なら何もせず ok を返す＝冪等
    if (cache.get("rec_" + id)) {
      return jsonOut_({ status: "ok", recorded: true, dup: true, id: id });
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(30000); // 同時書込を直列化（最大30秒待つ）
    try {
      // ロック取得後に再チェック（直前に他実行が記録した可能性）
      if (cache.get("rec_" + id)) {
        return jsonOut_({ status: "ok", recorded: true, dup: true, id: id });
      }
      var ss = getSpreadsheet_();
      var serverTime = formatDateTime_(new Date());

      if (data.type === "confirm") {
        var answerJa = data.answer === "yes" ? "はい" : "いいえ";
        getSheet_(ss, "受験意志確認").appendRow([
          sanitize(data.name), answerJa, sanitize(data.date), sanitize(data.lang), id, serverTime
        ]);
      } else if (data.type === "exam") {
        if (!Array.isArray(data.answers)) {
          return jsonOut_({ status: "error", message: "Invalid answers" });
        }
        getSheet_(ss, "本試験結果").appendRow([
          sanitize(data.name), sanitize(data.date),
          sanitize(String(data.score)) + "/" + sanitize(String(data.total)),
          sanitize(String(data.percentage)) + "%", sanitize(data.result),
          sanitize(data.elapsed), data.timedOut ? "はい" : "いいえ", sanitize(data.lang),
          id, serverTime
        ]);
        // 詳細回答は別シートに（任意・分析用）
        try {
          var dsheet = ss.getSheetByName("回答詳細");
          if (!dsheet) { dsheet = ss.insertSheet("回答詳細"); dsheet.appendRow(["ID", "氏名", "問番号", "カテゴリ", "問題", "回答", "正解", "正誤"]); }
          var rows = [];
          (data.answers || []).forEach(function(a) {
            var mark = sanitize(a.userAnswer) === "（未回答）" ? "未回答" : (a.correct ? "○" : "×");
            rows.push([id, sanitize(data.name), sanitize(String(a.num)), sanitize(a.category), sanitize(a.question), sanitize(a.userAnswer), sanitize(a.correctAnswer), mark]);
          });
          if (rows.length) dsheet.getRange(dsheet.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
        } catch (de) { Logger.log("詳細記録スキップ: " + de); }
      } else {
        return jsonOut_({ status: "error", message: "Unknown type" });
      }

      cache.put("rec_" + id, "1", 21600); // 6時間 重複排除＆verify用
      return jsonOut_({ status: "ok", recorded: true, id: id });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    Logger.log("doPost error: " + error);
    return jsonOut_({ status: "error", message: String(error) });
  }
}

// ---- GET: ヘルスチェック / 記録確認(JSONP) ----
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === "verify") {
    var id = sanitize(p.id || "");
    var recorded = isRecorded_(id);
    return jsonpOut_(p.callback, { recorded: recorded, id: id });
  }
  return jsonOut_({ status: "ok", service: "HSS Exam Webhook" });
}

function isRecorded_(id) {
  if (!id) return false;
  if (CacheService.getScriptCache().get("rec_" + id)) return true;
  // キャッシュ失効後の保険：シートのID列を検索
  try {
    var ss = getSpreadsheet_();
    var names = ["本試験結果", "受験意志確認"];
    for (var i = 0; i < names.length; i++) {
      var sh = ss.getSheetByName(names[i]);
      if (sh && sh.createTextFinder(id).findNext()) return true;
    }
  } catch (e) {}
  return false;
}

// ---- 日次サマリーメール（時間主導トリガーで毎日実行） ----
function sendDailySummary() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("本試験結果");
  var today = formatDate_(new Date());
  var pass = 0, fail = 0, total = 0;
  var lines = [];
  if (sheet && sheet.getLastRow() > 1) {
    var values = sheet.getDataRange().getValues();
    for (var r = 1; r < values.length; r++) {
      var serverTime = String(values[r][9] || "");
      if (serverTime.indexOf(today) !== 0) continue; // サーバー受信日が今日のものだけ
      total++;
      var result = String(values[r][4] || "");
      if (result.indexOf("合格") === 0 && result.indexOf("不合格") !== 0) pass++; else fail++;
      lines.push("・" + values[r][0] + "　" + values[r][2] + "（" + values[r][3] + "）" + result);
    }
  }
  var body = "HSS認定 本試験 日次サマリー（" + today + "）\n";
  body += "================================\n\n";
  body += "本日の受験者数: " + total + " 名\n";
  body += "合格: " + pass + " 名 / 不合格: " + fail + " 名\n\n";
  body += "--- 一覧 ---\n" + (lines.length ? lines.join("\n") : "（本日の受験はありません）") + "\n\n";
  body += "詳細はスプレッドシートをご確認ください:\n" + ss.getUrl() + "\n";
  MailApp.sendEmail({ to: ADMIN_EMAIL, subject: "【HSS認定試験】日次サマリー " + today + "（受験" + total + "名）", body: body });
}

// ---- ユーティリティ ----
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function jsonpOut_(callback, obj) {
  var cb = (callback || "callback").replace(/[^a-zA-Z0-9_$.]/g, "");
  return ContentService.createTextOutput(cb + "(" + JSON.stringify(obj) + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function pad2_(n) { return (n < 10 ? "0" : "") + n; }
function formatDate_(d) { return d.getFullYear() + "/" + pad2_(d.getMonth() + 1) + "/" + pad2_(d.getDate()); }
function formatDateTime_(d) { return formatDate_(d) + " " + pad2_(d.getHours()) + ":" + pad2_(d.getMinutes()) + ":" + pad2_(d.getSeconds()); }
