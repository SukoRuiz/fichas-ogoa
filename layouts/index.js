/* Layouts de ficha.
 *
 *  - Incluidos: los de esta carpeta (código + imágenes en img/).
 *  - Guardados: los creados o modificados desde la pestaña Layouts, en Firestore
 *    (layouts/{id} y layoutImages/{id}__{página}). Uno guardado con el mismo id que un
 *    incluido lo sustituye ("modificado"); al restaurarlo vuelve el original.
 *
 * El primero incluido es el de por defecto (partidas sin layout y fichas sin partida).
 */
import ogoaOficialEn from './ogoa-oficial-en.js';
import periodicoEs from './periodico-es.js';

export const BUILTIN = [ogoaOficialEn, periodicoEs];
export const DEFAULT_LAYOUT = BUILTIN[0].id;

/** Lista viva de layouts disponibles (incluidos + guardados). */
export const LAYOUTS = BUILTIN.map(b => fromDoc(b, b, false));
export const getLayout = id => LAYOUTS.find(l => l.id === id) || null;
export const builtinOf = id => BUILTIN.find(l => l.id === id) || null;
export const orientationOf = page => page.orientation || (page.width >= page.height ? 'landscape' : 'portrait');

/** Copia profunda de un layout (o de un documento guardado) como objeto de trabajo. */
function fromDoc(d, base, stored) {
  return {
    id: d.id, name: d.name || base?.name || 'Sin nombre',
    builtin: !!base, modified: !!base && stored, custom: !base,
    pages: (d.pages || []).map(p => ({ ...p, fields: JSON.parse(JSON.stringify(p.fields || [])) })),
    _rev: 0,
  };
}

/** Sustituye los layouts guardados por los de `docs` (los de Firestore). */
export function setStored(docs) {
  const out = BUILTIN.map(b => {
    const d = docs.find(x => x.id === b.id);
    return d ? fromDoc(d, b, true) : fromDoc(b, b, false);
  });
  for (const d of docs) if (!builtinOf(d.id)) out.push(fromDoc(d, null, true));
  LAYOUTS.splice(0, LAYOUTS.length, ...out);
}

/** Documento para guardar en Firestore (sin las imágenes subidas, que van aparte). */
export function toDoc(l) {
  return {
    name: l.name,
    pages: l.pages.map(p => ({
      id: p.id, name: p.name || '', width: p.width, height: p.height,
      orientation: p.orientation || '', image: !!p.image,
      background: p.image ? '' : (p.background || ''),
      fields: p.fields,
    })),
  };
}
