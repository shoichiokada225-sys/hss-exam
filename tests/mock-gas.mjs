// Mock GAS webhook for client-behaviour tests. Port 8850.
// Control: GET /ctl?mode=normal|slow|busy2|down|verifydown&delay=ms   GET /log -> JSON log   GET /reset
import http from "node:http";
const state = { mode: "normal", delay: 0, records: new Set(), posts: {}, log: [] };
const now = () => new Date().toISOString().slice(11, 23);
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (u.pathname === "/ctl") { state.mode = u.searchParams.get("mode") || "normal"; state.delay = Number(u.searchParams.get("delay") || 0); res.end("ok " + state.mode); return; }
  if (u.pathname === "/log") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ mode: state.mode, records: [...state.records], posts: state.posts, log: state.log })); return; }
  if (u.pathname === "/reset") { state.records.clear(); state.posts = {}; state.log = []; res.end("reset"); return; }
  if (req.method === "POST") {
    let body = ""; for await (const c of req) body += c;
    let id = "?", type = "?"; try { const d = JSON.parse(body); id = d.submissionId; type = d.type; } catch {}
    state.posts[id] = (state.posts[id] || 0) + 1;
    state.log.push({ t: now(), kind: "POST", id, type, n: state.posts[id], mode: state.mode });
    if (state.mode === "down") { res.statusCode = 500; res.end("down"); return; }
    if (state.delay) await new Promise(r => setTimeout(r, state.delay));
    if (state.mode === "busy2" && state.posts[id] <= 2) { res.end(JSON.stringify({ status: "busy" })); return; }
    state.records.add(id);
    // GAS-like: 302 to a different host is not reproducible locally; return 200 JSON (client uses no-cors and ignores body)
    res.end(JSON.stringify({ status: "ok", recorded: true, id }));
    return;
  }
  if (u.searchParams.get("action") === "verify") {
    const id = u.searchParams.get("id"), cb = (u.searchParams.get("callback") || "cb").replace(/[^\w$.]/g, "");
    state.log.push({ t: now(), kind: "VERIFY", id, mode: state.mode });
    if (state.mode === "down" || state.mode === "verifydown") { res.statusCode = 500; res.end("down"); return; }
    if (state.delay) await new Promise(r => setTimeout(r, Math.min(state.delay, 5000)));
    res.setHeader("Content-Type", "application/javascript");
    res.end(`${cb}(${JSON.stringify({ recorded: state.records.has(id), id })})`);
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ status: "ok", service: "mock", version: "mock" }));
}).listen(8850, "127.0.0.1", () => console.log("mock gas on 8850"));
