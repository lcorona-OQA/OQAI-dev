// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabase/supabase.config";

const AuthContext = createContext();

/**
 * AuthContextProvider
 * - Maneja sesión de Supabase
 * - Sincroniza usuario con tabla public.users
 * - Guarda tokens de Google Calendar en users
 * - Inyecta role_id / team_id / location_id / OOO en `user`
 */
export const AuthContextProvider = ({ children }) => {
  // null = sin sesión
  // objeto = usuario autenticado
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // =========================
  // Helpers
  // =========================

  const getResizedPhoto = (url, size) => {
    if (!url) return "";
    return url.replace(/s96-c/, `s${size}-c`);
  };

  /**
   * Crea o actualiza la fila en public.users para el usuario autenticado.
   * NO toca role_id / team_id / location_id (para no sobreescribir lo del admin).
   */
  const upsertUserRow = async (authUser) => {
    try {
      const meta = authUser.user_metadata || {};
      const displayName =
        meta.name ||
        meta.full_name ||
        authUser.email ||
        meta.email ||
        null;

      const photoUrl = meta.picture || null;
      const email = authUser.email || meta.email || null;

      const { error } = await supabase.from("users").upsert(
        {
          id: authUser.id,
          display_name: displayName,
          photo_url: photoUrl,
          email,
        },
        {
          onConflict: "id",
          ignoreDuplicates: false,
        },
      );

      if (error) {
        console.error("[AuthContext] Error upserting users row:", error);
      }
    } catch (e) {
      console.error("[AuthContext] upsertUserRow unexpected error:", e);
    }
  };

  /**
   * Guarda access_token y refresh_token de Google Calendar
   * en la tabla users, para que las Edge Functions los puedan usar.
   */
  const syncCalendarTokensToUser = async (authUser, session) => {
    try {
      const accessToken = session?.provider_token || null;
      const refreshToken = session?.provider_refresh_token || null;

      // A veces Supabase no manda tokens en todos los eventos.
      if (!accessToken && !refreshToken) return;

      const { error } = await supabase
        .from("users")
        .update({
          provider_access_token: accessToken,
          provider_refresh_token: refreshToken,
        })
        .eq("id", authUser.id);

      if (error) {
        console.error(
          "[AuthContext] Error updating provider tokens on users:",
          error,
        );
      }
    } catch (e) {
      console.error(
        "[AuthContext] syncCalendarTokensToUser unexpected error:",
        e,
      );
    }
  };

  /**
   * Si tus funciones RLS current_role_id() / current_team_id()
   * leen de auth.jwt().user_metadata.role_id/team_id,
   * esta función sincroniza esos valores en el JWT.
   *
   * Es segura: sólo hace updateUser si hay cambios reales
   * para evitar loops de onAuthStateChange.
   */
  const syncRoleTeamMetadataToAuth = async (session, appUser) => {
    if (!session || !appUser) return;

    const meta = session.user.user_metadata || {};
    const updates = {};

    if (
      appUser.role_id != null &&
      meta.role_id !== appUser.role_id
    ) {
      updates.role_id = appUser.role_id;
    }

    if (
      appUser.team_id != null &&
      meta.team_id !== appUser.team_id
    ) {
      updates.team_id = appUser.team_id;
    }

    if (
      appUser.location_id != null &&
      meta.location_id !== appUser.location_id
    ) {
      updates.location_id = appUser.location_id;
    }

    if (Object.keys(updates).length === 0) return;

    try {
      const { error } = await supabase.auth.updateUser({
        data: updates,
      });
      if (error) {
        console.error(
          "[AuthContext] Error actualizando user_metadata (role/team):",
          error,
        );
      }
    } catch (e) {
      console.error(
        "[AuthContext] syncRoleTeamMetadataToAuth unexpected error:",
        e,
      );
    }
  };

  /**
   * Maneja cualquier cambio de sesión (inicio, refresh, logout).
   */
  const handleSessionChange = async (session) => {
    if (!session) {
      setUser(null);
      setLoading(false);
      return;
    }

    const rawUser = session.user;
    const meta = rawUser.user_metadata || {};
    const resizedPhotoUrl = getResizedPhoto(meta.picture, 200);

    const authUser = {
      ...rawUser,
      user_metadata: {
        ...meta,
        picture: resizedPhotoUrl || meta.picture,
      },
    };

    try {
      // 1) Crear / actualizar fila en public.users con nombre, foto y email
      await upsertUserRow(authUser);

      // 2) Tokens de Google Calendar -> tabla users
      await syncCalendarTokensToUser(authUser, session);

      // 3) Datos de negocio: role_id, team_id, location_id, is_active, OOO
      const { data: appUser, error: appUserError } = await supabase
        .from("users")
        .select(
          "role_id, team_id, location_id, is_active, ooo_start, ooo_end",
        )
        .eq("id", authUser.id)
        .maybeSingle();

      if (appUserError) {
        console.error(
          "[AuthContext] Error fetching appUser row:",
          appUserError,
        );
      }

      // 4) Sincronizar role_id / team_id / location_id al JWT (si usas RLS por JWT)
      await syncRoleTeamMetadataToAuth(session, appUser);

      // 5) Guardar en el contexto
      setUser({
        ...authUser,
        role_id: appUser?.role_id ?? null,
        team_id: appUser?.team_id ?? null,
        location_id: appUser?.location_id ?? null,
        is_active: appUser?.is_active ?? true,
        ooo_start: appUser?.ooo_start ?? null,
        ooo_end: appUser?.ooo_end ?? null,
        provider_token: session.provider_token || null,
        provider_refresh_token: session.provider_refresh_token || null,
      });
    } catch (err) {
      console.error(
        "[AuthContext] Unexpected error in handleSessionChange:",
        err,
      );
      // En caso de error, al menos exponemos el usuario de auth
      setUser(authUser);
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // Sign in / Sign out
  // =========================

  async function signInWithGoogle() {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          queryParams: {
            access_type: "offline",
            prompt: "consent",
            scope: [
              "openid",
              "email",
              "profile",
              "https://www.googleapis.com/auth/calendar",
              "https://www.googleapis.com/auth/calendar.events",
              "https://www.googleapis.com/auth/calendar.settings.readonly",
            ].join(" "),
          },
        },
      });

      if (error) {
        console.error("[AuthContext] signInWithGoogle error:", error);
        throw new Error("Error durante autenticación con Google");
      }

      return data;
    } catch (error) {
      console.error(error);
      alert(error.message || "Error durante autenticación con Google");
    }
  }

  async function signout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[AuthContext] signout error:", error);
      throw new Error("Error durante el cierre de sesión");
    }
  }

  // =========================
  // Efecto: sesión inicial + suscripción
  // =========================

  useEffect(() => {
    let subscription;

    const init = async () => {
      setLoading(true);

      // 1) Sesión actual al cargar la app (refresh de página, etc.)
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("[AuthContext] Error in getSession:", error);
      }

      await handleSessionChange(data?.session ?? null);

      // 2) Suscribirse a cambios de auth
      const { data: listener } = supabase.auth.onAuthStateChange(
        async (_event, session) => {
          await handleSessionChange(session);
        },
      );

      subscription = listener?.subscription;
    };

    init();

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  // =========================
  // Helper para actualizar location localmente
  // =========================

  const updateLocation = (newLocationId) => {
    setUser((prev) =>
      prev
        ? {
            ...prev,
            location_id: newLocationId,
          }
        : prev,
    );
  };

  return (
    <AuthContext.Provider
      value={{
        signInWithGoogle,
        signout,
        user,
        updateLocation,
      }}
    >
      {/* No renderizamos children hasta que sepamos si hay sesión o no */}
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const UserAuth = () => useContext(AuthContext);
