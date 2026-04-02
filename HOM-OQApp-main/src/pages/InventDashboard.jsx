import React, { useEffect } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { UserAuth } from "../context/AuthContext";
import { supabase } from "../supabase/supabase.config";
import { InventSidebar } from "../components/InventSidebar";
import { WelcomePanel } from "../components/WelcomePanel";
import { MembersInHOPanel } from "../components/MembersInHOPanel";
import { CustomCalendar } from "../components/Calendar";

export function InventDashboard() {
  const { user } = UserAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    const checkUserRole = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("role_id")
        .eq("id", user.id)
        .single();
      if (error || !data || data.role_id === null) {
        console.error("Error al sondear el rol:", error);
        navigate("/login", { replace: true });
      }
    };
    checkUserRole();
  }, [user, navigate]);

  return (
    <Container>
      <MainContent>
        <InventSidebar />
        <ContentArea>
          <LeftPanel>
            <WelcomePanel isInventory={true} />
            <MembersInHOPanel />
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
  color: #000;
  overflow: hidden;
`;

const MainContent = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr;
  width: 100%;
  height: 100%;
  background-color: #f8f8f8;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
  overflow: hidden;
`;

const ContentArea = styled.div`
  display: grid;
  grid-template-columns: 400px 1fr;
  padding: 20px;
  gap: 20px;
  height: 100%;
`;

const LeftPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 95vh;
  overflow-y: auto;
`;

const CalendarPanel = styled.div`
  background-color: #ffffff;
  max-height: 95vh;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
`;
