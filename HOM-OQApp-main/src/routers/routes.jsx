import { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { UserAuth } from "../context/AuthContext";
import { Dashboard } from "../components/Dashboard";
import { Login } from "../pages/Login";
import { Perfil } from "../pages/Perfil";
import { RoleChecker } from "../pages/RoleChecker";
import { PendingPage } from "../pages/PendingPage";
import { SuperAdminDashboard } from "../pages/SuperAdminDashboard";
import { AdminDashboard } from "../pages/AdminDashboard";
import { AdminEmployeesPage } from "../pages/AdminEmployeesPage";
import { SuperAdminEmployeesPage } from "../pages/SuperAdminEmployeesPage";
import { supabase } from "../supabase/supabase.config";
import { RequestPage } from "../pages/RequestPage";
import { TeamLeadRequestsPage } from "../pages/TeamLeadRequestsPage";
import { InventDashboard } from "../pages/InventDashboard";
import { PendingReviewsPage } from "../pages/PendingReviewsPage";
import { EmployeeDevicesPage } from "../pages/EmployeeDevicesPage";
import { AllDevicesPage } from "../pages/AllDevicesPage";
import { DeviceLogsPage } from "../pages/DeviceLogsPage";
import AuditLogsPage  from "../pages/AuditLogsPage";
import { SuperAdminMetricsPage } from "../pages/SuperAdminMetricsPage";
import { SlackReportPage } from "../pages/SlackReportPage";

/* =========================================================
   HORARIO DE BLOQUEO (GMT-7) PARA ROLES ESPECÍFICOS
   ========================================================= */

// Roles que se bloquean fuera de horario (8:00–16:00 GMT-7)
const BLOCKED_ROLES = [3, 5, 6, 7];

// Hora actual en GMT-7 (0–23)
function getHourInGMTMinus7() {
  const now = new Date();
  const utcHour = now.getUTCHours(); // 0–23 en UTC
  const hourGMT7 = (utcHour - 7 + 24) % 24;
  return hourGMT7;
}

// Lógica pura de bloqueo por horario
function isUserBlockedBySchedule(user) {
  if (!user || typeof user.role_id !== "number") return false;

  // Si el rol NO está en la lista, nunca se bloquea por horario
  if (!BLOCKED_ROLES.includes(user.role_id)) return false;

  const hourGMT7 = getHourInGMTMinus7();

  // Horario permitido: 7:00–17:00 en GMT-7
  const isBlocked = hourGMT7 < 7 || hourGMT7 >= 17;

  if (isBlocked) {
    console.log("[ScheduleGuard] User blocked by schedule", {
      role_id: user.role_id,
      hourGMT7,
    });
  }

  return isBlocked;
}

// Hook que mantiene el estado de bloqueo actualizado (revisa cada minuto)
function useScheduleBlock(user) {
  const [blocked, setBlocked] = useState(() => isUserBlockedBySchedule(user));

  useEffect(() => {
    setBlocked(isUserBlockedBySchedule(user));

    if (!user) return;

    const intervalId = setInterval(() => {
      setBlocked(isUserBlockedBySchedule(user));
    }, 60 * 1000);

    return () => clearInterval(intervalId);
  }, [user]);

  return blocked;
}

/* =========================================================
   PANTALLA DE BLOQUEO POR HORARIO
   ========================================================= */

function ScheduleBlockedPage() {
  const navigate = useNavigate();
  const { user } = UserAuth();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("[ScheduleBlockedPage] Error on signOut:", e);
    } finally {
      navigate("/login", { replace: true });
    }
  };

  useEffect(() => {
    if (user === null) {
      navigate("/login", { replace: true });
    }
  }, [user, navigate]);

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background: "#2B2F38",
        color: "#FFFFFF",
        textAlign: "center",
        padding: "20px",
      }}
    >
      <h1 style={{ marginBottom: "10px" }}>Access temporarily restricted</h1>
      <p style={{ maxWidth: "480px", marginBottom: "16px", lineHeight: 1.5 }}>
        For your role, the application is only available from{" "}
        <strong>7:00 a.m.</strong> to <strong>5:00 p.m.</strong> (GMT-7).
      </p>
      <p
        style={{
          maxWidth: "480px",
          marginBottom: "24px",
          fontSize: "0.9rem",
        }}
      >
        If you need to work outside this schedule, please contact your
        engineering lead or administrator.
      </p>
      <button
        onClick={handleLogout}
        style={{
          padding: "10px 20px",
          borderRadius: "6px",
          border: "none",
          background: "#F5A623",
          color: "#000",
          fontWeight: "bold",
          cursor: "pointer",
        }}
      >
        Go back to login
      </button>
    </div>
  );
}

/* =========================================================
   RUTAS
   ========================================================= */

