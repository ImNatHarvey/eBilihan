import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, TriangleAlert, Package, ChevronRight, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, StatTile } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductFormDialog } from "./ProductFormDialog";
import { listProducts } from "@/api/products";
import type { Product } from "@/types";

/** Cosmetic short ID shown under the product name — not a real stored field, just a friendlier stand-in for the 13-digit barcode. */
function shortCode(product: Product): string {
  const initials = product.name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "PR";
  const digits = product.barcode.slice(-4).padStart(4, "0");
  return `${initials}${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/** §2 — Product Management: CRUD + barcode scan/generate. UI structure ported from the ebilihan-hackathon prototype's ProductListPage. */
export function ProductsPage() {
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: listProducts });
  const [query, setQuery] = useState("");
  const [formTarget, setFormTarget] = useState<Product | "new" | null>(null);

  const totalItems = products.reduce((sum, p) => sum + p.quantity, 0);
  const categoryCount = new Set(products.map((p) => p.type.toLowerCase())).size;

  const visible = useMemo(() => {
    if (!query) return [...products].sort((a, b) => a.name.localeCompare(b.name));
    const needle = query.toLowerCase();
    return products
      .filter((p) => p.name.toLowerCase().includes(needle) || p.barcode.includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, query]);

  return (
    <div className="flex flex-col gap-3 p-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-brand-ink">Products</h1>
          <p className="text-xs text-brand-ink/50">{products.length} item(s)</p>
        </div>
        <Button size="icon" onClick={() => setFormTarget("new")} aria-label="New product">
          <Plus />
        </Button>
      </div>

      {products.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Total Products" value={String(products.length)} tone="blue" icon={<Package className="h-3.5 w-3.5" />} />
          <StatTile label="Total Items" value={String(totalItems)} tone="green" icon={<ShoppingCart className="h-3.5 w-3.5" />} />
          <StatTile label="Categories" value={String(categoryCount)} tone="yellow" icon={<TriangleAlert className="h-3.5 w-3.5" />} />
        </div>
      )}

      {products.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-ink/30" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or barcode..." className="pl-9" />
        </div>
      )}

      <div className="flex flex-col gap-2">
        {visible.map((product) => {
          const low = product.quantity <= product.lowStockThreshold;
          return (
            <button key={product.id} type="button" onClick={() => setFormTarget(product)} className="w-full text-left">
              <Card className="rounded-2xl shadow-md transition-transform active:scale-[0.99]">
                <CardContent className="flex items-center gap-3 pt-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue-light text-brand-blue">
                    <ShoppingCart className="h-5 w-5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-brand-ink">{product.name}</p>
                      <p className="shrink-0 text-sm font-black text-brand-blue">₱{product.sellingPrice.toFixed(2)}</p>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <p className="font-mono text-[10px] text-brand-ink/40">{shortCode(product)}</p>
                      <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                        {product.type}
                      </Badge>
                    </div>
                    <p className={`mt-1 text-[11px] font-semibold ${low ? "text-yellow-700" : "text-brand-ink/50"}`}>
                      {product.quantity} pcs in stock
                    </p>
                  </div>

                  <ChevronRight className="h-4 w-4 shrink-0 text-brand-ink/30" />
                </CardContent>
              </Card>
            </button>
          );
        })}

        {products.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-brand-ink/20 py-10 text-center">
            <Package className="h-8 w-8 text-brand-ink/30" />
            <p className="text-sm text-brand-ink/50">No products yet — tap + to add your first one.</p>
          </div>
        )}
        {products.length > 0 && visible.length === 0 && (
          <p className="py-6 text-center text-sm text-brand-ink/40">No matching products.</p>
        )}
      </div>

      <ProductFormDialog
        product={formTarget && formTarget !== "new" ? formTarget : undefined}
        open={formTarget !== null}
        onOpenChange={(open) => !open && setFormTarget(null)}
      />
    </div>
  );
}
