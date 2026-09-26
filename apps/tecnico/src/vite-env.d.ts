/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Base da API /api/v1; vazia no dev (o Vite repassa /api para o web). */
  readonly VITE_API_URL?: string;
  /** 1 libera o pseudo-idioma (en-XA) no seletor; nunca no build de produção. */
  readonly VITE_PSEUDO_IDIOMA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
