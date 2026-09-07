/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GENET_MUSIC_LIST_URL: string;
  readonly VITE_GENET_MUSIC_LIST_SUB_URL?: string;
  /**
   * Where the API is, for `vite dev` only.
   *
   * Unset in a build: the worker serves these pages and its own /api from one
   * origin, so the default relative path is correct there and an absolute one
   * would send the browser somewhere else.
   */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
