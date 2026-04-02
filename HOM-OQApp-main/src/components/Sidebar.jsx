import { useState } from 'react';
import styled from 'styled-components';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserAuth } from '../context/AuthContext';
import oqaLogo from '../assets/oqa-logo.png';
import userPlaceholder from '../assets/user-placeholder.png';
import { FaHome, FaUsers, FaSignOutAlt, FaMapMarkerAlt } from 'react-icons/fa';
import houseIcon from '../assets/house.png';
import devicesIcon from '../assets/devices.svg';
import logsIcon from '../assets/logs.svg';
import LocationModal from "../components/LocationModal";

export function Sidebar() {
  const { signout, user } = UserAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [openLocationModal, setOpenLocationModal] = useState(false);

  const handleSignout = async () => {
    try {
      await signout();
      navigate('/login');
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  const userPhoto = user?.user_metadata?.picture || userPlaceholder;
  const isTeamLead = user?.role_id === 5;

  return (
    <SidebarContainer>

      <Logo src={oqaLogo} alt="OQA logo" />

      <NavItems>
        <NavItem
          active={location.pathname === '/dashboard'}
          onClick={() => navigate('/dashboard')}
        >
          <FaHome />
          <Tooltip className="tooltip">Home</Tooltip>
        </NavItem>

        {isTeamLead && (
          <NavItem
            active={location.pathname === '/team'}
            onClick={() => navigate('/team')}
          >
            <FaUsers />
            <Tooltip className="tooltip">Team Members</Tooltip>
          </NavItem>
        )}

        <NavItem
          active={location.pathname === '/request'}
          onClick={() => navigate('/request')}
        >
          <NavIcon active={location.pathname === '/request'} src={houseIcon} alt="House" />
          <Tooltip className="tooltip">Request Home Office</Tooltip>
        </NavItem>

        <NavItem
          active={location.pathname === '/devices'}
          onClick={() => navigate('/devices')}
        >
          <NavIcon active={location.pathname === '/devices'} src={devicesIcon} alt="Devices" />
          <Tooltip className="tooltip">Devices</Tooltip>
        </NavItem>

        <NavItem
          active={location.pathname === '/logs'}
          onClick={() => navigate('/logs')}
        >
          <NavIcon active={location.pathname === '/logs'} src={logsIcon} alt="Logs" />
          <Tooltip className="tooltip">Logs</Tooltip>
        </NavItem>
      </NavItems>

      <BottomSection>

        {/* NUEVO ICONO DE UBICACIÓN */}
        <NavItem onClick={() => setOpenLocationModal(true)}>
          <FaMapMarkerAlt />
          <Tooltip className="tooltip">Change Location</Tooltip>
        </NavItem>

        <Profile
          onMouseEnter={() => setShowProfileMenu(true)}
          onMouseLeave={() => setShowProfileMenu(false)}
        >
          <ProfilePic src={userPhoto} />
          <OnlineStatus />
          {showProfileMenu && (
            <ProfileMenu>
              <ProfileMenuItem onClick={handleSignout}>
                <FaSignOutAlt />
                Cerrar Sesión
              </ProfileMenuItem>
            </ProfileMenu>
          )}
        </Profile>
      </BottomSection>

      {/* ⬇️ EL MODAL DEBE IR AQUÍ, FUERA DEL CONTENIDO DEL SIDEBAR */}
      {openLocationModal && (
        <LocationModal onClose={() => setOpenLocationModal(false)} />
      )}

    </SidebarContainer>
  );
}

/* --- tus estilos no fueron modificados --- */

const SidebarContainer = styled.div`
  background-color: #2b2f38;
  padding: 25px 0 25px 0;
  display: flex;
  height: 100vh;
  border-top-right-radius: 25px;
  border-bottom-right-radius: 25px;
  box-shadow: 2px 0 5px rgba(0, 0, 0, 0.35);
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
`;

const Logo = styled.img`
  width: 50px;
`;

const NavItems = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 15px;
`;

const NavItem = styled.div`
  position: relative;
  color: #8c8c8c;
  font-size: 1.5rem;
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease-in-out;

  &:hover {
    background-color: #3e4450;
  }

  ${(props) => props.active && `
    background-color: #3e4450;
    color: #F7D000;
  `}
`;

const NavIcon = styled.img`
  width: 24px;
  height: 24px;
  object-fit: contain;
  filter: brightness(0.6);

  ${(props) => props.active && `
    filter: invert(25%) sepia(85%) saturate(1500%) brightness(1.2) hue-rotate(1deg);
  `}
`;

const Tooltip = styled.span`
  opacity: 0;
  visibility: hidden;
  position: absolute;
  left: 40px;
  background-color: #3e4450;
  color: #fff;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 0.9rem;
  white-space: nowrap;
  z-index: 5;
  transition: opacity 0.2s ease, visibility 0.2s ease;

  ${NavItem}:hover & {
    opacity: 1;
    visibility: visible;
  }
`;

const BottomSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 15px;
`;

const Profile = styled.div`
  position: relative;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 2px solid #fff;
  cursor: pointer;
`;

const ProfilePic = styled.img`
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
`;

const OnlineStatus = styled.div`
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  background-color: #28a745;
  border-radius: 50%;
  border: 2px solid #2b2f38;
`;

const ProfileMenu = styled.div`
  position: absolute;
  top: 50%;
  left: 45px;
  transform: translateY(-50%);
  background-color: #2b2f38;
  border-radius: 8px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  padding: 10px;
  white-space: nowrap;
  z-index: 10;
`;

const ProfileMenuItem = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  color: #8c8c8c;
  cursor: pointer;

  &:hover {
    background-color: #3e4450;
    color: #FF0000;
  }

  svg {
    font-size: 1.2rem;
  }
`;
