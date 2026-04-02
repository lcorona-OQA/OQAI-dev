import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { supabase } from '../supabase/supabase.config';
import { UserAuth } from '../context/AuthContext';
import userPlaceholder from '../assets/user-placeholder.png';
import { MemberModal } from './MemberModal';

// Función para redimensionar la foto de Google (sin tronar si no es URL de Google)
const getResizedPhoto = (url, size) => {
  if (!url) return '';
  try {
    // Solo si trae el patrón típico de Google
    if (url.includes('s96-c')) {
      return url.replace(/s96-c/, `s${size}-c`);
    }
    return url;
  } catch {
    return url;
  }
};

export function PartnersPanel() {
  const { user } = UserAuth();
  const [partners, setPartners] = useState([]);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function fetchPartners() {
      if (!user) {
        setPartners([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMsg('');

      try {
        // 1) Intentar usar el team_id que ya viene del AuthContext
        let userTeamId = user.team_id ?? null;

        // Si no lo trae, hacemos un fallback consultando la tabla users
        if (!userTeamId) {
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('team_id')
            .eq('id', user.id)
            .maybeSingle();

          if (userError) {
            console.error(
              '[PartnersPanel] Error obteniendo team_id del usuario:',
              userError
            );
          }
          userTeamId = userData?.team_id ?? null;
        }

        if (!userTeamId) {
          console.warn(
            '[PartnersPanel] Usuario sin team_id; no se pueden cargar partners.'
          );
          setPartners([]);
          setLoading(false);
          return;
        }

        // 2) Obtener los partners del mismo equipo (excluyendo al propio usuario)
        const { data: partnersData, error: partnersError } = await supabase
          .from('users')
          .select(
            `
            id,
            display_name,
            email,
            photo_url,
            team_id,
            teams ( team_name, photo_url ),
            locations ( location_name, photo_url )
          `
          )
          .eq('team_id', userTeamId)
          .neq('id', user.id)
          .eq('is_active', true)
          .order('display_name', { ascending: true });

        if (partnersError) {
          console.error(
            '[PartnersPanel] Error al obtener partners:',
            partnersError
          );

          // Si es error de RLS / permiso, mostramos un mensaje suave
          if (partnersError.code === '42501' || partnersError.code === 'PGRST301') {
            setErrorMsg(
              'You do not have permission to view your partners list. If this is unexpected, contact an administrator.'
            );
          } else {
            setErrorMsg('Could not load partners. Please try again later.');
          }

          setPartners([]);
          setLoading(false);
          return;
        }

        setPartners(partnersData || []);
      } catch (err) {
        console.error('[PartnersPanel] Error inesperado:', err);
        setErrorMsg('Unexpected error while loading partners.');
        setPartners([]);
      } finally {
        setLoading(false);
      }
    }

    fetchPartners();
  }, [user]);

  return (
    <PanelContainer>
      <Title>Partners</Title>

      {loading ? (
        <InfoText>Loading partners...</InfoText>
      ) : errorMsg ? (
        <InfoText>{errorMsg}</InfoText>
      ) : partners.length === 0 ? (
        <InfoText>No partners found in your team.</InfoText>
      ) : (
        <PartnersList>
          {partners.map((partner) => (
            <PartnerItem
              key={partner.id}
              onClick={() => setSelectedPartner(partner)}
            >
              <UserInfo>
                <ProfilePic
                  src={
                    getResizedPhoto(partner.photo_url, 200) || userPlaceholder
                  }
                  alt={partner.display_name || 'Partner'}
                  onError={(e) => {
                    e.currentTarget.src = userPlaceholder;
                  }}
                />
                <div>
                  <PartnerName>{partner.display_name || 'Unnamed user'}</PartnerName>
                  <Status>
                    {partner.locations?.location_name || 'No location'}
                  </Status>
                </div>
              </UserInfo>

              {partner.locations?.photo_url && (
                <LocationIcon
                  src={partner.locations.photo_url}
                  alt={partner.locations.location_name || 'Location'}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
            </PartnerItem>
          ))}
        </PartnersList>
      )}

      {/* Modal de detalle del partner */}
      {selectedPartner && (
        <MemberModal
          member={selectedPartner}
          onClose={() => setSelectedPartner(null)}
        />
      )}
    </PanelContainer>
  );
}

// ==== ESTILOS ====

const PanelContainer = styled.div`
  background-color: #ffffff;
  border-radius: 8px;
  padding: 20px;
  color: #000;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: 15px;
  height: 63%;
  min-height: 36%;
`;

const Title = styled.h2`
  font-size: 1.8em;
  font-weight: bold;
  margin: 0;
  color: #000;
`;

const InfoText = styled.p`
  margin: 0;
  font-size: 0.9rem;
  color: #777;
`;

const PartnersList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
`;

const PartnerItem = styled.button`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background-color: #f0f0f0;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.1s, background-color 0.2s;
  border: none;
  text-align: left;

  &:hover {
    background-color: #e8e8e8;
    transform: translateY(-1px);
  }
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const ProfilePic = styled.img`
  width: 50px;
  height: 50px;
  border-radius: 50%;
  object-fit: cover;
  border: none;
`;

const PartnerName = styled.p`
  margin: 0;
  font-weight: bold;
  color: #000;
`;

const Status = styled.p`
  margin: 0;
  font-size: 0.9em;
  color: #8c8c8c;
  text-transform: capitalize;
`;

const LocationIcon = styled.img`
  width: 20px;
  height: 20px;
  object-fit: contain;
`;