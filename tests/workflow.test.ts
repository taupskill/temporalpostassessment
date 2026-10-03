import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorkflowHandle } from "@temporalio/client";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type { Opening, WaitlistedClient } from "../src/types";
import { fillOpeningWorkflow, getOpeningStatus, respondToOffer } from "../src/workflows";

type Handle = WorkflowHandle<typeof fillOpeningWorkflow>;
const opening: Opening = { id: "test", date: "2026-10-03", time: "14:00", service: "Cut", stylist: "Carla" };
const client = (id: string): WaitlistedClient => ({
  id,
  name: `Client ${id}`,
  phone: "555-0100",
  services: ["Cut"],
});

async function runOpening(
  candidates: WaitlistedClient[],
  offerTimeoutMs: number,
  scenario: (handle: Handle, removed: string[]) => Promise<void>,
): Promise<void> {
  const environment = await TestWorkflowEnvironment.createLocal();
  const removed: string[] = [];
  try {
    const worker = await Worker.create({
      connection: environment.nativeConnection,
      taskQueue: "salon-test",
      workflowsPath: require.resolve("../src/workflows"),
      activities: {
        sendOffer: async () => {},
        removeFromWaitlist: async (clientId: string) => {
          removed.push(clientId);
        },
      },
    });
    await worker.runUntil(async () => {
      const handle = await environment.client.workflow.start(fillOpeningWorkflow, {
        workflowId: `opening-test-${Date.now()}`,
        taskQueue: "salon-test",
        args: [{ opening, candidates, offerTimeoutMs }],
      });
      await scenario(handle, removed);
    });
  } finally {
    await environment.teardown();
  }
}

async function waitForOffer(handle: Handle, number: number) {
  for (;;) {
    const { offers } = await handle.query(getOpeningStatus);
    if (offers.length >= number) return offers[number - 1];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

test("an unanswered offer times out and the opening stays unfilled", async () => {
  await runOpening([client("a")], 500, async (handle, removed) => {
    const result = await handle.result();
    assert.equal(result.phase, "unfilled");
    assert.equal(result.offers[0].outcome, "timed out");
    assert.deepEqual(removed, []);
  });
});

test("a decline moves to the next client, who books, and a late answer is rejected", async () => {
  await runOpening([client("a"), client("b")], 30_000, async (handle, removed) => {
    const first = await waitForOffer(handle, 1);
    await handle.executeUpdate(respondToOffer, {
      args: [{ offerId: first.offerId, decision: "decline" }],
    });

    const second = await waitForOffer(handle, 2);
    await handle.executeUpdate(respondToOffer, {
      args: [{ offerId: second.offerId, decision: "accept" }],
    });

    const result = await handle.result();
    assert.equal(result.phase, "filled");
    assert.equal(result.filledBy, "Client b");
    assert.deepEqual(removed, ["b"]); // "a" declined and stays on the waitlist

    await assert.rejects(
      handle.executeUpdate(respondToOffer, {
        args: [{ offerId: first.offerId, decision: "accept" }],
      }),
    );
  });
});
