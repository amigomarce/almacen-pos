import { StyleSheet } from 'react-native';

/** Estilos compartidos (botones grandes, letra clara; el dueño no es "de computadores"). */
export const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#f4f5f7' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f5f7' },
  contenedor: { flex: 1, padding: 20, gap: 12 },
  titulo: { fontSize: 28, fontWeight: '800', color: '#1f2937' },
  subtitulo: { fontSize: 16, color: '#4b5563', marginBottom: 8 },
  campo: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  boton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botonSecundario: {
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  botonTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
  botonTextoSecundario: { color: '#1f2937', fontSize: 15, fontWeight: '600' },
  error: { color: '#b91c1c', fontSize: 14 },
  tarjeta: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  etiqueta: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  valor: { fontSize: 22, fontWeight: '800', color: '#111827' },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  separador: { height: 1, backgroundColor: '#e5e7eb' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabTexto: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
  tabActiva: { color: '#2563eb' },
});
