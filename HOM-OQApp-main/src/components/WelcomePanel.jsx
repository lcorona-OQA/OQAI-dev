import React, { useState, useEffect } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { UserAuth } from '../context/AuthContext';
import { supabase } from '../supabase/supabase.config';
import userPlaceholder from '../assets/user-placeholder.png';
import {
  FaHome, FaEdit, FaBuilding, FaLaptop, FaMobileAlt, FaClipboardCheck,
  FaBullhorn, FaUsers, FaUser, FaLayerGroup, FaTimes
} from 'react-icons/fa';
import CountUp from 'react-countup';
import Swal from 'sweetalert2';

// --- IMPORTAMOS REACT-DATEPICKER ---
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

// --- ESTILOS GLOBALES PARA EL DATEPICKER (OCULTAR FINES DE SEMANA) ---
const GlobalDatePickerStyles = createGlobalStyle`
  /* Ocultar encabezados de Sábado (6to) y Domingo (7mo) - Ajusta según locale si empieza en Domingo */
  .react-datepicker__day-name:nth-child(1), /* Domingo */
  .react-datepicker__day-name:nth-child(7) { /* Sábado */
    display: none;
  }

  /* Ocultar los días numéricos que sean fin de semana */
  .react-datepicker__day--weekend {
    display: none;
  }

  /* Ajustar el ancho para que los 5 días ocupen todo el espacio */
  .react-datepicker__week {
    display: flex;
    justify-content: space-around;
  }
  
  .react-datepicker__day-names {
    display: flex;
    justify-content: space-around;
  }

  .react-datepicker__month-container {
    width: 100%;
    font-family: inherit;
  }
  
  .react-datepicker__header {
    background-color: #f0f2f5;
    border-bottom: none;
  }
`;

// --- ESTILOS AUXILIARES ---
const FadeElement = styled.span`
  opacity: ${props => (props.show ? 1 : 0)};
  transition: opacity 0.55s ease;
`;

// --- HELPERS ---
function formatPrettyDate(dateString) {
  if (!dateString) return "";
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
  } catch (e) {
    return dateString;
  }
}

const isWeekday = (date) => {
  const day = date.getDay();
  return day !== 0 && day !== 6;
};

