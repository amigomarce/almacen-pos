import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { api } from '../cliente';
import { estilos } from '../estilos';

/**
 * Vincula esta caja a la cuenta del dueño. En la caja se corre
 * `pnpm --filter @almacen/server device:info` y se pegan los datos acá.
 * (El escaneo de QR es la versión "de verdad"; esto sirve para configurar sin cámara.)
 */
export function VincularCaja() {
  const [installationId, setInstallationId] = useState('');
  const [deviceToken, setDeviceToken] = useState('');
  const [nombre, setNombre] = useState('Caja 1');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const vincular = async () => {
    if (!installationId.trim() || !deviceToken.trim() || !nombre.trim()) {
      setError('Completa los tres campos');
      return;
    }
    setCargando(true);
    setError(null);
    setMensaje(null);
    try {
      const r = await api.vincularCaja(installationId.trim(), deviceToken.trim(), nombre.trim());
      setMensaje(`Caja "${r.name}" vinculada`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo vincular');
    } finally {
      setCargando(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={estilos.contenedor}>
      <Text style={estilos.titulo}>Vincular caja</Text>
      <Text style={estilos.subtitulo}>
        En la caja, corre `pnpm --filter @almacen/server device:info` y pega acá los datos.
      </Text>
      <Text style={estilos.etiqueta}>Instalación</Text>
      <TextInput
        style={estilos.campo}
        value={installationId}
        onChangeText={setInstallationId}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="uuid de la caja"
      />
      <Text style={estilos.etiqueta}>Token</Text>
      <TextInput
        style={estilos.campo}
        value={deviceToken}
        onChangeText={setDeviceToken}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="token del dispositivo"
      />
      <Text style={estilos.etiqueta}>Nombre</Text>
      <TextInput
        style={estilos.campo}
        value={nombre}
        onChangeText={setNombre}
        placeholder="Caja 1"
      />
      {error ? <Text style={estilos.error}>{error}</Text> : null}
      {mensaje ? <Text style={estilos.subtitulo}>{mensaje}</Text> : null}
      <Pressable style={estilos.boton} onPress={() => void vincular()} disabled={cargando}>
        {cargando ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={estilos.botonTexto}>Vincular</Text>
        )}
      </Pressable>
      <View style={{ height: 8 }} />
    </ScrollView>
  );
}
