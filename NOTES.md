# TrueAgent — architecture & progress notes

Solo entry, GM XBT (gmxbtt@gmail.com / GitHub itaro9110). Concept delegated by the user 2026-11-18 ~04:18 WIB: "lu aja bikin... asal baguss dan orang orang tertarik". Concept decided: **verified pay-per-brief research agent** — trust is the product (Verified badge + ERC-8004 card + x402 micropayments + on-chain log).

## Research findings (verified 2026-11-18)

### Concordium testnet
- Public node: `grpc.testnet.concordium.com:20000` (gRPC v2/web), no need to run a node. Explorer: `testnet.ccdscan.io` (HTTP 200 verified).
- Wallet: **Concordium Wallet for Web** (Chrome extension). Testnet identity from the **"Concordium testnet IP"** — **no ID document required on testnet**. In-wallet faucet "Request CCD" → **2000 test CCD**, free.
- Encode page says entry/testnet is free with no KYC wording — **confirmed for the testnet path**.

### Verified badge — two flows, do NOT conflate
- **XDC AI flow** (mainnet/XDC marketplace): passport + liveness in Concordium Mobile Wallet, link wallet (2 signatures), register agent, pay **3 USDC one-time, non-refundable** — NOT the hackathon path.
- **Concordium-native Agent Registry** (`agent-registry.concordium.com`): "registration takes a few clicks, currently free of charge for Concordium-native wallets"; badge anchored to a Concordium account anchored to a Concordium ID; on testnet the identity needs no ID, so the testnet badge is **free + ID-free**. This is the hackathon path.

### CIS-8004 / Agent Registry
- Concordium's on-chain agent-identity standard (live on mainnet); agents minted as CIS-2 NFTs; registry stores `agent_uri` + `metadata_hash`; `setAgentWallet` needs a signed message; cross-contract verification with CIS-8 external key registry. Spec: https://proposals.concordium.com/CIS/cis-8004.html
- **Testnet registry contract: index 12802, subindex 0** (from `agent-registry.concordium.com/config.js`; CIS-8 contract 12801/0; testnet genesis `4221332d…f50f796`). Mainnet registry is 10082/0.
- Our Agent Card: `public/agent-card.json`, SHA-256 `24e9b88a192d5ab8d015d54d94995a4f7f770bd85dc0b0decc82e9743245c727` (recompute: `node scripts/card-hash.mjs`). The hash is what gets committed as `metadata_hash` at registration. (Old `9262db79…` is STALE — pre-address card.)
- **REGISTERED 2026-11-18 ~05:07 WIB — token 1252** (see Blocker 2 below). AgentGate `verified` = found && active && cardHashMatches !== false (read from `concordium-agentgate` 0.2.3 source); testnet path uses the MCP `verify_agent_card` tool, which fetches `agent_uri` — so the card must be publicly fetchable for `verified: true`.

### AgentGate (independent checker, built FOR this hackathon)
- Hosted read-only check API: `https://agentgate.agentgate.workers.dev/v1/check-agent?id=<badge-or-account>&network=testnet` (free preview, 20 req/min/IP), MCP server, npm `concordium-agentgate`. Returns found/active/verified/cardHashMatches.
- **Verified live 2026-11-18:** the preview endpoint answers; a dummy id returns `{"error":"invalid_id","message":"id must be a CIS-8004 badge (CIS-2 token address) or a Concordium account address"}`. Our service calls it from `/api/status` (cached 60s) and from the MCP `trueagent_check_agent` tool.

### x402 on Concordium
- Supported network in the open x402 standard since June 2026 (built with Boosty Labs); facilitator can sponsor network fees so the agent settles in stablecoin and never touches CCD.
- **No public Concordium testnet facilitator endpoint was found in docs.** Demo implements the x402 protocol SHAPE (HTTP 402 + `PAYMENT-REQUIRED` + `X-PAYMENT` + `X-PAYMENT-RESPONSE`-style receipt) with settlement as a direct test-CCD transfer signed in the visitor's Concordium Wallet for Web, verified on-chain via the public testnet node / CCDScan. Documented honestly as "x402-pattern settlement on Concordium testnet; native facilitator endpoint not publicly documented as of build".