// --- COMPONENTE MODAL DE ACCIÓN MASIVA ---
const MassActionModal = ({ isOpen, onClose, onExecute, allUsers, allTeams }) => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [mode, setMode] = useState('global');
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStartDate(null);
      setEndDate(null);
      setMode('global');
      setSelectedIds([]);
      setSearchTerm('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredTeams = allTeams.filter(t => t.team_name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredUsers = allUsers.filter(u => u.display_name.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleSelection = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(item => item !== id));
    } else {
      setSelectedIds(prev => [...prev, id]);
    }
  };

  const handleExecute = () => {
    if (!startDate || !endDate) {
      Swal.fire({ icon: 'warning', title: 'Dates Missing', text: 'Please select both a Start Date and an End Date.', confirmButtonColor: '#3b5bdb' });
      return;
    }
    if (startDate > endDate) {
      Swal.fire({ icon: 'error', title: 'Invalid Range', text: 'Start date cannot be after End date.', confirmButtonColor: '#d33' });
      return;
    }
    if (mode !== 'global' && selectedIds.length === 0) {
      Swal.fire({ icon: 'warning', title: 'No Target Selected', text: `Please select at least one ${mode === 'teams' ? 'team' : 'employee'}.`, confirmButtonColor: '#3b5bdb' });
      return;
    }

    const startStr = startDate.toLocaleDateString('en-CA');
    const endStr = endDate.toLocaleDateString('en-CA');

    onExecute({ startDate: startStr, endDate: endStr, mode, selectedIds });
  };

  return (
    <ModalBackdrop onClick={onClose}>
      <ModalContent onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <h3><FaBullhorn color="#d33" style={{ marginRight: 10 }} /> Mass Home Office</h3>
          <CloseButton onClick={onClose}><FaTimes /></CloseButton>
        </ModalHeader>

        <ModalBody>
          <div style={{ marginBottom: 15 }}>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: 6, fontSize: '0.9rem', color: '#555' }}>1. Select Date Range</label>
            <DateRow>
              <div style={{ flex: 1 }}>
                <StyledDatePicker
                  selected={startDate}
                  onChange={(date) => setStartDate(date)}
                  selectsStart
                  startDate={startDate}
                  endDate={endDate}
                  placeholderText="Start Date"
                  filterDate={isWeekday}
                  dateFormat="MMM d, yyyy"
                />
              </div>
              <span style={{ alignSelf: 'center', fontWeight: 'bold', fontSize: '0.9rem', color: '#888' }}>to</span>
              <div style={{ flex: 1 }}>
                <StyledDatePicker
                  selected={endDate}
                  onChange={(date) => setEndDate(date)}
                  selectsEnd
                  startDate={startDate}
                  endDate={endDate}
                  minDate={startDate}
                  placeholderText="End Date"
                  filterDate={isWeekday}
                  dateFormat="MMM d, yyyy"
                />
              </div>
            </DateRow>
          </div>

          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: 4, fontSize: '0.9rem', color: '#555' }}>2. Select Target</label>
          <TabsContainer>
            <Tab $active={mode === 'global'} onClick={() => { setMode('global'); setSelectedIds([]); }}>
              <FaUsers /> Everyone
            </Tab>
            <Tab $active={mode === 'teams'} onClick={() => { setMode('teams'); setSelectedIds([]); }}>
              <FaLayerGroup /> By Team
            </Tab>
            <Tab $active={mode === 'users'} onClick={() => { setMode('users'); setSelectedIds([]); }}>
              <FaUser /> By Employee
            </Tab>
          </TabsContainer>

          <SelectionArea>
            {mode === 'global' && (
              <GlobalMessage>
                <FaUsers size={40} color="#3b5bdb" />
                <p>This action will send <b>ALL Employees & Leads</b> to Home Office for the selected dates.</p>
                <small style={{ color: '#d33' }}>Use with caution.</small>
              </GlobalMessage>
            )}

            {(mode === 'teams' || mode === 'users') && (
              <>
                <Input
                  type="text"
                  placeholder={`Search ${mode}...`}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ marginBottom: 10 }}
                />
                <ListContainer>
                  {mode === 'teams' ? (
                    filteredTeams.map(t => (
                      <ListItem key={t.team_id} onClick={() => handleSelection(t.team_id)} $selected={selectedIds.includes(t.team_id)}>
                        <input type="checkbox" checked={selectedIds.includes(t.team_id)} readOnly />
                        {t.team_name}
                      </ListItem>
                    ))
                  ) : (
                    filteredUsers.map(u => (
                      <ListItem key={u.id} onClick={() => handleSelection(u.id)} $selected={selectedIds.includes(u.id)}>
                        <input type="checkbox" checked={selectedIds.includes(u.id)} readOnly />
                        {u.display_name}
                      </ListItem>
                    ))
                  )}
                </ListContainer>
                <small style={{ color: '#666', marginTop: 5, textAlign: 'right', display: 'block' }}>Selected: {selectedIds.length}</small>
              </>
            )}
          </SelectionArea>
        </ModalBody>

        <ModalFooter>
          <Button secondary onClick={onClose}>Cancel</Button>
          <Button primary onClick={handleExecute}>Execute Action</Button>
        </ModalFooter>
      </ModalContent>
    </ModalBackdrop>
  );
};

