/* Ficha en español, estilo "periódico", en A3 apaisado (1491 × 1055): cada cara son dos
 * páginas A4 juntas, para doblar por la mitad como un cuadernillo.
 *   - Anverso: trasfondo, arcos y notas breves (izquierda); portada con retrato y
 *     nombre, descriptor, tipo y enfoque (derecha).
 *   - Reverso: grado, reservas, avance, recuperación, daño, armadura, habilidades y
 *     ataques (izquierda); habilidades especiales, notas, equipo y cifrados (derecha).
 * Posiciones medidas sobre la imagen; se pueden retocar desde la pestaña Layouts.
 */
import { F, T } from './fields.js';

const front = [
  F('md', 'background', 44, 192, 440, 308),
  F('md', 'arcs', 44, 568, 440, 132),
  F('md', 'shortNotes', 43, 762, 344, 129),

  F('portrait', 'portrait', 940, 406, 288, 386),

  // Bajo cada rótulo del recuadro de la derecha
  F('text', 'name', 1262, 412, 194, 32, { fs: 20, ph: 'Nombre' }),
  F('text', 'descriptor', 1262, 479, 194, 32, { fs: 17, ph: 'descriptor' }),
  F('text', 'type', 1262, 546, 194, 32, { fs: 17, ph: 'tipo' }),
  F('text', 'focus', 1262, 614, 194, 32, { fs: 17, ph: 'enfoque' }),
];

const back = [
  F('text', 'tier', 89, 72, 104, 27, { fs: 24, cls: 'center' }),
  F('text', 'effort', 231, 72, 104, 27, { fs: 24, cls: 'center' }),
  F('text', 'xp', 374, 72, 85, 27, { fs: 24, cls: 'center' }),

  // Vigor / Velocidad / Intelecto: encima de "Reserva" la reserva actual; encima de
  // "Ventaja" la lista con el valor inicial y sus incrementos; bajo "Ventaja", la ventaja.
  ...[['might', 41, 119, 194], ['speed', 195, 270, 344], ['intellect', 344, 418, 489]].flatMap(([k, l, m, r]) => [
    F('text', `${k}.pool`, l + 3, 201, m - l - 6, 40, { fs: 30, cls: 'center', ph: '–', title: 'Reserva actual' }),
    F('steps', `${k}.max`, m + 3, 199, r - m - 6, 42, { ph: 'inicial\n+…' }),
    F('text', `${k}.edge`, m + 3, 267, r - m - 6, 32, { fs: 18, cls: 'center', ph: '–', title: 'Ventaja' }),
  ]),

  F('cb', 'adv.capabilities', 520, 82, 16, 16),
  F('cb', 'adv.perfection', 520, 123, 16, 16),
  F('cb', 'adv.effort', 520, 165, 16, 16),
  F('cb', 'adv.skill', 520, 207, 16, 16),
  F('cb', 'adv.other', 521, 251, 16, 16),

  F('text', 'recovery.bonus', 166, 403, 43, 38, { fs: 24, cls: 'center' }),
  F('cb', 'recovery.action', 45, 457, 16, 16),
  F('cb', 'recovery.hour', 163, 457, 16, 16),
  F('cb', 'recovery.tenMin', 45, 486, 16, 16),
  F('cb', 'recovery.tenHours', 163, 486, 16, 16),
  F('cb', 'damage.impaired', 290, 387, 16, 16),
  F('cb', 'damage.debilitated', 411, 387, 17, 16),

  F('text', 'armor', 622, 382, 48, 21, { fs: 16, cls: 'center' }),
  F('md', 'armorDetails', 544, 452, 170, 68),

  // Habilidades (13 filas, con columna de prueba) y ataques (13 filas)
  T('skills', 41, 655, 326, 321, 13, [['name', 0.5399], ['test', 0.1227], ['t', 0.1166], ['s', 0.1104], ['i', 0.1104]]),
  T('attacks', 405, 651, 311, 325, 13, [['name', 0.5756], ['mod', 0.2026], ['damage', 0.2218]]),

  F('md', 'abilities', 775, 72, 400, 638),
  F('md', 'notes', 1207, 152, 246, 558), // empieza bajo la pluma
  F('md', 'equipment', 772, 775, 410, 208),
  F('md', 'cyphers', 1212, 776, 244, 156),
  F('text', 'cypherLimit', 1383, 940, 60, 25, { fs: 18, cls: 'center' }),
];

export default {
  id: 'periodico-a3-es',
  name: 'Periódico A3 OGOA Español',
  size: 'A3', // papel al imprimir o exportar: A4, A3 o Letter
  version: 2, // súbelo al cambiar la plantilla o las zonas: descarta las versiones guardadas anteriores
  pages: [
    { id: 'front', name: 'Anverso', width: 1491, height: 1055, orientation: 'landscape', background: 'img/periodico-a3-es-anverso.png', fields: front },
    { id: 'back', name: 'Reverso', width: 1491, height: 1055, orientation: 'landscape', background: 'img/periodico-a3-es-reverso.png', fields: back },
  ],
};
