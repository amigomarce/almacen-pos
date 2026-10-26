import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '../cliente';
import { estilos } from '../estilos';
import { parsearQrVinculacion } from '../vinculacion';

/**
 * Vincula esta caja a la cuenta del dueño. El camino normal es escanear el QR de
 * Configuración → Primera configuración en la caja. La carga manual queda como respaldo.
 */
export function VincularCaja() {
  const [installationId, setInstallationId] = useState('');
  const [deviceToken, setDeviceToken] = useState('');
  const [nombre, setNombre] = useState('Caja 1');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [permiso, pedirPermiso] = useCameraPermissions();

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

  const interpretarQr = (data: string) => {
    const datos = parsearQrVinculacion(data);
    if (!datos) {
      setError('Ese código no es de una caja de Almacén POS');
      return;
    }
    setInstallationId(datos.installationId);
    setDeviceToken(datos.deviceToken);
    setNombre(datos.caja);
    setError(null);
    setMensaje('Código leído. Revisa los datos y confirma.');
  };

  const escanear = async () => {
    if (!permiso?.granted) await pedirPermiso();
    setEscaneando(true);
  };

  if (escaneando) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            setEscaneando(false);
            interpretarQr(data);
          }}
        />
        <Pressable
          style={estilos.botonSecundario}
          onPress={() => {
            setEscaneando(false);
          }}
        >
          <Text style={estilos.botonTextoSecundario}>Cancelar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenedor}>
      <Text style={estilos.titulo}>Vincular caja</Text>
      <Text style={estilos.subtitulo}>
        En la caja, abre Configuración → Primera configuración y escanea el QR con esta cámara.
        También puedes pegar los datos a mano.
      </Text>
      <Pressable style={estilos.boton} onPress={() => void escanear()}>
        <Text style={estilos.botonTexto}>Escanear QR de la caja</Text>
      </Pressable>
      <View style={{ height: 8 }} />
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