// --- COMPONENTE PRINCIPAL ---
export function WelcomePanel({ isAdmin: propIsAdmin = false, isInventory = false }) {
  const { user } = UserAuth();
  const navigate = useNavigate();

  const isAdmin = propIsAdmin || (user && [1, 4, 8].includes(user.role_id));

  // Estados UI
  const [teamName, setTeamName] = useState('...');
  const [teamPhoto, setTeamPhoto] = useState(null);
  const [userTeamId, setUserTeamId] = useState(null);
  const [locationName, setLocationName] = useState('...');
  const [locationPhoto, setLocationPhoto] = useState(null);
  const [oooRange, setOooRange] = useState({ start: null, end: null });
  const [showData, setShowData] = useState(true);

  const userDisplayName = user?.user_metadata?.name || 'Username';
  const userPhoto = user?.user_metadata?.picture || userPlaceholder;

  // Stats
  const [nextHomeOfficeDays, setNextHomeOfficeDays] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [occupancy, setOccupancy] = useState(0.0);
  const [totalDevices, setTotalDevices] = useState(0);
  const [pendingReview, setPendingReview] = useState(0);
  const [RandomDeviceIcon] = useState(() => Math.random() > 0.5 ? FaLaptop : FaMobileAlt);

  // Estados Mass Action
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [allEligibleUsers, setAllEligibleUsers] = useState([]);
  const [allTeams, setAllTeams] = useState([]);

  // --- FETCH DATA ---
  const fetchData = async () => {
    if (!user) return;

    setShowData(false);
    await new Promise(res => setTimeout(res, 350));

    // Datos usuario
    const { data: userData } = await supabase.from('users').select('team_id, location_id, ooo_start, ooo_end').eq('id', user.id).single();

    if (userData?.team_id) {
      setUserTeamId(userData.team_id);
      const { data: teamData } = await supabase.from('teams').select('team_name, photo_url').eq('team_id', userData.team_id).single();
      setTeamName(teamData?.team_name || 'No team');
      setTeamPhoto(teamData?.photo_url);
    }

    if (userData?.location_id) {
      const { data: locationData } = await supabase.from('locations').select('location_name, photo_url').eq('id', userData.location_id).single();
      setLocationName(locationData?.location_name || 'No location');
      setLocationPhoto(locationData?.photo_url);
    }

    setOooRange({ start: userData?.ooo_start || null, end: userData?.ooo_end || null });

    // --- LÓGICA DE ESTADÍSTICAS (ADMIN) ---
    if (isAdmin) {
      const today = new Date().toISOString().slice(0, 10);

      const [pendingResult, totalEngineeringResult, presentInOfficeResult] = await Promise.all([
        supabase.from('home_office_requests').select('id', { count: 'exact' }).eq('status', 'pending_admin'),

        supabase.from('users').select('id', { count: 'exact' }).in('role_id', [4, 5, 6, 8]),

        supabase.from('users')
          .select('id', { count: 'exact' })
          .eq('location_id', 1) // 1 = Oficina
          .in('role_id', [4, 5, 6, 8])
      ]);

      setPendingCount(pendingResult.count || 0);

      const totalEngineering = totalEngineeringResult.count || 0;
      const actuallyInOffice = presentInOfficeResult.count || 0;

      if (totalEngineering > 0) {
        setOccupancy(((actuallyInOffice / totalEngineering) * 100).toFixed(1));
      } else {
        setOccupancy(0.0);
      }

    } else if (isInventory) {
      const [totalResult, pendingResult] = await Promise.all([
        supabase.from('devices').select('*', { count: 'exact', head: true }),
        supabase.from('devices').select('*', { count: 'exact', head: true }).eq('status', 'pending_review')
      ]);
      setTotalDevices(totalResult.count || 0);
      setPendingReview(pendingResult.count || 0);

    } else {
      const today = new Date().toISOString().slice(0, 10);
      const { data: requestsData } = await supabase
        .from('home_office_requests')
        .select('date')
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .gt('date', today)
        .order('date', { ascending: true })
        .limit(2);

      if (requestsData) {
        const formatted = requestsData.map(r => {
          const d = new Date(`${r.date}T00:00:00`);
          return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        });
        setNextHomeOfficeDays(formatted);
      }
    }
    setShowData(true);
  };

  // --- MASS ACTION LOGIC ---
  const fetchMassData = async () => {
    const { data: users } = await supabase
      .from('users').select('id, display_name, role_id, team_id, ooo_start, ooo_end').in('role_id', [4, 5, 6, 8]).order('display_name');
    const { data: teams } = await supabase.from('teams').select('*').order('team_name');

    if (users) setAllEligibleUsers(users);
    if (teams) setAllTeams(teams);
  };

  const handleOpenEmergency = () => {
    fetchMassData();
    setIsModalOpen(true);
  };

  const executeMassHO = async ({ startDate, endDate, mode, selectedIds }) => {
    setIsModalOpen(false);

    // 1. Filtrar usuarios
    let targetUserIds = [];
    if (mode === 'global') {
      targetUserIds = allEligibleUsers.map(u => u.id);
    } else if (mode === 'teams') {
      targetUserIds = allEligibleUsers.filter(u => selectedIds.includes(u.team_id)).map(u => u.id);
    } else if (mode === 'users') {
      targetUserIds = selectedIds;
    }

    if (targetUserIds.length === 0) {
      Swal.fire('Info', 'No users found matching the criteria.', 'info');
      return;
    }

    // 2. Generar Fechas
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const dateArray = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        dateArray.push(d.toLocaleDateString('en-CA'));
      }
    }

    if (dateArray.length === 0) {
      Swal.fire({ icon: 'warning', title: 'No Working Days', text: 'The selected range only contains weekends.', confirmButtonColor: '#3b5bdb' });
      return;
    }

    // 3. Confirmación
    const { isConfirmed } = await Swal.fire({
      title: 'Are you sure?',
      html: `You are about to assign <b>Home Office</b> to:<br/><b>${targetUserIds.length} users</b><br/><br/>For <b>${dateArray.length} working days</b> within:<br/>${startDate} to ${endDate}`,
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes, execute', confirmButtonColor: '#d33'
    });

    if (!isConfirmed) return;

    Swal.fire({ title: 'Processing...', html: 'Validating against existing requests...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
      // --- PASO CRÍTICO: Evitar duplicados ---
      // Traemos todos los requests existentes para estos usuarios en estas fechas
      const { data: existingRequests } = await supabase
        .from('home_office_requests')
        .select('user_id, date')
        .in('user_id', targetUserIds)
        .in('date', dateArray);

      const inserts = [];
      let skippedOOO = 0;
      let skippedDuplicate = 0;

      targetUserIds.forEach(uid => {
        const userObj = allEligibleUsers.find(u => u.id === uid);
        dateArray.forEach(dateStr => {

          // A. Checar conflicto OOO
          const isOOO = userObj.ooo_start && userObj.ooo_end && dateStr >= userObj.ooo_start && dateStr <= userObj.ooo_end;

          // B. Checar duplicado (Ya tiene HO ese día)
          // Nota: existingRequests puede ser null si no hay ninguno, manejamos con ?.
          const isDuplicate = existingRequests?.some(req => req.user_id === uid && req.date === dateStr);

          if (isOOO) {
            skippedOOO++;
          } else if (isDuplicate) {
            skippedDuplicate++;
          } else {
            inserts.push({ user_id: uid, date: dateStr, reason: 'Mass Assignment / Emergency', status: 'approved' });
          }
        });
      });

      // Insertar SOLO los nuevos
      if (inserts.length > 0) {
        const { error } = await supabase.from('home_office_requests').insert(inserts);
        if (error) throw error;
      }

      // Llamar a la BD para actualizar locations (Requiere SECURITY DEFINER en la función SQL)
      await supabase.rpc('update_daily_locations');

      let msg = `Done! Created ${inserts.length} new requests.`;
      if (skippedDuplicate > 0 || skippedOOO > 0) {
        msg += `<br/><span style="font-size:0.9em; color:#666">Skipped: <b>${skippedDuplicate}</b> duplicates, <b>${skippedOOO}</b> OOO.</span>`;
      }

      Swal.fire('Success', msg, 'success');
      fetchData();

    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'Failed to execute mass assignment.', 'error');
    }
  };

  useEffect(() => {
    fetchData();
    window.addEventListener('locationUpdated', fetchData);
    return () => window.removeEventListener('locationUpdated', fetchData);
  }, [user, isAdmin, isInventory]);

  // Auto-reset OOO
  useEffect(() => {
    if (!oooRange.end || !user) return;
    const todayStr = new Date().toLocaleDateString('en-CA');
    if (todayStr > oooRange.end) {
      const resetToOffice = async () => {
        await supabase.from('users').update({ location_id: 1, ooo_start: null, ooo_end: null }).eq('id', user.id);
        fetchData();
      };
      resetToOffice();
    }
  }, [oooRange.end, user]);

  const isFutureOOO = () => {
    if (!oooRange.start) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [y, m, d] = oooRange.start.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    return start > today;
  };

  return (
    <>
      <GlobalDatePickerStyles />
      <PanelContainer>
        <HeaderRow>
          <Title>Welcome!</Title>
          {isAdmin && (
            <EmergencyBtn onClick={handleOpenEmergency} title="Emergency / Mass Home Office">
              <FaBullhorn /> Mass Action
            </EmergencyBtn>
          )}
        </HeaderRow>

        <UserInfo>
          <ProfilePic src={userPhoto} alt="User profile" />
          <div>
            <UserName>{userDisplayName}</UserName>
            <UserRoleContainer>
              {userTeamId === 6 ? (
                teamPhoto && <RectangularTeamLogo src={teamPhoto} alt="Team Logo" />
              ) : (
                <>
                  {teamPhoto && <TeamPhoto src={teamPhoto} alt={teamName} />}
                  <UserRoleText>{teamName}</UserRoleText>
                </>
              )}
            </UserRoleContainer>

            <UserStatus>
              <FadeElement show={showData}>
                {locationPhoto && <LocationPhoto src={locationPhoto} alt={locationName} />}
              </FadeElement>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <FadeElement show={showData} style={{ lineHeight: 1.2 }}>{locationName}</FadeElement>
                <FadeElement show={showData}>
                  {oooRange.start && oooRange.end && (
                    <div style={{ fontSize: "0.75em", marginTop: '-3px', display: 'flex', flexDirection: 'row' }}>
                      {isFutureOOO() && <span style={{ color: "#F7B928", fontWeight: "700" }}>Next OOO:</span>}
                      <span style={{ marginLeft: '5px', color: "#666" }}>{formatPrettyDate(oooRange.start)} → {formatPrettyDate(oooRange.end)}</span>
                    </div>
                  )}
                </FadeElement>
              </div>
            </UserStatus>
          </div>
        </UserInfo>

        {isAdmin ? (
          <StatsContainer>
            <StatCard dark>
              <StatInfo>
                <StatNumber><CountUp end={pendingCount} duration={1} /></StatNumber>
                <StatText>Pending Requests</StatText>
              </StatInfo>
              <StatIconWrapper><FaEdit /></StatIconWrapper>
            </StatCard>
            <StatCard warning>
              <StatInfo>
                <StatNumber><CountUp end={occupancy} duration={1.5} decimals={1} suffix="%" /></StatNumber>
                {/* Etiqueta actualizada */}
                <StatText>Engineering Office Occupancy</StatText>
              </StatInfo>
              <StatIconWrapper><FaBuilding /></StatIconWrapper>
            </StatCard>
          </StatsContainer>
        ) : isInventory ? (
          <StatsContainer>
            <StatCard dark>
              <StatInfo>
                <StatNumber><CountUp end={totalDevices} duration={1} /></StatNumber>
                <StatText>Total Devices</StatText>
              </StatInfo>
              <StatIconWrapper><RandomDeviceIcon /></StatIconWrapper>
            </StatCard>
            <StatCard warning onClick={() => navigate('/inv/reviews')} style={{ cursor: 'pointer' }}>
              <StatInfo>
                <StatNumber><CountUp end={pendingReview} duration={1} /></StatNumber>
                <StatText>Pending to Review</StatText>
              </StatInfo>
              <StatIconWrapper><FaClipboardCheck /></StatIconWrapper>
            </StatCard>
          </StatsContainer>
        ) : (
          <>
            <SectionTitle>Next days for Home Office</SectionTitle>
            <HomeOfficeDays>
              {nextHomeOfficeDays.length > 0 ? (
                nextHomeOfficeDays.map((day, index) => <p key={index}><FaHome /> <span>{day}</span></p>)
              ) : (
                <NoDaysText>You have no upcoming Home Office days scheduled.</NoDaysText>
              )}
            </HomeOfficeDays>
          </>
        )}

        <MassActionModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onExecute={executeMassHO}
          allUsers={allEligibleUsers}
          allTeams={allTeams}
        />
      </PanelContainer>
    </>
  );
}

