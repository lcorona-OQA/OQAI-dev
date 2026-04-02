import React, { useState, useEffect } from "react";
import styled, { keyframes } from "styled-components";
import { useNavigate } from "react-router-dom";
import googlelogo from "../assets/logogoogle.png";
import homeOfficeImage from "../assets/login_screen.jpg";
import oqaLogo from "../assets/oqa-logo.png";
import loadingIcon from "../assets/logo paloma.png";
import { UserAuth } from "../context/AuthContext";

const pulse = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  width: 100vw;
  background-color: #000000;
  color: white;
  font-size: 1.2rem;

  .loading-icon {
    width: 80px;
    height: 80px;
    animation: ${pulse} 1.5s ease-in-out infinite;
  }
`;

export function Login() {
  const { signInWithGoogle, user } = UserAuth();
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const img = new Image();
    img.src = homeOfficeImage;
    img.onload = () => {
      setIsLoading(false);
    };
  }, []);

  useEffect(() => {
    if (user) {
      navigate('/checker', { replace: true });
    }
  }, [user, navigate]);


  if (isLoading) {
    return (
      <LoadingContainer>
        <img src={loadingIcon} className="loading-icon" alt="Cargando..." />
      </LoadingContainer>
    );
  }

  return (
    <Container>
      <div className="background-image"></div>
      <div className="content-container">
        <img src={oqaLogo} className="oqa-logo" alt="OQA logo" />
        <h2>Home Office Manager</h2>
        <button onClick={signInWithGoogle}>
          <img src={googlelogo} className="google-logo" alt="Google logo" />
          Inicia Sesión con Google
        </button>
      </div>
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
    background: linear-gradient(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.9)),
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

  .content-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
    border-radius: 8px;
    margin-top: 18rem;
  }

  .oqa-logo {
    width: 300px;
    margin-bottom: 10px;
  }

  h2 {
    font-size: 1.6em;
    font-weight: 500;
    margin-bottom: 20px;
  }

  button {
    display: flex;
    align-items: center;
    background-color: #f1f1f1;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    font-size: 18px;
    cursor: pointer;
    color: #4a4a4a;
    font-weight: bold;
    transition: background-color 0.3s;

    &:hover {
      background-color: #e2e2e2;
    }
  }

  .google-logo {
    width: 20px;
    margin-right: 10px;
  }
`;