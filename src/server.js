// TrueAgent — agent service (Node 22 stdlib HTTP, zero dependencies).
// Demo flow:  POST /api/quote {topic}        -> job + x402 payment requirements
//             POST /api/brief {jobId, X-PAYMENT} -> 402 if unpaid, else research + receipt
//             GET  /api/jobs                 -> public on-chain log
//             GET  /.well-known/agent-card.json, POST /mcp
// Run:  GEMINI_API_KEY=... node src/server.js   (default http://127.0.0.1:8787)
// Env:  PORT, GEMINI_API_KEY, AGENT_ADDRESS (testnet account), MOCK_PAYMENTS=true|false
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateBrief, sha256Hex } from "./gemini.js";
import { createJob, getJob, updateJob, listJobs, publicJob } from "./jobs.js";
import { paymentRequirements, paymentRequiredResponse, parsePaymentHeader, receiptHash } from "./x402.js";
import { verifyPayment, explorerTxUrl, mockTxHash, nodeReachable } from "./concordium.js";
import { checkAgent } from "./agentgate.js";
import { handleMcp } from "./mcp.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const PORT = Number(process.env.PORT ?? 8787);
// Default bind is 0.0.0.0 (not loopback) so the service is reachable when
// hosted (Render/Fly/Koyeb/...); override with HOST only for local-only runs.
const HOST = process.env.HOST ?? "0.0.0.0";

// ---- config (config.json + env overrides) ----
const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
config.agentAddress = process.env.AGENT_ADDRESS ?? config.agentAddress ?? null;
config.agentBadgeId = process.env.AGENT_BADGE_ID ?? config.agentBadgeId ?? null;
if (process.env.MOCK_PAYMENTS !== undefined) {
  config.mockPayments = process.env.MOCK_PAYMENTS !== "false";
}
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";

// Agent Card hash (ERC-8004: the card's SHA-256 is what gets committed on-chain
// at registry time so anyone can check the card was not altered).
const agentCardPath = join(PUBLIC, "agent-card.json");
const agentCardJson = JSON.parse(readFileSync(agentCardPath, "utf8"));
const agentCardHash = sha256Hex(JSON.stringify(agentCardJson));

// ---- tiny helpers ----
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
function send(res, status, obj, extraHeaders = {}) {
  const body = typeof obj === "string" ? obj : JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": typeof obj === "string" ? "text/plain" : "application/json", ...extraHeaders });
  res.end(body);
}
async function readJson(req, limit = 65536) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error("body too large");
    chunks.push(c);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

// Per-IP quote rate limit (20/min, in-memory).
const quoteHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const hits = (quoteHits.get(ip) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  quoteHits.set(ip, hits);
  return hits.length > 20;
}

// Cached AgentGate verdict (60s) so /api/status stays fast.
let badgeCache = { at: 0, value: null };
async function badgeVerdict() {
  const now = Date.now();
  if (now - badgeCache.at < 60_000 && badgeCache.value) return badgeCache.value;
  const id = config.agentBadgeId ?? config.agentAddress;
  const value = await checkAgent(id, config.network);
  badgeCache = { at: now, value };
  return value;
}

function publicReceipt(job) {
  return {
    jobId: job.id,
    topic: job.topic,
    price: job.priceLabel,
    txHash: job.txHash,
    explorerUrl: job.explorerUrl,
    briefHash: job.briefHash,
    receiptHash: receiptHash(job),
    settlement: job.settlement ?? null,
    agent: config.agentName,
    agentCardHash,
    registryUrl: config.registryApp,
    deliveredAt: job.deliveredAt,
  };
}

