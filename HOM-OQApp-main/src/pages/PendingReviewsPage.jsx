import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { InventSidebar } from '../components/InventSidebar';
import { UserAuth } from '../context/AuthContext';
import { supabase } from '../supabase/supabase.config';
import {
  FaSearch,
  FaFilter,
  FaCheckCircle,
  FaExclamationTriangle,
  FaTimes,
  FaSyncAlt,
  FaUserCheck,
  FaBoxOpen
} from 'react-icons/fa';
import Swal from 'sweetalert2';

// ================== CONFIG & CONSTANTS ==================

const REVIEW_TIMEOUT_MINUTES = Number(
  import.meta?.env?.VITE_PENDING_REVIEW_TIMEOUT_MINUTES ?? 180
);

// ================== UTILS ==================

const normalizeString = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ç]/g, 'c');
};

const formatCompactName = (fullName) => {
  if (!fullName) return 'Unassigned';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 4) return `${parts[1]} ${parts[2]}`;
  if (parts.length === 3) return `${parts[0]} ${parts[1]}`;
  return fullName;
};

/**
 * Determina visualmente si una revisión ha tardado demasiado.
 */
const isReviewExpired = (device) => {
  if (!device) return false;

  // Ajustar lógica según reglas de negocio (ej. solo Home Office ID 2)
  const locationId = Number(device.location_id);
  // if (locationId !== 2) return false; // Descomentar si solo aplica a HO

  const status = device.status;
  if (status === 'pending_review_escalated') return true;
  if (status !== 'pending_review') return false;

  if (!device.updated_at) return false;
  const updatedAt = new Date(device.updated_at);
  if (Number.isNaN(updatedAt.getTime())) return false;

  const diffMs = Date.now() - updatedAt.getTime();
  const timeoutMs = REVIEW_TIMEOUT_MINUTES * 60 * 1000;

  return diffMs >= timeoutMs;
};

const getActorFromUser = (user) => ({
  id: user?.id ?? null,
  email: user?.email ?? null,
  displayName: user?.display_name ?? user?.displayName ?? null,
  roleId: user?.role_id ?? null,
  teamId: user?.team_id ?? null,
  locationId: user?.location_id ?? null,
});

/**
 * Sistema robusto de auditoría con fallback
 */
const auditEvent = async ({
  actor,
  actionType,
  entityType,
  entityId,
  summary,
  metadata,
  success = true,
  errorMessage = null,
  source = 'ui:PendingReviewsPage',
}) => {
  const rpcPayload = {
    p_action_type: actionType,
    p_entity_type: entityType,
    p_entity_id: entityId ?? null,
    p_summary: summary,
    p_metadata: metadata ?? {},
    p_success: success,
    p_error_message: errorMessage,
    p_actor_id: actor?.id ?? null,
    p_actor_email: actor?.email ?? null,
    p_actor_display_name: actor?.displayName ?? null,
    p_actor_role_id: actor?.roleId ?? null,
    p_actor_team_id: actor?.teamId ?? null,
    p_actor_location_id: actor?.locationId ?? null,
    p_source: source,
  };

  try {
    const { error } = await supabase.rpc('insert_audit_event', rpcPayload);
    if (!error) return;

    console.warn('[Audit] RPC failed, trying fallback insert:', error);
    
    // Fallback directo a la tabla
    await supabase.from('audit_events').insert({
      action_type: actionType,
      entity_type: entityType,
      entity_id: entityId ?? null,
      summary,
      metadata: metadata ?? {},
      success,
      error_message: errorMessage,
      source,
      actor_user_id: actor?.id ?? null,
    });
  } catch (err) {
    console.error('[Audit] Critical failure:', err);
  }
};

// ================== COMPONENTS: REVIEW MODAL ==================

