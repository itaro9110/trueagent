// TrueAgent smoke test — boots the server on a test port and runs the full
// demo flow end to end: status -> quote -> 402 check -> mock-pay brief
// (real Gemini call) -> public log -> MCP tools/list -> agent card.
// Usage: GEMINI_API_KEY=... node scripts/smoke-test.mjs
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  ok ? pass++ : fail++;
}

async function jfetch(path, opts = {}) {
  const res = await fetch(BASE + path, { headers: { "Content-Type": "application/json" }, ...opts });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: res.status, headers: res.headers, json, text };
}

const server = spawn("node", ["src/server.js"], {
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1" },
  cwd: new URL("..", import.meta.url).pathname,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (d) => process.stdout.write("[server] " + d));
server.stderr.on("data", (d) => process.stdout.write("[server:err] " + d));

try {
  // Wait for the server to answer.
  let up = false;
  for (let i = 0; i < 20 && !up; i++) {
    try { const r = await fetch(BASE + "/api/status"); up = r.ok; } catch { await wait(500); }
  }
  check("server boots", up);
  if (!up) throw new Error("server did not boot");

  const status = await jfetch("/api/status");
  check("GET /api/status", status.status === 200 && status.json.agent === "TrueAgent", `price=${status.json?.price}, gemini=${status.json?.geminiConfigured}`);

  const ui = await fetch(BASE + "/");
  check("GET / demo UI", ui.ok && (await ui.text()).includes("TrueAgent"));

  const card = await jfetch("/.well-known/agent-card.json");
  check("GET /.well-known/agent-card.json", card.status === 200 && card.json.name === "TrueAgent");
  const cardApi = await jfetch("/api/agent-card");
  check("GET /api/agent-card (hash)", cardApi.status === 200 && /^[0-9a-f]{64}$/.test(cardApi.json.sha256), cardApi.json?.sha256?.slice(0, 16));

  const quote = await jfetch("/api/quote", { method: "POST", body: JSON.stringify({ topic: "What is Concordium's Agent Registry?" }) });
  check("POST /api/quote", quote.status === 201 && quote.json.job?.id, `job=${quote.json?.job?.id?.slice(0, 8)}`);
  const jobId = quote.json?.job?.id;

  const unpaid = await jfetch("/api/brief", { method: "POST", body: JSON.stringify({ jobId }) });
  check("POST /api/brief unpaid -> 402", unpaid.status === 402 && unpaid.json.error === "payment_required", `PAYMENT-REQUIRED header: ${unpaid.headers.get("payment-required") ? "present" : "MISSING"}`);

  if (!process.env.GEMINI_API_KEY) {
    console.log("SKIP  mock-pay brief — GEMINI_API_KEY not set");
  } else {
    const t0 = Date.now();
    const brief = await jfetch("/api/brief", {
      method: "POST",
      headers: { "X-PAYMENT": JSON.stringify({ mock: true }) },
      body: JSON.stringify({ jobId }),
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const ok = brief.status === 200 && brief.json.brief?.keyPoints?.length >= 3 && brief.json.receipt?.briefHash;
    check("POST /api/brief mock-paid -> brief + receipt", ok, `${secs}s, model=${brief.json?.brief ? "ok" : "?"}, keyPoints=${brief.json?.brief?.keyPoints?.length ?? 0}, sources=${brief.json?.brief?.sources?.length ?? 0}`);
    if (ok) {
      console.log("  title:", brief.json.brief.title);
      console.log("  summary:", brief.json.brief.summary.slice(0, 160));
      console.log("  receipt tx:", brief.json.receipt.txHash, "| briefHash:", brief.json.receipt.briefHash.slice(0, 16) + "…");
    }
    const again = await jfetch("/api/brief", { method: "POST", body: JSON.stringify({ jobId }) });
    check("POST /api/brief delivered job -> cached", again.status === 200 && again.json.cached === true);
  }

  const log = await jfetch("/api/jobs");
  check("GET /api/jobs public log", log.status === 200 && Array.isArray(log.json.jobs) && log.json.jobs.length >= 1);

  const mcp = await jfetch("/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
  check("POST /mcp tools/list", mcp.status === 200 && mcp.json.result?.tools?.length === 2, mcp.json?.result?.tools?.map((t) => t.name).join(", "));

  const mcpQuote = await jfetch("/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "trueagent_request_brief", arguments: { topic: "What is x402?" } } }) });
  check("POST /mcp tools/call trueagent_request_brief", mcpQuote.status === 200 && JSON.parse(mcpQuote.json.result.content[0].text).jobId, "job created via MCP");
} catch (e) {
  check("smoke run", false, e.message);
} finally {
  server.kill("SIGTERM");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
