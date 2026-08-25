import { Router } from "express";
import { randomUUID } from "node:crypto";
import { requireAuth } from "../middleware/requireAuth.js";
import { products, type Product } from "../store/db.js";

const router = Router();
router.use(requireAuth);

const TYPE_EMOJI: Record<string, string> = {
  beverage: "🥤",
  snack: "🥔",
  noodles: "🍜",
  staple: "🍚",
  dairy: "🥛",
  canned: "🥫",
  condiment: "🧂",
  candy: "🍬",
  cigarette: "🚬",
  toiletries: "🧴",
  general: "📦",
};

/** Best-effort emoji for a product with no explicit thumbnail, based on its type. */
function guessThumbnail(type: string): string {
  return TYPE_EMOJI[type.toLowerCase()] ?? "📦";
}

/** Generates a unique 13-digit EAN-13-shaped barcode for products with none scanned. */
function generateBarcode(): string {
  const body = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
  const checksum =
    (10 -
      (body
        .split("")
        .reduce((sum, digit, i) => sum + Number(digit) * (i % 2 === 0 ? 1 : 3), 0) %
        10)) %
    10;
  return body + checksum;
}

router.get("/", (req, res) => {
  const list = [...products.values()].filter((p) => p.ownerId === req.ownerId);
  res.json({ data: list });
});

router.post("/", (req, res) => {
  const { name, type, thumbnail, boughtPrice, sellingPrice, quantity, barcode, lowStockThreshold } = req.body as Partial<Product>;
  if (!name || sellingPrice == null || quantity == null) {
    return res.status(422).json({ error: "name, sellingPrice, and quantity are required" });
  }
  const now = new Date().toISOString();
  const productType = type ?? "general";
  const product: Product = {
    id: randomUUID(),
    ownerId: req.ownerId!,
    name,
    type: productType,
    thumbnail: thumbnail || guessThumbnail(productType),
    boughtPrice: boughtPrice ?? 0,
    sellingPrice,
    quantity,
    barcode: barcode || generateBarcode(),
    lowStockThreshold: lowStockThreshold ?? 5,
    createdAt: now,
    updatedAt: now,
  };
  products.set(product.id, product);
  res.status(201).json({ data: product });
});

/**
 * Explicit allow-list rather than `{ ...existing, ...req.body }`. The spread let a client
 * write any field it liked — including `createdAt`, and (before the id/ownerId guards were
 * added) identity fields. Listing what may change is the only version of this that stays
 * correct as the Product type grows.
 */
const EDITABLE_PRODUCT_FIELDS = [
  "name",
  "type",
  "thumbnail",
  "boughtPrice",
  "sellingPrice",
  "quantity",
  "barcode",
  "lowStockThreshold",
] as const satisfies readonly (keyof Product)[];

router.put("/:id", (req, res) => {
  const existing = products.get(req.params.id);
  if (!existing || existing.ownerId !== req.ownerId) return res.status(404).json({ error: "Product not found" });

  const updated: Product = { ...existing, updatedAt: new Date().toISOString() };
  for (const field of EDITABLE_PRODUCT_FIELDS) {
    const value = (req.body as Record<string, unknown>)[field];
    if (value !== undefined) {
      (updated as Record<string, unknown>)[field] = value;
    }
  }

  if (typeof updated.sellingPrice !== "number" || updated.sellingPrice < 0) {
    return res.status(422).json({ error: "sellingPrice must be a non-negative number" });
  }
  if (!Number.isInteger(updated.quantity) || updated.quantity < 0) {
    return res.status(422).json({ error: "quantity must be a non-negative whole number" });
  }

  products.set(updated.id, updated);
  res.json({ data: updated });
});

router.delete("/:id", (req, res) => {
  const existing = products.get(req.params.id);
  if (!existing || existing.ownerId !== req.ownerId) return res.status(404).json({ error: "Product not found" });
  products.delete(req.params.id);
  res.status(204).end();
});

router.get("/by-barcode/:barcode", (req, res) => {
  const product = [...products.values()].find((p) => p.ownerId === req.ownerId && p.barcode === req.params.barcode);
  if (!product) return res.status(404).json({ error: "No product with that barcode" });
  res.json({ data: product });
});

export default router;
