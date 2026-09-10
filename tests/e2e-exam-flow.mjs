// Real-exam flow E2E against local testcopy (8846) with mock GAS (8850).
// Safety: any request to script.google.com is aborted by request interception.
import puppeteer from "puppeteer-core";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://127.0.0.1:8846";
const MOCK = "http://127.0.0.1:8850";
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"} : ${name}${extra ? " -> " + extra : ""}`); cond ? pass++ : fail++; };
const ctl = (mode, delay = 0) => fetch(`${MOCK}/ctl?mode=${mode}&delay=${delay}`).then(r => r.text());
const mlog = () => fetch(`${MOCK}/log`).then(r => r.json());
const reset = () => fetch(`${MOCK}/reset`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new",
  defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });
const errs = [];
let page, leaked = 0;
async function freshPage() {
  if (page) await page.close({ runBeforeUnload: false });
  page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (r) => { if (/script\.google/.test(r.url())) { leaked++; r.abort(); } else r.continue(); });
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/net::ERR|8850|Failed to load resource/.test(m.text())) errs.push("CONSOLE " + m.text()); });
  page.on("dialog", (d) => d.accept());
}
async function cleanStart() {
  await freshPage();
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    localStorage.clear();
    const ks = await caches.keys(); for (const k of ks) await caches.delete(k);
    const rs = await navigator.serviceWorker.getRegistrations(); for (const r of rs) await r.unregister();
  });
  await page.goto(BASE + "/index.html?x=" + Date.now(), { waitUntil: "domcontentloaded" });
  await wait(1200);
}
async function startExam(name = "負荷 太郎") {
  await page.click("#entry-exam"); await wait(600);
  await page.type("#exam-password", "123");
  await page.click("#password-submit-btn"); await wait(500);
  await page.type("#exam-player-name", name);
  await page.click("#exam-start-btn"); await wait(900);
}
async function answerAll() {
  for (let i = 0; i < 60; i++) {
    await page.waitForSelector(".option-btn", { timeout: 5000 });
    const btns = await page.$$(".option-btn");
    await btns[i % btns.length].click(); await wait(120);
    await page.click("#next-btn"); await wait(150);
  }
}
async function finishAndWait(maxMs) {
  await page.waitForSelector("#finish-yes", { visible: true, timeout: 5000 });
  await page.click("#finish-yes");
  const t0 = Date.now();
  let txt = "";
  while (Date.now() - t0 < maxMs) {
    await wait(500);
    txt = await page.$eval("#submit-notice", (el) => el.textContent).catch(() => "");
    const okc = await page.$eval("#submit-notice", (el) => el.classList.contains("sent-ok")).catch(() => false);
    if (okc || /⚠/.test(txt)) return { txt, ok: okc, ms: Date.now() - t0 };
  }
  return { txt, ok: false, ms: Date.now() - t0, timeout: true };
}
const pendingLen = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("hss_pending_v1") || "[]").length; } catch { return -1; } });
const shown = (sel) => page.$eval(sel, (el) => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden" && (el.offsetParent !== null || s.position === "fixed"); }).catch(() => false);

// ---------- S0: config sanity ----------
await cleanStart();
const cfg = await page.evaluate(() => ({ url: CONFIG.email.webhookUrl, n: CONFIG.test.questionsPerTest }));
ok("testcopy webhook はモックを向いている", cfg.url.startsWith(MOCK), cfg.url);

// ---------- S1: normal ----------
await reset(); await ctl("normal");
await cleanStart(); await startExam();
const qn = await page.$eval("#progress-label", (el) => el.textContent).catch(() => "");
ok("本試験が開始され問題が出る", (await page.$$(".option-btn")).length === 4, qn);
const cnt = await page.evaluate(() => document.querySelectorAll("#step-dots .step-dot, #step-dots > *").length);
ok("出題数60", cnt === 60, String(cnt));
await answerAll();
let r = await finishAndWait(30000);
ok("S1 正常: ✅送信済みになる", r.ok, `${r.ms}ms "${r.txt}"`);
let L = await mlog();
ok("S1 サーバー記録は1件・POSTは1回", L.records.length === 1 && Object.values(L.posts)[0] === 1, JSON.stringify(L.posts));
ok("S1 pendingが空になる", (await pendingLen()) === 0);
ok("S1 結果(合否/点数)が受験者に見えない", !/合格|不合格|%/.test(await page.$eval("#results-screen", (e) => e.innerText).catch(() => "")));

// ---------- S2: slow server (12s per POST, verify 5s) ----------
await reset(); await ctl("slow", 12000);
await cleanStart(); await startExam("遅延 花子"); await answerAll();
r = await finishAndWait(90000);
L = await mlog();
ok("S2 遅いGAS(12秒): 最終的に✅", r.ok, `${r.ms}ms`);
ok("S2 記録1件・POST回数", L.records.length === 1, JSON.stringify(L.posts));

// ---------- S3: busy on first 2 POSTs ----------
await reset(); await ctl("busy2");
await cleanStart(); await startExam("混雑 次郎"); await answerAll();
r = await finishAndWait(120000);
L = await mlog();
ok("S3 busy×2後に✅", r.ok, `${r.ms}ms`);
ok("S3 記録1件・同一IDで再送(POST=3)", L.records.length === 1 && Object.values(L.posts)[0] === 3, JSON.stringify(L.posts));

// ---------- S4: server down -> manual notice -> later relaunch resends ----------
await reset(); await ctl("down");
await cleanStart(); await startExam("圏外 三郎"); await answerAll();
r = await finishAndWait(150000);
ok("S4 GAS停止: ✅と偽らず⚠が出る", !r.ok && /⚠/.test(r.txt), `${r.ms}ms "${r.txt.slice(0, 60)}"`);
ok("S4 手動送信ボタンが出る", await shown("#submit-btn"));
ok("S4 pendingが1件残る", (await pendingLen()) === 1);
L = await mlog();
const postsDown = Object.values(L.posts)[0] || 0;
ok("S4 停止中のPOST回数は1回(probe失敗→1回送信)", postsDown === 1, String(postsDown));
await ctl("normal");
await page.goto(BASE + "/index.html?y=" + Date.now(), { waitUntil: "domcontentloaded" });
let t0 = Date.now(), pl = 1;
while (Date.now() - t0 < 30000 && pl !== 0) { await wait(1000); pl = await pendingLen(); }
L = await mlog();
ok("S4 復旧後の再起動で自動再送→記録1件・pending 0", pl === 0 && L.records.length === 1, JSON.stringify(L.posts));
const resumeShown = await shown("#resume-overlay");
ok("S4 送信後の再起動で再開ダイアログは出ない(進行が消えている)", !resumeShown);

// ---------- S5: mid-exam reload -> resume ----------
await reset(); await ctl("normal");
await cleanStart(); await startExam("再開 四郎");
for (let i = 0; i < 10; i++) { await (await page.$$(".option-btn"))[0].click(); await wait(100); await page.click("#next-btn"); await wait(120); }
await page.goto(BASE + "/index.html?z=" + Date.now(), { waitUntil: "domcontentloaded" }); await wait(1200);
ok("S5 リロード後に再開ダイアログ", await shown("#resume-overlay"));
await page.click("#resume-btn"); await wait(800);
const lbl = await page.$eval("#step-current", (el) => el.textContent).catch(() => "");
ok("S5 再開後は11問目付近", /11/.test(lbl), lbl);
ok("S5 再開時に送信は発生していない", Object.keys((await mlog()).posts).length === 0);

// ---------- S6: verify endpoint down but POST works -> unverified, then resend later (dedupe by id) ----------
await reset(); await ctl("verifydown");
await cleanStart(); await startExam("検証不能 五郎"); await answerAll();
r = await finishAndWait(60000);
ok("S6 verify不能: ✅と偽らない", !r.ok, `"${r.txt.slice(0, 50)}"`);
await ctl("normal");
await page.goto(BASE + "/index.html?w=" + Date.now(), { waitUntil: "domcontentloaded" });
t0 = Date.now(); pl = 1;
while (Date.now() - t0 < 30000 && pl !== 0) { await wait(1000); pl = await pendingLen(); }
L = await mlog();
ok("S6 再起動で再送され同一IDで記録1件(重複行なし)", pl === 0 && L.records.length === 1 && Object.keys(L.posts).length === 1, JSON.stringify(L.posts));


// ---------- S7: demo completion must not wipe a paused real exam (fix C) ----------
await reset(); await ctl("normal");
await cleanStart(); await startExam("保留 六郎");
for (let i = 0; i < 3; i++) { await (await page.$$(".option-btn"))[0].click(); await wait(100); await page.click("#next-btn"); await wait(120); }
await page.goto(BASE + "/index.html?s7=" + Date.now(), { waitUntil: "domcontentloaded" }); await wait(1200);
ok("S7 再開ダイアログが出る", await page.$eval("#resume-overlay", e => e.classList.contains("show")));
await page.click("#resume-later-btn"); await wait(500);
await page.click("#entry-demo"); await wait(500); await page.type("#exam-password", "123"); await page.click("#password-submit-btn"); await wait(400);
await page.type("#exam-player-name", "デモ人"); await page.click("#exam-start-btn"); await wait(900);
for (let i = 0; i < 5; i++) { await (await page.$$(".option-btn"))[0].click(); await wait(100); await page.click("#next-btn"); await wait(150); }
await page.waitForSelector("#finish-yes", { visible: true, timeout: 5000 }); await page.click("#finish-yes"); await wait(1000);
ok("S7 デモ終了後も本試験の進行データが残る", !!(await page.evaluate(() => localStorage.getItem("hss_progress_v1"))));
await page.click("#results-home-btn"); await wait(400); await page.click("#entry-exam"); await wait(600);
ok("S7 本試験を押すと再開ダイアログが出る(パスワード画面に落ちない)", await page.$eval("#resume-overlay", e => e.classList.contains("show")));
ok("S7 デモ完走で送信は発生しない", Object.keys((await mlog()).posts).length === 0);

// ---------- S8: localStorage throws (iOS Block All Cookies) -> app still interactive (fix D) ----------
await freshPage();
await page.evaluateOnNewDocument(() => { Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } }); });
await page.goto(BASE + "/index.html?s8=" + Date.now(), { waitUntil: "domcontentloaded" }); await wait(1200);
await page.click("#entry-demo").catch(() => {}); await wait(500);
ok("S8 localStorage例外でもデモカードが反応する(パスワード画面へ)", await page.$eval("#password-screen", e => getComputedStyle(e).display !== "none" && e.classList.contains("active") || e.offsetHeight > 0).catch(() => false));
await page.type("#exam-password", "123").catch(() => {}); await page.click("#password-submit-btn").catch(() => {}); await wait(400);
await page.type("#exam-player-name", "無保存").catch(() => {}); await page.click("#exam-start-btn").catch(() => {}); await wait(900);
ok("S8 localStorage例外でも試験画面が出る", (await page.$$(".option-btn")).length === 4);

// ---------- S9: home button hidden while sending, shown after (fix I) ----------
await reset(); await ctl("slow", 6000);
await cleanStart(); await startExam("送信中 七子"); await answerAll();
await page.waitForSelector("#finish-yes", { visible: true, timeout: 5000 }); await page.click("#finish-yes"); await wait(1500);
ok("S9 送信中はホームボタンが隠れる", (await page.$eval("#results-home-btn", e => getComputedStyle(e).display)) === "none");
let t9 = Date.now(), okc9 = false;
while (Date.now() - t9 < 40000 && !okc9) { await wait(500); okc9 = await page.$eval("#submit-notice", el => el.classList.contains("sent-ok")).catch(() => false); }
ok("S9 ✅後にホームボタンが戻る", okc9 && (await page.$eval("#results-home-btn", e => getComputedStyle(e).display)) !== "none");

ok("script.google.com への漏れ送信ゼロ", leaked === 0, String(leaked));
ok("PAGEERROR/CONSOLE ERROR なし", errs.length === 0, errs.slice(0, 3).join(" | "));
console.log(`\n合計 ${pass + fail}件 / FAIL ${fail}件`);
await browser.close();
process.exit(fail ? 1 : 0);
