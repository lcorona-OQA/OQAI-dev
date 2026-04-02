import { useState, useEffect } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { AdminSidebar } from '../components/AdminSidebar';
import { InventSidebar } from '../components/InventSidebar';
import { UserAuth } from '../context/AuthContext';
import { supabase } from '../supabase/supabase.config';
import { FaSearch, FaMobileAlt, FaLaptop, FaTabletAlt, FaDesktop, FaCheckCircle, FaFilter, FaTimes, FaUndo, FaUsers, FaLayerGroup } from 'react-icons/fa';
import Swal from 'sweetalert2';

// --- HELPERS ---
const getDeviceIcon = (type) => {
  const t = type?.toLowerCase() || '';
  if (t.includes('laptop')) return <FaLaptop />;
  if (t.includes('phone') || t.includes('iphone')) return <FaMobileAlt />;
  if (t.includes('tablet') || t.includes('ipad')) return <FaTabletAlt />;
  return <FaDesktop />;
};

const formatCompactName = (fullName) => {
  if (!fullName) return 'Unknown';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 4) return `${parts[1]} ${parts[2]}`;
  if (parts.length === 3) return `${parts[0]} ${parts[1]}`;
  return fullName;
};

const normalizeString = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[áàäâã]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöôõ]/g, 'o')
    .replace(/[úùüû]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[\u0300-\u036f]/g, '');
};

// --- ANIMACIONES ---
const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const fadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

const slideIn = keyframes`
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
`;

const slideOut = keyframes`
  from { opacity: 1; transform: translateY(0) scale(1); }
  to { opacity: 0; transform: translateY(20px) scale(0.95); }
`;

