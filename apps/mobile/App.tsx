import { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { alCambiarSesion, sesionActual } from './src/auth';
import { api } from './src/cliente';
import { estilos } from './src/estilos';
import { Login } from './src/pantallas/Login';
import { Principal } from './src/pantallas/Principal';

export default function App() {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    sesionActual()
      .then((s) => {
        setSesion(s);
      })
      .catch(() => {
        // Sin sesión guardada: se muestra el login.
      })
      .finally(() => {
        setCargando(false);
      });
    return alCambiarSesion(setSesion);
  }, []);

  useEffect(() => {
    api.usarToken(sesion?.access_token ?? null);
  }, [sesion]);

  if (cargando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[estilos.pantalla, { paddingTop: (StatusBar.currentHeight ?? 0) + 8 }]}>
      <StatusBar barStyle="dark-content" />
      {sesion ? <Principal /> : <Login />}
    </View>
  );
}
