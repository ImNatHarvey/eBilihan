import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ShoppingCart, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listProducts } from "@/api/products";
import { useCartStore } from "@/store/cartStore";

/** Alternative to barcode scanning — pick straight from the catalogue (handy without a physical barcode to scan). */
export function SelectProductDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: listProducts });
  const addProduct = useCartStore((s) => s.addProduct);
  const [query, setQuery] = useState("");
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const visible = query
    ? products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : products;

  function handleAdd(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    addProduct(product);
    setJustAdded(productId);
    setTimeout(() => setJustAdded(null), 800);
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
          {visible.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => handleAdd(product.id)}
              className="flex items-center gap-2.5 rounded-xl border border-brand-ink/10 p-2 text-left transition-colors active:bg-brand-blue-light"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue-light text-brand-blue">
                <ShoppingCart className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-brand-ink">{product.name}</p>
                <p className="text-[10px] text-brand-ink/40">{product.quantity} in stock</p>
              </div>
              <span className="shrink-0 text-sm font-bold text-brand-blue">₱{product.sellingPrice.toFixed(2)}</span>
              {justAdded === product.id && <Check className="h-4 w-4 shrink-0 text-green-600" />}
            </button>
          ))}
          {visible.length === 0 && <p className="py-4 text-center text-sm text-brand-ink/40">No products found.</p>}
        </div>
        <Button className="mt-3" variant="outline" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
