import { NavLink } from "react-router-dom";
import { Home, Package, ShoppingCart, Wallet, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const SIDE_ITEMS = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/products", label: "Product", icon: Package },
] as const;

const SIDE_ITEMS_RIGHT = [
  { to: "/wallet", label: "Wallet", icon: Wallet },
  { to: "/reports", label: "Report", icon: ShieldAlert },
] as const;

/**
 * 5-tab bottom nav: Home, Product, Order, Wallet, Report — Order sits in the middle as
 * a raised circular button (the primary action: ring up a sale), the other four are
 * flat tabs either side of it. Structural pattern ported from the ebilihan-hackathon
 * prototype's BottomNav.tsx; colors are eBilihan's own.
 */
export function BottomNav() {
  return (
    <nav
      className="relative flex shrink-0 items-stretch justify-around border-t border-brand-ink/10 bg-white px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5"
      aria-label="Primary navigation"
    >
      {SIDE_ITEMS.map((item) => (
        <NavTab key={item.to} {...item} />
      ))}

      <NavLink to="/order" className="relative flex flex-1 flex-col items-center justify-center">
        <span className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue shadow-lg ring-4 ring-white">
          <ShoppingCart className="h-6 w-6 text-white" aria-hidden />
        </span>
        <span className="mt-0.5 text-[10px] font-semibold text-brand-blue">Order</span>
      </NavLink>

      {SIDE_ITEMS_RIGHT.map((item) => (
        <NavTab key={item.to} {...item} />
      ))}
    </nav>
  );
}

function NavTab({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof Home; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition-colors",
          isActive ? "text-brand-blue" : "text-brand-ink/50 hover:text-brand-ink/70",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} aria-hidden />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}
