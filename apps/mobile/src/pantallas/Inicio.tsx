import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import {
  type CierreCaja,
  type ProductoStockBajo,
  type ReporteFiado,
  type ResumenVentas,
} from '../api';
import { api } from '../cliente';
import { estilos } from '../estilos';
import { formatearCantidad, formatearClp } from '../formato';

export function Inicio() {
  const [ventas, setVentas] = useState<ResumenVentas | null>(null);
  const [stock, setStock] = useState<ProductoStockBajo[]>([]);
  const [cierre, setCierre] = useState<CierreCaja | null>(null);
  const [fiado, setFiado] = useState<ReporteFiado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [v, s, c, f] = await Promise.all([
        api.ventasDelDia(),
        api.stockBajo(),
        api.ultimoCierre(),
        // Una nube sin fiado (versión anterior) no debe impedir ver el resto.
        api.fiado().catch(() => null),
      ]);
      setVentas(v);
      setStock(s);
      setCierre(c.cierre);
      setFiado(f);
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

      {fiado && fiado.deudores.length > 0 ? (
        <View style={estilos.tarjeta}>
          <Text style={estilos.etiqueta}>Fiado</Text>
          <Text style={estilos.valor}>{formatearClp(fiado.totalClp)}</Text>
          <Text style={estilos.subtitulo}>
            {fiado.deudores.length === 1
              ? '1 vecino debe'
              : `${String(fiado.deudores.length)} vecinos deben`}
          </Text>
          {fiado.deudores.map((d) => (
            <View key={d.id} style={estilos.fila}>
              <View style={{ flex: 1 }}>
                <Text>{d.nombre}</Text>
                <Text style={estilos.etiqueta}>
                  {d.ultimoAbono
                    ? `Último abono ${new Date(d.ultimoAbono).toLocaleDateString()}`
                    : 'Sin abonos'}
                  {d.sobreLimite ? ' · pasó su límite' : ''}
                </Text>
              </View>
              <Text style={d.sobreLimite ? estilos.error : null}>{formatearClp(d.saldoClp)}</Text>
            </View>
          ))}
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
