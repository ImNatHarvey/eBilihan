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

router.put("/:id", (req, res) => {
  const existing = products.get(req.params.id);
  if (!existing || existing.ownerId !== req.ownerId) return res.status(404).json({ error: "Product not found" });
  const updated: Product = { ...existing, ...req.body, id: existing.id, ownerId: existing.ownerId, updatedAt: new Date().toISOString() };
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
