// src/components/EmployeesPanel.jsx
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { supabase } from '../supabase/supabase.config';
import { UserAuth } from '../context/AuthContext';
import userPlaceholder from '../assets/user-placeholder.png';
import { FaUser, FaSearch, FaFilter } from 'react-icons/fa';

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

export function EmployeesPanel({ employees, setEmployees, onSelectEmployee }) {
  const { user } = UserAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [sortOption, setSortOption] = useState('display_name');
  const [filterOption, setFilterOption] = useState('all');
  const [availableTeams, setAvailableTeams] = useState([]);

  const isAdminRole =
    user?.role_id === 1 || user?.role_id === 4 || user?.role_id === 8;

  // --- FUNCIÓN DE ORDENAMIENTO ---
  const sortFunction = (a, b) => {
    // 1) Activos primero
    const activeA = a.is_active !== false;
    const activeB = b.is_active !== false;
    if (activeA !== activeB) {
      return activeA ? -1 : 1;
    }

    // 2) Según opción de sort
    if (sortOption === 'display_name') {
      const teamA = a.teams?.team_name;
      const teamB = b.teams?.team_name;

      // “Sin equipo” primero
      if (!teamA && teamB) return -1;
      if (teamA && !teamB) return 1;

      const nameA = (a.display_name || '').toLowerCase();
      const nameB = (b.display_name || '').toLowerCase();
      return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
    } else {
      // sortOption === 'teams.team_name'
      const teamA = a.teams?.team_name || '';
      const teamB = b.teams?.team_name || '';

      if (!teamA && teamB) return -1;
      if (teamA && !teamB) return 1;

      if ((!teamA && !teamB) || teamA === teamB) {
        const nameA = (a.display_name || '').toLowerCase();
        const nameB = (b.display_name || '').toLowerCase();
        return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
      }

      return teamA.localeCompare(teamB, 'es', { sensitivity: 'base' });
    }
  };

  useEffect(() => {
    async function fetchEmployees() {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('users')
          .select(
            `
            id,
            display_name,
            email,
            photo_url,
            role_id,
            team_id,
            is_active,
            deactivated_at,
            roles ( role_name ),
            teams ( team_name, photo_url ),
            locations ( location_name, photo_url )
          `,
            { count: 'exact' }
          )
          .neq('id', user.id) // no me incluyas a mí en la lista
          .order('display_name', { ascending: true });

        if (error) {
          console.error('[EmployeesPanel] Error fetching employees:', error);
          return;
        }

        let rows = data || [];

        // Equipos disponibles para el filtro (solo los que tienen team_name)
        const teams = Array.from(
          new Set(rows.map((e) => e.teams?.team_name).filter(Boolean))
        );
        setAvailableTeams(teams);

        // Filtro inicial por equipo (si no es "all")
        if (filterOption !== 'all') {
          rows = rows.filter(
            (emp) => emp.teams?.team_name === filterOption
          );
        }

        // Orden inicial
        rows = rows.sort(sortFunction);

        // Para el contador, normalmente queremos activos
        const activeEmployees = rows.filter((emp) => emp.is_active === true);

        setEmployees(rows);
        setTotalEmployees(activeEmployees.length);
      } catch (err) {
        console.error(
          '[EmployeesPanel] Unexpected error fetching employees:',
          err
        );
      }
    }

    fetchEmployees();
  }, [user, sortOption, filterOption, setEmployees]);

  // Aplica búsqueda + ordenamiento en caliente
  const filteredEmployees = employees
    .filter((employee) =>
      normalizeString(employee.display_name).includes(
        normalizeString(searchTerm)
      )
    )
    .sort(sortFunction);

  const handleSortChange = (option) => {
    setSortOption(option);
    setShowFilterMenu(false);
  };

  const handleFilterChange = (option) => {
    setFilterOption(option);
    setShowFilterMenu(false);
  };

  // --- AGRUPACIÓN POR EQUIPOS / SIN EQUIPO / DEACTIVATED ---
  const activeEmployees = filteredEmployees.filter(
    (e) => e.is_active !== false
  );
  const inactiveEmployees = filteredEmployees.filter(
    (e) => e.is_active === false
  );

  // 🔥 Esta función ahora respeta el rol:
  // - Para 1/4/8 → SIEMPRE agrupa por team_name (con grupo "Sin equipo")
  // - Para el resto → mantiene la lógica anterior (Sin equipo / Miembros o por team_name)
  const groupList = (list) => {
    if (isAdminRole) {
      // Admin / Superadmin → agrupados 100% por equipo
      return list.reduce((groups, emp) => {
        const teamName = emp.teams?.team_name || 'Sin equipo';
        if (!groups[teamName]) groups[teamName] = [];
        groups[teamName].push(emp);
        return groups;
      }, {});
    }

    // 🔽 Lógica anterior para roles que NO son 1/4/8
    if (sortOption === 'teams.team_name') {
      // Grupos por nombre de equipo (o “Sin equipo”)
      return list.reduce((groups, emp) => {
        const teamName = emp.teams?.team_name || 'Sin equipo';
        if (!groups[teamName]) groups[teamName] = [];
        groups[teamName].push(emp);
        return groups;
      }, {});
    } else {
      // Agrupación “Sin equipo” vs “Miembros”
      const groups = { 'Sin equipo': [], Miembros: [] };
      list.forEach((emp) => {
        if (!emp.teams?.team_name) groups['Sin equipo'].push(emp);
        else groups['Miembros'].push(emp);
      });
      return groups;
    }
  };

  const activeGroups = groupList(activeEmployees);

  let activeGroupNames = Object.keys(activeGroups);

  if (isAdminRole) {
    // Admin / Superadmin → ordenar grupos: "Sin equipo" primero, luego alfabético
    activeGroupNames = activeGroupNames.sort((a, b) => {
      if (a === 'Sin equipo') return -1;
      if (b === 'Sin equipo') return 1;
      return a.localeCompare(b, 'es', { sensitivity: 'base' });
    });
  } else {
    // Comportamiento anterior para otros roles
    activeGroupNames = activeGroupNames.sort((a, b) => {
      if (a === 'Sin equipo') return -1;
      if (b === 'Sin equipo') return 1;
      return a.localeCompare(b, 'es', { sensitivity: 'base' });
    });

    if (sortOption === 'display_name') {
      activeGroupNames = ['Sin equipo', 'Miembros'].filter(
        (g) => activeGroups[g]?.length > 0
      );
    }
  }

  let groupedEmployees = { ...activeGroups };
  let orderedGroupNames = [...activeGroupNames];

  if (inactiveEmployees.length > 0) {
    groupedEmployees['Deactivated'] = inactiveEmployees;
    orderedGroupNames.push('Deactivated');
  }

  return (
    <PanelContainer>
      <PanelTitle>Engineering Team</PanelTitle>

      <StatsCard>
        <StatsText>
          <span>{totalEmployees}</span>
          <p>Total Members</p>
        </StatsText>
        <FaUser />
      </StatsCard>

      <SearchBar>
        <FaSearch />
        <input
          type="text"
          placeholder="Search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <FilterButton onClick={() => setShowFilterMenu(!showFilterMenu)}>
          <FaFilter />
        </FilterButton>
      </SearchBar>

      {showFilterMenu && (
        <FilterMenu>
          <FilterSection>
            <FilterTitle>Sort Options</FilterTitle>
            <FilterOption onClick={() => handleSortChange('display_name')}>
              Sort by Name
            </FilterOption>
            <FilterOption onClick={() => handleSortChange('teams.team_name')}>
              Sort by Team
            </FilterOption>
          </FilterSection>

          <FilterSection>
            <FilterTitle>Filter by Team</FilterTitle>
            <FilterOption onClick={() => handleFilterChange('all')}>
              Show All
            </FilterOption>
            {availableTeams.map((team) => (
              <FilterOption
                key={team}
                onClick={() => handleFilterChange(team)}
              >
                {team}
              </FilterOption>
            ))}
          </FilterSection>
        </FilterMenu>
      )}

      <EmployeeList>
        {orderedGroupNames.map((groupName) => (
          <TeamGroup
            key={groupName}
            addSeparator={
              (groupName === 'Sin equipo' &&
                !isAdminRole &&
                sortOption === 'display_name' &&
                groupedEmployees['Miembros']?.length > 0) ||
              (orderedGroupNames.includes('Deactivated') &&
                groupName !== 'Deactivated' &&
                orderedGroupNames.indexOf(groupName) ===
                  orderedGroupNames.length - 2)
            }
          >
            {/* 🔥 Para roles 1/4/8 SIEMPRE mostramos encabezado por equipo,
                más "Sin equipo" y "Deactivated" */}
            {(isAdminRole ||
              groupName === 'Sin equipo' ||
              sortOption === 'teams.team_name' ||
              groupName === 'Deactivated') && (
              <TeamHeader isDeactivated={groupName === 'Deactivated'}>
                {groupName}
              </TeamHeader>
            )}

            {groupedEmployees[groupName].map((employee) => (
              <EmployeeItem
                key={employee.id}
                onClick={() => onSelectEmployee(employee)}
                isDeactivated={employee.is_active === false}
              >
                <EmployeeInfo>
                  <ProfilePic
                    src={employee.photo_url || userPlaceholder}
                    isDeactivated={employee.is_active === false}
                  />
                  <div>
                    <EmployeeName>{employee.display_name}</EmployeeName>
                    <EmployeeRole>
                      {employee.roles?.role_name || 'Sin rol'}
                    </EmployeeRole>
                    <EmployeeStatus>
                      {employee.locations?.location_name || 'Sin ubicación'}
                    </EmployeeStatus>
                  </div>
                </EmployeeInfo>
                {employee.teams?.photo_url && (
                  <TeamIcon
                    src={employee.teams.photo_url}
                    alt={employee.teams.team_name}
                    isDeactivated={employee.is_active === false}
                  />
                )}
              </EmployeeItem>
            ))}
          </TeamGroup>
        ))}
      </EmployeeList>
    </PanelContainer>
  );
}

