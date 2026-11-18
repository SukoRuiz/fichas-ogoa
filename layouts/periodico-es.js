/* Ficha en español, estilo "periódico": dos páginas verticales (1055 × 1491).
 * Posiciones medidas sobre la imagen; se pueden retocar desde la pestaña Layouts («Modificar»)
 * o aquí mismo.
 */
import { F, T } from './fields.js';

const front = [
  F('text', 'name', 156, 216, 397, 28, { fs: 22, ph: 'Nombre' }),
  F('text', 'descriptor', 125, 258, 122, 24, { fs: 16, cls: 'center', ph: 'descriptor' }),
  F('text', 'type', 263, 258, 121, 24, { fs: 16, cls: 'center', ph: 'tipo' }),
  F('text', 'focus', 432, 258, 123, 24, { fs: 16, cls: 'center', ph: 'enfoque' }),
  F('text', 'tier', 46, 376, 168, 42, { fs: 28, cls: 'center' }),
  F('text', 'effort', 221, 376, 178, 42, { fs: 28, cls: 'center' }),
  F('text', 'xp', 406, 376, 172, 42, { fs: 28, cls: 'center' }),

  F('cb', 'adv.capabilities', 642, 222, 21, 21),
  F('cb', 'adv.perfection', 642, 270, 21, 21),
  F('cb', 'adv.effort', 642, 316, 21, 21),
  F('cb', 'adv.skill', 642, 362, 21, 21),
  F('cb', 'adv.other', 642, 408, 21, 21),

  // Vigor / Velocidad / Intelecto: encima de "Reserva" la reserva actual; encima de
  // "Ventaja" la lista con el valor inicial y sus incrementos y, debajo, la ventaja.
  ...[['might', 59, 146], ['speed', 233, 320], ['intellect', 407, 494]].flatMap(([k, px, ex]) => [
    F('text', `${k}.pool`, px, 510, 82, 54, { fs: 34, cls: 'center', ph: '–', title: 'Reserva actual' }),
    F('steps', `${k}.max`, ex, 509, 79, 34, { ph: 'inicial\n+…' }),
    F('text', `${k}.edge`, ex, 543, 79, 21, { fs: 16, cls: 'center', ph: '–', title: 'Ventaja' }),
  ]),

  F('text', 'recovery.bonus', 166, 701, 70, 37, { fs: 26, cls: 'center' }),
  F('cb', 'recovery.action', 62, 751, 18, 18),
  F('cb', 'recovery.hour', 170, 751, 18, 18),
  F('cb', 'recovery.tenMin', 62, 781, 18, 18),
  F('cb', 'recovery.tenHours', 170, 781, 18, 18),
  F('cb', 'damage.impaired', 293, 680, 19, 19),
  F('cb', 'damage.debilitated', 446, 680, 19, 19),

  F('md', 'abilities', 614, 510, 414, 302),
  F('md', 'cyphers', 600, 866, 426, 54),
  F('text', 'cypherLimit', 949, 927, 60, 31, { fs: 20, cls: 'center' }),
  F('md', 'equipment', 600, 1020, 426, 96),
  F('md', 'armorDetails', 566, 1186, 328, 72),
  F('text', 'armor', 928, 1180, 94, 69, { fs: 32, cls: 'center' }),

  // Habilidades (9 filas) y ataques (4 filas); esta hoja no tiene columna de prueba aparte
  T('skills', 57, 897, 514, 214, 9, [['name', 0.7218], ['t', 0.0934], ['s', 0.0914], ['i', 0.0934]]),
  T('attacks', 57, 1179, 477, 89, 4, [['name', 0.6583], ['mod', 0.1572], ['damage', 0.1845]]),
];

const back = [
  F('md', 'background', 42, 240, 530, 412),
  F('md', 'notes', 602, 240, 426, 595),
  F('portrait', 'portrait', 44, 734, 514, 474),
  F('md', 'arcs', 594, 914, 436, 300),
];

export default {
  id: 'periodico-es',
  name: 'Periódico OGOA Español',
  pages: [
    { id: 'front', name: 'Hoja de personaje', width: 1055, height: 1491, orientation: 'portrait', background: 'img/periodico-es-anverso.png', fields: front },
    { id: 'back', name: 'Página de trasfondo', width: 1055, height: 1491, orientation: 'portrait', background: 'img/periodico-es-reverso.png', fields: back },
  ],
};
