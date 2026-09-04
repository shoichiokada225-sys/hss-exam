/* hss-exam「後で見直す（後回し）」機能のE2E検証。ローカルサーバに対してのみ実行。
   本体はIIFEで内部変数を公開していないため、すべてUI操作とlocalStorage経由で検証する。
   B/Cパートは「デモでも進行保存する」ように2行だけ書き換えた検証用コピー(ポート8846)を使い、
   保存・復元コードパス(fl配列)を実際に通す。 */
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE || "http://127.0.0.1:8845";
const TESTBASE = process.env.TESTBASE || "http://127.0.0.1:8846";
const results = [];
const ok = (name, cond, extra = "") => results.push(`${cond ? "PASS" : "FAIL"} : ${name}${extra ? " -> " + extra : ""}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
});
const errs = [];
let page;
async function freshPage() {
  // 試験中はbeforeunloadで離脱警告が出て遷移がブロックされるため、区切りごとにページを作り直す
  if (page) { await page.close({ runBeforeUnload: false }); }
  page = await browser.newPage();
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message.slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE: " + m.text().slice(0, 200)); });
  page.on("dialog", (d) => d.accept().catch(() => {}));
}
await freshPage();

const txt = (sel) => page.$eval(sel, (e) => e.textContent.trim());
const vis = (sel) => page.$eval(sel, (e) => getComputedStyle(e).display !== "none");
const disabled = (sel) => page.$eval(sel, (e) => e.disabled);
const qnum = async () => parseInt((await txt("#step-current")).split("/")[0].trim(), 10);

async function startDemo(base) {
  await freshPage();
  await page.goto(base + "/index.html", { waitUntil: "domcontentloaded" });
  await wait(800);
  await page.evaluate(() => localStorage.removeItem("hss_progress_v1"));
  await page.goto(base + "/index.html", { waitUntil: "domcontentloaded" });
  await wait(1000);
  await page.click("#entry-demo");
  await wait(700);
  await page.type("#exam-password", "123");
  await page.click("#password-submit-btn");
  await wait(400);
  await page.type("#exam-player-name", "テスト 太郎");
  await page.click("#exam-start-btn");
  await wait(700);
}

// ---------- A. 基本動作（実ファイル・デモ5問） ----------
await startDemo(BASE);

ok("デモ開始で問題1が表示", (await qnum()) === 1);
ok("未回答・未マークでは「次へ」が押せない", await disabled("#next-btn"));
ok("未回答時にヒント文が出る", (await txt("#flag-hint")).length > 5);
ok("マーク0件では見直しバー非表示", !(await vis("#flag-bar")));

await page.click("#flag-btn");
await wait(250);
ok("マーク後は未回答でも「次へ」が押せる", !(await disabled("#next-btn")));
ok("マーク後はボタン表記が解除用に変わる", (await txt("#flag-btn")).includes("外す"));
ok("aria-pressed が true になる", (await page.$eval("#flag-btn", (e) => e.getAttribute("aria-pressed"))) === "true");
ok("見直しバーが表示される", await vis("#flag-bar"));
ok("バーに1問と表示される", (await txt("#flag-bar-text")).includes("1"));
ok("マークが自分1問だけならジャンプボタンは隠れる", !(await vis("#flag-jump-btn")));
ok("進捗ドットにflagged印が付く", await page.$eval("#dot-0", (e) => e.classList.contains("flagged")));
ok("マーク中はヒントを出さない", (await txt("#flag-hint")) === "");

await page.click("#next-btn");
await wait(350);
ok("未回答のまま問題2へ進める", (await qnum()) === 2);
await page.click(".option-btn");
await wait(250);
ok("回答済みなら「次へ」有効", !(await disabled("#next-btn")));
ok("問題2のボタンは未マーク表記", (await txt("#flag-btn")).includes("後で見直す"));
ok("他問題にいるときはジャンプボタン表示", await vis("#flag-jump-btn"));

await page.click("#flag-jump-btn");
await wait(350);
ok("ジャンプでマーク済みの問題1に戻る", (await qnum()) === 1);
ok("戻った問題は未回答のまま", await page.$$eval(".option-btn", (bs) => bs.every((b) => !b.classList.contains("selected"))));

await page.click("#flag-btn");
await wait(250);
ok("マーク解除で「次へ」が再び無効", await disabled("#next-btn"));
ok("マーク0件でバーが消える", !(await vis("#flag-bar")));
ok("解除でドットのflagged印も消える", !(await page.$eval("#dot-0", (e) => e.classList.contains("flagged"))));

await page.keyboard.press("f");
await wait(250);
ok("キーボードFでマークできる", await page.$eval("#dot-0", (e) => e.classList.contains("flagged")));
await page.keyboard.press("f");
await wait(250);
ok("キーボードFで解除できる", !(await page.$eval("#dot-0", (e) => e.classList.contains("flagged"))));

for (const [lang, word] of [["vi", "Xem l"], ["id", "Tinjau"], ["en", "Review later"], ["ja", "後で見直す"]]) {
  await page.select("#lang-selector", lang);
  await wait(450);
  ok(`言語 ${lang} でボタン文言が切り替わる`, (await txt("#flag-btn")).includes(word));
}

// 問題1をマーク（未回答）にしたまま、最終問題まで進んで終了確認を開く
await page.click("#flag-btn");
await wait(250);
await page.click("#next-btn");
await wait(350);
for (let i = 2; i <= 5; i++) {
  const already = await page.$$eval(".option-btn", (bs) => bs.some((b) => b.classList.contains("selected")));
  if (!already) { await page.click(".option-btn"); await wait(200); }
  if (i < 5) { await page.click("#next-btn"); await wait(350); }
}
ok("最終問題まで到達", (await qnum()) === 5);
await page.click("#next-btn");
await wait(450);
const fs1 = await page.$eval("#finish-summary", (e) => e.textContent);
ok("終了確認に未回答の警告が出る", fs1.includes("未回答"), fs1);
ok("終了確認に見直しマークの残数が出る", fs1.includes("見直しマーク"), fs1);
await page.click("#finish-no");
await wait(450);
ok("「戻って見直す」でマーク済みの問題へ移動する", (await qnum()) === 1);
ok("移動先でマークが維持されている", (await txt("#flag-btn")).includes("外す"));

// ---------- B. 中断→再開でマークが保持されるか（検証用コピー） ----------
await startDemo(TESTBASE);
await page.click("#flag-btn");                    // 問題1をマーク
await wait(250);
await page.click("#next-btn");
await wait(350);
await page.click(".option-btn");                  // 問題2は回答
await wait(250);
await page.click("#next-btn");
await wait(350);
await page.click("#flag-btn");                    // 問題3もマーク
await wait(400);

const saved = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("hss_progress_v1") || "null");
  return raw ? { hasFl: Array.isArray(raw.fl), n: (raw.fl || []).filter(Boolean).length, len: (raw.fl || []).length, total: raw.ua.length, cur: raw.cur } : null;
});
ok("進行保存にマーク配列が含まれる", !!saved && saved.hasFl && saved.n === 2 && saved.len === saved.total, JSON.stringify(saved));

await page.reload({ waitUntil: "domcontentloaded" });
await wait(1500);
const resumeShown = await page.$eval("#resume-overlay", (e) => e.classList.contains("show"));
ok("リロード後に再開確認が出る", resumeShown);
if (resumeShown) {
  await page.click("#resume-btn");
  await wait(800);
  ok("再開後もマーク数2がバーに出る", (await txt("#flag-bar-text")).includes("2"));
  ok("再開後もドット1がflagged", await page.$eval("#dot-0", (e) => e.classList.contains("flagged")));
  ok("再開後もドット3がflagged", await page.$eval("#dot-2", (e) => e.classList.contains("flagged")));
  ok("再開後にドット2はflaggedでない", !(await page.$eval("#dot-1", (e) => e.classList.contains("flagged"))));
}

// ---------- C. わざと壊す（保存データ改ざん耐性） ----------
// 試験中のページはunload時にsaveProgressで上書きするため、必ず「再開確認だけ出ている状態」で改ざんする
async function corruptAndResume(mutate) {
  await freshPage();
  await page.goto(TESTBASE + "/index.html", { waitUntil: "domcontentloaded" });
  await wait(1500);                       // 再開確認が出るまで待つ（この状態では自動保存が走らない）
  await page.evaluate((fn) => {
    const raw = JSON.parse(localStorage.getItem("hss_progress_v1"));
    new Function("raw", fn)(raw);         // 改ざん内容をページ側で適用
    localStorage.setItem("hss_progress_v1", JSON.stringify(raw));
  }, mutate);
  await page.reload({ waitUntil: "domcontentloaded" });
  await wait(1500);
  await page.click("#resume-btn");
  await wait(900);
}

await corruptAndResume("raw.fl = [true, true];");   // 長さ不一致の壊れたマーク配列
ok("壊れたマーク配列でも試験画面が出る", await page.$eval("#quiz-screen", (e) => e.classList.contains("active")));
ok("壊れたマーク配列は破棄されバー非表示", !(await vis("#flag-bar")), await txt("#flag-bar-text"));
ok("壊れたマーク配列でも回答は保持される", await page.$eval("#dot-1", (e) => e.classList.contains("answered")));

await corruptAndResume("delete raw.fl;");            // 旧バージョンの保存データ（flなし）
ok("旧バージョンの保存データ(flなし)でも再開できる", await page.$eval("#quiz-screen", (e) => e.classList.contains("active")));
ok("旧データ再開後もマーク操作ができる", await (async () => { await page.click("#flag-btn"); await wait(300); return vis("#flag-bar"); })());

await corruptAndResume("raw.fl = 'こわれた';");        // 配列ですらない値
ok("非配列のマークデータでも落ちない", await page.$eval("#quiz-screen", (e) => e.classList.contains("active")));
ok("非配列のマークデータはバー非表示", !(await vis("#flag-bar")));

ok("PAGEERROR/CONSOLE ERROR なし", errs.length === 0, errs.join(" | "));

await browser.close();
console.log(results.join("\n"));
const fail = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n合計 ${results.length}件 / FAIL ${fail}件`);
process.exit(fail ? 1 : 0);
