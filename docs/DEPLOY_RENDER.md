# TrueAgent — deploy runbook (Render free tier)

Status: deploy-prep done 2026-11-18 ~06:05 WIB. Nothing is deployed yet, no
account created, $0 spent. The parent runs the deploy with the user.

## 1. Why Render (verified 2026-11-18 from current docs/guides)

| Host | Free tier? | Card at signup? | Sleep / cold start | Verdict |
|---|---|---|---|---|
| **Render** | Yes, forever. 750 instance-hrs/mo, 512 MB RAM, 0.1 CPU | **No** | Sleeps after 15 min idle; ~30–60 s cold start | **RECOMMENDED** |
| Railway | Trial only: $5 credit, 30 days, then $1/mo Free credit (not enough to run 24/7); Hobby $5/mo needs a card | No (trial) | No sleep during trial | Runner-up (temporary) |
| Koyeb | 1 free instance exists, but card required ($29 hold); post-Mistral-acquisition reports say free Starter closed to new signups (Sep 2026) | **Yes** | Scales to zero after 1 h idle | Out |
| Fly.io | **No free tier for new orgs** — $1 credit / 7-day trial only, then card required | No (trial) | Trial machines auto-stop after 5 min | Out |
| Replit | Free Starter (no card), but Deployments are paid: Autoscale from $1/mo, Reserved VM $20/mo; only 1 free *static* deployment | No | Dev Repls hibernate; Autoscale scales to zero | Out ($0 impossible for a Node server) |
| Hugging Face Spaces | Docker Spaces require a paid plan (PRO) to create; free accounts only get Gradio/ZeroGPU Spaces | — | Free CPU sleeps after 48 h idle | Out (Node.js needs Docker SDK) |
| Vercel | Hobby free, no card — but **serverless functions only**, no long-running Node server; TrueAgent is a persistent process with a file-backed job log | No | Cold starts; 300 s max duration on Hobby | Out (would need a rewrite) |

Render is the only host that is free-forever, card-free, and runs a plain
long-lived `node src/server.js`. Its limits are documented on
render.com/docs/free (read 2026-10-24 by the sources above): "Do not use
[free instances] for production applications" — fine for a hackathon demo.
Render injects `PORT` itself (default 10000) and routes public HTTPS to it;
the service binds `0.0.0.0:$PORT` (fixed in `src/server.js`, see §4).

Known Render free-tier quirks that affect us:
- **Sleep:** after 15 min without traffic the service spins down; the next
  visitor waits ~1 min (Render shows a loading page). Judges must be warned,
  or keep it warm with a free external pinger (e.g. cron-job.org, GET the
  live URL every 10–14 min — that only keeps the 750 h quota at ~730 h/mo,
  i.e. still $0 for one service).
- **Ephemeral disk:** `data/jobs.json` resets on redeploy/restart. The public
  job log on the hosted demo starts fresh — that is fine, the submission's
  first-paid-brief proof is the CCDScan tx link, not the hosted log.
- No SMTP on free, no SSH/shell, no background workers/cron — none needed.

## 2. What the user must do himself (cannot be done by the agent)

1. **Render account** — sign up at render.com with GitHub (itaro9110).
   No card. Then: Dashboard → New → **Web Service** (or New → Blueprint,
   see §3) → connect repo `itaro9110/trueagent`.
2. **Gemini API key** — the `hsurr:` surrogate this VM uses is NOT a real
   key: Sentinel/authd swaps it for the real credential only inside Muse's
   own runtime, so it cannot be pasted into Render (Google would 401).
   The user opens **aistudio.google.com/apikey**, signs in with his Google
   account, clicks **Create API key** (no card needed), copies the `AIza…`
   key, and pastes it into Render as `GEMINI_API_KEY` (dashboard →
   service → Environment). Never in chat, never in the repo.
   A NEW key is fine — quotas are per Google Cloud project; the demo's
   workhorse model `gemini-3.5-flash-lite` is free-tier.

## 3. Deploy steps (Render dashboard, ~10 min)

Option A — Blueprint (fastest, uses `render.yaml` in the repo root):
1. Dashboard → New → **Blueprint** → connect `itaro9110/trueagent`.
2. Render shows the `trueagent` service (plan: free). Before applying,
   set the secret env var `GEMINI_API_KEY` to the user's own key
   (the blueprint marks it `sync: false` so it must be filled in).
3. Apply → Render builds (`npm install`) and starts (`node src/server.js`).
   First URL: `https://trueagent.onrender.com` (name may vary if taken).

Option B — manual Web Service (same result, no blueprint):
1. Dashboard → New → **Web Service** → build from `itaro9110/trueagent`,
   branch `main`, runtime **Node**.
2. Build command: `npm install` · Start command: `node src/server.js` ·
   Instance type: **Free**.
3. Environment variables (see table below) → Create Web Service.

### Env vars

