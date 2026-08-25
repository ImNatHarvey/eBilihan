/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  /** eGovPH's Login as eGov widget script. Version stays pinned — see lib/egovLoginWidget.ts. */
  readonly VITE_EGOV_LOGIN_WIDGET_URL?: string;
  /** eVerify's Face Liveness Web SDK script — see lib/everifyFaceLiveness.ts. */
  readonly VITE_EVERIFY_LIVENESS_SDK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
