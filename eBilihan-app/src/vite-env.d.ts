/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_EGOVPH_AUTHORIZE_URL?: string;
  readonly VITE_EVERIFY_LIVENESS_SDK_URL?: string;
  readonly VITE_DEMO_MOBILE_E164?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
