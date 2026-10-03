import { randomUUID } from "node:crypto";
import path from "node:path";
import { Client, Connection } from "@temporalio/client";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Opening, Status } from "./types";
import { readWaitlist } from "./waitlist";
import { fillOpeningWorkflow, getOpeningStatus, respondToOffer } from "./workflows";

const TASK_QUEUE = "juniper-salon";
const OFFER_TIMEOUT_MS = Number(process.env.OFFER_TIMEOUT_MS ?? 60_000);
// Prototype staff sign-in for Lena and Carla. Production would use real accounts.
const STAFF: Record<string, string> = {
  lena: process.env.LENA_PASSWORD ?? "juniper",
  carla: process.env.CARLA_PASSWORD ?? "juniper",
};

const app = express();
app.use(express.json());

// Signed-in staff sessions: cookie token -> staff name. In memory, so restarting the API signs everyone out.
const sessions = new Map<string, string>();
const SESSION_COOKIE = "staff_session";

function sessionToken(request: Request): string | undefined {
  const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(request.headers.cookie ?? "");
  return match?.[1];
}

function requireStaff(request: Request, response: Response, next: NextFunction): void {
  const token = sessionToken(request);
  if (token && sessions.has(token)) return next();
  if (request.originalUrl.startsWith("/api/")) {
    response.status(401).json({ error: "Staff sign-in required." });
  } else {
    response.redirect("/");
  }
}

app.post("/api/login", (request, response) => {
  const username = String(request.body?.username ?? "").trim().toLowerCase();
  const password = String(request.body?.password ?? "");
  if (!Object.hasOwn(STAFF, username) || STAFF[username] !== password) {
    response.status(401).json({ error: "Those staff credentials didn't match." });
    return;
  }
  const token = randomUUID();
  sessions.set(token, username);
  response.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/" });
  response.json({ name: username });
});

app.post("/api/logout", (request, response) => {
  const token = sessionToken(request);
  if (token) sessions.delete(token);
  response.clearCookie(SESSION_COOKIE, { path: "/" });
  response.json({ signedOut: true });
});

// Must come before express.static so the staff page itself is protected.
app.use(["/staff.html", "/staff.js", "/api/staff"], requireStaff);
app.use(express.static(path.join(process.cwd(), "public")));

let clientPromise: Promise<Client> | undefined;
function getClient(): Promise<Client> {
  clientPromise ??= Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  }).then((connection) => new Client({ connection, namespace: "default" }));
  return clientPromise;
}

// ---- Staff view ----

app.post("/api/staff/openings", async (request, response) => {
  const { date, time, service, stylist } = request.body ?? {};
  if (!date || !time || !service || !stylist) {
    response.status(400).json({ error: "Date, time, service, and stylist are required." });
    return;
  }
  const opening: Opening = { id: randomUUID().slice(0, 8), date, time, service, stylist };
  // Waitlist order is who asked first; only clients who want this service.
  const candidates = readWaitlist().filter((client) => client.services.includes(service));
  const workflowId = `opening-${opening.id}`;
  const client = await getClient();
  await client.workflow.start(fillOpeningWorkflow, {
    workflowId,
    taskQueue: TASK_QUEUE,
    args: [{ opening, candidates, offerTimeoutMs: OFFER_TIMEOUT_MS }],
  });
  response.status(201).json({ workflowId });
});

app.get("/api/staff/openings", async (_request, response) => {
  const client = await getClient();
  const openings: Array<Status & { workflowId: string }> = [];
  for await (const execution of client.workflow.list({
    query: "WorkflowType = 'fillOpeningWorkflow'",
  })) {
    try {
      const status = await client.workflow
        .getHandle(execution.workflowId)
        .query(getOpeningStatus);
      openings.push({ workflowId: execution.workflowId, ...status });
    } catch {
      // Skip openings that can't be read, e.g. ones started by older code.
    }
  }
  response.json(openings);
});

app.get("/api/staff/waitlist", (_request, response) => {
  response.json(readWaitlist());
});

// ---- Client view: no account, the unguessable link is the access ----

app.get("/api/offer/:workflowId/:offerId", async (request, response) => {
  const client = await getClient();
  try {
    const status = await client.workflow
      .getHandle(request.params.workflowId)
      .query(getOpeningStatus);
    const offer = status.offers.find((o) => o.offerId === request.params.offerId);
    if (offer) {
      // Only this client's own offer, never the waitlist or other clients.
      response.json({
        opening: status.opening,
        firstName: offer.clientName.split(" ")[0],
        outcome: offer.outcome,
        expiresAt: offer.expiresAt,
      });
      return;
    }
  } catch {
    // Unknown Workflow ID: fall through to 404.
  }
  response.status(404).json({ error: "We couldn't find this offer." });
});

app.post("/api/offer/:workflowId/:offerId", async (request, response) => {
  const decision = request.body?.decision;
  if (decision !== "accept" && decision !== "decline") {
    response.status(400).json({ error: "Please choose accept or decline." });
    return;
  }
  const client = await getClient();
  try {
    const message = await client.workflow
      .getHandle(request.params.workflowId)
      .executeUpdate(respondToOffer, {
        args: [{ offerId: request.params.offerId, decision }],
      });
    response.json({ message });
  } catch {
    response.status(409).json({
      error: "Sorry, this opening is no longer available. You're still on our waitlist.",
    });
  }
});

app.use(
  (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    console.error(error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected error",
    });
  },
);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Juniper Salon is available at http://localhost:${port}`));
