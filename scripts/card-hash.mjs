// Print the Agent Card SHA-256 — the hash that gets committed on-chain
// (metadata_hash) when the agent registers in the Agent Registry.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Hex } from "../src/gemini.js";

const card = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "public", "agent-card.json"), "utf8"));
console.log("agent-card.json sha256:", sha256Hex(JSON.stringify(card)));
