/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dirección del servidor local; sin definir = `/api` (proxy de Vite). */
  readonly VITE_ALMACEN_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
