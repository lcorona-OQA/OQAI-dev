import React, { useState, useEffect } from "react";
import styled from "styled-components";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

import { supabase } from "../supabase/supabase.config";
import { UserAuth } from "../context/AuthContext";

// --- FUNCIÓN ROBUSTA DE FORMATEO ---
function formatPrettyDate(dateString) {
    try {
        if (!dateString) return "";
        const parts = dateString.split('-');
        if (parts.length !== 3) return dateString;

        const [year, month, day] = parts.map(Number);
        const date = new Date(year, month - 1, day);

        return date.toLocaleDateString("en-US", {
            weekday: "short", 
            day: "numeric",
            month: "short",
        });
    } catch (err) {
        return dateString;
    }
}

// --- ESTILOS GLOBALES PARA EL CALENDARIO (CORREGIDOS Y ESTABILIZADOS) ---
const CalendarGlobalStyles = () => (
  <style>{`
    /* 1. CONTENEDOR PRINCIPAL (Ancho Fijo para evitar saltos) */
    .react-datepicker {
      border: 1px solid #e0e0e0 !important;
      font-family: inherit !important;
      background-color: white !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      border-radius: 8px !important;
      overflow: hidden;
      
      /* ESTABILIDAD DE ANCHO */
      width: 300px !important; /* Ancho fijo suficiente para "December" */
      min-width: 300px !important;
      display: flex !important;
      flex-direction: column !important;
    }

    .react-datepicker__month-container {
      width: 100% !important;
      float: none !important;
    }

    /* 2. HEADER (Título y Flechas) */
    .react-datepicker__header {
      background-color: #2b2f38 !important;
      border-bottom: none !important;
      padding: 15px 0 10px 0 !important;
      position: relative !important;
    }

    /* Título del Mes (CON MÁRGENES) */
    .react-datepicker__current-month {
      color: white !important;
      font-size: 1.2rem !important;
      font-weight: bold !important;
      margin-bottom: 15px !important;
      margin-left: 40px !important;  
      margin-right: 40px !important; 
      text-transform: capitalize;
    }

    /* Flechas de Navegación */
    .react-datepicker__navigation {
      top: 13px !important; 
      width: 30px !important;
      height: 30px !important;
      border: none !important;
      z-index: 10;
    }

    .react-datepicker__navigation--previous {
      left: 10px !important;
    }

    .react-datepicker__navigation--next {
      right: 10px !important;
    }

    .react-datepicker__navigation-icon::before {
      border-color: white !important;
      border-width: 3px 3px 0 0 !important;
      height: 8px !important;
      width: 8px !important;
      top: 10px !important;
    }

    .react-datepicker__navigation:hover .react-datepicker__navigation-icon::before {
      border-color: #F7D000 !important;
    }

    /* 3. GRID DE 5 COLUMNAS (Sin Fines de Semana) */
    .react-datepicker__day-names,
    .react-datepicker__week {
      display: grid !important;
      grid-template-columns: repeat(5, 1fr) !important; /* 5 columnas fijas */
      width: 100% !important;
      padding: 0 10px !important;
      box-sizing: border-box !important;
    }

    /* Ocultar Sábado y Domingo */
    .react-datepicker__day-name:nth-child(1), 
    .react-datepicker__day-name:nth-child(7),
    .react-datepicker__day:nth-child(1),
    .react-datepicker__day:nth-child(7) {
      display: none !important;
    }

    .react-datepicker__day-name {
      color: #2b2f38 !important;
      font-weight: 700 !important;
      text-transform: uppercase;
      font-size: 0.85rem !important;
      margin: 5px 0 !important;
      text-align: center !important;
      width: auto !important;
    }

    /* 4. DÍAS (Números) */
    .react-datepicker__month {
      margin: 10px 0 !important;
    }

    .react-datepicker__day {
      color: #2b2f38 !important;
      font-weight: 600;
      margin: 2px !important;
      width: auto !important;
      height: 2.5rem !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 8px !important;
      transition: all 0.2s ease;
    }

    .react-datepicker__day:hover {
      background-color: #f0f0f0 !important;
      color: black !important;
      transform: scale(1.05);
    }

    .react-datepicker__day--selected {
      background-color: #2b2f38 !important;
      color: #ffffffff !important;
      font-weight: bold;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }

    .day-ho-blocked {
      background-color: rgba(247, 185, 40, 0.15) !important;
      color: #F7B928 !important;
      opacity: 0.7;
      cursor: not-allowed !important;
      pointer-events: none !important;
    }

    /* Días fuera del mes actual (cuando usas fixedHeight) */
    .react-datepicker__day--outside-month {
        color: #ddd !important;
        pointer-events: none !important;
    }

    .react-datepicker__day--disabled:not(.day-ho-blocked):not(.react-datepicker__day--outside-month) {
      color: #ccc !important;
      pointer-events: none;
    }
    
    .react-datepicker__day:focus,
    .react-datepicker__navigation:focus {
      outline: none !important;
    }
  `}</style>
);

