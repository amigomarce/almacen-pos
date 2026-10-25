import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { type CierreCaja, type ProductoStockBajo, type ResumenVentas } from '../api';
import { api } from '../cliente';
import { estilos } from '../estilos';
import { formatearCantidad, formatearClp } from '../formato';

export function Inicio() {
  const [ventas, setVentas] = useState<ResumenVentas | null>(null);
  const [stock, setStock] = useState<ProductoStockBajo[]>([]);
  const [cierre, setCierre] = useState<CierreCaja | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [v, s, c] = await Promise.all([
        api.ventasDelDia(),
        api.stockBajo(),
        api.ultimoCierre(),
      ]);
      setVentas(v);
      setStock(s);
      setCierre(c.cierre);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cargando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenedor}>
      {error ? <Text style={estilos.error}>{error}</Text> : null}

      <View style={estilos.tarjeta}>
        <Text style={estilos.etiqueta}>Ventas de hoy</Text>
        <Text style={estilos.valor}>{formatearClp(ventas?.totalClp ?? 0)}</Text>
        <Text style={estilos.subtitulo}>{ventas?.cantidad ?? 0} ventas</Text>
        {ventas
          ? Object.entries(ventas.porMedio).map(([medio, total]) => (
              <View key={medio} style={estilos.fila}>
                <Text>{medio}</Text>
                <Text>{formatearClp(total)}</Text>
              </View>
            ))
          : null}
      </View>

      {cierre ? (
        <View style={estilos.tarjeta}>
          <Text style={estilos.etiqueta}>Último cierre de caja</Text>
          <Text style={estilos.valor}>{formatearClp(cierre.countedCashClp)}</Text>
          <Text style={estilos.subtitulo}>
            Diferencia contado vs esperado: {formatearClp(cierre.differenceClp)}
          </Text>
          <Text style={estilos.etiqueta}>
            {cierre.registerName ?? 'Caja'} · {new Date(cierre.closedAt).toLocaleString()}
          </Text>
        </View>
      ) : null}

      <Text style={estilos.titulo}>Stock bajo</Text>
      {stock.length === 0 ? <Text style={estilos.subtitulo}>Todo en orden</Text> : null}
      {stock.map((p) => (
        <View key={p.id} style={estilos.fila}>
          <Text style={estilos.valor}>{p.name}</Text>
          <Text style={estilos.error}>{formatearCantidad(p.stockQtyMilli, p.unit)}</Text>
        </View>
      ))}

      <Pressable style={estilos.botonSecundario} onPress={() => void cargar()}>
        <Text style={estilos.botonTextoSecundario}>Actualizar</Text>
      </Pressable>
    </ScrollView>
  );
}
