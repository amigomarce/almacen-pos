import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { type Producto } from '../api';
import { api } from '../cliente';
import { estilos } from '../estilos';
import { formatearClp } from '../formato';

export function Productos() {
  const [buscar, setBuscar] = useState('');
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [precio, setPrecio] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async (texto: string) => {
    setCargando(true);
    setError(null);
    try {
      setProductos(await api.productos(texto));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar('');
  }, [cargar]);

  const elegir = (p: Producto) => {
    setEditando(p);
    setPrecio(String(p.priceClp));
    setError(null);
  };

  const guardar = async () => {
    if (!editando) return;
    const precioClp = Number(precio);
    if (!Number.isInteger(precioClp) || precioClp < 1) {
      setError('Precio inválido');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const actualizado = await api.editarProducto(editando.id, { priceClp: precioClp });
      setProductos((prev) => prev.map((p) => (p.id === actualizado.id ? actualizado : p)));
      setEditando(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, gap: 8 }}>
        <TextInput
          style={estilos.campo}
          placeholder="Buscar por nombre, marca o código"
          value={buscar}
          onChangeText={setBuscar}
          onSubmitEditing={() => void cargar(buscar)}
          returnKeyType="search"
        />
        {error ? <Text style={estilos.error}>{error}</Text> : null}
      </View>

      {editando ? (
        <View style={{ padding: 16, gap: 8, backgroundColor: '#fff' }}>
          <Text style={estilos.titulo}>{editando.name}</Text>
          <Text style={estilos.etiqueta}>Precio de venta (CLP)</Text>
          <TextInput
            style={estilos.campo}
            keyboardType="number-pad"
            value={precio}
            onChangeText={setPrecio}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable style={[estilos.boton, { flex: 1 }]} onPress={() => void guardar()}>
              {guardando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={estilos.botonTexto}>Guardar</Text>
              )}
            </Pressable>
            <Pressable
              style={[estilos.botonSecundario, { flex: 1 }]}
              onPress={() => {
                setEditando(null);
              }}
            >
              <Text style={estilos.botonTextoSecundario}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {productos.map((p) => (
            <Pressable
              key={p.id}
              style={estilos.fila}
              onPress={() => {
                elegir(p);
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={estilos.valor}>{p.name}</Text>
                <Text style={estilos.etiqueta}>
                  {[p.brand, p.barcode].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={estilos.valor}>{formatearClp(p.priceClp)}</Text>
            </Pressable>
          ))}
          {productos.length === 0 ? <Text style={estilos.subtitulo}>Sin resultados</Text> : null}
          <Pressable style={estilos.botonSecundario} onPress={() => void cargar(buscar)}>
            <Text style={estilos.botonTextoSecundario}>Buscar</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}