export default function LocationModal({ onClose }) {
    const { user, updateLocation } = UserAuth();

    const [visible, setVisible] = useState(false);
    const [step, setStep] = useState(1);
    const [locationType, setLocationType] = useState(null);
    
    const [oooStart, setOooStart] = useState("");
    const [oooEnd, setOooEnd] = useState("");
    
    const [originalOoo, setOriginalOoo] = useState({ start: null, end: null });
    const [currentDbLocationId, setCurrentDbLocationId] = useState(null);
    
    const [approvedHoDates, setApprovedHoDates] = useState([]);

    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState("");

    const getTomorrow = () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(0, 0, 0, 0);
        return d;
    };

    const isDateSelectable = (date) => {
        const day = date.getDay();
        if (day === 0 || day === 6) return false;

        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        if (approvedHoDates.includes(dateStr)) return false; 

        return true; 
    };

    const getDayClass = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        if (approvedHoDates.includes(dateStr)) {
            return 'day-ho-blocked';
        }
        return undefined;
    };

    useEffect(() => {
        async function loadData() {
            const { data: userData, error } = await supabase
                .from("users")
                .select("location_id, ooo_start, ooo_end")
                .eq("id", user.id)
                .single();

            if (error) return;

            if (userData) {
                setCurrentDbLocationId(userData.location_id);

                const today = new Date();
                const tzOffset = today.getTimezoneOffset() * 60000;
                const localDateStr = new Date(today.getTime() - tzOffset).toISOString().slice(0, 10);

                if (userData.location_id === 3 && userData.ooo_end && userData.ooo_end < localDateStr) {
                    await supabase.from("users").update({ location_id: 1, ooo_start: null, ooo_end: null }).eq("id", user.id);
                    setLocationType("office");
                    setOooStart("");
                    setOooEnd("");
                    setOriginalOoo({ start: null, end: null });
                    setCurrentDbLocationId(1);
                } else {
                    setLocationType(userData.location_id === 1 ? "office" : "ooo");
                    setOooStart(userData.ooo_start || "");
                    setOooEnd(userData.ooo_end || "");
                    setOriginalOoo({ 
                        start: userData.ooo_start || "", 
                        end: userData.ooo_end || "" 
                    });
                }
            }

            const todayISO = new Date().toISOString().slice(0, 10);
            const { data: hoData } = await supabase
                .from('home_office_requests')
                .select('date')
                .eq('user_id', user.id)
                .eq('status', 'approved')
                .gte('date', todayISO);

            if (hoData) {
                const dates = hoData.map(item => item.date);
                setApprovedHoDates(dates);
            }
        }
        
        if (user) loadData();
    }, [user, visible]);

    useEffect(() => {
        setTimeout(() => setVisible(true), 10);
    }, []);

    useEffect(() => {
        setStep(1);
        setSaveError("");
    }, []);

    const canContinueStep1 = locationType !== null;
    const canContinueStep2 =
        locationType === "office" ||
        (oooStart && oooEnd && oooEnd >= oooStart);
    const canSave = step === 3;

    async function saveLocationChange() {
        setIsSaving(true);
        setSaveError("");

        if (!user) return;

        try {
            const today = new Date();
            const tzOffset = today.getTimezoneOffset() * 60000;
            const localDate = new Date(today.getTime() - tzOffset).toISOString().slice(0, 10);

            let newLocationId; 
            let finalOooStart = null;
            let finalOooEnd = null;
            
            const bodyPayload = {
                user_id: user.id,
                office_date: localDate,
                location_id: 1 
            };

            const hasOriginal = originalOoo.start && originalOoo.end;

            if (locationType === "office") {
                newLocationId = 1;
                if (hasOriginal) {
                    bodyPayload.cancel_ooo_start = originalOoo.start;
                    bodyPayload.cancel_ooo_end = originalOoo.end;
                }
            } else {
                finalOooStart = oooStart;
                finalOooEnd = oooEnd;
                bodyPayload.ooo_start = finalOooStart;
                bodyPayload.ooo_end = finalOooEnd;

                if (oooStart > localDate) {
                    if (currentDbLocationId === 2) {
                        newLocationId = 2; 
                    } else {
                        newLocationId = 1; 
                    }
                } else {
                    newLocationId = 3; 
                }

                const datesChanged = oooStart !== originalOoo.start || oooEnd !== originalOoo.end;
                if (hasOriginal && datesChanged) {
                    bodyPayload.cancel_ooo_start = originalOoo.start;
                    bodyPayload.cancel_ooo_end = originalOoo.end;
                }
            }

            bodyPayload.location_id = newLocationId;

            const updatePayload = {
                location_id: newLocationId,
                ooo_start: finalOooStart,
                ooo_end: finalOooEnd,
            };

            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch(
                "https://prsxtuvgcusbipfshaqi.supabase.co/functions/v1/sync-calendar",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify(bodyPayload),
                }
            );

            const result = await response.json();
            const NativeError = window.Error || globalThis.Error;
            if (!response.ok || result.events?.some(e => e.error)) {
                const errorMsg = result.events?.find(e => e.error)?.error?.message || "Please re-login to sync your calendar.";
                throw new NativeError(errorMsg);
            }

            const { error } = await supabase
                .from("users")
                .update(updatePayload)
                .eq("id", user.id);

            if (error) throw error;

            if (updateLocation) updateLocation(newLocationId);
            window.dispatchEvent(new Event('locationUpdated'));

            setVisible(false);
            setTimeout(() => onClose && onClose(), 250);

        } catch (err) {
            console.error("❌ Error:", err);
            setSaveError(err.message || "An unexpected error occurred");
            setIsSaving(false);
        }
    }

    const handleNext = () => {
        setSaveError("");
        if (step === 1) setStep(locationType === "office" ? 3 : 2);
        else if (step === 2) setStep(3);
    };

    const handleBack = () => {
        setSaveError("");
        if (step === 2) {
            setStep(1);
        } else if (step === 3) {
            setStep(locationType === "ooo" ? 2 : 1);
        }
    };

    const handleClose = () => {
        setVisible(false);
        setTimeout(() => onClose && onClose(), 250);
        setSaveError("");
    };

    const isFutureOOO = () => {
        if (locationType !== 'ooo' || !oooStart) return false;
        const today = new Date();
        const tzOffset = today.getTimezoneOffset() * 60000;
        const localDate = new Date(today.getTime() - tzOffset).toISOString().slice(0, 10);
        return oooStart > localDate;
    };

    return (
        <>
            <CalendarGlobalStyles />
            <Overlay visible={visible}>
                <ModalContainer visible={visible}>
                    <Header>
                        <Title>Change Location</Title>
                        <CloseButton onClick={handleClose}>×</CloseButton>
                    </Header>

                    {/* STEP 1 */}
                    {step === 1 && (
                        <Content>
                            <SectionTitle>Select your current status</SectionTitle>
                            <OptionBox selected={locationType === "office"} onClick={() => setLocationType("office")}>
                                Office
                            </OptionBox>
                            <OptionBox selected={locationType === "ooo"} onClick={() => setLocationType("ooo")}>
                                Out of Office
                            </OptionBox>
                            <ButtonsRow>
                                <CancelButton onClick={handleClose}>Cancel</CancelButton>
                                <NextButton disabled={!canContinueStep1} onClick={handleNext}>Next</NextButton>
                            </ButtonsRow>
                        </Content>
                    )}

                    {/* STEP 2 */}
                    {step === 2 && locationType === "ooo" && (
                        <Content>
                            <SectionTitle>Out of Office</SectionTitle>
                            
                            <WarningMessage>
                                ⚠️ Remember to book OOO before leaving.
                            </WarningMessage>

                            <Label>From</Label>
                            <StyledDatePicker
                                selected={oooStart ? new Date(oooStart + "T00:00:00") : null}
                                onChange={(date) => {
                                    if (!date) { setOooStart(""); return; }
                                    const y = date.getFullYear();
                                    const m = String(date.getMonth() + 1).padStart(2, "0");
                                    const d = String(date.getDate()).padStart(2, "0");
                                    setOooStart(`${y}-${m}-${d}`);
                                }}
                                minDate={getTomorrow()}
                                filterDate={isDateSelectable} 
                                dayClassName={getDayClass}
                                placeholderText="Select start date"
                                dateFormat="EEEE, dd MMMM yyyy"
                                popperContainer={CalendarPopper}
                            />

                            <Label>To</Label>
                            <StyledDatePicker
                                selected={oooEnd ? new Date(oooEnd + "T00:00:00") : null}
                                onChange={(date) => {
                                    if (!date) { setOooEnd(""); return; }
                                    const y = date.getFullYear();
                                    const m = String(date.getMonth() + 1).padStart(2, "0");
                                    const d = String(date.getDate()).padStart(2, "0");
                                    setOooEnd(`${y}-${m}-${d}`);
                                }}
                                minDate={oooStart ? new Date(oooStart + "T00:00:00") : getTomorrow()}
                                filterDate={isDateSelectable}
                                dayClassName={getDayClass}
                                placeholderText="Select end date"
                                dateFormat="EEEE, dd MMMM yyyy"
                                fixedHeight // 🆕 Mantiene el alto constante
                                popperContainer={CalendarPopper}
                            />

                            {oooStart && oooEnd && oooEnd < oooStart && (
                                <Error>End date must be after start date.</Error>
                            )}

                            <ButtonsRow>
                                <BackButton onClick={() => handleBack()}>Back</BackButton>
                                <NextButton disabled={!canContinueStep2} onClick={handleNext}>Next</NextButton>
                            </ButtonsRow>
                        </Content>
                    )}

                    {/* STEP 3 */}
                    {step === 3 && (
                        <Content>
                            <SectionTitle>Confirm Changes</SectionTitle>

                            {locationType === "office" && (
                                <SummaryBox>You will be set to <strong>Office</strong>.</SummaryBox>
                            )}

                            {locationType === "ooo" && (
                                <SummaryBox>
                                    {isFutureOOO() ? (
                                        <>
                                            <p>Status: <strong>{currentDbLocationId === 2 ? "Home Office" : "Office"}</strong> (Today)</p>
                                            <p style={{ marginTop: '12px', color: '#F7D000', fontSize: '0.95rem' }}>
                                                Next OOO: <strong>{formatPrettyDate(oooStart)} — {formatPrettyDate(oooEnd)}</strong>
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p>Status: <strong>Out of Office</strong></p>
                                            <p>From: <strong>{formatPrettyDate(oooStart)}</strong></p>
                                            <p>To: <strong>{formatPrettyDate(oooEnd)}</strong></p>
                                        </>
                                    )}
                                </SummaryBox>
                            )}

                            <ButtonsRow>
                                <BackButton onClick={() => handleBack()}>Back</BackButton>
                                <SaveButton disabled={!canSave || isSaving} onClick={saveLocationChange}>
                                    {isSaving ? <Spinner /> : "Save"}
                                </SaveButton>
                            </ButtonsRow>

                            {saveError && <ErrorMessage>{saveError}</ErrorMessage>}
                        </Content>
                    )}
                </ModalContainer>
            </Overlay>
        </>
    );
}