const ReviewModal = ({ isOpen, onClose, device, onUpdate }) => {
  const { user } = UserAuth();
  const [isIssueMenuOpen, setIsIssueMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset menu on open
  useEffect(() => {
    if (isOpen) setIsIssueMenuOpen(false);
  }, [isOpen]);

  if (!isOpen || !device) return null;

  /**
   * Maneja la actualización del dispositivo de forma transaccional.
   * @param {string} newStatus - Nuevo estado ('available', 'assigned', 'damaged')
   * @param {string} logAction - Acción para el log ('Returned', 'Verified')
   * @param {string} logDesc - Descripción
   * @param {boolean} keepUser - TRUE: Aprobar (mantiene usuario). FALSE: Retornar (quita usuario).
   */
  const handleAction = async (newStatus, logAction, logDesc, keepUser = false) => {
    if (submitting) return;
    setSubmitting(true);

    const actor = getActorFromUser(user);
    const prevSnapshot = { 
        status: device.status, 
        user: device.users?.display_name,
        location: device.locations?.location_name 
    };

    // Lógica para roles altos: Limpiar flags de escalamiento si se resuelve
    const shouldClearEscalationFlags =
      user?.role_id === 9 &&
      device.status === 'pending_review_escalated' &&
      newStatus !== 'pending_review_escalated';

    try {
      // 1. Construir Payload
      const updateData = {
        status: newStatus,
        // Limpieza de flags
        ...(shouldClearEscalationFlags
          ? { escalated_at: null, timeout_email_sent: null }
          : {}),
        
        // --- LÓGICA DE ASIGNACIÓN ---
        ...(!keepUser 
            ? { 
                assigned_user_id: null, // Desasignar
                location_id: 1,         // Mover a Office
                fixed_assignment: false // Quitar flag de fijo si existía
              } 
            : {} // Si keepUser=true, NO tocamos usuario ni ubicación (se queda como está)
        )
      };

      // 2. Ejecutar Update (Atomic)
      const { data: updatedRows, error: updateError } = await supabase
        .from('devices')
        .update(updateData)
        .eq('id', device.id)
        .select('id, status');

      if (updateError) throw updateError;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('Device not found or permission denied.');
      }

      // 3. Insertar Log (Best effort)
      const logLocation = keepUser ? (device.location_id === 2 ? 'Home Office' : 'User Possession') : 'Office';
      const finalLogDesc = keepUser 
        ? `${logDesc} (Verified/Approved)`
        : logDesc;

      const { error: logError } = await supabase.from('device_logs').insert({
        device_id: device.id,
        user_id: user?.id ?? null,
        action: logAction,
        description: finalLogDesc,
        location: logLocation,
      });
      
      if (logError) console.warn('[ReviewModal] Log insert warning:', logError);

      // 4. Auditoría
      await auditEvent({
        actor,
        actionType: 'device_review_resolved',
        entityType: 'device',
        entityId: device.id,
        summary: `[PendingReviews] ${logAction} - ${device.asset_tag}`,
        metadata: { 
          prev: prevSnapshot, 
          newStatus, 
          keepUser,
          clearedEscalation: shouldClearEscalationFlags 
        },
        success: true,
      });

      // 5. Feedback UI
      Swal.fire({
        title: keepUser ? 'Approved' : 'Returned',
        text: `Device marked as ${newStatus}. ${keepUser ? 'User remains assigned.' : 'Returned to inventory.'}`,
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });

      await onUpdate?.();
      onClose?.();

    } catch (err) {
      console.error('[ReviewModal] Error:', err);
      
      await auditEvent({
        actor,
        actionType: 'device_review_error',
        entityType: 'device',
        entityId: device.id,
        summary: `Error updating review for ${device.asset_tag}`,
        metadata: { error: err.message },
        success: false
      });

      Swal.fire('Error', 'Could not update device status.', 'error');
    } finally {
      setSubmitting(false);
      setIsIssueMenuOpen(false);
    }
  };

  return (
    <ModalBackdrop onClick={onClose} role="dialog" aria-modal="true">
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <h3>Review: {device.asset_tag}</h3>
          <CloseButton onClick={onClose} disabled={submitting}><FaTimes /></CloseButton>
        </ModalHeader>

        <ModalBody>
          <DetailGrid>
            <DetailItem>
              <Label>Model</Label>
              <Value>{device.name || device.model}</Value>
            </DetailItem>
            <DetailItem>
              <Label>Assigned To</Label>
              <Value highlight>{device.users?.display_name || 'Unassigned'}</Value>
            </DetailItem>
            <DetailItem>
              <Label>Current Status</Label>
              <Value status>{device.status}</Value>
            </DetailItem>
            <DetailItem>
              <Label>Location</Label>
              <Value>{device.locations?.location_name || 'Unknown'}</Value>
            </DetailItem>
          </DetailGrid>
          
          <InstructionText>
            <strong>Approve:</strong> Verification successful, user keeps device.<br/>
            <strong>Return:</strong> Device physically returned to inventory.
          </InstructionText>
        </ModalBody>

        <ModalFooter>
          {/* BOTÓN 1: RETURN (Verde) - Desasigna */}
          <ActionButton
            color="#28a745"
            disabled={submitting}
            onClick={() => handleAction('available', 'Returned', 'Device returned to inventory', false)}
            title="Unassign and move to Office"
          >
            <FaBoxOpen /> Return
          </ActionButton>

          {/* BOTÓN 2: APPROVE (Azul) - Mantiene Asignación */}
          <ActionButton
            color="#3b5bdb"
            disabled={submitting}
            onClick={() => handleAction('assigned', 'Verified', 'Assignment verified', true)}
            title="User keeps device"
          >
            <FaUserCheck /> Approve
          </ActionButton>

          {/* BOTÓN 3: ISSUE (Rojo) - Desplegable */}
          <IssueContainer>
            <ActionButton
              color="#dc3545"
              disabled={submitting}
              onClick={() => setIsIssueMenuOpen((prev) => !prev)}
            >
              <FaExclamationTriangle /> Issue
            </ActionButton>

            {isIssueMenuOpen && (
              <>
                <MenuOverlay onClick={() => setIsIssueMenuOpen(false)} />
                <DropdownMenu>
                  <MenuItem onClick={() => handleAction('damaged', 'Reported Damaged', 'Returned damaged', false)}>
                    Damaged (Return)
                  </MenuItem>
                  <MenuItem onClick={() => handleAction('lost', 'Reported Lost', 'Reported lost', false)}>
                    Lost (Unassign)
                  </MenuItem>
                  <MenuItem onClick={() => handleAction('maintenance', 'Maintenance', 'Sent to maintenance', false)}>
                    Maintenance
                  </MenuItem>
                </DropdownMenu>
              </>
            )}
          </IssueContainer>
        </ModalFooter>
      </ModalContent>
    </ModalBackdrop>
  );
};

