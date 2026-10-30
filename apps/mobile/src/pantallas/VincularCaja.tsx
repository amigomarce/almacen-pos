import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '../cliente';
import { estilos } from '../estilos';
import { vincularDesdeQr } from '../vinculacion';

/**
 * Vincula esta caja a la cuenta del dueño. El camino normal es escanear el QR de
 * Configuración → Primera configuración en la caja: al leerlo se vincula de inmediato. La carga
 * manual queda como respaldo.
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
  // La cámara entrega el mismo código muchas veces por segundo: se procesa una lectura a la vez.
  const leyendo = useRef(false);
  const ultimoInvalido = useRef<string | null>(null);

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

  const alLeerQr = async (data: string) => {
    if (leyendo.current || data === ultimoInvalido.current) return;
    leyendo.current = true;
    try {
      const r = await vincularDesdeQr(data, (i, t, n) => api.vincularCaja(i, t, n));
      if (r.tipo === 'NO_ES_CAJA') {
        // Se sigue escaneando: puede haber enfocado otro código.
        ultimoInvalido.current = data;
        setError('Ese código no es de una caja de Almacén POS');
        return;
      }
      setEscaneando(false);
      if (r.tipo === 'VINCULADA') {
        setError(null);
        setMensaje(`Caja "${r.nombre}" vinculada`);
      } else {
        setInstallationId(r.datos.installationId);
        setDeviceToken(r.datos.deviceToken);
        setNombre(r.datos.caja);
        setMensaje(null);
        setError(r.mensaje);
      }
    } finally {
      leyendo.current = false;
    }
  };

  const escanear = async () => {
    setError(null);
    setMensaje(null);
    ultimoInvalido.current = null;
    const estado = permiso?.granted ? permiso : await pedirPermiso();
    if (!estado.granted) {
      setError(
        'Permite el uso de la cámara para esta app en Ajustes del celular y vuelve a intentar.',
      );
      return;
    }
    setEscaneando(true);
  };

  if (escaneando) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            void alLeerQr(data);
          }}
        />
        <View style={{ padding: 12, gap: 4, backgroundColor: '#fff' }}>
          <Text style={estilos.subtitulo}>
            Apunta al QR de la caja (Configuración → Primera configuración). Si cuesta, en la caja
            usa Ampliar QR.
          </Text>
          {error ? <Text style={estilos.error}>{error}</Text> : null}
        </View>
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
        En la caja, abre Configuración → Primera configuración y escanea el QR: se vincula sola.
        También puedes escribir los datos a mano (en la caja: Ver datos para escribir a mano).
      </Text>
      <Pressable style={estilos.boton} onPress={() => void escanear()}>
        <Text style={estilos.botonTexto}>Escanear QR de la caja</Text>
      </Pressable>
      {error ? <Text style={estilos.error}>{error}</Text> : null}
      {mensaje ? <Text style={estilos.subtitulo}>{mensaje}</Text> : null}
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
