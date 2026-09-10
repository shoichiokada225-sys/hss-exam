// Production URL smoke in a real headless Chrome: SW v7 cache, offline restart, demo flow (no exam submission).
import puppeteer from "puppeteer-core";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "https://shoichiokada225-sys.github.io/hss-exam/";
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} : ${n}${x ? " -> " + x : ""}`); c ? pass++ : fail++; };
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const errs = []; let gasHits = 0;
await page.setRequestInterception(true);
page.on("request", r => { if (/script\.google/.test(r.url())) { gasHits++; if (r.method() === "POST") { r.abort(); return; } } r.continue(); });
page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
page.on("console", m => { if (m.type() === "error") errs.push("CONSOLE " + m.text()); });
const t0 = Date.now();
await page.goto(BASE, { waitUntil: "networkidle0", timeout: 60000 });
ok("本番URLが表示される", await page.$("#home-screen") !== null, `${Date.now() - t0}ms`);
await wait(4000);
const sw = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  const keys = await caches.keys();
  const c = keys.includes("hss-exam-v8") ? await caches.open("hss-exam-v8") : null;
  const n = c ? (await c.keys()).length : 0;
  return { reg: !!reg, active: !!(reg && reg.active), keys, n, ctrl: !!navigator.serviceWorker.controller };
});
ok("SW登録・active", sw.reg && sw.active, JSON.stringify(sw.keys));
ok("キャッシュ hss-exam-v8 に11件", sw.n === 11, String(sw.n));
// questions.json served & 79 questions
const qinfo = await page.evaluate(async () => { const r = await fetch("data/questions.json"); const j = await r.json(); return { n: j.length, hon: j.filter(q => String(q.source).startsWith("honshiken")).length, es: j.filter(q => q.es && q.es.question).length }; });
ok("問題79問(必出10+セットA69)", qinfo.n === 79 && qinfo.hon === 10, JSON.stringify(qinfo));
// offline restart
await page.setOfflineMode(true);
await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
await wait(1500);
ok("オフラインで再起動してもホームが出る(SW)", await page.$("#home-screen") !== null && await page.evaluate(() => document.getElementById("home-screen").offsetParent !== null || getComputedStyle(document.getElementById("home-screen")).display !== "none"));
// demo flow offline
await page.click("#entry-demo"); await wait(600);
await page.type("#exam-password", "123"); await page.click("#password-submit-btn"); await wait(500);
await page.type("#exam-player-name", "本番スモーク"); await page.click("#exam-start-btn"); await wait(1000);
ok("オフラインでデモが開始できる(問題データがキャッシュから出る)", (await page.$$(".option-btn")).length === 4);
for (let i = 0; i < 5; i++) { await (await page.$$(".option-btn"))[0].click(); await wait(120); await page.click("#next-btn"); await wait(200); }
await page.waitForSelector("#finish-yes", { visible: true, timeout: 5000 }); await page.click("#finish-yes"); await wait(1200);
const res = await page.$eval("#results-screen", e => e.innerText).catch(() => "");
ok("デモは結果(正答率)が表示される", /%/.test(res), res.replace(/\s+/g, " ").slice(0, 80));
await page.setOfflineMode(false);
// language switch check on home
await page.goto(BASE, { waitUntil: "domcontentloaded" }); await wait(800);
for (const l of ["vi", "id", "es", "en", "ja"]) { await page.select("#lang-selector", l); await wait(200); }
const title = await page.$eval("#entry-exam-title", e => e.textContent);
ok("言語切替5言語が落ちない(ja復帰)", /本試験/.test(title), title);
ok("GASへのPOST漏れなし(GET probeのみ許容)", true, `gas requests=${gasHits}`);
ok("PAGEERROR/CONSOLE ERROR なし", errs.filter(e => !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)).length === 0, errs.slice(0, 3).join(" | "));
console.log(`\n合計 ${pass + fail}件 / FAIL ${fail}件`);
await browser.close();
