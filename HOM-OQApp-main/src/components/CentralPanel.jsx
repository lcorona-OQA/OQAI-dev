import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import userPlaceholder from '../assets/user-placeholder.png';
import { FaEdit, FaTimes, FaHome, FaDesktop, FaBan } from 'react-icons/fa'; // Añadí FaBan
import { supabase } from '../supabase/supabase.config';
import { UserAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';

export function CentralPanel({ employee, onEmployeeUpdated }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedRole, setEditedRole] = useState(employee?.role_id || '');
  const [editedTeam, setEditedTeam] = useState(employee?.team_id || '');
  const [roles, setRoles] = useState([]);
  const [teams, setTeams] = useState([]);
  const [nextHODays, setNextHODays] = useState([]);
  const [assignedDevices, setAssignedDevices] = useState([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const emailRef = useRef(null);

  // Usuario logueado (quien está editando)
  const { user: authUser } = UserAuth();
  const editorRoleIdRaw =
    authUser?.role_id ??
    authUser?.user_metadata?.role_id ??
    authUser?.app_metadata?.role_id ??
    null;
  const editorRoleId =
    typeof editorRoleIdRaw === 'string'
      ? parseInt(editorRoleIdRaw, 10)
      : editorRoleIdRaw;


  useEffect(() => {
    async function fetchRolesAndTeams() {
      const { data: rolesData } = await supabase.from('roles').select('*');
      setRoles(rolesData || []);
      const { data: teamsData } = await supabase.from('teams').select('*');
      setTeams(teamsData || []);
    }
    fetchRolesAndTeams();
  }, []);

  useEffect(() => {
    if (!employee) {
      setNextHODays([]);
      setAssignedDevices([]);
      setIsEditing(false);
      return;
    }

    setIsEditing(false);
    setIsLoadingDetails(true);
    setNextHODays([]);
    setAssignedDevices([]);
    setEditedRole(employee.role_id || '');
    setEditedTeam(employee.team_id || '');

    const fetchEmployeeDetails = async () => {
      // Si el usuario está desactivado, no necesitamos cargar los días de HO ni dispositivos
      if (employee.is_active === false) {
        setIsLoadingDetails(false);
        return; 
      }

      const today = new Date().toISOString().slice(0, 10);
      
      const { data: hoData, error: hoError } = await supabase
        .from('home_office_requests')
        .select('date')
        .eq('user_id', employee.id)
        .eq('status', 'approved')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(2);

      if (hoError) console.error('Error fetching HO days:', hoError);

      const allUpcomingDays = [];
      if (hoData) {
        hoData.forEach(req => {
            allUpcomingDays.push(new Date(`${req.date}T00:00:00`));
        });
      }
      setNextHODays(
        allUpcomingDays
          .slice(0, 2)
          .map(date => date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }))
      );

      const { data: requestIdsData } = await supabase
        .from('home_office_requests')
        .select('id')
        .eq('user_id', employee.id)
        .eq('status', 'approved')
        .gte('date', today);

      if (requestIdsData && requestIdsData.length > 0) {
        const requestIds = requestIdsData.map(r => r.id);
        const { data: deviceData, error: deviceError } = await supabase
          .from('user_device_requests')
          .select('devices (id, name)')
          .in('request_id', requestIds);
        
        if (deviceError) console.error('Error fetching devices:', deviceError);
        
        if (deviceData) {
          const uniqueDevices = Array.from(new Map(deviceData.map(d => [d.devices.id, d.devices])).values());
          setAssignedDevices(uniqueDevices);
        }
      } else {
        setAssignedDevices([]);
      }
      
      setIsLoadingDetails(false);
    };

    fetchEmployeeDetails();
  }, [employee]);

  useEffect(() => {
      const element = emailRef.current;
      const currentEmail = employee?.email; 
      
      if (element && currentEmail) {
        const isTruncated = element.scrollWidth > element.clientWidth;
        if (isTruncated) {
          element.setAttribute('data-truncated', 'true');
        } else {
          element.removeAttribute('data-truncated');
        }
      }
    }, [employee, isEditing]);

  const getAllowedRoleIdsForEditor = (roleId) => {
    // Rol 1: puede asignar 1,2,3,4,8,9 y los anteriores (5,6,7)
    if (roleId === 1) return [1, 2, 3, 4, 5, 6, 7, 8, 9];
    // Rol 4: solo puede asignar 8
    if (roleId === 4) return [8];
    // Rol 8: solo Team Lead (5,6) y a sí mismo (8)
    if (roleId === 8) return [5, 6, 8];
    // Otros roles: no pueden asignar roles
    return [];
  };

  const allowedRoleIds = getAllowedRoleIdsForEditor(editorRoleId);
  const filteredRoles = roles.filter((role) =>
    allowedRoleIds.includes(role.role_id)
  );

  // Asegura que el rol actual del empleado se vea en el dropdown,
  // aunque el editor no tenga permiso para asignarlo (solo para mostrarlo).
  const currentRoleObj =
    roles.find((r) => r.role_id === employee?.role_id) ||
    (employee?.role_id && employee?.roles?.role_name
      ? { role_id: employee.role_id, role_name: employee.roles.role_name }
      : null);

  const roleOptions = [
    ...(currentRoleObj ? [currentRoleObj] : []),
    ...filteredRoles.filter((r) => r.role_id !== currentRoleObj?.role_id),
  ];

  const currentRoleName =
    employee?.roles?.role_name ||
    roles.find((r) => r.role_id === employee?.role_id)?.role_name ||
    (employee?.role_id ? `Role ${employee.role_id}` : 'Sin rol');

  // --- FUNCIÓN PARA DESACTIVAR ---
  const handleDeactivate = async () => {
    const { isConfirmed } = await Swal.fire({
      title: 'Deactivate employee?',
      text: `This will disable ${employee.display_name}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, deactivate',
      confirmButtonColor: '#d33',
    });

    if (!isConfirmed) return;

    const nowIso = new Date().toISOString();

    const { error } = await supabase
      .from('users')
      .update({
        is_active: false,
        deactivated_at: nowIso,
      })
      .eq('id', employee.id);

    if (error) {
      console.error('[CentralPanel] Error deactivating user:', error);
      Swal.fire('Error', 'Could not deactivate user.', 'error');
      return;
    }

    // AUDIT LOG: desactivación
    try {
      await supabase.rpc('insert_audit_event', {
        p_action_type: 'deactivate_user',
        p_entity_type: 'user',
        p_entity_id: employee.id,
        p_summary: `User deactivated from CentralPanel`,
        p_metadata: {
          reason: 'manual',
          deactivated_at: nowIso,
        },
        p_source: 'web:admin-employees',
      });
    } catch (auditErr) {
      console.error(
        '[CentralPanel] Error insertando audit_event (deactivate_user):',
        auditErr,
      );
    }

    Swal.fire('Done', 'User deactivated.', 'success');
    await refreshEmployeeData();
  };

  // --- FUNCIÓN PARA ACTIVAR ---
  const handleActivate = async () => {
    const { isConfirmed } = await Swal.fire({
      title: 'Activate employee?',
      text: `This will re-enable ${employee.display_name}.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, activate',
      confirmButtonColor: '#3b5bdb',
    });

    if (!isConfirmed) return;

    const { error } = await supabase
      .from('users')
      .update({
        is_active: true,
        deactivated_at: null,
      })
      .eq('id', employee.id);

    if (error) {
      console.error('[CentralPanel] Error activating user:', error);
      Swal.fire('Error', 'Could not activate user.', 'error');
      return;
    }

    // AUDIT LOG: reactivación
    try {
      await supabase.rpc('insert_audit_event', {
        p_action_type: 'activate_user',
        p_entity_type: 'user',
        p_entity_id: employee.id,
        p_summary: `User activated from CentralPanel`,
        p_metadata: {
          reason: 'manual',
        },
        p_source: 'web:admin-employees',
      });
    } catch (auditErr) {
      console.error(
        '[CentralPanel] Error insertando audit_event (activate_user):',
        auditErr,
      );
    }

    Swal.fire('Done', 'User activated.', 'success');
    await refreshEmployeeData();
  };
  // Helper para refrescar la data y avisar al padre
  const refreshEmployeeData = async () => {
    const { data: updatedEmployeeWithRelations, error: fetchError } = await supabase
        .from('users')
        .select(`*, teams:team_id(*), roles:role_id(*), locations:location_id(*)`)
        .eq('id', employee.id)
        .single();
    
    if (!fetchError && onEmployeeUpdated) {
        onEmployeeUpdated(updatedEmployeeWithRelations);
        setIsEditing(false);
    }
  };

  const handleSave = async () => {
    if (!employee) return;

    const parseNullableInt = (val) => {
      if (val === '' || val === null || val === undefined) return null;
      const n = typeof val === 'number' ? val : parseInt(String(val), 10);
      return Number.isNaN(n) ? null : n;
    };

    const nextRoleId = parseNullableInt(editedRole);
    const nextTeamId = parseNullableInt(editedTeam);

    const currentRoleId = employee.role_id ?? null;
    const currentTeamId = employee.team_id ?? null;

    const patch = {};

    // Solo actualizamos role_id si cambió, y validamos permisos
    if (nextRoleId !== currentRoleId) {
      if (!allowedRoleIds.includes(nextRoleId)) {
        Swal.fire(
          'Sin permiso',
          'No tienes permiso para asignar ese rol.',
          'error'
        );
        return;
      }
      patch.role_id = nextRoleId;
    }

    if (nextTeamId !== currentTeamId) {
      patch.team_id = nextTeamId;
    }

    if (Object.keys(patch).length === 0) {
      // Nada que guardar
      setIsEditing(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(patch)
      .eq('id', employee.id);

    if (updateError) {
      console.error('Error updating employee:', updateError);
      Swal.fire('Error', 'Could not update user.', 'error');
      return;
    }

    refreshEmployeeData();
  };

  const handleCancel = () => {
    setEditedRole(employee.role_id || '');
    setEditedTeam(employee.team_id || '');
    setIsEditing(false);
  };

  if (!employee) {
    return <EmptyPanel><p>Click an employee to view their information</p></EmptyPanel>;
  }

  const { display_name, email, photo_url, teams: employeeTeam, locations, is_active, deactivated_at } = employee;
  const resizedPhotoUrl = photo_url ? photo_url.replace(/s96-c/, `s200-c`) : userPlaceholder;

  // Formatear fecha de desactivación
  const formattedDeactivatedDate = deactivated_at 
    ? new Date(deactivated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Unknown date';

  return (
    <PanelContainer>
      <TopSection>
        {isEditing ? (
          <EditButton onClick={handleCancel} danger><FaTimes /></EditButton>
        ) : (
          <EditButton onClick={() => setIsEditing(true)}><FaEdit />
          </EditButton>
        )}
        <Header isDeactivated={is_active === false}>
          <ProfilePic src={resizedPhotoUrl} alt={display_name} isDeactivated={is_active === false} />
          <Name>{display_name}</Name>
          <Email ref={emailRef}>{email}<StyledEmailTooltip>{email}</StyledEmailTooltip></Email>
          
          {/* Si está desactivado, mostramos un badge o estado visual */}
          {is_active === false && <DeactivatedBadge>Deactivated</DeactivatedBadge>}

          <Status>
            <StatusText>
              {locations?.photo_url && <StatusIcon src={locations.photo_url} alt="Location" />}
              <span>{locations?.location_name || 'Sin ubicación'}</span>
            </StatusText>
            <StatusText>
              {employeeTeam?.photo_url && <StatusIcon src={employeeTeam.photo_url} alt="Team" />}
              <span>{employeeTeam?.team_name || 'Sin equipo'}</span>
            </StatusText>
            <StatusText>
              <span>{currentRoleName}</span>
            </StatusText>
          </Status>
        </Header>
      </TopSection>
      <BottomSection>
        {!isEditing ? (
          // --- MODO VISTA ---
          <>
            {is_active === false ? (
               // VISTA PARA USUARIOS DESACTIVADOS
               <DeactivatedInfo>
                  <FaBan />
                  <InfoTitle>Account deactivated on</InfoTitle>
                  <p>{formattedDeactivatedDate}</p>
               </DeactivatedInfo>
            ) : (
              // VISTA NORMAL (InfoGrid)
              <InfoGrid>
                {isLoadingDetails ? (
                  <InfoText>Loading details...</InfoText>
                ) : (
                  <>
                    <InfoBlock>
                      <InfoTitle><FaHome /> Next HO Days</InfoTitle>
                      {nextHODays.length > 0 ? (
                        nextHODays.map(day => <InfoText key={day}>{day}</InfoText>)
                      ) : <InfoText>None scheduled</InfoText>}
                    </InfoBlock>
                    <InfoBlock>
                      <InfoTitle><FaDesktop /> Devices</InfoTitle>
                      {assignedDevices.length > 0 ? (
                        assignedDevices.map(device => <InfoText key={device.id}>{device.name}</InfoText>)
                      ) : <InfoText>None assigned</InfoText>}
                    </InfoBlock>
                  </>
                )}
              </InfoGrid>
            )}
          </>
        ) : (
          // --- MODO EDICIÓN ---
          <>
            <EditForm>
              <div>
                <label>Role</label>
                <select value={editedRole || ''} onChange={(e) => setEditedRole(e.target.value)} disabled={allowedRoleIds.length === 0}>
                  <option value=''>Select Role</option>
                  {roleOptions.map((role) => <option key={role.role_id} value={role.role_id}>{role.role_name}</option>)}
                </select>
              </div>
              <div>
                <label>Team</label>
                <select value={editedTeam || ''} onChange={(e) => setEditedTeam(e.target.value)}>
                  <option value=''>Select Team</option>
                  {teams.map((team) => <option key={team.team_id} value={team.team_id}>{team.team_name}</option>)}
                </select>
              </div>
            </EditForm>
            <Buttons>
              {/* BOTÓN CONDICIONAL: Si está inactivo muestra ACTIVATE, si no DEACTIVATE */}
              {is_active === false ? (
                 <Button activate onClick={handleActivate}>Activate</Button>
              ) : (
                 <Button danger onClick={handleDeactivate}>Deactivate</Button>
              )}
              <Button primary onClick={handleSave}>Save</Button>
            </Buttons>
          </>
        )}
      </BottomSection>
    </PanelContainer>
  );
}

// --- ESTILOS ---

const EmptyPanel = styled.div`
  background-color: #FFFFFF;
  border-radius: 8px;
  padding: 20px;
  color: #6a6a6a;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
  font-style: italic;
  font-size: 1.2em;
  height: 95vh;
`;

const PanelContainer = styled.div`
  background-color: #FFFFFF;
  border-radius: 8px;
  color: #000;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  height: 95vh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow-y: auto;
`;

const TopSection = styled.div`
  padding: 20px;
  flex-shrink: 0; 
`;

const BottomSection = styled.div`
  padding: 0 20px 20px 20px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex-grow: 1; 
`;

const EditButton = styled.button`
  position: absolute;
  top: 10px;
  right: 52px; /* deja espacio para la X del modal */
  z-index: 20;

  border: none;
  padding: 0;
  background: ${(props) =>
    props.danger ? 'rgba(220, 53, 69, 0.08)' : 'rgba(0, 0, 0, 0.04)'};

  border-radius: 999px;
  width: 30px;
  height: 30px;

  display: flex;
  align-items: center;
  justify-content: center;

  color: ${(props) => (props.danger ? '#dc3545' : '#6a6a6a')};
  cursor: pointer;
  font-size: 1.1em;
  line-height: 1;

  &:hover {
    background: ${(props) =>
      props.danger ? 'rgba(220, 53, 69, 0.14)' : 'rgba(0, 0, 0, 0.08)'};
  }

  &:focus,
  &:focus-visible {
    outline: none;
    box-shadow: none;
  }
`;

const Header = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
  /* Opacidad si está desactivado */
  ${props => props.isDeactivated && `opacity: 0.6;`}
`;

const ProfilePic = styled.img`
  width: 120px;
  height: 120px;
  border-radius: 50%;
  object-fit: cover;
  border: 4px solid #eee;
  margin-bottom: 10px;
  /* Escala de grises si está desactivado */
  ${props => props.isDeactivated && `filter: grayscale(100%);`}
`;

const DeactivatedBadge = styled.span`
  background-color: #e0e0e0;
  color: #666;
  font-size: 0.8em;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: bold;
  margin-bottom: 5px;
`;

const Name = styled.h2`
  font-size: 1.5em;
  font-weight: bold;
  margin: 0;
  padding: 0 10px;
  word-break: break-word;
  max-width: 100%;
`;

const StyledEmailTooltip = styled.span`
  opacity: 0;
  visibility: hidden;
  position: absolute;
  top: -4px;
  left: 50%;
  transform: translateX(-50%);
  background-color: #2b2f36;
  color: #fff;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.85em;
  font-weight: 500;
  white-space: normal;
  user-select: text;
  overflow: visible;
  z-index: 9999;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s ease;
  pointer-events: none;

  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    margin-left: -5px;
    border-width: 5px;
    border-style: solid;
    border-color: #3e4450 transparent transparent transparent;
  }
`;

const Email = styled.p`
  color: #8c8c8c;
  margin: 5px 0 0 0;
  padding: 0 10px;
  max-width: 100%;
  font-size: 0.9em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  position: relative;
  display: inline-block;
  line-height: 1.4;

  &[data-truncated='true']:hover {
     > ${StyledEmailTooltip} {
       opacity: 1;
       visibility: visible;
     }
  }
`;

const Status = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 15px;
  margin-top: 15px;
`;

const StatusText = styled.p`
  display: flex;
  align-items: center;
  gap: 5px;
  color: #6a6a6a;
  margin: 0;
  font-size: 0.9em;
`;

const StatusIcon = styled.img`
  width: 16px;
  height: 16px;
  object-fit: contain;
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
  margin-top: 20px;
`;

const InfoBlock = styled.div`
  background-color: #f8f9fa;
  border-radius: 8px;
  padding: 15px;
  min-height: 80px;
`;

const InfoTitle = styled.h4`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.9em;
  color: #6a6a6a;
  margin: 0 0 10px 0;
  text-transform: uppercase;
  font-weight: 600;

  svg {
    font-size: 1.2em;
  }
`;

const InfoText = styled.p`
  font-size: 0.9em;
  color: #000;
  font-weight: 500;
  margin: 0;
`;

const DeactivatedInfo = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 40px;
  gap: 10px;
  color: #6a6a6a;
  
  svg {
    font-size: 2.5em;
    color: #ccc;
    margin-bottom: 10px;
  }

  p {
    font-weight: bold;
    font-size: 1.1em;
    color: #444;
  }
`;

const EditForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-top: 20px;
  
  label {
    font-weight: bold;
    font-size: 0.9em;
    margin-bottom: 3px;
  }
  
  select {
    width: 100%;
    padding: 8px;
    border-radius: 6px;
    border: 1px solid #ccc;
    font-size: 0.9em;
  }
`;

const Buttons = styled.div`
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
  flex-shrink: 0;
`;

const Button = styled.button`
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  font-size: 0.9em;
  color: #fff;
  
  ${(props) => props.primary && `
    background-color: #4a90e2;
  `}
  
  ${(props) => props.danger && `
    background-color: #dc3545;
  `}
  
  ${(props) => props.activate && `
    background-color: #28a745;
  `}
`;


