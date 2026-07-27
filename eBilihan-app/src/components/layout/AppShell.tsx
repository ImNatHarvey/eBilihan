import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { LogOut, User, WifiOff } from "lucide-react";
import { PhoneFrame } from "./PhoneFrame";
import { BottomNav } from "./BottomNav";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/store/authStore";
import logo from "@/assets/eBilihan-Logo.png";

/** Authenticated app chrome: phone frame, header, scrollable outlet, bottom nav. */
export function AppShell() {
  const navigate = useNavigate();
  const owner = useAuthStore((s) => s.owner);
  const logout = useAuthStore((s) => s.logout);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <PhoneFrame>
      <header className="shrink-0 bg-brand-blue pt-[env(safe-area-inset-top)] text-white shadow-md">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <img src={logo} alt="" className="h-7 w-7 shrink-0 rounded-md bg-white object-contain p-0.5" aria-hidden />
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight">eBilihan</h1>
              <p className="truncate text-[10px] text-white/70">{owner?.storeName ?? "Store"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!online && (
              <Badge variant="warning" className="gap-1 bg-brand-gold/25 text-white">
                <WifiOff className="h-3 w-3" aria-hidden />
                Offline
              </Badge>
            )}

            <div className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs">
              <User className="h-3 w-3 text-brand-gold" aria-hidden />
              <span className="max-w-24 truncate">{owner?.fullName ?? "Owner"}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="ml-0.5 rounded p-0.5 text-white/70 hover:text-white"
                aria-label="Log out"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain">
        <Outlet />
      </main>

      <BottomNav />
    </PhoneFrame>
  );
}
