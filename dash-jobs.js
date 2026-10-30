// Desk view of job threads: bank deposits, balances, cleaner payouts, link reissue.
(function () {
  const listEl = document.getElementById("jobs-list");
  const msgEl = document.getElementById("jobs-msg");
  const searchEl = document.getElementById("jobs-search");
  if (!listEl) return;

  let jobs = [];

  function h(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function money(n) {
    return n == null ? "quote" : "$" + n;
  }

  const DEPOSIT = { due: "Deposit due", sent: "Deposit sent — check bank", received: "Deposit received" };
  const BALANCE = { open: "Balance open", sent: "Balance sent — check bank", paid: "Paid in full" };
  const PAYOUT = { none: "No payout details", saved: "Payout details saved", paid: "Cleaner paid" };

  async function call(method, body) {
    return deskFetch("/api/desk-jobs", { method, body });
  }

  function row(j) {
    const p = j.payment || {};
    const pd = j.payoutDetails;
    const buttons = [];
    if (p.depositStatus !== "received") buttons.push(["deposit-received", "Deposit received"]);
    if (p.balanceStatus !== "paid") buttons.push(["balance-received", "Balance received"]);
    if (pd && p.payout !== "paid" && j.status === "DONE") buttons.push(["payout-paid", "Cleaner paid"]);
    buttons.push(["set-price", "Set price"], ["reissue", "New private links"]);
    return `<li class="job-row" data-code="${h(j.code)}">
      <div class="job-head">
        <strong>${h(j.code)}</strong>
        <span class="job-status s-${h(j.status)}">${h(j.status)}</span>
        <span>${h(j.suburb)} · ${h(j.beds)}-bed${j.street ? " · " + h(j.street) : ""}</span>
        ${j.legacy ? '<em class="job-legacy">older thread, no private links yet</em>' : ""}
      </div>
      <p class="job-people">Manager ${h(j.manager?.name || "—")} ${h(j.manager?.email || "")} · Cleaner ${h(j.cleaner?.name || "not joined")} ${h(j.cleaner?.email || "")}</p>
      <p class="job-pay">Price ${money(p.price)} · Deposit ${money(p.deposit)} · <b>${h(DEPOSIT[p.depositStatus] || "")}</b> · <b>${h(BALANCE[p.balanceStatus] || "")}</b> · <b>${h(PAYOUT[p.payout] || "")}</b></p>
      ${pd ? `<p class="job-payout">Pay to: ${h(pd.name)} · BSB ${h(pd.bsb)} · Acc ${h(pd.account)} · saved ${h(new Date(pd.at).toLocaleString("en-AU"))}</p>` : ""}
      <div class="job-actions">${buttons.map(([a, l]) => `<button type="button" data-act="${a}">${h(l)}</button>`).join("")}</div>
      <p class="job-out" hidden></p>
    </li>`;
  }

  function draw() {
    const q = (searchEl?.value || "").toLowerCase().trim();
    const shown = jobs.filter((j) =>
      !q || [j.code, j.suburb, j.manager?.name, j.cleaner?.name].join(" ").toLowerCase().includes(q)
    );
    listEl.innerHTML = shown.map(row).join("") || "<li class='pipe-empty'>No job threads yet.</li>";
  }

  async function refresh() {
    try {
      const data = await call("GET");
      jobs = data.jobs || [];
      msgEl.textContent = jobs.length + " job thread(s). Newest first.";
      draw();
    } catch (err) {
      msgEl.textContent = err.message === "unlock" || err.message === "identity" ? "Unlock the desk to see jobs." : "Could not load jobs.";
    }
  }

  listEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const li = btn.closest(".job-row");
    const code = li.dataset.code;
    const out = li.querySelector(".job-out");
    const act = btn.dataset.act;
    const body = { action: act, code };
    if (act === "set-price") {
      const price = prompt("Turn price in dollars for " + code);
      if (!price) return;
      const deposit = prompt("Deposit due before the turn (dollars)", String(Math.round(Number(price) / 2)));
      if (deposit == null) return;
      body.price = price;
      body.deposit = deposit;
    }
    if (act === "reissue" && !confirm("Make new private links for " + code + "? The old manager and cleaner links stop working.")) return;
    if (act === "payout-paid" && !confirm("Mark the cleaner as paid for " + code + "? Do this after the bank transfer has gone.")) return;
    btn.disabled = true;
    try {
      const data = await call("POST", body);
      jobs = jobs.map((j) => (j.code === code ? data.job : j));
      draw();
      if (data.links) {
        const base = location.origin + "/app?code=" + code + "#k=";
        const li2 = listEl.querySelector(`[data-code="${code}"] .job-out`);
        li2.hidden = false;
        li2.textContent = "Manager link: " + base + data.links.manager + "\nCleaner link: " + base + data.links.cleaner;
      }
    } catch (err) {
      out.hidden = false;
      out.textContent = err.message;
      btn.disabled = false;
    }
  });

  searchEl?.addEventListener("input", draw);
  document.getElementById("jobs-refresh")?.addEventListener("click", refresh);

  window.deskReady.then((ok) => ok && refresh());
})();