// Componente que verifica la autenticación y redirige al checker
function AuthRedirect() {
  const { user } = UserAuth();
  if (user) {
    return <Navigate to="/checker" replace />;
  }
  return <Navigate to="/login" replace />;
}

// Este componente protege las rutas que requieren que el usuario esté loggeado
function ProtectedRoute({ children }) {
  const { user } = UserAuth();
  const blockedBySchedule = useScheduleBlock(user);

  if (user === undefined) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: "100vw",
          height: "100vh",
          backgroundColor: "#2b2f38",
          color: "white",
        }}
      >
        Verifying your session...
      </div>
    );
  }

  if (user === null) {
    return <Navigate to="/login" replace />;
  }

  // Bloqueo por horario para roles en BLOCKED_ROLES
  if (blockedBySchedule) {
    return <ScheduleBlockedPage />;
  }

  // Redirecciones según rol
  if (user.role_id === 1) {
    return <Navigate to="/superadmin/dashboard" replace />;
  }

  // 🔥 AQUÍ: rol 3 y rol 9 van a la MISMA sección de inventario
  if (user.role_id === 3 || user.role_id === 9) {
    return <Navigate to="/inv/dashboard" replace />;
  }

  if (user.role_id === 4 || user.role_id === 8) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
}

// Guardia de ruta para SUPER ADMIN
function SuperAdminProtectedRoute({ children }) {
  const { user } = UserAuth();
  const blockedBySchedule = useScheduleBlock(user);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const superAdminRole = [1];

  useEffect(() => {
    async function fetchUserRole() {
      if (!user) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("users")
        .select("role_id")
        .eq("id", user.id)
        .single();

      console.log(
        "Valor del rol en el SuperAdminProtectedRoute:",
        data?.role_id
      );
      if (!error && data) {
        setUserRole(data.role_id);
      }
      setLoading(false);
    }
    fetchUserRole();
  }, [user]);

  if (loading || user === undefined) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: "100vw",
          height: "100vh",
          backgroundColor: "#2b2f38",
          color: "white",
        }}
      >
        Verificando tu rol...
      </div>
    );
  }

  if (user === null) {
    return <Navigate to="/login" replace />;
  }

  // Rol 1 no está en BLOCKED_ROLES, pero mantenemos la lógica centralizada
  if (blockedBySchedule) {
    return <ScheduleBlockedPage />;
  }

  if (superAdminRole.includes(userRole)) {
    return children;
  } else {
    return <Navigate to="/dashboard" replace />;
  }
}

// Guardia de ruta para ADMIN (roles 4 y 8)
function AdminProtectedRoute({ children }) {
  const { user } = UserAuth();
  const blockedBySchedule = useScheduleBlock(user);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const AdminRole = [4, 8]; // 🔥 Incluimos rol 1 para que SuperAdmin pueda acceder a rutas Admin

  useEffect(() => {
    async function fetchUserRole() {
      if (!user) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("users")
        .select("role_id")
        .eq("id", user.id)
        .single();

      console.log(
        "Valor del rol en el AdminProtectedRoute:",
        data?.role_id
      );
      if (!error && data) {
        setUserRole(data.role_id);
      }
      setLoading(false);
    }
    fetchUserRole();
  }, [user]);

  if (loading || user === undefined) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: "100vw",
          height: "100vh",
          backgroundColor: "#2b2f38",
          color: "white",
        }}
      >
        Verificando tu rol...
      </div>
    );
  }

  if (user === null) {
    return <Navigate to="/login" replace />;
  }

  if (blockedBySchedule) {
    return <ScheduleBlockedPage />;
  }

  if (AdminRole.includes(userRole)) {
    return children;
  } else {
    return <Navigate to="/dashboard" replace />;
  }
}

// Guardia de ruta para INVENTARIO (roles 3 y 9)
function InventProtectedRoute({ children }) {
  const { user } = UserAuth();
  const blockedBySchedule = useScheduleBlock(user);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🔥 Roles que comparten la sección de inventario
  const inventoryRoles = [3, 9];

  useEffect(() => {
    async function fetchUserRole() {
      if (!user) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("users")
        .select("role_id")
        .eq("id", user.id)
        .single();

      if (!error && data) {
        setUserRole(data.role_id);
      }
      setLoading(false);
    }
    fetchUserRole();
  }, [user]);

  if (loading || user === undefined) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: "100vw",
          height: "100vh",
          backgroundColor: "#2b2f38",
          color: "white",
        }}
      >
        Verificando tu rol...
      </div>
    );
  }

  if (user === null) return <Navigate to="/login" replace />;

  // ⚠️ Solo rol 3 está en BLOCKED_ROLES; rol 9 NO se bloquea por horario.
  if (blockedBySchedule) {
    return <ScheduleBlockedPage />;
  }

  // ✅ Aquí estaba el bug: antes comparabas `userRole === [3]`
  if (inventoryRoles.includes(userRole)) {
    return children;
  } else {
    return <Navigate to="/dashboard" replace />;
  }
}

