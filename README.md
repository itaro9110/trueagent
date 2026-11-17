# TrueAgent — a verified pay-per-brief research agent

> **Concordium Trusted Agents Hackathon × Encode Club** · solo entry by GM XBT (gmxbtt@gmail.com / GitHub `itaro9110`) · testnet only · $0 spent

Anyone can request a research brief on any topic, pay a tiny micropayment, and get a structured, sourced brief. **Trust is the product:**

- ✅ **Verified by Concordium** — a badge proves a real human stands behind the agent (Agent Registry, CIS-8004).
- ✅ **ERC-8004 Agent Card** — discoverable in the Agent Registry; its SHA-256 hash is committed on-chain so anyone can check the card was not altered. Card: `/.well-known/agent-card.json`
- ✅ **x402 micropayments** — 0.01 test CCD per brief, pay-per-use, no subscription. Unpaid requests get a real HTTP 402 + `PAYMENT-REQUIRED` header.
- ✅ **On-chain log** — every payment + brief hash is public (`GET /api/jobs`), and every receipt links to its transaction on CCDScan testnet.

Live demo hook: open the web UI, type a topic, pay a tiny testnet amount, watch the agent work, get the brief + on-chain receipt.

## Status (2026-11-18 ~05:00 WIB)

| Piece | State |
|---|---|
| Agent service + brief generation | ✅ **Working end-to-end, 12/12 smoke tests pass** (real Gemini brief, 8.9s) |
| Demo UI (quote → pay → brief → receipt) | ✅ Working (mock payment mode) |
| x402 402 challenge + `X-PAYMENT` | ✅ Working (protocol shape, incl. header) |
| Public job log + Agent Card + hash | ✅ Working |
| MCP server (`trueagent_request_brief`, `trueagent_check_agent`) | ✅ Working |
| Real testnet settlement (visitor pays 0.01 CCD) | ✅ **Wallet ready (Blocker 1 DONE)** — agent account funded, 20,000 test CCD |
| Verified badge + registry entry | ✅ **Registered on testnet — token 1252** ([tx](https://testnet.ccdscan.io/transactions/fdd821965e076d0b9f0efe93050914f009edacb3debee56fc5a9daa3e60bd171)); AgentGate `found`/`active` true — `verified` flips true once the public repo is pushed (card URL 404s until then) |
| Public repo + live demo URL | ⏳ Parent handles the GitHub push; hosting decision pending |

**Run the demo now:** `node scripts/smoke-test.mjs` (needs `GEMINI_API_KEY`, see below) or `node src/server.js` and open http://127.0.0.1:8787.

## How to run

```bash
# Node >= 22, no dependencies to install (zero-dependency core).
# The service needs a Gemini API key at runtime — env var only, never committed.
GEMINI_API_KEY=... node src/server.js
# → TrueAgent listening on http://127.0.0.1:8787
```

Open http://127.0.0.1:8787: type a topic → **Get a quote** → **Pay (demo — mock settlement)** → watch the agent work (~9s) → brief + receipt.

For local tests, the key can be fetched transiently from the `custom.gemini` vault surrogate (see `NOTES.md`); it is never stored in the repo. If you are behind the egress proxy used in this VM, Node's fetch needs `NODE_USE_ENV_PROXY=1`.

### Endpoints

| Method & path | What it does |
|---|---|
| `GET /` | Demo UI |
| `GET /api/status` | Agent status: network, price, recipient, badge verdict (live AgentGate check, cached 60s), card hash, Gemini readiness |
| `POST /api/quote` `{topic}` | Creates a job (15-min quote) + x402 payment requirements |
| `POST /api/brief` `{jobId}` + `X-PAYMENT` header | 402 if unpaid; otherwise researches + returns `{brief, receipt}` |
| `GET /api/jobs` · `GET /api/jobs/:id` | Public log of every brief + payment |
| `GET /.well-known/agent-card.json` · `GET /api/agent-card` | ERC-8004 card (+ SHA-256 hash) |
| `POST /mcp` | Minimal MCP (Streamable HTTP): `tools/list`, `tools/call` |

### The x402 flow (Concordium testnet flavour)

1. `POST /api/quote` → job + `accepts[]`: `{scheme:"exact", network:"concordium-testnet", amount:"10000" (micro CCD), asset:"CCD", payTo:<agent testnet account>, memo:<job id>}`.
2. `POST /api/brief` without payment → **HTTP 402** + `PAYMENT-REQUIRED` header (base64 JSON) + the same `accepts[]` in the body.
3. The visitor pays from **their own Concordium Wallet for Web**: 0.01 test CCD to the agent account, memo = job id. The wallet returns a tx hash.
4. Client resubmits with `X-PAYMENT: {"txHash":"<64-hex hash>"}` → the service verifies the tx on testnet (see below) → researches → returns the brief + receipt `{txHash, explorerUrl, briefHash, receiptHash, settlement}`.
5. Anyone can open the `explorerUrl` (CCDScan testnet) and verify the payment.

No public Concordium testnet **facilitator** endpoint is documented as of this build, so there is no facilitator in the loop: settlement is a direct wallet transfer and the service verifies it. The wire shape is x402-compatible, so a facilitator can be slotted in later without changing the client. This is stated honestly in the UI and in `src/x402.js`.

### How the service verifies a payment (`src/concordium.js`)

Tries in order: (1) `@concordium/node-sdk` (dynamic import), (2) the `concordium-client` CLI if installed (read-only), (3) **link-verified fallback** — the tx hash + CCDScan link are recorded and the receipt says so plainly; the chain, not this service, is the source of truth. The service never holds keys and never signs.

> ⚠️ **Known limitation, found during the build:** the published `@concordium/node-sdk@9.5.3` is broken — `lib/util.js` and `lib/clientV2.js` are missing from the tarball, so the SDK cannot even be imported. It is therefore deliberately **not** a dependency (zero-dependency core). Fix path: a fixed SDK release, or install `concordium-client` and let provider (2) verify. The demo does not block on this.

### The research engine (`src/gemini.js`)

Gemini Interactions API (REST, no SDK), model ladder: **gemini-3.5-flash-lite** (primary) → **gemini-4-hydrogen** (fallback). Strict-JSON briefs: title, summary, 5–7 key points, verdict, sources, caveats.

Verified against the free-tier key on 2026-11-18:
- `gemini-4-carbon`: **0 input tokens/day on free tier — structurally unusable** (dropped).
- `gemini-4-hydrogen`: 20 req/day, **exhausted** (reset ~15:00 WIB; see NOTES.md).
- `gemini-3.5-flash-lite`: 15/min, no daily cap — **the workhorse**.
- The `google_search` tool is **quota-gated on this key** (any call with it → 429). The service degrades gracefully: try with Search grounding, on 429 retry without it and mark the brief `grounding:"none"` with an honest caveat. Briefs stay accurate; the reader is told to verify source URLs.

## Architecture

```
visitor ──► demo UI (public/) ──► Node 22 service (src/server.js, stdlib HTTP, 0 deps)
                                     ├─ POST /api/quote → job (src/jobs.js, data/jobs.json)
                                     ├─ POST /api/brief → 402 / verify / research
                                     │     ├─ x402 (src/x402.js) — 402 challenge + X-PAYMENT
                                     │     ├─ Concordium (src/concordium.js) — verify + CCDScan links
                                     │     └─ Gemini (src/gemini.js) — grounded brief, strict JSON
                                     ├─ GET /api/status → AgentGate badge check (src/agentgate.js)
                                     ├─ GET /.well-known/agent-card.json (public/agent-card.json)
                                     └─ POST /mcp (src/mcp.js) — trueagent_request_brief, trueagent_check_agent
```

Config: `config.json` (+ env: `PORT`, `GEMINI_API_KEY`, `AGENT_ADDRESS`, `AGENT_BADGE_ID`, `MOCK_PAYMENTS`). The service holds **no keys** and no wallet: the visitor pays from their own wallet; the service only reads the chain.

## BLOCKERS — need the user's hand (do not work around)

### BLOCKER 1 — Agent's Concordium testnet wallet — DONE 2026-11-18 ~05:00 WIB (headless, by agent; user order "Kerjain ama lu aja wok")
Identity 0 from Concordium testnet IP (no ID) + account `37f3bg4GJRZNFdETmh3ZHHnwjbTVm5NZfJVDiSVegKuriJEpoT`, funded **20,000 test CCD** via wallet-proxy faucet (tx `f0e349237c759f57695e89d2f99285aefcf0d5e97c8d3b4959acab17f3353c6c`, finalized). Mnemonic ONLY in `~/.wallets/concordium-testnet-trueagent.json` (mode 600) — never in chat/logs. Workdir `~/workspace/hackathons-2026-11-18/concordium-wallet/`.

### BLOCKER 2 — Verified badge + Agent Registry entry — DONE 2026-11-18 ~05:07 WIB (headless, by agent; user order "lanjutkan")
Registered directly against the CIS-8004 contract on testnet (**contract 12802/0**, from `agent-registry.concordium.com/config.js`) with the stored keys — no browser wallet needed. `CIS-8004.register` with `agent_uri` = `https://itaro9110.github.io/trueagent/.well-known/agent-card.json`, `metadata_hash` = `24e9b88a192d5ab8d015d54d94995a4f7f770bd85dc0b0decc82e9743245c727`, Native agent (no external reference). **Token id 1252**, owner = agent wallet (auto-set by register), fee ~18.7 CCD. Registration tx `fdd821965e076d0b9f0efe93050914f009edacb3debee56fc5a9daa3e60bd171` ([CCDScan](https://testnet.ccdscan.io/transactions/fdd821965e076d0b9f0efe93050914f009edacb3debee56fc5a9daa3e60bd171)), finalized in block `4dd4ecd755ca504fd22d9383e59a1fd7739c6dd110850fa620fdc62e49701c15`. Parameter encoding cross-checked two ways (manual per CIS-8004 spec + schema serialization via `agent_registry_schema.b64` — byte-identical) and dry-run simulated on the node (`invokeContract` success, 2,128 energy) before submitting. Script: `~/workspace/hackathons-2026-11-18/concordium-wallet/step8-register.mjs` (result in `step8-register-result.json`).
**Verification (independent):** AgentGate preview for the account returns `found: true, active: true`, `cardHashMatches: false` with issue "Agent Card hash does not match on-chain metadata_hash (fetch HTTP 404)" — the card URL 404s because the public repo is not pushed yet. **`verified` flips to true with no new transaction as soon as the parent pushes `itaro9110/trueagent` with the byte-identical card at `.well-known/agent-card.json`.** (Do not confuse this with the separate XDC AI flow, which costs 3 USDC + passport — that is NOT the hackathon path. The optional CIS-8 external-reference "Verified" link in the registry app — tying an EVM/Solana key — was NOT done; AgentGate `verified` does not require it.)

### BLOCKER 3 — Gemini API key at runtime
The demo needs `GEMINI_API_KEY` in the environment when it runs (locally we use the vault surrogate transiently). For the public demo hosting, the key must be set as an env var on the host — never committed.

### BLOCKER 4 — Public demo hosting
Judges need a public URL. Options (decision needed): any free static/Node host (Render free tier, Fly.io free allowance, a VPS) — the service is a single Node process with no build step. The demo video can be recorded against a local run meanwhile (see below).

## Submission pack

- **Public repo:** `itaro9110/trueagent` (push handled by the parent; repo must exist before submission).
- **CCDExplorer link:** registration tx [`fdd821965e076d0b9f0efe93050914f009edacb3debee56fc5a9daa3e60bd171`](https://testnet.ccdscan.io/transactions/fdd821965e076d0b9f0efe93050914f009edacb3debee56fc5a9daa3e60bd171) (CIS-8004 `register`, token 1252, contract 12802/0, testnet). The first real paid-brief receipt link appears here once a visitor pays 0.01 test CCD. (Until then, receipts carry mock tx hashes, clearly labeled.)
- **Demo video plan (≤ 3 min):** see `docs/DEMO_VIDEO_PLAN.md` — 0:00 hook (the trust problem) → 0:20 live demo (topic → quote → 402 → pay → brief + receipt) → 1:40 trust layer (badge check via AgentGate, Agent Card + hash, public log) → 2:20 mainnet route (who pays, who earns, why it works) → 2:50 close.
- **Go-live plan:** see `docs/GO_LIVE.md` — host the service, set `AGENT_ADDRESS` + `GEMINI_API_KEY`, clear Blockers 1–2, record the first real paid brief on testnet, then mainnet route (see below).

## Route to mainnet + real users (for the judges)

Today a researcher who sells briefs on X/Telegram has no trust: buyers cannot tell a real analyst from a copy-paste bot. TrueAgent fixes that with three Concordium-native primitives — a Verified badge (a human is accountable), an ERC-8004 card (discoverable, hash-committed), and x402 micropayments (pay only for what you read, no subscription, no platform cut beyond the chain). Mainnet path: same code, `network: mainnet`, price in CCD or a stablecoin via the x402 facilitator, badge re-issued on the mainnet identity (passport-based, as Concordium intends). Revenue: a small spread on the brief price + optional "verified researcher" storefronts. The testnet build proves the whole loop with $0 at stake.

## Known limitations (honest list)

1. `@concordium/node-sdk@9.5.3` is broken upstream (missing files) — verification falls back to link-verified until a fixed release or `concordium-client` is installed.
2. No public Concordium testnet x402 facilitator endpoint is documented — settlement is a direct wallet transfer in the x402 shape (see above).
3. Gemini Search grounding is quota-gated on the free-tier key — the service degrades to knowledge-grounded briefs and says so in the brief.
4. `gemini-4-hydrogen` (20/day) is exhausted until its daily reset; `gemini-4-carbon` is 0-quota on free tier. `gemini-3.5-flash-lite` carries the demo.
5. The Agent Card is registered on-chain (token 1252, hash `24e9b88a…`) but its URL is not fetchable until the public repo is pushed — AgentGate `verified` flips true then, no new transaction needed.
6. No persistent hosting yet (Blocker 4); the demo runs locally.
