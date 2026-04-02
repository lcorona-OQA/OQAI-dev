// src/components/EmployeeListStandalone.jsx
import { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { supabase } from '../supabase/supabase.config';
import { UserAuth } from '../context/AuthContext';
import userPlaceholder from '../assets/user-placeholder.png';

export function EmployeeListStandalone() {
  const { user } = UserAuth();
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    async function fetchEmployees() {
      if (!user) return;

      const { data, error } = await supabase
        .from('users')
        .select(`
          id,
          display_name,
          email,
          photo_url,
          team_id,
          teams ( team_name, photo_url ),
          locations ( location_name, photo_url )
        `)
        .eq('is_active', true)
        .neq('id', user.id)
        .order('display_name');

      if (error) {
        console.error('Error fetching employees:', error);
        return;
      }
      setEmployees(data || []);
    }
    fetchEmployees();
  }, [user]);

  // 🔹 Agrupar por equipo en memoria
  const groupedByTeam = useMemo(() => {
    const map = new Map();

    for (const emp of employees) {
      const teamName = emp.teams?.team_name || 'Sin equipo';
      if (!map.has(teamName)) {
        map.set(teamName, []);
      }
      map.get(teamName).push(emp);
    }

    // Ordenar equipos alfabéticamente (Sin equipo al final)
    const entries = Array.from(map.entries());
    entries.sort(([a], [b]) => {
      if (a === 'Sin equipo') return 1;
      if (b === 'Sin equipo') return -1;
      return a.localeCompare(b, 'es');
    });

    // Dentro de cada equipo, ordenar por nombre
    for (const [, list] of entries) {
      list.sort((e1, e2) =>
        (e1.display_name || '').localeCompare(e2.display_name || '', 'es')
      );
    }

    return entries; // [ [teamName, [employees...]], ... ]
  }, [employees]);

  return (
    <EmployeeList>
      {groupedByTeam.length === 0 && (
        <EmptyState>No hay colaboradores activos para mostrar.</EmptyState>
      )}

      {groupedByTeam.map(([teamName, members]) => (
        <TeamSection key={teamName}>
          <TeamHeader>
            <TeamInfo>
              <TeamName>{teamName}</TeamName>
              <TeamCount>{members.length} miembro(s)</TeamCount>
            </TeamInfo>
          </TeamHeader>

          {members.map((employee) => (
            <EmployeeItem key={employee.id}>
              <EmployeeInfo>
                <ProfilePic src={employee.photo_url || userPlaceholder} />
                <div>
                  <EmployeeName>
                    {employee.display_name || employee.email || 'Sin nombre'}
                  </EmployeeName>
                  <EmployeeMeta>
                    {employee.email}
                  </EmployeeMeta>
                  <EmployeeMeta>
                    {employee.locations?.location_name || 'Sin ubicación'}
                  </EmployeeMeta>
                </div>
              </EmployeeInfo>

              {employee.teams?.photo_url && (
                <TeamIcon
                  src={employee.teams.photo_url}
                  alt={employee.teams.team_name}
                />
              )}
            </EmployeeItem>
          ))}
        </TeamSection>
      ))}
    </EmployeeList>
  );
}

/* ==== estilos ==== */

const EmployeeList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-radius: 10px;
  background-color: #f5f5f7;
  padding: 10px;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
  overflow-y: auto;
  flex-grow: 1;

  /* Ocultar scrollbars */
  &::-webkit-scrollbar {
    display: none;
  }
  -ms-overflow-style: none; 
  scrollbar-width: none;
`;

const EmptyState = styled.div`
  padding: 16px;
  text-align: center;
  color: #8c8c8c;
  font-size: 0.9rem;
`;

const TeamSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const TeamHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  margin-top: 4px;
  border-radius: 6px;
  background: linear-gradient(
    135deg,
    rgba(43, 47, 56, 0.9),
    rgba(70, 75, 88, 0.95)
  );
  color: #ffffff;
`;

const TeamInfo = styled.div`
  display: flex;
  flex-direction: column;
`;

const TeamName = styled.span`
  font-size: 0.9rem;
  font-weight: 600;
`;

const TeamCount = styled.span`
  font-size: 0.75rem;
  opacity: 0.8;
`;

const EmployeeItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 8px;
  background-color: #ffffff;
  border-radius: 8px;
  cursor: default;
  border: 1px solid #e0e0e0;

  &:hover {
    background-color: #f0f4ff;
    border-color: #d0d8ff;
  }
`;

const EmployeeInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const ProfilePic = styled.img`
  width: 38px;
  height: 38px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
`;

const EmployeeName = styled.p`
  font-weight: 600;
  margin: 0;
  font-size: 0.95rem;
  color: #333333;
`;

const EmployeeMeta = styled.p`
  font-size: 0.8rem;
  color: #8c8c8c;
  margin: 0;
`;

const TeamIcon = styled.img`
  width: 24px;
  height: 24px;
  object-fit: contain;
  flex-shrink: 0;
`;