// --- FILTER MODAL ---
const FilterModal = ({ isOpen, onClose, onApply, currentFilters, uniqueValues }) => {
  const [localFilters, setLocalFilters] = useState(currentFilters);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLocalFilters(currentFilters);
      setIsClosing(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (key, value) => {
    setLocalFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => { onClose(); setIsClosing(false); }, 250);
  };

  const handleApply = () => { onApply(localFilters); handleClose(); };

  const handleClear = () => {
    const reset = { status: '', device_type: '', brand: '', operating_system: '' };
    setLocalFilters(reset);
    onApply(reset);
    handleClose();
  };

  return (
    <ModalBackdrop $closing={isClosing} onClick={handleClose}>
      <FilterContent $closing={isClosing} onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <h3>Filter Devices</h3>
          <CloseBtn onClick={handleClose}><FaTimes /></CloseBtn>
        </ModalHeader>
        <FilterBody>
          <FilterGroup>
            <label>Status</label>
            <select value={localFilters.status} onChange={(e) => handleChange('status', e.target.value)}>
              <option value="">All</option>
              <option value="available">Available</option>
              <option value="assigned">Assigned</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </FilterGroup>
          <FilterGroup>
            <label>Type</label>
            <select value={localFilters.device_type} onChange={(e) => handleChange('device_type', e.target.value)}>
              <option value="">All</option>
              {uniqueValues.types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </FilterGroup>
          <FilterGroup>
            <label>Brand</label>
            <select value={localFilters.brand} onChange={(e) => handleChange('brand', e.target.value)}>
              <option value="">All</option>
              {uniqueValues.brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </FilterGroup>
          <FilterGroup>
            <label>OS</label>
            <select value={localFilters.operating_system} onChange={(e) => handleChange('operating_system', e.target.value)}>
              <option value="">All</option>
              {uniqueValues.os.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </FilterGroup>
        </FilterBody>
        <ModalFooter>
          <Button secondary onClick={handleClear}>Clear</Button>
          <Button primary onClick={handleApply}>Apply Filters</Button>
        </ModalFooter>
      </FilterContent>
    </ModalBackdrop>
  );
};

export function AllDevicesPage() {
  const { user } = UserAuth();

  const [allDevices, setAllDevices] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('all');

  const [selectedDevice, setSelectedDevice] = useState(null);
  const [deviceLogs, setDeviceLogs] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ status: '', device_type: '', brand: '', operating_system: '' });
  const [uniqueValues, setUniqueValues] = useState({ types: [], brands: [], os: [] });

  const isInventory = user?.role_id === 3 || user?.role_id === 9;
  const isAdmin = user?.role_id === 4 || user?.role_id === 8;

  useEffect(() => {
    if (user) {
      fetchTeams();
      fetchAllDevices();
    }
  }, [user]);

  async function fetchTeams() {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .neq('team_id', 1)
      .order('team_name');
    if (!error && data) {
      const uniqueTeams = Array.from(new Map(data.map(item => [item.team_id || item.id, item])).values());
      setTeams(uniqueTeams);
    }
  }

  async function fetchAllDevices() {
    // 👇 Se agrega la especificación de la llave foránea (!devices_assigned_user_id_fkey)
    const { data, error } = await supabase
      .from('devices')
      .select(`
        *, 
        team_id, 
        users:users!devices_assigned_user_id_fkey (id, display_name, photo_url), 
        locations (location_name), 
        teams (team_name)
      `)
      .order('name');

    if (!error && data) {
      // Desduplicar dispositivos por ID
      const uniqueDevices = Array.from(new Map(data.map(item => [item.id, item])).values());
      setAllDevices(uniqueDevices);

      const types = [...new Set(uniqueDevices.map(d => d.device_type).filter(Boolean))];
      const brands = [...new Set(uniqueDevices.map(d => d.brand).filter(Boolean))];
      const os = [...new Set(uniqueDevices.map(d => d.operating_system).filter(Boolean))];
      setUniqueValues({ types, brands, os });
    } else if (error) {
      console.error("Error fetching devices:", error); // Agregado para ver errores en consola
    }
  }

  async function fetchDeviceLogs(deviceId) {
    const { data, error } = await supabase
      .from('device_logs')
      .select(`*, users(display_name)`)
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false });

    if (!error) setDeviceLogs(data || []);
    else setDeviceLogs([]);
  }

  const handleDeviceClick = (device) => {
    setSelectedDevice(device);
    fetchDeviceLogs(device.id);
  };

  // --- FILTRADO MAESTRO ---
  const filteredDevices = allDevices.filter(dev => {
    // 1. Filtro por Equipo
    if (selectedTeamId !== 'all') {
      // CORRECCIÓN: Usamos team_id también aquí y comparación flexible (==)
      // Ojo: Si en teams la columna es team_id, selectedTeamId tendrá ese valor.
      if (dev.team_id != selectedTeamId) {
        return false;
      }
    }

    // 2. Búsqueda de Texto
    const term = normalizeString(searchTerm);
    const matchesSearch =
      normalizeString(dev.name).includes(term) ||
      normalizeString(dev.model).includes(term) ||
      normalizeString(dev.asset_tag).includes(term) ||
      normalizeString(dev.brand).includes(term) ||
      normalizeString(dev.users?.display_name).includes(term);

    // 3. Filtros del Modal
    const matchesStatus = filters.status ? dev.status === filters.status : true;
    const matchesType = filters.device_type ? dev.device_type === filters.device_type : true;
    const matchesBrand = filters.brand ? dev.brand === filters.brand : true;
    const matchesOS = filters.operating_system ? dev.operating_system === filters.operating_system : true;

    return matchesSearch && matchesStatus && matchesType && matchesBrand && matchesOS;
  });

  return (
    <MainLayout>
      {isInventory ? (
        <InventSidebar />
      ) : isAdmin ? (
        <AdminSidebar />
      ) : (
        <InventSidebar />
      )}
      <ContentWrapper>
        <LeftPanel>
          <PanelTitle>Select Team</PanelTitle>
          <TeamList>
            <TeamItem
              key="all-teams"
              $active={selectedTeamId === 'all'}
              onClick={() => setSelectedTeamId('all')}
            >
              <TeamIconWrapper><FaLayerGroup /></TeamIconWrapper>
              <TeamInfo>
                <span className="name">All Teams</span>
                <span className="count">{allDevices.length} devices</span>
              </TeamInfo>
            </TeamItem>

            {teams.map(team => {
              // Detectar ID real (team_id o id)
              const realId = team.team_id || team.id;

              // Contar dispositivos
              const count = allDevices.filter(d => d.team_id == realId).length;

              return (
                <TeamItem
                  key={realId}
                  $active={selectedTeamId == realId}
                  onClick={() => setSelectedTeamId(realId)}
                >
                  <TeamLogo src={team.photo_url || userPlaceholder} alt={team.team_name} />
                  <TeamInfo>
                    <span className="name">{team.team_name}</span>
                    <span className="count">{count} devices</span>
                  </TeamInfo>
                </TeamItem>
              );
            })}
          </TeamList>
        </LeftPanel>

        <CenterPanel>
          <PanelHeader>
            <h1>All Devices</h1>
            <HeaderActions>
              <SearchBar>
                <FaSearch />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </SearchBar>
              <IconButton onClick={() => setIsFilterOpen(true)} active={Object.values(filters).some(Boolean)}>
                <FaFilter />
              </IconButton>
            </HeaderActions>
          </PanelHeader>

          <DeviceTableContainer>
            <GridHeader>
              <Gh>ID</Gh>
              <Gh>Device</Gh>
              <Gh style={{ textAlign: 'center' }}>Location</Gh>
              <Gh>Assigned to</Gh>
              <Gh>Team</Gh>
            </GridHeader>

            <ScrollableTable>
              <div>
                {filteredDevices.length > 0 ? (
                  filteredDevices.map(dev => (
                    <GridRow
                      key={dev.id}
                      onClick={() => handleDeviceClick(dev)}
                      active={selectedDevice?.id === dev.id}
                    >
                      <Gd title={dev.asset_tag}>{dev.asset_tag || 'N/A'}</Gd>
                      <Gd>{dev.name || dev.model}</Gd>
                      <Gd style={{ justifyContent: 'center' }}>{dev.locations?.location_name || 'Office'}</Gd>
                      <Gd className="assigned-col">
                        {dev.users ? (
                          <AssignedUser>
                            <UserDot />
                            <span>{formatCompactName(dev.users.display_name)}</span>
                          </AssignedUser>
                        ) : (
                          <UnassignedUser>
                            <StatusDot color="#28a745" /> Unassigned
                          </UnassignedUser>
                        )}
                      </Gd>
                      <Gd style={{ fontSize: '0.85em', color: '#666' }}>
                        {dev.teams?.team_name || 'No Team'}
                      </Gd>
                    </GridRow>
                  ))
                ) : (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#999', fontStyle: 'italic' }}>
                    No devices found.
                  </div>
                )}
              </div>
            </ScrollableTable>
          </DeviceTableContainer>
        </CenterPanel>

        <RightPanel>
          {selectedDevice ? (
            <>
              <DetailHeader>
                <LargeDeviceIcon>{getDeviceIcon(selectedDevice.device_type)}</LargeDeviceIcon>
                <h2>{selectedDevice.name || selectedDevice.model}</h2>
                <p>{selectedDevice.brand} • {selectedDevice.teams?.team_name}</p>
                <h3>{selectedDevice.asset_tag}</h3>
                <LocationInfo>
                  <strong>Location:</strong> {selectedDevice.locations?.location_name || 'Office'}
                </LocationInfo>
                <CurrentHolder>
                  {selectedDevice.users ? (
                    <><StatusDot color="#dc3545" /> <strong>{formatCompactName(selectedDevice.users.display_name)}</strong> <span>Taken</span></>
                  ) : (
                    <><StatusDot color="#28a745" /> <strong>Available</strong></>
                  )}
                </CurrentHolder>
              </DetailHeader>

              <LogSection>
                <h4>Activity log</h4>
                <LogList>
                  {deviceLogs.length > 0 ? deviceLogs.map(log => (
                    <LogItem key={log.id}>
                      <div className="timestamp">
                        <span className="time">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="date">{new Date(log.created_at).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</span>
                      </div>
                      <div className="info">
                        <strong>{log.users?.display_name || 'Unknown'}</strong>
                        <span style={{ color: log.action === 'Returned' ? '#d63384' : '#555' }}>
                          {log.action} ({log.location})
                        </span>
                      </div>
                      {log.action === 'Returned' ? <FaUndo color="#d63384" size={14} /> : <FaCheckCircle color="#28a745" />}
                    </LogItem>
                  )) : (
                    <p style={{ color: '#ccc', textAlign: 'center', fontSize: '0.8em' }}>No recent activity</p>
                  )}
                </LogList>
              </LogSection>
            </>
          ) : (
            <EmptyState><FaDesktop size={50} color="#eee" /><p>Select a device</p></EmptyState>
          )}
        </RightPanel>

        <FilterModal isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)} onApply={setFilters} currentFilters={filters} uniqueValues={uniqueValues} />
      </ContentWrapper>
    </MainLayout>
  );
}

