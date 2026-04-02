// src/pages/TeamLeadRequestsPage.jsx
import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Sidebar } from '../components/Sidebar';
import { AdminSidebar } from '../components/AdminSidebar';
import { UserAuth } from '../context/AuthContext';
import { supabase } from '../supabase/supabase.config';
import { FaUser, FaCheck, FaTimes, FaClock, FaCalendarAlt, FaHome, FaDesktop, FaChevronDown } from 'react-icons/fa';
import userPlaceholder from '../assets/user-placeholder.png';
import Swal from 'sweetalert2';
import { sendHomeOfficeEmailForRequest } from '../utils/sendHomeOfficeEmail';

// --- Función de formato de fecha ---
const formatDate = (date) => {
  if (!date) return '-';
  const options = { month: 'long', weekday: 'long', day: 'numeric' };
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString('en-US', options);
};

export function TeamLeadRequestsPage() {
  const { user } = UserAuth();
  const [teamMembers, setTeamMembers] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [requestHistory, setRequestHistory] = useState([]);
  const [nextHODays, setNextHODays] = useState([]);
  const [assignedDevices, setAssignedDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updatingSingle, setUpdatingSingle] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [updatingBulk, setUpdatingBulk] = useState(false);

  const isAdminLead = user?.role_id === 8;

  useEffect(() => {
    console.log('[TeamLeadRequestsPage] Montado');
    return () => {
      console.log('[TeamLeadRequestsPage] Desmontado');
    };
  }, []);

  // =======================
  // Slack Helpers
  // =======================
  const notifySlackNewRequests = async (requests) => {
    try {
      const teamLeadName = user?.display_name || user?.email || null;

      console.log('[TeamLeadRequestsPage] notifySlackNewRequests', {
        teamLeadName,
        requests,
      });

      const payload = {
        mode: 'lead_approved',
        teamLeadName,
        requests: requests.map((req) => ({
          requestId: req.id,
          date: req.date,
          userId: req.user_id || req.users?.id || null,
          userName: req.users?.display_name || null,
          userEmail: req.users?.email || null,
        })),
      };

      const { data, error } = await supabase.functions.invoke(
        'ho-requests-slack',
        { body: payload },
      );

      if (error) {
        console.error(
          '[TeamLeadRequestsPage] Error calling ho-requests-slack:',
          error,
        );
      } else {
        console.log(
          '[TeamLeadRequestsPage] ho-requests-slack OK:',
          data,
        );
      }
    } catch (err) {
      console.error(
        '[TeamLeadRequestsPage] Unexpected error notifying Slack (lead_approved):',
        err,
      );
    }
  };

  const notifySlackMemberResult = async (mode, requests) => {
    try {
      const payload = {
        mode,
        requests: requests.map((req) => ({
          requestId: req.id,
          date: req.date,
          userId: req.user_id || req.users?.id || null,
          userName: req.users?.display_name || null,
          userEmail: req.users?.email || null,
        })),
      };

      console.log(
        '[TeamLeadRequestsPage] notifySlackMemberResult:',
        payload,
      );

      const { data, error } = await supabase.functions.invoke(
        'ho-requests-result-slack',
        { body: payload },
      );

      if (error) {
        console.error(
          '[TeamLeadRequestsPage] Error calling ho-requests-result-slack:',
          error,
        );
      } else {
        console.log(
          '[TeamLeadRequestsPage] ho-requests-result-slack OK:',
          data,
        );
      }
    } catch (err) {
      console.error(
        '[TeamLeadRequestsPage] Unexpected error calling ho-requests-result-slack:',
        err,
      );
    }
  };

  // =======================
  // Fetch Data
  // =======================
  useEffect(() => {
    if (!user) return;

    async function fetchTeamMembers() {
      try {
        console.log('[TeamLeadRequestsPage] Fetch team members');

        if (!user.team_id) {
          console.warn(
            '[TeamLeadRequestsPage] User has no team_id, skipping teamMembers fetch.',
          );
          setTeamMembers([]);
          return;
        }

        const { data, error } = await supabase
          .from('users')
          .select(
            `
            id,
            display_name,
            email,
            photo_url,
            team_id,
            locations (
              id,
              location_name,
              photo_url
            )
          `,
          )
          .eq('team_id', user.team_id)
          .eq('is_active', true)
          .order('display_name', { ascending: true });

        if (error) {
          console.error(
            '[TeamLeadRequestsPage] Error fetching team members:',
            error,
          );
          setTeamMembers([]);
          return;
        }

        setTeamMembers(data || []);
      } catch (err) {
        console.error(
          '[TeamLeadRequestsPage] Error inesperado en fetchTeamMembers:',
          err,
        );
        setTeamMembers([]);
      }
    }

    async function fetchPendingRequests() {
      try {
        console.log('[TeamLeadRequestsPage] Fetch pending requests');
        const { data, error } = await supabase
          .from('home_office_requests')
          .select(
            `
            id,
            date,
            status,
            user_id,
            users!inner(
              id,
              display_name,
              email,
              photo_url
            )
          `,
          )
          .eq('status', 'pending_lead')
          .eq('users.team_id', user.team_id)
          .order('date', { ascending: true });

        if (error) {
          console.error(
            '[TeamLeadRequestsPage] Error fetching pending requests:',
            error,
          );
          setPendingRequests([]);
          return;
        }

        setPendingRequests(data || []);
      } catch (err) {
        console.error(
          '[TeamLeadRequestsPage] Error inesperado en fetchPendingRequests:',
          err,
        );
        setPendingRequests([]);
      }
    }

    async function init() {
      setLoading(true);
      try {
        await Promise.all([fetchTeamMembers(), fetchPendingRequests()]);
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [user]);

  // Fetch detalles del empleado (historial de HO, devices)
  useEffect(() => {
    if (!selectedEmployee) {
      setRequestHistory([]);
      setNextHODays([]);
      setAssignedDevices([]);
      return;
    }

    async function fetchEmployeeDetails() {
      setLoading(true);
      try {
        const userId = selectedEmployee.id;

        // Historial de solicitudes
        const { data: historyData, error: historyError } = await supabase
          .from('home_office_requests')
          .select('id, date, status, created_at')
          .eq('user_id', userId)
          .order('date', { ascending: false });

        if (historyError) {
          console.error(
            '[TeamLeadRequestsPage] Error fetching request history:',
            historyError,
          );
          setRequestHistory([]);
        } else {
          setRequestHistory(historyData || []);
        }

        // Próximos días HO aprobados
        const today = new Date().toISOString().split('T')[0];
        const { data: nextData, error: nextError } = await supabase
          .from('home_office_requests')
          .select('id, date, status')
          .eq('user_id', userId)
          .eq('status', 'approved')
          .gte('date', today)
          .order('date', { ascending: true });

        if (nextError) {
          console.error(
            '[TeamLeadRequestsPage] Error fetching next HO days:',
            nextError,
          );
          setNextHODays([]);
        } else {
          setNextHODays(nextData || []);
        }

        // Dispositivos asignados
        const { data: devicesData, error: devicesError } = await supabase
          .from('devices')
          .select(
            `
            id,
            name,
            model,
            status,
            asset_tag,
            locations (location_name)
          `,
          )
          .eq('assigned_user_id', userId)
          .in('status', ['taken_ho', 'assigned']);

        if (devicesError) {
          console.error(
            '[TeamLeadRequestsPage] Error fetching assigned devices:',
            devicesError,
          );
          setAssignedDevices([]);
        } else {
          setAssignedDevices(devicesData || []);
        }
      } catch (err) {
        console.error(
          '[TeamLeadRequestsPage] Error inesperado en fetchEmployeeDetails:',
          err,
        );
        setRequestHistory([]);
        setNextHODays([]);
        setAssignedDevices([]);
      } finally {
        setLoading(false);
      }
    }

    fetchEmployeeDetails();
  }, [selectedEmployee]);

  const handleSelectEmployee = (employee) => {
    if (selectedEmployee && selectedEmployee.id === employee.id) {
      setSelectedEmployee(null);
    } else {
      setSelectedEmployee(employee);
    }
  };

  // --- LÓGICA DE APROBAR / RECHAZAR INDIVIDUAL (TL) ---
  const handleRequestUpdate = async (request, newStatus) => {
    if (!request || !request.id) {
      Swal.fire('Error', 'Could not identify the selected request.', 'error');
      return;
    }

    if (!user) {
      Swal.fire('Error', 'No authenticated user found.', 'error');
      return;
    }

    const actionText = newStatus === 'rejected' ? 'reject' : 'approve';
    console.log('[handleRequestUpdate] Inicio', {
      requestId: request.id,
      newStatus,
    });

    const dateLabel = formatDate(request.date);
    const requesterName = request.users?.display_name || 'User';

    setUpdatingSingle(true);
    try {
      const { error } = await supabase
        .from('home_office_requests')
        .update({ status: newStatus })
        .eq('id', request.id);

      if (error) {
        console.error('[handleRequestUpdate] Error actualizando:', error);
        Swal.fire(
          'Error',
          'There was a problem updating the request. Please try again.',
          'error',
        );
        return;
      }

      // Notificación interna
      try {
        if (newStatus === 'rejected') {
          const { error: notifError } = await supabase
            .from('notifications')
            .insert({
              title: 'Home Office request rejected by Team Lead',
              content: `Your Home Office request for ${dateLabel} was rejected by your Team Lead.`,
              target_user_id: request.user_id,
              type: 'request_result',
              is_important: false,
            });

          if (notifError) {
            console.error(
              '[handleRequestUpdate] Error creando notificación de rechazo:',
              notifError,
            );
          }

          // Slack: avisar al miembro
          await notifySlackMemberResult('tl_rejected', [request]);
        } else if (newStatus === 'pending_admin') {
          const baseContent = `${requesterName} requested Home Office for ${dateLabel} and it has been approved by their Team Lead.`;
          const { error: notifError } = await supabase
            .from('notifications')
            .insert({
              title: 'Home Office request pending final admin approval',
              content: baseContent,
              target_role_id: 8,
              type: 'ho_pending_admin',
              is_important: true,
            });

          if (notifError) {
            console.error(
              '[handleRequestUpdate] Error creando notificación pending_admin:',
              notifError,
            );
          }

          // Slack: avisar a admins
          await notifySlackNewRequests([request]);
        }
      } catch (notifErr) {
        console.error(
          '[handleRequestUpdate] Error inesperado en notificaciones:',
          notifErr,
        );
      }

      // Actualizar el estado local
      setPendingRequests((prev) =>
        prev.filter((r) => r.id !== request.id),
      );

      Swal.fire(
        'Success',
        `The request for ${dateLabel} has been ${actionText}ed.`,
        'success',
      );
    } catch (err) {
      console.error('[handleRequestUpdate] Error inesperado:', err);
      Swal.fire(
        'Error',
        'There was a problem processing the request. Please try again.',
        'error',
      );
    } finally {
      setUpdatingSingle(false);
    }
  };

  // --- LÓGICA BULK ---
  const handleBulkUpdate = async (newStatus) => {
    if (pendingRequests.length === 0) {
      Swal.fire('No Requests', 'There are no pending requests to update.', 'info');
      return;
    }

    const actionText = newStatus === 'rejected' ? 'reject' : 'approve';

    const { isConfirmed } = await Swal.fire({
      title: 'Are you sure?',
      text: `This will ${actionText} all ${pendingRequests.length} pending requests from your team.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: newStatus === 'rejected' ? '#dc3545' : '#28a745',
      cancelButtonColor: '#6c757d',
      confirmButtonText: `Yes, ${actionText} all`,
      reverseButtons: true,
    });

    if (!isConfirmed) return;

    setUpdatingBulk(true);
    try {
      const requestIds = pendingRequests.map((req) => req.id);

      const { error } = await supabase
        .from('home_office_requests')
        .update({ status: newStatus })
        .in('id', requestIds);

      if (error) {
        console.error('[handleBulkUpdate] Error bulk update:', error);
        Swal.fire(
          'Error',
          `Could not ${actionText} all requests. Please try again.`,
          'error',
        );
        return;
      }

      // Notificaciones internas + Slack
      try {
        const notifications = [];
        const requestsMapByUser = new Map();

        pendingRequests.forEach((req) => {
          const uid = req.user_id;
          if (!requestsMapByUser.has(uid)) {
            requestsMapByUser.set(uid, {
              user_id: uid,
              user: req.users,
              requests: [],
            });
          }
          requestsMapByUser.get(uid).requests.push(req);
        });

        requestsMapByUser.forEach((group, uid) => {
          const userName = group.user?.display_name || 'User';
          const datesLabels = group.requests
            .map((r) => formatDate(r.date))
            .join(', ');

          if (newStatus === 'rejected') {
            notifications.push({
              title: 'Home Office requests rejected by Team Lead',
              content: `Your Home Office requests for ${datesLabels} were rejected by your Team Lead.`,
              target_user_id: uid,
              type: 'request_result',
              is_important: false,
            });
          } else if (newStatus === 'pending_admin') {
            const baseContent = `${userName} requested Home Office for ${datesLabels} and it has been approved by their Team Lead.`;

            notifications.push({
              title: 'Home Office requests pending final admin approval',
              content: baseContent,
              target_role_id: 8,
              type: 'ho_pending_admin',
              is_important: true,
            });
          }
        });

        if (notifications.length > 0) {
          const { error: notifError } = await supabase
            .from('notifications')
            .insert(notifications);

          if (notifError) {
            console.error(
              '[handleBulkUpdate] Error insertando notificaciones bulk:',
              notifError,
            );
          }
        }

        if (newStatus === 'rejected') {
          await notifySlackMemberResult('tl_rejected', pendingRequests);
        } else if (newStatus === 'pending_admin') {
          await notifySlackNewRequests(pendingRequests);

          // Enviar correo solo una vez por usuario
          let totalEmails = 0;
          let successEmails = 0;
          let failedEmails = 0;

          const representativeRequests = Array.from(
            requestsMapByUser.values(),
          ).map((g) => g.requests[0]);

          const emailResults = await Promise.all(
            representativeRequests.map(async (req) => {
              try {
                const result = await sendHomeOfficeEmailForRequest(
                  req.id,
                  'lead_approved',
                );
                console.log(
                  '[handleBulkUpdate] Resultado correo (lead_approved) para request',
                  req.id,
                  ':',
                  result,
                );
                return { ok: true, result };
              } catch (err) {
                console.error(
                  '[handleBulkUpdate] Error enviando correo (lead_approved) para request',
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

          if (totalEmails === 0) {
            Swal.fire(
              'Updated (no emails)',
              'Requests are now pending admin approval, but no notification emails were sent. Please check email configuration.',
              'info',
            );
          } else if (successEmails > 0 && failedEmails === 0) {
            Swal.fire(
              'Updated & Emails Sent',
              'Requests are now pending admin approval and all notification emails were sent successfully.',
              'success',
            );
          } else if (successEmails > 0 && failedEmails > 0) {
            Swal.fire(
              'Updated with Warnings',
              'Requests are now pending admin approval. Some notification emails were sent, but others failed.',
              'warning',
            );
          } else {
            Swal.fire(
              'Updated but Emails Failed',
              'Requests are now pending admin approval, but emails could not be sent.',
              'warning',
            );
          }

          setPendingRequests([]);
          return;
        }

        Swal.fire(
          'Success',
          `All requests have been ${actionText}ed.`,
          'success',
        );
        setPendingRequests([]);

      } catch (notifErr) {
        console.error(
          '[handleBulkUpdate] Error inesperado en notificaciones Slack/Emails:',
          notifErr,
        );
        Swal.fire(
          'Updated',
          'Requests were updated, but there was an issue sending Slack or email notifications.',
          'warning',
        );
      }
    } finally {
      setUpdatingBulk(false);
    }
  };

  const groupedByUser = (() => {
    const map = new Map();
    for (const req of pendingRequests) {
      const uid = req.user_id;
      if (!uid) continue;
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

  const pendingLeadCount = pendingRequests.filter(
    (r) => r.status === 'pending_lead',
  ).length;

  const isBusy = updatingSingle || updatingBulk;

  return (
    <MainContent>
      {isAdminLead ? <AdminSidebar /> : <Sidebar />}
      <ContentWrapper>
        {/* Columna 1: Team Members */}
        <Column>
          <PanelTitle>Team Members</PanelTitle>
          <StatsCard>
            <StatsText>
              <span>{teamMembers.length}</span>
              <p>Total Members</p>
            </StatsText>
            <FaUser />
          </StatsCard>
          <StatsCard>
            <StatsText>
              <span>{pendingLeadCount}</span>
              <p>Pending Requests</p>
            </StatsText>
            <FaClock />
          </StatsCard>

          <EmployeeList>
            {teamMembers.length === 0 ? (
              <NoRequests>No team members found.</NoRequests>
            ) : (
              teamMembers.map((member) => (
                <EmployeeItem
                  key={member.id}
                  onClick={() => handleSelectEmployee(member)}
                  selected={selectedEmployee?.id === member.id}
                >
                  <EmployeeInfo>
                    <ProfilePic
                      src={member.photo_url || userPlaceholder}
                      alt={member.display_name}
                    />
                    <div>
                      <EmployeeName>{member.display_name}</EmployeeName>
                      <EmployeeStatus>
                        {member.locations?.location_name || 'No location'}
                      </EmployeeStatus>
                    </div>
                  </EmployeeInfo>
                </EmployeeItem>
              ))
            )}
          </EmployeeList>
        </Column>

        {/* Columna 2: Requests */}
        <Column>
          <PanelHeader>
            <PanelTitle>Requests</PanelTitle>
            <HeaderActions>
              <BulkButton
                danger
                onClick={() => handleBulkUpdate('rejected')}
                disabled={pendingLeadCount === 0 || isBusy || loading}
              >
                <FaTimes /> Reject All
              </BulkButton>
              <BulkButton
                approve
                onClick={() => handleBulkUpdate('pending_admin')}
                disabled={pendingLeadCount === 0 || isBusy || loading}
              >
                <FaCheck /> Approve All
              </BulkButton>
            </HeaderActions>
          </PanelHeader>

          <RequestsList>
            {loading ? (
              <NoRequests>Loading requests...</NoRequests>
            ) : groupedByUser.length > 0 ? (
              groupedByUser.map((group) => {
                const { user: member, requests } = group;
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
                  datesLabel = `${formattedDates[0]} + ${formattedDates.length - 1
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
                      <EmployeeInfo>
                        <ProfilePic
                          src={member?.photo_url || userPlaceholder}
                          alt={member?.display_name || 'User'}
                        />
                        <TextContainer>
                          <EmployeeName>
                            {member?.display_name || 'Unnamed user'}
                          </EmployeeName>
                          <RequestDates>{datesLabel}</RequestDates>
                        </TextContainer>
                      </EmployeeInfo>
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
                                {req.status === 'pending_lead' ? (
                                  <>
                                    <DayActionButton
                                      type="button"
                                      danger
                                      onClick={() =>
                                        handleRequestUpdate(req, 'rejected')
                                      }
                                      disabled={isBusy}
                                    >
                                      <FaTimes />
                                      <span>Reject</span>
                                    </DayActionButton>
                                  </>
                                ) : (
                                  <PendingIcon>
                                    <FaClock />
                                  </PendingIcon>
                                )}
                              </DayActions>
                            </DayRow>
                          ))}
                      </UserDaysList>
                    )}
                  </RequestItem>
                );
              })
            ) : (
              <NoRequests>No pending requests from your team.</NoRequests>
            )}
          </RequestsList>
        </Column>

        {/* Columna 3: Detalle empleado */}
        <LargeColumn>
          {!selectedEmployee ? (
            <EmptyPanel>
              <p>
                Select a team member to view their details and request history.
              </p>
            </EmptyPanel>
          ) : (
            <>
              <Header>
                <LargeProfilePic
                  src={
                    selectedEmployee.photo_url?.replace(
                      /s96-c/,
                      's200-c',
                    ) || userPlaceholder
                  }
                  alt={selectedEmployee.display_name}
                />
                <Name>{selectedEmployee.display_name}</Name>
                <Email>{selectedEmployee.email}</Email>
                <Status>
                  <StatusText>
                    {selectedEmployee.locations?.photo_url && (
                      <StatusIcon
                        src={selectedEmployee.locations.photo_url}
                        alt="Location"
                      />
                    )}
                    <span>
                      {selectedEmployee.locations?.location_name ||
                        'No location assigned'}
                    </span>
                  </StatusText>
                </Status>
              </Header>

              <DetailsGrid>
                <DetailCard>
                  <DetailHeader>
                    <FaCalendarAlt />
                    <h3>Next Approved HO Days</h3>
                  </DetailHeader>
                  {nextHODays.length === 0 ? (
                    <DetailEmpty>No upcoming Home Office days.</DetailEmpty>
                  ) : (
                    <DetailList>
                      {nextHODays.map((req) => (
                        <DetailItem key={req.id}>
                          <span>{formatDate(req.date)}</span>
                          <HistoryStatus status={req.status}>
                            {req.status}
                          </HistoryStatus>
                        </DetailItem>
                      ))}
                    </DetailList>
                  )}
                </DetailCard>

                <DetailCard>
                  <DetailHeader>
                    <FaHome />
                    <h3>Request History</h3>
                  </DetailHeader>
                  {requestHistory.length === 0 ? (
                    <DetailEmpty>No previous Home Office requests.</DetailEmpty>
                  ) : (
                    <HistoryList>
                      {requestHistory.slice(0, 10).map((req) => (
                        <HistoryItem key={req.id}>
                          <div>
                            <p>{formatDate(req.date)}</p>
                            <small>
                              Requested:{' '}
                              {new Date(req.created_at).toLocaleString()}
                            </small>
                          </div>
                          <HistoryStatus status={req.status}>
                            {req.status}
                          </HistoryStatus>
                        </HistoryItem>
                      ))}
                    </HistoryList>
                  )}
                </DetailCard>

                <DetailCard>
                  <DetailHeader>
                    <FaDesktop />
                    <h3>Assigned Devices</h3>
                  </DetailHeader>
                  {assignedDevices.length === 0 ? (
                    <DetailEmpty>No devices assigned.</DetailEmpty>
                  ) : (
                    <DetailList>
                      {assignedDevices.map((dev) => (
                        <DetailItem key={dev.id}>
                          <div>
                            <p>
                              {dev.asset_tag || 'N/A'} –{' '}
                              {dev.name || dev.model || 'Unknown Device'}
                            </p>
                            <small>
                              Status: {dev.status} –{' '}
                              {dev.locations?.location_name || 'Unknown'}
                            </small>
                          </div>
                        </DetailItem>
                      ))}
                    </DetailList>
                  )}
                </DetailCard>
              </DetailsGrid>
            </>
          )}
        </LargeColumn>
      </ContentWrapper>
    </MainContent>
  );
}

