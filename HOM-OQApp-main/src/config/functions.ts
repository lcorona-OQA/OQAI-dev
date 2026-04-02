// src/config/functions.ts

/// <reference types="vite/client" />

// Base de las Edge Functions.
// Si tienes VITE_APP_SUPABASE_FUNCTIONS_URL en .env,
// se usa esa. Si no, se construye a partir de la URL de Supabase.
const FUNCTIONS_BASE_URL =
  import.meta.env.VITE_APP_SUPABASE_FUNCTIONS_URL ??
  `${import.meta.env.VITE_APP_SUPABASE_URL}/functions/v1`;

// Home Office: cuando el miembro crea la solicitud (avisa a TL / admins)
export const HO_REQUESTS_SLACK_URL =
  `${FUNCTIONS_BASE_URL}/ho-requests-slack`;

// Home Office: resultados (aprobado / rechazado / fechas modificadas + threads)
export const HO_RESULTS_SLACK_URL =
  `${FUNCTIONS_BASE_URL}/ho-requests-result-slack`;

// Home Office: cambios de estado desde el panel de Admin
export const HO_STATUS_SLACK_URL =
  `${FUNCTIONS_BASE_URL}/ho-requests-status-slack`;

// Sincronización con Google Calendar
export const SYNC_CALENDAR_URL =
  `${FUNCTIONS_BASE_URL}/sync-calendar`;

// Dispositivos marcados como Home Office
export const DEVICE_TAKEN_HO_URL =
  `${FUNCTIONS_BASE_URL}/device-taken-ho`;