// --- ESTILOS ---

const MainLayout = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr;
  background-color: #F0F2F5;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
`;

const ContentWrapper = styled.div`
  display: grid;
  grid-template-columns: 20% 55% 22%;
  gap: 20px;
  padding: 20px;
  height: 100vh;
`;

// --- LEFT PANEL (TEAM LIST) ---
const LeftPanel = styled.div`
  background: white;
  border-radius: 12px;
  max-height: 95vh;
  padding: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
`;

const PanelTitle = styled.h3`
  font-size: 1.2rem;
  font-weight: bold;
  margin-bottom: 15px;
`;

const TeamList = styled.div`
  flex-grow: 1;
  overflow-y: auto;
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TeamItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
  
  background-color: ${props => props.$active ? '#e0e7ff' : 'transparent'};
  border: 1px solid ${props => props.$active ? '#3b5bdb' : 'transparent'};

  &:hover {
    background-color: ${props => props.$active ? '#e0e7ff' : '#f9f9f9'};
  }
`;

const TeamIconWrapper = styled.div`
  width: 35px;
  height: 35px;
  border-radius: 50%;
  background-color: #eee;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #555;
  font-size: 1.1rem;
`;

const TeamLogo = styled.img`
  width: 35px;
  height: 35px;
  border-radius: 10%;
  object-fit: contain;
  background-color: #fff;
  padding: 2px;
