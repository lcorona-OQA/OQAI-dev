// src/utils/sendPendingReviewEscalations.js
import { supabase } from "../supabase/supabase.config";
/**
 * Lanza el chequeo de devices pending_review en Home Office
 * y envía correo si hay expirados.
 *
 * Puedes llamar esto:
 *  - desde un botón "Run check" (para probar),
 *  - o desde un cron / Scheduled Function en el backend.
 */
export async function runPendingReviewEscalationCheck(
  timeoutMinutesOverride
) {
  console.log(
    "[runPendingReviewEscalationCheck] Invocando send-home-office-email (escalate_pending_reviews)"
  );
  try {
    const { data, error } = await supabase.functions.invoke(
      "send-home-office-email",
      {
        body: {
          action: "escalate_pending_reviews",
          // Si quieres usar el mismo timeout que el front, pasa 2 aquí.
          timeoutMinutes: timeoutMinutesOverride,
        },
      }
    );
    if (error) {
      console.error(
        "[runPendingReviewEscalationCheck] Error al invocar función:",
        error
      );
      return {
        success: false,
        reason: "invoke_error",
        error,
      };
    }
    console.log(
      "[runPendingReviewEscalationCheck] Resultado escalamiento:",
      data
    );
    return data;
  } catch (err) {
    console.error(
      "[runPendingReviewEscalationCheck] Error inesperado invocando función:",
      err
    );
    return {
      success: false,
      reason: "unexpected_invoke_error",
      error: String(err),
    };
  }
}