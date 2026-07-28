import { useState } from "react";
import { ScanLine, List, Minus, Plus, Trash2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCartStore } from "@/store/cartStore";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { getProductByBarcode } from "@/api/products";
import { SelectProductDialog } from "./SelectProductDialog";
import { CheckoutDialog } from "./CheckoutDialog";

/**
 * Order Management (POS) view: scan a barcode or pick from the catalogue, build a
 * cart, then Checkout opens the Order Summary + payment flow (see CheckoutDialog).
 */
export function POSView() {
  const { items, removeItem, setQuantity, total } = useCartStore();
  const { scanOnce, isScanning } = useBarcodeScanner();
  const addProduct = useCartStore((s) => s.addProduct);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectOpen, setSelectOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  async function handleScan() {
    setScanError(null);
    try {
      const barcode = await scanOnce("barcode");
      if (!barcode) return;
      const product = await getProductByBarcode(barcode);
      addProduct(product);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Could not read that barcode");
    }
  }

  return (
    <div className="flex h-full flex-col p-4">
      <h1 className="mb-3 shrink-0 text-lg font-bold text-brand-ink">Order Management</h1>

      <div className="flex shrink-0 flex-col gap-2">
        <Button size="lg" onClick={handleScan} disabled={isScanning}>
          <ScanLine /> {isScanning ? "Scanning..." : "Scan Product Barcode"}
        </Button>
        <Button size="lg" variant="outline" onClick={() => setSelectOpen(true)}>
          <List /> Select Product
        </Button>
        {scanError && (
          <Badge variant="danger" className="w-fit">
            {scanError}
          </Badge>
        )}
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <h2 className="mb-2 shrink-0 text-sm font-bold text-brand-ink">Cart ({items.length})</h2>
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <ShoppingCart className="h-7 w-7 text-brand-ink/20" />
              <p className="text-sm text-brand-ink/40">Scan or select a product to add it here.</p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div key={item.productId} className="flex items-center justify-between gap-2 rounded-lg border border-brand-ink/10 bg-white p-2 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-brand-ink">{item.name}</p>
                  <p className="text-xs text-brand-ink/50">₱{item.unitPrice.toFixed(2)} each</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="icon" variant="outline" onClick={() => setQuantity(item.productId, item.quantity - 1)}>
                    <Minus />
                  </Button>
                  <span className="w-6 text-center text-sm">{item.quantity}</span>
                  <Button size="icon" variant="outline" onClick={() => setQuantity(item.productId, item.quantity + 1)}>
                    <Plus />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => removeItem(item.productId)}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {items.length > 0 && (
        <div className="mt-3 shrink-0 rounded-xl border border-brand-ink/10 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between text-base font-bold text-brand-ink">
            <span>Total</span>
            <span>₱{total().toFixed(2)}</span>
          </div>
          <Button size="lg" className="w-full" onClick={() => setCheckoutOpen(true)}>
            Checkout
          </Button>
        </div>
      )}

      <SelectProductDialog open={selectOpen} onOpenChange={setSelectOpen} />
      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} />
    </div>
  );
}
