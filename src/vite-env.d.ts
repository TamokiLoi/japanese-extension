/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Defined in vite.config.ts -- see the comment there.
declare const __IS_PAGES_BUILD__: boolean;
