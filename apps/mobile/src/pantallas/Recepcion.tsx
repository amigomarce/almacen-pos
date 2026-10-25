import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { type Producto } from '../api';
import { api } from '../cliente';
import { estilos } from '../estilos';
import { formatearCantidad } from '../formato';

interface Linea {
  producto: Producto;
  cantidadMilli: number;
}

export function Recepcion() {
  const [codigo, setCodigo] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [permiso, pedirPermiso] = useCameraPermissions();

  const agregar = useCallback(async (barcode: string) => {
    const texto = barcode.trim();
    if (!texto) return;
    setError(null);
    try {
      const encontrados = await api.productos(texto, 1);
      const p = encontrados[0];
      if (!p) {
        setError(`No encontré el código ${texto}`);
        return;
      }
      setLineas((prev) => {
        const i = prev.findIndex((l) => l.producto.id === p.id);
        if (i < 0) return [...prev, { producto: p, cantidadMilli: 1000 }];
        const copia = [...prev];
        const actual = copia[i];
        if (actual) copia[i] = { ...actual, cantidadMilli: actual.cantidadMilli + 1000 };
        return copia;
      });
      setCodigo('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo buscar');
    }
  }, []);

  const recibir = async () => {
    if (lineas.length === 0) return;
    setCargando(true);
    setError(null);
    setMensaje(null);
    try {
      const r = await api.recibir(
        lineas.map((l) => ({ productId: l.producto.id, cantidadMilli: l.cantidadMilli })),
      );
      setMensaje(`Recepción registrada: ${r.lineas.length} productos`);
      setLineas([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo recibir');
    } finally {
      setCargando(false);
    }
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
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128'] }}
          onBarcodeScanned={({ data }) => {
            setEscaneando(false);
            void agregar(data);
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
      <Text style={estilos.titulo}>Recepción</Text>
      <TextInput
        style={estilos.campo}
        placeholder="Código de barras"
        value={codigo}
        onChangeText={setCodigo}
        onSubmitEditing={() => void agregar(codigo)}
        returnKeyType="done"
      />
      <Pressable style={estilos.boton} onPress={() => void escanear()}>
        <Text style={estilos.botonTexto}>Escanear con cámara</Text>
      </Pressable>
      {error ? <Text style={estilos.error}>{error}</Text> : null}
      {mensaje ? <Text style={estilos.subtitulo}>{mensaje}</Text> : null}

      {lineas.map((l) => (
        <View key={l.producto.id} style={estilos.fila}>
          <Text style={estilos.valor}>{l.producto.name}</Text>
          <Text>{formatearCantidad(l.cantidadMilli, l.producto.unit)}</Text>
        </View>
      ))}

      {lineas.length > 0 ? (
        <Pressable style={estilos.boton} onPress={() => void recibir()} disabled={cargando}>
          {cargando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={estilos.botonTexto}>Recibir mercadería</Text>
          )}
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
