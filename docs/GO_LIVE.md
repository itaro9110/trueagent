# TrueAgent — go-live plan

## Before 23 Nov (Checkpoint 1 window)

- [ ] **Blocker 1:** user creates the Concordium testnet wallet + identity + 2000 test CCD faucet (see README.md). Set `AGENT_ADDRESS` in the run environment.
- [ ] Re-run `node scripts/smoke-test.mjs` with the real address configured; do one **real** paid brief end-to-end (visitor wallet → 0.01 test CCD → brief → CCDScan receipt) and paste the CCDScan tx link into the submission.
- [ ] **Blocker 2:** register the agent in the Agent Registry app with the wallet; set `AGENT_BADGE_ID`; confirm the AgentGate check returns `verified: true`; flip `agentAddress` in `public/agent-card.json` from `null` to the real account and recompute the hash (`node scripts/card-hash.mjs`).
- [ ] **Blocker 4:** host the service on a free tier (Render / Fly.io / any Node host): `node src/server.js`, env `GEMINI_API_KEY` + `AGENT_ADDRESS` (+ `MOCK_PAYMENTS=false` once real payments work). Point the demo UI at the public URL; update the Agent Card `services[].endpoint` URLs from the placeholder `https://trueagent.example` to the real host.
- [ ] Record the demo video per `docs/DEMO_VIDEO_PLAN.md` (prefer the real wallet payment shot).
- [ ] Parent pushes the public repo `itaro9110/trueagent` (repo must be created after 2026-11-17T15:00Z — satisfied).

## Before 9 Dec 23:59 UTC (final submission)

- [ ] Encode submission: repo link, demo video link, live demo URL, first real CCDScan tx link, Agent Card hash + registry link.
- [ ] Keep the demo service up through judging (10–11 Dec).
- [ ] If the `node-sdk` gets a fixed release, or `concordium-client` is installed on the host, verification upgrades from link-verified to on-chain-verified automatically (provider order in `src/concordium.js`) — no client change needed.
- [ ] If the Gemini hydrogen daily quota becomes the bottleneck during judging, the ladder already prefers flash-lite; no action needed.

## After the hackathon (mainnet route)

1. Same codebase, `network: mainnet`, price in CCD (or stablecoin via the x402 facilitator once a mainnet facilitator is public).
2. Badge re-issued on the mainnet identity (passport-based Concordium ID).
3. Storefront: any verified researcher can clone TrueAgent, point it at their own badge + wallet, and sell briefs — TrueAgent becomes the reference implementation.
4. Revenue: a small spread on the brief price; optional premium (deeper briefs, private topics) later.
