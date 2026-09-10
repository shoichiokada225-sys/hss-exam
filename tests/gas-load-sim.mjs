// Simulates N real clients running index.html's reliableSubmit() protocol against the production GAS.
// Timing constants copied from index.html: probe(6s timeout) -> jitter -> [POST -> wait 1500+attempt*500 -> verify(6s timeout) -> backoff min(2^attempt s, 8s)] x6
// IDs are prefixed test_conn_ so purgeTestRows() removes them.  usage: node gasclient-sim.mjs <N> <jitterMaxMs>
const URL_ = "https://script.google.com/macros/s/AKfycbx68TlMXd0nUJ7jzmP5SEcGA0psrzdwDNjE0NcTyZBbzhSqGWUF2ZHESkliBJZRGaKNNw/exec";
const N = Number(process.argv[2] || 10), JIT = Number(process.argv[3] || 180000);
const tag = Date.now(); const pad = n => String(n).padStart(2, "0"); const d = new Date();
const dateStr = `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const delay = ms => new Promise(r => setTimeout(r, ms));
function payload(i) {
  const answers = Array.from({ length: 60 }, (_, k) => ({ num: k+1, category: "衛生・防疫", question: `負荷テスト問${k+1}`, userAnswer: "a", correctAnswer: "a", correct: true }));
  return { type: "exam", name: `負荷テスト${i}`, date: dateStr, score: 60, total: 60, percentage: 100, passRate: 70, result: "合格", timeLimit: 60,
    elapsed: "60分00秒", timedOut: true, lang: "ja", awayCount: 0, awaySeconds: 0, awayDetail: "", answers, submissionId: `test_conn_${tag}_${i}` };
}
async function post(p) { const t0 = Date.now(); try { const r = await fetch(URL_, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(p) }); const b = (await r.text()).slice(0, 60); return { ms: Date.now()-t0, b }; } catch (e) { return { ms: Date.now()-t0, b: "ERR " + String(e).slice(0, 40) }; } }
async function verify(id) { // 6s client timeout
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 25000); const t0 = Date.now();
  try { const r = await fetch(`${URL_}?action=verify&id=${encodeURIComponent(id)}&callback=cb`, { signal: ac.signal }); const x = await r.text(); return { ok: /"recorded":true/.test(x), ms: Date.now()-t0 }; }
  catch (e) { return { ok: false, ms: Date.now()-t0, to: true }; } finally { clearTimeout(t); }
}
async function client(i) {
  const p = payload(i); const t0 = Date.now(); const log = [];
  const probe = await verify("__probe__");
  if (probe.to) { const r = await post(p); return { i, ok: false, unverified: true, attempts: 1, ms: Date.now()-t0, log: [`probe-timeout post=${r.ms}ms ${r.b}`] }; }
  await delay(Math.floor(Math.random() * JIT));
  for (let a = 1; a <= 12; a++) {
    const r = await post(p); log.push(`a${a} post=${r.ms}ms ${r.b.replace(/"id":"[^"]+"/, "")}`);
    await delay(1500 + a*500);
    const v = await verify(p.submissionId); log.push(`  verify=${v.ms}ms ${v.ok ? "REC" : (v.to ? "TIMEOUT" : "no")}`);
    if (v.ok) return { i, ok: true, attempts: a, ms: Date.now()-t0, log };
    await delay(Math.min(1000 * 2 ** a, 20000));
  }
  return { i, ok: false, attempts: 12, ms: Date.now()-t0, log };
}
const T0 = Date.now();
const rs = await Promise.all(Array.from({ length: N }, (_, i) => client(i)));
const wall = Date.now() - T0;
const okc = rs.filter(r => r.ok).length, unv = rs.filter(r => r.unverified).length, failed = rs.filter(r => !r.ok && !r.unverified).length;
const att = {}; rs.forEach(r => { att[r.attempts] = (att[r.attempts]||0)+1; });
const times = rs.filter(r => r.ok).map(r => r.ms).sort((a,b)=>a-b);
console.log(`N=${N} jitter=${JIT}ms wall=${wall}ms  ✅=${okc}  ⚠failed(6回)=${failed}  unverified(probe timeout)=${unv}`);
console.log(`attempts histogram: ${JSON.stringify(att)}   time-to-✅ p50=${times[Math.floor(times.length/2)]} p90=${times[Math.floor(times.length*0.9)]} max=${times[times.length-1]}`);
for (const r of rs.filter(r => !r.ok || r.attempts > 1).slice(0, 25)) console.log(`client${r.i} ok=${r.ok} attempts=${r.attempts} ${r.ms}ms\n   ` + r.log.join("\n   "));
// final: were all ids recorded (server side), regardless of what the client saw?
await delay(3000);
let rec = 0; const q = rs.slice();
await Promise.all(Array.from({ length: 4 }, async () => { while (q.length) { const r = q.shift(); const v = await verify(`test_conn_${tag}_${r.i}`); if (v.ok) rec++; else console.log(`  SERVER MISSING: client${r.i}`); } }));
console.log(`server-side recorded: ${rec}/${N}`);
