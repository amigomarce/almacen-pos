import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import type { DiasReporte, ReporteDueno } from '../api';
import { api } from '../cliente';
import { estilos } from '../estilos';
import { formatearCantidad, formatearClp } from '../formato';
import { anchosBarras, diasTexto, fechaCorta, horasConVentas, horaTexto } from '../reportes';

const PERIODOS: { dias: DiasReporte; etiqueta: string }[] = [
  { dias: 1, etiqueta: 'Hoy' },
  { dias: 7, etiqueta: '7 días' },
  { dias: 30, etiqueta: '30 días' },
];

/** Una fila con etiqueta, barra proporcional y monto. */
function Barra({ etiqueta, ancho, monto }: { etiqueta: string; ancho: number; monto: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 }}>
      <Text style={{ width: 48, fontSize: 13, color: '#4b5563' }}>{etiqueta}</Text>
      <View style={{ flex: 1, height: 14, backgroundColor: '#eef2ff', borderRadius: 4 }}>
        <View
          style={{
            width: `${String(ancho)}%`,
            height: 14,
            backgroundColor: '#2563eb',
            borderRadius: 4,
          }}
        />
      </View>
      <Text style={{ width: 84, fontSize: 13, textAlign: 'right' }}>{formatearClp(monto)}</Text>
    </View>
  );
}

/**
 * Reportes del dueño: ventas netas, margen, lo más vendido, ventas por hora y por día y qué
 * comprar. Los datos son los que la caja ya subió a la nube.
 */
export function Reportes() {
  const [dias, setDias] = useState<DiasReporte>(7);
  const [reporte, setReporte] = useState<ReporteDueno | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (d: DiasReporte) => {
    setCargando(true);
    setError(null);
    try {
      setReporte(await api.reporte(d));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el reporte');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(dias);
  }, [cargar, dias]);

  const horas = reporte ? horasConVentas(reporte.porHora) : [];
  const anchosHora = anchosBarras(horas.map((h) => h.montoClp));
  const anchosDia = anchosBarras(reporte?.porDia.map((d) => d.montoClp) ?? []);

  return (
    <ScrollView contentContainerStyle={estilos.contenedor}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PERIODOS.map((p) => (
          <Pressable
            key={p.dias}
            style={[
              estilos.botonSecundario,
              { flex: 1 },
              dias === p.dias ? { borderColor: '#2563eb' } : null,
            ]}
            onPress={() => {
              setDias(p.dias);
            }}
          >
            <Text
              style={[estilos.botonTextoSecundario, dias === p.dias ? estilos.tabActiva : null]}
            >
              {p.etiqueta}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={estilos.error}>{error}</Text> : null}
      {cargando ? <ActivityIndicator size="large" /> : null}

      {reporte && !cargando ? (
        <>
          <View style={estilos.tarjeta}>
            <Text style={estilos.etiqueta}>Ventas netas</Text>
            <Text style={estilos.valor}>{formatearClp(reporte.ventas.totalClp)}</Text>
            <Text style={estilos.subtitulo}>
              {reporte.ventas.cantidad} ventas · ticket promedio{' '}
              {formatearClp(reporte.ticketPromedioClp)}
            </Text>
            {(reporte.ventas.devolucionesClp ?? 0) > 0 ? (
              <Text style={estilos.etiqueta}>
                Devoluciones: {formatearClp(reporte.ventas.devolucionesClp ?? 0)}
              </Text>
            ) : null}
          </View>

          <View style={estilos.tarjeta}>
            <Text style={estilos.etiqueta}>Margen (con el costo actual)</Text>
            <Text style={estilos.valor}>
              {formatearClp(reporte.margen.margenClp)}
              {reporte.margen.porcentaje !== null
                ? ` · ${String(reporte.margen.porcentaje).replace('.', ',')} %`
                : ''}
            </Text>
            {reporte.margen.sinCostoClp > 0 ? (
              <Text style={estilos.etiqueta}>
                {formatearClp(reporte.margen.sinCostoClp)} vendidos sin costo cargado no entran al
                margen.
              </Text>
            ) : null}
          </View>

          <View style={estilos.tarjeta}>
            <Text style={estilos.etiqueta}>Lo más vendido</Text>
            {reporte.masVendidos.length === 0 ? (
              <Text style={estilos.subtitulo}>Sin ventas en el período</Text>
            ) : null}
            {reporte.masVendidos.map((p, i) => (
              <View key={`${p.productoId ?? p.nombre}-${String(i)}`} style={estilos.fila}>
                <View style={{ flex: 1 }}>
                  <Text>{p.nombre}</Text>
                  <Text style={estilos.etiqueta}>
                    {formatearCantidad(p.cantidadMilli, p.unidad)}
                    {p.margenClp !== null ? ` · margen ${formatearClp(p.margenClp)}` : ''}
                  </Text>
                </View>
                <Text>{formatearClp(p.montoClp)}</Text>
              </View>
            ))}
          </View>

          {horas.length > 0 ? (
            <View style={estilos.tarjeta}>
              <Text style={estilos.etiqueta}>Ventas por hora</Text>
              {horas.map((h, i) => (
                <Barra
                  key={h.hora}
                  etiqueta={horaTexto(h.hora)}
                  ancho={anchosHora[i] ?? 0}
                  monto={h.montoClp}
                />
              ))}
            </View>
          ) : null}

          {reporte.dias > 1 ? (
            <View style={estilos.tarjeta}>
              <Text style={estilos.etiqueta}>Ventas por día</Text>
              {reporte.porDia.map((d, i) => (
                <Barra
                  key={d.fecha}
                  etiqueta={fechaCorta(d.fecha)}
                  ancho={anchosDia[i] ?? 0}
                  monto={d.montoClp}
                />
              ))}
            </View>
          ) : null}

          <View style={estilos.tarjeta}>
            <Text style={estilos.etiqueta}>Sugerido de compra</Text>
            {reporte.sugeridoCompra.length === 0 ? (
              <Text style={estilos.subtitulo}>Nada se acaba en la próxima semana</Text>
            ) : (
              <Text style={estilos.etiqueta}>
                Se acaban en menos de 7 días al ritmo de venta del período. Cantidad para 2 semanas.
              </Text>
            )}
            {reporte.sugeridoCompra.map((s) => (
              <View key={s.id} style={estilos.fila}>
                <View style={{ flex: 1 }}>
                  <Text>{s.nombre}</Text>
                  <Text style={estilos.etiqueta}>
                    Stock {formatearCantidad(s.stockMilli, s.unidad)} · alcanza{' '}
                    {diasTexto(s.diasDeStock)} días
                  </Text>
                </View>
                <Text style={{ fontWeight: '700' }}>
                  {formatearCantidad(s.sugeridoMilli, s.unidad)}
                </Text>
              </View>
            ))}
          </View>

          <Pressable style={estilos.botonSecundario} onPress={() => void cargar(dias)}>
            <Text style={estilos.botonTextoSecundario}>Actualizar</Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}
