const params = new URLSearchParams(location.search);
const endpoint = `/api/offer/${encodeURIComponent(params.get("id") ?? "")}/${encodeURIComponent(params.get("offer") ?? "")}`;
const box = document.querySelector("#offer");
const esc = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function show(title, text) {
  box.innerHTML = `<h1>${esc(title)}</h1><p class="lead">${esc(text)}</p>`;
}

async function load() {
  const response = await fetch(endpoint);
  if (!response.ok) return show("Offer not found", "This link may be incorrect. Please contact the salon.");
  const offer = await response.json();
  const when = new Date(`${offer.opening.date}T${offer.opening.time}`).toLocaleString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (offer.outcome === "accepted") return show("You're booked!", `${when}. See you then.`);
  if (offer.outcome !== "waiting") {
    return show("This offer has ended", "That opening is no longer available, but you're still on our waitlist.");
  }
  const replyBy = new Date(offer.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  box.innerHTML = `
    <p>Hi ${esc(offer.firstName)}, an earlier spot just opened up:</p>
    <h1>${esc(when)}</h1>
    <p class="lead">${esc(offer.opening.service)} with ${esc(offer.opening.stylist)}</p>
    <p class="muted">Please reply by ${esc(replyBy)}.</p>
    <button data-decision="accept">Yes, book me</button>
    <button class="secondary" data-decision="decline">No thanks</button>`;
}

box.addEventListener("click", async (event) => {
  const decision = event.target.dataset?.decision;
  if (!decision) return;
  box.querySelectorAll("button").forEach((b) => (b.disabled = true));
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  const body = await response.json();
  if (!response.ok) return show("Sorry!", body.error);
  show(decision === "accept" ? "You're booked!" : "Thanks for letting us know", body.message);
});

load().catch(() => show("Something went wrong", "Please try again in a moment."));
