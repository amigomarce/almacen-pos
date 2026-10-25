import { parsearFormato, separarFormatoDelNombre, type Formato } from './formato.js';
import { arreglarMayusculas, claveTexto, limpiarTexto } from './texto.js';

export interface ProductoNormalizado {
  /** Nombre de góndola: "Marca Producto Formato" ("Colún Leche Entera 1 L"). */
  nombre: string;
  /** Solo la parte del producto, sin marca ni formato ("Leche Entera"). */
  producto: string;
  marca: string;
  formato: Formato | null;
}

/** Quita la marca si el nombre ya empieza con ella ("Lays Jamón Serrano" con marca "Lay's"). */
function quitarMarcaInicial(nombre: string, marca: string): string {
  const claveMarca = claveTexto(marca);
  if (claveMarca === '') return nombre;
  const palabras = nombre.split(' ');
  let acumulado = '';
  for (let i = 0; i < palabras.length; i++) {
    acumulado += claveTexto(palabras[i] ?? '');
    if (acumulado === claveMarca) return palabras.slice(i + 1).join(' ');
    if (!claveMarca.startsWith(acumulado)) break;
  }
  return nombre;
}

/** Quita "(Marca)" o "- Marca" al final del nombre. */
function quitarMarcaFinal(nombre: string, marca: string): string {
  const claveMarca = claveTexto(marca);
  if (claveMarca === '') return nombre;
  const m = /\s*(?:\(([^)]*)\)|-\s*([^-]+))$/u.exec(nombre);
  if (m && claveTexto(m[1] ?? m[2] ?? '') === claveMarca) return nombre.slice(0, m.index);
  return nombre;
}

/**
 * Arma el nombre de góndola a partir de lo que trae la fuente.
 * `marca` debe venir ya canónica (ver CatalogoMarcas).
 */
export function normalizarProducto(entrada: {
  nombre: string;
  marca: string;
  cantidad: string;
}): ProductoNormalizado {
  const marca = limpiarTexto(entrada.marca);
  let producto = arreglarMayusculas(limpiarTexto(entrada.nombre));

  // Formato: el campo `quantity` manda; si no viene, se intenta sacar del nombre.
  const separado = separarFormatoDelNombre(producto);
  const formatoCampo = parsearFormato(entrada.cantidad);
  const formato = formatoCampo ?? separado.formato;
  if (
    separado.formato &&
    (!formatoCampo ||
      (separado.formato.unidad === formatoCampo.unidad &&
        separado.formato.cantidad === formatoCampo.cantidad))
  ) {
    producto = separado.nombre;
  }

  producto = limpiarTexto(quitarMarcaFinal(quitarMarcaInicial(producto, marca), marca));
  if (producto !== '') producto = producto.charAt(0).toUpperCase() + producto.slice(1);

  const nombre = [marca, producto, formato?.texto ?? ''].filter((p) => p !== '').join(' ');
  return { nombre, producto, marca, formato };
}
