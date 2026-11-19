/* Ficha en español, estilo "periódico", en A3 apaisado (1491 × 1055): cada cara son dos
 * páginas A4 juntas, para doblar por la mitad como un cuadernillo.
 *   - Anverso: trasfondo, arcos y notas breves (izquierda); portada con retrato y
 *     nombre, descriptor, tipo y enfoque (derecha).
 *   - Reverso: grado, reservas, recuperación, daño y habilidades (izquierda); notas,
 *     habilidades especiales, ataques, cifrados, equipo y armadura (derecha).
 * No tiene casillas de avance (el dato se conserva en la ficha).
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
  F('text', 'tier', 92, 70, 170, 36, { fs: 28, cls: 'center' }),
  F('text', 'effort', 307, 70, 170, 36, { fs: 28, cls: 'center' }),
  F('text', 'xp', 522, 70, 136, 36, { fs: 28, cls: 'center' }),

  // Vigor / Velocidad / Intelecto: encima de "Reserva" la reserva actual; encima de
  // "Ventaja" la lista con el valor inicial y sus incrementos; bajo "Ventaja", la ventaja.
  ...[['might', 45, 157, 266], ['speed', 267, 379, 487], ['intellect', 488, 600, 709]].flatMap(([k, l, m, r]) => [
    F('text', `${k}.pool`, l + 4, 210, m - l - 8, 68, { fs: 36, cls: 'center', ph: '–', title: 'Reserva actual' }),
    F('steps', `${k}.max`, m + 4, 208, r - m - 8, 70, { ph: 'inicial\n+…' }),
    F('text', `${k}.edge`, m + 4, 309, r - m - 8, 31, { fs: 18, cls: 'center', ph: '–', title: 'Ventaja' }),
  ]),

  F('text', 'recovery.bonus', 229, 452, 60, 50, { fs: 28, cls: 'center' }),
  F('cb', 'recovery.action', 64, 521, 22, 22),
  F('cb', 'recovery.hour', 237, 521, 22, 22),
  F('cb', 'recovery.tenMin', 65, 558, 22, 22),
  F('cb', 'recovery.tenHours', 237, 558, 22, 22),
  F('cb', 'damage.impaired', 414, 436, 22, 22),
  F('cb', 'damage.debilitated', 578, 436, 22, 22),

  // Habilidades (10 filas, con columna de prueba) y ataques (5 filas)
  T('skills', 43, 705, 672, 307, 10, [['name', 0.6101], ['test', 0.1548], ['t', 0.0804], ['s', 0.0774], ['i', 0.0773]]),
  T('attacks', 766, 561, 396, 139, 5, [['name', 0.596], ['mod', 0.1717], ['damage', 0.2323]]),

  F('md', 'notes', 772, 72, 600, 196),
  F('md', 'abilities', 776, 328, 678, 136),
  F('md', 'cyphers', 1186, 522, 268, 128),
  F('text', 'cypherLimit', 1379, 659, 66, 29, { fs: 20, cls: 'center' }),
  F('md', 'equipment', 772, 752, 340, 258),
  F('text', 'armor', 1247, 772, 108, 37, { fs: 24, cls: 'center' }),
  F('md', 'armorDetails', 1148, 862, 304, 148),
];

export default {
  id: 'periodico-a3-es',
  name: 'Periódico A3 OGOA Español',
  pages: [
    { id: 'front', name: 'Anverso', width: 1491, height: 1055, orientation: 'landscape', background: 'img/periodico-a3-es-anverso.png', fields: front },
    { id: 'back', name: 'Reverso', width: 1491, height: 1055, orientation: 'landscape', background: 'img/periodico-a3-es-reverso.png', fields: back },
  ],
};