/* --- ESTILOS --- */

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
`;

const PanelTitle = styled.h2`
  font-size: 1.8em;
  font-weight: bold;
  margin: 0;
`;

const StatsCard = styled.div`
  background-color: #2b2f38;
  color: #fff;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1.5em;

  p {
    font-size: 0.8em;
  }
`;

const StatsText = styled.div`
  display: flex;
  flex-direction: column;
  span {
    font-weight: bold;
  }
`;

const SearchBar = styled.div`
  display: flex;
  align-items: center;
  background-color: #f0f0f0;
  border-radius: 8px;
  padding: 10px;
  gap: 10px;

  input {
    border: none;
    background: none;
    width: 100%;
    &:focus {
      outline: none;
    }
  }
`;

const FilterButton = styled.button`
  background: none;
  border: none;
  color: #6a6a6a;
  cursor: pointer;
  font-size: 0.8em;
`;

const FilterMenu = styled.div`
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  padding: 10px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const FilterSection = styled.div`
  display: flex;
  flex-direction: column;
`;

const FilterTitle = styled.h4`
  font-size: 0.9em;
  font-weight: bold;
  margin: 0 0 4px 0;
  color: #444;
`;

const FilterOption = styled.button`
  background: none;
  border: none;
  text-align: left;
  padding: 4px 0;
  cursor: pointer;
  color: #333;
  font-size: 0.85em;

  &:hover {
    color: #000;
    font-weight: 500;
  }
`;

