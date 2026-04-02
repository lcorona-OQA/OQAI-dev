// HoDaysEditorModal.jsx
import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { FaTimes, FaSave, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import Swal from "sweetalert2";
import { supabase } from "../supabase/supabase.config";
import { UserAuth } from "../context/AuthContext";

// ================== Helpers ==================

const formatReadableDate = (dateString) => {
  if (!dateString) return "N/A";
  const d = new Date(`${dateString}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

// YYYY-MM-DD
const toDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Construye una matriz de 6 filas x 7 columnas con las fechas del mes (incluye días del mes anterior/siguiente)
const buildMonthMatrix = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth(); // 0-11

  const firstOfMonth = new Date(year, month, 1);
  const startDayOfWeek = firstOfMonth.getDay(); // 0-6 (Domingo = 0)
  const weeks = [];

  for (let week = 0; week < 6; week++) {
    const weekDays = [];
    for (let day = 0; day < 7; day++) {
      const cellIndex = week * 7 + day;
      const cellDate = new Date(year, month, 1 + (cellIndex - startDayOfWeek));
      weekDays.push(cellDate);
    }
    weeks.push(weekDays);
  }

  return weeks;
};

/**
 * Modal para editar días de Home Office aprobados de un usuario, usando un calendario.
 *
 * - Muestra solo días entre semana (Lun–Vie).
 * - Carga solo los últimos 3 meses de solicitudes aprobadas.
 * - Días anteriores a HOY no se pueden modificar (solo ver).
 * - Días nuevos:
 *    none → approved → rejected → none (solo en UI)
 * - Días ya aprobados en BD:
 *    approved ↔ none (al guardar "none" se marca como cancelled_by_admin)
 *
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - user: { id, display_name, ... }
 *  - onUpdated?: () => void
 */
export function HoDaysEditorModal({ isOpen, onClose, user, onUpdated }) {
  const { user: currentUser } = UserAuth();

  const [loading, setLoading] = useState(false);

  // originalStatusByDate: fechas que YA vienen de BD como approved
  //   { '2025-12-11': 'approved', ... }
  const [originalStatusByDate, setOriginalStatusByDate] = useState({});
  // dateStatus: estado actual en la UI
  //   { '2025-12-11': 'approved' | 'rejected', ... }
  const [dateStatus, setDateStatus] = useState({});

  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const canEdit =
    currentUser &&
    (currentUser.role_id === 4 ||
      currentUser.role_id === 8 ||
      currentUser.role_id === 1); // opcional: superadmin

  useEffect(() => {
    if (!isOpen || !user || !canEdit) {
      return;
    }

    const fetchApprovedDays = async () => {
      setLoading(true);
      try {
        // === Calcular fecha de límite: hoy - 3 meses ===
        const today = new Date();
        const threeMonthsAgo = new Date(
          today.getFullYear(),
          today.getMonth() - 3,
          today.getDate()
        );
        const threeMonthsAgoStr = toDateKey(threeMonthsAgo);

        const { data, error } = await supabase
          .from("home_office_requests")
          .select("id, date, status")
          .eq("user_id", user.id)
          .eq("status", "approved")
          .gte("date", threeMonthsAgoStr)
          .order("date", { ascending: true });

        if (error) {
          console.error(
            "[HoDaysEditorModal] Error fetching approved days:",
            error
          );
          Swal.fire(
            "Error",
            "Could not load approved Home Office days for this user.",
            "error"
          );
          return;
        }

        const rows = data || [];
        const origMap = {};
        const dateList = [];

        for (const row of rows) {
          if (!row.date) continue;
          origMap[row.date] = "approved";
          dateList.push(row.date);
        }

        setOriginalStatusByDate(origMap);
        setDateStatus(origMap); // estado editable inicial = approved solo donde había BD

        // Ajustar mes actual:
        if (dateList.length > 0) {
          // Mes del primer día aprobado (dentro de los últimos 3 meses)
          const first = dateList[0];
          const d = new Date(`${first}T12:00:00`);
          setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
        } else {
          // Si no hay registros, usar el mes actual pero no más atrás de 3 meses
          const base = new Date();
          const baseMonth = new Date(base.getFullYear(), base.getMonth(), 1);
          // Si hoy es más de 3 meses después de threeMonthsAgo, dejamos baseMonth;
          // de lo contrario nos aseguramos de no ir más atrás de threeMonthsAgo:
          if (
            baseMonth <
            new Date(threeMonthsAgo.getFullYear(), threeMonthsAgo.getMonth(), 1)
          ) {
            setCurrentMonth(
              new Date(
                threeMonthsAgo.getFullYear(),
                threeMonthsAgo.getMonth(),
                1
              )
            );
          } else {
            setCurrentMonth(baseMonth);
          }
        }
      } catch (err) {
        console.error(
          "[HoDaysEditorModal] Unexpected error fetching days:",
          err
        );
        Swal.fire(
          "Error",
          "Unexpected error loading Home Office days.",
          "error"
        );
      } finally {
        setLoading(false);
      }
    };

    // Reset previo
    setOriginalStatusByDate({});
    setDateStatus({});
    fetchApprovedDays();
  }, [isOpen, user, canEdit]);

  if (!isOpen || !user) return null;
  if (!canEdit) return null;

  // === Constantes de tiempo ===
  const today = new Date();
  const todayKey = toDateKey(today);
  const threeMonthsAgoForNav = new Date(
    today.getFullYear(),
    today.getMonth() - 3,
    1
  );

  // ---------- Lógica de toggling de días ----------

  const handleDayClick = (date) => {
    if (loading) return;

    const key = toDateKey(date);

    // Días anteriores a hoy NO se pueden modificar
    if (key < todayKey) return;

    const original = originalStatusByDate[key] || null; // 'approved' | null
    const current = dateStatus[key] || null; // 'approved' | 'rejected' | null

    let next;

    if (original === "approved") {
      // Día que ya estaba approved en BD
      // → click: approved ↔ none (se cancela al guardar)
      next = current === "approved" ? null : "approved";
    } else {
      // Día nuevo
      // none → approved → rejected → none
      if (!current) next = "approved";
      else if (current === "approved") next = "rejected";
      else if (current === "rejected") next = null;
      else next = null;
    }

    setDateStatus((prev) => {
      const updated = { ...prev };
      if (next) {
        updated[key] = next;
      } else {
        delete updated[key];
      }
      return updated;
    });
  };

  // ---------- Cálculo de cambios vs. original ----------

  const computeChanges = () => {
    const originalDates = Object.keys(originalStatusByDate);
    const currentDates = Object.keys(dateStatus);

    // Orden alfabético (YYYY-MM-DD) => también cronológico
    const allKeys = Array.from(
      new Set([...originalDates, ...currentDates])
    ).sort();

    const toInsertApproved = [];
    const toInsertRejected = [];
    const toCancelApproved = [];

    for (const key of allKeys) {
      const orig = originalStatusByDate[key] || null; // 'approved' | null
      const curr = dateStatus[key] || null; // 'approved' | 'rejected' | null

      if (orig === "approved") {
        // Venía approved en BD
        if (!curr) {
          // Lo quitamos → cancelar
          toCancelApproved.push(key);
        } else {
          // curr === 'approved' → sin cambios
        }
      } else {
        // No existía en BD
        if (curr === "approved") {
          toInsertApproved.push(key);
        } else if (curr === "rejected") {
          toInsertRejected.push(key);
        }
      }
    }

    return { toInsertApproved, toInsertRejected, toCancelApproved };
  };

  // ---------- Guardar cambios ----------

  const handleSave = async () => {
    const { toInsertApproved, toInsertRejected, toCancelApproved } =
      computeChanges();

    if (
      toInsertApproved.length === 0 &&
      toInsertRejected.length === 0 &&
      toCancelApproved.length === 0
    ) {
      Swal.fire("No changes", "There are no changes to save.", "info");
      return;
    }

    // ... (El código de generación de líneas HTML para el SweetAlert se mantiene igual) ...
    // Armamos un resumen detallado de cambios
    const fmt = (d) => formatReadableDate(d);
    const lines = [];
    if (toInsertApproved.length > 0) {
      const sorted = [...toInsertApproved].sort();
      lines.push(
        `<strong>Nuevos días aprobados:</strong><br>${sorted
          .map((d) => `• ${fmt(d)}`)
          .join("<br>")}`
      );
    }
    if (toInsertRejected.length > 0) {
      const sorted = [...toInsertRejected].sort();
      lines.push(
        `<strong>Rejected (new):</strong><br>${sorted
          .map((d) => `• ${fmt(d)}`)
          .join("<br>")}`
      );
    }
    if (toCancelApproved.length > 0) {
      const sorted = [...toCancelApproved].sort();
      lines.push(
        `<strong>Cancelled (previously approved):</strong><br>${sorted
          .map((d) => `• ${fmt(d)}`)
          .join("<br>")}`
      );
    }

    const { isConfirmed } = await Swal.fire({
      title: "Confirm changes",
      html: `
        <p>You are about to modify Home Office days for:</p>
        <p><strong>${user.display_name}</strong></p>
        <div style="text-align:left; font-size:0.85rem; max-height:260px; overflow:auto;">
          ${lines.join("<br><br>")}
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#28a745",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, save changes",
      reverseButtons: true,
    });

    if (!isConfirmed) return;

    setLoading(true);
    // Array para recolectar todos los IDs afectados para la notificación
    let affectedRequestIds = [];

    try {
      // 1) Insertar nuevos días (approved / rejected)
      const rowsToInsert = [];

      for (const d of toInsertApproved) {
        rowsToInsert.push({
          user_id: user.id,
          date: d,
          status: "approved",
          reason: "Created/edited by admin",
        });
      }
      for (const d of toInsertRejected) {
        rowsToInsert.push({
          user_id: user.id,
          date: d,
          status: "rejected",
          reason: "Created/edited by admin",
        });
      }

      if (rowsToInsert.length > 0) {
        // NOTA: Agregamos .select() para obtener los IDs generados
        const { data: insertedData, error: insertError } = await supabase
          .from("home_office_requests")
          .insert(rowsToInsert)
          .select("id");

        if (insertError) {
          console.error(
            "[HoDaysEditorModal] Error inserting new days:",
            insertError
          );
          Swal.fire("Error", "Could not insert some new days.", "error");
          return;
        }

        if (insertedData) {
          affectedRequestIds = [
            ...affectedRequestIds,
            ...insertedData.map((r) => r.id),
          ];
        }
      }

      // 2) Cancelar días que antes eran approved
      if (toCancelApproved.length > 0) {
        // NOTA: Agregamos .select() para obtener los IDs modificados
        const { data: cancelledData, error: cancelError } = await supabase
          .from("home_office_requests")
          .update({ status: "cancelled_by_admin" })
          .eq("user_id", user.id)
          .eq("status", "approved")
          .in("date", toCancelApproved)
          .select("id");

        if (cancelError) {
          console.error(
            "[HoDaysEditorModal] Error cancelling approved days:",
            cancelError
          );
          Swal.fire("Error", "Some days could not be cancelled.", "error");
          return;
        }

        if (cancelledData) {
          affectedRequestIds = [
            ...affectedRequestIds,
            ...cancelledData.map((r) => r.id),
          ];
        }
      }

      // 3) INVOCAR EDGE FUNCTION para notificar a Slack
      if (affectedRequestIds.length > 0) {
        // Preparamos el payload como lo espera ho-requests-result-slack
        const requestPayload = affectedRequestIds.map((id) => ({
          requestId: id,
        }));

        // No esperamos (await) a que termine la notificación para cerrar el modal,
        // pero capturamos error en consola si falla.
        supabase.functions
          .invoke("ho-requests-result-slack", {
            body: {
              mode: "status_change", // Modo especial para ediciones administrativas
              requests: requestPayload,
            },
          })
          .then(({ error }) => {
            if (error)
              console.error("Error sending Slack notification:", error);
          });
      }

      Swal.fire(
        "Saved",
        "Home Office days have been updated and user notified.",
        "success"
      );

      if (onUpdated) {
        onUpdated();
      }

      onClose();
    } catch (err) {
      console.error("[HoDaysEditorModal] Unexpected error on save:", err);
      Swal.fire("Error", "Unexpected error while saving changes.", "error");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Datos derivados para la UI ----------

  const weeks = buildMonthMatrix(currentMonth);

  const approvedDates = Object.keys(dateStatus).filter(
    (d) => dateStatus[d] === "approved"
  );
  const rejectedDates = Object.keys(dateStatus).filter(
    (d) => dateStatus[d] === "rejected"
  );

  // Navegación de meses (no ir más atrás de 3 meses)
  const goPrevMonth = () => {
    setCurrentMonth((prev) => {
      const y = prev.getFullYear();
      const m = prev.getMonth();
      const candidate = new Date(y, m - 1, 1);

      const minMonth = new Date(
        threeMonthsAgoForNav.getFullYear(),
        threeMonthsAgoForNav.getMonth(),
        1
      );

      if (candidate < minMonth) {
        return prev; // no ir más atrás
      }
      return candidate;
    });
  };

  const goNextMonth = () => {
    setCurrentMonth((prev) => {
      const y = prev.getFullYear();
      const m = prev.getMonth();
      return new Date(y, m + 1, 1);
    });
  };

  const monthLabel = currentMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // --- Helpers para comparar mes actual con minMonth para deshabilitar botón ---
  const monthIndex = (date) => date.getFullYear() * 12 + date.getMonth();
  const canGoPrev =
    monthIndex(currentMonth) >
    monthIndex(
      new Date(
        threeMonthsAgoForNav.getFullYear(),
        threeMonthsAgoForNav.getMonth(),
        1
      )
    );

  return (
    <Backdrop onClick={loading ? undefined : onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <div>
            <Title>Edit Home Office days</Title>
            <Subtitle>{user.display_name}</Subtitle>
          </div>
          <CloseButton onClick={onClose} disabled={loading}>
            <FaTimes />
          </CloseButton>
        </ModalHeader>

        <ModalBody>
          <Section>
            <SectionTitle>Calendar</SectionTitle>
            <SectionHint>
              Click on a weekday to toggle:
              <br />
              <strong>New day:</strong> none → approved → rejected → none
              <br />
              <strong>Already approved day:</strong> approved ↔ cancelled
              <br />
              <strong>Past days:</strong> visible but not editable (last 3
              months).
            </SectionHint>

            <CalendarWrapper>
              <CalendarHeader>
                <MonthNavButton
                  type="button"
                  onClick={goPrevMonth}
                  disabled={loading || !canGoPrev}
                >
                  <FaChevronLeft />
                </MonthNavButton>
                <MonthTitle>{monthLabel}</MonthTitle>
                <MonthNavButton
                  type="button"
                  onClick={goNextMonth}
                  disabled={loading}
                >
                  <FaChevronRight />
                </MonthNavButton>
              </CalendarHeader>

              {/* Solo días entre semana (Lun–Vie) */}
              <WeekDaysRow>
                {["Mon", "Tue", "Wed", "Thu", "Fri"].map((w) => (
                  <WeekDayCell key={w}>{w}</WeekDayCell>
                ))}
              </WeekDaysRow>

              <DaysGrid>
                {weeks.map((week, wi) =>
                  // Solo columnas 1-5 (Mon-Fri), excluimos Sun (0) y Sat (6)
                  week.slice(1, 6).map((day, di) => {
                    const key = toDateKey(day);
                    const status = dateStatus[key] || null;
                    const isCurrentMonth =
                      day.getMonth() === currentMonth.getMonth();
                    const isToday = key === todayKey;
                    const isPast = key < todayKey; // días anteriores a hoy

                    return (
                      <DayCell
                        key={`${wi}-${di}`}
                        type="button"
                        onClick={() => handleDayClick(day)}
                        disabled={loading || isPast}
                        status={status}
                        iscurrentmonth={isCurrentMonth ? 1 : 0}
                        istoday={isToday ? 1 : 0}
                        ispast={isPast ? 1 : 0}
                      >
                        {day.getDate()}
                      </DayCell>
                    );
                  })
                )}
              </DaysGrid>
            </CalendarWrapper>

            <Legend>
              <LegendItem>
                <LegendColorBox variant="approved" />
                <span>Approved ({approvedDates.length})</span>
              </LegendItem>
              <LegendItem>
                <LegendColorBox variant="rejected" />
                <span>Rejected ({rejectedDates.length})</span>
              </LegendItem>
              <LegendItem>
                <LegendColorBox variant="none" />
                <span>Empty / No request</span>
              </LegendItem>
            </Legend>
          </Section>
        </ModalBody>

        <ModalFooter>
          <FooterButton type="button" onClick={onClose} disabled={loading}>
            Cancel
          </FooterButton>
          <FooterButton
            type="button"
            primary
            onClick={handleSave}
            disabled={loading}
          >
            <FaSave style={{ marginRight: 6 }} />
            Save changes
          </FooterButton>
        </ModalFooter>
      </ModalContent>
    </Backdrop>
  );
}

// ================== ESTILOS ==================

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000; /* SweetAlert2 usa z-index más alto (~1060), así que queda por encima */
`;

const ModalContent = styled.div`
  background: #ffffff;
  border-radius: 12px;
  padding: 20px 24px;
  width: 520px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  color: #111;
`;

const Subtitle = styled.p`
  margin: 4px 0 0;
  font-size: 0.95rem;
  color: #555;
`;

const CloseButton = styled.button`
  border: none;
  background: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #666;
  padding: 4px;
  border-radius: 999px;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ModalBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
`;

const Section = styled.div`
  margin-bottom: 18px;
`;

const SectionTitle = styled.h4`
  margin: 0 0 8px;
  font-size: 1rem;
  font-weight: 600;
`;

const SectionHint = styled.p`
  margin: 0 0 10px;
  font-size: 0.82rem;
  color: #666;
  line-height: 1.4;
`;

const CalendarWrapper = styled.div`
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
  background: #f9fafb;
`;

const CalendarHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const MonthNavButton = styled.button`
  border: none;
  background: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #374151;

  &:hover {
    background: rgba(0, 0, 0, 0.06);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const MonthTitle = styled.span`
  font-weight: 600;
  font-size: 0.95rem;
`;

const WeekDaysRow = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr); /* Solo Mon-Fri */
  margin-bottom: 4px;
`;

const WeekDayCell = styled.div`
  text-align: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  padding: 2px 0;
`;

const DaysGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr); /* Solo Mon-Fri */
  gap: 4px;
`;

const DayCell = styled.button`
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: 0.8rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  ${({ iscurrentmonth }) =>
    iscurrentmonth
      ? `
    color: #111827;
    background: #ffffff;
  `
      : `
    color: #9ca3af;
    background: #f3f4f6;
  `}

  ${({ status }) =>
    status === "approved"
      ? `
    background: #dcfce7;
    border-color: #16a34a;
    color: #166534;
    font-weight: 600;
  `
      : status === "rejected"
      ? `
    background: #fee2e2;
    border-color: #dc2626;
    color: #b91c1c;
    font-weight: 600;
  `
      : ""}

  ${({ istoday }) =>
    istoday
      ? `
    box-shadow: 0 0 0 1px #2563eb;
  `
      : ""}

  ${({ ispast }) =>
    ispast
      ? `
    opacity: 0.4;
    cursor: not-allowed;
  `
      : ""}

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    cursor: not-allowed;
  }
`;

const Legend = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 10px;
  flex-wrap: wrap;
  font-size: 0.8rem;
  color: #4b5563;
`;

const LegendItem = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const LegendColorBox = styled.span`
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid #d1d5db;

  ${({ variant }) =>
    variant === "approved"
      ? `
    background: #dcfce7;
    border-color: #16a34a;
  `
      : variant === "rejected"
      ? `
    background: #fee2e2;
    border-color: #dc2626;
  `
      : `
    background: #ffffff;
  `}
`;

const ModalFooter = styled.div`
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

const FooterButton = styled.button`
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;

  ${(props) =>
    props.primary
      ? `
    background: #28a745;
    color: white;
  `
      : `
    background: #e5e7eb;
    color: #111827;
  `}

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