### Gemini (free tier, verified live 2026-11-18)
- REST Interactions API: `POST https://generativelanguage.googleapis.com/v1beta/interactions`, headers `x-goog-api-key` + `Api-Revision: 2026-05-20`, body `{model, input, tools, store:false}`. Response has `steps` + `output_text`; grounding returns `url_citation` annotations.
- **Quota reality on this free-tier key (measured, not assumed):**
  - `gemini-4-carbon`: 0 input tokens/day — structurally unusable. Dropped.
  - `gemini-4-hydrogen`: 20 req/day — exhausted at build time (API said retry in ~10.5h).
  - `gemini-3.5-flash-lite`: 15/min, no daily cap — the workhorse. Primary model.
  - `google_search` tool: **quota-gated** — any call with it → 429 (verified: same prompt 200 without tools, 429 with tools). Service degrades: try with tools → on 429 retry without → mark `grounding:"none"` + honest caveat in the brief.
- Key at runtime only via `GEMINI_API_KEY` env; for local tests fetch the `custom.gemini` vault surrogate transiently (`dynamic_credential_entry("custom.gemini")["surrogate"]`) — never stored/printed. In this VM, Node fetch needs `NODE_USE_ENV_PROXY=1` for the egress proxy.

## Architecture (as built)

Node 22 service, **plain JavaScript ESM, zero dependencies** (Node stdlib HTTP only).
Deviation from the original plan (TS): no `tsc` is installed in this VM and `npm install -g typescript` was not attempted — plain `.js` keeps the service runnable with zero toolchain friction. The code is the same shape a TS port would have; a `tsc` port is a mechanical step if judges prefer TS.

```
public/index.html + app.js + styles.css   demo UI (quote → pay → brief → receipt)
public/agent-card.json                    ERC-8004 card (draft: agentAddress null)
src/server.js                             HTTP server + all routes
src/gemini.js                             research engine (REST, model ladder, tools degrade)
src/jobs.js                               file-backed job store (data/jobs.json, gitignored)
src/x402.js                               402 challenge + X-PAYMENT parsing + receipt hash
src/concordium.js                         verify providers + CCDScan links + mock settlement
src/agentgate.js                          live badge check (read-only)
src/mcp.js                                minimal MCP JSON-RPC (2 tools)
scripts/smoke-test.mjs                    end-to-end test (boots server, 12 checks)
scripts/card-hash.mjs                     prints the Agent Card SHA-256
config.json                               network, price (0.01 test CCD = 10000 micro CCD), models
```

Price: **0.01 test CCD** per brief (10000 micro CCD). Quote TTL 15 min. Brief timeout 120s. Quote rate limit 20/min/IP (in-memory).

## Build log