// ================== PAGE COMPONENT ==================

export function PendingReviewsPage() {
  const { user } = UserAuth();
  
  const [pendingDevices, setPendingDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isRole3 = user?.role_id === 3;

  const fetchPendingReviews = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      // ⚠️ USAMOS LA FK EXPLÍCITA PARA EVITAR PGRST201
      const { data, error } = await supabase
        .from('devices')
        .select(`
          *,
          users:users!devices_assigned_user_id_fkey (
            display_name,
            teams ( photo_url )
          ),
          locations (location_name)
        `)
        .in('status', ['pending_review', 'pending_review_escalated'])
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[PendingReviews] Fetch error:', error);
        if (!silent) setPendingDevices([]);
      } else {
        setPendingDevices(data || []);
      }
    } catch (err) {
      console.error('[PendingReviews] Unexpected error:', err);
    } finally {
      if (!silent) setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  // Carga inicial y polling
  useEffect(() => {
    fetchPendingReviews({ silent: false });
    const interval = setInterval(() => {
        if(!document.hidden) fetchPendingReviews({ silent: true });
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchPendingReviews]);

  // Filtrado local
  const filteredDevices = useMemo(() => {
    const term = normalizeString(searchTerm);
    if (!term) return pendingDevices;

    return pendingDevices.filter((dev) => {
      const tag = normalizeString(dev.asset_tag);
      const user = normalizeString(dev.users?.display_name);
      const model = normalizeString(dev.name || dev.model);
      return tag.includes(term) || user.includes(term) || model.includes(term);
    });
  }, [pendingDevices, searchTerm]);

  const handleOpenReview = (device) => {
    setSelectedDevice(device);
    setIsModalOpen(true);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <Container>
      <InventSidebar />
      <ContentWrapper>
        <HeaderSection>
          <HeaderTopRow>
            <Title>Pending Reviews</Title>
            <RightActions>
               <RefreshButton 
                 onClick={() => fetchPendingReviews({ silent: false })} 
                 disabled={loading || refreshing}
                 title="Refresh Data"
               >
                 <FaSyncAlt className={refreshing ? 'spin' : ''} />
               </RefreshButton>
            </RightActions>
          </HeaderTopRow>

          <SearchContainer>
            <SearchIconWrapper><FaSearch /></SearchIconWrapper>
            <SearchInput
              type="text"
              placeholder="Search by tag, user or model..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <FilterButton><FaFilter /></FilterButton>
          </SearchContainer>
        </HeaderSection>

        <TableContainer>
          <TableHeader>
            <Th>Asset Tag</Th>
            <Th>Assigned User</Th>
            <Th>Device Model</Th>
            <Th>Updated</Th>
            <Th>Location</Th>
            <Th className="center">Team</Th>
            <Th className="center">Action</Th>
          </TableHeader>

          <TableBody>
            {loading ? (
              <StateRow>Loading reviews...</StateRow>
            ) : filteredDevices.length > 0 ? (
              filteredDevices.map((device) => {
                const expired = isReviewExpired(device);
                // Si es rol 3 y está expirado, deshabilitar (regla opcional)
                const actionDisabled = isRole3 && expired;
                
                const teamData = device.users?.teams;
                const teamPhotoUrl = Array.isArray(teamData) 
                  ? teamData[0]?.photo_url 
                  : teamData?.photo_url;

                return (
                  <TableRow key={device.id} $isExpired={expired}>
                    <Td className="tag">{device.asset_tag || 'N/A'}</Td>
                    <Td className="name">{formatCompactName(device.users?.display_name)}</Td>
                    <Td>{device.name || device.model}</Td>
                    <Td>{formatDate(device.updated_at)}</Td>
                    <Td>{device.locations?.location_name || 'N/A'}</Td>

                    <Td className="center">
                      {teamPhotoUrl ? (
                        <TeamLogo src={teamPhotoUrl} alt="Team" />
                      ) : (
                        <span style={{color: '#ddd'}}>-</span>
                      )}
                    </Td>

                    <Td className="center">
                      <ReviewButton
                        disabled={actionDisabled}
                        onClick={() => !actionDisabled && handleOpenReview(device)}
                        title={actionDisabled ? "Review expired" : "Review device"}
                      >
                        Review
                      </ReviewButton>
                    </Td>
                  </TableRow>
                );
              })
            ) : (
              <StateRow>
                {searchTerm ? 'No matches found.' : 'No devices pending review.'}
              </StateRow>
            )}
          </TableBody>
        </TableContainer>

        <ReviewModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedDevice(null);
          }}
          device={selectedDevice}
          onUpdate={() => fetchPendingReviews({ silent: true })}
        />
      </ContentWrapper>
    </Container>
  );
}

