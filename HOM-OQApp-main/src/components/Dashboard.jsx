import React, { useEffect } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { UserAuth } from '../context/AuthContext';
import { supabase } from '../supabase/supabase.config';
import { Sidebar } from './Sidebar';
import { WelcomePanel } from './WelcomePanel';
import { PartnersPanel } from './PartnersPanel';
import { CustomCalendar } from './Calendar';

export function Dashboard() {
  const { user } = UserAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Si no hay usuario, redirige al login.
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    // Función para verificar el rol del usuario
    const checkUserRole = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('role_id')
        .eq('id', user.id)
        .single();

      // Si el rol es NULL o hay un error, lo envía al login
      if (error || !data || data.role_id === null) {
        navigate('/login', { replace: true });
      }
    };
    
    // Verificación inmediata al entrar a la página
    checkUserRole();

    // Verificación recurrente cada 60 segundos
    const intervalId = setInterval(checkUserRole, 60000);

    // Función de limpieza para detener el sondeo cuando el componente se desmonte
    return () => clearInterval(intervalId);
  }, [user, navigate]);

  return (
    <Container>
      <MainContent>
        <Sidebar />
        <ContentArea>
          <LeftPanel>
            <WelcomePanel />
            <PartnersPanel />
          </LeftPanel>
          <CalendarPanel>
            <CustomCalendar />
          </CalendarPanel>
        </ContentArea>
      </MainContent>
    </Container>
  );
}

const Container = styled.div`
  background-color: #2b2f38;
  position: relative;
  height: 100vh;
  width: 100vw;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #000; /* Cambiamos el color de texto por defecto a oscuro */
  overflow: hidden;
`;

const MainContent = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr;
  width: 100%;
  height: 100%;
  background-color: #F8F8F8;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
  overflow: hidden;
`;

const ContentArea = styled.div`
  display: grid;
  grid-template-columns: 400px 1fr;
  padding: 20px;
  gap: 20px;
  height: 100vh;
`;

const LeftPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: 100%;
  overflow-y: hidden;
`;

const CalendarPanel = styled.div`
  background-color: #FFFFFF;
  max-height: 95vh;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
`;