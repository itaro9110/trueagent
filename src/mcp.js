// TrueAgent — minimal MCP server (Streamable HTTP, JSON-RPC 2.0).
// Two tools, both read-only or quote-only. A brief is never generated through
// MCP without a paid job: tools/call trueagent_request_brief creates a job and
// returns the x402 payment requirements; the caller then pays and calls the
// HTTP /api/brief endpoint with the tx hash.
import { checkAgent } from "./agentgate.js";
import { createJob, getJob } from "./jobs.js";
import { paymentRequirements } from "./x402.js";

const TOOLS = [
  {
    name: "trueagent_request_brief",
    description:
      "Request a TrueAgent research brief on a topic. Returns a job id and the x402 payment requirements (0.01 test CCD on Concordium testnet, memo = job id). The brief is delivered only after payment; use the HTTP POST /api/brief endpoint with the payment tx hash.",
    inputSchema: {
      type: "object",
      properties: { topic: { type: "string", description: "Research topic, 3-200 characters" } },
      required: ["topic"],
    },
  },
  {
    name: "trueagent_check_agent",
    description:
      "Check the TrueAgent Verified-by-Concordium badge status via AgentGate (read-only, testnet). Returns found/active/verified/cardHashMatches.",
    inputSchema: { type: "object", properties: {} },
  },
];

export async function handleMcp(body, config) {
  if (!body || typeof body !== "object" || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return { status: 400, json: { jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request" }, id: body?.id ?? null } };
  }
  const { method, params = {}, id } = body;

  // Notifications get no response (202, empty).
  if (method.startsWith("notifications/")) return { status: 202, json: null };

  if (method === "initialize") {
    return {
      status: 200,
      json: {
        jsonrpc: "2.0",
        result: {
          protocolVersion: params.protocolVersion ?? "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "trueagent", version: "1.0.0" },
        },
        id,
      },
    };
  }

  if (method === "tools/list") {
    return { status: 200, json: { jsonrpc: "2.0", result: { tools: TOOLS }, id } };
  }

  if (method === "tools/call") {
    const name = params.name;
    const args = params.arguments ?? {};
    if (name === "trueagent_request_brief") {
      const topic = String(args.topic ?? "").trim();
      if (topic.length < 3 || topic.length > 200) {
        return { status: 200, json: { jsonrpc: "2.0", result: { content: [{ type: "text", text: "topic must be 3-200 characters" }], isError: true }, id } };
      }
      const job = createJob({ topic, priceMicroCcd: config.priceMicroCcd, priceLabel: config.priceLabel, recipient: config.agentAddress });
      const payload = {
        jobId: job.id,
        topic: job.topic,
        status: "quoted — payment required",
        paymentRequirements: paymentRequirements(job, config),
        briefEndpoint: "/api/brief",
      };
      return { status: 200, json: { jsonrpc: "2.0", result: { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] }, id } };
    }
    if (name === "trueagent_check_agent") {
      const verdict = await checkAgent(config.agentBadgeId ?? config.agentAddress, config.network);
      return { status: 200, json: { jsonrpc: "2.0", result: { content: [{ type: "text", text: JSON.stringify(verdict, null, 2) }] }, id } };
    }
    return { status: 200, json: { jsonrpc: "2.0", error: { code: -32602, message: `unknown tool: ${name}` }, id } };
  }

  return { status: 200, json: { jsonrpc: "2.0", error: { code: -32601, message: `method not found: ${method}` }, id } };
}
