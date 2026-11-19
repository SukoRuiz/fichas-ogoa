/* Piezas comunes de los layouts de ficha.
 *
 * Un layout es un objeto:
 *   {
 *     id: 'mi-layout',              // único; es lo que guarda la partida
 *     name: 'Nombre visible',
 *     pages: [{
 *       id: 'front', name: 'Anverso',
 *       width: 1200, height: 896,     // tamaño de la imagen de fondo en px
 *       orientation: 'landscape',     // o 'portrait' (por defecto, según width/height)
 *       background: 'img/…',          // imagen de la plantilla (opcional)
 *       fields: [ F(...), T(...), … ],
 *     }, …],
 *   }
 *
 * Zonas (coordenadas en px sobre la imagen de la página):
 *   F(tipo, campo, x, y, ancho, alto, opciones)
 *     tipo  'text' línea de texto · 'md' texto largo con Markdown · 'cb' casilla ✕ · 'dot' casilla ●
 *           'steps' lista de valores de una reserva · 'portrait' retrato
 *     campo dónde se guarda en la ficha: 'name', 'might.pool'… (ver CATALOG)
 *     opciones: fs (tamaño de letra), cls: 'center', ph (texto de ayuda), title
 *   T(tabla, x, y, ancho, alto, filas, columnas)
 *     tabla 'skills' o 'attacks'; columnas: [['name', 0.75], ['t', 0.08], …] (anchos relativos)
 *
 * Todos los layouts comparten los mismos datos: lo que un layout no muestra se conserva.
 * Los layouts se pueden crear y retocar desde la propia web (pestaña Layouts).
 */
export const F = (k, f, x, y, w, h, o = {}) => ({ k, f, x, y, w, h, ...o });
export const T = (f, x, y, w, h, rows, cols, o = {}) =>
  ({ k: 'table', f, x, y, w, h, rows, cols: cols.map(([c, w]) => ({ c, w })), ...o });

export const KIND_LABEL = {
  text: 'Texto (una línea)', md: 'Texto largo (Markdown)', cb: 'Casilla ✕', dot: 'Casilla ●',
  steps: 'Inicial e incrementos', portrait: 'Retrato', table: 'Tabla',
};

/* Campos de la ficha que se pueden colocar en un layout: [campo, nombre, tipos permitidos, opciones por defecto] */
const G = (group, items) => ({ group, items: items.map(([f, label, kinds, def = {}]) => ({ f, label, kinds: kinds.split(' '), def })) });
const big = { fs: 26, cls: 'center' };
const pools = [['might', 'Vigor (Might)'], ['speed', 'Velocidad (Speed)'], ['intellect', 'Intelecto (Intellect)']];
export const CATALOG = [
  G('Identidad', [
    ['name', 'Nombre', 'text md', { fs: 20 }], ['descriptor', 'Descriptor', 'text', { fs: 16, cls: 'center' }],
    ['type', 'Tipo', 'text', { fs: 16, cls: 'center' }], ['focus', 'Foco / enfoque', 'text md', { fs: 16, cls: 'center' }],
    ['tier', 'Grado (Tier)', 'text', big], ['effort', 'Esfuerzo', 'text', big], ['xp', 'PX', 'text', big],
  ]),
  G('Avance', [
    ['adv.capabilities', 'Aumentar capacidades', 'cb dot'], ['adv.perfection', 'Avanzar hacia la perfección', 'cb dot'],
    ['adv.effort', 'Esfuerzo extra', 'cb dot'], ['adv.skill', 'Entrenamiento de habilidad', 'cb dot'], ['adv.other', 'Otro avance', 'cb dot'],
  ]),
  G('Reservas', pools.flatMap(([k, n]) => [
    [`${k}.pool`, `${n}: reserva actual`, 'text', { fs: 34, cls: 'center' }],
    [`${k}.max`, `${n}: inicial e incrementos`, 'steps text'],
    [`${k}.edge`, `${n}: ventaja`, 'text', { fs: 16, cls: 'center' }],
  ])),
  G('Recuperación y daño', [
    ['recovery.bonus', 'Recuperación: 1d6 +', 'text', big], ['recovery.action', 'Recuperación: 1 acción', 'cb dot'],
    ['recovery.tenMin', 'Recuperación: 10 min', 'cb dot'], ['recovery.hour', 'Recuperación: 1 hora', 'cb dot'],
    ['recovery.tenHours', 'Recuperación: 10 horas', 'cb dot'],
    ['damage.impaired', 'Impedido (impaired)', 'cb dot'], ['damage.debilitated', 'Debilitado (debilitated)', 'cb dot'],
  ]),
  G('Textos', [
    ['abilities', 'Habilidades especiales', 'md'], ['cyphers', 'Cifrados', 'md'],
    ['cypherLimit', 'Límite de cifrados', 'text', { fs: 20, cls: 'center' }], ['equipment', 'Equipo', 'md'],
    ['armorDetails', 'Detalles de armadura', 'md text'], ['armor', 'Armadura', 'text', { fs: 22, cls: 'center' }],
    ['background', 'Trasfondo', 'md'], ['arcs', 'Arcos del personaje', 'md'], ['notes', 'Notas', 'md'],
    ['shortNotes', 'Notas breves', 'md'],
  ]),
  G('Tablas', [['skills', 'Tabla de habilidades', 'table'], ['attacks', 'Tabla de ataques', 'table']]),
  G('Imagen', [['portrait', 'Retrato', 'portrait']]),
];
const BY_FIELD = new Map(CATALOG.flatMap(g => g.items.map(i => [i.f, i])));
export const catalogItem = f => BY_FIELD.get(f) || null;

