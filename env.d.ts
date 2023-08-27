/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GENET_MUSIC_LIST_URL: string;
  readonly VITE_GENET_MUSIC_LIST_SUB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
