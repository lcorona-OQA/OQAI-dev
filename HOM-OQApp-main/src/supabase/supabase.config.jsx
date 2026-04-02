// src/supabase/supabase.config.ts (o .js)
import { createClient } from "@supabase/supabase-js";
/**
 * Leemos las variables de entorno de Vite.
 * Estas NO van hardcodeadas en el código, sino en tu .env.local
 * o en las env vars de tu hosting (Vercel, Netlify, etc.)
 */
const supabaseUrl = import.meta.env.VITE_APP_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_APP_SUPABASE_ANON_KEY;
/**
 * Checks en runtime para ayudarte en desarrollo si algo está mal
 * configurado. No "protegen" la key (porque es pública por diseño),
 * pero evitan que la app arranque silenciosamente sin conexión.
 */
if (!supabaseUrl) {
  console.error(
    "[supabase.config] Missing VITE_APP_SUPABASE_URL. " +
      "Define it in your .env.local or hosting environment variables."
  );
}
if (!supabaseAnonKey) {
  console.error(
    "[supabase.config] Missing VITE_APP_SUPABASE_ANON_KEY. " +
      "Define it in your .env.local or hosting environment variables."
  );
}
if (!supabaseUrl || !supabaseAnonKey) {
  // Lanzamos error para fallar rápido en dev / build
  throw new Error(
    "[supabase.config] Supabase configuration is incomplete. " +
      "Check VITE_APP_SUPABASE_URL and VITE_APP_SUPABASE_ANON_KEY."
  );
}
/**
 * Cliente de Supabase para el FRONTEND.
 * Usa la anon key, que está limitada por RLS.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Mantener la sesión del usuario entre recargas
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    // Puedes agregar headers custom si quieres rastrear cliente
    headers: {
      "x-client-info": "home-office-app-frontend",
    },
  },
});