/* Tablas: columnas posibles (en este orden) con su tipo */
export const TABLES = {
  skills: {
    rows: 12, cols: [
      { c: 'name', label: 'Habilidad', k: 'text', w: 0.75, fs: 14 },
      { c: 'test', label: 'Prueba', k: 'text', w: 0.06, fs: 12, cls: 'center' },
      { c: 't', label: 'T', k: 'dot', w: 0.063, title: 'Entrenado' },
      { c: 's', label: 'E', k: 'dot', w: 0.063, title: 'Especializado' },
      { c: 'i', label: 'I', k: 'dot', w: 0.064, title: 'Incapacidad' },
    ],
  },
  attacks: {
    rows: 7, cols: [
      { c: 'name', label: 'Ataque', k: 'text', w: 0.77, fs: 14 },
      { c: 'mod', label: 'Mod.', k: 'text', w: 0.11, fs: 13, cls: 'center' },
      { c: 'damage', label: 'Daño', k: 'text', w: 0.12, fs: 13, cls: 'center' },
    ],
  },
};
/** Columnas que usa una zona de tabla (en el orden de la definición). */
export function tableCols(z) {
  const def = TABLES[z.f];
  if (!def) return [];
  const cols = Array.isArray(z.cols) && z.cols.length ? z.cols : def.cols.map(c => ({ c: c.c, w: c.w }));
  return cols.filter(c => def.cols.some(d => d.c === c.c));
}

/** Convierte las zonas de una página en los campos que se dibujan (las tablas, en celdas). */
export function expandFields(fields) {
  const out = [];
  for (const z of fields || []) {
    if (!z || !z.f) continue; // zona sin campo asignado todavía
    if (z.k !== 'table') { out.push(z); continue; }
    const def = TABLES[z.f];
    if (!def) continue;
    const cols = tableCols(z);
    const total = cols.reduce((a, c) => a + (+c.w || 0), 0) || 1;
    const n = Math.max(1, Math.round(z.rows || def.rows));
    const step = z.h / n;
    for (let i = 0; i < n; i++) {
      let x = z.x;
      const y = z.y + i * step + 1, h = step - 2;
      for (const col of cols) {
        const d = def.cols.find(c => c.c === col.c);
        const w = (+col.w || 0) / total * z.w;
        const fs = d.k === 'text' ? (z.fs ? (d.c === 'name' ? z.fs : Math.min(d.fs, z.fs)) : d.fs) : undefined;
        out.push(F(d.k, `${z.f}.${i}.${d.c}`, x + 1.5, y, Math.max(2, w - 3), h, { fs, cls: d.cls, title: d.title }));
        x += w;
      }
    }
  }
  return out;
}
