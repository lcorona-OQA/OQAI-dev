import { useState, createContext, useEffect, useRef } from "react";
import "./App.css";
import { AuthContextProvider } from "./context/AuthContext";
import { MyRoutes } from "./routers/routes";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { Dark, Light } from "./styles/Themes";
import { supabase } from "./supabase/supabase.config"; 
import Swal from "sweetalert2"; // ✅ Importamos SweetAlert2

export const ThemeContext = createContext(null);

function App() {
  const [theme, setTheme] = useState("dark");
  const themeStyle = theme === "light" ? Light : Dark;
  
  // Referencia para evitar que el modal se abra múltiples veces si el intervalo sigue corriendo
  const isModalShown = useRef(false);

  const isElectron =
    typeof navigator !== "undefined" &&
    navigator.userAgent.toLowerCase().includes("electron");

  const Router = isElectron ? HashRouter : BrowserRouter;

  // --- FUNCIÓN PARA MOSTRAR EL MODAL ---
  const handleSessionExpired = () => {
    // Si ya se mostró, no hacemos nada
    if (isModalShown.current) return;
    
    isModalShown.current = true; // Marcamos como mostrado

    Swal.fire({
      title: 'Sesión Expirada',
      text: 'Tu sesión ha caducado. Por favor, actualiza la página para volver a ingresar.',
      icon: 'warning',
      confirmButtonText: 'Recargar Página',
      confirmButtonColor: '#3b5bdb',
      allowOutsideClick: false, // No permitir cerrar clicando fuera
      allowEscapeKey: false,    // No permitir cerrar con ESC
      showCancelButton: false   // Solo opción de recargar
    }).then((result) => {
      if (result.isConfirmed) {
        window.location.reload();
      }
    });
  };

  // --- LÓGICA DE MONITOREO DE SESIÓN ---
  useEffect(() => {
    // 1. Escuchar eventos de Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // SIGNED_OUT suele ser manual, pero si ocurre por error de token, mostramos modal o recargamos.
      // Si prefieres que el cierre de sesión manual sea inmediato sin modal, deja el reload directo aquí.
      // Si quieres modal para todo: llama a handleSessionExpired().
      if (event === "SIGNED_OUT") {
         // Generalmente el SIGNED_OUT manual debe ser inmediato, 
         // pero si ocurre "solo" (token invalido), el usuario verá el login al recargar.
         window.location.reload(); 
      }
    });

    // 2. Chequeo preventivo de expiración (cada 30 segundos)
    const interval = setInterval(async () => {
      // Obtenemos la sesión actual sin forzar refresh al servidor todavía
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      
      // Si existe una sesión pero su tiempo de expiración ya pasó
      if (session && session.expires_at * 1000 < Date.now()) {
        console.warn("Sesión expirada detectada.");
        handleSessionExpired(); // <--- AQUÍ LLAMAMOS AL MODAL
      }
    }, 30000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ setTheme, theme }}>
      <ThemeProvider theme={themeStyle}>
        <AuthContextProvider>
          <Router>
            <MyRoutes />
          </Router>
        </AuthContextProvider>
      </ThemeProvider>
    </ThemeContext.Provider>
  );
}

export default App;