// === ESTILOS ===

const MainContent = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr;
  width: 100vw;
  height: 100vh;
  background-color: #f8f8f8;
  overflow: hidden;
`;

const ContentWrapper = styled.div`
  display: grid;
  grid-template-columns: 0.8fr 1fr 1.2fr;
  gap: 20px;
  padding: 20px;
  overflow: hidden;
  height: 100vh;
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 95vh;
  background-color: #ffffff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  gap: 15px;
`;

const LargeColumn = styled(Column)`
  grid-column: span 1;
`;

const PanelTitle = styled.h2`
  font-size: 1.7em;
  font-weight: bold;
  margin: 0;
  white-space: nowrap;
  flex-shrink: 0;
`;

const StatsCard = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #2B2F38;
  color: #ffffff;
  border-radius: 8px;
  padding: 10px 15px;
  gap: 10px;
`;

const StatsText = styled.div`
  span {
    font-size: 1.4em;
    font-weight: bold;
  }

  p {
    margin: 0;
    font-size: 0.9em;
  }
`;

const EmployeeList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  flex-grow: 1;
`;

const EmployeeItem = styled.button`
  border: none;
  background-color: ${(props) => (props.selected ? '#e0e4f7' : '#f8f8f8')};
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  transition: background 0.2s ease;
  gap: 8px;

  &:hover {
    background-color: #e6e6e6;
  }
