import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { supabase } from '../supabase/supabase.config';
import { FaTimes, FaHome, FaBuilding, FaLaptop, FaMobileAlt, FaTabletAlt, FaDesktop } from 'react-icons/fa';
import userPlaceholder from '../assets/user-placeholder.png';

const fadeIn = keyframes`
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
`;

export function MemberModal({ member, onClose }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUserDevices() {
      const dateObj = new Date();
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`;

      console.log("Buscando dispositivos para solicitud de:", member.display_name, "Fecha:", today);

      const { data, error } = await supabase
        .from('home_office_requests')
        .select(`
          id,
          user_device_requests (
            devices (*)
          )
        `)
        .eq('user_id', member.id)
        .eq('date', today)
        .eq('status', 'approved')
        .maybeSingle();

      if (error) {
        console.error('Error fetching request devices:', error);
      } else if (data && data.user_device_requests) {
        const devicesList = data.user_device_requests
          .map(item => item.devices)
          .filter(device => device !== null);

        console.log("Dispositivos encontrados:", devicesList);
        setDevices(devicesList);
      } else {
        setDevices([]);
      }
      setLoading(false);
    }

    fetchUserDevices();
  }, [member]);

  // Helper mejorado para el icono: busca en varios campos
  const getDeviceIcon = (device) => {
    // Concatenamos todo para buscar palabras clave
    const searchStr = `${device.device_type} ${device.name} ${device.description} ${device.model}`.toLowerCase();
    
    if (searchStr.includes('laptop') || searchStr.includes('macbook') || searchStr.includes('dell') || searchStr.includes('hp')) return <FaLaptop />;
    if (searchStr.includes('phone') || searchStr.includes('iphone') || searchStr.includes('android')) return <FaMobileAlt />;
    if (searchStr.includes('tablet') || searchStr.includes('ipad')) return <FaTabletAlt />;
    return <FaDesktop />;
  };

  const photoUrl = member.photo_url ? member.photo_url.replace(/s96-c/, `s400-c`) : userPlaceholder;
  
  const locationName = member.locations?.location_name || 'Unknown';
  const isHome = locationName.toLowerCase().includes('home') || locationName.toLowerCase().includes('casa');

  return (
    <Backdrop onClick={onClose}>
      <Card onClick={(e) => e.stopPropagation()}>
        <CloseButton onClick={onClose}>
          <FaTimes />
        </CloseButton>

        <LeftColumn>
          <PhotoWrapper>
             <ProfileImage src={photoUrl} alt={member.display_name} />
          </PhotoWrapper>
          
          <TeamInfoContainer>
            <TeamLabel>TEAM</TeamLabel>
            <TeamHeader>
              {member.teams?.photo_url && (
                <TeamLogo src={member.teams.photo_url} alt="Team Logo" />
              )}
              <TeamName>{member.teams?.team_name || 'No Team'}</TeamName>
            </TeamHeader>
          </TeamInfoContainer>

          <EmailInfo>{member.email}</EmailInfo>
        </LeftColumn>

        <RightColumn>
          <UserInfoHeader>
            <UserRole>Member</UserRole> 
            <UserName>{member.display_name}</UserName>
            <LocationBadge>
              {isHome ? <FaHome /> : <FaBuilding />} 
              {locationName}
            </LocationBadge>
          </UserInfoHeader>

          <DevicesSection>
            <SectionTitle>Assigned devices</SectionTitle>
            <DeviceList>
              {loading ? (
                <p>Loading devices...</p>
              ) : devices.length > 0 ? (
                devices.map((dev) => (
                  <DeviceItem key={dev.id}>
                    {/* 1. Si no hay asset_tag, usa serial_number */}
                    <DeviceId>{dev.asset_tag || dev.serial_number || 'N/A'}</DeviceId>
                    
                    <DeviceDetails>
                      <DeviceName>{dev.name || dev.model || 'Unknown Device'}</DeviceName>
                      {/* 3. Si no hay brand, usa la descripción (ej. 'DELL Latitude...') */}
                      <DeviceBrand>{dev.brand || dev.description || ''}</DeviceBrand>
                    </DeviceDetails>
                    
                    <DeviceIcon>{getDeviceIcon(dev)}</DeviceIcon>
                  </DeviceItem>
                ))
              ) : (
                <NoDevices>No devices assigned.</NoDevices>
              )}
            </DeviceList>
          </DevicesSection>
        </RightColumn>
      </Card>
    </Backdrop>
  );
}

// --- ESTILOS ---

const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(40, 30, 50, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  backdrop-filter: blur(4px);
`;

const Card = styled.div`
  width: 700px;
  height: 400px;
  background-color: white;
  border-radius: 24px;
  display: flex;
  position: relative;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0,0,0,0.3);
  animation: ${fadeIn} 0.15s ease-out; 
`;

const CloseButton = styled.button`
  position: absolute;
  top: 3px;
  right: -4px;
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #000;
  z-index: 10;
  &:hover { color: #555; }
`;

const LeftColumn = styled.div`
  width: 40%;
  background-color: #f4f6f8;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px;
  text-align: center;
`;

const PhotoWrapper = styled.div`
  width: 180px;
  height: 180px;
  border-radius: 50%;
  overflow: hidden;
  border: 4px solid white;
  box-shadow: 0 4px 15px rgba(0,0,0,0.1);
  margin-bottom: 20px;
`;

const ProfileImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const TeamInfoContainer = styled.div`
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const TeamLabel = styled.div`
  font-size: 0.7em;
  font-weight: 900;
  color: #444;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
`;

const TeamHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const TeamLogo = styled.img`
  width: 24px;
  height: 24px;
  object-fit: contain;
`;

const TeamName = styled.div`
  font-size: 1.3em;
  font-weight: bold;
  color: #2b2f38;
  text-transform: uppercase;
`;

const EmailInfo = styled.div`
  font-size: 0.8em;
  color: #0056b3;
  word-break: break-all;
`;

const RightColumn = styled.div`
  width: 60%;
  padding: 40px;
  display: flex;
  flex-direction: column;
`;

const UserInfoHeader = styled.div`
  margin-bottom: 30px;
`;

const UserRole = styled.div`
  font-size: 0.9em;
  font-weight: bold;
  color: #666;
  margin-top: 8px;
  margin-bottom: 5px;
`;

const UserName = styled.h2`
  font-size: 2.2em;
  font-weight: 800;
  margin: 12px 0 10px 0;
  color: #000;
  line-height: 1;
`;

const LocationBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 1.1em;
  font-weight: bold;
  color: #2b2f38;
  
  svg {
    color: #3b5bdb;
    font-size: 1.2em;
  }
`;

const DevicesSection = styled.div`
  flex-grow: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const SectionTitle = styled.h3`
  font-size: 1.1em;
  font-weight: bold;
  margin-bottom: 15px;
  color: #000;
`;

const DeviceList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
  overflow-y: auto;
  padding-right: 10px;
`;

const DeviceItem = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
`;

const DeviceId = styled.span`
  font-size: 1.1em;
  color: #666;
  font-weight: 500;
  min-width: 60px;
`;

const DeviceDetails = styled.div`
  display: flex;
  flex-direction: column;
`;

const DeviceName = styled.span`
  font-size: 1em;
  font-weight: bold;
  color: #000;
`;

const DeviceBrand = styled.span`
  font-size: 0.8em;
  color: #888;
`;

const DeviceIcon = styled.div`
  margin-left: auto; 
  color: #ccc;
  font-size: 1.2em;
`;

const NoDevices = styled.p`
  color: #888;
  font-style: italic;
`;