`;

const TeamInfo = styled.div`
  display: flex;
  flex-direction: column;

  .name {
    font-weight: 600;
    font-size: 0.9rem;
    color: #333;
  }

  .count {
    font-size: 0.75rem;
    color: #888;
  }
`;

// --- CENTER PANEL ---
const CenterPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: 95vh;
  height: 100%;
  overflow: hidden;
`;

const PanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 5px;
  flex-shrink: 0;

  h1 {
    font-size: 2rem;
    font-weight: 700;
    margin: 0;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 10px;
`;

const IconButton = styled.button`
  background-color: ${props => props.active ? '#e0e7ff' : 'white'};
  color: ${props => props.active ? '#3b5bdb' : '#666'};
  border: 1px solid ${props => props.active ? '#3b5bdb' : '#ddd'};
  border-radius: 8px;
  padding: 10px;
  font-size: 1.1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background-color: #f5f5f5;
    color: #333;
  }
`;

const SearchBar = styled.div`
  display: flex;
  width: 100%;
  align-items: center;
  background: white;
  padding: 12px 20px;
  border-radius: 8px;
  border: 1px solid #ddd;
  gap: 10px;
  color: #888;

  input {
    border: none;
    outline: none;
    flex-grow: 1;
    font-size: 1rem;
    width: 250px;
  }