async function deliverBrief(job) {
  updateJob(job.id, { status: "working" });
  const { brief, model, grounding } = await generateBrief(job.topic, {
    apiKey: GEMINI_API_KEY,
    model: config.geminiModel,
    fallbackModel: config.geminiFallbackModel,
    timeoutMs: config.briefTimeoutMs,
  });
  const briefHash = sha256Hex(JSON.stringify(brief));
  const delivered = updateJob(job.id, {
    status: "delivered",
    brief,
    briefHash,
    model,
    grounding,
    deliveredAt: new Date().toISOString(),
  });
  return { brief, receipt: publicReceipt(delivered) };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    // ---- static demo UI ----
    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(readFileSync(join(PUBLIC, "index.html"), "utf8"));
    }
    if (req.method === "GET" && ["/app.js", "/styles.css", "/agent-card.json"].includes(path)) {
      const file = join(PUBLIC, path.slice(1));
      if (!existsSync(file)) return send(res, 404, { error: "not found" });
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
      return res.end(readFileSync(file));
    }
    if (req.method === "GET" && path === "/.well-known/agent-card.json") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" });
      return res.end(JSON.stringify(agentCardJson));
    }

    // ---- API: status ----
    if (req.method === "GET" && path === "/api/status") {
      const [badge, nodeOk] = await Promise.all([badgeVerdict(), nodeReachable(config)]);
      return send(res, 200, {
        agent: config.agentName,
        owner: config.owner,
        network: config.network,
        price: config.priceLabel,
        priceMicroCcd: config.priceMicroCcd,
        recipient: config.agentAddress,
        recipientExplorerUrl: config.agentAddress ? `${config.explorer}/accounts/${config.agentAddress}` : null,
        mockPayments: config.mockPayments,
        badgeRegistered: Boolean(config.agentBadgeId),
        badge,
        agentCardHash,
        agentCardUrl: config.agentCardPath,
        registryApp: config.registryApp,
        explorer: config.explorer,
        testnetNodeReachable: nodeOk,
        geminiConfigured: Boolean(GEMINI_API_KEY),
        geminiModel: config.geminiModel,
        jobs: listJobs().length,
      });
    }

    // ---- API: quote ----
    if (req.method === "POST" && path === "/api/quote") {
      const ip = req.socket.remoteAddress ?? "unknown";
      if (rateLimited(ip)) return send(res, 429, { error: "too many quotes, try again in a minute" });
      const body = await readJson(req);
      const topic = String(body.topic ?? "").trim();
      if (topic.length < 3 || topic.length > 200) {
        return send(res, 400, { error: "topic must be 3-200 characters" });
      }
      const job = createJob({ topic, priceMicroCcd: config.priceMicroCcd, priceLabel: config.priceLabel, recipient: config.agentAddress });
      return send(res, 201, {
        job: publicJob(job),
        paymentRequirements: paymentRequirements(job, config),
        payInstructions: config.agentAddress
          ? `Send ${config.priceLabel} to ${config.agentAddress} on Concordium testnet with memo = job id (${job.id}). Then POST /api/brief with X-PAYMENT: {"txHash":"<hash>"}.`
          : "Agent wallet not configured yet — mock payment is the only path until the testnet wallet exists (see README.md).",
      });
    }

    // ---- API: brief (the paid endpoint) ----
    if (req.method === "POST" && path === "/api/brief") {
      const body = await readJson(req);
      const job = getJob(String(body.jobId ?? ""));
      if (!job) return send(res, 404, { error: "unknown job id — request a quote first" });
      if (job.status === "delivered") {
        return send(res, 200, { brief: job.brief, receipt: publicReceipt(job), cached: true });
      }
      if (Date.now() > new Date(job.expiresAt).getTime()) {
        updateJob(job.id, { status: "expired" });
        return send(res, 410, { error: "quote expired — request a new quote" });
      }
      if (!GEMINI_API_KEY) {
        return send(res, 503, { error: "GEMINI_API_KEY is not set on the server — the agent cannot research yet" });
      }

      const payment = parsePaymentHeader(req.headers["x-payment"] ?? body.payment ?? null);

      // Mock settlement (demo mode, default on until the real wallet exists).
      if (config.mockPayments && payment?.mock === true) {
        const txHash = mockTxHash(job.id);
        updateJob(job.id, {
          status: "paid",
          txHash,
          explorerUrl: null,
          settlement: "mock — no real transaction; enable the real wallet to settle on testnet",
        });
        const out = await deliverBrief(job);
        return send(res, 200, { ...out, mock: true });
      }

      // Real settlement: needs the agent wallet configured + a tx hash.
      // Unpaid requests always get a 402 (the x402 shape) — with a note when
      // the recipient is not configured yet. The 503 only fires when a real
      // tx hash is presented but there is no wallet to verify it against.
      if (!payment?.txHash || !/^[0-9a-f]{64}$/i.test(payment.txHash)) {
        const r = paymentRequiredResponse(job, config);
        if (!config.agentAddress) {
          r.body.note = "Agent wallet not configured yet — real payment unlocks once the testnet wallet exists (see README.md). Mock payment is the working path meanwhile: X-PAYMENT {\"mock\": true}.";
        }
        return send(res, r.status, r.body, r.headers);
      }
      if (!config.agentAddress) {
        return send(res, 503, {
          error: "Agent wallet not configured yet",
          detail: "Real payment needs the agent's Concordium testnet account (BLOCKER: user must create it — see README.md). Mock payment is available meanwhile.",
        });
      }
      const verdict = await verifyPayment({
        txHash: payment.txHash,
        expectedAmountMicroCcd: job.priceMicroCcd,
        expectedRecipient: job.recipient,
        expectedMemo: job.memo,
        config,
      });
      if (verdict.status === "not-found") {
        return send(res, 402, { error: "payment not found on testnet", detail: verdict.detail, explorerUrl: verdict.explorerUrl });
      }
      updateJob(job.id, {
        status: "paid",
        txHash: payment.txHash,
        explorerUrl: verdict.explorerUrl,
        settlement: verdict.status === "verified" ? "verified on-chain" : "tx-submitted — verify on CCDScan",
      });
      const out = await deliverBrief(job);
      return send(res, 200, out);
    }

    // ---- API: public job log ----
    if (req.method === "GET" && path === "/api/jobs") {
      return send(res, 200, { jobs: listJobs(50).map(publicJob) });
    }
    if (req.method === "GET" && path.startsWith("/api/jobs/")) {
      const job = getJob(path.slice("/api/jobs/".length));
      if (!job) return send(res, 404, { error: "unknown job id" });
      return send(res, 200, { job: publicJob(job), brief: job.brief ?? null, receipt: job.brief ? publicReceipt(job) : null });
    }

    // ---- API: agent card (with hash) ----
    if (req.method === "GET" && path === "/api/agent-card") {
      return send(res, 200, { card: agentCardJson, sha256: agentCardHash, registryUrl: config.registryApp });
    }

    // ---- MCP ----
    if (req.method === "POST" && path === "/mcp") {
      const body = await readJson(req);
      const out = await handleMcp(body, config);
      if (out.json === null) return send(res, out.status, "");
      return send(res, out.status, out.json);
    }

    return send(res, 404, { error: "not found", hint: "GET / for the demo, GET /api/status for the agent status" });
  } catch (e) {
    console.error("[server]", e);
    return send(res, 500, { error: "internal error", detail: String(e.message).slice(0, 300) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`TrueAgent listening on http://${HOST}:${PORT}`);
  console.log(`  network: ${config.network} | price: ${config.priceLabel} | mockPayments: ${config.mockPayments}`);
  console.log(`  recipient: ${config.agentAddress ?? "(not configured — mock mode only)"}`);
  console.log(`  gemini: ${GEMINI_API_KEY ? "configured" : "MISSING GEMINI_API_KEY"}`);
  console.log(`  agent card sha256: ${agentCardHash}`);
});
