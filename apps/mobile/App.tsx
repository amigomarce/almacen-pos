import { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
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

  return (
    <SafeAreaProvider>
      <SafeAreaView style={estilos.pantalla} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        {cargando ? (
          <View style={estilos.centro}>
            <ActivityIndicator size="large" />
          </View>
        ) : sesion ? (
          <Principal />
        ) : (
          <Login />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
