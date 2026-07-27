import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ShoppingCart, Package, Wallet, TriangleAlert, ArrowRight } from "lucide-react";
import { StatTile } from "@/components/ui/card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listOrders } from "@/api/orders";
import { listProducts } from "@/api/products";
import { getWalletSummary } from "@/api/wallet";
import { useAuthStore } from "@/store/authStore";

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** Landing tab: today's snapshot + quick actions into the other four tabs. */
export function HomePage() {
  const navigate = useNavigate();
  const owner = useAuthStore((s) => s.owner);
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: listOrders });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: listProducts });
  const { data: summary } = useQuery({ queryKey: ["wallet-summary"], queryFn: getWalletSummary });

  const todaysOrders = orders.filter((o) => o.paymentStatus === "paid" && isToday(o.createdAt));
  const todaysSales = todaysOrders.reduce((sum, o) => sum + o.total, 0);
  const lowStock = products.filter((p) => p.quantity <= p.lowStockThreshold);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <p className="text-sm text-brand-ink/50">Magandang araw,</p>
        <h1 className="text-xl font-black text-brand-ink">{owner?.fullName ?? "Owner"}</h1>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Today's Sales" value={`₱${todaysSales.toFixed(0)}`} hint={`${todaysOrders.length} order(s)`} tone="positive" />
        <StatTile
          label="Low Stock"
          value={String(lowStock.length)}
          tone={lowStock.length > 0 ? "warning" : "neutral"}
          icon={lowStock.length > 0 ? <TriangleAlert className="h-3.5 w-3.5 text-yellow-600" /> : undefined}
        />
        <StatTile label="Outstanding Loans" value={`₱${summary?.outstandingLoans.toFixed(0) ?? "0"}`} hint={`${summary?.loanCount ?? 0} active`} />
        <StatTile label="Store Equity" value={`₱${summary?.equity.toFixed(0) ?? "0"}`} />
      </div>

      {lowStock.length > 0 && (
        <Card className="border-brand-gold/40 bg-brand-gold/10">
          <CardContent className="flex items-center justify-between gap-2 pt-4">
            <div className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 shrink-0 text-yellow-700" />
              <p className="text-sm text-brand-ink">
                {lowStock.length} product{lowStock.length > 1 ? "s are" : " is"} running low on stock.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/products")}>
              View
            </Button>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-2 text-sm font-bold text-brand-ink">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-2">
          <QuickAction icon={ShoppingCart} label="New Sale" onClick={() => navigate("/order")} />
          <QuickAction icon={Package} label="Products" onClick={() => navigate("/products")} />
          <QuickAction icon={Wallet} label="Wallet" onClick={() => navigate("/wallet")} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate("/wallet")}
        className="flex items-center justify-between rounded-xl border border-brand-ink/10 bg-white p-3 text-left shadow-sm"
      >
        <span className="text-sm font-medium text-brand-ink">View sales &amp; loan analytics</span>
        <ArrowRight className="h-4 w-4 text-brand-ink/40" />
      </button>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick }: { icon: typeof ShoppingCart; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-brand-ink/10 bg-white p-3 shadow-sm transition-transform active:scale-95"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-blue-light">
        <Icon className="h-5 w-5 text-brand-blue" />
      </span>
      <span className="text-[11px] font-semibold text-brand-ink">{label}</span>
    </button>
  );
}
