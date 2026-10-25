import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { type FiltroPrecios } from '../api';
import { api } from '../cliente';
import { estilos } from '../estilos';

export function CambioMasivo() {
  const [marca, setMarca] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [porcentaje, setPorcentaje] = useState('5');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const aplicar = async () => {
    const pct = Number(porcentaje);
    if (!Number.isFinite(pct)) {
      setError('Porcentaje inválido');
      return;
    }
    const filtro: FiltroPrecios = {
      ...(marca.trim() ? { marca: marca.trim() } : {}),
      ...(categoriaId.trim() ? { categoriaId: categoriaId.trim() } : {}),
    };
    if (!filtro.marca && !filtro.categoriaId) {
      setError('Indica una marca o una categoría');
      return;
    }
    setCargando(true);
    setError(null);
    setMensaje(null);
    try {
      const r = await api.cambioMasivo(filtro, pct);
      setMensaje(`Se actualizaron ${r.cantidad} productos`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aplicar');
    } finally {
      setCargando(false);
    }
  };

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.titulo}>Cambio masivo</Text>
      <Text style={estilos.subtitulo}>Sube o baja precios por marca o categoría</Text>
      <Text style={estilos.etiqueta}>Marca (opcional)</Text>
      <TextInput
        style={estilos.campo}
        value={marca}
        onChangeText={setMarca}
        placeholder="Ej. Genérica"
      />
      <Text style={estilos.etiqueta}>Categoría (opcional)</Text>
      <TextInput
        style={estilos.campo}
        value={categoriaId}
        onChangeText={setCategoriaId}
        placeholder="ID de categoría"
      />
      <Text style={estilos.etiqueta}>Porcentaje (+5 o -10)</Text>
      <TextInput
        style={estilos.campo}
        keyboardType="numbers-and-punctuation"
        value={porcentaje}
        onChangeText={setPorcentaje}
      />
      {error ? <Text style={estilos.error}>{error}</Text> : null}
      {mensaje ? <Text style={estilos.subtitulo}>{mensaje}</Text> : null}
      <Pressable style={estilos.boton} onPress={() => void aplicar()} disabled={cargando}>
        {cargando ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={estilos.botonTexto}>Aplicar</Text>
        )}
      </Pressable>
    </View>
  );
}
