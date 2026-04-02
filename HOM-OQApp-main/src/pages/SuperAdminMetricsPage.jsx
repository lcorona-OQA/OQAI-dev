// src/pages/SuperAdminMetricsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { supabase } from "../supabase/supabase.config";
import { SuperAdminSidebar } from "../components/SuperAdminSidebar";

// Recharts (asegúrate de instalarlo: npm i recharts)
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";

const TIME_RANGE_OPTIONS = [
  { value: "3m", label: "Últimos 3 meses" },
  { value: "6m", label: "Últimos 6 meses" },
  { value: "12m", label: "Últimos 12 meses" },
];

const HO_APPROVED = new Set(["approved", "final_approved", "admin_approved"]);
const HO_PENDING = new Set(["pending_admin", "pending_lead"]);
const HO_REJECTED = new Set([
  "rejected",
  "cancelled",
  "cancelled_by_admin",
  "cancelled_by_member",
]);

function buildDateRange(monthsBack) {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - monthsBack);
  return {
    startDate: start.toISOString().slice(0, 10), // YYYY-MM-DD
    startIso: start.toISOString(),
  };
}

function weekdayLabel(idx) {
  const labels = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];
  return labels[idx] ?? String(idx);
}

function formatNumber(n) {
  if (n === null || n === undefined) return "0";
  return n.toLocaleString("es-MX");
}

function percent(a, b) {
  if (!b || b === 0) return "0%";
  const value = (a / b) * 100;
  return `${value.toFixed(1)}%`;
}

