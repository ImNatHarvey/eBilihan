/**
 * Loader for eGovPH's "Login as eGov" widget.
 *
 * Per the eGov SSO integration guide, the widget runs the citizen's mobile/email → OTP →
 * eGov PIN screens against our gateway using only our `partner_code`, then hands the page
 * an `exchange_code`. Our backend redeems that for the citizen's profile. Those widget
 * calls are free of charge, and the sandbox accounts have fixed codes, so this path is
 * demoable without spending credits on every attempt.
 *
 * Two rules from the guide are load-bearing here:
 *   - the script URL's version stays pinned (`v1.0.0`), and
 *   - `partner_secret` and access tokens never touch the page. Only `partnerCode` and
 *     `host` do, and both are documented as safe in a browser.
 */
const WIDGET_SRC =
  import.meta.env.VITE_EGOV_LOGIN_WIDGET_URL ?? "https://widgets.e.gov.ph/v1.0.0/egov-login.min.js";

export type EgovLoginOptions = {
  target: string;
  partnerCode: string;
  host: string;
  partnerName?: string;
  onSuccess: (result: { exchangeCode: string }) => void;
  onError?: (error: unknown) => void;
};

let loadPromise: Promise<void> | null = null;

/** Idempotent <script> injection — mirrors the loader in lib/everifyFaceLiveness.ts. */
export function loadEgovLoginWidget(): Promise<void> {
  if (window.EgovLogin) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = WIDGET_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        // Let a later attempt retry rather than caching the failure forever.
        loadPromise = null;
        reject(new Error("Could not load the eGovPH sign-in widget"));
      };
      document.head.appendChild(script);
    });
  }
  return loadPromise;
}

export async function renderEgovLogin(options: EgovLoginOptions): Promise<void> {
  await loadEgovLoginWidget();
  if (!window.EgovLogin) throw new Error("The eGovPH sign-in widget did not initialize");
  window.EgovLogin.render(options);
}
