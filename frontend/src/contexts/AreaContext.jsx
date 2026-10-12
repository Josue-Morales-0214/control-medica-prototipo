import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { db, auth } from '../services/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const AreaContext = createContext();

export const useArea = () => useContext(AreaContext);

export const AreaProvider = ({ children }) => {
  const [area, setArea] = useState(() => {
    return localStorage.getItem('selectedArea') || '';
  });
  const [usersCache, setUsersCache] = useState({});

  useEffect(() => {
    localStorage.setItem('selectedArea', area);
  }, [area]);

  // Carga maestra única de usuarios al iniciar para ahorrar lecturas y optimizar rendimiento
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const snap = await getDocs(collection(db, 'usuarios'));
          const dict = {};
          snap.forEach(d => {
            const u = d.data();
            if (u.email) dict[u.email.toLowerCase()] = u.nombre;
          });
          setUsersCache(dict);
        } catch (err) {
          console.error("Error al cargar caché de usuarios:", err);
        }
      } else {
        setUsersCache({}); // Limpiar caché al salir
      }
    });

    return () => unsub();
  }, []);

  const value = useMemo(() => ({ area, setArea, usersCache }), [area, usersCache]);

  return (
    <AreaContext.Provider value={value}>
      {children}
    </AreaContext.Provider>
  );
};
