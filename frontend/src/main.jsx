import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css'; 
import { AuthProvider } from './contexts/AuthContext';
import { AreaProvider } from './contexts/AreaContext';
import { DataProvider } from './contexts/DataContext';
import { registerSW } from 'virtual:pwa-register'

// Registro automático de Service Worker para PWA
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AreaProvider>
      <AuthProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </AuthProvider>
    </AreaProvider>
  </React.StrictMode>
);
