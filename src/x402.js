// TrueAgent — x402 payment layer (Concordium testnet flavour).
//
// The demo implements the x402 protocol shape exactly as the standard defines it:
// the service answers an unpaid request with HTTP 402 + a PAYMENT-REQUIRED header
// (base64 JSON) and an `accepts` array; the client then resubmits with an
// X-PAYMENT header carrying the signed payment. On Concordium the "signed
// payment" is a real test-CCD transfer to the agent's testnet account whose memo
// carries the job id — the transfer itself is the on-chain log (sender, amount,
// memo), verifiable by anyone on CCDScan.
//
// Honest scope note (see README.md): no public Concordium testnet facilitator
// endpoint is documented as of this build, so there is no facilitator in the
// loop — settlement is a direct wallet transfer and the service verifies it
// through concordium.js. The wire shape is x402-compatible so a facilitator
// can be slotted in later without changing the client.
import { sha256Hex } from "./gemini.js";

export function paymentRequirements(job, config) {
  return [
    {
      scheme: "exact",
      network: "concordium-testnet",
      amount: String(job.priceMicroCcd), // micro CCD (1 CCD = 1,000,000 micro CCD)
      asset: "CCD",
      payTo: job.recipient,
      memo: job.memo,
      maxTimeoutSeconds: 900,
      description: `TrueAgent research brief: "${job.topic}"`,
      mimeType: "application/json",
      outputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          keyPoints: { type: "array", items: { type: "string" } },
          verdict: { type: "string" },
          sources: { type: "array", items: { type: "object" } },
          caveats: { type: "string" },
        },
      },
    },
  ];
}

/** Build the 402 response body + headers for an unpaid brief request. */
export function paymentRequiredResponse(job, config) {
  const accepts = paymentRequirements(job, config);
  const payload = { x402Version: 2, error: "payment_required", accepts };
  return {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(payload)).toString("base64"),
    },
    body: payload,
  };
}

/**
 * Parse the X-PAYMENT header the client sends after paying.
 * Concordium flow: { "txHash": "<64-hex tx hash from the wallet>" }.
 * Mock flow (mockPayments=true): { "mock": true }.
 */
export function parsePaymentHeader(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // A bare tx hash is also accepted.
    if (/^[0-9a-f]{64}$/i.test(raw.trim())) return { txHash: raw.trim() };
  }
  return null;
}

export function receiptHash(job) {
  return sha256Hex(JSON.stringify({ id: job.id, topic: job.topic, txHash: job.txHash, briefHash: job.briefHash }));
}
