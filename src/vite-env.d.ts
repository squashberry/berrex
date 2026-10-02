/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_ENDPOINT?: string;
  readonly VITE_EXNESS_REFERRAL_URL?: string;
  readonly VITE_MARKET_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
