// TrueAgent demo UI — quote -> pay -> brief -> receipt.
// Real payment path (Concordium Wallet for Web): the wallet returns a tx hash
// after the visitor signs the 0.01 test CCD transfer with memo = job id.
// Until the agent wallet exists, only the mock payment is enabled.
const $ = (s) => document.querySelector(s);
let currentJob = null;

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || body.error || `HTTP ${res.status}`);
  return body;
}

function showError(msg) {
  const el = $("#error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

async function loadStatus() {
  try {
    const s = await api("/api/status");
    $("#status-line").textContent =
      `Network: ${s.network} · Price: ${s.price} · ${s.mockPayments ? "Demo (mock) payments ON" : "Real payments"} · ` +
      `${s.geminiConfigured ? "Research engine ready" : "Research engine NOT configured (GEMINI_API_KEY)"}`;
    $("#card-hash").textContent = s.agentCardHash.slice(0, 16) + "…";
    const b = s.badge;
    $("#badge-state").textContent = s.badgeRegistered
      ? (b && b.verified ? "verified ✅ (live check)" : "registered — check pending")
      : "not registered yet — the agent wallet + registry step is pending (see README)";
    if (s.recipient) {
      $("#pay-real").disabled = false;
      $("#real-hint").textContent = `Pay ${s.price} to ${s.recipient} (testnet) with memo = job id.`;
    }
  } catch (e) {
    $("#status-line").textContent = "Status unavailable: " + e.message;
  }
}

async function loadLog() {
  try {
    const { jobs } = await api("/api/jobs");
    const tb = document.querySelector("#log-table tbody");
    if (!jobs.length) { tb.innerHTML = "<tr><td colspan='4'>No briefs yet — be the first.</td></tr>"; return; }
    tb.innerHTML = jobs.map((j) => `<tr>
      <td>${escapeHtml(j.topic)}</td>
      <td>${escapeHtml(j.status)}</td>
      <td>${j.explorerUrl ? `<a href="${j.explorerUrl}" target="_blank">${escapeHtml((j.txHash || "").slice(0, 12))}…</a>` : escapeHtml(j.txHash || "—")}</td>
      <td>${j.briefHash ? `<code>${j.briefHash.slice(0, 12)}…</code>` : "—"}</td>
    </tr>`).join("");
  } catch { /* log is best-effort */ }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderBrief(brief, receipt, mock) {
  const el = $("#result");
  el.innerHTML = `
    <h3>${escapeHtml(brief.title)}</h3>
    <p>${escapeHtml(brief.summary)}</p>
    <ul>${brief.keyPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
    <p><b>Bottom line:</b> ${escapeHtml(brief.verdict)}</p>
    <p><b>Caveats:</b> ${escapeHtml(brief.caveats)}</p>
    ${brief.sources?.length ? `<p class="sources">Sources: ${brief.sources.map((s) => `<a href="${escapeHtml(s.url)}" target="_blank">${escapeHtml(s.title)}</a>`).join(" · ")}</p>` : ""}
    <div class="receipt">
      <p><b>🧾 On-chain receipt</b>${mock ? " (mock settlement — demo only)" : ""}</p>
      <p>Job: <code>${escapeHtml(receipt.jobId)}</code></p>
      <p>Payment: ${escapeHtml(receipt.price)} · tx <code>${escapeHtml(receipt.txHash || "—")}</code></p>
      ${receipt.explorerUrl ? `<p>Verify on CCDScan: <a href="${receipt.explorerUrl}" target="_blank">${receipt.explorerUrl}</a></p>` : "<p>Explorer link: available once the real wallet exists.</p>"}
      <p>Brief SHA-256: <code>${escapeHtml(receipt.briefHash)}</code></p>
      <p>Receipt SHA-256: <code>${escapeHtml(receipt.receiptHash)}</code></p>
      <p>Settlement: ${escapeHtml(receipt.settlement || "—")}</p>
    </div>`;
  el.classList.remove("hidden");
}

async function requestBrief(payment) {
  $("#working").classList.remove("hidden");
  $("#error").classList.add("hidden");
  try {
    const out = await api("/api/brief", {
      method: "POST",
      headers: { "X-PAYMENT": JSON.stringify(payment), "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: currentJob.id }),
    });
    $("#working").classList.add("hidden");
    renderBrief(out.brief, out.receipt, out.mock);
    loadLog();
  } catch (e) {
    $("#working").classList.add("hidden");
    showError("Brief failed: " + e.message);
  }
}

$("#ask-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  $("#result").classList.add("hidden");
  $("#error").classList.add("hidden");
  $("#ask-btn").disabled = true;
  try {
    const topic = $("#topic").value.trim();
    const q = await api("/api/quote", { method: "POST", body: JSON.stringify({ topic }) });
    currentJob = q.job;
    $("#quote-price").textContent = q.job.priceLabel;
    $("#quote-job").textContent = q.job.id;
    $("#pay-instructions").textContent = q.payInstructions;
    $("#quote").classList.remove("hidden");
  } catch (e) {
    showError("Quote failed: " + e.message);
  } finally {
    $("#ask-btn").disabled = false;
  }
});

$("#pay-mock").addEventListener("click", () => requestBrief({ mock: true }));

$("#pay-real").addEventListener("click", async () => {
  // Real path: visitor pays from their Concordium Wallet for Web, then pastes
  // the tx hash the wallet shows. A full wallet deep-link is wired once the
  // agent address is configured (see README.md, "real payment wiring").
  const txHash = prompt("After paying in your Concordium Wallet, paste the transaction hash here:");
  if (!txHash) return;
  requestBrief({ txHash: txHash.trim() });
});

$("#refresh-log").addEventListener("click", loadLog);

loadStatus();
loadLog();