// ======= ESTILOS =======

const PanelContainer = styled.div`
  background-color: #FFFFFF;
  border-radius: 8px;
  padding: 22px;
  color: #000;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px; 
`;

const Title = styled.h2`
  font-size: 1.6em;
  font-weight: bold;
  margin: 0;
  color: #000;
`;

const EmergencyBtn = styled.button`
  background-color: #fff;
  color: #dc3545;
  border: 1px solid #dc3545;
  padding: 6px 12px;
  border-radius: 20px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
  font-size: 0.8rem;

  &:hover {
    background-color: #dc3545;
    color: white;
    transform: scale(1.05);
  }
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 15px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  margin: 8px 0;
`;

const ProfilePic = styled.img`
  width: 100px;
  height: 100px;
  border-radius: 50%;
  object-fit: cover;
`;

const UserName = styled.h3`
  font-size: 1.3em;
  margin: 0;
  color: #000;
`;

const UserRoleContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 5px;
`;

const TeamPhoto = styled.img`
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: cover;
`;

const RectangularTeamLogo = styled.img`
  height: 20px;
  width: auto;
  max-width: 140px;
  object-fit: contain;
  display: block;
`;

const UserRoleText = styled.p`
  font-size: 1em;
  color: #666;
  margin: 0;
`;

const UserStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9em;
  color: #666;
  margin-top: 5px;
`;

