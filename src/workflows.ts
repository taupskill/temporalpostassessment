import {
  condition,
  defineQuery,
  defineUpdate,
  proxyActivities,
  setHandler,
  uuid4,
  workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "./activities";
import type { FillOpeningInput, Offer, OfferResponse, Status } from "./types";

const { sendOffer, removeFromWaitlist } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 seconds",
});

export const respondToOffer = defineUpdate<string, [OfferResponse]>("respondToOffer");
export const getOpeningStatus = defineQuery<Status>("getOpeningStatus");

export async function fillOpeningWorkflow({
  opening,
  candidates,
  offerTimeoutMs,
}: FillOpeningInput): Promise<Status> {
  const status: Status = { opening, phase: "offering", offers: [] };
  const latestOffer = () => status.offers.at(-1);

  setHandler(getOpeningStatus, () => status);
  setHandler(
    respondToOffer,
    ({ decision }) => {
      latestOffer()!.outcome = decision === "accept" ? "accepted" : "declined";
      return decision === "accept"
        ? "You're booked. See you soon!"
        : "Thanks for letting us know. You're still on our waitlist.";
    },
    {
      validator: ({ offerId }) => {
        const offer = latestOffer();
        if (!offer || offer.offerId !== offerId || offer.outcome !== "waiting") {
          throw new Error("This offer is no longer available.");
        }
      },
    },
  );

  for (const client of candidates) {
    const offer: Offer = {
      offerId: uuid4(),
      clientId: client.id,
      clientName: client.name,
      outcome: "waiting",
      expiresAt: new Date(Date.now() + offerTimeoutMs).toISOString(),
    };
    status.offers.push(offer);
    await sendOffer(
      client,
      opening,
      `/offer.html?id=${workflowInfo().workflowId}&offer=${offer.offerId}`,
    );

    const answered = await condition(() => offer.outcome !== "waiting", offerTimeoutMs);
    if (!answered) {
      offer.outcome = "timed out";
    } else if (offer.outcome === "accepted") {
      status.phase = "filled";
      status.filledBy = client.name;
      await removeFromWaitlist(client.id);
      return status;
    }
  }

  status.phase = "unfilled";
  return status;
}
