import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { supabase } from '../supabase/supabase.config';
import userPlaceholder from '../assets/user-placeholder.png';
import { FaHome } from 'react-icons/fa';
import { MemberModal } from './MemberModal';

export function MembersInHOPanel() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState(null);

  useEffect(() => {
    async function fetchMembersInHO() {
      // --- CORRECCIÓN DE FECHA (USAR HORA LOCAL) ---
      const dateObj = new Date();
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`;
      // ---------------------------------------------

      console.log("Fetching members for date:", today); // Debug para ver qué fecha está buscando

      const { data, error } = await supabase
        .from('home_office_requests')
        .select(`
          user_id,
          users (
            id,
            display_name,
            photo_url,
            email,
            teams (team_name, photo_url),
            locations (location_name)
          )
        `)
        .eq('date', today)
        .eq('status', 'approved');

      if (error) {
        console.error('Error fetching members in HO:', error);
      } else {
        // Filtramos por si acaso users viene null (integridad de datos)
        const usersList = data.map(req => req.users).filter(user => user !== null);
        setMembers(usersList || []);
      }
      setLoading(false);
    }

    fetchMembersInHO();
  }, []);

  return (
    <PanelContainer>
      <PanelTitle>
        <FaHome /> Members Working From Home
      </PanelTitle>
      
      <MembersList>
        {loading ? (
          <p>Loading...</p>
        ) : members.length > 0 ? (
          members.map((member) => (
            <MemberItem 
              key={member.id} 
              onClick={() => setSelectedMember(member)} 
              style={{ cursor: 'pointer' }}
            >
              <UserInfo>
                <ProfilePic 
                  src={member.photo_url ? member.photo_url.replace(/s96-c/, `s200-c`) : userPlaceholder} 
                  alt={member.display_name} 
                />
                <TextContainer>
                  <MemberName>{member.display_name}</MemberName>
                  <MemberTeam>{member.teams?.team_name || 'No Team'}</MemberTeam>
                </TextContainer>
              </UserInfo>
            </MemberItem>
          ))
        ) : (
          <EmptyState>No members working from home today.</EmptyState>
        )}
      </MembersList>

      {selectedMember && (
        <MemberModal 
          member={selectedMember} 
          onClose={() => setSelectedMember(null)} 
        />
      )}

    </PanelContainer>
  );
}

// --- ESTILOS ---
const PanelContainer = styled.div`
  background-color: #FFFFFF;
  border-radius: 8px;
  padding: 20px;
  color: #000;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: 15px;
  flex-grow: 1; 
  overflow: hidden;
`;

const PanelTitle = styled.h3`
  font-size: 1.2em;
  font-weight: bold;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  
  svg {
    color: #6a6a6a;
  }
`;

const MembersList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  max-height: 90%; 
`;

const MemberItem = styled.div`
  display: flex;
  align-items: center;
  padding: 10px;
  background-color: #F8F9FA;
  border-radius: 8px;
  border: 1px solid #eee;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
  }
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ProfilePic = styled.img`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
`;

const TextContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

const MemberName = styled.span`
  font-weight: 600;
  font-size: 0.95em;
`;

const MemberTeam = styled.span`
  font-size: 0.8em;
  color: #6a6a6a;
`;

const EmptyState = styled.p`
  color: #8c8c8c;
  font-style: italic;
  text-align: center;
  padding: 20px;
`;