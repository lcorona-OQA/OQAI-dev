import React, { useEffect, useMemo, useState, useCallback } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { FaSearch, FaHistory, FaUserClock, FaEdit, FaSync, FaExclamationTriangle } from 'react-icons/fa';
import { supabase } from '../supabase/supabase.config';
import { UserAuth } from '../context/AuthContext';
import userPlaceholder from '../assets/user-placeholder.png';
import { HoDaysEditorModal } from './HoDaysEditorModal';
import Swal from 'sweetalert2';

// --- UTILS ---
const normalize = (str) =>
  (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const formatReadableDate = (dateString) => {
  if (!dateString) return 'N/A';
  // Aseguramos que la fecha se interprete localmente o UTC según necesidad
  const d = new Date(`${dateString}T00:00:00`); 
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

// Hook de Debounce para la búsqueda
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export function RequestsPanel() {
  const { user: currentUser } = UserAuth();

  // Estados de datos
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false); // Para feedback visual de Edge Functions
  
  // Estados de UI
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [editingUser, setEditingUser] = useState(null);

  // Permisos: Roles 1, 4, 8
  const canEditHoDays = currentUser && [1, 4, 8].includes(currentUser.role_id);

  // =========================
  // 1. CARGAR DATOS
  // =========================
  const fetchHistory = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('home_office_requests')
        .select(`
          id, date, status, user_id, created_at,
          users (
            id, display_name, email, photo_url,
            teams ( team_name, photo_url )
          )
        `)
        .order('date', { ascending: false })
        .limit(600); // Límite aumentado ligeramente

      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error('[RequestsPanel] Error:', err);
      if (!isBackground) {
        Swal.fire({
            icon: 'error',
            title: 'Connection Error',
            text: 'Could not load requests history.',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
        });
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();

    const channel = supabase
      .channel('public:home_office_requests:panel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_office_requests' }, 
        () => fetchHistory(true) // Refresco silencioso
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchHistory]);

  // =========================
  // 2. SINCRONIZACIÓN ROBUSTA
  // =========================
  const handlePostUpdate = async () => {
    // 1. Refrescar UI Inmediatamente (para que el admin vea los cambios ya)
    await fetchHistory(true);

    if (!editingUser?.id) return;
    const targetUserId = editingUser.id;

    setIsSyncing(true); // Mostrar spinner

    try {
      // --- FIX CRÍTICO: Obtener token de sesión actual ---
      // Esto soluciona el error 401 Unauthorized en las Edge Functions
      const { data: { session } } = await supabase.auth.getSession();
      const authHeaders = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      console.log(`[Sync] Starting integrations for user ${targetUserId}...`);

      // 2. Disparar Edge Functions en paralelo

      // A) Calendar Sync
      const syncCalendarPromise = supabase.functions.invoke('sync-calendar', {
        body: { userId: targetUserId },
        headers: authHeaders // <--- FIX: Enviar headers de auth
      });

      // B) Slack Sync (Solo si tiene dispositivos asignados)
      let slackPromise = Promise.resolve({ data: null, error: null });

      const { data: devices } = await supabase
        .from('devices')
        .select('id, asset_tag, name, model, device_type')
        .eq('assigned_user_id', targetUserId);

      if (devices && devices.length > 0) {
        slackPromise = supabase.functions.invoke('device-taken-ho', {
          body: {
            userId: targetUserId,
            // Mapeamos los dispositivos para que la edge function sepa qué emojis usar
            devices: devices.map(d => ({
              id: d.id,
              asset_tag: d.asset_tag,
              name: d.name || d.model,
              device_type: d.device_type
            })),
            is_date_update: true // <--- FIX: Avisar que es cambio de fecha, no entrega de equipos
          },
          headers: authHeaders // <--- FIX: Enviar headers de auth
        });
      }

      // 3. Esperar resultados
      const [calendarRes, slackRes] = await Promise.allSettled([syncCalendarPromise, slackPromise]);

      // 4. Análisis de Errores
      // Nota: Supabase functions a veces devuelven status 'fulfilled' pero con { error: '...' } en el body
      const calendarError = calendarRes.status === 'rejected'
        ? calendarRes.reason
        : calendarRes.value.error;

      const slackError = slackRes.status === 'rejected'
        ? slackRes.reason
        : slackRes.value.error;

      if (calendarError || slackError) {
        console.warn('[Sync] Some integrations failed:', { calendarError, slackError });
        Swal.fire({
          icon: 'warning',
          title: 'Saved with warnings',
          text: 'Days updated, but Calendar/Slack sync might be delayed.',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 4000
        });
      } else {
        console.log('[Sync] All integrations successful.');
        // Feedback positivo sutil
        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
        Toast.fire({ icon: 'success', title: 'Schedule & Slack synced' });
      }

    } catch (error) {
      console.error("[Sync] Critical error:", error);
      Swal.fire({
          icon: 'error',
          title: 'Sync Error',
          text: 'Critical error triggering integrations.',
          toast: true,
          position: 'top-end',
          timer: 4000
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // =========================
  // 3. PROCESAMIENTO DE DATOS
  // =========================
  const groupedByUser = useMemo(() => {
    const map = new Map();
    for (const row of requests) {
      if (!row.users) continue;
      const uid = row.users.id;
      if (!map.has(uid)) {
        map.set(uid, { user: row.users, requests: [] });
      }
      map.get(uid).requests.push(row);
    }

    const arr = Array.from(map.values());
    // Ordenar fechas internamente
    arr.forEach(g => g.requests.sort((a, b) => new Date(a.date) - new Date(b.date)));
    return arr;
  }, [requests]);

  const filteredGroups = useMemo(() => {
    const term = normalize(debouncedSearchTerm);
    if (!term) return groupedByUser;

    return groupedByUser.filter(({ user }) => {
      const name = normalize(user.display_name);
      const email = normalize(user.email);
      const team = normalize(user.teams?.[0]?.team_name || user.teams?.team_name);
      return name.includes(term) || email.includes(term) || team.includes(term);
    });
  }, [groupedByUser, debouncedSearchTerm]);

  // =========================
  // 4. RENDER
  // =========================
  return (
    <PanelContainer>
      <PanelHeader>
        <HeaderTop>
            <PanelTitle>
                <FaHistory /> Requests History
                {isSyncing && <SyncBadge><FaSync className="spin" /> Syncing...</SyncBadge>}
            </PanelTitle>
            
        </HeaderTop>

        <SearchBar>
            <FaSearch className="icon" />
            <input
                type="text"
                placeholder="Search by name, team or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </SearchBar>
      </PanelHeader>

      <ContentArea>
        {loading && requests.length === 0 ? (
           <SkeletonLoader />
        ) : filteredGroups.length === 0 ? (
           <EmptyState>
               <FaSearch size={32} style={{opacity: 0.2, marginBottom: 10}}/>
               <p>No records found matching "{searchTerm}"</p>
           </EmptyState>
        ) : (
          <UsersList>
            {filteredGroups.map(({ user, requests }) => {
              const approved = requests.filter(r => r.status === 'approved');
              const pending = requests.filter(r => ['pending','pending_admin'].includes(r.status));
              const others = requests.filter(r => ['rejected','cancelled_by_admin','cancelled_by_user'].includes(r.status));
              
              // Últimos 5 aprobados
              const recentApproved = approved.slice(-5).reverse(); 

              return (
                <UserCard key={user.id}>
                  <CardMain>
                    {/* User Info Section */}
                    <UserInfo>
                      <Avatar src={user.photo_url || userPlaceholder} alt="User" />
                      <UserDetails>
                        <UserName>{user.display_name || 'Unknown User'}</UserName>
                        <UserMeta>
                          {user.teams?.team_name && <Badge>{user.teams.team_name}</Badge>}
                          <span className="email">{user.email}</span>
                        </UserMeta>
                      </UserDetails>
                    </UserInfo>

                    {/* Stats & Actions Section */}
                    <CardActions>
                        <StatsGroup>
                            <StatBox type="approved" title="Approved Days">
                                <span className="label">Approved</span>
                                <span className="value">{approved.length}</span>
                            </StatBox>
                            {pending.length > 0 && (
                                <StatBox type="pending" title="Pending Days">
                                    <span className="label">Pending</span>
                                    <span className="value">{pending.length}</span>
                                </StatBox>
                            )}
                            {others.length > 0 && (
                                <StatBox type="other" title="Rejected/Cancelled">
                                    <span className="label">Other</span>
                                    <span className="value">{others.length}</span>
                                </StatBox>
                            )}
                        </StatsGroup>

                        {canEditHoDays && (
                            <EditButton onClick={() => setEditingUser(user)}>
                                <FaEdit /> <span>Edit</span>
                            </EditButton>
                        )}
                    </CardActions>
                  </CardMain>

                  {/* Recent Dates Section */}
                  <RecentActivity>
                     <ActivityHeader>
                        <FaUserClock /> Recent Approved
                     </ActivityHeader>
                     {approved.length === 0 ? (
                        <NoActivity>No approved days recorded.</NoActivity>
                     ) : (
                        <ChipsContainer>
                            {recentApproved.map(r => (
                                <DateChip key={r.id}>{formatReadableDate(r.date)}</DateChip>
                            ))}
                            {approved.length > 5 && (
                                <MoreChip>+{approved.length - 5} more</MoreChip>
                            )}
                        </ChipsContainer>
                     )}
                  </RecentActivity>
                </UserCard>
              );
            })}
          </UsersList>
        )}
      </ContentArea>

      <HoDaysEditorModal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        user={editingUser}
        onUpdated={handlePostUpdate}
      />
    </PanelContainer>
  );
}

// =================== STYLED COMPONENTS (RESPONSIVE) ===================

const spinAnimation = keyframes` 100% { transform: rotate(360deg); } `;

const PanelContainer = styled.div`
  background-color: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
`;

const PanelHeader = styled.div`
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #fff;
  z-index: 10;
`;

const HeaderTop = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const PanelTitle = styled.h2`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.4rem;
  font-weight: 700;
  color: #111827;
  margin: 0;

  svg { color: #3b5bdb; }
`;

const SyncBadge = styled.span`
    font-size: 0.75rem;
    font-weight: 600;
    color: #f59f00;
    background: #fff9db;
    padding: 2px 8px;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    .spin { animation: ${spinAnimation} 1s linear infinite; }
`;

const RefreshButton = styled.button`
    background: transparent;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    padding: 8px;
    border-radius: 50%;
    transition: all 0.2s;
    
    &:hover { background: #f3f4f6; color: #3b5bdb; }
    .spin { animation: ${spinAnimation} 1s linear infinite; }
`;

const SearchBar = styled.div`
  display: flex;
  align-items: center;
  background-color: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 12px;
  transition: all 0.2s;

  &:focus-within {
    border-color: #3b5bdb;
    box-shadow: 0 0 0 3px rgba(59,91,219,0.1);
  }

  .icon { color: #9ca3af; margin-right: 8px; }
  
  input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 0.95rem;
    color: #374151;
    outline: none;
    &::placeholder { color: #9ca3af; }
  }
`;

const ContentArea = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: #f8fafc;
`;

const UsersList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

// --- RESPONSIVE CARD ---
const UserCard = styled.div`
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  transition: transform 0.1s, box-shadow 0.1s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    border-color: #cbd5e1;
  }
`;

const CardMain = styled.div`
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap; // CLAVE para responsividad
  gap: 16px;

  @media (max-width: 600px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 200px;
`;

const Avatar = styled.img`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #f1f5f9;
`;

const UserDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const UserName = styled.span`
  font-weight: 700;
  font-size: 1rem;
  color: #1e293b;
`;

const UserMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  
  .email {
    font-size: 0.8rem;
    color: #64748b;
  }
`;

const Badge = styled.span`
  background: #e0e7ff;
  color: #4338ca;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
`;

const CardActions = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;

  @media (max-width: 600px) {
    width: 100%;
    justify-content: space-between;
    border-top: 1px solid #f1f5f9;
    padding-top: 12px;
  }
`;

const StatsGroup = styled.div`
  display: flex;
  gap: 8px;
`;

const StatBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 60px;
  padding: 4px 8px;
  border-radius: 8px;
  background: ${p => p.type === 'approved' ? '#f0fdf4' : p.type === 'pending' ? '#fffbeb' : '#fef2f2'};
  border: 1px solid ${p => p.type === 'approved' ? '#dcfce7' : p.type === 'pending' ? '#fef3c7' : '#fee2e2'};

  .label { font-size: 0.65rem; color: #64748b; text-transform: uppercase; }
  .value { font-size: 1rem; font-weight: 700; color: #0f172a; }
`;

const EditButton = styled.button`
  background: #3b5bdb;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.2s;

  &:hover { background: #2f4896; }
`;

const RecentActivity = styled.div`
  background: #f8fafc;
  padding: 10px 16px;
  border-top: 1px dashed #cbd5e1;
  display: flex;
  align-items: center;
  gap: 12px;
  
  @media (max-width: 600px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
`;

const ActivityHeader = styled.div`
  font-size: 0.8rem;
  color: #64748b;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
`;

const ChipsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const DateChip = styled.span`
  background: white;
  border: 1px solid #e2e8f0;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  color: #334155;
  font-weight: 500;
`;

const MoreChip = styled(DateChip)`
  background: #eff6ff;
  border-color: #dbeafe;
  color: #1d4ed8;
`;

const NoActivity = styled.span`
  font-size: 0.8rem;
  color: #94a3b8;
  font-style: italic;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #94a3b8;
  height: 100%;
  
  p { margin: 0; font-size: 1rem; }
`;

const SkeletonLoader = () => (
    <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
        {[1,2,3].map(i => (
            <div key={i} style={{height:'100px', background:'#f1f5f9', borderRadius:'12px', animation:'pulse 1.5s infinite'}}></div>
        ))}
        <style>{`@keyframes pulse { 0% {opacity: 0.6;} 50% {opacity: 1;} 100% {opacity: 0.6;} }`}</style>
    </div>
);