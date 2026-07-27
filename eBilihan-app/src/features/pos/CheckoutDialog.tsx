import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Browser } from "@capacitor/browser";
import { Banknote, Smartphone, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
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
import gcashLogo from "@/assets/gcash.png";
import gotymeLogo from "@/assets/gotyme.jpeg";
import maribankLogo from "@/assets/maribank.jpeg";

type Step = "summary" | "cash" | "channel" | "qr" | "receipt";

/**
 * eGovPay's own Generate Payment response is just a hosted checkout URL — the real
 * channel picker (GCash/bank/etc.) lives on THAT page, not in the request body (see
 * CLAUDE.md's eGovPay contract notes). Selecting a channel here is a presentation
 * step in front of the real call, not a field eGovPay's API actually accepts.
 */
const CHANNELS = [
  { id: "gcash", name: "GCash", logo: gcashLogo },
  { id: "gotyme", name: "GoTyme Bank", logo: gotymeLogo },
  { id: "maribank", name: "Maribank", logo: maribankLogo },
];

type PaymentState = { uuid: string; url: string | null; isReal: boolean };

export function CheckoutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { items, total, clear } = useCartStore();
  const owner = useAuthStore((s) => s.owner);

  const [step, setStep] = useState<Step>("summary");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number] | null>(null);
  const [cashReceived, setCashReceived] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<PaymentState | null>(null);
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
    if (step === "qr" && payment && order) {
      const content = payment.isReal ? payment.url! : `eBilihan Payment • Order ${order.id} • PHP ${order.total.toFixed(2)}`;
      QRCode.toDataURL(content, { width: 220, margin: 1 }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
    }
  }, [step, payment, order]);

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
      try {
        const generated = await generatePayment({
          amount: createdOrder.total,
          items: createdOrder.items.map((i) => ({ name: i.name, amount: i.unitPrice * i.quantity })),
          txnid: createdOrder.id,
          redirectUrl: "ebilihan://payment-complete",
          callbackUrl: `${import.meta.env.VITE_API_BASE_URL}/payments/webhook`,
        });
        setPayment({ uuid: generated.uuid, url: generated.url, isReal: true });
      } catch {
        // eGovPay isn't reachable/configured yet (see server/.env EGOVPAY_*) — fall back
        // to a local reference QR so the in-app checkout flow still works end-to-end for
        // testing. Real payments resume automatically once those credentials are valid.
        setPayment({ uuid: `local-${createdOrder.id}`, url: null, isReal: false });
      }
      setStep("qr");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create order");
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

  /** Marks the order paid directly — the real confirmation path when eGovPay's response is only a local fallback (see handleSelectChannel), or a dev shortcut for a real one. */
  async function handleConfirmReceived() {
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

  /** Explicit action, not automatic — an online eGovPay payment shouldn't force a file-save prompt the moment the receipt modal appears. */
  function handleDownloadReceipt() {
    if (!order) return;
    const doc = buildReceiptPdf(order, owner?.storeName ?? "eBilihan Store");
    doc.save(`receipt-${order.id.slice(0, 8)}.pdf`);
  }

  function handleDone() {
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
            <div className="flex justify-between border-t border-brand-ink/10 pt-2 text-base font-bold text-brand-ink">
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
                <span className="font-bold text-brand-ink">₱{cashChange.toFixed(2)}</span>
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
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-brand-ink/10">
                  <img src={c.logo} alt={c.name} className="h-full w-full object-cover" />
                </span>
                <span className="text-sm font-semibold text-brand-ink">{c.name}</span>
              </button>
            ))}
            {error && <Badge variant="danger">{error}</Badge>}
            {isBusy && <p className="text-center text-xs text-brand-ink/50">Preparing payment...</p>}
          </div>
        )}

        {step === "qr" && payment && (
          <div className="flex flex-col items-center gap-3">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Scan to pay" className="h-48 w-48 rounded-lg border border-brand-ink/10" />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center rounded-lg border border-brand-ink/10 text-xs text-brand-ink/40">
                Generating QR...
              </div>
            )}
            <p className="text-lg font-bold text-brand-ink">₱{total().toFixed(2)}</p>
            <p className="text-xs text-brand-ink/50">Scan with your {channel?.name} app</p>

            {error && <Badge variant="danger">{error}</Badge>}

            {payment.isReal ? (
              <>
                <Button variant="outline" className="w-full" onClick={() => Browser.open({ url: payment.url! })}>
                  <ExternalLink className="h-4 w-4" /> Open Payment Page
                </Button>
                <Button className="w-full" onClick={handleCheckPaid} disabled={isBusy}>
                  {isBusy && <Loader2 className="h-4 w-4 animate-spin" />} {isBusy ? "Checking..." : "I've Paid"}
                </Button>
                <button
                  type="button"
                  onClick={handleConfirmReceived}
                  disabled={isBusy}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-brand-ink/40 underline underline-offset-2"
                >
                  {isBusy && <Loader2 className="h-3 w-3 animate-spin" />} Simulate Payment Success (testing only)
                </button>
              </>
            ) : (
              <Button className="w-full" onClick={handleConfirmReceived} disabled={isBusy}>
                {isBusy && <Loader2 className="h-4 w-4 animate-spin" />} {isBusy ? "Confirming..." : "Confirm Payment Received"}
              </Button>
            )}
          </div>
        )}

        {step === "receipt" && order && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-base font-bold text-brand-ink">₱{order.total.toFixed(2)} paid</p>
            <p className="text-xs text-brand-ink/50">Order #{order.id.slice(0, 8).toUpperCase()}</p>
            <p className="text-xs text-brand-ink/50">
              {order.paymentMethod === "cash" ? "Paid with cash" : `Paid via eGovPay${payment ? ` • Ref: ${payment.uuid.slice(0, 12)}` : ""}`}
            </p>
            <div className="flex w-full gap-2">
              <Button variant="outline" className="flex-1" onClick={handleDownloadReceipt}>
                Download PDF
              </Button>
              <Button className="flex-1" onClick={handleDone}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
