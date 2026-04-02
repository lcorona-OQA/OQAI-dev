import styled from 'styled-components';
import { AdminSidebar } from '../components/AdminSidebar';
import { WelcomePanel } from '../components/WelcomePanel';
import { EmployeeListStandalone } from '../components/EmployeeListStandalone';
import { CustomCalendar } from '../components/Calendar';

export function AdminDashboard() {

  return (
    <MainContent>
      <AdminSidebar />
      <ContentArea>
        <LeftPanel>
          <WelcomePanel isAdmin={true} />
          <EmployeeListStandalone />
        </LeftPanel>
        <CalendarPanel>
          <CustomCalendar />
        </CalendarPanel>
      </ContentArea>
    </MainContent>
  );
}

const MainContent = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr;
  width: 100vw;
  height: 100%;
  background-color: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
  overflow: hidden;
`;

const ContentArea = styled.div`
  display: grid;
  grid-template-columns: 400px 1fr;
  padding: 20px;
  gap: 20px;
  height: 95vh;
`;

const LeftPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 95vh;
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