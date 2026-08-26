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
  if (typeof val !== "string") val = String(val == null ? "" : val);
  var s = val.replace(/[\r\n\t]/g, " ").substring(0, 500);
  // 数式インジェクション対策(CWE-1236): =,+,-,@ で始まるセル値はシングルクォートを前置して無害化
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
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

var EXAM_HEADER = ["氏名", "受験者日時", "得点", "正答率", "合否", "所要時間", "時間切れ", "言語", "ID", "サーバー受信時刻", "離脱回数", "離脱秒数", "離脱内訳", "検算"];

// クライアント申告の得点を answers[].correct から独立に再集計して照合する。
// 完全な改ざん検知ではない(フラグ自体も偽装可能)が、score だけを書き換える素朴な改ざんを検出できる。
function verifyScore_(data) {
  try {
    if (!Array.isArray(data.answers)) return "検算不能";
    var recount = 0;
    data.answers.forEach(function (a) { if (a && a.correct === true) recount++; });
    var claimed = Number(data.score);
    var total = Number(data.total);
    var claimedPct = Number(data.percentage);
    var recountPct = total > 0 ? Math.round((recount / total) * 100) : 0;
    if (claimed === recount && claimedPct === recountPct && data.answers.length === total) return "OK";
    return "不一致(申告" + claimed + "/" + claimedPct + "% 再計算" + recount + "/" + recountPct + "% 件数" + data.answers.length + ")";
  } catch (e) { return "検算エラー"; }
}

function getSheet_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (sheetName === "受験意志確認") {
      sheet.appendRow(["氏名", "回答", "受験者日時", "言語", "ID", "サーバー受信時刻"]);
    } else {
      sheet.appendRow(EXAM_HEADER);
    }
  }
  return sheet;
}

