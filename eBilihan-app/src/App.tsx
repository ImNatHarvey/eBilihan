import { useEffect } from "react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/features/auth/LoginPage";
import { HomePage } from "@/features/home/HomePage";
import { POSView } from "@/features/pos/POSView";
import { ProductsPage } from "@/features/products/ProductsPage";
import { WalletPage } from "@/features/wallet/WalletPage";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { useAuthStore } from "@/store/authStore";

function RequireAuth({ children }: { children: ReactNode }) {
  const { owner, isHydrated } = useAuthStore();
  if (!isHydrated) return null;
  if (!owner) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="order" element={<POSView />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="wallet" element={<WalletPage />} />
        <Route path="reports" element={<ReportsPage />} />
      </Route>
    </Routes>
  );
}
