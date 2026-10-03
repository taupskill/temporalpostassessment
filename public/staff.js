const form = document.querySelector("#new-opening");
const openingsList = document.querySelector("#openings");
const waitlistList = document.querySelector("#waitlist");
const phaseLabel = { offering: "Contacting clients", filled: "Filled", unfilled: "No one available" };
const esc = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function renderOpening(o) {
  const steps = o.offers
    .map((offer) => {
      const waiting = offer.outcome === "waiting";
      const link = `/offer.html?id=${encodeURIComponent(o.workflowId)}&offer=${offer.offerId}`;
      return `<li class="step ${offer.outcome.replace(" ", "-")}">
        <span>${esc(offer.clientName)}</span>
        <span class="badge">${waiting ? "Waiting for reply" : esc(offer.outcome)}</span>
        ${waiting ? `<a href="${link}" target="_blank">Open their offer link</a>` : ""}
      </li>`;
    })
    .join("");
  return `<article class="card">
    <div class="row">
      <h3>${esc(o.opening.service)} with ${esc(o.opening.stylist)}</h3>
      <span class="pill ${o.phase}">${phaseLabel[o.phase]}</span>
    </div>
    <p class="muted">${esc(o.opening.date)} at ${esc(o.opening.time)}</p>
    <ol class="steps">${steps || '<li class="muted">Starting…</li>'}</ol>
  </article>`;
}

// Session expired or API restarted: send staff back to the sign-in form.
async function staffFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401) {
    location.href = "/";
    throw new Error("Signed out");
  }
  return response;
}

async function refresh() {
  const [openings, waitlist] = await Promise.all([
    staffFetch("/api/staff/openings").then((r) => r.json()),
    staffFetch("/api/staff/waitlist").then((r) => r.json()),
  ]);
  openingsList.innerHTML = openings.length
    ? openings.map(renderOpening).join("")
    : '<p class="muted">No openings yet.</p>';
  waitlistList.innerHTML = waitlist.length
    ? waitlist
        .map((c) => `<li>${esc(c.name)} <span class="muted">· ${esc(c.services.join(", "))}</span></li>`)
        .join("")
    : '<li class="muted">The waitlist is empty.</li>';
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  await staffFetch("/api/staff/openings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.fromEntries(new FormData(form))),
  });
  button.disabled = false;
  form.reset();
  await refresh();
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  location.href = "/";
});

refresh().catch(console.error);
setInterval(() => refresh().catch(console.error), 2000);
