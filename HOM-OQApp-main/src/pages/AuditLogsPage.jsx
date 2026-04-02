// src/pages/AuditLogsPage.jsx
import React, { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { supabase } from "../supabase/supabase.config";
import { SuperAdminSidebar } from "../components/SuperAdminSidebar";
import "../styles/audit.css";

const INITIAL_FILTERS = {
  text: "",
  actionType: "",
  entityType: "",
  success: "all", // "all" | "success" | "failure"
  dateFrom: "",
  dateTo: "",
  datePreset: "none", // "none" | "24h" | "7d" | "30d"
};

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[" ,\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(events) {
  const header = [
    "id",
    "created_at",
    "actor_user_id",
    "actor_email",
    "actor_display_name",
    "action_type",
    "entity_type",
    "entity_id",
    "success",
    "summary",
    "source",
    "error_message",
    "metadata_json",
  ];

  const lines = [];
  lines.push(header.join(","));

  for (const e of events) {
    const row = [
      e.id,
      e.created_at,
      e.actor_user_id ?? "",
      e.actor?.email ?? "",
      e.actor?.display_name ?? "",
      e.action_type,
      e.entity_type,
      e.entity_id ?? "",
      e.success ? "success" : "failure",
      e.summary,
      e.source ?? "",
      e.error_message ?? "",
      JSON.stringify(e.metadata ?? {}),
    ].map(csvEscape);

    lines.push(row.join(","));
  }

  return lines.join("\n");
}

function downloadCsv(filename, csv) {
  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatMetadataShort(metadata) {
  if (!metadata) return "";
  let str;
  try {
    str = JSON.stringify(metadata);
  } catch {
    return "";
  }
  if (str.length > 120) {
    return str.slice(0, 117) + "...";
  }
  return str;
}

function formatJsonPretty(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function dateToInputValue(date) {
  return date.toISOString().slice(0, 10);
}

// =======================
// COMPONENTE PRINCIPAL
// =======================
export const AuditLogsPage = () => {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  // ============================
  // Query base a Supabase
  // ============================
  const buildBaseQuery = useCallback(
    (forExport) => {
      let query = supabase
        .from("audit_events")
        .select(
          `
          id,
          created_at,
          actor_user_id,
          action_type,
          entity_type,
          entity_id,
          summary,
          metadata,
          success,
          error_message,
          source,
          actor:actor_user_id (
            id,
            email,
            display_name
          )
        `,
          { count: "exact" },
        );

      const text = filters.text.trim();
      if (text) {
        const like = `%${text}%`;
        // Buscamos en summary, error_message, entity_id y source
        query = query.or(
          `summary.ilike.${like},error_message.ilike.${like},entity_id.ilike.${like},source.ilike.${like}`,
        );
      }

      if (filters.actionType.trim()) {
        query = query.eq("action_type", filters.actionType.trim());
      }

      if (filters.entityType.trim()) {
        query = query.eq("entity_type", filters.entityType.trim());
      }

      if (filters.success === "success") {
        query = query.eq("success", true);
      } else if (filters.success === "failure") {
        query = query.eq("success", false);
      }

      if (filters.dateFrom) {
        query = query.gte("created_at", filters.dateFrom);
      }
      if (filters.dateTo) {
        // Hasta el final del día seleccionado
        query = query.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
      }

      if (!forExport) {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.order("created_at", { ascending: false }).range(from, to);
      } else {
        query = query.order("created_at", { ascending: false });
      }

      return query;
    },
    [filters, page, pageSize],
  );

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error, count } = await buildBaseQuery(false);

      if (error) {
        console.error("[AuditLogsPage] Error fetching events:", error);
        setError(error.message ?? "Error fetching audit events");
        setEvents([]);
        setTotalCount(0);
        setSelectedEvent(null);
        return;
      }

      setEvents(data || []);
      setTotalCount(count ?? 0);

      if (
        selectedEvent &&
        !(data || []).some((ev) => ev.id === selectedEvent.id)
      ) {
        setSelectedEvent(null);
      }
    } finally {
      setLoading(false);
    }
  }, [buildBaseQuery, selectedEvent]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // ============================
  // Handlers de filtros
  // ============================
  const handleFilterChange = (field, value) => {
    setPage(1);
    setFilters((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "dateFrom" || field === "dateTo"
        ? { datePreset: "none" }
        : {}),
    }));
  };

  const handleClearFilters = () => {
    setFilters(INITIAL_FILTERS);
    setPage(1);
    setSelectedEvent(null);
  };

  const applyDatePreset = (preset) => {
    const now = new Date();
    let from = "";
    let to = "";

    if (preset === "24h") {
      const fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      from = dateToInputValue(fromDate);
      to = dateToInputValue(now);
    } else if (preset === "7d") {
      const fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      from = dateToInputValue(fromDate);
      to = dateToInputValue(now);
    } else if (preset === "30d") {
      const fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      from = dateToInputValue(fromDate);
      to = dateToInputValue(now);
    } else {
      from = "";
      to = "";
    }

    setPage(1);
    setFilters((prev) => ({
      ...prev,
      dateFrom: from,
      dateTo: to,
      datePreset: preset,
    }));
  };

  const applyQuickFilter = (type) => {
    setPage(1);
    setFilters((prev) => {
      switch (type) {
        case "errors":
          return { ...prev, success: "failure" };
        case "success-only":
          return { ...prev, success: "success" };
        case "all-results":
          return { ...prev, success: "all" };
        case "entity-users":
          return { ...prev, entityType: "user" };
        case "entity-devices":
          return { ...prev, entityType: "device" };
        case "entity-ho":
          return { ...prev, entityType: "home_office_request" };
        default:
          return prev;
      }
    });
  };

  const handleExportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const { data, error } = await buildBaseQuery(true).limit(5000);
      if (error) {
        console.error("[AuditLogsPage] Error exporting CSV:", error);
        setError(error.message ?? "Error exporting CSV");
        return;
      }
      const rows = data || [];
      const csv = buildCsv(rows);
      const today = new Date().toISOString().slice(0, 10);
      downloadCsv(`audit_logs_${today}.csv`, csv);
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSelectEvent = (event) => {
    setSelectedEvent((prev) => (prev && prev.id === event.id ? null : event));
  };

  const handleCopyEventJson = () => {
    if (!selectedEvent) return;
    const text = formatJsonPretty(selectedEvent);
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch((err) => {
        console.error("[AuditLogsPage] Error copying JSON:", err);
      });
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch (err) {
        console.error("[AuditLogsPage] Error copying JSON (fallback):", err);
      }
      document.body.removeChild(textarea);
    }
  };

  // ============================
  // Métricas rápidas
  // ============================
  const successCount = events.filter((e) => e.success).length;
  const failureCount = events.length - successCount;
  const lastEventDate = events[0]?.created_at || null;

  const topActionTypes = (() => {
    const map = new Map();
    for (const e of events) {
      if (!e.action_type) continue;
      map.set(e.action_type, (map.get(e.action_type) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  })();

  const topEntityTypes = (() => {
    const map = new Map();
    for (const e of events) {
      if (!e.entity_type) continue;
      map.set(e.entity_type, (map.get(e.entity_type) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  })();

  return (
    <MainLayout>
      {/* 👉 Sidebar igual que en SuperAdminDashboard */}
      <SuperAdminSidebar />

      {/* 👉 Contenido scrollable con el diseño de tus otras pantallas */}
      <AuditContentArea>
        <div className="audit-page">
          <div className="audit-container">
            {/* ========== HEADER ========== */}
            <div className="audit-header">
              <div className="audit-title-block">
                <div>
                  <h1 className="audit-title">Audit Logs</h1>
                  <p className="audit-subtitle">
                    Vista centralizada de todos los eventos relevantes de la
                    plataforma: cambios de estado, dispositivos, usuarios, home
                    office, fallos de integraciones, etc.
                  </p>
                  <p className="audit-subtitle secondary">
                    Pensado para revisiones periódicas, investigaciones
                    puntuales y evidencia de controles (SOC 2, ISO 27001).
                  </p>
                </div>

                <div className="audit-header-actions no-print">
                  <button
                    type="button"
                    className="audit-button ghost"
                    onClick={handleClearFilters}
                    disabled={loading}
                  >
                    Limpiar filtros
                  </button>
                  <button
                    type="button"
                    className="audit-button ghost"
                    onClick={handlePrint}
                  >
                    Imprimir / Guardar PDF
                  </button>
                  <button
                    type="button"
                    className="audit-button primary"
                    onClick={handleExportCsv}
                    disabled={exporting}
                  >
                    {exporting ? "Exportando..." : "Exportar CSV (máx. 5000)"}
                  </button>
                </div>
              </div>

              {/* RANGOS RÁPIDOS */}
              <div className="audit-quick-row no-print">
                <div className="audit-quick-group">
                  <span className="audit-quick-label">Rangos rápidos</span>
                  <button
                    type="button"
                    className={`audit-chip ${
                      filters.datePreset === "24h" ? "chip-active" : ""
                    }`}
                    onClick={() => applyDatePreset("24h")}
                  >
                    Últimas 24h
                  </button>
                  <button
                    type="button"
                    className={`audit-chip ${
                      filters.datePreset === "7d" ? "chip-active" : ""
                    }`}
                    onClick={() => applyDatePreset("7d")}
                  >
                    Últimos 7 días
                  </button>
                  <button
                    type="button"
                    className={`audit-chip ${
                      filters.datePreset === "30d" ? "chip-active" : ""
                    }`}
                    onClick={() => applyDatePreset("30d")}
                  >
                    Últimos 30 días
                  </button>
                  <button
                    type="button"
                    className={`audit-chip ${
                      filters.datePreset === "none" ? "chip-active" : ""
                    }`}
                    onClick={() => applyDatePreset("none")}
                  >
                    Todo el historial
                  </button>
                </div>

                <div className="audit-quick-group">
                  <span className="audit-quick-label">Atajos de auditoría</span>
                  <button
                    type="button"
                    className="audit-chip"
                    onClick={() => applyQuickFilter("errors")}
                  >
                    Solo errores
                  </button>
                  <button
                    type="button"
                    className="audit-chip"
                    onClick={() => applyQuickFilter("success-only")}
                  >
                    Solo éxito
                  </button>
                  <button
                    type="button"
                    className="audit-chip"
                    onClick={() => applyQuickFilter("entity-users")}
                  >
                    Cambios en usuarios
                  </button>
                  <button
                    type="button"
                    className="audit-chip"
                    onClick={() => applyQuickFilter("entity-devices")}
                  >
                    Inventario / dispositivos
                  </button>
                  <button
                    type="button"
                    className="audit-chip"
                    onClick={() => applyQuickFilter("entity-ho")}
                  >
                    Home Office
                  </button>
                </div>
              </div>
            </div>

            {/* ========== FILTROS + RESUMEN ========== */}
            <div className="audit-top-panel no-print">
              {/* Filtros */}
              <div className="audit-filters">
                <div className="audit-filter-group">
                  <label className="audit-filter-label">
                    Búsqueda libre
                    <input
                      type="text"
                      className="audit-input"
                      placeholder="Summary, error, entity_id, source..."
                      value={filters.text}
                      onChange={(e) =>
                        handleFilterChange("text", e.target.value)
                      }
                    />
                    <span className="audit-filter-help">
                      Útil para investigaciones: copia parte de un error, un ID
                      de dispositivo, un correo o texto de resumen.
                    </span>
                  </label>

                  <label className="audit-filter-label">
                    Action type
                    <input
                      type="text"
                      className="audit-input"
                      placeholder="ej: status_change, email_sent, deactivate_user..."
                      value={filters.actionType}
                      onChange={(e) =>
                        handleFilterChange("actionType", e.target.value)
                      }
                    />
                    <span className="audit-filter-help">
                      Describe la acción registrada (qué pasó). Ejemplos:{" "}
                      <code>status_change</code>, <code>email_sent</code>,{" "}
                      <code>email_failed</code>, <code>deactivate_user</code>.
                    </span>
                  </label>

                  <label className="audit-filter-label">
                    Entity type
                    <input
                      type="text"
                      className="audit-input"
                      placeholder="ej: device, user, home_office_request..."
                      value={filters.entityType}
                      onChange={(e) =>
                        handleFilterChange("entityType", e.target.value)
                      }
                    />
                    <span className="audit-filter-help">
                      Sobre qué objeto actuó el sistema. Ejemplos:{" "}
                      <code>user</code>, <code>device</code>,{" "}
                      <code>home_office_request</code>.
                    </span>
                  </label>
                </div>

                <div className="audit-filter-group">
                  <label className="audit-filter-label">
                    Resultado
                    <select
                      className="audit-select"
                      value={filters.success}
                      onChange={(e) =>
                        handleFilterChange("success", e.target.value)
                      }
                    >
                      <option value="all">Todos</option>
                      <option value="success">Sólo éxito</option>
                      <option value="failure">Sólo error</option>
                    </select>
                    <span className="audit-filter-help">
                      Para revisiones de incidentes, suele ser útil empezar por
                      "Sólo error".
                    </span>
                  </label>

                  <label className="audit-filter-label">
                    Desde
                    <input
                      type="date"
                      className="audit-input"
                      value={filters.dateFrom}
                      onChange={(e) =>
                        handleFilterChange("dateFrom", e.target.value)
                      }
                    />
                  </label>

                  <label className="audit-filter-label">
                    Hasta
                    <input
                      type="date"
                      className="audit-input"
                      value={filters.dateTo}
                      onChange={(e) =>
                        handleFilterChange("dateTo", e.target.value)
                      }
                    />
                  </label>

                  <label className="audit-filter-label">
                    Tamaño de página
                    <select
                      className="audit-select"
                      value={pageSize}
                      onChange={(e) => {
                        setPage(1);
                        setPageSize(Number(e.target.value));
                      }}
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size} filas
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/* Resumen para auditor */}
              <div className="audit-summary-card">
                <h3 className="audit-summary-title">
                  Resumen de la vista actual
                </h3>
                <div className="audit-summary-grid">
                  <div className="audit-summary-item">
                    <span className="audit-summary-label">
                      Eventos en esta página
                    </span>
                    <span className="audit-summary-value">
                      {loading ? "…" : events.length}
                    </span>
                    <span className="audit-summary-hint">
                      De un total de{" "}
                      <strong>{loading ? "…" : totalCount}</strong> eventos que
                      cumplen los filtros.
                    </span>
                  </div>

                  <div className="audit-summary-item">
                    <span className="audit-summary-label">Éxito vs error</span>
                    <span className="audit-summary-value">
                      OK {successCount} / ERR {failureCount}
                    </span>
                    <span className="audit-summary-hint">
                      Útil para dimensionar el volumen de fallos en el periodo
                      seleccionado.
                    </span>
                  </div>

                  <div className="audit-summary-item">
                    <span className="audit-summary-label">Último evento</span>
                    <span className="audit-summary-value">
                      {lastEventDate ? formatDate(lastEventDate) : "—"}
                    </span>
                    <span className="audit-summary-hint">
                      Verifica que el logging está activo y actualizado.
                    </span>
                  </div>
                </div>

                <div className="audit-summary-tags">
                  <div>
                    <span className="audit-summary-label">
                      Top action_types
                    </span>
                    <div className="audit-tag-row">
                      {topActionTypes.length === 0 && (
                        <span className="audit-summary-hint">
                          No hay datos suficientes en esta página.
                        </span>
                      )}
                      {topActionTypes.map(([action, count]) => (
                        <button
                          key={action}
                          type="button"
                          className="audit-chip small"
                          onClick={() =>
                            handleFilterChange("actionType", String(action))
                          }
                        >
                          {action} ({count})
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="audit-summary-label">
                      Top entity_types
                    </span>
                    <div className="audit-tag-row">
                      {topEntityTypes.length === 0 && (
                        <span className="audit-summary-hint">
                          No hay datos suficientes en esta página.
                        </span>
                      )}
                      {topEntityTypes.map(([entity, count]) => (
                        <button
                          key={entity}
                          type="button"
                          className="audit-chip small"
                          onClick={() =>
                            handleFilterChange("entityType", String(entity))
                          }
                        >
                          {entity} ({count})
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="audit-help-text">
                  <strong>Sugerencia para auditorías:</strong> para un control
                  tipo SOC 2, suele ser suficiente exportar a CSV los últimos 30
                  días, filtrando por el tipo de acción que quieras evidenciar
                  (desactivación de usuarios, cambios de dispositivos,
                  aprobaciones de home office, fallos de email, etc.).
                </div>
              </div>
            </div>

            {error && <div className="audit-error no-print">{error}</div>}

            {/* ========== TABLA + DETALLE ========== */}
            <div className="audit-main">
              <div className="audit-table-section">
                <div className="audit-table-wrapper">
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Actor</th>
                        <th>Action</th>
                        <th>Entity</th>
                        <th>Entity ID</th>
                        <th>Resultado</th>
                        <th>Summary</th>
                        <th>Source</th>
                        <th>Error</th>
                        <th>Metadata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.length === 0 && !loading && (
                        <tr>
                          <td colSpan={10} className="audit-empty">
                            No hay eventos que coincidan con los filtros.
                          </td>
                        </tr>
                      )}
                      {events.map((e) => {
                        const isSelected =
                          selectedEvent && selectedEvent.id === e.id;
                        return (
                          <tr
                            key={e.id}
                            className={[
                              e.success
                                ? "audit-row-success"
                                : "audit-row-failure",
                              isSelected ? "audit-row-selected" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onClick={() => handleSelectEvent(e)}
                          >
                            <td>{formatDate(e.created_at)}</td>
                            <td>
                              {e.actor?.display_name ||
                                e.actor?.email ||
                                e.actor_user_id ||
                                "—"}
                            </td>
                            <td>{e.action_type}</td>
                            <td>{e.entity_type}</td>
                            <td>{e.entity_id || "—"}</td>
                            <td>{e.success ? "OK" : "ERROR"}</td>
                            <td>{e.summary}</td>
                            <td>{e.source || "—"}</td>
                            <td>{e.error_message || "—"}</td>
                            <td title={JSON.stringify(e.metadata ?? {})}>
                              {formatMetadataShort(e.metadata)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="audit-pagination no-print">
                  <button
                    type="button"
                    className="audit-button ghost"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                  >
                    ← Anterior
                  </button>
                  <span className="audit-page-indicator">
                    Página {page} de {pageCount}
                  </span>
                  <button
                    type="button"
                    className="audit-button ghost"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={page >= pageCount || loading}
                  >
                    Siguiente →
                  </button>
                </div>
              </div>

              {/* Panel de detalle */}
              <div className="audit-detail-panel no-print">
                <h3 className="audit-detail-title">Detalle del evento</h3>
                {!selectedEvent && (
                  <p className="audit-detail-empty">
                    Haz clic en cualquier fila de la tabla para ver el detalle
                    completo (incluyendo <code>metadata</code>) aquí.
                  </p>
                )}

                {selectedEvent && (
                  <>
                    <div className="audit-detail-meta">
                      <div>
                        <span className="audit-detail-label">
                          ID del evento
                        </span>
                        <span className="audit-detail-value">
                          {selectedEvent.id}
                        </span>
                      </div>
                      <div>
                        <span className="audit-detail-label">Fecha</span>
                        <span className="audit-detail-value">
                          {formatDate(selectedEvent.created_at)}
                        </span>
                      </div>
                      <div>
                        <span className="audit-detail-label">Actor</span>
                        <span className="audit-detail-value">
                          {selectedEvent.actor?.display_name ||
                            selectedEvent.actor?.email ||
                            selectedEvent.actor_user_id ||
                            "—"}
                        </span>
                      </div>
                      <div>
                        <span className="audit-detail-label">Resultado</span>
                        <span
                          className={`audit-badge ${
                            selectedEvent.success
                              ? "badge-success"
                              : "badge-failure"
                          }`}
                        >
                          {selectedEvent.success ? "OK" : "ERROR"}
                        </span>
                      </div>
                    </div>

                    <div className="audit-detail-grid">
                      <div>
                        <span className="audit-detail-label">Action type</span>
                        <div className="audit-detail-code">
                          {selectedEvent.action_type || "—"}
                        </div>
                      </div>
                      <div>
                        <span className="audit-detail-label">Entity</span>
                        <div className="audit-detail-code">
                          {selectedEvent.entity_type || "—"}
                        </div>
                      </div>
                      <div>
                        <span className="audit-detail-label">Entity ID</span>
                        <div className="audit-detail-code">
                          {selectedEvent.entity_id || "—"}
                        </div>
                      </div>
                      <div>
                        <span className="audit-detail-label">Source</span>
                        <div className="audit-detail-code">
                          {selectedEvent.source || "—"}
                        </div>
                      </div>
                    </div>

                    <div className="audit-detail-block">
                      <span className="audit-detail-label">Summary</span>
                      <p className="audit-detail-text">
                        {selectedEvent.summary || "—"}
                      </p>
                    </div>

                    <div className="audit-detail-block">
                      <span className="audit-detail-label">Error message</span>
                      <p className="audit-detail-text">
                        {selectedEvent.error_message || "—"}
                      </p>
                    </div>

                    <div className="audit-detail-block">
                      <div className="audit-detail-header-row">
                        <span className="audit-detail-label">
                          Metadata (JSON completo)
                        </span>
                        <button
                          type="button"
                          className="audit-button ghost small"
                          onClick={handleCopyEventJson}
                        >
                          Copiar JSON
                        </button>
                      </div>
                      <pre className="audit-detail-json">
                        {formatJsonPretty(selectedEvent.metadata)}
                      </pre>
                    </div>

                    <div className="audit-help-text small">
                      <strong>Tips de auditoría:</strong>
                      <ul>
                        <li>
                          Verifica que para cada flujo crítico (altas/bajas de
                          usuarios, asignación de dispositivos, cambios de
                          estado de solicitudes) exista al menos un evento de
                          tipo <code>status_change</code> o similar.
                        </li>
                        <li>
                          Para incidentes o bugs, filtra por{" "}
                          <strong>error</strong> y revisa el campo{" "}
                          <code>error_message</code> junto con{" "}
                          <code>metadata</code> para reconstruir el contexto.
                        </li>
                        <li>
                          Para evidenciar controles SOC 2, exporta y adjunta el
                          CSV filtrado por el periodo y el tipo de acción
                          relevante.
                        </li>
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </AuditContentArea>
    </MainLayout>
  );
};

export default AuditLogsPage;

// =======================
// STYLED COMPONENTS LAYOUT
// =======================

const MainLayout = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr;
  width: 100vw;
  height: 100vh;
  background-color: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
  overflow: hidden;
`;

const AuditContentArea = styled.div`
  padding: 20px;
  height: 100vh;
  overflow-y: auto;
`;