// ================== CÁLCULO DE MÉTRICAS ==================
function computeMetrics(
  hoRequests,
  users,
  teams,
  devices,
  deviceLogs,
  auditEvents
) {
  // ========= MAPS BÁSICOS (con team_id / team_name correctos) =========
  const teamById = new Map();
  for (const t of teams || []) {
    if (!t) continue;
    const tid = t.team_id;
    if (tid === null || tid === undefined) continue;
    teamById.set(tid, {
      id: tid,
      name: t.team_name || `Team #${tid}`,
    });
  }

  const userById = new Map();
  for (const u of users || []) {
    if (!u) continue;
    const team = u.team_id != null ? teamById.get(u.team_id) : null;
    userById.set(u.id, {
      ...u,
      teamName: team?.name || "Sin equipo",
      teamId: u.team_id ?? null,
    });
  }

  const deviceById = new Map();
  for (const d of devices || []) {
    if (!d) continue;
    deviceById.set(d.id, d);
  }

  // ========= MÉTRICAS DE HOME OFFICE =========
  const hoSummary = {
    totalRequests: 0,
    totalApproved: 0,
    totalRejected: 0,
    totalPending: 0,
    totalUsersWithHo: 0,
    busiestDay: null, // { date, total, approved }
  };

  const hoByDayMap = new Map(); // date -> { date, total, approved }
  const hoByWeekdayArr = Array.from({ length: 7 }, () => ({
    weekdayIndex: 0,
    total: 0,
    approved: 0,
  }));
  hoByWeekdayArr.forEach((d, idx) => (d.weekdayIndex = idx));

  const hoByMonthMap = new Map(); // YYYY-MM -> { month, total, approved }
  const hoPerUserMap = new Map(); // userId -> { ... }
  const hoPerTeamMap = new Map(); // teamName -> { ... }

  for (const r of hoRequests || []) {
    if (!r || !r.date) continue;
    const status = (r.status || "").toLowerCase();
    const userId = r.user_id || null;

    hoSummary.totalRequests += 1;

    const isApproved = HO_APPROVED.has(status);
    const isPending = HO_PENDING.has(status);
    const isRejected = HO_REJECTED.has(status);

    if (isApproved) hoSummary.totalApproved += 1;
    else if (isRejected) hoSummary.totalRejected += 1;
    else if (isPending) hoSummary.totalPending += 1;

    // --- Por día ---
    const dateStr = r.date;
    let dayObj = hoByDayMap.get(dateStr);
    if (!dayObj) {
      dayObj = { date: dateStr, total: 0, approved: 0 };
      hoByDayMap.set(dateStr, dayObj);
    }
    dayObj.total += 1;
    if (isApproved) dayObj.approved += 1;

    // --- Por weekday ---
    const jsDate = new Date(`${dateStr}T00:00:00`);
    if (!Number.isNaN(jsDate.getTime())) {
      const wd = jsDate.getDay();
      const bucket = hoByWeekdayArr[wd];
      bucket.total += 1;
      if (isApproved) bucket.approved += 1;
    }

    // --- Por mes ---
    const monthKey = dateStr.slice(0, 7); // YYYY-MM
    let monthObj = hoByMonthMap.get(monthKey);
    if (!monthObj) {
      monthObj = { month: monthKey, total: 0, approved: 0 };
      hoByMonthMap.set(monthKey, monthObj);
    }
    monthObj.total += 1;
    if (isApproved) monthObj.approved += 1;

    // --- Por usuario / equipo ---
    if (userId) {
      let uStats = hoPerUserMap.get(userId);
      if (!uStats) {
        const u = userById.get(userId);
        uStats = {
          userId,
          name: u?.display_name || u?.email || "Sin nombre",
          teamName: u?.teamName || "Sin equipo",
          total: 0,
          approved: 0,
          rejected: 0,
          pending: 0,
        };
        hoPerUserMap.set(userId, uStats);
      }
      uStats.total += 1;
      if (isApproved) uStats.approved += 1;
      else if (isRejected) uStats.rejected += 1;
      else if (isPending) uStats.pending += 1;

      // --- Por equipo (key = teamName) ---
      const teamName = uStats.teamName || "Sin equipo";
      let tStats = hoPerTeamMap.get(teamName);
      if (!tStats) {
        tStats = {
          teamName,
          total: 0,
          approved: 0,
          rejected: 0,
          pending: 0,
          uniqueUsers: new Set(),
        };
        hoPerTeamMap.set(teamName, tStats);
      }
      tStats.total += 1;
      if (isApproved) tStats.approved += 1;
      else if (isRejected) tStats.rejected += 1;
      else if (isPending) tStats.pending += 1;
      tStats.uniqueUsers.add(userId);
    }
  }

  hoSummary.totalUsersWithHo = hoPerUserMap.size;

  // Día más cargado
  let busiest = null;
  for (const obj of hoByDayMap.values()) {
    if (!busiest) busiest = obj;
    else if (obj.approved > busiest.approved) busiest = obj;
    else if (
      obj.approved === busiest.approved &&
      obj.total > busiest.total
    ) {
      busiest = obj;
    }
  }
  hoSummary.busiestDay = busiest;

  const hoByDay = Array.from(hoByDayMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const hoByMonth = Array.from(hoByMonthMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  );
  const hoByWeekday = hoByWeekdayArr.map((d) => ({
    ...d,
    label: weekdayLabel(d.weekdayIndex),
  }));

  const hoTopUsers = Array.from(hoPerUserMap.values())
    .sort((a, b) => b.approved - a.approved || b.total - a.total)
    .slice(0, 10);

  const hoByTeam = Array.from(hoPerTeamMap.values()).map((t) => ({
    teamName: t.teamName,
    total: t.total,
    approved: t.approved,
    rejected: t.rejected,
    pending: t.pending,
    usersCount: t.uniqueUsers.size,
    avgPerUser:
      t.approved && t.uniqueUsers.size
        ? t.approved / t.uniqueUsers.size
        : 0,
  }));

  const hoTopTeams = hoByTeam
    .slice()
    .sort((a, b) => b.approved - a.approved)
    .slice(0, 8);

  // ========= AUDIT / EMAIL / SLACK / STATUS =========
  const auditSummary = {
    totalEvents: 0,
    successEvents: 0,
    failureEvents: 0,
  };

  const actionsCount = new Map(); // action_type -> { action, total, success, failure }
  const entityCount = new Map(); // entity_type -> { entityType, total }
  const commByTeamMap = new Map(); // teamName -> { teamName, emails, slacks }

  const emailByDayMap = new Map(); // date -> { date, sent, failed }
  let emailSent = 0;
  let emailFailed = 0;
  const emailStageCount = new Map(); // stage -> count

  const slackByDayMap = new Map(); // date -> { date, slacks }
  let slackSent = 0;

  const statusByDayMap = new Map(); // date -> { date, changes }
  let statusChanges = 0;

  for (const ev of auditEvents || []) {
    if (!ev) continue;
    auditSummary.totalEvents += 1;
    if (ev.success) auditSummary.successEvents += 1;
    else auditSummary.failureEvents += 1;

    const action = ev.action_type || "unknown";
    const entity = ev.entity_type || "unknown";
    const actLower = action.toLowerCase();
    const entLower = entity.toLowerCase();

    // Por acción
    let aStats = actionsCount.get(action);
    if (!aStats) {
      aStats = { action, total: 0, success: 0, failure: 0 };
      actionsCount.set(action, aStats);
    }
    aStats.total += 1;
    if (ev.success) aStats.success += 1;
    else aStats.failure += 1;

    // Por entidad
    let eStats = entityCount.get(entity);
    if (!eStats) {
      eStats = { entityType: entity, total: 0 };
      entityCount.set(entity, eStats);
    }
    eStats.total += 1;

    const dateObj = new Date(ev.created_at);
    if (Number.isNaN(dateObj.getTime())) continue;
    const dateStr = dateObj.toISOString().slice(0, 10);

    const isEmail =
      actLower.includes("email") || entLower.includes("email");
    const isSlack =
      actLower.includes("slack") ||
      actLower.includes("dm") ||
      entLower.includes("slack");
    const isHoStatusChange =
      actLower === "status_change" &&
      entLower === "home_office_request";

    // --- Por equipo del actor (para comunicaciones) ---
    const actorTeamName =
      userById.get(ev.actor_user_id || "")?.teamName || "Sin equipo";
    let commTeam = commByTeamMap.get(actorTeamName);
    if (!commTeam) {
      commTeam = {
        teamName: actorTeamName,
        emails: 0,
        slacks: 0,
      };
      commByTeamMap.set(actorTeamName, commTeam);
    }

    if (isEmail) {
      let emDay = emailByDayMap.get(dateStr);
      if (!emDay) {
        emDay = { date: dateStr, sent: 0, failed: 0 };
        emailByDayMap.set(dateStr, emDay);
      }
      if (ev.success) {
        emDay.sent += 1;
        emailSent += 1;
      } else {
        emDay.failed += 1;
        emailFailed += 1;
      }

      const stage = ev.metadata?.stage || "desconocido";
      emailStageCount.set(stage, (emailStageCount.get(stage) || 0) + 1);

      commTeam.emails += 1;
    }

    if (isSlack) {
      let sDay = slackByDayMap.get(dateStr);
      if (!sDay) {
        sDay = { date: dateStr, slacks: 0 };
        slackByDayMap.set(dateStr, sDay);
      }
      sDay.slacks += 1;
      slackSent += 1;

      commTeam.slacks += 1;
    }

    if (isHoStatusChange) {
      let stDay = statusByDayMap.get(dateStr);
      if (!stDay) {
        stDay = { date: dateStr, changes: 0 };
        statusByDayMap.set(dateStr, stDay);
      }
      stDay.changes += 1;
      statusChanges += 1;
    }
  }

  const emailByDay = Array.from(emailByDayMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const slackByDay = Array.from(slackByDayMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const statusByDay = Array.from(statusByDayMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const actionsByType = Array.from(actionsCount.values()).sort(
    (a, b) => b.total - a.total
  );
  const entitiesByType = Array.from(entityCount.values()).sort(
    (a, b) => b.total - a.total
  );

  const emailStageBreakdown = Array.from(emailStageCount.entries())
    .map(([stage, total]) => ({ stage, total }))
    .sort((a, b) => b.total - a.total);

  const commByTeam = Array.from(commByTeamMap.values()).sort(
    (a, b) => b.emails + b.slacks - (a.emails + a.slacks)
  );

  // ========= DEVICES (POR EQUIPO, USO, RANKINGS) =========
  const deviceStatusMap = new Map(); // status -> { status, total }
  for (const d of devices || []) {
    const status = (d.status || "unknown").toLowerCase();
    let ds = deviceStatusMap.get(status);
    if (!ds) {
      ds = { status, total: 0 };
      deviceStatusMap.set(status, ds);
    }
    ds.total += 1;
  }
  const devicesByStatus = Array.from(deviceStatusMap.values()).sort(
    (a, b) => b.total - a.total
  );

  // uso por equipo basado en logs + assigned_user_id actual del device
  const deviceUsageByTeamMap = new Map(); // teamName -> { teamName, totalEvents, deviceMap }

  for (const log of deviceLogs || []) {
    if (!log || !log.device_id) continue;
    const device = deviceById.get(log.device_id);
    if (!device) continue;

    const ownerUser = userById.get(device.assigned_user_id || "");
    const teamName = ownerUser?.teamName || "Sin equipo";

    let tUsage = deviceUsageByTeamMap.get(teamName);
    if (!tUsage) {
      tUsage = {
        teamName,
        totalEvents: 0,
        deviceMap: new Map(),
      };
      deviceUsageByTeamMap.set(teamName, tUsage);
    }
    tUsage.totalEvents += 1;

    const curr = tUsage.deviceMap.get(device.id) || 0;
    tUsage.deviceMap.set(device.id, curr + 1);
  }

  const deviceUsageByTeam = Array.from(deviceUsageByTeamMap.values())
    .map((t) => {
      let topDeviceId = null;
      let topCount = 0;
      for (const [devId, count] of t.deviceMap.entries()) {
        if (count > topCount) {
          topCount = count;
          topDeviceId = devId;
        }
      }
      const dev = topDeviceId ? deviceById.get(topDeviceId) : null;
      return {
        teamName: t.teamName,
        totalEvents: t.totalEvents,
        topDeviceTag:
          dev?.asset_tag ||
          dev?.name ||
          dev?.model ||
          "N/A",
        topDeviceCount: topCount,
      };
    })
    .sort((a, b) => b.totalEvents - a.totalEvents);

  const topDevicesOverallMap = new Map(); // deviceId -> count
  for (const log of deviceLogs || []) {
    if (!log || !log.device_id) continue;
    topDevicesOverallMap.set(
      log.device_id,
      (topDevicesOverallMap.get(log.device_id) || 0) + 1
    );
  }
  const topDevicesOverall = Array.from(topDevicesOverallMap.entries())
    .map(([deviceId, count]) => {
      const dev = deviceById.get(deviceId);
      return {
        deviceId,
        count,
        label:
          dev?.asset_tag ||
          dev?.name ||
          dev?.model ||
          `Device ${deviceId.slice(0, 6)}...`,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    hoSummary,
    hoByDay,
    hoByWeekday,
    hoByMonth,
    hoTopUsers,
    hoByTeam,
    hoTopTeams,

    auditSummary,
    actionsByType,
    entitiesByType,
    emailByDay,
    slackByDay,
    statusByDay,
    emailStageBreakdown,
    commByTeam,
    emailSent,
    emailFailed,
    slackSent,
    statusChanges,

    devicesByStatus,
    deviceUsageByTeam,
    topDevicesOverall,
  };
}

// ================== COMPONENTE PRINCIPAL ==================
export function SuperAdminMetricsPage() {
  const [timeRange, setTimeRange] = useState("6m");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [hoRequests, setHoRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [devices, setDevices] = useState([]);
  const [deviceLogs, setDeviceLogs] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const monthsBack =
        timeRange === "3m" ? 3 : timeRange === "6m" ? 6 : 12;
      const { startDate, startIso } = buildDateRange(monthsBack);

      try {
        const [
          hoRes,
          usersRes,
          teamsRes,
          devicesRes,
          deviceLogsRes,
          auditRes,
        ] = await Promise.all([
          supabase
            .from("home_office_requests")
            .select("id, user_id, date, status")
            .gte("date", startDate),
          supabase
            .from("users")
            .select("id, display_name, email, role_id, team_id"),
          supabase.from("teams").select("team_id, team_name"),
          supabase
            .from("devices")
            .select("id, name, model, asset_tag, assigned_user_id, status"),
          supabase
            .from("device_logs")
            .select(
              "id, device_id, created_at, action, description, location, user_id"
            )
            .gte("created_at", startIso),
          supabase
            .from("audit_events")
            .select(
              "id, created_at, action_type, entity_type, entity_id, success, source, actor_user_id, metadata"
            )
            .gte("created_at", startIso),
        ]);

        const errors = [
          hoRes.error,
          usersRes.error,
          teamsRes.error,
          devicesRes.error,
          deviceLogsRes.error,
          auditRes.error,
        ].filter(Boolean);

        if (!cancelled) {
          if (errors.length > 0) {
            console.error("[SuperAdminMetricsPage] fetch errors:", errors);
            setError(
              errors[0]?.message || "Error cargando datos de métricas"
            );
          }

          setHoRequests(hoRes.data || []);
          setUsers(usersRes.data || []);
          setTeams(teamsRes.data || []);
          setDevices(devicesRes.data || []);
          setDeviceLogs(deviceLogsRes.data || []);
          setAuditEvents(auditRes.data || []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[SuperAdminMetricsPage] unexpected error:", err);
          setError(err?.message || "Error inesperado cargando métricas");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [timeRange]);

  const metrics = useMemo(
    () =>
      computeMetrics(
        hoRequests,
        users,
        teams,
        devices,
        deviceLogs,
        auditEvents
      ),
    [hoRequests, users, teams, devices, deviceLogs, auditEvents]
  );

  const {
    hoSummary,
    hoByDay,
    hoByWeekday,
    hoByMonth,
    hoTopUsers,
    hoByTeam,
    hoTopTeams,

    auditSummary,
    actionsByType,
    entitiesByType,
    emailByDay,
    slackByDay,
    statusByDay,
    emailStageBreakdown,
    commByTeam,
    emailSent,
    emailFailed,
    slackSent,
    statusChanges, // por si luego lo quieres en un KPI

    devicesByStatus,
    deviceUsageByTeam,
    topDevicesOverall,
  } = metrics;

  const approvalRate = percent(
    hoSummary.totalApproved,
    hoSummary.totalApproved + hoSummary.totalRejected
  );
  const avgHoPerUser =
    hoSummary.totalUsersWithHo > 0
      ? (hoSummary.totalApproved / hoSummary.totalUsersWithHo).toFixed(2)
      : "0.00";

  const emailSuccessRate = percent(
    emailSent,
    emailSent + emailFailed
  );
  const auditSuccessRate = percent(
    auditSummary.successEvents,
    auditSummary.totalEvents
  );

  return (
    <MainLayout>
      <SuperAdminSidebar />
      <MetricsContent>
        <HeaderRow>
          <div>
            <PageTitle>Metrics & Insights</PageTitle>
            <Subtitle>
              Visión 360º de Home Office, comunicaciones, dispositivos y
              actividad de la plataforma.
            </Subtitle>
          </div>
          <HeaderControls>
            <Select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
            >
              {TIME_RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            {loading && <Tag>Cargando...</Tag>}
          </HeaderControls>
        </HeaderRow>

        {error && <ErrorBox>{error}</ErrorBox>}

        {/* ====== OVERVIEW CARDS ====== */}
        <Section>
          <SectionTitle>Resumen ejecutivo Home Office</SectionTitle>
          <CardsGrid>
            <MetricCard>
              <CardLabel>Días HO aprobados</CardLabel>
              <CardValue>{formatNumber(hoSummary.totalApproved)}</CardValue>
              <CardHint>
                Total de registros en estado aprobado / admin_approved /
                final_approved.
              </CardHint>
            </MetricCard>

            <MetricCard>
              <CardLabel>Colaboradores con HO</CardLabel>
              <CardValue>
                {formatNumber(hoSummary.totalUsersWithHo)}
              </CardValue>
              <CardHint>
                Personas que han tenido al menos 1 día de Home Office en el
                periodo.
              </CardHint>
            </MetricCard>

            <MetricCard>
              <CardLabel>Promedio HO por colaborador</CardLabel>
              <CardValue>{avgHoPerUser}</CardValue>
              <CardHint>Días HO aprobados / N° de colaboradores con HO.</CardHint>
            </MetricCard>

            <MetricCard>
              <CardLabel>Tasa de aprobación</CardLabel>
              <CardValue>{approvalRate}</CardValue>
              <CardHint>
                Aprobados / (Aprobados + Rechazados), sólo decisiones
                finales.
              </CardHint>
            </MetricCard>
          </CardsGrid>

          {hoSummary.busiestDay && (
            <BusiestDayBox>
              <strong>
                Día con más personas en Home Office (aprobado):
              </strong>{" "}
              {hoSummary.busiestDay.date} —{" "}
              <strong>{hoSummary.busiestDay.approved}</strong> días aprobados (
              {hoSummary.busiestDay.total} solicitudes totales).
            </BusiestDayBox>
          )}
        </Section>

        {/* ====== HO USO POR DÍA / SEMANA / MES ====== */}
        <Section>
          <SectionTitle>Uso de Home Office en el tiempo</SectionTitle>
          <TwoColGrid>
            <ChartCard>
              <ChartTitle>HO por día (timeline)</ChartTitle>
              <ChartDescription>
                Volumen de días HO registrados por fecha (todas las
                solicitudes).
              </ChartDescription>
              <ChartContainer>
                {hoByDay.length === 0 ? (
                  <EmptyState>No hay datos de Home Office.</EmptyState>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={hoByDay}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="total"
                        name="Total solicitudes"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="approved"
                        name="Aprobadas"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartContainer>
            </ChartCard>

            <ChartCard>
              <ChartTitle>HO por día de la semana</ChartTitle>
              <ChartDescription>
                Concentración por weekday (útil para ver patrones de martes /
                viernes, etc.).
              </ChartDescription>
              <ChartContainer>
                {hoByWeekday.length === 0 ? (
                  <EmptyState>No hay datos.</EmptyState>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hoByWeekday}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Bar
                        dataKey="total"
                        name="Total solicitudes"
                        radius={[6, 6, 0, 0]}
                      />
                      <Bar
                        dataKey="approved"
                        name="Aprobadas"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartContainer>
            </ChartCard>
          </TwoColGrid>

          <ChartRow>
            <ChartCard>
              <ChartTitle>HO por mes</ChartTitle>
              <ChartDescription>
                Tendencia mensual de uso de Home Office (aprobadas vs total).
              </ChartDescription>
              <ChartContainer>
                {hoByMonth.length === 0 ? (
                  <EmptyState>No hay datos de meses.</EmptyState>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hoByMonth}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Bar dataKey="total" name="Total" radius={[6, 6, 0, 0]} />
                      <Bar
                        dataKey="approved"
                        name="Aprobadas"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartContainer>
            </ChartCard>
          </ChartRow>
        </Section>

        {/* ====== TOP USERS / EQUIPOS ====== */}
        <Section>
          <SectionTitle>Ranking de uso de Home Office</SectionTitle>
          <TwoColGrid>
            <ChartCard>
              <ChartTitle>Top colaboradores (por días aprobados)</ChartTitle>
              <ChartDescription>
                Las personas que más han utilizado Home Office en el periodo.
              </ChartDescription>
              <ChartContainer>
                {hoTopUsers.length === 0 ? (
                  <EmptyState>No hay datos de colaboradores.</EmptyState>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={hoTopUsers.map((u) => ({
                        ...u,
                        label: `${u.name} (${u.teamName})`,
                      }))}
                      layout="vertical"
                      margin={{ left: 160 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis
                        type="category"
                        dataKey="label"
                        tick={{ fontSize: 11 }}
                      />
                      <RechartsTooltip />
                      <Legend />
                      <Bar
                        dataKey="approved"
                        name="Días HO aprobados"
                        radius={[0, 6, 6, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartContainer>
            </ChartCard>

            <ChartCard>
              <ChartTitle>Equipos más “HO friendly”</ChartTitle>
              <ChartDescription>
                Equipos con mayor volumen de Home Office aprobado
              </ChartDescription>
              <ChartContainer>
                {hoTopTeams.length === 0 ? (
                  <EmptyState>No hay datos de equipos.</EmptyState>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hoTopTeams}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="teamName" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Bar
                        dataKey="approved"
                        name="Días HO aprobados"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartContainer>
            </ChartCard>
          </TwoColGrid>

          {/* Tabla detallada por equipo */}
          <SubSectionTitle>Detalle por equipo</SubSectionTitle>
          <ScrollableTableWrapper>
            <StyledTable>
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th>Días HO totales</th>
                  <th>Días HO aprobados</th>
                  <th>Rechazados</th>
                  <th>Pendientes</th>
                  <th># Colaboradores</th>
                  <th>Prom. HO aprobados / colaborador</th>
                </tr>
              </thead>
              <tbody>
                {hoByTeam.length === 0 && (
                  <tr>
                    <td colSpan={7}>Sin datos de equipo.</td>
                  </tr>
                )}
                {hoByTeam.map((t) => (
                  <tr key={t.teamName}>
                    <td>{t.teamName}</td>
                    <td>{formatNumber(t.total)}</td>
                    <td>{formatNumber(t.approved)}</td>
                    <td>{formatNumber(t.rejected)}</td>
                    <td>{formatNumber(t.pending)}</td>
                    <td>{formatNumber(t.usersCount)}</td>
                    <td>{t.avgPerUser.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </StyledTable>
          </ScrollableTableWrapper>
        </Section>

        {/* ====== COMUNICACIONES / AUDIT ====== */}
        <Section>
          <SectionTitle>Comunicaciones y actividad de la plataforma</SectionTitle>
          <CardsGrid>
            <MetricCard>
              <CardLabel>Eventos de auditoría (log)</CardLabel>
              <CardValue>
                {formatNumber(auditSummary.totalEvents)}
              </CardValue>
              <CardHint>
                Todos los eventos registrados en <code>audit_events</code>.
              </CardHint>
            </MetricCard>
            <MetricCard>
              <CardLabel>Tasa de éxito (audit)</CardLabel>
              <CardValue>{auditSuccessRate}</CardValue>
              <CardHint>
                Eventos <code>success=true</code> / total de eventos.
              </CardHint>
            </MetricCard>
            <MetricCard>
              <CardLabel>Correos enviados (audit)</CardLabel>
              <CardValue>
                {formatNumber(emailSent)}{" "}
                <small style={{ fontSize: "0.8rem" }}>
                  ({formatNumber(emailFailed)} errores)
                </small>
              </CardValue>
              <CardHint>
                Derivado de eventos <code>action_type</code> o{" "}
                <code>entity_type</code> relacionados a email.
              </CardHint>
            </MetricCard>
            <MetricCard>
              <CardLabel>Tasa de éxito de correos</CardLabel>
              <CardValue>{emailSuccessRate}</CardValue>
              <CardHint>
                Útil para ver la salud del canal de notificaciones de correo.
              </CardHint>
            </MetricCard>
          </CardsGrid>

          <TwoColGrid>
            <ChartCard>
              <ChartTitle>Emails por día (enviados vs fallidos)</ChartTitle>
              <ChartDescription>
                Basado en eventos de auditoría marcados como email.
              </ChartDescription>
              <ChartContainer>
                {emailByDay.length === 0 ? (
                  <EmptyState>No hay datos de correos.</EmptyState>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={emailByDay}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="sent"
                        name="Enviados"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="failed"
                        name="Fallidos"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartContainer>
            </ChartCard>

            <ChartCard>
              <ChartTitle>Slack / DMs vs cambios de estado (por día)</ChartTitle>
              <ChartDescription>
                Volumen de mensajes Slack enviados y cambios de estado de HO.
              </ChartDescription>
              <ChartContainer>
                {slackByDay.length === 0 && statusByDay.length === 0 ? (
                  <EmptyState>No hay datos de Slack / status.</EmptyState>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mergeByDate(slackByDay, statusByDay)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="slacks"
                        name="Slack / DMs"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="changes"
                        name="Cambios de estado HO"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartContainer>
            </ChartCard>
          </TwoColGrid>

          <TwoColGrid>
            <ChartCard>
              <ChartTitle>Top tipos de acción (audit)</ChartTitle>
              <ChartDescription>
                Qué tipo de evento se registra más en los logs (status_change,
                email_sent, etc.).
              </ChartDescription>
              <ChartContainer>
                {actionsByType.length === 0 ? (
                  <EmptyState>No hay datos de acciones.</EmptyState>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={actionsByType.slice(0, 10)}
                      layout="vertical"
                      margin={{ left: 160 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis
                        type="category"
                        dataKey="action"
                        tick={{ fontSize: 10 }}
                      />
                      <RechartsTooltip />
                      <Legend />
                      <Bar
                        dataKey="total"
                        name="Eventos"
                        radius={[0, 6, 6, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartContainer>
            </ChartCard>

            <ChartCard>
              <ChartTitle>Distribución de entidades auditadas</ChartTitle>
              <ChartDescription>
                Qué entidades generan más logs: usuario, device,
                home_office_request, etc.
              </ChartDescription>
              <ChartContainer>
                {entitiesByType.length === 0 ? (
                  <EmptyState>No hay datos de entidades.</EmptyState>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={entitiesByType}
                        dataKey="total"
                        nameKey="entityType"
                        outerRadius="80%"
                        label={(e) => `${e.entityType} (${e.value})`}
                      />
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartContainer>
            </ChartCard>
          </TwoColGrid>

          <SubSectionTitle>
            Detalle: emails por etapa y comunicaciones por equipo
          </SubSectionTitle>
          <TwoColGrid>
            <ScrollableTableWrapper>
              <StyledTable>
                <thead>
                  <tr>
                    <th>Etapa (stage)</th>
                    <th>Emails</th>
                  </tr>
                </thead>
                <tbody>
                  {emailStageBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={2}>
                        Sin desglose de etapas (stage en metadata).
                      </td>
                    </tr>
                  )}
                  {emailStageBreakdown.map((s) => (
                    <tr key={s.stage}>
                      <td>{s.stage}</td>
                      <td>{formatNumber(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </StyledTable>
            </ScrollableTableWrapper>

            <ScrollableTableWrapper>
              <StyledTable>
                <thead>
                  <tr>
                    <th>Equipo</th>
                    <th>Emails</th>
                    <th>Slack / DMs</th>
                    <th>Total comunicaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {commByTeam.length === 0 && (
                    <tr>
                      <td colSpan={4}>Sin datos de comunicaciones.</td>
                    </tr>
                  )}
                  {commByTeam.map((t) => (
                    <tr key={t.teamName}>
                      <td>{t.teamName}</td>
                      <td>{formatNumber(t.emails)}</td>
                      <td>{formatNumber(t.slacks)}</td>
                      <td>{formatNumber(t.emails + t.slacks)}</td>
                    </tr>
                  ))}
                </tbody>
              </StyledTable>
            </ScrollableTableWrapper>
          </TwoColGrid>
        </Section>

        {/* ====== DEVICES & INVENTARIO ====== */}
        <Section>
          <SectionTitle>Inventario y uso de dispositivos por equipo</SectionTitle>
          <TwoColGrid>
            <ChartCard>
              <ChartTitle>Dispositivos por status</ChartTitle>
              <ChartDescription>
                Snapshot actual de estados: en oficina, taken_ho, en reparación,
                etc.
              </ChartDescription>
              <ChartContainer>
                {devicesByStatus.length === 0 ? (
                  <EmptyState>No hay datos de dispositivos.</EmptyState>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={devicesByStatus}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="status" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Bar
                        dataKey="total"
                        name="Dispositivos"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartContainer>
            </ChartCard>

            <ChartCard>
              <ChartTitle>Top dispositivos más utilizados (global)</ChartTitle>
              <ChartDescription>
                Basado en el volumen de logs por dispositivo.
              </ChartDescription>
              <ChartContainer>
                {topDevicesOverall.length === 0 ? (
                  <EmptyState>No hay logs de dispositivos.</EmptyState>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topDevicesOverall}
                      layout="vertical"
                      margin={{ left: 140 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis
                        type="category"
                        dataKey="label"
                        tick={{ fontSize: 11 }}
                      />
                      <RechartsTooltip />
                      <Legend />
                      <Bar
                        dataKey="count"
                        name="Eventos"
                        radius={[0, 6, 6, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartContainer>
            </ChartCard>
          </TwoColGrid>

          <SubSectionTitle>
            Ranking de uso por equipo (dispositivo más usado por team)
          </SubSectionTitle>
          <ScrollableTableWrapper>
            <StyledTable>
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th>Eventos de uso (logs)</th>
                  <th>Dispositivo más usado</th>
                  <th>Veces que aparece en logs</th>
                </tr>
              </thead>
              <tbody>
                {deviceUsageByTeam.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      Sin datos de uso de dispositivos por equipo.
                    </td>
                  </tr>
                )}
                {deviceUsageByTeam.map((t) => (
                  <tr key={t.teamName}>
                    <td>{t.teamName}</td>
                    <td>{formatNumber(t.totalEvents)}</td>
                    <td>{t.topDeviceTag}</td>
                    <td>{formatNumber(t.topDeviceCount)}</td>
                  </tr>
                ))}
              </tbody>
            </StyledTable>
          </ScrollableTableWrapper>
        </Section>
      </MetricsContent>
    </MainLayout>
  );
}

// ==== helpers ====

// Merge slackByDay y statusByDay por fecha para un único gráfico
function mergeByDate(slackArr, statusArr) {
  const map = new Map();
  for (const s of slackArr || []) {
    const key = s.date;
    map.set(key, { date: key, slacks: s.slacks || 0, changes: 0 });
  }
  for (const st of statusArr || []) {
    const key = st.date;
    const existing = map.get(key) || { date: key, slacks: 0, changes: 0 };
    existing.changes += st.changes || 0;
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

// ==== styled components (look & feel a doc con el resto) ====

const MainLayout = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr;
  width: 100vw;
  height: 100vh;
  background-color: #edf0f6;
  overflow: hidden;
`;

const MetricsContent = styled.div`
  padding: 20px;
  height: 100vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
`;

const PageTitle = styled.h1`
  margin: 0;
  font-size: 1.8rem;
  color: #151821;
`;

const Subtitle = styled.p`
  margin: 4px 0 0;
  color: #60657a;
  font-size: 0.95rem;
`;

const HeaderControls = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const Select = styled.select`
  background-color: #ffffff;
  color: #151821;
  border-radius: 8px;
  border: 1px solid #d1d5e4;
  padding: 6px 10px;
  font-size: 0.9rem;
`;

const Tag = styled.span`
  background-color: #e1e5ff;
  color: #2f3dbf;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.8rem;
`;

const ErrorBox = styled.div`
  background-color: #ffecec;
  color: #b3261e;
  border: 1px solid #ffb4a9;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.9rem;
`;

const Section = styled.section`
  background-color: #ffffff;
  border-radius: 12px;
  padding: 18px 18px 20px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: 1.15rem;
  color: #151821;
`;

const SubSectionTitle = styled.h3`
  margin: 4px 0 0;
  font-size: 1rem;
  color: #444b5c;
`;

const CardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
`;

const MetricCard = styled.div`
  background-color: #f6f7ff;
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid #e0e3f3;
`;

const CardLabel = styled.div`
  font-size: 0.85rem;
  color: #72788b;
`;

const CardValue = styled.div`
  font-size: 1.4rem;
  font-weight: 600;
  color: #5869ebff;
`;

const CardHint = styled.div`
  font-size: 0.75rem;
  color: #8d93a6;
`;

const BusiestDayBox = styled.div`
  margin-top: 4px;
  padding: 8px 10px;
  border-radius: 8px;
  background-color: #f3f5ff;
  color: #444b5c;
  font-size: 0.85rem;
`;

const TwoColGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.1fr);
  gap: 14px;
  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }
`;

const ChartRow = styled.div`
  margin-top: 12px;
`;

const ChartCard = styled.div`
  background-color: #f8f9ff;
  border-radius: 10px;
  padding: 12px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid #e0e3f3;
`;

const ChartTitle = styled.div`
  font-size: 0.95rem;
  font-weight: 500;
  color: #151821;
`;

const ChartDescription = styled.div`
  font-size: 0.8rem;
  color: #7a7f92;
`;

const ChartContainer = styled.div`
  margin-top: 6px;
  height: 260px;
`;

const EmptyState = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9aa0b5;
  font-size: 0.85rem;
`;

const ScrollableTableWrapper = styled.div`
  margin-top: 8px;
  max-height: 260px;
  overflow: auto;
  border-radius: 8px;
  border: 1px solid #dde0ee;
  background-color: #ffffff;
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  color: #2b3040;

  th,
  td {
    padding: 6px 8px;
    border-bottom: 1px solid #e4e6f3;
    text-align: left;
    white-space: nowrap;
  }

  th {
    background-color: #f1f3ff;
    position: sticky;
    top: 0;
    z-index: 1;
    font-weight: 600;
  }

  tr:nth-child(even) td {
    background-color: #fafbff;
  }
`;
