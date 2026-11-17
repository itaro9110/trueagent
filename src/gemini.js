// TrueAgent — research engine.
// Calls the Gemini Interactions API (REST, no SDK) with Google Search grounding
// and asks for a strict-JSON research brief. Free tier only.
// The API key comes from the GEMINI_API_KEY environment variable at runtime and
// is never stored in this repo. See README.md.
import { createHash } from "node:crypto";

const API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const API_REVISION = "2026-05-20";

const BRIEF_PROMPT = (topic, toolsOn = true) => `You are TrueAgent, a pay-per-brief research agent. Research the topic below${toolsOn ? " using live web search" : ""} and return ONLY a JSON object (no markdown fences, no extra text) with exactly these fields:
{
  "title": "short punchy title for the brief",
  "summary": "2-3 sentence plain-language summary of what matters most right now",
  "keyPoints": ["5 to 7 concise, specific, sourced facts or developments, each one sentence"],
  "verdict": "one-sentence bottom line: what should the reader do or believe",
  "sources": [{"title": "source name", "url": "https://..."}],
  "caveats": "one sentence on what is uncertain, contested, or missing"
}
Rules: ${toolsOn ? "use the search tool for anything time-sensitive; " : "you have NO live web search for this brief — only cite sources you are confident exist, and say so in caveats; "}every key point should be traceable to a source you found; do not invent prices, dates, or quotes; if sources disagree, say so in caveats. Topic: ${topic}`;

function extractText(interaction) {
  const steps = interaction?.steps ?? [];
  const chunks = [];
  const queries = [];
  const citations = [];
  for (const step of steps) {
    if (step.type === "google_search_call" && step.arguments?.queries) {
      queries.push(...step.arguments.queries);
    }
    if (step.type === "model_output" && Array.isArray(step.content)) {
      for (const block of step.content) {
        if (block.type === "text" && block.text) {
          chunks.push(block.text);
          for (const a of block.annotations ?? []) {
            if (a.type === "url_citation" && a.url) {
              citations.push({ title: a.title ?? a.url, url: a.url });
            }
          }
        }
      }
    }
  }
  // Fallback: some responses expose output_text directly.
  if (chunks.length === 0 && typeof interaction?.output_text === "string") {
    chunks.push(interaction.output_text);
  }
  return { text: chunks.join("\n").trim(), queries, citations };
}

function parseBriefJson(text) {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const obj = JSON.parse(cleaned);
  if (!obj || typeof obj !== "object") throw new Error("brief is not an object");
  const brief = {
    title: String(obj.title ?? "Research brief").slice(0, 140),
    summary: String(obj.summary ?? "").slice(0, 1200),
    keyPoints: Array.isArray(obj.keyPoints)
      ? obj.keyPoints.map((p) => String(p).slice(0, 400)).slice(0, 8)
      : [],
    verdict: String(obj.verdict ?? "").slice(0, 400),
    sources: Array.isArray(obj.sources)
      ? obj.sources
          .filter((s) => s && s.url)
          .map((s) => ({ title: String(s.title ?? s.url).slice(0, 120), url: String(s.url).slice(0, 500) }))
          .slice(0, 8)
      : [],
    caveats: String(obj.caveats ?? "").slice(0, 600),
  };
  if (!brief.summary || brief.keyPoints.length === 0) {
    throw new Error("brief missing summary or key points");
  }
  return brief;
}

async function callGemini({ apiKey, model, input, tools, timeoutMs }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Api-Revision": API_REVISION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input,
        tools,
        store: false,
      }),
      signal: ctrl.signal,
    });
    const body = await res.text();
    if (!res.ok) {
      const err = new Error(`Gemini ${model} HTTP ${res.status}: ${body.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return JSON.parse(body);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate a grounded research brief for a topic.
 * Model ladder: [primary, fallback]. For each model, first try WITH the
 * google_search tool; if the API rejects the tool call (429 — the free tier
 * gates Search grounding), retry the same model WITHOUT tools and mark the
 * brief grounding:"none" with an honest caveat. Never fail the demo on
 * grounding alone.
 * @returns {{ brief, model, grounding: "search"|"none", groundingQueries, citations, rawText }}
 */
export async function generateBrief(topic, { apiKey, model, fallbackModel, timeoutMs = 120_000 }) {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set (see README.md)");
  let lastError;
  for (const m of [model, fallbackModel].filter(Boolean)) {
    for (const withTools of [true, false]) {
      let interaction;
      try {
        interaction = await callGemini({
          apiKey,
          model: m,
          input: BRIEF_PROMPT(topic, withTools),
          tools: withTools ? [{ type: "google_search" }] : [],
          timeoutMs,
        });
      } catch (e) {
        lastError = e;
        // Tool call rejected (429): retry the same model without tools.
        // Any other failure: move to the next model (or give up).
        if (withTools && e.status === 429) continue;
        if (e.status && ![429, 500, 502, 503].includes(e.status) && e.name !== "AbortError") break;
        continue;
      }
      try {
        if (interaction?.status && interaction.status !== "completed") {
          throw new Error(`Gemini interaction status: ${interaction.status}`);
        }
        const { text, queries, citations } = extractText(interaction);
        if (!text) throw new Error("empty Gemini response");
        const brief = parseBriefJson(text);
        // Merge search citations into the brief's sources (dedupe by URL).
        const seen = new Set(brief.sources.map((s) => s.url));
        for (const c of citations) {
          if (!seen.has(c.url)) {
            brief.sources.push(c);
            seen.add(c.url);
          }
        }
        if (!withTools) {
          brief.caveats = (brief.caveats ? brief.caveats + " " : "") +
            "Note: generated without live web search (search grounding is quota-gated on the free tier) — verify source URLs before relying on them.";
        }
        return { brief, model: m, grounding: withTools ? "search" : "none", groundingQueries: queries, citations, rawText: text };
      } catch (e) {
        lastError = e;
        continue; // parse failure: try the next variant/model
      }
    }
  }
  throw lastError ?? new Error("Gemini call failed");
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}
