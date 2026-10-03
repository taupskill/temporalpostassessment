export type Opening = {
  id: string;
  date: string;
  time: string;
  service: string;
  stylist: string;
}

export type WaitlistedClient = {
  id: string;
  name: string;
  phone: string;
  services: string[];
}

export type OfferOutcome = "waiting" | "accepted" | "declined" | "timed out";

export type Offer = {
  offerId: string;
  clientId: string;
  clientName: string;
  outcome: OfferOutcome;
  expiresAt: string;
}

export type Status = {
  opening: Opening;
  phase: "offering" | "filled" | "unfilled";
  offers: Offer[];
  filledBy?: string;
}

export type FillOpeningInput = {
  opening: Opening;
  candidates: WaitlistedClient[];
  offerTimeoutMs: number;
}

export type OfferResponse = {
  offerId: string;
  decision: "accept" | "decline";
}
