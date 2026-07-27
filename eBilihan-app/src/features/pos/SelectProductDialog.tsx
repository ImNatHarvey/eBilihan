import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ShoppingCart, Plus, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listProducts } from "@/api/products";
import { useCartStore } from "@/store/cartStore";

/** Alternative to barcode scanning — pick straight from the catalogue (handy without a physical barcode to scan). */
export function SelectProductDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: listProducts });
  const { items, addProduct, setQuantity } = useCartStore();
  const [query, setQuery] = useState("");

  const visible = query ? products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())) : products;

  function quantityInCart(productId: string): number {
    return items.find((i) => i.productId === productId)?.quantity ?? 0;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Product</DialogTitle>
        </DialogHeader>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-ink/30" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products..." className="pl-9" />
        </div>
        <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
          {visible.map((product) => {
            const qty = quantityInCart(product.id);
            return (
              <div key={product.id} className="flex items-center gap-2.5 rounded-xl border border-brand-ink/10 p-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue-light text-brand-blue">
                  <ShoppingCart className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand-ink">{product.name}</p>
                  <p className="text-[10px] text-brand-ink/40">₱{product.sellingPrice.toFixed(2)} · {product.quantity} in stock</p>
                </div>

                {qty > 0 ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQuantity(product.id, qty - 1)}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-4 text-center text-sm font-semibold text-brand-ink">{qty}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQuantity(product.id, qty + 1)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button size="icon" className="h-7 w-7 shrink-0" onClick={() => addProduct(product)} aria-label={`Add ${product.name}`}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
          {visible.length === 0 && <p className="py-4 text-center text-sm text-brand-ink/40">No products found.</p>}
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