// ================== STYLES ==================

const Container = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr;
  background-color: #f8f9fa;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
`;

const ContentWrapper = styled.div`
  padding: 40px;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
`;

// --- HEADER ---
const HeaderSection = styled.div`
  margin-bottom: 24px;
  flex-shrink: 0;
`;

const HeaderTopRow = styled.div`
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;
`;

const Title = styled.h1`
  font-size: 2.2rem; font-weight: 700; color: #1a1a1a; margin: 0;
`;

const RightActions = styled.div`
  display: flex; gap: 10px;
`;

const RefreshButton = styled.button`
  width: 40px; height: 40px; border-radius: 8px; border: 1px solid #e1e4e8;
  background: white; color: #555; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
  &:hover { background: #f1f3f5; color: #333; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { 100% { transform: rotate(360deg); } }
`;

const SearchContainer = styled.div`
  display: flex; align-items: center;
  background-color: #fff; border-radius: 8px;
  padding: 0 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  border: 1px solid #e1e4e8; max-width: 500px; height: 45px;
`;

const SearchIconWrapper = styled.div` color: #adb5bd; margin-right: 10px; `;
const SearchInput = styled.input`
  border: none; background: none; flex-grow: 1; font-size: 0.95rem; outline: none; color: #333;
`;
const FilterButton = styled.button`
  background: none; border: none; color: #adb5bd; cursor: pointer;
  &:hover { color: #495057; }
`;

// --- TABLE ---
const TableContainer = styled.div`
  background-color: white; border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.03);
  border: 1px solid #eef0f2;
  overflow: hidden; flex-grow: 1;
  display: flex; flex-direction: column;
`;

const gridCols = '0.8fr 1.2fr 1.5fr 1fr 1fr 0.6fr 100px';

const TableHeader = styled.div`
  display: grid; grid-template-columns: ${gridCols};
  background-color: #1d2129; padding: 16px 24px;
  border-bottom: 1px solid #e1e4e8;
`;

const Th = styled.div`
  color: #fff; font-weight: 600; font-size: 0.85rem; letter-spacing: 0.02em;
  text-transform: uppercase;
  &.center { text-align: center; }
`;

const TableBody = styled.div`
  overflow-y: auto; flex-grow: 1;
`;

const TableRow = styled.div`
  display: grid; grid-template-columns: ${gridCols};
  padding: 16px 24px; border-bottom: 1px solid #f1f3f5;
  align-items: center; background-color: white;
  transition: background 0.2s;
  
  /* Expired highlighting */
  border-left: 4px solid ${props => props.$isExpired ? '#fcc419' : 'transparent'};
  background-color: ${props => props.$isExpired ? '#fff9db' : 'white'};

  &:hover {
    background-color: ${props => props.$isExpired ? '#fff3bf' : '#f8f9fa'};
  }
`;

const Td = styled.div`
  font-size: 0.9rem; color: #495057;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 15px;
  
  &.tag { font-family: 'Roboto Mono', monospace; font-weight: 500; color: #212529; }
  &.name { font-weight: 500; color: #343a40; }
  &.center { display: flex; justify-content: center; padding-right: 0; }
`;

const StateRow = styled.div`
  padding: 40px; text-align: center; color: #adb5bd; font-style: italic;
`;

const ReviewButton = styled.button`
  background-color: #3b5bdb; color: white; border: none; border-radius: 6px;
  padding: 6px 16px; font-size: 0.85rem; font-weight: 500; cursor: pointer;
  transition: all 0.2s;
  &:hover:not(:disabled) { background-color: #364fc7; transform: translateY(-1px); }
  &:disabled { background-color: #bac8ff; cursor: not-allowed; }
`;

const TeamLogo = styled.img`
  width: 28px; height: 28px; object-fit: contain; border-radius: 4px;
`;

// --- MODAL STYLES ---
const ModalBackdrop = styled.div`
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(2px);
  display: flex; justify-content: center; align-items: center; z-index: 2000;
`;

const ModalContent = styled.div`
  background: white; padding: 0; border-radius: 12px; width: 500px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.15); overflow: hidden;
`;

const ModalHeader = styled.div`
  display: flex; justify-content: space-between; align-items: center;
  padding: 20px 25px; border-bottom: 1px solid #f1f3f5;
  h3 { margin: 0; font-size: 1.25rem; color: #212529; }
`;

const CloseButton = styled.button`
  background: transparent; border: none; font-size: 1.1rem; color: #adb5bd;
  cursor: pointer; padding: 5px; border-radius: 4px;
  &:hover { background: #f1f3f5; color: #495057; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const ModalBody = styled.div` padding: 25px; `;

const DetailGrid = styled.div`
  display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;
`;

const DetailItem = styled.div` display: flex; flex-direction: column; gap: 4px; `;
const Label = styled.span` font-size: 0.75rem; text-transform: uppercase; color: #868e96; font-weight: 600; `;
const Value = styled.span`
  font-size: 1rem; color: ${props => props.highlight ? '#3b5bdb' : '#212529'};
  font-weight: ${props => props.status ? '600' : '400'};
  text-transform: ${props => props.status ? 'capitalize' : 'none'};
`;

const InstructionText = styled.p`
  font-size: 0.9rem; color: #495057; background: #f8f9fa;
  padding: 12px; border-radius: 6px; margin: 0; border: 1px solid #e9ecef;
`;

const ModalFooter = styled.div`
  padding: 20px 25px; background: #f8f9fa; border-top: 1px solid #f1f3f5;
  display: flex; gap: 12px;
`;

const IssueContainer = styled.div` position: relative; flex: 1; `;

const ActionButton = styled.button`
  flex: ${props => props.color === '#dc3545' ? '1' : '2'};
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px; border: none; border-radius: 8px;
  color: white; background-color: ${props => props.color};
  font-weight: 600; cursor: pointer; font-size: 0.9rem;
  transition: filter 0.2s;
  
  &:hover:not(:disabled) { filter: brightness(110%); }
  &:disabled { opacity: 0.6; cursor: wait; }
  
  /* Make Issue button outlined/ghost style optionally, but here keeping solid for consistency */
`;

const MenuOverlay = styled.div`
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 10;
`;

const DropdownMenu = styled.div`
  position: absolute; bottom: 110%; left: 0; width: 100%;
  background: white; border: 1px solid #e9ecef; border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.1); z-index: 20; overflow: hidden;
`;

const MenuItem = styled.div`
  padding: 12px 15px; cursor: pointer; font-size: 0.9rem; color: #343a40;
  border-bottom: 1px solid #f1f3f5;
  &:last-child { border-bottom: none; }
  &:hover { background-color: #f8f9fa; color: #212529; }
`;