const LocationPhoto = styled.img`
  width: 20px;
  height: 20px;
  object-fit: contain;
`;

const StatsContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  margin-top: 15px;
`;

const StatCard = styled.div`
  padding: 15px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  color: #fff;
  background-color: ${props => props.dark ? '#2b2f38' : props.warning ? '#F7B928' : '#6c757d'};
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
  transition: transform 0.2s, box-shadow 0.2s; 

  &:hover {
    ${props => props.onClick && `transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,0.2);`}
  }
`;

const StatInfo = styled.div` display: flex; flex-direction: column; `;
const StatNumber = styled.span` font-size: 1.8em; font-weight: bold; `;
const StatText = styled.span` font-size: 0.7em; opacity: 0.9; margin-top: 5px; `;
const StatIconWrapper = styled.div` font-size: 1.9em; opacity: 0.8; margin-top: -3px; `;

const SectionTitle = styled.h4` font-size: 1.2em; font-weight: bold; color: #000; margin: 10px 0; `;
const HomeOfficeDays = styled.div` display: flex; flex-direction: column; gap: 5px; `;
const NoDaysText = styled.p` color: #6a6a6a; font-style: italic; `;

// --- MODAL STYLES ---
const ModalBackdrop = styled.div`
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.5); z-index: 2000;
  display: flex; justify-content: center; align-items: center;
`;

