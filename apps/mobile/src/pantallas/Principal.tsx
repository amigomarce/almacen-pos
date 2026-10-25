import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { salir } from '../auth';
import { estilos } from '../estilos';
import { CambioMasivo } from './CambioMasivo';
import { Inicio } from './Inicio';
import { Productos } from './Productos';
import { Recepcion } from './Recepcion';
import { VincularCaja } from './VincularCaja';

type Tab = 'inicio' | 'productos' | 'cambio' | 'recepcion' | 'caja';

const TABS: { id: Tab; etiqueta: string }[] = [
  { id: 'inicio', etiqueta: 'Inicio' },
  { id: 'productos', etiqueta: 'Productos' },
  { id: 'cambio', etiqueta: 'Precios' },
  { id: 'recepcion', etiqueta: 'Recibir' },
  { id: 'caja', etiqueta: 'Caja' },
];

export function Principal() {
  const [tab, setTab] = useState<Tab>('inicio');
  return (
    <View style={{ flex: 1 }}>
      <View style={estilos.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            style={estilos.tab}
            onPress={() => {
              setTab(t.id);
            }}
          >
            <Text style={[estilos.tabTexto, tab === t.id ? estilos.tabActiva : null]}>
              {t.etiqueta}
            </Text>
          </Pressable>
        ))}
        <Pressable style={estilos.tab} onPress={() => void salir()}>
          <Text style={estilos.tabTexto}>Salir</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'inicio' ? <Inicio /> : null}
        {tab === 'productos' ? <Productos /> : null}
        {tab === 'cambio' ? <CambioMasivo /> : null}
        {tab === 'recepcion' ? <Recepcion /> : null}
        {tab === 'caja' ? <VincularCaja /> : null}
      </View>
    </View>
  );
}
