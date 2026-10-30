import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";
import { sha256Hex, newToken } from "./desk-auth.mjs";

export const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const KEY_RE = /^[a-f0-9]{64}$/;

// Published card. 5+ beds and houses are quoted by the desk.
export const CARD = { "1": 149, "2": 189, "3": 229, "4": 279 };

export function jobs() {
  return getStore("inner-turn-jobs", { consistency: "strong" });
}

export async function loadJob(store, code) {
  if (!CODE_RE.test(code)) return null;
  return store.get("job:" + code, { type: "json" });
}

export function newKey() {
  return newToken();
}

export function hashKey(key) {
  return sha256Hex("job-key\n" + key);
}

function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// Returns "manager", "cleaner" or "" for the private link key sent with a request.
export async function roleForKey(job, key) {
  if (!job || !job.keys || !KEY_RE.test(String(key || ""))) return "";
  const h = await hashKey(key);
  if (job.keys.manager && same(h, job.keys.manager)) return "manager";
  if (job.keys.cleaner && same(h, job.keys.cleaner)) return "cleaner";
  return "";
}

// Cleaner key is kept (server-side only) so the manager can re-copy the cleaner link.
export async function issueKeys(job) {
  const manager = newKey();
  const cleaner = newKey();
  job.keys = { manager: await hashKey(manager), cleaner: await hashKey(cleaner) };
  job.cleanerKey = cleaner;
  return { manager, cleaner };
}

export function depositPercent() {
  const n = Number(process.env.DEPOSIT_PERCENT);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 50;
}

export function newPayment(beds) {
  const price = CARD[String(beds)] || null;
  return {
    price,
    deposit: price ? Math.round((price * depositPercent()) / 100) : null,
    depositStatus: "due",
    balanceStatus: "open",
    payout: "none"
  };
}

export function bankDetails() {
  const name = process.env.BANK_ACCOUNT_NAME || "";
  const bsb = process.env.BANK_BSB || "";
  const account = process.env.BANK_ACCOUNT_NUMBER || "";
  if (!name || !bsb || !account) return null;
  return { name, bsb, account };
}

export function maskAccount(n) {
  const s = String(n || "");
  return s ? "•••" + s.slice(-3) : "";
}