`;

const EmployeeInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ProfilePic = styled.img`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
`;

const EmployeeName = styled.p`
  font-weight: bold;
  margin: 0;
  font-size: 0.9em;
  word-break: break-word;
`;

const EmployeeStatus = styled.p`
  font-size: 0.8em;
  color: #8c8c8c;
  margin: 2px 0 0 0;
`;

const PanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;

  @media (max-width: 1440px) {
    align-items: flex-start;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 4px;
  flex-shrink: 1;
  flex-direction: column;
  width: 100%;

  @media (min-width: 1441px) {
    flex-direction: row;
    flex-grow: 1;
    margin-left: 10px;
    max-width: none;
  }
`;

const BulkButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: none;
  border-radius: 6px;
  cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
  font-weight: bold;
  color: #fff;
  background-color: ${(props) =>
    props.danger ? '#dc3545' : props.approve ? '#28a745' : '#6c757d'};
  transition: all 0.2s ease;
  white-space: nowrap;
  font-size: 0.7em;
  padding: 3px;
  width: 100%;

  svg {
    font-size: 1em;
  }

  &:hover {
    opacity: 0.85;
  }

  &:disabled {
    background-color: #ccc;
    opacity: 0.7;
    cursor: not-allowed;
  }

  @media (min-width: 1441px) {
    font-size: 0.8em;
    padding: 8px 5px;
    flex: 1;

    svg {
      font-size: 0.9em;
    }
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
  display: flex;
  flex-direction: column;
  padding: 10px;
  background-color: #f0f0f0;
  border-radius: 8px;
  gap: 7px;
`;

const RequestDates = styled.p`
  font-size: 0.8em;
  color: #555;
  margin: 2px 0 0 0;
  word-break: break-word;
`;

const Actions = styled.div`
  display: flex;
  gap: 10px;
  flex-shrink: 0;
`;

const TextContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const ActionButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.2rem;
  color: ${(props) => props.color};
  padding: 5px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;

  &:hover {
    background-color: rgba(0, 0, 0, 0.1);
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;

const PendingIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  color: #f7d000;
  padding: 5px;
`;

const NoRequests = styled.p`
  text-align: center;
  color: #8c8c8c;
  padding: 20px;
  font-style: italic;
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
  margin-top: 4px;
  margin-bottom: 4px;
`;

const DayLabel = styled.span`
  font-size: 0.85em;
  color: #333;
`;

const DayActions = styled.div`
  display: flex;
  gap: 6px;
`;

const DayActionButton = styled.button`
  border: none;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 0.75em;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: ${(props) =>
    props.danger ? '#dc3545' : props.approve ? '#28a745' : '#6c757d'};
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

const EmptyPanel = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  text-align: center;
  color: #6a6a6a;
  font-style: italic;
  font-size: 1.1em;
  padding: 20px;
`;

const Header = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
  flex-shrink: 0;
`;

const LargeProfilePic = styled.img`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
  margin-bottom: 8px;
`;

const Name = styled.h2`
  font-size: 1.8em;
  font-weight: bold;
  margin: 0;
  padding: 0 10px;
  word-break: break-word;
`;

const Email = styled.p`
  color: #8c8c8c;
  margin: 5px 0 0 0;
  padding: 0 10px;
  word-break: break-all;
`;

const Status = styled.div`
  margin-top: 10px;
  display: flex;
  align-items: center;
`;

const StatusText = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #000;
`;

const StatusIcon = styled.img`
  width: 18px;
  height: 18px;
  border-radius: 4px;
  object-fit: cover;
`;

const DetailsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 15px;
  overflow-y: auto;
  padding-right: 5px;
`;

const DetailCard = styled.div`
  background: #ffffff;
  border-radius: 8px;
  padding: 10px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.05);
`;

const DetailHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 10px;

  h3 {
    margin: 0;
    font-size: 1em;
  }

  svg {
    font-size: 1.1em;
  }
`;

const DetailEmpty = styled.p`
  margin: 0;
  color: #8c8c8c;
  font-style: italic;
  font-size: 0.9em;
`;

const DetailList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const DetailItem = styled.li`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 0.9em;

  small {
    color: #777;
  }
`;

const HistoryList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const HistoryItem = styled.li`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 0.9em;

  p {
    margin: 0;
    font-weight: 500;
  }

  small {
    color: #777;
  }
`;

const HistoryStatus = styled.span`
  font-size: 0.9em;
  font-weight: bold;
  text-transform: capitalize;
  color: ${(props) => {
    if (props.status === 'approved') return '#28a745';
    if (props.status === 'pending_lead' || props.status === 'pending_admin')
      return '#ffc107';
    if (props.status === 'rejected') return '#dc3545';
    return '#6a6a6a';
  }};
`;