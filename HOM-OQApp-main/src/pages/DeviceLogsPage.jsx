import React, { useState, useEffect, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import { Sidebar } from '../components/Sidebar';
import { InventSidebar } from '../components/InventSidebar';
import { AdminSidebar } from '../components/AdminSidebar';
import { UserAuth } from '../context/AuthContext';
import { supabase } from '../supabase/supabase.config';
import {
  FaSearch,
  FaHistory,
  FaCalendarAlt,
  FaLaptop,
  FaMapMarkerAlt,
  FaBuilding,
  FaChevronDown,
} from 'react-icons/fa';

// --- HELPERS ---
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return String(dateString);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCompactName = (fullName) => {
  if (!fullName || typeof fullName !== 'string') return 'Unknown';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 4) return `${parts[1]} ${parts[2]}`;
  if (parts.length === 3) return `${parts[0]} ${parts[1]}`;
  return fullName;
};

// ✅ Normaliza y asegura que solo trabaja con strings
const normalizeString = (str) => {
  if (typeof str !== 'string') return '';
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

// ✅ Solo usa .toLowerCase si `action` es string
const getActionColor = (action) => {
  if (typeof action !== 'string') return '#666';
  const act = action.toLowerCase();
  if (act.includes('taken')) return '#3B5BDB';
  if (act.includes('returned')) return '#28A745';
  if (act.includes('maintenance')) return '#E67E22';
  if (act.includes('damaged') || act.includes('lost')) return '#DC3545';
  return '#666';
};

export function DeviceLogsPage() {
  const { user } = UserAuth();

  // Normalizar roleId por si viene como string
  const rawRoleId = user?.role_id;
  const roleId =
    typeof rawRoleId === 'number'
      ? rawRoleId
      : Number(rawRoleId ?? 0);

  // Estados de datos
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Estados para Filtros (Admin)
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [team1Logo, setTeam1Logo] = useState(null);

  // Estados para el Custom Dropdown
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // --- LÓGICA DE PERMISOS ---
  const canViewAllLogs = [3, 4, 9].includes(roleId); // Inventario + Admin Ingeniería
  const isInventory = [3, 9].includes(roleId);
  const isAdmin = [4, 8].includes(roleId);

  // CERRAR DROPDOWN AL CLIC FUERA
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () =>
      document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownRef]);

  useEffect(() => {
    if (user) {
      if (canViewAllLogs) {
        fetchTeams();
      }
      fetchLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedTeam]);

  const fetchTeams = async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('team_id, team_name, photo_url')
      .order('team_name');

    if (error) {
      console.error('Error fetching teams:', error);
      return;
    }

    if (data) {
      setTeams(data);
      const t1 = data.find((t) => t.team_id === 1);
      if (t1) setTeam1Logo(t1.photo_url);
    }
  };

  const fetchLogs = async () => {
    if (!user) return;

    setLoading(true);
    try {
      let targetTeamId = null;

      if (canViewAllLogs) {
        if (selectedTeam !== 'all') {
          targetTeamId = selectedTeam;
        }
      } else {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('team_id')
          .eq('id', user.id)
          .single();

        if (userError) {
          console.error('Error fetching user team_id:', userError);
          setLoading(false);
          return;
        }

        if (!userData?.team_id) {
          setLoading(false);
          return;
        }
        targetTeamId = userData.team_id;
      }

      let query = supabase
        .from('device_logs')
        .select(
          `
          id,
          created_at,
          action,
          description,
          location,
          user_id,
          devices!inner (
            name,
            model,
            asset_tag,
            team_id,
            teams ( team_name )
          ),
          users (
            display_name
          )
        `,
        )
        .neq('action', 'Escalated')
        .neq('action', 'System Escalation')
        .order('created_at', { ascending: false });

      if (targetTeamId) {
        query = query.eq('devices.team_id', targetTeamId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTeamSelect = (teamId) => {
    setSelectedTeam(teamId);
    setIsDropdownOpen(false);
  };

  const filteredLogs = logs.filter((log) => {
    const term = normalizeString(searchTerm);
    if (!term) return true;

    const deviceName = log?.devices?.name || log?.devices?.model || '';
    const deviceTag = log?.devices?.asset_tag || '';
    const userName = log?.users?.display_name || '';
    const action = log?.action || '';
    const description = log?.description || '';

    return (
      normalizeString(deviceName).includes(term) ||
      normalizeString(deviceTag).includes(term) ||
      normalizeString(userName).includes(term) ||
      normalizeString(action).includes(term) ||
      normalizeString(description).includes(term)
    );
  });

  const currentTeamLogo =
    selectedTeam === 'all'
      ? team1Logo
      : teams.find(
          (t) => String(t.team_id) === String(selectedTeam),
        )?.photo_url || team1Logo;

  return (
    <Container>
      {/* SELECCIÓN CORRECTA DEL SIDEBAR */}
      {isInventory ? (
        <InventSidebar />
      ) : isAdmin ? (
        <AdminSidebar />
      ) : (
        <Sidebar />
      )}

      <ContentWrapper>
        <HeaderSection>
          <Title>
            <FaHistory
              style={{
                marginRight: '10px',
                fontSize: '0.8em',
                color: '#555',
              }}
            />
            {canViewAllLogs ? 'Device Logs' : 'Team Device Logs'}
          </Title>

          <ControlsContainer>
            {/* --- CUSTOM DROPDOWN --- */}
            {canViewAllLogs && (
              <CustomDropdownContainer ref={dropdownRef}>
                <DropdownTrigger
                  onClick={() =>
                    setIsDropdownOpen((prev) => !prev)
                  }
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    {currentTeamLogo ? (
                      <TeamLogo
                        src={currentTeamLogo}
                        alt="Team Logo"
                      />
                    ) : (
                      <FaBuilding color="#888" />
                    )}
                    <span className="trigger-text">
                      {selectedTeam === 'all'
                        ? 'All Teams'
                        : teams.find(
                            (t) =>
                              String(t.team_id) ===
                              String(selectedTeam),
                          )?.team_name}
                    </span>
                  </div>
                  <FaChevronDown
                    size={10}
                    color="#666"
                    style={{
                      transform: isDropdownOpen
                        ? 'rotate(180deg)'
                        : 'rotate(0)',
                      transition: '0.2s',
                    }}
                  />
                </DropdownTrigger>

                <DropdownMenu $isOpen={isDropdownOpen}>
                  {/* Opción All Teams */}
                  <DropdownItem
                    onClick={() => handleTeamSelect('all')}
                  >
                    {team1Logo ? (
                      <TeamLogo
                        src={team1Logo}
                        alt="All"
                      />
                    ) : (
                      <div
                        style={{
                          width: 26,
                          height: 26,
                          background: '#eee',
                          borderRadius: 4,
                        }}
                      />
                    )}
                    <span>All Teams</span>
                  </DropdownItem>

                  {/* Lista de Equipos */}
                  {teams.map((t) => (
                    <DropdownItem
                      key={t.team_id}
                      onClick={() =>
                        handleTeamSelect(t.team_id)
                      }
                    >
                      {t.photo_url ? (
                        <TeamLogo
                          src={t.photo_url}
                          alt={t.team_name}
                        />
                      ) : (
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            background: '#eee',
                            borderRadius: 4,
                          }}
                        />
                      )}
                      <span>{t.team_name}</span>
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </CustomDropdownContainer>
            )}

            <SearchContainer>
              <SearchIconWrapper>
                <FaSearch />
              </SearchIconWrapper>
              <SearchInput
                type="text"
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) =>
                  setSearchTerm(e.target.value ?? '')
                }
              />
            </SearchContainer>
          </ControlsContainer>
        </HeaderSection>

        <TableContainer>
          <TableHeader>
            <Th>Date & Time</Th>
            <Th>User</Th>
            <Th>Action</Th>
            <Th>Device</Th>
            <Th>Description</Th>
            <Th>Location</Th>
          </TableHeader>

          <TableBody>
            {loading ? (
              <EmptyRow>Loading activity...</EmptyRow>
            ) : filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <TableRow key={log.id}>
                  <Td>
                    <IconText>
                      <FaCalendarAlt color="#ccc" />
                      <span>
                        {formatDate(log.created_at)}
                      </span>
                    </IconText>
                  </Td>

                  <Td className="highlight">
                    <strong>
                      {formatCompactName(
                        log?.users?.display_name,
                      )}
                    </strong>
                  </Td>

                  <Td>
                    <ActionBadge
                      color={getActionColor(log.action)}
                    >
                      {log.action || 'Unknown'}
                    </ActionBadge>
                  </Td>

                  <Td>
                    <DeviceCell>
                      <FaLaptop
                        size={12}
                        color="#666"
                        style={{ flexShrink: 0 }}
                      />
                      <div>
                        <div className="name">
                          {log?.devices?.name ||
                            log?.devices?.model ||
                            'Unknown device'}
                        </div>
                        <div className="tag">
                          {log?.devices?.asset_tag || 'No tag'}
                          {/* Mostrar nombre del equipo si es Admin y está viendo todos */}
                          {canViewAllLogs &&
                            selectedTeam === 'all' &&
                            log?.devices?.teams?.team_name && (
                              <span
                                style={{
                                  fontWeight: 'normal',
                                  color: '#999',
                                  marginLeft: '5px',
                                }}
                              >
                                (
                                {
                                  log.devices.teams
                                    .team_name
                                }
                                )
                              </span>
                            )}
                        </div>
                      </div>
                    </DeviceCell>
                  </Td>

                  <Td
                    className="desc"
                    title={log?.description || ''}
                  >
                    {log?.description || '—'}
                  </Td>

                  <Td>
                    <IconText>
                      <FaMapMarkerAlt
                        color="#999"
                        size={12}
                        style={{ flexShrink: 0 }}
                      />
                      {log?.location || '—'}
                    </IconText>
                  </Td>
                </TableRow>
              ))
            ) : (
              <EmptyRow>No activity found.</EmptyRow>
            )}
          </TableBody>
        </TableContainer>
      </ContentWrapper>
    </Container>
  );
}

