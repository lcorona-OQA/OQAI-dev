// src/components/PendingRequestsPanel.jsx
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { FaCheck, FaTimes, FaChevronDown } from 'react-icons/fa';
import userPlaceholder from '../assets/user-placeholder.png';
import { supabase } from '../supabase/supabase.config';
import Swal from 'sweetalert2';
import { sendHomeOfficeEmailForRequest } from '../utils/sendHomeOfficeEmail';

// 👇 NUEVO: importamos las URLs centralizadas
import {
  HO_STATUS_SLACK_URL,
  SYNC_CALENDAR_URL,
} from '../config/functions';

// --- FUNCIÓN PARA FORMATEAR FECHAS ---
const formatDate = (date) => {
  if (!date) return '-';
  const options = { month: 'long', weekday: 'long', day: 'numeric' };
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString('en-US', options);
};

export function PendingRequestsPanel() {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [updatingBulk, setUpdatingBulk] = useState(false);
  const [rejectingId, setRejectingId] = useState(null);
  const [expandedUserId, setExpandedUserId] = useState(null);

  async function fetchPendingRequests() {
    const { data, error } = await supabase
      .from('home_office_requests')
      .select(`
        id,
        date,
        user_id,
        users (
          id,
          display_name,
          email,
          photo_url,
          team_id,
          teams (team_name)
        )
      `)
      .eq('status', 'pending_admin')
      .order('date', { ascending: true });

    if (error) {
      console.error('Error fetching pending requests:', error);
      return;
    }
    setPendingRequests(data || []);
  }

  useEffect(() => {
    fetchPendingRequests();

    const channel = supabase
      .channel('public:home_office_requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'home_office_requests' },
        () => {
          fetchPendingRequests();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // --- FUNCIÓN AUXILIAR: LLAMAR EDGE FUNCTION Slack (status change) ---
  const callSlackStatusFunction = async (action, requests) => {
    if (!requests || requests.length === 0) return;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const payload = {
        mode: 'status_change',
        action, // 'approved' | 'rejected'
        actorRole: 'admin',
        requests: requests.map((r) => ({
          requestId: r.id,
          date: r.date,
          userId: r.user_id,
          userName: r.users?.display_name ?? null,
          userEmail: r.users?.email ?? null,
        })),
      };

      console.log(
        '[PendingRequestsPanel] Enviando a ho-requests-status-slack:',
        payload,
      );

      const resp = await fetch(HO_STATUS_SLACK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Importante: token del admin para que la Edge function pueda usar auth.getUser()
          Authorization: session?.access_token
            ? `Bearer ${session.access_token}`
            : '',
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        console.error(
          '[PendingRequestsPanel] ho-requests-status-slack error HTTP:',
          resp.status,
          txt,
        );
      } else {
        const json = await resp.json().catch(() => ({}));
        console.log(
          '[PendingRequestsPanel] ho-requests-status-slack OK:',
          json,
        );
      }
    } catch (err) {
      console.error(
        '[PendingRequestsPanel] Error llamando ho-requests-status-slack:',
        err,
      );
    }
  };

  // --- FUNCIÓN AUXILIAR PARA NOTIFICAR AL CALENDARIO ---
  const notifyCalendar = async (requestData) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const payload = {
        user_id: requestData.user_id,
        location_id: 2,
        office_date: requestData.date,
      };

      console.log(
        '📅 Creando evento en calendario para:',
        requestData.users?.display_name,
        payload,
      );

      await fetch(SYNC_CALENDAR_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('Error syncing calendar:', err);
    }
  };

  // --- AGRUPAR POR USUARIO PARA MOSTRAR EN UI Y USAR EN NOTIFICACIONES / EMAILS ---
  const groupedByUser = (() => {
    const map = new Map();
    for (const req of pendingRequests) {
      const uid = req.user_id;
      if (!map.has(uid)) {
        map.set(uid, {
          user_id: uid,
          user: req.users,
          requests: [],
        });
      }
      map.get(uid).requests.push(req);
    }
    const groups = Array.from(map.values());

    groups.sort((a, b) => {
      const nameA = (a.user?.display_name || '').toLowerCase();
      const nameB = (b.user?.display_name || '').toLowerCase();
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    });

    return groups;
  })();

  // --- RECHAZAR UN SOLO DÍA ---
  const handleRejectSingleDay = async (request) => {
    if (!request || !request.id) {
      Swal.fire('Error', 'Could not identify the selected request.', 'error');
      return;
    }

    const userName = request.users?.display_name || 'User';
    const dateLabel = formatDate(request.date);

    const { isConfirmed } = await Swal.fire({
      title: 'Reject this day?',
      html: `
        <p>You are about to <strong>reject</strong> this Home Office day:</p>
        <p><strong>${userName}</strong></p>
        <p>${dateLabel}</p>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#6c757d',
      cancelButtonColor: '#dc3545',
      confirmButtonText: 'Yes, reject this day',
      reverseButtons: true,
    });

    if (!isConfirmed) return;

    setRejectingId(request.id);
    try {
      const { error } = await supabase
        .from('home_office_requests')
        .update({ status: 'rejected' })
        .eq('id', request.id);

      if (error) {
        console.error('[PendingRequestsPanel] Error rejecting day:', error);
        Swal.fire(
          'Error',
          'Could not reject this specific day. Try again.',
          'error',
        );
        return;
      }

      // Notificación al usuario por este día rechazado
      try {
        const dateLabelSingle = formatDate(request.date);
        const { error: notifError } = await supabase
          .from('notifications')
          .insert({
            title: 'Home Office request rejected by admin',
            content: `Your Home Office request for ${dateLabelSingle} was rejected by an administrator.`,
            target_user_id: request.user_id,
            type: 'request_result',
            is_important: false,
          });

        if (notifError) {
          console.error(
            '[PendingRequestsPanel] Error creando notificación individual:',
            notifError,
          );
        }
      } catch (notifErr) {
        console.error(
          '[PendingRequestsPanel] Error inesperado notificación individual:',
          notifErr,
        );
      }

      // --- SLACK: informar rechazo de este día ---
      await callSlackStatusFunction('rejected', [request]);

      setPendingRequests((prev) => prev.filter((r) => r.id !== request.id));

      Swal.fire('Rejected', 'The selected day has been rejected.', 'success');
    } catch (err) {
      console.error(
        '[PendingRequestsPanel] Unexpected error rejecting day:',
        err,
      );
      Swal.fire(
        'Error',
        'Unexpected error while rejecting this day.',
        'error',
      );
    } finally {
      setRejectingId(null);
    }
  };

  // --- BULK UPDATE (FINAL APPROVAL / REJECT ALL) ---
  const handleBulkUpdate = async (newStatus) => {
    if (pendingRequests.length === 0) {
      Swal.fire(
        'No Requests',
        'There are no pending requests to update.',
        'info',
      );
      return;
    }

    const actionText = newStatus === 'approved' ? 'approve' : 'reject';

    const { isConfirmed } = await Swal.fire({
      title: 'Are you sure?',
      text: `This will ${actionText} all ${pendingRequests.length} pending requests.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: newStatus === 'approved' ? '#28a745' : '#dc3545',
      cancelButtonColor: '#3085d6',
      confirmButtonText: `Yes, ${actionText} all`,
      reverseButtons: true,
    });

    if (!isConfirmed) return;

    const idsToUpdate = pendingRequests.map((req) => req.id);

    setUpdatingBulk(true);
    try {
      // 1) Actualizar estados
      const { error } = await supabase
        .from('home_office_requests')
        .update({ status: newStatus })
        .in('id', idsToUpdate);

      if (error) {
        console.error('Error bulk updating requests:', error);
        Swal.fire(
          'Error',
          `Could not ${actionText} all requests.`,
          'error',
        );
        return;
      }

      // 2) NOTIFICACIONES INTERNAS AGRUPADAS POR USUARIO
      try {
        const notifications = [];

        groupedByUser.forEach((group) => {
          const userId = group.user_id;
          const userName = group.user?.display_name || 'User';
          const teamId = group.user?.team_id ?? null;

          const datesLabels = group.requests
            .map((r) => formatDate(r.date))
            .join(', ');

          if (newStatus === 'rejected') {
            // Un solo mensaje al usuario con todos los días rechazados
            notifications.push({
              title: 'Home Office requests rejected by admin',
              content: `Your Home Office requests for ${datesLabels} were rejected by an administrator.`,
              target_user_id: userId,
              type: 'request_result',
              is_important: false,
            });
          } else if (newStatus === 'approved') {
            // Usuario
            notifications.push({
              title: 'Home Office requests approved',
              content: `Your Home Office requests for ${datesLabels} have been approved by admin.`,
              target_user_id: userId,
              type: 'request_result',
              is_important: false,
            });

            // Team Lead (rol 5, por equipo)
            if (teamId) {
              notifications.push({
                title: 'Team member HO approved',
                content: `HO requests for ${userName} (${datesLabels}) have been approved by admin.`,
                target_role_id: 5,
                target_team_id: teamId,
                type: 'request_result',
                is_important: false,
              });
            }

            // HR (rol 9)
            notifications.push({
              title: 'HO approved (HR)',
              content: `HO requests for ${userName} (${datesLabels}) have been approved by admin.`,
              target_role_id: 9,
              type: 'request_result',
              is_important: false,
            });
          }
        });

        if (notifications.length > 0) {
          const { error: notifError } = await supabase
            .from('notifications')
            .insert(notifications);

          if (notifError) {
            console.error(
              '[PendingRequestsPanel] Error insertando notificaciones bulk:',
              notifError,
            );
          }
        }
      } catch (notifErr) {
        console.error(
          '[PendingRequestsPanel] Error inesperado en notificaciones bulk:',
          notifErr,
        );
      }

      // --- SI ES RECHAZO, Slack + mensaje y salimos ---
      if (newStatus === 'rejected') {
        try {
          await callSlackStatusFunction('rejected', pendingRequests);
        } catch (err) {
          console.error(
            '[PendingRequestsPanel] Error llamando Slack en bulk reject:',
            err,
          );
        }

        Swal.fire(
          'Success!',
          `All requests have been ${actionText}d.`,
          'success',
        );
        await fetchPendingRequests();
        return;
      }

      // === APROBACIÓN FINAL (approved) ===

      // 3) Crear eventos en calendario para TODAS las solicitudes aprobadas
      try {
        await Promise.all(pendingRequests.map((req) => notifyCalendar(req)));
      } catch (err) {
        console.error(
          '[PendingRequestsPanel] Error al crear eventos de calendario en bulk:',
          err,
        );
      }

      // 4) Enviar correo FINAL, una vez por usuario (coalesced, stage = final_approved)
      let totalEmails = 0;
      let successEmails = 0;
      let failedEmails = 0;

      try {
        const representativeRequests = groupedByUser.map(
          (group) => group.requests[0],
        );

        const emailResults = await Promise.all(
          representativeRequests.map(async (req) => {
            try {
              const result = await sendHomeOfficeEmailForRequest(
                req.id,
                'final_approved',
              );
              console.log(
                '[PendingRequestsPanel] Resultado correo final para request',
                req.id,
                ':',
                result,
              );
              return { ok: true, result };
            } catch (err) {
              console.error(
                '[PendingRequestsPanel] Error enviando correo final para request',
                req.id,
                err,
              );
              return {
                ok: false,
                result: {
                  total: 1,
                  successCount: 0,
                  failCount: 1,
                  reason: 'exception_sending_email',
                },
              };
            }
          }),
        );

        emailResults.forEach(({ ok, result }) => {
          if (!result) return;
          const t = result.total ?? 0;
          const sc = result.successCount ?? 0;
          const fc = result.failCount ?? 0;

          totalEmails += t;
          successEmails += sc;
          failedEmails += fc;

          if (!ok && fc === 0 && t === 0) {
            failedEmails += 1;
            totalEmails += 1;
          }
        });
      } catch (err) {
        console.error(
          '[PendingRequestsPanel] Error inesperado en envío de correos finales:',
          err,
        );
      }

      // 5) Slack: informar aprobación final al usuario (y TL / quien defina la Edge)
      try {
        await callSlackStatusFunction('approved', pendingRequests);
      } catch (err) {
        console.error(
          '[PendingRequestsPanel] Error llamando Slack en bulk approve:',
          err,
        );
      }

      // 6) Mensaje al admin
      let alertTitle = 'Success!';
      let alertText = `All requests have been ${actionText}d.`;
      let alertIcon = 'success';

      if (totalEmails === 0) {
        alertTitle = 'Approved (no emails)';
        alertText =
          'Requests were approved successfully, but no confirmation emails were sent (check email configuration and roles).';
        alertIcon = 'info';
      } else if (successEmails > 0 && failedEmails === 0) {
        alertTitle = 'Approved & Emails Sent';
        alertText =
          'All requests were approved and confirmation emails have been sent successfully.';
        alertIcon = 'success';
      } else if (successEmails > 0 && failedEmails > 0) {
        alertTitle = 'Approved with Warnings';
        alertText =
          'Requests were approved. Some confirmation emails were sent correctly, but others failed.';
        alertIcon = 'warning';
      } else if (successEmails === 0 && failedEmails > 0) {
        alertTitle = 'Approved but Emails Failed';
        alertText =
          'Requests were approved, but confirmation emails could not be delivered.';
        alertIcon = 'warning';
      }

      Swal.fire(alertTitle, alertText, alertIcon);
      await fetchPendingRequests();
    } finally {
      setUpdatingBulk(false);
    }
  };

  // === UI ===

  return (
    <PanelContainer>
      <PanelHeader>
        <PanelTitle>Pending Requests</PanelTitle>
        <HeaderActions>
          <BulkButton
            danger
            onClick={() => handleBulkUpdate('rejected')}
            disabled={groupedByUser.length === 0 || updatingBulk}
          >
            <FaTimes /> Reject All
          </BulkButton>
          <BulkButton
            approve
            onClick={() => handleBulkUpdate('approved')}
            disabled={groupedByUser.length === 0 || updatingBulk}
          >
            <FaCheck /> Approve All
          </BulkButton>
        </HeaderActions>
      </PanelHeader>

      <RequestsList>
        {groupedByUser.length > 0 ? (
          groupedByUser.map((group) => {
            const { user, requests } = group;
            const isExpanded = expandedUserId === group.user_id;

            const sortedDates = requests
              .map((r) => r.date)
              .filter(Boolean)
              .sort();

            const formattedDates = sortedDates.map((d) => formatDate(d));

            let datesLabel = '';
            if (formattedDates.length <= 3) {
              datesLabel = formattedDates.join(' · ');
            } else {
              datesLabel = `${formattedDates[0]} + ${
                formattedDates.length - 1
              } more day(s)`;
            }

            return (
              <RequestItem key={group.user_id}>
                <RequestHeader
                  type="button"
                  onClick={() =>
                    setExpandedUserId(isExpanded ? null : group.user_id)
                  }
                >
                  <RequestInfo>
                    <ProfilePic
                      src={user?.photo_url || userPlaceholder}
                      alt={user?.display_name || 'User'}
                    />
                    <div>
                      <RequestName>
                        {user?.display_name || 'Unnamed user'}
                      </RequestName>
                      <RequestTeam>
                        {user?.teams?.team_name || 'Sin equipo'}
                      </RequestTeam>
                      <RequestDates>{datesLabel}</RequestDates>
                    </div>
                  </RequestInfo>
                  <ChevronIcon isExpanded={isExpanded}>
                    <FaChevronDown />
                  </ChevronIcon>
                </RequestHeader>

                {isExpanded && (
                  <UserDaysList>
                    {requests
                      .slice()
                      .sort((a, b) =>
                        String(a.date).localeCompare(String(b.date)),
                      )
                      .map((req) => (
                        <DayRow key={req.id}>
                          <DayLabel>{formatDate(req.date)}</DayLabel>
                          <DayActions>
                            <RejectDayButton
                              type="button"
                              onClick={() => handleRejectSingleDay(req)}
                              disabled={
                                rejectingId === req.id || updatingBulk
                              }
                            >
                              <FaTimes />
                              <span>Reject</span>
                            </RejectDayButton>
                          </DayActions>
                        </DayRow>
                      ))}
                  </UserDaysList>
                )}
              </RequestItem>
            );
          })
        ) : (
          <NoRequests>No pending requests.</NoRequests>
        )}
      </RequestsList>
    </PanelContainer>
  );
}

// -- ESTILOS --

const PanelContainer = styled.div`
  background-color: #ffffff;
  border-radius: 8px;
  padding: 20px;
  color: #000;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: 15px;
  height: 95vh;
  overflow: hidden;
`;

const PanelHeader = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  flex-shrink: 0;
`;

const PanelTitle = styled.h2`
  font-size: 1.8em;
  font-weight: bold;
  margin: 0;
  white-space: nowrap;
`;

const HeaderActions = styled.div`
  display: flex;
  width: 100%;
  gap: 8px;
  flex-shrink: 0;
`;

const BulkButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 5px;
  font-size: 0.8em;
  padding: 5px 10px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  color: #fff;
  background-color: ${(props) =>
    props.danger ? '#dc3545' : props.approve ? '#28a745' : '#6c757d'};

  &:hover {
    opacity: 0.85;
  }

  &:disabled {
    background-color: #ccc;
    opacity: 0.7;
    cursor: not-allowed;
  }

  svg {
    font-size: 0.9em;
  }
`;

const RequestsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  flex-grow: 1;
`;

const RequestItem = styled.div`
  background-color: #f0f0f0;
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const RequestHeader = styled.button`
  border: none;
  background: none;
  padding: 0;
  margin: 0;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
`;

const RequestInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const ChevronIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease;
  svg {
    font-size: 0.9rem;
  }
  transform: ${({ isExpanded }) =>
    isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};
`;

const ProfilePic = styled.img`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
`;

const RequestName = styled.p`
  font-weight: bold;
  margin: 0;
`;

const RequestTeam = styled.p`
  font-size: 0.9em;
  color: #8c8c8c;
  margin: 0;
`;

const RequestDates = styled.p`
  font-size: 0.8em;
  color: #555;
  margin: 2px 0 0 0;
`;

const UserDaysList = styled.div`
  margin-top: 4px;
  border-top: 1px solid #ddd;
  padding-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const DayRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const DayLabel = styled.span`
  font-size: 0.85em;
  color: #333;
`;

const DayActions = styled.div`
  display: flex;
  gap: 6px;
`;

const RejectDayButton = styled.button`
  border: none;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 0.75em;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #dc3545;
  color: #fff;
  cursor: pointer;

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  svg {
    font-size: 0.8em;
  }
`;

const NoRequests = styled.p`
  text-align: center;
  color: #8c8c8c;
  padding: 20px;
`;
