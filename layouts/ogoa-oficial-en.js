/* Ficha oficial de Old Gods of Appalachia en inglés: dos páginas apaisadas (1200 × 896).
 * Plantillas © 2021 DeepNerd Media (Cypher System © Monte Cook Games).
 */
import { F, T } from './fields.js';

const front = [
  F('text', 'name', 40, 55, 335, 26, { fs: 20, cls: 'center', ph: 'Nombre' }),
  F('text', 'descriptor', 68, 102, 134, 22, { fs: 16, cls: 'center', ph: 'descriptor' }),
  F('text', 'type', 210, 102, 134, 22, { fs: 16, cls: 'center', ph: 'tipo' }),
  F('text', 'focus', 40, 149, 335, 24, { fs: 16, cls: 'center', ph: 'foco' }),
  F('text', 'tier', 40, 216, 108, 36, { fs: 26, cls: 'center' }),
  F('text', 'effort', 152, 216, 108, 36, { fs: 26, cls: 'center' }),
  F('text', 'xp', 264, 216, 110, 36, { fs: 26, cls: 'center' }),

  F('cb', 'adv.capabilities', 415, 54, 14, 14),
  F('cb', 'adv.perfection', 510, 54, 13, 14),
  F('cb', 'adv.effort', 596, 54, 13, 14),
  F('cb', 'adv.skill', 670, 54, 13, 14),
  F('cb', 'adv.other', 750, 54, 13, 14),

  F('text', 'recovery.bonus', 98, 457, 52, 40, { fs: 26, cls: 'center' }),
  F('cb', 'recovery.action', 41, 508, 13, 12),
  F('cb', 'recovery.hour', 98, 508, 13, 12),
  F('cb', 'recovery.tenMin', 41, 531, 13, 12),
  F('cb', 'recovery.tenHours', 98, 531, 13, 12),
  F('cb', 'damage.impaired', 179, 457, 12, 12),
  F('cb', 'damage.debilitated', 286, 457, 12, 12),

  F('md', 'abilities', 414, 182, 378, 466),
  F('md', 'cyphers', 824, 182, 342, 312),
  F('text', 'cypherLimit', 1110, 517, 60, 28, { fs: 20, cls: 'center' }),
  F('md', 'equipment', 824, 582, 342, 218),
  F('text', 'armorDetails', 902, 837, 202, 20, { fs: 13 }),
  F('text', 'armor', 1116, 826, 54, 30, { fs: 22, cls: 'center' }),

  // Reservas: a la izquierda el total (reserva actual); a la derecha la lista con el
  // valor inicial y sus incrementos y, debajo, la ventaja (Edge).
  ...[['might', 36, 56, 96, 52], ['speed', 152, 54, 208, 52], ['intellect', 264, 54, 320, 56]].flatMap(([k, px, pw, ex, ew]) => [
    F('text', `${k}.pool`, px, 302, pw, 88, { fs: 36, cls: 'center', ph: '–', title: 'Reserva actual' }),
    F('steps', `${k}.max`, ex, 300, ew, 66, { ph: 'inicial\n+…' }),
    F('text', `${k}.edge`, ex, 368, ew, 22, { fs: 17, cls: 'center', ph: '–', title: 'Ventaja (Edge)' }),
  ]),

  // Habilidades (12 filas) y ataques (7 filas)
  T('skills', 35, 595, 343, 245, 12, [['name', 0.752], ['test', 0.0583], ['t', 0.0641], ['s', 0.0612], ['i', 0.0641]]),
  T('attacks', 412, 694, 383, 144, 7, [['name', 0.7728], ['mod', 0.1057], ['damage', 0.1214]]),
];

const back = [
  F('md', 'background', 22, 124, 348, 466),
  F('md', 'arcs', 22, 622, 348, 254),
  F('md', 'notes', 414, 124, 350, 750),
  F('portrait', 'portrait', 815, 62, 375, 820),
];

export default {
  id: 'ogoa-oficial-en',
  name: 'Oficial OGOA English',
  size: 'A4', // papel al imprimir o exportar: A4, A3 o Letter
  pages: [
    { id: 'front', name: 'Anverso', width: 1200, height: 896, orientation: 'landscape', background: 'img/oficial-en-anverso.jpg', fields: front },
    { id: 'back', name: 'Reverso', width: 1200, height: 896, orientation: 'landscape', background: 'img/oficial-en-reverso.jpg', fields: back },
  ],
};