// ================== ESTILOS ==================

const Container = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr;
  background-color: #f0f2f5;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
`;

const ContentWrapper = styled.div`
  padding: 40px;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow-y: auto;
`;

const HeaderSection = styled.div`
  margin-bottom: 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: #1d2129;
  display: flex;
  align-items: center;
`;

const ControlsContainer = styled.div`
  display: flex;
  gap: 15px;
  align-items: center;
`;

// --- CUSTOM DROPDOWN STYLES ---

const slideDown = keyframes`
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const CustomDropdownContainer = styled.div`
  position: relative;
  width: 220px;
  z-index: 100;
`;

const DropdownTrigger = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #fff;
  border-radius: 8px;
  padding: 0 12px;
  height: 42px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
  border: 1px solid #eee;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.2s;

  &:hover {
    border-color: #ccc;
  }

  .trigger-text {
    font-size: 0.9rem;
    font-weight: 500;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 130px;
  }
`;

const DropdownMenu = styled.div`
  position: absolute;
  top: 50px;
  left: 0;
  width: 100%;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  border: 1px solid #f0f0f0;
  overflow: hidden;

  display: ${(props) => (props.$isOpen ? 'block' : 'none')};
  animation: ${slideDown} 0.2s ease-out;

  max-height: 300px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background-color: #ccc;
    border-radius: 4px;
  }
