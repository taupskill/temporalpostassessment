import type { Opening, WaitlistedClient } from "./types";
import { removeClient } from "./waitlist";

// Stand-in for an SMS provider: the offer link is printed instead of texted.
export async function sendOffer(
  client: WaitlistedClient,
  opening: Opening,
  link: string,
): Promise<void> {
  const firstName = client.name.split(" ")[0];
  console.log(
    `[text to ${client.phone}] Hi ${firstName}, a ${opening.service} spot opened on ` +
      `${opening.date} at ${opening.time}. Tap to reply: http://localhost:3000${link}`,
  );
}

export async function removeFromWaitlist(clientId: string): Promise<void> {
  removeClient(clientId);
}
