/**
 * In-memory data store for the eBilihan MVP scaffold.
 *
 * Nothing here is persisted to disk — restarting the server drops all data.
 * This exists so the API layer and UI have something real to read/write
 * while the project doesn't yet have a database. Swap for Postgres/SQLite
 * behind the same function signatures when ready; nothing above this layer
 * should need to change.
 */
import { randomUUID } from "node:crypto";

/** PSGC-coded location, captured on the onboarding screen via the Location picker (routes/locations.ts). */
export type StoreLocation = {
  regionCode: string;
  regionName: string;
  provinceCode: string;
  provinceName: string;
  cityCode: string;
  cityName: string;
  barangayCode: string;
  barangayName: string;
};

/**
 * Everything from `egovphUniqid` down to `address` is mirrored verbatim from the eGov
 * SSO profile (POST /api/partner/sso_authentication) and is read-only in eBilihan —
 * eGovPH owns those fields and is the only place a citizen may change them.
 *
 * Keeping the name parts split (rather than only `fullName`) is deliberate: eReport's
 * submit_complaint requires `first_name`, `last_name` and `gender` as separate required
 * fields, and splitting a display name on whitespace to recover them is guesswork that
 * breaks on middle names and suffixes. SSO hands us all of them properly separated.
 *
 * `storeName` and `location` are eBilihan's own — empty until onboarding completes.
 */
export type StoreOwner = {
  id: string;
  egovphUniqid: string;
  email: string;
  mobile: string;
  fullName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  birthDate: string;
  gender: string;
  photo: string;
  address: string;
  storeName: string;
  location: StoreLocation | null;
  createdAt: string;
};

export type Product = {
  id: string;
  ownerId: string;
  name: string;
  type: string;
  thumbnail: string;
  boughtPrice: number;
  sellingPrice: number;
  quantity: number;
  barcode: string;
  lowStockThreshold: number;
  createdAt: string;
  updatedAt: string;
};

export type OrderItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type Order = {
  id: string;
  ownerId: string;
  items: OrderItem[];
  total: number;
  paymentMethod: "cash" | "gcash";
  paymentStatus: "pending" | "paid" | "voided";
  egovpayTransactionUuid?: string;
  chainTxId?: string;
  createdAt: string;
};

export type Loan = {
  id: string;
  ownerId: string;
  borrowerEgovphUniqid: string;
  borrowerName: string;
  borrowerPhilsysNumber: string;
  principal: number;
  balance: number;
  termsOfPaymentText: string;
  status: "active" | "paid" | "defaulted";
  agreementPdfBase64?: string;
  createdAt: string;
};

export const owners = new Map<string, StoreOwner>();
export const products = new Map<string, Product>();
export const orders = new Map<string, Order>();
export const loans = new Map<string, Loan>();

/**
 * mobile -> { otp, expiresAtMs }. Sign-in no longer uses this — eGovPH owns
 * authentication now and runs its own OTP + PIN screens (routes/auth.ts). What remains
 * is the loan-confirmation OTP in routes/loans.ts: a deliberate second factor before
 * money is recorded against a borrower's verified identity, which is eBilihan's own
 * business rule rather than an identity check, and so is ours to run.
 */
export const pendingOtps = new Map<string, { otp: string; expiresAtMs: number }>();

/**
 * A borrower identity that eVerify actually matched, held server-side between the
 * verification call and loan creation.
 *
 * This exists because the identity gate has to live somewhere the client cannot reach.
 * Previously the verified name was returned to the browser and posted back with the loan,
 * which meant the whole eVerify check was advisory: anyone could POST a loan naming
 * whoever they liked and the server would write it down. Now `/loans/verify-borrower`
 * returns only an opaque `verificationId`, and loan creation reads the borrower's
 * identity from here — so a borrower's name on a loan can only have come from a real
 * PhilSys match made by that same owner, minutes earlier.
 *
 * Short-lived on purpose: a verification is evidence that someone stood in front of a
 * camera just now, and that claim goes stale.
 */
export type VerifiedBorrower = {
  ownerId: string;
  borrowerName: string;
  borrowerEgovphUniqid: string;
  borrowerPhilsysNumber: string;
  livenessSessionId: string;
  expiresAtMs: number;
};

export const VERIFICATION_TTL_MS = 10 * 60_000;

/** verificationId -> the matched borrower. See VerifiedBorrower above. */
export const verifiedBorrowers = new Map<string, VerifiedBorrower>();

/**
 * A standalone Face Liveness session that passed the documented threshold, recorded
 * server-side for the same reason as VerifiedBorrower: the high-value loan gate has to be
 * enforced somewhere a client can't simply decline to call.
 *
 * Keyed by the session token, so a token can be spent exactly once.
 */
export type PassedLivenessCheck = { ownerId: string; expiresAtMs: number };

export const passedLivenessChecks = new Map<string, PassedLivenessCheck>();

/** Drops expired entries. Called opportunistically on read — no timers to leak. */
export function pruneExpired(): void {
  const now = Date.now();
  for (const [key, value] of verifiedBorrowers) {
    if (value.expiresAtMs < now) verifiedBorrowers.delete(key);
  }
  for (const [key, value] of passedLivenessChecks) {
    if (value.expiresAtMs < now) passedLivenessChecks.delete(key);
  }
  for (const [key, value] of pendingOtps) {
    if (value.expiresAtMs < now) pendingOtps.delete(key);
  }
}

/**
 * Gives a brand-new store a starter catalogue instead of a blank product list —
 * called once, right after a StoreOwner is auto-registered from an eGov SSO profile
 * (routes/auth.ts `registerOwnerFromProfile`). Emoji `thumbnail`s are the same
 * lightweight per-product icon approach as the ebilihan-hackathon prototype
 * (`product.thumbnail ?? '📦'`), not a real image asset pipeline.
 */
export function seedDemoProducts(ownerId: string): void {
  const now = new Date().toISOString();
  const presets: Array<Omit<Product, "id" | "ownerId" | "createdAt" | "updatedAt">> = [
    { name: "Coke 1.5L", type: "beverage", thumbnail: "🥤", boughtPrice: 45, sellingPrice: 60, quantity: 24, barcode: "4800016671012", lowStockThreshold: 5 },
    { name: "Lucky Me Pancit Canton", type: "noodles", thumbnail: "🍜", boughtPrice: 12, sellingPrice: 15, quantity: 50, barcode: "4800092950014", lowStockThreshold: 10 },
    { name: "Piattos", type: "snack", thumbnail: "🥔", boughtPrice: 15, sellingPrice: 20, quantity: 30, barcode: "4800371100016", lowStockThreshold: 8 },
    { name: "Rice (1kg)", type: "staple", thumbnail: "🍚", boughtPrice: 45, sellingPrice: 55, quantity: 40, barcode: "0000000010012", lowStockThreshold: 10 },
    { name: "Itlog (per piece)", type: "staple", thumbnail: "🥚", boughtPrice: 6, sellingPrice: 8, quantity: 60, barcode: "0000000020013", lowStockThreshold: 12 },
    { name: "Bear Brand Milk", type: "dairy", thumbnail: "🥛", boughtPrice: 10, sellingPrice: 13, quantity: 3, barcode: "4800361250016", lowStockThreshold: 5 },
  ];

  for (const preset of presets) {
    const product: Product = { id: randomUUID(), ownerId, createdAt: now, updatedAt: now, ...preset };
    products.set(product.id, product);
  }
}