`;

const DropdownItem = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid #f9f9f9;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: #f5f7ff;
  }

  span {
    font-size: 0.9rem;
    color: #444;
  }
`;

const TeamLogo = styled.img`
  height: 24px;
  width: auto;
  max-width: 60px;
  object-fit: contain;
  border-radius: 4px;
  flex-shrink: 0;
`;

const SearchContainer = styled.div`
  display: flex;
  align-items: center;
  background-color: #fff;
  border-radius: 8px;
  padding: 0 15px;
  height: 42px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
  border: 1px solid #eee;
  width: 300px;
`;

const SearchIconWrapper = styled.div`
  color: #888;
  margin-right: 10px;
  display: flex;
  align-items: center;
`;

const SearchInput = styled.input`
  border: none;
  background: none;
  flex-grow: 1;
  font-size: 0.95rem;
  outline: none;
  color: #333;
  &::placeholder {
    color: #ccc;
  }
`;

const TableContainer = styled.div`
  background-color: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  max-height: 85vh;
`;

const gridColumns = '1.3fr 1.1fr 1fr 1.5fr 2fr 0.8fr';

const TableHeader = styled.div`
  display: grid;
  grid-template-columns: ${gridColumns};
  background-color: #1d2129;
  padding: 15px 20px;
  position: sticky;
  top: 0;
  z-index: 10;
`;

const Th = styled.div`
  color: #fff;
  font-weight: 600;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const TableBody = styled.div`
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex-grow: 1;
`;

const TableRow = styled.div`
  display: grid;
  grid-template-columns: ${gridColumns};
  padding: 12px 20px;
  border-bottom: 1px solid #f0f0f0;
  align-items: center;
  transition: background-color 0.2s;
  &:hover {
    background-color: #f9f9f9;
  }
`;

const Td = styled.div`
  color: #444;
  font-size: 0.9rem;
  padding-right: 15px;
  display: flex;
  align-items: center;

  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  word-break: break-word;
  line-height: 1.4;

  &.highlight {
    color: #1d2129;
  }
  &.desc {
    color: #666;
    font-style: italic;
    font-size: 0.85rem;
  }
`;

const ActionBadge = styled.span`
  background-color: ${(props) => `${props.color}15`};
  color: ${(props) => props.color};
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  border: 1px solid ${(props) => `${props.color}30`};
  white-space: nowrap;
`;

const IconText = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const DeviceCell = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  .name {
    font-weight: 600;
    color: #333;
    font-size: 0.9em;
  }
  .tag {
    font-size: 0.75em;
    color: #888;
  }
`;

const EmptyRow = styled.div`
  padding: 40px;
  text-align: center;
  color: #999;
  font-style: italic;
  font-size: 1rem;
`;
