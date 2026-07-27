import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ShoppingCart, Package, Wallet, TrendingUp, TriangleAlert, HandCoins, PiggyBank, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { StatTile } from "@/components/ui/card";
import { listOrders } from "@/api/orders";
import { listProducts } from "@/api/products";
import { getWalletSummary } from "@/api/wallet";
import { useAuthStore } from "@/store/authStore";
import banner1 from "@/assets/banner-1.jpg";
import banner2 from "@/assets/banner-2.jpg";
import banner3 from "@/assets/banner-3.jpg";

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

const BANNER_SLIDES = [
  { image: banner1, alt: "Promo banner 1" },
  { image: banner2, alt: "Promo banner 2" },
  { image: banner3, alt: "Promo banner 3" },
];

function BannerCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % BANNER_SLIDES.length), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative h-full min-h-20 overflow-hidden rounded-2xl">
      {BANNER_SLIDES.map((slide, i) => (
        <img
          key={slide.image}
          src={slide.image}
          alt={slide.alt}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${i === index ? "opacity-100" : "opacity-0"}`}
        />
      ))}

      <button
        type="button"
        onClick={() => setIndex((i) => (i - 1 + BANNER_SLIDES.length) % BANNER_SLIDES.length)}
        className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-1 text-white"
        aria-label="Previous"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setIndex((i) => (i + 1) % BANNER_SLIDES.length)}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-1 text-white"
        aria-label="Next"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      <div className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-1">
        {BANNER_SLIDES.map((_, i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-white" : "bg-white/50"}`} />
        ))}
      </div>
    </div>
  );
}

/** Landing tab: store snapshot + quick actions + promo carousel. Deliberately fits one screen, no scroll. */
export function HomePage() {
  const navigate = useNavigate();
  const owner = useAuthStore((s) => s.owner);
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: listOrders });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: listProducts });
  const { data: summary } = useQuery({ queryKey: ["wallet-summary"], queryFn: getWalletSummary });

  const todaysOrders = orders.filter((o) => o.paymentStatus === "paid" && isToday(o.createdAt));
  const todaysSales = todaysOrders.reduce((sum, o) => sum + o.total, 0);
  const lowStock = products.filter((p) => p.quantity <= p.lowStockThreshold);
  const today = new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      {/* Title sits top-left at the same position/size as every other page's <h1> (Product
          Management, Order Management, ...) so switching tabs doesn't visually jump. */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-brand-ink">{owner?.storeName ?? "My Store"}</h1>
        <p className="text-[11px] font-medium text-brand-ink/40">{today}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Today's Sales" value={`₱${todaysSales.toFixed(0)}`} hint={`${todaysOrders.length} order(s)`} tone="green" icon={<TrendingUp />} />
        <StatTile label="Low Stock" value={String(lowStock.length)} tone="red" icon={<TriangleAlert />} />
        <StatTile label="Outstanding Loans" value={`₱${summary?.outstandingLoans.toFixed(0) ?? "0"}`} hint={`${summary?.loanCount ?? 0} active`} tone="blue" icon={<HandCoins />} />
        <StatTile label="Store Equity" value={`₱${summary?.equity.toFixed(0) ?? "0"}`} tone="neutral" icon={<PiggyBank />} />
      </div>

      <div className="shrink-0">
        <h2 className="mb-2 text-sm font-bold text-brand-ink">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-2">
          <QuickAction icon={ShoppingCart} label="New Sale" onClick={() => navigate("/order")} />
          <QuickAction icon={Package} label="Products" onClick={() => navigate("/products")} />
          <QuickAction icon={Wallet} label="Wallet" onClick={() => navigate("/wallet")} />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <BannerCarousel />
      </div>

      <button
        type="button"
        onClick={() => navigate("/wallet")}
        className="flex shrink-0 items-center justify-between rounded-xl border border-brand-ink/10 bg-white p-3 text-left shadow-sm"
      >
        <span className="text-sm font-medium text-brand-ink">View Sales &amp; Loan Analytics</span>
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
