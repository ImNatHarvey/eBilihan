import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ScanLine, Trash2, Search, TriangleAlert, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, StatTile } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { listProducts, createProduct, deleteProduct } from "@/api/products";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

const emptyForm = { name: "", type: "", boughtPrice: "", sellingPrice: "", quantity: "", barcode: "" };

function marginPercent(sellingPrice: number, boughtPrice: number): number {
  if (sellingPrice <= 0) return 0;
  return ((sellingPrice - boughtPrice) / sellingPrice) * 100;
}

/** §2 — Product Management: CRUD + barcode scan/generate. UI structure ported from the ebilihan-hackathon prototype's ProductListPage. */
export function ProductsPage() {
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: listProducts });
  const { scanOnce } = useBarcodeScanner();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const createMutation = useMutation({
    mutationFn: () =>
      createProduct({
        name: form.name,
        type: form.type || "general",
        boughtPrice: Number(form.boughtPrice) || 0,
        sellingPrice: Number(form.sellingPrice),
        quantity: Number(form.quantity),
        barcode: form.barcode || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setForm(emptyForm);
      setOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  async function handleScanBarcode() {
    const barcode = await scanOnce();
    if (barcode) setForm((f) => ({ ...f, barcode }));
  }

  const lowStockCount = products.filter((p) => p.quantity <= p.lowStockThreshold).length;
  const inventoryValue = products.reduce((sum, p) => sum + p.boughtPrice * p.quantity, 0);

  const visible = useMemo(() => {
    let list = products;
    if (lowStockOnly) list = list.filter((p) => p.quantity <= p.lowStockThreshold);
    if (query) {
      const needle = query.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(needle) || p.barcode.includes(needle));
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, lowStockOnly, query]);

  return (
    <div className="flex flex-col gap-3 p-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-brand-ink">Products</h1>
          <p className="text-xs text-brand-ink/50">{products.length} item(s)</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus /> New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Product</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="type">Type</Label>
                <Input id="type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="e.g. beverage, snack" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="boughtPrice">Bought price</Label>
                  <Input id="boughtPrice" type="number" value={form.boughtPrice} onChange={(e) => setForm({ ...form, boughtPrice: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="sellingPrice">Selling price</Label>
                  <Input id="sellingPrice" type="number" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
                </div>
              </div>
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input id="quantity" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="barcode">Barcode (scan existing, or leave blank to generate one)</Label>
                <div className="flex gap-2">
                  <Input id="barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                  <Button type="button" variant="outline" size="icon" onClick={handleScanBarcode}>
                    <ScanLine />
                  </Button>
                </div>
              </div>
              <Button onClick={() => createMutation.mutate()} disabled={!form.name || !form.sellingPrice || !form.quantity}>
                Save Product
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {products.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Stock Value" value={`₱${inventoryValue.toFixed(0)}`} hint="at bought price" />
            <StatTile
              label="Low Stock"
              value={String(lowStockCount)}
              tone={lowStockCount > 0 ? "warning" : "neutral"}
              icon={lowStockCount > 0 ? <TriangleAlert className="h-3.5 w-3.5 text-yellow-600" /> : undefined}
            />
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-ink/30" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or barcode..." className="pl-9" />
          </div>

          <button
            type="button"
            onClick={() => setLowStockOnly((v) => !v)}
            className={`w-full rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
              lowStockOnly ? "bg-brand-gold text-brand-ink" : "bg-white text-brand-ink/50 border border-brand-ink/10"
            }`}
          >
            {lowStockOnly ? "Show all" : `Low stock only (${lowStockCount})`}
          </button>
        </>
      )}

      <div className="flex flex-col gap-2">
        {visible.map((product) => {
          const low = product.quantity <= product.lowStockThreshold;
          const margin = marginPercent(product.sellingPrice, product.boughtPrice);

          return (
            <Card key={product.id} className="rounded-2xl">
              <CardContent className="flex items-center gap-3 pt-4">
                <span className="text-2xl" aria-hidden>
                  {product.thumbnail || "📦"}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-brand-ink">{product.name}</p>
                  <p className="font-mono text-[10px] text-brand-ink/40">{product.barcode}</p>
                  <Badge variant={margin >= 20 ? "success" : margin > 0 ? "outline" : "danger"} className="mt-1">
                    {margin.toFixed(0)}% margin
                  </Badge>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-black tabular-nums text-brand-blue">₱{product.sellingPrice.toFixed(2)}</p>
                  <p className={`text-[10px] font-bold tabular-nums ${low ? "text-yellow-700" : "text-brand-ink/40"}`}>
                    {product.quantity} stock
                  </p>
                </div>

                <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(product.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}

        {products.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-brand-ink/20 py-10 text-center">
            <Package className="h-8 w-8 text-brand-ink/30" />
            <p className="text-sm text-brand-ink/50">No products yet — add your first one above.</p>
          </div>
        )}
        {products.length > 0 && visible.length === 0 && (
          <p className="py-6 text-center text-sm text-brand-ink/40">No matching products.</p>
        )}
      </div>
    </div>
  );
}
