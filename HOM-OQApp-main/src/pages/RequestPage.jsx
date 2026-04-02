// src/pages/RequestPage.jsx
import React, { useState, useEffect } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { Sidebar } from "../components/Sidebar";
import styled from "styled-components";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { UserAuth } from "../context/AuthContext";
import { supabase } from "../supabase/supabase.config";
import Swal from "sweetalert2";

// --- Helper Functions ---
const getWeekId = (date) => {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-${weekNo}`;
};

// Estados que consideramos "activos" (bloquean volver a pedir ese día)
const ACTIVE_HO_STATUSES = [
  "pending_lead",
  "pending_admin",
  "approved",
  "admin_approved",
  "final_approved",
];

// Prioridad de estados para decidir qué mostrar cuando hay varias filas del mismo día
const STATUS_PRIORITY = {
  rejected: 1,
  pending_lead: 2,
  pending_admin: 3,
  approved: 4,
  admin_approved: 4,
  final_approved: 4,
};

// --- Modal de confirmación ---
const ConfirmationModal = ({
  show,
  onClose,
  onConfirm,
  selectedDaysByWeek,
  isSubmitting = false,
}) => {
  const [checkboxes, setCheckboxes] = useState({
    isConfirmed: false,
    isConfirmedSecond: false,
  });

  // Resetear checkboxes cuando se cierra el modal
  useEffect(() => {
    if (!show) {
      setCheckboxes({
        isConfirmed: false,
        isConfirmedSecond: false,
      });
    }
  }, [show]);

  if (!show) return null;

  const confirmationText =
    "I confirm I have all necessary resources for remote work, including a stable internet connection and a suitable workspace.";
  const secondConfirmationText =
    "I understand that if in-person presence is required, I am willing to report to the office as soon as possible to continue my duties.";

  const handleCheckboxChange = (event) => {
    const { id, checked } = event.target;
    setCheckboxes((prevState) => ({
      ...prevState,
      [id]: checked,
    }));
  };

  const areBothChecked = checkboxes.isConfirmed && checkboxes.isConfirmedSecond;

  return (
    <ModalBackdrop onClick={isSubmitting ? undefined : onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalTitle>Confirm your request</ModalTitle>
        <Summary>
          {Object.entries(selectedDaysByWeek).map(([weekId, days]) => (
            <div key={weekId}>
              <strong>Week {weekId.split("-")[1]}:</strong>
              <p>
                {days
                  .map((d) =>
                    d.toLocaleDateString("en-US", {
                      weekday: "short",
                      day: "numeric",
                    })
                  )
                  .join(", ")}
              </p>
            </div>
          ))}
        </Summary>
        <CheckboxContainer>
          <input
            type="checkbox"
            id="isConfirmed"
            checked={checkboxes.isConfirmed}
            onChange={handleCheckboxChange}
            disabled={isSubmitting}
          />
          <label htmlFor="isConfirmed">{confirmationText}</label>
        </CheckboxContainer>
        <CheckboxContainer>
          <input
            type="checkbox"
            id="isConfirmedSecond"
            checked={checkboxes.isConfirmedSecond}
            onChange={handleCheckboxChange}
            disabled={isSubmitting}
          />
          <label htmlFor="isConfirmedSecond">{secondConfirmationText}</label>
        </CheckboxContainer>
        <ModalActions>
          <ModalButton onClick={onClose} secondary disabled={isSubmitting}>
            Cancel
          </ModalButton>
          <ModalButton
            onClick={onConfirm}
            disabled={!areBothChecked || isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Submit Request"}
          </ModalButton>
        </ModalActions>
      </ModalContent>
    </ModalBackdrop>
  );
};

// --- LÓGICA DE FECHAS ---
const today = new Date();
today.setHours(0, 0, 0, 0);
const minDate = new Date(today.getFullYear(), today.getMonth() - 3, 1);
const maxDate = new Date(today);
maxDate.setDate(maxDate.getDate() + 28);

export function RequestPage() {
  const { user } = UserAuth();
  const [selectedDays, setSelectedDays] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [existingRequests, setExistingRequests] = useState([]);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ESTADO PARA OOO
  const [oooRange, setOooRange] = useState({ start: null, end: null });

  // Helper para verificar si una fecha string cae en OOO
  const isDateStringOOO = (dateStr) => {
    if (!oooRange.start || !oooRange.end) return false;
    return dateStr >= oooRange.start && dateStr <= oooRange.end;
  };

  // Helper para verificar si un objeto Date cae en OOO
  const isDateOOO = (date) => {
    if (!oooRange.start || !oooRange.end) return false;
    const dateStr = date.toISOString().slice(0, 10);
    return dateStr >= oooRange.start && dateStr <= oooRange.end;
  };

  const fetchUserRequests = async () => {
    if (!user) return;
    const minDateISO = minDate.toISOString().slice(0, 10);

    const { data: requestsData, error: requestsError } = await supabase
      .from("home_office_requests")
      .select("date, status")
      .eq("user_id", user.id)
      .gte("date", minDateISO);

    if (requestsError) {
      console.error("Error fetching user requests:", requestsError);
      return;
    }

    const requestedDatesMap = new Map();

    if (requestsData) {
      requestsData.forEach((req) => {
        const currentStatus = req.status;
        const existing = requestedDatesMap.get(req.date);

        const currentPriority = STATUS_PRIORITY[currentStatus] ?? 0;
        const existingPriority = existing
          ? STATUS_PRIORITY[existing.status] ?? 0
          : 0;

        if (!existing || currentPriority > existingPriority) {
          requestedDatesMap.set(req.date, {
            date: req.date,
            status: currentStatus,
          });
        }
      });
    }

    setExistingRequests(Array.from(requestedDatesMap.values()));
  };

  useEffect(() => {
    const fetchAllData = async () => {
      if (!user) {
        setIsLoadingCalendar(false);
        return;
      }
      setIsLoadingCalendar(true);
      await Promise.all([
        fetchUserRequests(),
        (async () => {
          const { data: userData } = await supabase
            .from("users")
            .select("ooo_start, ooo_end")
            .eq("id", user.id)
            .single();

          if (userData) {
            setOooRange({
              start: userData.ooo_start,
              end: userData.ooo_end,
            });
          }
        })(),
      ]);
      setIsLoadingCalendar(false);
    };
    fetchAllData();
  }, [user]);

  const handleDateChange = (date) => {
    const weekId = getWeekId(date);

    const existingDaysInWeek = existingRequests.filter((req) => {
      const reqDate = new Date(`${req.date}T00:00:00`);
      const isActive = ACTIVE_HO_STATUSES.includes(req.status);
      const isOverlappedByOOO = isDateStringOOO(req.date);

      return getWeekId(reqDate) === weekId && isActive && !isOverlappedByOOO;
    }).length;

    setSelectedDays((prev) => {
      const newSelection = { ...prev };
      const currentlySelectedInWeek = newSelection[weekId] || [];
      const dayIndex = currentlySelectedInWeek.findIndex(
        (d) => d.getTime() === date.getTime()
      );

      if (dayIndex > -1) {
        newSelection[weekId] = currentlySelectedInWeek.filter(
          (_, index) => index !== dayIndex
        );
        if (newSelection[weekId].length === 0) {
          delete newSelection[weekId];
        }
      } else {
        if (currentlySelectedInWeek.length + existingDaysInWeek >= 2) {
          Swal.fire(
            "Limit Reached",
            "You can only select a maximum of 2 days per week.",
            "warning"
          );
        } else {
          newSelection[weekId] = [...currentlySelectedInWeek, date].sort(
            (a, b) => a - b
          );
        }
      }
      return newSelection;
    });
  };

  const allSelectedDays = Object.values(selectedDays).flat();

  const tileDisabled = ({ date, view }) => {
    if (view === "month") {
      const dateStr = date.toISOString().slice(0, 10);

      if (date <= today || date > maxDate) return true;
      if (isDateOOO(date)) return true;

      const existingRequest = existingRequests.find(
        (req) => req.date === dateStr
      );
      const isBlockedByRequest =
        existingRequest && ACTIVE_HO_STATUSES.includes(existingRequest.status);

      return date < today || isBlockedByRequest;
    }
    return false;
  };

  const tileClassName = ({ date, view }) => {
    if (view === "month") {
      const dateStr = date.toISOString().slice(0, 10);

      if (isDateOOO(date)) {
        return "day-ooo";
      }

      if (allSelectedDays.some((d) => d.getTime() === date.getTime())) {
        return "selected-day";
      }

      const request = existingRequests.find((req) => req.date === dateStr);
      if (request) {
        if (date < today) {
          return `day-${request.status}-past`;
        }
        return `day-${request.status}`;
      }
    }
    return null;
  };

  const handleReviewRequest = () => {
    if (allSelectedDays.length === 0) {
      Swal.fire("Select Days", "Please select at least one day.", "info");
      return;
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return; // evita doble click

    if (!user) {
      Swal.fire("Error", "You must be logged in.", "error");
      return;
    }

    const allDays = Object.values(selectedDays).flat();
    if (allDays.length === 0) {
      Swal.fire("Select Days", "Please select at least one day.", "info");
      return;
    }

    const userName =
      user.user_metadata?.name ||
      user.user_metadata?.full_name ||
      user.email ||
      "Unknown user";

    setIsSubmitting(true);

    try {
      // Normalizar fechas seleccionadas a YYYY-MM-DD y quitar duplicados
      const dateStrings = allDays
        .map((day) => day?.toISOString?.().slice(0, 10))
        .filter(Boolean);
      const uniqueDates = Array.from(new Set(dateStrings));

      // 1) Consultar qué días ya tienen solicitud activa en BD (por si la info local está desactualizada)
      const { data: existingActive, error: existingError } = await supabase
        .from("home_office_requests")
        .select("id, date, status")
        .eq("user_id", user.id)
        .in("date", uniqueDates)
        .in("status", ACTIVE_HO_STATUSES);

      if (existingError) {
        console.error(
          "[RequestPage] Error fetching active HO requests before insert:",
          existingError
        );
        Swal.fire(
          "Error",
          "We could not validate your existing Home Office requests. Please try again.",
          "error"
        );
        return;
      }

      const existingDatesSet = new Set(
        (existingActive || []).map((r) => r.date)
      );

      const datesToInsert = uniqueDates.filter((d) => !existingDatesSet.has(d));
      const skippedExisting = uniqueDates.filter((d) =>
        existingDatesSet.has(d)
      );

      if (datesToInsert.length === 0) {
        setIsModalOpen(false);
        Swal.fire(
          "No new requests",
          "You already have active Home Office requests for the selected days.",
          "info"
        );
        return;
      }

      // 2) Crear las solicitudes NUEVAS en bloque
      const rowsToInsert = datesToInsert.map((date) => ({
        user_id: user.id,
        date,
        status: "pending_lead",
      }));

      const { data: insertedRows, error: insertError } = await supabase
        .from("home_office_requests")
        .insert(rowsToInsert)
        .select();

      if (insertError) {
        console.error(
          "[RequestPage] Error inserting home_office_requests:",
          insertError
        );
        const msg = (insertError.message || "").toLowerCase();
        const isDuplicate =
          insertError.code === "23505" || msg.includes("duplicate key");

        if (isDuplicate) {
          Swal.fire(
            "Already requested",
            "Some of the selected days already have active requests. Please refresh the page and try again.",
            "warning"
          );
          return;
        }

        Swal.fire(
          "Error",
          "We could not create your Home Office requests. Please try again.",
          "error"
        );
        return;
      }

      const createdRequests = Array.isArray(insertedRows) ? insertedRows : [];
      const createdCount = createdRequests.length;

      if (createdCount === 0) {
        setIsModalOpen(false);
        Swal.fire(
          "No new requests",
          "No new Home Office requests were created.",
          "info"
        );
        return;
      }

      // 3) Construir payload para Slack (solo los nuevos)
      const slackRequestsPayload = createdRequests.map((requestRow) => ({
        requestId: requestRow.id,
        date: requestRow.date,
        userId: user.id,
        userName,
        userEmail: user.email ?? null,
      }));

      // 4) Crear notificaciones para TL (1 por día nuevo)
      try {
        const notifications = createdRequests.map((requestRow) => {
          const friendlyDate = new Date(
            `${requestRow.date}T00:00:00`
          ).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });

          const title = `New HO request from ${userName} for ${friendlyDate}`;
          const content = `Home Office request created by ${userName} for ${friendlyDate}.`;

          return {
            title,
            content,
            target_role_id: 5, // Team Lead
            type: "alert",
            is_important: true,
          };
        });

        if (notifications.length > 0) {
          const { error: notificationError } = await supabase
            .from("notifications")
            .insert(notifications);

          if (notificationError) {
            console.error(
              "[RequestPage] Error creating notifications for HO requests:",
              notificationError
            );
          }
        }
      } catch (notifyErr) {
        console.error(
          "[RequestPage] Unexpected error while creating TL notifications:",
          notifyErr
        );
      }

      // 5) Avisar por Slack al Team Lead (Edge Function ho-requests-slack)
      if (slackRequestsPayload.length > 0) {
        try {
          await supabase.functions.invoke("ho-requests-slack", {
            body: {
              mode: "member_created",
              requests: slackRequestsPayload,
            },
          });
        } catch (slackErr) {
          console.error(
            "[RequestPage] Error calling ho-requests-slack (member_created):",
            slackErr
          );
          // No rompemos el flujo si falla Slack
        }
      }

      setIsModalOpen(false);

      let successMsg = `${createdCount} request(s) have been submitted.`;
      if (skippedExisting.length > 0) {
        successMsg += `\n\nThe following date(s) already had active requests and were skipped:\n${skippedExisting.join(
          ", "
        )}`;
      }

      Swal.fire("Success!", successMsg, "success");

      // Refrescamos datos y limpiamos estado
      await fetchUserRequests();
      setSelectedDays({});
    } catch (err) {
      console.error("[RequestPage] Error submitting requests:", err);
      Swal.fire(
        "Error",
        "One or more requests could not be processed. Please try again.",
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <Sidebar />
      <Content>
        <Header>
          <h1>Request Home Office</h1>
          <p>You can select up to 2 days per week, for the next 4 weeks.</p>
        </Header>

        <StepContent>
          <CalendarContainer isLoading={isLoadingCalendar}>
            <Calendar
              onClickDay={handleDateChange}
              value={null}
              tileDisabled={tileDisabled}
              tileClassName={tileClassName}
              maxDate={maxDate}
              minDate={minDate}
              prevLabel={<FaChevronLeft />}
              nextLabel={<FaChevronRight />}
              formatMonthYear={(locale, date) =>
                date.toLocaleString("en-US", {
                  month: "long",
                  year: "numeric",
                })
              }
              minDetail="month"
              next2Label={null}
              prev2Label={null}
            />
            <CalendarLegend>
              <div>
                <LegendBox status="approved" /> Approved
              </div>
              <div>
                <LegendBox status="pending" /> Pending
              </div>
              <div>
                <LegendBox status="ooo" /> Out of Office
              </div>
              <div>
                <LegendBox status="rejected" /> Rejected
              </div>
            </CalendarLegend>
          </CalendarContainer>
          <SummaryPanel>
            <h3>Selected Days</h3>
            {Object.keys(selectedDays).length > 0 ? (
              Object.entries(selectedDays).map(([weekId, days]) => (
                <WeekGroup key={weekId}>
                  <h4>Week {weekId.split("-")[1]}</h4>
                  <ul>
                    {days.map((day) => (
                      <li key={day.toISOString()}>
                        {day.toLocaleDateString("en-US", {
                          weekday: "long",
                          day: "numeric",
                        })}
                      </li>
                    ))}
                  </ul>
                </WeekGroup>
              ))
            ) : (
              <p>Select up to two days per week from the calendar.</p>
            )}

            <NextButton
              onClick={handleReviewRequest}
              disabled={allSelectedDays.length === 0 || isSubmitting}
            >
              Review & Submit
            </NextButton>
          </SummaryPanel>
        </StepContent>
      </Content>

      <ConfirmationModal
        show={isModalOpen}
        onClose={() => (isSubmitting ? null : setIsModalOpen(false))}
        onConfirm={handleSubmit}
        selectedDaysByWeek={selectedDays}
        isSubmitting={isSubmitting}
      />
    </PageContainer>
  );
}

// --- ESTILOS ---
const PageContainer = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr;
  height: 100vh;
  width: 100vw;
  background-color: #f8f8f8;
`;

const Content = styled.main`
  padding: 40px;
  overflow-y: auto;
`;

const Header = styled.header`
  margin-bottom: 30px;
  h1 {
    font-size: 2.5rem;
    font-weight: bold;
    color: #2b2f38;
  }
  p {
    font-size: 1.1rem;
    color: #6a6a6a;
  }
`;

const StepContent = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 30px;
  background-color: #fff;
  padding: 30px;
  border-radius: 12px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
`;

const CalendarContainer = styled.div`
  position: relative;
  &::after {
    content: "Loading...";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(255, 255, 255, 0.7);
    display: ${(props) => (props.isLoading ? "flex" : "none")};
    justify-content: center;
    align-items: center;
    font-size: 1.2em;
    font-weight: bold;
    color: #2b2f38;
    z-index: 10;
    border-radius: 8px;
  }
  .react-calendar {
    width: 100%;
    border: none;
    font-family: inherit;
  }
  .react-calendar__month-view__weekdays__weekday--weekend,
  .react-calendar__month-view__days__day--weekend {
    display: none;
  }
  .react-calendar__month-view__days,
  .react-calendar__month-view__weekdays {
    display: grid !important;
    grid-template-columns: repeat(5, 1fr);
  }
  .react-calendar__tile {
    border-radius: 8px;
    position: relative;
    transition: all 0.2s ease;
  }
  .react-calendar__tile--now {
    background: #e6e0e0;
  }
  .react-calendar__tile:disabled {
    cursor: default;
    color: #ccc;
    background-color: #f0f0f0;
  }
  .react-calendar__navigation__label {
    cursor: default !important;
  }
  .react-calendar__navigation__label:disabled {
    color: #000 !important;
    background-color: transparent !important;
  }
  .day-approved {
    background-color: #28a745 !important;
    color: white !important;
  }
  .day-pending_admin {
    background-color: #ffc107 !important;
    color: black !important;
  }
  .day-rejected {
    background-color: #dc3545 !important;
    color: white !important;
    text-decoration: line-through;
  }
  .day-pending_lead {
    background-color: #ffc107 !important;
    color: black !important;
  }
  .selected-day {
    background-color: #2b2f38 !important;
    color: white !important;
  }
  .day-approved-past {
    background-color: #28a745 !important;
    color: white !important;
    opacity: 0.6;
  }
  .day-rejected-past {
    background-color: #dc3545 !important;
    color: white !important;
    text-decoration: line-through;
    opacity: 0.6;
  }
  .day-pending_admin-past,
  .day-pending_lead-past {
    background-color: #ffc107 !important;
    color: black !important;
    opacity: 0.6;
  }
  .day-ooo {
    background-color: #6f42c1 !important;
    color: white !important;
    cursor: not-allowed;
    opacity: 0.8;
  }
`;

const CalendarLegend = styled.div`
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 15px;
  font-size: 0.9em;
  color: #6a6a6a;

  div {
    display: flex;
    align-items: center;
    gap: 8px;
  }
`;

const LegendBox = styled.div`
  height: 15px;
  width: 15px;
  border-radius: 4px;
  background-color: ${(props) => {
    if (props.status === "pending") return "#ffc107";
    if (props.status === "approved") return "#28a745";
    if (props.status === "rejected") return "#dc3545";
    if (props.status === "ooo") return "#6f42c1";
    return "transparent";
  }};
`;

const SummaryPanel = styled.div`
  background-color: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  height: fit-content;
  display: flex;
  flex-direction: column;
  max-height: 100%;
  overflow-y: auto;

  h3 {
    margin-top: 0;
    color: #2b2f38;
  }
  p {
    color: #6a6a6a;
  }
`;

const WeekGroup = styled.div`
  margin-bottom: 15px;
  h4 {
    margin-bottom: 5px;
    padding-bottom: 5px;
    border-bottom: 1px solid #e0e0e0;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    background-color: #fff;
    padding: 8px;
    border-radius: 4px;
    margin-bottom: 5px;
    font-weight: 500;
  }
`;

const NextButton = styled.button`
  background-color: #4a90e2;
  color: #fff;
  border: none;
  padding: 12px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
  margin-top: auto;
  transition: background-color 0.2s;

  &:hover {
    background-color: #357bd8;
  }
  &:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }
`;

const ModalBackdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: white;
  padding: 30px;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
`;

const ModalTitle = styled.h2`
  margin-top: 0;
`;

const Summary = styled.div`
  background-color: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  margin: 20px 0;
  max-height: 200px;
  overflow-y: auto;
`;

const CheckboxContainer = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 20px 0;

  input {
    margin-top: 5px;
  }
  label {
    font-size: 0.9rem;
    color: #333;
  }
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

const ModalButton = styled.button`
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-weight: bold;
  cursor: pointer;
  background-color: ${(props) => (props.secondary ? "#6c757d" : "#4a90e2")};
  color: white;

  &:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }
`;