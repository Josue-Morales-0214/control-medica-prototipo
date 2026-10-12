import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useArea } from './contexts/AreaContext';
import { auth } from './services/firebase';
import { signOut } from 'firebase/auth';

// Componentes y Páginas (A Desarrollar paso a paso)
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventario from './pages/Inventario';
import Movimientos from './pages/Movimientos';
import Historial from './pages/Historial';
import Reportes from './pages/Reportes';
import Usuarios from './pages/Usuarios';
import Auditoria from './pages/Auditoria';
import Configuracion from './pages/Configuracion';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';

// Protección de Rutas
const ProtectedRoute = ({ children, requireSupervisor = false, requireEncargado = false }) => {
  const { currentUser, isSupervisor, isEncargado } = useAuth();
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  if (requireSupervisor && !isSupervisor) {
    return <Navigate to="/dashboard" replace />;
  }
  if (requireEncargado && !isEncargado) {
    return <Navigate to="/dashboard" replace />;
  }
  return (
    <div className="flex bg-slate-50 min-h-screen lg:h-screen lg:overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 pt-2 lg:pt-1.5 px-2 lg:px-1.5 pb-16 lg:pb-1.5 overflow-x-hidden lg:overflow-y-auto flex flex-col min-h-0">
          <div className="w-full mx-auto max-w-full flex-1 flex flex-col min-h-0">
             {children}
          </div>
      </main>
      <BottomNav />
    </div>
  );
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/inventario" 
          element={
            <ProtectedRoute>
              <Inventario />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/movimientos" 
          element={
            <ProtectedRoute>
              <Movimientos />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/historial" 
          element={
            <ProtectedRoute>
              <Historial />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/reportes" 
          element={
            <ProtectedRoute>
              <Reportes />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/usuarios" 
          element={
            <ProtectedRoute requireSupervisor>
              <Usuarios />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/auditoria" 
          element={
            <ProtectedRoute requireSupervisor>
              <Auditoria />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/configuracion" 
          element={
            <ProtectedRoute requireSupervisor>
              <Configuracion />
            </ProtectedRoute>
          } 
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
