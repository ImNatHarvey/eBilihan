import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Browser } from "@capacitor/browser";
import { Banknote, Smartphone, Landmark, Building2, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCartStore } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";
import { createOrder, markOrderPaymentStatus } from "@/api/orders";
import { generatePayment, checkTransaction } from "@/api/payments";
import { buildReceiptPdf } from "@/lib/receipt";
import type { Order } from "@/types";

type Step = "summary" | "cash" | "channel" | "qr" | "receipt";

/**
 * eGovPay's own Generate Payment response is just a hosted checkout URL — the real
 * channel picker (GCash/bank/etc.) lives on THAT page, not in the request body (see
 * CLAUDE.md's eGovPay contract notes). Selecting a channel here is a presentation
 * step in front of the real call, not a field eGovPay's API actually accepts.
 */
const CHANNELS = [
  { id: "gcash", name: "GCash", icon: Smartphone, tone: "bg-blue-50 text-blue-700" },
  { id: "gotyme", name: "GoTyme Bank", icon: Landmark, tone: "bg-purple-50 text-purple-700" },
  { id: "maribank", name: "Maribank", icon: Building2, tone: "bg-green-50 text-green-700" },
];

export function CheckoutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { items, total, clear } = useCartStore();
  const owner = useAuthStore((s) => s.owner);

  const [step, setStep] = useState<Step>("summary");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number] | null>(null);
  const [cashReceived, setCashReceived] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<{ uuid: string; url: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("summary");
      setChannel(null);
      setCashReceived("");
      setOrder(null);
      setPayment(null);
      setQrDataUrl(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (step === "qr" && payment) {
      QRCode.toDataURL(payment.url, { width: 220, margin: 1 }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
    }
  }, [step, payment]);

  async function handleConfirmCash() {
    setError(null);
    setIsBusy(true);
    try {
      const createdOrder = await createOrder(items, "cash");
      setOrder(createdOrder);
      setStep("receipt");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create order");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSelectChannel(selected: (typeof CHANNELS)[number]) {
    setChannel(selected);
    setError(null);
    setIsBusy(true);
    try {
      const createdOrder = await createOrder(items, "gcash");
      setOrder(createdOrder);
      const generated = await generatePayment({
        amount: createdOrder.total,
        items: createdOrder.items.map((i) => ({ name: i.name, amount: i.unitPrice * i.quantity })),
        txnid: createdOrder.id,
        redirectUrl: "ebilihan://payment-complete",
        callbackUrl: `${import.meta.env.VITE_API_BASE_URL}/payments/webhook`,
      });
      setPayment(generated);
      setStep("qr");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate payment");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCheckPaid() {
    if (!order || !payment) return;
    setError(null);
    setIsBusy(true);
    try {
      const tx = await checkTransaction(payment.uuid);
      if (tx.payment_status === "PAID" || tx.payment_status === "SETTLED") {
        await markOrderPaymentStatus(order.id, "paid", payment.uuid);
        setOrder({ ...order, paymentStatus: "paid" });
        setStep("receipt");
      } else {
        setError("Not paid yet — complete the payment, then try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check payment status");
    } finally {
      setIsBusy(false);
    }
  }

  /** Dev/testing shortcut — bypasses real eGovPay confirmation so the receipt flow can be tested without a live GCash transaction. */
  async function handleSimulatePayment() {
    if (!order || !payment) return;
    setIsBusy(true);
    try {
      await markOrderPaymentStatus(order.id, "paid", payment.uuid);
      setOrder({ ...order, paymentStatus: "paid" });
      setStep("receipt");
    } finally {
      setIsBusy(false);
    }
  }

  function handleDone() {
    if (order?.paymentStatus === "paid") {
      const doc = buildReceiptPdf(order, owner?.storeName ?? "eBilihan Store");
      doc.save(`receipt-${order.id.slice(0, 8)}.pdf`);
    }
    clear();
    onOpenChange(false);
  }

  const cashChange = Number(cashReceived) - total();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step === "summary" && "Order Summary"}
            {step === "cash" && "Cash Payment"}
            {step === "channel" && "Select Payment Channel"}
            {step === "qr" && `Pay with ${channel?.name}`}
            {step === "receipt" && "Payment Complete"}
          </DialogTitle>
        </DialogHeader>

        {step === "summary" && (
          <div className="flex flex-col gap-3">
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {items.map((item) => (
                <div key={item.productId} className="flex justify-between text-sm">
                  <span className="text-brand-ink/70">
                    {item.name} x{item.quantity}
                  </span>
                  <span className="font-medium text-brand-ink">₱{(item.unitPrice * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-brand-ink/10 pt-2 text-base font-black text-brand-ink">
              <span>Total</span>
              <span>₱{total().toFixed(2)}</span>
            </div>

            <p className="mt-1 text-xs font-semibold text-brand-ink/50">Payment Method</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setStep("cash")}>
                <Banknote /> Cash
              </Button>
              <Button onClick={() => setStep("channel")}>
                <Smartphone /> eGovPay
              </Button>
            </div>
          </div>
        )}

        {step === "cash" && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between text-sm text-brand-ink/60">
              <span>Total Due</span>
              <span className="font-bold text-brand-ink">₱{total().toFixed(2)}</span>
            </div>
            <div>
              <Label htmlFor="cashReceived">Amount Received</Label>
              <Input id="cashReceived" type="number" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} placeholder="0.00" />
            </div>
            {Number(cashReceived) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-brand-ink/60">Change</span>
                <span className={`font-bold ${cashChange < 0 ? "text-brand-red" : "text-green-700"}`}>₱{cashChange.toFixed(2)}</span>
              </div>
            )}
            {error && <Badge variant="danger">{error}</Badge>}
            <Button onClick={handleConfirmCash} disabled={Number(cashReceived) < total() || isBusy}>
              {isBusy ? "Processing..." : "Confirm Cash Payment"}
            </Button>
          </div>
        )}

        {step === "channel" && (
          <div className="flex flex-col gap-2">
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectChannel(c)}
                disabled={isBusy}
                className="flex items-center gap-3 rounded-xl border border-brand-ink/10 p-3 text-left transition-colors active:bg-brand-surface disabled:opacity-50"
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-full ${c.tone}`}>
                  <c.icon className="h-4.5 w-4.5" />
                </span>
                <span className="text-sm font-semibold text-brand-ink">{c.name}</span>
              </button>
            ))}
            {error && <Badge variant="danger">{error}</Badge>}
            {isBusy && <p className="text-center text-xs text-brand-ink/50">Generating payment...</p>}
          </div>
        )}

        {step === "qr" && payment && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-lg font-black text-brand-ink">₱{total().toFixed(2)}</p>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Scan to pay" className="h-48 w-48 rounded-lg border border-brand-ink/10" />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center rounded-lg border border-brand-ink/10 text-xs text-brand-ink/40">
                Generating QR...
              </div>
            )}
            <p className="text-xs text-brand-ink/50">Scan with your {channel?.name} app, or open the payment page</p>

            <Button variant="outline" className="w-full" onClick={() => Browser.open({ url: payment.url })}>
              <ExternalLink className="h-4 w-4" /> Open Payment Page
            </Button>
            {error && <Badge variant="danger">{error}</Badge>}
            <Button className="w-full" onClick={handleCheckPaid} disabled={isBusy}>
              {isBusy ? "Checking..." : "I've Paid"}
            </Button>
            <button
              type="button"
              onClick={handleSimulatePayment}
              disabled={isBusy}
              className="text-[11px] font-medium text-brand-ink/40 underline underline-offset-2"
            >
              Simulate Payment Success (testing only)
            </button>
          </div>
        )}

        {step === "receipt" && order && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-base font-black text-brand-ink">₱{order.total.toFixed(2)} paid</p>
            <p className="text-xs text-brand-ink/50">Order #{order.id.slice(0, 8).toUpperCase()}</p>
            <Button className="w-full" onClick={handleDone}>
              Download Receipt &amp; Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
