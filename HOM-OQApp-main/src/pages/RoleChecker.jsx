import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAuth } from '../context/AuthContext';
export function RoleChecker() {
  const { user } = UserAuth();
  const navigate = useNavigate();
  useEffect(() => {
    // Mientras no haya info del usuario, no hacemos nada
    if (user === undefined) return;
    // Si no hay usuario logueado → login
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    // Normalizamos el rol desde distintas fuentes posibles
    const rawRole =
      user.role_id ??
      user.user_metadata?.role_id ??
      user.user_metadata?.role ??
      user.app_metadata?.role_id ??
      user.app_metadata?.role;
    const userRole =
      typeof rawRole === 'string' ? parseInt(rawRole, 10) : rawRole;
    // Si no tiene rol asignado → pantalla de pendiente
    if (!userRole) {
      navigate('/pending', { replace: true });
      return;
    }
    // Redirecciones según tu lógica actual
    if (userRole === 1) {
      navigate('/superadmin/dashboard', { replace: true });
    } else if (userRole === 3) {
      navigate('/inv/dashboard', { replace: true });
    } else if (userRole === 4 || userRole === 9) {
      navigate('/admin/dashboard', { replace: true });
    } else {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#2B2F38',
        color: 'white',
      }}
    >
      Verificando tu acceso...
    </div>
  );
} 