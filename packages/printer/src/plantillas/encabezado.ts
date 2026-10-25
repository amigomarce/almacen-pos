import type { Documento } from '../documento.js';
import type { DatosLocal } from '../formato.js';

export function encabezadoLocal(doc: Documento, local: DatosLocal): void {
  doc.texto(local.razonSocial ?? 'Almacén', { alinear: 'CENTRO', negrita: true });
  if (local.rut) doc.texto(`RUT ${local.rut}`, { alinear: 'CENTRO' });
  if (local.giro) doc.texto(local.giro, { alinear: 'CENTRO' });
  const direccion = [local.direccion, local.comuna].filter(Boolean).join(', ');
  if (direccion) doc.texto(direccion, { alinear: 'CENTRO' });
}
