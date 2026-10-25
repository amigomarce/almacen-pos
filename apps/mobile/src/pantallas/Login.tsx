import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { entrar } from '../auth';
import { estilos } from '../estilos';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async () => {
    if (cargando) return;
    setCargando(true);
    setError(null);
    try {
      await entrar(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
    } finally {
      setCargando(false);
    }
  };

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.titulo}>Almacén</Text>
      <Text style={estilos.subtitulo}>Entra con tu correo</Text>
      <TextInput
        style={estilos.campo}
        placeholder="correo@ejemplo.cl"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={estilos.campo}
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={estilos.error}>{error}</Text> : null}
      <Pressable style={estilos.boton} onPress={() => void enviar()} disabled={cargando}>
        {cargando ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={estilos.botonTexto}>Entrar</Text>
        )}
      </Pressable>
    </View>
  );
}
