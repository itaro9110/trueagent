// TrueAgent — job store. Jobs are the public on-chain log: every brief request,
// its payment and its receipt live here. Persisted to data/jobs.json (gitignored)
// and mirrored in memory. No secrets are ever stored in a job.
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const STORE_FILE = join(DATA_DIR, "jobs.json");

let jobs = [];
try {
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(STORE_FILE)) {
    jobs = JSON.parse(readFileSync(STORE_FILE, "utf8"));
    if (!Array.isArray(jobs)) jobs = [];
  }
} catch {
  jobs = [];
}

function persist() {
  try {
    writeFileSync(STORE_FILE, JSON.stringify(jobs, null, 2));
  } catch (e) {
    console.error("[jobs] persist failed:", e.message);
  }
}

export function createJob({ topic, priceMicroCcd, priceLabel, recipient }) {
  const now = Date.now();
  const job = {
    id: randomUUID(),
    topic,
    status: "quoted", // quoted -> paid -> working -> delivered | expired
    priceMicroCcd,
    priceLabel,
    recipient, // Concordium testnet account that receives the payment (null until wallet exists)
    memo: null, // memo is the job id itself; set below
    txHash: null,
    explorerUrl: null,
    briefHash: null,
    brief: null,
    model: null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 15 * 60_000).toISOString(),
    deliveredAt: null,
  };
  job.memo = job.id;
  jobs.unshift(job);
  persist();
  return job;
}

export function getJob(id) {
  return jobs.find((j) => j.id === id) ?? null;
}

export function updateJob(id, patch) {
  const job = getJob(id);
  if (!job) return null;
  Object.assign(job, patch);
  persist();
  return job;
}

export function listJobs(limit = 50) {
  return jobs.slice(0, limit);
}

export function publicJob(job) {
  if (!job) return null;
  const { brief, ...rest } = job;
  return { ...rest, briefDelivered: Boolean(brief) };
}
