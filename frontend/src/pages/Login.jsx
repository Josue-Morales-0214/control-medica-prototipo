import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../services/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useArea } from '../contexts/AreaContext';
import { useAuth } from '../contexts/AuthContext';
import Swal from 'sweetalert2';
import { Building2, Siren, Activity } from 'lucide-react';

const Login = () => {
  const navigate = useNavigate();
  const { setArea } = useArea();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedArea, setSelectedAreaLocal] = useState(null);
  const [loading, setLoading] = useState(false);

  const { currentUser } = useAuth();

  // Navigate a dashboard si ya está autenticado
  useEffect(() => {
    if (currentUser) {
      navigate('/dashboard');
    }
  }, [currentUser, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!selectedArea) {
      Swal.fire({ icon: 'warning', title: 'Área no seleccionada', text: 'Por favor, elija un área de trabajo antes de ingresar.' });
      return;
    }
    if (!email || !password) {
      Swal.fire({ icon: 'warning', title: 'Campos incompletos', text: 'Por favor, ingrese sus credenciales.' });
      return;
    }

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Prototipo bypass para admin inicial
      if (email === 'josuemoralessaj@gmail.com') {
          setArea(selectedArea);
          return;
      }

      // Validar activo
      const userDoc = await getDoc(doc(db, 'usuarios', userCredential.user.uid));
      if (userDoc.exists()) {
         if (!userDoc.data().activo) {
            await auth.signOut();
            Swal.fire('Acceso Denegado', 'Su cuenta está inactiva o bloqueada. Contacte al Supervisor de enfermería.', 'error');
            return;
         }
      }

      setArea(selectedArea);

    } catch (error) {
      console.error(error);
      let msg = "Credenciales inválidas o error de red.";
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
          msg = "Usuario o contraseña incorrectos.";
      } else if (error.code === 'auth/too-many-requests') {
          msg = "Demasiados intentos. Intente más tarde.";
      }
      Swal.fire({ icon: 'error', title: 'Error de Autenticación', text: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden font-data">
      {/* Fondo Gradiente Profundo + Puntos Blancos Sutiles */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-primary-950 to-slate-900 z-0">
        <div 
          className="absolute inset-0 opacity-25" 
          style={{ 
            backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255, 255, 255, 0.2) 1.2px, transparent 0)', 
            backgroundSize: '32px 32px' 
          }}
        ></div>
        <div className="absolute top-[-10%] left-[-10%] w-[55%] h-[55%] rounded-full bg-primary-500/20 blur-[140px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[55%] h-[55%] rounded-full bg-indigo-500/15 blur-[140px] pointer-events-none"></div>
      </div>

      {/* Tarjeta Cristalina de Login */}
      <div className="w-full max-w-sm sm:max-w-md bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden relative z-10 border border-white/60 animate-zoom-in text-slate-700">
        <div className="p-8 sm:p-9 text-center">
          {/* Logo */}
          <div className="w-16 h-16 bg-slate-50/90 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100 shadow-sm p-2">
             <img src="/logo.png" alt="Control Médica" className="w-full h-full object-contain" />
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mb-1">Control Médica</h1>
          <p className="text-slate-500 font-medium text-xs mb-6">Gestión de Inventario Hospitalario</p>

          {/* Selección de Área de Trabajo */}
          <div className="mb-6 text-left">
            <label className="text-[11px] font-semibold text-slate-500 block mb-2 ml-1">Selecciona el área de trabajo</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button 
                type="button"
                onClick={() => setSelectedAreaLocal('Encamamiento')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-200 ${
                  selectedArea === 'Encamamiento' 
                    ? 'border-primary-500 bg-primary-50 text-primary-700 font-bold shadow-xs' 
                    : 'border-slate-200/70 bg-slate-50/60 text-slate-500 hover:border-slate-300 hover:bg-slate-50 font-medium'
                }`}
              >
                <Building2 size={20} className={`mb-1 ${selectedArea === 'Encamamiento' ? 'text-primary-600' : 'text-slate-400'}`} />
                <span className="text-xs">Encamamiento</span>
              </button>
              
              <button 
                type="button"
                onClick={() => setSelectedAreaLocal('Emergencia')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-200 ${
                  selectedArea === 'Emergencia' 
                    ? 'border-rose-500 bg-rose-50 text-rose-700 font-bold shadow-xs' 
                    : 'border-slate-200/70 bg-slate-50/60 text-slate-500 hover:border-slate-300 hover:bg-slate-50 font-medium'
                }`}
              >
                <Siren size={20} className={`mb-1 ${selectedArea === 'Emergencia' ? 'text-rose-600' : 'text-slate-400'}`} />
                <span className="text-xs">Emergencia</span>
              </button>
            </div>
          </div>

          {/* Formulario */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="text-left space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-500 block ml-1">Usuario / Correo electrónico</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@controlmedica.com" 
                className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-800 shadow-inner placeholder:text-slate-400 font-medium"
                required 
              />
            </div>

            <div className="text-left space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-500 block ml-1">Contraseña</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-800 shadow-inner placeholder:text-slate-400 font-medium"
                required 
              />
            </div>
            
            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-3 px-6 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-xs tracking-wide shadow-md transition-all active:scale-[0.98] disabled:opacity-70 mt-2 flex items-center justify-center gap-2"
            >
              {loading ? "Iniciando sesión..." : "Ingresar a Control Médica"}
            </button>
          </form>

          <div className="mt-7 pt-4 border-t border-slate-100 text-center">
             <p className="text-[11px] text-slate-400 font-medium">
                Versión <span className="font-semibold text-slate-600">2.0</span> · Control Hospitalario
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