const ModalContent = styled.div`
  background: white; width: 500px; border-radius: 12px; padding: 20px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3); display: flex; flex-direction: column;
`;

const ModalHeader = styled.div`
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;
  h3 { margin: 0; display: flex; align-items: center; color: #333; }
`;

const CloseButton = styled.button` background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #999; `;
const ModalBody = styled.div` flex-grow: 1; `;
const Input = styled.input`
  width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 1rem;
`;

// Estilo DatePicker
const DateRow = styled.div`
    display: flex; gap: 10px; align-items: center;
    .react-datepicker-wrapper { width: 100%; }
    .react-datepicker__input-container input {
        width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 1rem; color: #333;
    }
    .react-datepicker__input-container input:focus { outline: none; border-color: #3b5bdb; }
`;
const StyledDatePicker = styled(DatePicker)``;

const TabsContainer = styled.div`
  display: flex; gap: 10px; margin-bottom: 10px;
`;

const Tab = styled.button`
  flex: 1;
  padding: 7px;
  background: ${props => props.$active ? '#e0e7ff' : '#f5f5f5'};
  color: ${props => props.$active ? '#3b5bdb' : '#666'};
  border: 1px solid ${props => props.$active ? '#3b5bdb' : '#eee'};
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: all 0.2s;

  &:hover { background: #e0e7ff; }
`;

const SelectionArea = styled.div`
  background: #f9f9f9;
  border-radius: 8px;
  padding: 15px;
  height: 240px;
  display: flex;
  flex-direction: column;
  /* Opcional: transición suave si alguna vez decidieras cambiar la altura */
  transition: height 0.3s ease;
`;

const GlobalMessage = styled.div`
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; text-align: center; color: #555; gap: 10px;
  p { margin: 0; font-size: 0.95rem; }
`;

const ListContainer = styled.div`
  flex-grow: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 5px;
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb { background-color: #ccc; border-radius: 4px; }
`;

const ListItem = styled.div`
  display: flex; align-items: center; gap: 10px; padding: 8px;
  background: ${props => props.$selected ? '#e0e7ff' : 'white'};
  border: 1px solid ${props => props.$selected ? '#3b5bdb' : '#ddd'};
  border-radius: 6px; cursor: pointer; font-size: 0.9rem;
  &:hover { border-color: #3b5bdb; }
`;

const ModalFooter = styled.div` display: flex; justify-content: flex-end; gap: 10px; margin-top: 25px; `;
const Button = styled.button`
  padding: 10px 20px; border-radius: 6px; border: none; font-weight: bold; cursor: pointer;
  background: ${props => props.primary ? '#d33' : '#eee'};
  color: ${props => props.primary ? 'white' : '#333'};
  &:hover { opacity: 0.9; }
`;