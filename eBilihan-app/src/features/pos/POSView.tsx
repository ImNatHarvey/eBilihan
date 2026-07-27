import { useState } from "react";
import { Browser } from "@capacitor/browser";
import { ScanLine, Minus, Plus, Trash2, Banknote, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCartStore } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { getProductByBarcode } from "@/api/products";
import { createOrder, markOrderPaymentStatus } from "@/api/orders";
import { generatePayment, checkTransaction } from "@/api/payments";
import { buildReceiptPdf } from "@/lib/receipt";

/**
 * Order Management (POS) view: scan barcodes into a cart, then check out with
 * cash or GCash (eGovPay). This is the "Cart & Checkout" + "Payment Gateway" +
 * "Receipts" surface from the project brief.
 */
export function POSView() {
  const { items, addProduct, removeItem, setQuantity, clear, total } = useCartStore();
  const owner = useAuthStore((s) => s.owner);
  const { scanOnce, isScanning } = useBarcodeScanner();
  const [scanError, setScanError] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [lastReceiptOrderId, setLastReceiptOrderId] = useState<string | null>(null);

  async function handleScan() {
    setScanError(null);
    try {
      const barcode = await scanOnce();
      if (!barcode) return;
      const product = await getProductByBarcode(barcode);
      addProduct(product);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Could not read that barcode");
    }
  }

  async function handleCashCheckout() {
    setIsCheckingOut(true);
    try {
      const order = await createOrder(items, "cash");
      const doc = buildReceiptPdf(order, owner?.storeName ?? "eBilihan Store");
      doc.save(`receipt-${order.id.slice(0, 8)}.pdf`);
      setLastReceiptOrderId(order.id);
      clear();
    } finally {
      setIsCheckingOut(false);
    }
  }

  async function handleGcashCheckout() {
    setIsCheckingOut(true);
    try {
      const order = await createOrder(items, "gcash");
      const payment = await generatePayment({
        amount: order.total,
        items: order.items.map((i) => ({ name: i.name, amount: i.unitPrice * i.quantity })),
        txnid: order.id,
        redirectUrl: "ebilihan://payment-complete",
        callbackUrl: `${import.meta.env.VITE_API_BASE_URL}/payments/webhook`,
      });

      await Browser.open({ url: payment.url });

      // Poll for the customer completing GCash checkout in the in-app browser.
      const finalStatus = await pollUntilSettled(payment.uuid);
      await markOrderPaymentStatus(order.id, finalStatus, payment.uuid);

      if (finalStatus === "paid") {
        const doc = buildReceiptPdf({ ...order, paymentStatus: "paid" }, owner?.storeName ?? "eBilihan Store");
        doc.save(`receipt-${order.id.slice(0, 8)}.pdf`);
        setLastReceiptOrderId(order.id);
      }
      clear();
    } finally {
      setIsCheckingOut(false);
    }
  }

  async function pollUntilSettled(uuid: string): Promise<"paid" | "voided"> {
    for (let attempt = 0; attempt < 30; attempt++) {
      const tx = await checkTransaction(uuid);
      if (tx.payment_status === "PAID" || tx.payment_status === "SETTLED") return "paid";
      if (tx.payment_status === "VOIDED" || tx.payment_status === "EXPIRED") return "voided";
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    return "voided";
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>New Sale</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button size="lg" onClick={handleScan} disabled={isScanning}>
            <ScanLine /> {isScanning ? "Scanning..." : "Scan Product Barcode"}
          </Button>
          {scanError && (
            <Badge variant="danger" className="w-fit">
              {scanError}
            </Badge>
          )}
        </CardContent>
      </Card>

      <Card className="flex-1">
        <CardHeader>
          <CardTitle>Cart ({items.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {items.length === 0 && <p className="text-sm text-brand-ink/50">Scan a product to add it here.</p>}
          {items.map((item) => (
            <div key={item.productId} className="flex items-center justify-between gap-2 rounded-lg border border-brand-ink/10 p-2">
              <div className="flex-1">
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-brand-ink/50">PHP {item.unitPrice.toFixed(2)} each</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" onClick={() => setQuantity(item.productId, item.quantity - 1)}>
                  <Minus />
                </Button>
                <span className="w-6 text-center">{item.quantity}</span>
                <Button size="icon" variant="outline" onClick={() => setQuantity(item.productId, item.quantity + 1)}>
                  <Plus />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => removeItem(item.productId)}>
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-4">
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>Total</span>
              <span>PHP {total().toFixed(2)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="lg" variant="secondary" onClick={handleCashCheckout} disabled={isCheckingOut}>
                <Banknote /> Cash
              </Button>
              <Button size="lg" onClick={handleGcashCheckout} disabled={isCheckingOut}>
                <Smartphone /> GCash
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {lastReceiptOrderId && (
        <Badge variant="success" className="w-fit">
          Receipt saved for order {lastReceiptOrderId.slice(0, 8)}
        </Badge>
      )}
    </div>
  );
}
