import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { WaitlistedClient } from "./types";

const file = path.join(process.cwd(), "data", "waitlist.json");

const seed: WaitlistedClient[] = [
  { id: "c1", name: "Maya Ortiz", phone: "555-0101", services: ["Cut", "Colour"] },
  { id: "c2", name: "Sam Patel", phone: "555-0102", services: ["Cut", "Blow-dry"] },
  { id: "c3", name: "Jo Becker", phone: "555-0103", services: ["Cut", "Colour", "Blow-dry"] },
  { id: "c4", name: "Ana Lima", phone: "555-0104", services: ["Colour"] },
  { id: "c5", name: "Rae Kim", phone: "555-0105", services: ["Cut"] },
];

function writeWaitlist(clients: WaitlistedClient[]): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(clients, null, 2));
}

export function readWaitlist(): WaitlistedClient[] {
  if (!existsSync(file)) writeWaitlist(seed);
  return JSON.parse(readFileSync(file, "utf8"));
}

export function removeClient(clientId: string): void {
  writeWaitlist(readWaitlist().filter((client) => client.id !== clientId));
}