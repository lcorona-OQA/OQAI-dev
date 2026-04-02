import { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserAuth } from '../context/AuthContext';
import oqaLogo from '../assets/oqa-logo.png';
import userPlaceholder from '../assets/user-placeholder.png';
import { FaHome, FaUser, FaUsers, FaLaptop, FaSignOutAlt } from 'react-icons/fa';
import logsIcon from '../assets/logs.svg';

export function AdminSidebar() {

  const handleSignout = async () => {
    try {
      await signout();
      navigate('/login');
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };
  
  const { signout, user } = UserAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const userPhoto = user?.user_metadata?.picture || userPlaceholder;

  return (
    <SidebarContainer>
      <Logo src={oqaLogo} alt="OQA logo" />
      <NavItems>
        <NavItem
          active={location.pathname === '/admin/dashboard'}
          onClick={() => navigate('/admin/dashboard')}
        >
          <FaHome />
          <Tooltip className="tooltip">Home</Tooltip>
        </NavItem>
        {user?.role_id === 8 && (
            <NavItem
                active={location.pathname === '/team'}
                onClick={() => navigate('/team')}
            >
                <FaUsers />
                <Tooltip className="tooltip">Team Requests</Tooltip>
            </NavItem>
        )}
        <NavItem
          active={location.pathname === '/admin/team'}
          onClick={() => navigate('/admin/team')}
        >
          <FaUser />
          <Tooltip className="tooltip">Members</Tooltip>
        </NavItem>
        <NavItem
          active={location.pathname === '/admin/devices'}
          onClick={() => navigate('/admin/devices')}
        >
          <FaLaptop />
          <Tooltip className="tooltip">All Devices</Tooltip>
        </NavItem>
        <NavItem
          active={location.pathname === '/inv/devices'}
          onClick={() => navigate('/inv/devices')}
        >
          <NavIcon active={location.pathname === '/inv/devices'} src={logsIcon} alt="Logs" />
          <Tooltip className="tooltip">Logs</Tooltip>
        </NavItem>
      </NavItems>

      <BottomSection>
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
    </SidebarContainer>
  );
}

/* - Estilos - */

const SidebarContainer = styled.div`
  background-color: #2b2f38;
  padding: 25px 0;
  display: flex;
  height: 100vh;
  border-top-right-radius: 25px;
  border-bottom-right-radius: 25px;
  box-shadow: 2px 0 5px rgba(0, 0, 0, 0.35);
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
`;

const Logo = styled.img`width: 50px;`;

const NavItems = styled.div`display: flex; flex-direction: column; gap: 15px;`;

const NavItem = styled.div`
  position: relative;
  color: #8c8c8c;
  font-size: 1.375rem;
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease-in-out;

  &:hover {
    transform: scale(1.1);
    background-color: #3e4450;
  }

  ${(props) => props.active && `
    background-color: #3e4450;
    color: #F7D000;
    transform: scale(1.05);
  `}

  transition: color 0.2s ease, background-color 0.2s ease, box-shadow 0.3s ease, transform 0.2s ease;
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
  left: 60px;
  background-color: #3e4450;
  color: #fff;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 0.9rem;
  white-space: nowrap;
  z-index: 5;
  transition: opacity 0.2s ease, visibility 0.2s ease;
  ${NavItem}:hover & { opacity: 1; visibility: visible; }
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
  
  &:hover { background-color: #3e4450; color: #FF0000; }
  svg { font-size: 1.2rem; }
`;