const CalendarPopper = (props) => (
    <div {...props} style={{ ...props.style, zIndex: 10000, overflow: "visible" }} />
);

/* ---------------------- STYLES ---------------------- */
const Spinner = styled.div`border: 3px solid rgba(0, 0, 0, 0.1); border-left-color: #f7d000; border-radius: 50%; width: 16px; height: 16px; animation: spin 0.8s linear infinite; margin: 0 auto; @keyframes spin { to { transform: rotate(360deg); } }`;
const Overlay = styled.div`position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); display: flex; justify-content: center; align-items: center; z-index: 200; opacity: ${(p) => (p.visible ? 1 : 0)}; transition: opacity 0.25s ease;`;
const ModalContainer = styled.div`width: 380px; background: #2b2f38; border-radius: 12px; padding: 20px; box-shadow: 0px 4px 15px rgba(0, 0, 0, 0.5); color: white; overflow: visible; transform: ${(p) => (p.visible ? "translateY(0px)" : "translateY(25px)")}; opacity: ${(p) => (p.visible ? 1 : 0)}; transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);`;
const Header = styled.div`display: flex; justify-content: space-between; align-items: center;`;
const Title = styled.h2`margin: 0; font-size: 1.3rem;`;
const CloseButton = styled.button`font-size: 1.6rem; cursor: pointer; background: transparent; border: none; color: white; &:hover { color: #ff7777; }`;
const Content = styled.div`margin-top: 20px; overflow: visible;`;
const SectionTitle = styled.h3`font-size: 1.1rem; margin-bottom: 15px;`;
const OptionBox = styled.div`background: ${(p) => (p.selected ? "#3e4450" : "#22262e")}; border: ${(p) => (p.selected ? "2px solid #F7D000" : "1px solid #3e4450")}; padding: 12px 15px; border-radius: 8px; margin-bottom: 12px; cursor: pointer; &:hover { background: #3e4450; }`;
const ButtonsRow = styled.div`display: flex; justify-content: flex-end; gap: 10px; margin-top: 25px;`;
const CancelButton = styled.button`background: #3e4450; border: none; padding: 8px 14px; color: white; border-radius: 6px; cursor: pointer; &:hover { background: #484f5c; }`;
const BackButton = styled(CancelButton)``;
const NextButton = styled.button`background: ${(p) => (p.disabled ? "#555" : "#F7D000")}; border: none; padding: 8px 14px; color: black; border-radius: 6px; cursor: ${(p) => (p.disabled ? "not-allowed" : "pointer")};`;
const SaveButton = styled(NextButton)``;
const Label = styled.label`display: block; padding: 5px; font-size: 0.9rem;`;
const Error = styled.div`color: #ff7777; font-size: 0.85rem; margin-top: 6px; margin-bottom: 10px; position: relative; z-index: 10;`;
const ErrorMessage = styled.div`color: #ff4d4f; font-size: 0.85rem; margin-top: 15px; text-align: center;`;
const SummaryBox = styled.div`background: #1f2229; padding: 15px; border-radius: 8px; line-height: 1.5;`;
const WarningMessage = styled.div`color: #F7D000; font-size: 0.9rem; text-align: center; margin-bottom: 15px; font-weight: 500;`;
const StyledDatePicker = styled(DatePicker)`
  width: 338px; /* Ancho fijo para estabilidad total */
  padding: 10px 12px; 
  border-radius: 8px; 
  background: #1f2229; 
  border: 1px solid #3e4450; 
  color: white; 
  font-size: 0.95rem; 
  &:hover { background: #262a33; } 
  &:focus { border-color: #f7d000; outline: none; } 
`;