// src/utils/sendHomeOfficeEmail.js
import { supabase } from '../supabase/supabase.config';
// Ajusta si cambia el nombre de la función en Supabase
const EDGE_FUNCTION_URL =
  'https://prsxtuvgcusbipfshaqi.functions.supabase.co/send-home-office-email';
/**
 * Envía correo de Home Office usando la Edge Function.
 *
 * @param {string} requestId - UUID de home_office_requests.id
 * @param {'lead_approved'|'final_approved'} stage
 *    - 'lead_approved'  -> correo para rol 4 y 8 (Team Lead lo manda a admin)
 *    - 'final_approved' -> correo para 4, 8, 9 y el usuario (Admin aprueba)
 *
 * @returns {Promise<{
 *   success: boolean,
 *   partialSuccess: boolean,
 *   successCount: number,
 *   failCount: number,
 *   total: number,
 *   reason?: string,
 *   [key: string]: any
 * }>}
 */
export async function sendHomeOfficeEmailForRequest(
  requestId,
  stage = 'lead_approved'
) {
  if (!requestId) {
    console.error('[sendHomeOfficeEmailForRequest] requestId es requerido');
    return {
      success: false,
      partialSuccess: false,
      successCount: 0,
      failCount: 0,
      total: 0,
      reason: 'no_request_id',
    };
  }
  // Intentamos obtener sesión para pasar Authorization (no es obligatorio, pero mejor)
  let session = null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (!error) {
      session = data?.session ?? null;
    } else {
      console.warn(
        '[sendHomeOfficeEmailForRequest] Error obteniendo sesión:',
        error
      );
    }
  } catch (err) {
    console.warn(
      '[sendHomeOfficeEmailForRequest] Excepción obteniendo sesión:',
      err
    );
  }
  const headers = {
    'Content-Type': 'application/json',
  };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  let resp;
  let text;
  try {
    resp = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requestId, stage }),
    });
    text = await resp.text();
  } catch (err) {
    console.error(
      '[sendHomeOfficeEmailForRequest] Error llamando Edge Function:',
      err
    );
    return {
      success: false,
      partialSuccess: false,
      successCount: 0,
      failCount: 0,
      total: 0,
      reason: 'unexpected_invoke_error',
      error: String(err),
    };
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!resp.ok) {
    console.error(
      '[sendHomeOfficeEmailForRequest] Edge Function devolvió error HTTP:',
      resp.status,
      json
    );
    return {
      success: false,
      partialSuccess: false,
      successCount: 0,
      failCount: 0,
      total: 0,
      reason: 'invoke_error',
      status: resp.status,
      body: json,
    };
  }
  return json;
}
/**
 * (Opcional) Dispara el modo inventario "pending_review_timeout"
 * desde el frontend (por ejemplo, si quieres probar manualmente).
 */
export async function triggerPendingReviewTimeoutEmail() {
  let session = null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (!error) {
      session = data?.session ?? null;
    }
  } catch (err) {
    console.warn(
      '[triggerPendingReviewTimeoutEmail] Error obteniendo sesión:',
      err
    );
  }
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  let resp;
  let text;
  try {
    resp = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ mode: 'pending_review_timeout' }),
    });
    text = await resp.text();
  } catch (err) {
    console.error(
      '[triggerPendingReviewTimeoutEmail] Error llamando Edge Function:',
      err
    );
    return {
      success: false,
      partialSuccess: false,
      successCount: 0,
      failCount: 0,
      total: 0,
      reason: 'unexpected_invoke_error',
      error: String(err),
    };
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!resp.ok) {
    console.error(
      '[triggerPendingReviewTimeoutEmail] Edge Function error HTTP:',
      resp.status,
      json
    );
    return {
      success: false,
      partialSuccess: false,
      successCount: 0,
      failCount: 0,
      total: 0,
      reason: 'invoke_error',
      status: resp.status,
      body: json,
    };
  }
  return json;
}