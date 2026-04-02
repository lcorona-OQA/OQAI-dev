import React, { useState, useEffect, useRef } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import styled from 'styled-components';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { supabase } from '../supabase/supabase.config';
import { UserAuth } from '../context/AuthContext';

// =======================
// Config & Utils
// =======================

const GLOBAL_HO_ROLES = new Set([3, 4, 8]); // Roles que ven todos los equipos
const HO_STATUSES = ['approved']; // Aprobado por Eng Lead o fully approved
const MAX_NAMES_IN_TILE = 2;

// Log seguro (solo en dev)
const devLog = (...args) => {
  if (import.meta?.env?.DEV) {
    // eslint-disable-next-line no-console
    console.log('[CustomCalendar]', ...args);
  }
};

const devWarn = (...args) => {
  if (import.meta?.env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn('[CustomCalendar]', ...args);
  }
};

const devError = (...args) => {
  // Siempre logueamos errores
  // eslint-disable-next-line no-console
  console.error('[CustomCalendar]', ...args);
};

// Format Date -> "YYYY-MM-DD"
const toISODate = (date) =>
  date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toISOString().slice(0, 10)
    : null;

// Normalize display name (avoid weird values)
const normalizeName = (raw) => {
  if (!raw || typeof raw !== 'string') return 'No name';
  return raw.trim().replace(/\s+/g, ' ');
};

// Extract team_name from users.teams relation (object or array)
const extractTeamName = (userRow) => {
  const rel = userRow?.teams;
  if (!rel) return null;
  if (Array.isArray(rel)) {
    const first = rel[0];
    if (first && typeof first.team_name === 'string') return first.team_name;
  } else if (typeof rel === 'object' && typeof rel.team_name === 'string') {
    return rel.team_name;
  }
  return null;
};

// =======================
// Component
// =======================

