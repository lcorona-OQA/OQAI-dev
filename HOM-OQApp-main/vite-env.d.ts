/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_APP_SUPABASE_URL: string;
  readonly VITE_APP_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_SUPABASE_FUNCTIONS_URL?: string;
  // agrega aquí cualquier otra variable que uses:
  // readonly VITE_APP_ALGO_MAS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}