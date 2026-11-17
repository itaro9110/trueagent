# TrueAgent — demo video plan (≤ 3 minutes)

Record against the local demo (`node src/server.js`, http://127.0.0.1:8787) or the hosted URL once Blocker 4 is cleared. Screen-record the browser + a terminal window; voiceover in clear English (subtitles optional). No paid tools, no editing suite needed — one continuous take with chapter cards is fine.

## Script

| Time | On screen | Voiceover (approx.) |
|---|---|---|
| 0:00–0:20 | Title card: "TrueAgent — a research agent you can trust". Cut to a scammy "DM me for research, $50 upfront" post. | "Anyone can sell research online. Nobody can prove they're real — so buyers pay upfront and hope. TrueAgent fixes that with three things Concordium already has." |
| 0:20–0:45 | Demo UI. Type a topic: "What is Concordium's Agent Registry?" Click **Get a quote**. | "You ask for a brief on any topic. You get a quote — one hundredth of a CCD — and a job id." |
| 0:45–1:20 | Click **Pay** (mock in the recording; real wallet flow once Blocker 1 is cleared). Spinner: "TrueAgent is researching…". Brief appears: title, summary, key points, verdict, sources, caveats. | "You pay only for what you read. No subscription. The agent researches with live search, grounds every claim, and hands you a structured brief in seconds." |
| 1:20–1:50 | Scroll to the receipt: tx hash, CCDScan link, brief SHA-256, receipt SHA-256. Open the CCDScan link in a new tab. | "And here is the receipt — the payment and the brief hash, on-chain, verifiable by anyone. No trust required." |
| 1:50–2:20 | `GET /api/status` JSON + AgentGate check; `/.well-known/agent-card.json` + the SHA-256 hash; the public log (`/api/jobs`). | "Why trust the agent at all? A Verified by Concordium badge proves a real human stands behind it. The ERC-8004 Agent Card is discoverable in the registry, and its hash is committed on-chain. Every brief ever delivered is public." |
| 2:20–2:50 | Architecture slide (one diagram): visitor → UI → service → Gemini + Concordium testnet. | "Same code runs on mainnet: real CCD, a passport-backed badge, and the x402 facilitator. The testnet build proves the whole loop with zero dollars at stake." |
| 2:50–3:00 | Closing card: repo URL, "Try it: <demo URL>", "TrueAgent — trust is the product." | "TrueAgent. Trust is the product." |

## Recording checklist

- [ ] Fresh server, empty `data/jobs.json` (or keep one delivered brief as the log example — decide before recording).
- [ ] `GEMINI_API_KEY` set; confirm a brief generates in ~10s before recording.
- [ ] Topic chosen in advance (use "What is Concordium's Agent Registry?" — it demos the hackathon theme).
- [ ] If Blocker 1 is cleared by recording day: record the REAL wallet payment (Concordium Wallet for Web, 0.01 test CCD) instead of mock — it is the strongest shot in the video. Otherwise say on camera: "demo settlement; real testnet payment shown in the repo README".
- [ ] 1280×720 or higher, browser zoom 100%, terminal font large enough to read.
- [ ] Upload unlisted to YouTube, link in the Encode submission.
