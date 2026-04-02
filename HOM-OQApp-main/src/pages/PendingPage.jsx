import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { UserAuth } from '../context/AuthContext';
import { supabase } from '../supabase/supabase.config';
import homeOfficeImage from '../assets/login_screen.jpg';
import oqaLogo from '../assets/oqa-logo.png';
import userPlaceholder from '../assets/user-placeholder.png';

export function PendingPage() {
  const { user } = UserAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Si no hay usuario, redirige al login.
    if (user === null) {
      navigate('/login', { replace: true });
      return;
    }

    // Esta función hará la consulta a la base de datos y la redirección
    const checkRoleAndRedirect = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('role_id')
        .eq('id', user.id)
        .single();
      
      // Si el rol ya no es null, redirige al dashboard.
      if (!error && data && data.role_id !== null) {
        navigate('/dashboard', { replace: true });
        return true; // Retorna true para detener el sondeo.
      }
      
      if (error) {
        console.error('Error al sondear el rol:', error);
      }
      
      return false;
    };
    
    // 1. Hacemos el primer sondeo inmediatamente.
    checkRoleAndRedirect();

    // 2. Luego, activamos el sondeo regular cada 5 segundos.
    const intervalId = setInterval(async () => {
      const redirected = await checkRoleAndRedirect();
      if (redirected) {
        clearInterval(intervalId); // Detiene el sondeo si ya se redirigió.
      }
    }, 5000); // Sondea cada 5 segundos.

    // Función de limpieza para detener el sondeo cuando el componente se desmonta.
    return () => clearInterval(intervalId);
  }, [user, navigate]);

  const userPhoto = user?.user_metadata?.picture || userPlaceholder;

  return (
    <Container>
      <div className="background-image"></div>
      <ContentCard>
        <Logo src={oqaLogo} alt="OQA logo" />
        <ProfilePicture src={userPhoto} alt="User profile" />

        <MainTitle>Thank you for logging in</MainTitle>
        <p>
          Your access has been successfully registered.
          <br />
          For now, please wait while an administrator assigns you a <strong>role</strong> and a <strong>team</strong>.
        </p>
        <p>
          Once assigned, you'll be able to access all features of Home Office Manager.
          <br />
          Thanks for your patience!
        </p>
      </ContentCard>
    </Container>
  );
}

const Container = styled.div`
  position: relative;
  height: 100vh;
  width: 100vw;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #fff;
  text-align: center;
  overflow: hidden;

  .background-image {
    background: linear-gradient(
      rgba(0, 0, 0, 0.1),
      rgba(0, 0, 0, 0.9)
    ),
    url(${homeOfficeImage}),
    #000000;
    background-size: cover;
    background-position: center;
    filter: brightness(1.1);
    z-index: -1;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }
`;

const ContentCard = styled.div`
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(10px);
  padding: 40px;
  border-radius: 16px;
  width: 90%;
  max-width: 600px;
  position: relative;
  text-align: center;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);

  p {
    margin: 1em 0;
    font-size: 1.1em;
  }

  p:last-of-type {
    margin-top: 2em;
    font-style: italic;
    font-size: 1em;
  }
`;

const Logo = styled.img`
  width: 150px;
  margin-bottom: 20px;
`;

const ProfilePicture = styled.img`
  position: absolute;
  top: -20px;
  right: 20px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 3px solid #fff;
  background-color: #333;
  object-fit: cover;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
`;

const MainTitle = styled.h1`
  font-size: 2.2em;
  margin-bottom: 0.5em;
`;