export function CustomCalendar() {
  const { user } = UserAuth(); // Puede ser null, undefined o objeto

  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  // { 'YYYY-MM-DD': { approved: [names], byTeam: [{teamId,teamName,members[]}] } }
  const [requestsByDate, setRequestsByDate] = useState({});
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [teamWarning, setTeamWarning] = useState('');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(() => new Date());
  const [modalInfo, setModalInfo] = useState({ approved: [], byTeam: [] });

  // Control de vida del componente y de la última petición
  const isMountedRef = useRef(true);
  const lastFetchKeyRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Saber si el usuario es "global viewer" (ve todos los equipos)
  const roleId = user?.role_id;
  const isGlobalHOViewer = GLOBAL_HO_ROLES.has(roleId);

  // =======================
  // Fetch data (por mes)
  // =======================

  const fetchMonthRequests = async (monthDate, currentUser) => {
    const fetchKey = `${monthDate?.getFullYear?.() || 'na'}-${monthDate?.getMonth?.() || 'na'
      }-${currentUser?.id || 'no-user'}`;
    lastFetchKeyRef.current = fetchKey;

    try {
      if (!currentUser) {
        devWarn('No authenticated user.');
        if (!isMountedRef.current || lastFetchKeyRef.current !== fetchKey) return;

        setRequestsByDate({});
        setTeamWarning('You must sign in to view home office requests.');
        setErrorText('');
        return;
      }

      const localRoleId = currentUser.role_id;
      const localIsGlobalViewer = GLOBAL_HO_ROLES.has(localRoleId);

      if (!localIsGlobalViewer && currentUser.team_id == null) {
        devWarn('User has no team_id and is not a global viewer.', currentUser);
        if (!isMountedRef.current || lastFetchKeyRef.current !== fetchKey) return;

        setRequestsByDate({});
        setTeamWarning('Your user does not have a team assigned.');
        setErrorText('');
        return;
      }

      if (!supabase || typeof supabase.from !== 'function') {
        devError('Supabase client is not available or misconfigured.');
        if (!isMountedRef.current || lastFetchKeyRef.current !== fetchKey) return;

        setRequestsByDate({});
        setTeamWarning('');
        setErrorText('Internal configuration error: data client not available.');
        return;
      }

      if (
        !monthDate ||
        !(monthDate instanceof Date) ||
        Number.isNaN(monthDate.getTime())
      ) {
        devError('Invalid monthDate:', monthDate);
        if (!isMountedRef.current || lastFetchKeyRef.current !== fetchKey) return;

        setRequestsByDate({});
        setTeamWarning('');
        setErrorText('Internal error: invalid reference date.');
        return;
      }

      if (!isMountedRef.current || lastFetchKeyRef.current !== fetchKey) return;

      setTeamWarning('');
      setLoading(true);
      setErrorText('');

      const year = monthDate.getFullYear();
      const month = monthDate.getMonth(); // 0-11

      const firstDay = new Date(Date.UTC(year, month, 1));
      const lastDay = new Date(Date.UTC(year, month + 1, 0));

      const from = toISODate(firstDay);
      const to = toISODate(lastDay);

      if (!from || !to) {
        devError('Could not derive date range from:', firstDay, lastDay);
        if (!isMountedRef.current || lastFetchKeyRef.current !== fetchKey) return;

        setRequestsByDate({});
        setErrorText('Internal error while calculating date range.');
        return;
      }

      devLog('Fetching HO requests', {
        from,
        to,
        team_id: currentUser.team_id,
        role_id: localRoleId,
        globalViewer: localIsGlobalViewer,
      });

      let query = supabase
        .from('home_office_requests')
        .select(
          `
          date,
          status,
          users!inner (
            display_name,
            team_id,
            teams ( team_name )
          )
        `
        )
        .gte('date', from)
        .lte('date', to)
        .in('status', HO_STATUSES);

      if (!localIsGlobalViewer) {
        query = query.eq('users.team_id', currentUser.team_id);
      }

      const { data, error } = await query;

      if (!isMountedRef.current || lastFetchKeyRef.current !== fetchKey) return;

      if (error) {
        devError('Error fetching HO requests:', error);
        setErrorText('Error loading home office days.');
        setRequestsByDate({});
        return;
      }

      const result = Array.isArray(data) ? data : [];

      // Estructura:
      // Map<dateISO, { namesSet: Set<string>, byTeam: Map<teamKey, { teamId, teamName, members: Set<string> }> }>
      const groupedByDate = new Map();

      for (const row of result) {
        try {
          const iso = row?.date;
          if (!iso || typeof iso !== 'string') continue;

          const userData = row?.users || {};
          const name = normalizeName(userData?.display_name);
          const teamId = userData?.team_id ?? null;
          let teamName = extractTeamName(userData);
          if (!teamName && teamId != null) {
            teamName = `Team ${teamId}`;
          }
          if (!teamName) {
            teamName = 'Unassigned team';
          }

          if (!groupedByDate.has(iso)) {
            groupedByDate.set(iso, {
              namesSet: new Set(),
              byTeam: new Map(),
            });
          }

          const dateEntry = groupedByDate.get(iso);
          if (name) {
            dateEntry.namesSet.add(name);
          }

          const teamKey = String(teamId ?? teamName ?? 'unknown');
          if (!dateEntry.byTeam.has(teamKey)) {
            dateEntry.byTeam.set(teamKey, {
              teamId,
              teamName,
              members: new Set(),
            });
          }

          if (name) {
            dateEntry.byTeam.get(teamKey).members.add(name);
          }
        } catch (innerErr) {
          devError('Error while grouping row:', row, innerErr);
        }
      }

      const grouped = {};
      for (const [iso, entry] of groupedByDate.entries()) {
        const approvedNames = Array.from(entry.namesSet).sort((a, b) =>
          a.localeCompare(b, 'en', { sensitivity: 'base' })
        );

        const byTeamPlain = [];
        for (const [, t] of entry.byTeam.entries()) {
          const members = Array.from(t.members).sort((a, b) =>
            a.localeCompare(b, 'en', { sensitivity: 'base' })
          );
          byTeamPlain.push({
            teamId: t.teamId,
            teamName: t.teamName || 'Unassigned team',
            members,
          });
        }

        byTeamPlain.sort((a, b) =>
          a.teamName.localeCompare(b.teamName, 'en', { sensitivity: 'base' })
        );

        grouped[iso] = {
          approved: approvedNames,
          byTeam: byTeamPlain,
        };
      }

      devLog('Grouped HO days:', grouped);
      setRequestsByDate(grouped);
    } catch (err) {
      devError('Unexpected error while loading data:', err);
      if (!isMountedRef.current || lastFetchKeyRef.current !== fetchKey) return;

      setErrorText('Unexpected error while loading data.');
      setRequestsByDate({});
    } finally {
      if (!isMountedRef.current || lastFetchKeyRef.current !== fetchKey) return;
      setLoading(false);
    }
  };

  // Load data when month or user changes
  useEffect(() => {
    if (user === undefined) {
      // AuthContext still loading
      return;
    }
    fetchMonthRequests(viewDate, user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate, user]);

  // Close modal with Escape key
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isModalOpen]);

  // =======================
  // Calendar events
  // =======================

  const handleClickDay = (value) => {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      devWarn('handleClickDay received invalid date:', value);
      return;
    }

    const day = value.getDay();
    if (day === 0 || day === 6) return; // Weekend safeguard

    setSelectedDate(value);
    const iso = toISODate(value);
    if (!iso) return;

    const info = requestsByDate[iso] || { approved: [], byTeam: [] };
    setModalDate(value);
    setModalInfo({
      approved: Array.isArray(info.approved) ? info.approved : [],
      byTeam: Array.isArray(info.byTeam) ? info.byTeam : [],
    });
    setIsModalOpen(true);
  };

  const handleActiveStartDateChange = ({ activeStartDate, view }) => {
    if (view === 'month' && activeStartDate instanceof Date) {
      setViewDate(activeStartDate);
    }
  };

  const tileDisabled = ({ date, view }) => {
    if (view !== 'month') return false;
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const tileContent = ({ date, view }) => {
    if (view !== 'month') return null;
    if (!(date instanceof Date)) return null;

    const day = date.getDay();
    if (day === 0 || day === 6) return null;

    const iso = toISODate(date);
    if (!iso) return null;

    const info = requestsByDate[iso];
    if (!info || !Array.isArray(info.approved)) return null;

    const names = info.approved;
    if (!names.length) return null;

    const displayNames = names.slice(0, MAX_NAMES_IN_TILE);
    const extraCount = names.length - MAX_NAMES_IN_TILE;

    return (
      <TileLabelsWrapper>
        {displayNames.map((n, idx) => (
          <HomeOfficeLabel key={`${iso}-${idx}`} title={n}>
            {n}
          </HomeOfficeLabel>
        ))}
        {extraCount > 0 && (
          <MoreLabel title={names.join(', ')}>
            +{extraCount} more
          </MoreLabel>
        )}
      </TileLabelsWrapper>
    );
  };

  const formattedModalDate =
    modalDate instanceof Date && !Number.isNaN(modalDate.getTime())
      ? modalDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      : 'Invalid date';

  const hasApproved =
    Array.isArray(modalInfo.approved) && modalInfo.approved.length > 0;
  const hasTeams =
    Array.isArray(modalInfo.byTeam) && modalInfo.byTeam.length > 0;

  return (
    <>
      <CalendarAndPanelContainer>
        <CalendarContainer>
          <Calendar
            onChange={setSelectedDate}
            onClickDay={handleClickDay}
            onActiveStartDateChange={handleActiveStartDateChange}
            value={selectedDate}
            tileContent={tileContent}
            tileDisabled={tileDisabled}
            calendarType="iso8601"
            locale="en-US"
            prevLabel={<FaChevronLeft />}
            nextLabel={<FaChevronRight />}
            formatMonthYear={(locale, date) =>
              date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
            }
          />
        </CalendarContainer>

        {teamWarning && <InlineWarning>{teamWarning}</InlineWarning>}
        {errorText && !teamWarning && <InlineError>{errorText}</InlineError>}
        {loading && !teamWarning && !errorText && (
          <InlineInfo>Loading home office data…</InlineInfo>
        )}
      </CalendarAndPanelContainer>

      {/* MODAL */}
      {isModalOpen && (
        <ModalOverlay onClick={() => setIsModalOpen(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Home Office Details</ModalTitle>
              <ModalCloseButton
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close"
              >
                ×
              </ModalCloseButton>
            </ModalHeader>
            <ModalBody>
              <ModalDateLine>
                <strong>{' '}</strong>
                <span>{formattedModalDate}</span>
              </ModalDateLine>

              {teamWarning && <ModalWarning>{teamWarning}</ModalWarning>}
              {errorText && !teamWarning && (
                <ModalError>{errorText}</ModalError>
              )}

              {!teamWarning && !errorText && (
                <>
                  <ModalSummary>
                    <SummaryBadgeApproved>
                      {Array.isArray(modalInfo.approved)
                        ? modalInfo.approved.length
                        : 0}{' '}
                      Members working from home
                    </SummaryBadgeApproved>
                  </ModalSummary>

                  {isGlobalHOViewer ? (
                    // ---- ROLES 4 / 8: AGRUPADO POR TEAM CON FALLBACK ----
                    hasTeams ? (
                      modalInfo.byTeam.map((team) => (
                        <TeamBlock
                          key={team.teamId ?? team.teamName ?? 'unknown-team'}
                        >
                          <TeamName>{team.teamName}</TeamName>
                          <ModalNamesList>
                            {team.members.map((name, idx) => (
                              <ModalNameItem
                                key={`${team.teamName}-${name}-${idx}`}
                              >
                                {name}
                              </ModalNameItem>
                            ))}
                          </ModalNamesList>
                        </TeamBlock>
                      ))
                    ) : hasApproved ? (
                      // Fallback: si no vino info por team, pero sí nombres, mostramos lista simple
                      <ModalNamesList>
                        {modalInfo.approved.map((name, idx) => (
                          <ModalNameItem key={`${name}-${idx}`}>
                            {name}
                          </ModalNameItem>
                        ))}
                      </ModalNamesList>
                    ) : (
                      <ModalEmptyText>
                        There are no people with approved home office on this
                        day.
                      </ModalEmptyText>
                    )
                  ) : // ---- OTROS ROLES: LISTA SIMPLE ----
                    hasApproved ? (
                      <ModalNamesList>
                        {modalInfo.approved.map((name, idx) => (
                          <ModalNameItem key={`${name}-${idx}`}>
                            {name}
                          </ModalNameItem>
                        ))}
                      </ModalNamesList>
                    ) : (
                      <ModalEmptyText>
                        There are no people with approved home office on this
                        day.
                      </ModalEmptyText>
                    )}
                </>
              )}
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}
    </>
  );
}

// =======================
// STYLES
// =======================

const CalendarAndPanelContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 95vh;
  width: 100%;
  justify-content: flex-start;
  align-items: center;
  font-weight: 500;
`;

const CalendarContainer = styled.div`
  background-color: transparent;
  width: 100%;
  display: flex;
  justify-content: center;

  .react-calendar {
    width: 100%;
    max-height: 95vh;
    margin: 0 auto;
    border: none;
    border-radius: 8px;
    background-color: #ffffff;
    backdrop-filter: blur(5px);
    font-family: inherit;
    padding: clamp(6px, 1.2vw, 14px);
  }

  /* --- NAVIGATION --- */
  .react-calendar__navigation {
    display: flex;
    height: clamp(36px, 5vh, 48px);
    margin-bottom: 1em;
  }

  .react-calendar__navigation__label {
    color: #000;
    font-size: clamp(1rem, 1.3vw, 1.4rem);
    font-weight: bold;
    background: none;
    text-transform: capitalize;
  }

  .react-calendar__navigation__arrow {
    color: #000;
    font-size: clamp(1rem, 1.2vw, 1.3rem);
    background: none;
    min-width: 44px;
  }

  .react-calendar__navigation button:enabled:hover,
  .react-calendar__navigation button:enabled:focus {
    background-color: #f0f0f0;
    border-radius: 8px;
  }

  /* Estado activo (día seleccionado) */
  .react-calendar__tile--active:enabled:hover,
  .react-calendar__tile--active:enabled:focus {
    background-color: #868686ff;
    border-radius: 8px;
    color: black;
  }
  .react-calendar__tile--active {
    background-color: #4c4c4cff;
    color: #ffffff;
  }

  /* --- WEEKDAY HEADER (Mon–Fri) --- */
  .react-calendar__month-view__weekdays {
    text-transform: uppercase;
    font-size: large;
    font-weight: bold;
    color: #666;
  }

  .react-calendar__month-view__weekdays abbr {
    text-decoration: none;
    cursor: default;
  }

  .react-calendar__month-view__weekdays__weekday {
    flex: 0 0 20% !important;
    overflow: hidden;
    text-align: center;
    padding: 0.5em;
  }

  .react-calendar__month-view__weekdays__weekday--weekend {
    display: none !important;
  }

  /* --- DAYS GRID (Mon–Fri only) --- */
  .react-calendar__month-view__days {
    display: flex !important;
    flex-wrap: wrap !important;
  }

  .react-calendar__month-view__days__day--weekend {
    display: none !important;
  }

  .react-calendar__tile {
    flex: 0 0 20% !important;
    max-width: 20% !important;
    background-color: transparent;
    color: #000;
    padding: clamp(4px, 0.6vw, 8px) clamp(2px, 0.4vw, 4px);
    border-radius: 6px;
    transition: background-color 0.2s;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    text-align: center;
    margin-bottom: 4px;
    height: 15vh;
    font-size: large;
    
  }

  .react-calendar__tile:hover {
    background-color: rgba(88, 88, 88, 0.05);
  }

  .react-calendar__tile:disabled {
    background-color: #f9f9f9;
    color: #ccc;
  }

  .react-calendar__tile--now {
    background-color: #e0e0e0;
  }

  .react-calendar__tile--now:hover {
    background-color: #d0d0d0;
  }
`;

const TileLabelsWrapper = styled.div`
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  justify-content: center;
  width: 100%;
`;

// Each name in its own row with ellipsis
const HomeOfficeLabel = styled.span`
  background-color: #e6f4ea;
  color: rgb(55 71 165);
  font-size: clamp(0.55rem, 0.7vw, 0.65rem);
  padding: 1px 4px;
  border-radius: 4px;
  display: block;
  text-align: center;
  max-width: 95%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size:medium;
`;

// "+N more" row
const MoreLabel = styled.span`
  background-color: #e6f4ea;
  color: rgb(55 71 165);
  font-size: clamp(0.5rem, 0.65vw, 0.6rem);
  padding: 1px 4px;
  border-radius: 4px;
  display: block;
  text-align: center;
  max-width: 95%;
  font-size: medium;
`;

const InlineWarning = styled.p`
  margin: 0;
  font-size: 0.8rem;
  color: #8e44ad;
  text-align: center;
`;

const InlineError = styled.p`
  margin: 0;
  font-size: 0.8rem;
  color: #c0392b;
  text-align: center;
`;

const InlineInfo = styled.p`
  margin: 0;
  font-size: 0.8rem;
  color: #555;
  text-align: center;
`;

// ====== MODAL ======
const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
`;

const ModalContent = styled.div`
  background: #ffffff;
  border-radius: 10px;
  max-width: 480px;
  width: 90%;
  max-height: 80vh;
  box-shadow: 0 8px 30px rgba(0,0,0,0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ModalHeader = styled.div`
  padding: 10px 16px;
  border-bottom: 1px solid #eee;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ModalTitle = styled.h3`
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
`;

const ModalCloseButton = styled.button`
  border: none;
  background: transparent;
  font-size: 1.3rem;
  cursor: pointer;
  line-height: 1;
`;

const ModalBody = styled.div`
  padding: 12px 16px 14px;
  overflow-y: auto;
`;

const ModalDateLine = styled.p`
  margin: 0 0 8px 0;
  font-size: 0.9rem;
  span {
    text-transform: capitalize;
  }
  font-weight: 500;
`;

const ModalWarning = styled.p`
  margin: 8px 0;
  color: #8e44ad;
  font-size: 0.85rem;
`;

const ModalError = styled.p`
  margin: 8px 0;
  color: #c0392b;
  font-size: 0.85rem;
`;

const ModalSummary = styled.div`
  display: flex;
  gap: 8px;
  margin: 6px 0 10px;
`;

const SummaryBadgeApproved = styled.span`
  background: #e6f4ea;
  color: #137333;
  font-size: 0.78rem;
  padding: 3px 8px;
  border-radius: 50px;
`;

const ModalNamesList = styled.ul`
  margin: 0 0 8px 16px;
  padding: 0;
`;

const ModalNameItem = styled.li`
  font-size: 0.86rem;
  color: #222;
  margin-bottom: 2px;
`;

const ModalEmptyText = styled.p`
  margin: 0 0 8px 0;
  font-size: 0.82rem;
  color: #999;
`;

// Bloque por team
const TeamBlock = styled.div`
  margin-bottom: 10px;
`;

const TeamName = styled.h5`
  margin: 4px 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: #3747a5;
`;
