/**
 * !!! STUB — NOT A REAL INTEGRATION !!!
 *
 * The project brief calls for logging transactions immutably via "eGovchain" and for
 * the Wallet/Expense Tracker module to read that ledger back. eBilihanReference/ does
 * NOT contain any eGovchain API documentation (no folder, no screenshots, no base URL,
 * no auth scheme) — unlike every other integration in this codebase, nothing here is
 * grounded in a real spec. Anything more specific than "an append-only ledger with a
 * txId" would be invented.
 *
 * This module fakes the shape of what such an API probably looks like (hash-chained
 * in-memory log) purely so the rest of the app (order checkout, expense tracker) has
 * something to call. Replace every function body here — and nothing else should need
 * to change — once real eGovchain API docs are available.
 */
import { createHash, randomUUID } from "node:crypto";

export type ChainEntry = {
  txId: string;
  prevHash: string;
  hash: string;
  payload: Record<string, unknown>;
  recordedAt: string;
};

const chain: ChainEntry[] = [];

function hashOf(prevHash: string, payload: Record<string, unknown>, recordedAt: string) {
  return createHash("sha256")
    .update(prevHash + JSON.stringify(payload) + recordedAt)
    .digest("hex");
}

export function appendTransaction(payload: Record<string, unknown>): ChainEntry {
  const prevHash = chain.length > 0 ? chain[chain.length - 1].hash : "genesis";
  const recordedAt = new Date().toISOString();
  const entry: ChainEntry = {
    txId: randomUUID(),
    prevHash,
    hash: hashOf(prevHash, payload, recordedAt),
    payload,
    recordedAt,
  };
  chain.push(entry);
  return entry;
}

export function listTransactions(ownerId: string): ChainEntry[] {
  return chain.filter((entry) => entry.payload.ownerId === ownerId);
}
