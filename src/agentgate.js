// TrueAgent — AgentGate badge verification (read-only, no keys).
// AgentGate is an independent, MIT-licensed checker built for this hackathon.
// Its free preview endpoint answers: does this badge/account exist, is it
// active, is it verified, and does the Agent Card hash match?
// https://agentgate.agentgate.workers.dev
const PREVIEW_BASE = "https://agentgate.agentgate.workers.dev/v1/check-agent/preview";

/**
 * @param {string} id — badge token address or owner account address
 * @returns the raw AgentGate verdict, or { error } on any failure.
 */
export async function checkAgent(id, network = "testnet") {
  if (!id) return { error: "no badge/account id configured yet" };
  try {
    const res = await fetch(`${PREVIEW_BASE}?id=${encodeURIComponent(id)}&network=${network}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.text();
    if (!res.ok) return { error: `AgentGate HTTP ${res.status}`, raw: body.slice(0, 200) };
    return JSON.parse(body);
  } catch (e) {
    return { error: `AgentGate unreachable: ${e.message}` };
  }
}