// 既存シートに離脱記録の列見出しを後付けする（既存行は空欄のまま・並びは不変）
function ensureExamHeader_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol >= EXAM_HEADER.length) return;
  var missing = EXAM_HEADER.slice(lastCol);
  sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
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
    // ロック待ち超過は例外にせずbusyとして安全に返す（クライアントはverify NGで自動リトライ/次回再送する）
    try {
      lock.waitLock(30000); // 同時書込を直列化（最大30秒待つ）
    } catch (busyErr) {
      return jsonOut_({ status: "busy" });
    }
    try {
      // ロック取得後に再チェック（直前に他実行が記録した可能性）
      if (cache.get("rec_" + id)) {
        return jsonOut_({ status: "ok", recorded: true, dup: true, id: id });
      }
      var ss = getSpreadsheet_();
      var serverTime = formatDateTime_(new Date());

      if (data.type === "confirm") {
        var answerJa = data.answer === "yes" ? "はい" : "いいえ";
        var csheet = getSheet_(ss, "受験意志確認");
        // 同一人物の重複送信を検知してフラグ列に記録（名簿突合の手作業を減らす。行の上書きはしない）
        var dupNote = "";
        try {
          if (csheet.getLastColumn() < 7) csheet.getRange(1, 7).setValue("重複");
          var lastRow = csheet.getLastRow();
          if (lastRow > 1) {
            var vals = csheet.getRange(2, 1, lastRow - 1, 3).getValues(); // 氏名/回答/受験者日時
            var name = sanitize(data.name);
            var day = String(sanitize(data.date)).split(" ")[0]; // "YYYY/MM/DD"部分
            var hits = vals.filter(function (r) { return String(r[0]) === name && String(r[2]).indexOf(day) === 0; }).length;
            if (hits > 0) dupNote = "同名同日" + (hits + 1) + "回目";
          }
        } catch (dupErr) { /* 検知失敗しても記録自体は続行 */ }
        csheet.appendRow([
          sanitize(data.name), answerJa, sanitize(data.date), sanitize(data.lang), id, serverTime, dupNote
        ]);
      } else if (data.type === "exam") {
        if (!Array.isArray(data.answers)) {
          return jsonOut_({ status: "error", message: "Invalid answers" });
        }
        var examSheet = getSheet_(ss, "本試験結果");
        ensureExamHeader_(examSheet);
        examSheet.appendRow([
          sanitize(data.name), sanitize(data.date),
          sanitize(String(data.score)) + "/" + sanitize(String(data.total)),
          sanitize(String(data.percentage)) + "%", sanitize(data.result),
          sanitize(data.elapsed), data.timedOut ? "はい" : "いいえ", sanitize(data.lang),
          id, serverTime,
          Number(data.awayCount) || 0, Number(data.awaySeconds) || 0, sanitize(data.awayDetail),
          verifyScore_(data)
        ]);
        // 詳細回答は別シートに（任意・分析用）
        try {
          var dsheet = ss.getSheetByName("回答詳細");
          if (!dsheet) { dsheet = ss.insertSheet("回答詳細"); dsheet.appendRow(["ID", "氏名", "問番号", "カテゴリ", "問題", "回答", "正解", "正誤"]); }
          // 不正解・未回答のみ記録する（正解行は得点列と冗長で、書込量を1/4程度に抑えて
          // 時間切れ組の一斉送信時のロック保持時間を短縮するため）
          var rows = [];
          (data.answers || []).forEach(function(a) {
            if (a.correct === true) return;
            var mark = sanitize(a.userAnswer) === "（未回答）" ? "未回答" : "×";
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
    // getDisplayValues: appendRowで書いた日時文字列はシート側で日付型セルに自動変換されるため、
    // getValues()だとDateオブジェクトが返り文字列比較が常に不一致になる（受験者0名バグの原因）
    var values = sheet.getDataRange().getDisplayValues();
    for (var r = 1; r < values.length; r++) {
      if (dayPrefix_(values[r][9]) !== today) continue; // サーバー受信日が今日のものだけ
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

// ---- 記録シートの名前を正す＆中身点検（文字化け修正用・1回実行） ----
function cleanupSheets() {
  var ss = getSpreadsheet_();
  ss.rename("HSS試験記録_" + new Date().getFullYear());
  getSheet_(ss, "本試験結果");
  getSheet_(ss, "回答詳細");
  getSheet_(ss, "受験意志確認");
  Logger.log("スプレッドシート名: " + ss.getName());
  Logger.log("URL: " + ss.getUrl());
  ss.getSheets().forEach(function (sh) {
    Logger.log("タブ「" + sh.getName() + "」 行数=" + sh.getLastRow());
  });
}

// ---- 接続テスト/サンプル行(test_conn_*, sample_*)を削除（1回実行） ----
function purgeTestRows() {
  var ss = getSpreadsheet_();
  var targets = [{ name: "本試験結果", idCol: 9 }, { name: "回答詳細", idCol: 1 }, { name: "受験意志確認", idCol: 5 }];
  var removed = 0;
  targets.forEach(function (t) {
    var sh = ss.getSheetByName(t.name);
    if (!sh) return;
    var data = sh.getDataRange().getValues();
    for (var r = data.length - 1; r >= 1; r--) {
      var v = String(data[r][t.idCol - 1] || "");
      if (v.indexOf("test_conn_") === 0 || v.indexOf("sample_") === 0) { sh.deleteRow(r + 1); removed++; }
    }
  });
  Logger.log("削除したテスト行数: " + removed);
}

// ---- 日次サマリーを停止（トリガー削除・エディタで1回実行） ----
// 2026-08-03 社長判断: 日次サマリーメールは不要のため配信停止。
// 再開したい場合のみ installDailyTrigger() を実行すること。
function uninstallDailyTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "sendDailySummary") { ScriptApp.deleteTrigger(t); removed++; }
  });
  Logger.log("削除したトリガー数: " + removed + "（0なら既に停止済み）");
}

// ---- 日次サマリーの自動実行トリガーを設置（※現在は停止中。再開時のみ実行） ----
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "sendDailySummary") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendDailySummary").timeBased().everyDays(1).atHour(20).create();
  Logger.log("日次サマリートリガーを設置しました（毎日20時台に sendDailySummary を実行）");
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
// セルの表示文字列から YYYY/MM/DD を取り出す（"2026/6/10 12:26" のような0埋めなし表示にも対応）
function dayPrefix_(v) {
  var m = String(v || "").match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  return m ? m[1] + "/" + pad2_(Number(m[2])) + "/" + pad2_(Number(m[3])) : "";
}
function formatDate_(d) { return d.getFullYear() + "/" + pad2_(d.getMonth() + 1) + "/" + pad2_(d.getDate()); }
function formatDateTime_(d) { return formatDate_(d) + " " + pad2_(d.getHours()) + ":" + pad2_(d.getMinutes()) + ":" + pad2_(d.getSeconds()); }