| Key | Value | Notes |
|---|---|---|
| `GEMINI_API_KEY` | user's own key from AI Studio | REQUIRED — user pastes it himself |
| `MOCK_PAYMENTS` | `false` | Real 0.01 test CCD payments on the hosted demo |
| `AGENT_ADDRESS` | `37f3bg4GJRZNFdETmh3ZHHnwjbTVm5NZfJVDiSVegKuriJEpoT` | Already in `config.json`; env override for clarity |
| `NODE_VERSION` | `22` | Pin (package.json `engines` already says `>=22`) |
| `PORT` | *(do not set)* | Render injects it |
| `HOST` | *(do not set)* | Server defaults to `0.0.0.0` since the §4 fix |

### Post-deploy checks (on the live URL)

```text
GET /api/status        → 200, geminiConfigured: true, badge.verified: true
GET /api/agent-card    → sha256 24e9b88a192d5ab8… (until the card update in §5)
POST /api/quote        → 201, job + payment requirements
POST /api/brief (unpaid) → 402 + PAYMENT-REQUIRED header
```

## 4. PORT/HOST fix (done, local only — NOT pushed)

- `src/server.js` already respected `process.env.PORT` (`Number(process.env.PORT ?? 8787)`).
  The real blocker was the bind host: it defaulted to `127.0.0.1`, which is
  unreachable from outside the container on any host. Fixed:
  `const HOST = process.env.HOST ?? "0.0.0.0"` (comment explains why).
- Smoke test re-run after the fix: **12/12 PASS** (real Gemini brief 2.8 s).
- The fix is a local file change only — this repo has **no local git repo**
  (pushes go through the parent's GitHub push-files flow). Parent: push
  `src/server.js` (+ `render.yaml` + this file) before the deploy.
- No other code change was needed for hosting: the UI calls relative API
  paths, `package.json` has `"start": "node src/server.js"` and
  `engines: node >=22`, zero dependencies (no build step).

## 5. Card-endpoint update + on-chain sequence (do AFTER the deploy)

The Agent Card still points all three `services[].endpoint` URLs at the
placeholder `https://trueagent.example`. Once the real host URL is known
(e.g. `https://trueagent.onrender.com`), the card must be updated — and its
hash changes, which invalidates the on-chain `metadata_hash`
(`24e9b88a…`, token 1252). **No fresh registration is needed.**

The deployed CIS-8004 contract (12802/0) exports **`setAgentURI`**
(confirmed from the on-chain schema `agent_registry_schema.b64` AND the
CIS-8004 spec, proposals.concordium.com/CIS/cis-8004.html):
`setAgentURI` — "Update the agent URI and metadata hash for an existing
agent. The caller MUST be the current CIS-2 owner of the token."
Parameter: `SetAgentURIParam ::= (token_id: AgentTokenId)
(agent_uri: OptionalString) (metadata_hash: OptionalHash256)`.
On success it emits `URIUpdated` (tag 241). Token 1252 stays; nothing
re-mints.

Exact sequence (run back-to-back — AgentGate `verified` flips false in the
gap between the card push and the `setAgentURI` landing, so keep the gap
to minutes):

1. Deploy (§3) → note the real host URL.
2. Edit `public/agent-card.json` (and keep `.well-known/agent-card.json`
   byte-identical — it is the file Pages serves):
   - `research-brief` endpoint → `<host>/api/brief`
   - `mcp` endpoint → `<host>/mcp`
   - `demo-ui` endpoint → `<host>/`
   Keep the file in compact-JSON form (one line, `JSON.stringify` output)
   so the raw-bytes SHA-256 equals the stringified hash — AgentGate hashes
   raw bytes (proven 2026-11-18).
3. Recompute: `node scripts/card-hash.mjs` → new hash `H`.
4. Push the two card files (parent, push-files) → Pages rebuild → confirm
   the card URL serves the new bytes.
5. Run `setAgentURI` on 12802/0 as a new headless script modeled on
   `step8-register.mjs` (same signing pattern, `DRY_RUN=1` first):
   params = token_id `1252` (wire: byte `0x08` + 8-byte LE),
   agent_uri = `Some("https://itaro9110.github.io/trueagent/.well-known/agent-card.json")`
   (same URL as before — only the content changed),
   metadata_hash = `Some(H)`.
   Caller = agent account (the CIS-2 owner). Then verify the `URIUpdated`
   event + re-check AgentGate preview → `verified: true` again.
6. Cost: one `updateContract` tx. Registration used 2,128 energy / ~18.7
   test CCD fee; `setAgentURI` is a smaller call — budget **< ~20 test CCD**.
   Balance ~19,977 test CCD. $0 real money.
7. Only then record the demo video against the live URL and submit to
   Encode (deadline 9 Dec 23:59 UTC).

## 6. What remains after this prep

- [ ] Parent pushes `src/server.js` (HOST fix), `render.yaml`, `docs/DEPLOY_RENDER.md`.
- [ ] User: Render signup + `GEMINI_API_KEY` from AI Studio (§2).
- [ ] Deploy (§3) → live URL.
- [ ] Card update + `setAgentURI` (§5) → AgentGate verified again.
- [ ] Demo video (≤3 min, prefer the real wallet payment shot) → Encode submission.
- [ ] Keep the demo up through judging (10–11 Dec).
