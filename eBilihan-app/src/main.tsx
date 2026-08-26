import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Self-hosted (no external Google Fonts request) — 400/500/600/700 cover the
// Regular/Medium/SemiBold/Bold weights used throughout the app.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./index.css";
import App from "./App.tsx";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      /**
       * 5 minutes, not 30 seconds.
       *
       * TanStack refetches on window focus by default, so `staleTime` is really "how
       * often does alt-tabbing back cost a round trip". At 30s that was every single
       * return to the tab. For eBilihan's own endpoints that was merely wasteful; for
       * the eReport dataset lookups it burned a portal credit per call, unattended,
       * with nobody clicking anything.
       *
       * Focus refetching stays ON deliberately — stock counts and order status SHOULD
       * refresh when you come back to the tab, and those endpoints are ours and free.
       * The billed eGov lookups opt out individually instead: see EGOV_REFERENCE_QUERY
       * in src/api/reports.ts.
       */
      staleTime: 5 * 60_000,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