- ~04:20 WIB — research done (testnet, badge flows, CIS-8004, AgentGate, x402, Gemini).
- ~04:35 WIB — scaffold; `@concordium/node-sdk@9.5.3` installed, then **found broken** (lib/util.js + lib/clientV2.js missing from the tarball; reinstalled latest — same). CCDScan has no discoverable public REST API (Nuxt SPA, /api/* 404s). Decision: zero-dependency core; verification provider chain SDK → concordium-client CLI → link-verified fallback.
- ~04:50 WIB — service + UI + MCP written; first smoke run 9/12 (402 branch bug + Gemini model quotas).
- ~04:55 WIB — fixed 402 (unpaid always 402, wallet 503 only when a real txHash is presented); model ladder switched to flash-lite primary / hydrogen fallback; tools-degradation added.
- ~05:00 WIB — **smoke test 12/12 PASS**: real Gemini brief in 8.9s (5 key points, 2 sources, grounding none, honest caveat), receipt with brief hash + mock tx, cached re-delivery, public log, MCP tools. Demo runnable.
- ~05:05 WIB — submission pack written: README.md, docs/DEMO_VIDEO_PLAN.md, docs/GO_LIVE.md.
- ~05:07 WIB — **registry registration DONE headless (user order "lanjutkan")**: `CIS-8004.register` on testnet contract 12802/0, Native agent, `agent_uri` = `https://itaro9110.github.io/trueagent/.well-known/agent-card.json`, `metadata_hash` = `24e9b88a…`, token **1252**, tx `fdd821965e076d0b9f0efe93050914f009edacb3debee56fc5a9daa3e60bd171` (finalized, block `4dd4ecd7…`, energy used 2,128/30,000, fee ~18.7 CCD). Parameter encoding cross-checked two ways (manual per spec + schema serialization — byte-identical) + node `invokeContract` simulation success before submitting. Events parsed from the finalized outcome: CIS-2 Mint (tag 254) + Registered (tag 240, token 1252, owner = agent account, `registered_at` 2026-11-17T22:07:38Z — the deployed contract logs an extra 8-byte timestamp beyond the spec text) + AgentWalletSet (tag 245, wallet = agent account). AgentGate preview: `found: true, active: true`, `cardHashMatches: false` ("fetch HTTP 404" — repo not pushed yet), `verified: false` until the repo push. Script `~/workspace/hackathons-2026-11-18/concordium-wallet/step8-register.mjs` (+ `step8b-outcome.mjs` for the outcome re-fetch; step8's own outcome print crashed on a BigInt in JSON.stringify AFTER finalization — tx was unaffected). CCDScan tx/account pages returned 404/connection-failed from this VM during verification (curl, ~05:12 WIB) — the link itself is the standard `https://testnet.ccdscan.io/transactions/<hash>`; re-check it in a browser, do not re-submit anything.

## Verified end-to-end (smoke test, 2026-11-18 ~05:00 WIB)

```
POST /api/quote  → job 3dba37c4, price 0.01 test CCD
POST /api/brief (unpaid) → 402 + PAYMENT-REQUIRED header
POST /api/brief X-PAYMENT {"mock":true} → brief in 8.9s, model gemini-3.5-flash-lite
  title: "Concordium's Agent Registry" — 5 key points, 2 sources, caveat present
  receipt: tx mock-3dba37c4f4c240e7, briefHash deafc670321dfc87…
POST /api/brief (same job) → cached delivery
GET /api/jobs, POST /mcp tools/list + tools/call → OK
```

## Blockers (need the user's hand — see README.md for exact steps)

1. **Concordium testnet wallet — DONE 2026-11-18 ~05:00 WIB (headless, by agent; user order "Kerjain ama lu aja wok").** Identity 0 from Concordium testnet IP (no ID) + account `37f3bg4GJRZNFdETmh3ZHHnwjbTVm5NZfJVDiSVegKuriJEpoT`, funded **20,000 test CCD** via wallet-proxy faucet (tx `f0e349237c759f57695e89d2f99285aefcf0d5e97c8d3b4959acab17f3353c6c`, finalized). Mnemonic ONLY in `~/.wallets/concordium-testnet-trueagent.json` (mode 600) — never in chat/logs. Workdir `~/workspace/hackathons-2026-11-18/concordium-wallet/` (scripts, identity request/object, account.json; @concordium/web-sdk 12.0.2 + concordium-client 10.0.0 in ~/workspace/.tools/concordium/). First account creation was FREE (credential deployment accepted with 0 balance). `config.json` agentAddress set; Agent Card updated → **new card hash `24e9b88a192d5ab8d015d54d94995a4f7f770bd85dc0b0decc82e9743245c727`** (OLD `9262db79…` is stale — registry must use the new one). Smoke test re-run 12/12 PASS (real Gemini brief 11.9s, recipient logged at boot).
2. **Badge + registry registration — DONE 2026-11-18 ~05:07 WIB (headless, by agent; user order "lanjutkan").** `CIS-8004.register` on testnet contract 12802/0, token **1252**, tx `fdd821965e076d0b9f0efe93050914f009edacb3debee56fc5a9daa3e60bd171` (finalized). AgentGate preview: `found: true, active: true`, `cardHashMatches: false` (card URL 404 — public repo not pushed yet). **`verified` flips true with no new transaction once the parent pushes `itaro9110/trueagent` with the byte-identical card at `.well-known/agent-card.json`.** Optional follow-up (NOT required for AgentGate `verified`): the registry app's CIS-8 external-reference link (tie an EVM/Solana key) — needs an EVM/Solana wallet signature; the user's Binance EVM wallet could do it, but that is a separate step and was not attempted.
3. **Gemini API key at runtime** (env var on the host).
4. **Public demo hosting** (decision needed; service is a single Node process, no build step).

## What remains before 9 Dec 2026 23:59 UTC

1. Push the public repo `itaro9110/trueagent` (parent) → AgentGate `verified` flips true (no new tx); do one real paid brief on testnet, paste the CCDScan tx link into the submission. (Blockers 1–2 DONE — see above.)
2. Host the demo (Blocker 4), update Agent Card endpoint URLs from the `https://trueagent.example` placeholder.
3. Record the demo video (plan in docs/DEMO_VIDEO_PLAN.md — prefer the real wallet payment shot).
4. Parent pushes public repo `itaro9110/trueagent`.
5. Encode submission: repo + video + live demo URL + first real CCDScan tx + card hash + registry link.
6. Optional upgrades (only if time): fixed node-sdk release or concordium-client on the host (verification becomes on-chain-verified automatically); hydrogen quota resets daily so the ladder already covers it.