// Guardia de ruta para Slack Report (rol 11)
function SlackReportProtectedRoute({ children }) {
  const { user } = UserAuth();
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const slackReportRole = [11];

  useEffect(() => {
    async function fetchUserRole() {
      if (!user) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("users")
        .select("role_id")
        .eq("id", user.id)
        .single();

      if (!error && data) {
        setUserRole(data.role_id);
      }
      setLoading(false);
    }
    fetchUserRole();
  }, [user]);

  if (loading || user === undefined) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: "100vw",
          height: "100vh",
          backgroundColor: "#2b2f38",
          color: "white",
        }}
      >
        Verificando tu rol...
      </div>
    );
  }

  if (user === null) {
    return <Navigate to="/login" replace />;
  }

  if (slackReportRole.includes(userRole)) {
    return children;
  } else {
    return <Navigate to="/dashboard" replace />;
  }
}

// Guardia de ruta para Team Lead (rol 5)
function TeamLeadProtectedRoute({ children }) {
  const { user } = UserAuth();
  const blockedBySchedule = useScheduleBlock(user);

  if (user === undefined) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: "100vw",
          height: "100vh",
          backgroundColor: "#2b2f38",
          color: "white",
        }}
      >
        Verificando tu sesión...
      </div>
    );
  }

  if (user === null) {
    return <Navigate to="/login" replace />;
  }

  if (blockedBySchedule) {
    return <ScheduleBlockedPage />;
  }

  if (user.role_id === 5 || user.role_id === 8) {
    return children;
  } else {
    return <Navigate to="/dashboard" replace />;
  }
}

/* =========================================================
   DEFINICIÓN DE RUTAS
   ========================================================= */

export function MyRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/pending" element={<PendingPage />} />
      <Route path="/checker" element={<RoleChecker />} />
      <Route path="/" element={<AuthRedirect />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/request"
        element={
          <ProtectedRoute>
            <RequestPage />
          </ProtectedRoute>
        }
      />
      <Route
  path="/devices"
  element={ 
            <ProtectedRoute>
  <EmployeeDevicesPage /> 
            </ProtectedRoute>} 
/>
    
      <Route
        path="/logs"
        element={
          <ProtectedRoute>
            <DeviceLogsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/perfil"
        element={
          <ProtectedRoute>
            <Perfil />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/audit-logs"
        element={
          <SuperAdminProtectedRoute>
            <AuditLogsPage />
          </SuperAdminProtectedRoute>
        }
      />
      <Route
        path="/admin/metrics"
        element={
          <SuperAdminProtectedRoute>
            <SuperAdminMetricsPage />
          </SuperAdminProtectedRoute>
        }
      />
      <Route
        path="/team"
        element={
          <TeamLeadProtectedRoute>
            <TeamLeadRequestsPage />
          </TeamLeadProtectedRoute>
        }
      />

      <Route
        path="/superadmin/dashboard"
        element={
          <SuperAdminProtectedRoute>
            <SuperAdminDashboard />
          </SuperAdminProtectedRoute>
        }
      />

      <Route
        path="/admin/dashboard"
        element={
          <AdminProtectedRoute>
            <AdminDashboard />
          </AdminProtectedRoute>
        }
      />
      <Route
        path="/admin/team"
        element={
          <AdminProtectedRoute>
            <AdminEmployeesPage />
          </AdminProtectedRoute>
        }
      />
      <Route
        path="/admin/team"
        element={
          <AdminProtectedRoute>
            <AdminEmployeesPage />
          </AdminProtectedRoute>
        }
      />
      <Route
        path="/superadmin/team"
        element={
          <SuperAdminProtectedRoute>
            <SuperAdminEmployeesPage />
          </SuperAdminProtectedRoute>
           }
      />
      <Route
        path="/admin/devicelogs"
        element={
          <AdminProtectedRoute>
            <DeviceLogsPage />
          </AdminProtectedRoute>
        }
      />
      <Route
        path="/inv/dashboard"
        element={
          <InventProtectedRoute>
            <InventDashboard />
          </InventProtectedRoute>
        }
      />
      <Route
        path="/inv/reviews"
        element={
          <InventProtectedRoute>
            <PendingReviewsPage />
          </InventProtectedRoute>
        }
      />
      <Route
        path="/inv/devices"
        element={
          <InventProtectedRoute>
            <AllDevicesPage />
          </InventProtectedRoute>
        }
      />
      <Route
        path="/inv/logs"
        element={
          <InventProtectedRoute>
            <DeviceLogsPage />
          </InventProtectedRoute>
        }
      />
      <Route
        path="/admin/slack-report"
        element={
          <SlackReportProtectedRoute>
            <SlackReportPage />
          </SlackReportProtectedRoute>
        }
      />

      {/* Si no matchea ninguna ruta, manda a login */}
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}