const EmployeeList = styled.div`
  flex: 1;
  overflow-y: auto;
  margin-top: 10px;
  padding-right: 4px;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background-color: #ccc;
    border-radius: 3px;
  }
`;

const TeamGroup = styled.div`
  margin-bottom: 12px;
  padding-bottom: ${(props) => (props.addSeparator ? '12px' : '0')};
  border-bottom: ${(props) =>
    props.addSeparator ? '1px dashed #ddd' : 'none'};
`;

const TeamHeader = styled.div`
  font-weight: bold;
  margin-bottom: 6px;
  font-size: 0.9em;
  color: ${(props) => (props.isDeactivated ? '#b30000' : '#444')};
`;

const EmployeeItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background-color: ${(props) =>
    props.isDeactivated ? '#f5e5e5' : '#f0f0f0'};
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 6px;
`;

const EmployeeInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const ProfilePic = styled.img`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  opacity: ${(props) => (props.isDeactivated ? 0.6 : 1)};
`;

const EmployeeName = styled.p`
  font-weight: bold;
  margin: 0;
`;

const EmployeeRole = styled.p`
  font-size: 0.9em;
  color: #8c8c8c;
  margin: 0;
`;

const EmployeeStatus = styled.p`
  font-size: 0.9em;
  color: #8c8c8c;
  margin: 0;
`;

const TeamIcon = styled.img`
  width: 24px;
  height: 24px;
  object-fit: contain;
  opacity: ${(props) => (props.isDeactivated ? 0.6 : 1)};
`;
