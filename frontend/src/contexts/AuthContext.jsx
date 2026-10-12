import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Obtenemos los datos extendidos desde Firestore
        try {
          const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.activo) {
              setUserData(data);
              setCurrentUser(user);
            } else {
              // Si no está activo, forzamos cerrar sesión visualmente
              setCurrentUser(null);
              setUserData(null);
              await auth.signOut();
            }
          } else {
            // Caso donde el usuario existe en Auth pero no en Firestore
            setCurrentUser(user);
            setUserData({ rol: 'usuario', nombre: user.displayName || 'Usuario' });
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          // Bypass para Super Administrador si la consola devuelve error de Permisos por Reglas strictas
          if (user.email === 'josuemoralessaj@gmail.com') {
             console.warn("Bypass de permisos activado. Ingresando como Administrador.");
             setCurrentUser(user);
             setUserData({ rol: 'administrador', nombre: 'Admin (Master)' });
          } else {
             setCurrentUser(null);
             setUserData(null);
             await auth.signOut();
          }
        }
      } else {
        setCurrentUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = useMemo(() => ({
    currentUser,
    userData,
    isSuperAdmin: currentUser?.email === 'josuemoralessaj@gmail.com' || userData?.rol === 'Super Admin' || userData?.rol === 'Super Administrador',
    isSupervisor: userData?.rol === 'Supervisor de enfermería' || currentUser?.email === 'josuemoralessaj@gmail.com',
    isEncargado: userData?.rol === 'Encargado de servicio' || userData?.rol === 'Supervisor de enfermería' || currentUser?.email === 'josuemoralessaj@gmail.com',
    isEnfermero: userData?.rol === 'Enfermero',
    isAdmin: userData?.rol === 'Supervisor de enfermería' || userData?.rol === 'Encargado de servicio' || currentUser?.email === 'josuemoralessaj@gmail.com'
  }), [currentUser, userData]);

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