`;

// --- GRID ---
const DeviceTableContainer = styled.div`
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  overflow: hidden;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
`;

const gridColumns = "0.6fr 1.2fr 1fr 1.5fr 1fr";

const GridHeader = styled.div`
  display: grid;
  grid-template-columns: ${gridColumns};
  background-color: #1D2129;
  color: white;
  padding: 15px 20px;
  font-weight: 500;
  font-size: 0.9rem;
  flex-shrink: 0;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 10;
`;

const Gh = styled.div`
  padding-right: 10px;
`;

const GridBody = styled.div`
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex-grow: 1;
`;

const GridRow = styled.div`
  display: grid;
  grid-template-columns: ${gridColumns};
  padding: 15px 20px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  align-items: center;
  background-color: ${props => props.active ? '#f0f7ff' : 'white'};

  &:hover {
    background-color: #f9f9f9;
  }
`;

const Gd = styled.div`
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;

  &.assigned-col {
    white-space: normal;
    line-height: 1.2;
  }
`;

const AssignedUser = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  font-size: 0.9em;
  color: #333;
`;

const UnassignedUser = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: #28a745;
  font-size: 0.9em;
`;

const UserDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #F7B928;
  flex-shrink: 0;
`;

const StatusDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${props => props.color};
  display: inline-block;
  margin-right: 5px;
  flex-shrink: 0;
`;

const ScrollableTable = styled.div`
  overflow-y: auto;
  flex-grow: 1;
  width: 100%;
  position: relative;
`;

// --- RIGHT PANEL ---
const RightPanel = styled.div`
  background: white;
  max-height: 95vh;
  border-radius: 12px;
  padding: 30px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
`;

const DetailHeader = styled.div`
  text-align: center;
  margin-bottom: 30px;

  h2 {
    margin: 10px 0 5px;
    font-size: 1.6rem;
  }

  p {
    color: #666;
    margin-bottom: 5px;
  }

  h3 {
    font-weight: 400;
    color: #333;
    margin-bottom: 15px;
  }
`;

const LargeDeviceIcon = styled.div`
  font-size: 3.5rem;
  color: #333;
`;

const LocationInfo = styled.div`
  margin-bottom: 10px;
  font-size: 0.95rem;
`;

const CurrentHolder = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 0.9rem;

  span {
    color: #888;
    font-size: 0.8em;
  }
`;

const LogSection = styled.div`
  flex-grow: 1;
  overflow-y: hidden;
`;

const LogList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  overflow-y: auto;
  height: 84%;
  @media (min-height: 990px) {
    height: 94%;
  }
  @media (min-height: 1440px) {
    height: 96%;
  }
  /* Ocultar la barra de desplazamiento para Chrome, Safari y Opera */
    &::-webkit-scrollbar {
      display: none;
    }
  /* Ocultar la barra de desplazamiento para IE, Edge y Firefox */
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */
`;

const LogItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;

  .timestamp {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 70px;
  }

  .time {
    font-weight: bold;
    color: #333;
    font-size: 1em;
  }

  .date {
    color: #888;
    font-size: 0.8em;
  }

  .info {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    margin-left: 10px;
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #ccc;
`;

// --- MODAL STYLES ---
const ModalBackdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
  z-index: 2000;
  display: flex;
  justify-content: center;
  align-items: center;
  animation: ${props => props.$closing ? css`${fadeOut} 0.25s ease-in forwards` : css`${fadeIn} 0.25s ease-out forwards`};
`;

const FilterContent = styled.div`
  background: white;
  width: 400px;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
  animation: ${props => props.$closing ? css`${slideOut} 0.25s ease-in forwards` : css`${slideIn} 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards`};
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h3 {
    margin: 0;
  }
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #666;
`;

const FilterBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;

  label {
    font-weight: 600;
    font-size: 0.9rem;
    color: #333;
  }

  select {
    padding: 8px;
    border-radius: 6px;
    border: 1px solid #ddd;
  }
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 25px;
`;

const Button = styled.button`
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  background-color: ${props => props.primary ? '#3b5bdb' : '#eee'};
  color: ${props => props.primary ? 'white' : '#333'};
`;