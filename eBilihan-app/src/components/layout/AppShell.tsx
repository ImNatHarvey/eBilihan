import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { User, WifiOff } from "lucide-react";
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

  const firstName = owner?.fullName?.split(" ")[0] ?? "Owner";

  return (
    <PhoneFrame>
      <header className="shrink-0 border-b border-brand-ink/10 bg-white pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between px-4 py-3">
          <img src={logo} alt="eBilihan" className="h-8 shrink-0 object-contain" />

          <div className="flex items-center gap-2.5">
            {!online && (
              <Badge variant="warning" className="gap-1">
                <WifiOff className="h-3 w-3" aria-hidden />
                Offline
              </Badge>
            )}

            <div className="text-right leading-tight">
              <p className="text-sm font-bold text-brand-ink">Mabuhay, {firstName}</p>
              <p className="text-[10px] text-brand-ink/50">Welcome to eGovPH</p>
            </div>

            {/* Placeholder profile action until a real Profile/Settings page exists — logs out for now. */}
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-blue-light text-brand-blue"
              aria-label="Profile / Log out"
            >
              <User className="h-4 w-4" aria-hidden />
            </button>
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
