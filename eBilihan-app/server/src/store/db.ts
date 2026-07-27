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

/** PSGC-coded location, captured during registration via the Location picker (routes/locations.ts). */
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

export type StoreOwner = {
  id: string;
  egovphUniqid: string;
  email: string;
  mobile: string;
  fullName: string;
  storeName: string;
  location: StoreLocation;
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
 * mobile -> { otp, expiresAtMs }, used for BOTH the registration OTP flow and the
 * mobile-number + eMessage login flow (see routes/auth.ts) — same shape, same purpose
 * ("prove control of this mobile number"), just triggered from two different screens.
 */
export const pendingOtps = new Map<string, { otp: string; expiresAtMs: number }>();

/**
 * Gives a brand-new store a starter catalogue instead of a blank product list —
 * called once, right after a StoreOwner is created (register/confirm and the
 * login-auto-provision path in routes/auth.ts). Emoji `thumbnail`s are the same
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
