// src/pages/AdminEmployeesPage.jsx
import { useState } from 'react';
import styled from 'styled-components';
import { FaTimes } from 'react-icons/fa';
import { AdminSidebar } from '../components/AdminSidebar';
import { EmployeesPanel } from '../components/EmployeesPanel';
import { CentralPanel } from '../components/CentralPanel';
import { PendingRequestsPanel } from '../components/PendingRequestsPanel';
import { RequestsPanel } from '../components/RequestsPanel';

export function AdminEmployeesPage() {
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);

  const sortedEmployees = [...employees].sort((a, b) => {
    const nameA = (a.display_name || '').toLowerCase();
    const nameB = (b.display_name || '').toLowerCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });
  const handleSelectEmployee = (employee) => {
    if (!employee) return;
    setSelectedEmployee(employee);
    setIsDetailModalOpen(true);
  };
  const handleEmployeeUpdated = (updatedEmployee) => {
    if (!updatedEmployee) return;
    setSelectedEmployee(updatedEmployee);
    setEmployees((prevEmployees) =>
      prevEmployees.map((emp) =>
        emp.id === updatedEmployee.id ? updatedEmployee : emp
      )
    );
  };
  const handleCloseModal = () => {
    setIsDetailModalOpen(false);
  };
  return (
    <MainContent>
      <AdminSidebar />
      <ContentWrapper>
        {/* Columna 1: Engineering Team */}
        <LeftPanel>
          <EmployeesPanel
            employees={sortedEmployees}
            setEmployees={setEmployees}
            onSelectEmployee={handleSelectEmployee}
          />
        </LeftPanel>
        {/* Columna 2: Requests History */}
        <MiddlePanel>
          <RequestsPanel />
        </MiddlePanel>
        {/* Columna 3: Pending Requests */}
        <RightPanel>
          <PendingRequestsPanel />
        </RightPanel>
      </ContentWrapper>
      {/* MODAL CON EL DETALLE DEL EMPLEADO (CentralPanel) */}
      <EmployeeDetailModal
        isOpen={isDetailModalOpen && !!selectedEmployee}
        employee={selectedEmployee}
        onClose={handleCloseModal}
        onEmployeeUpdated={handleEmployeeUpdated}
      />
    </MainContent>
  );
}
/* ============ MODAL DETALLE EMPLEADO ============ */
function EmployeeDetailModal({ isOpen, employee, onClose, onEmployeeUpdated }) {
  if (!isOpen || !employee) return null;
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose?.();
    }
  };
  return (
    <ModalBackdrop onClick={handleBackdropClick}>
      <ModalContent>
        <ModalCloseButton type="button" onClick={onClose}>
          <FaTimes />
        </ModalCloseButton>
        <CentralPanel employee={employee} onEmployeeUpdated={onEmployeeUpdated} />
      </ModalContent>
    </ModalBackdrop>
  );
}
/* ================== ESTILOS LAYOUT ================== */
const MainContent = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr;
  width: 100vw;
  height: 100vh;
  background-color: #F8F8F8;
  overflow: hidden;
`;
const ContentWrapper = styled.div`
  display: grid;
  grid-template-columns: 21% 38% 38%; /* izquierda, centro, derecha */
  gap: 20px;
  padding: 20px;
  height: 100vh;
  box-sizing: border-box;
  overflow: hidden;
  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
  }
`;
const LeftPanel = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  @media (max-width: 1200px) {
    order: 1;
    height: auto;
  }
`;
const MiddlePanel = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  > * {
    flex: 1;
    min-height: 0;
  }
  @media (max-width: 1200px) {
    order: 2;
    height: auto;
    > * {
      height: auto;
      max-height: 60vh;
    }
  }
`;
const RightPanel = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  > * {
    flex: 1;
    min-height: 0;
  }
  @media (max-width: 1200px) {
    order: 3;
    height: auto;
    > * {
      height: auto;
      max-height: 60vh;
    }
  }
`;
/* ================== ESTILOS MODAL ================== */
const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1500;
`;
const ModalContent = styled.div`
  position: relative;
  background: #FFFFFF;
  border-radius: 12px;
  max-width: 900px;
  width: 90vw;
  max-height: 90vh;
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  > div {
    flex: 1;
    min-height: 0;
  }
`;
const ModalCloseButton = styled.button`
  position: absolute;
  top: 10px;
  right: 12px;
  z-index: 30;

  border: none;
  padding: 0;
  background: rgba(255, 8, 8, 0.04);

  border-radius: 999px;
  width: 30px;
  height: 30px;

  display: flex;
  align-items: center;
  justify-content: center;

  color: #555;
  cursor: pointer;
  line-height: 1;

  &:hover {
    background: rgba(0, 0, 0, 0.08);
  }

  &:focus,
  &:focus-visible {
    outline: none;
    box-shadow: none;
  }
`;