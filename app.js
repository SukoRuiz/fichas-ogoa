/* Fichas de personaje · Old Gods of Appalachia
 * Web estática (GitHub Pages). Los datos se guardan en Firebase (Firestore)
 * y solo pueden verlos las cuentas de Google autorizadas en las reglas.
 * Jugadores, partidas, sesiones y estadísticas están en mesa.js.
 */
import { Cloud as Store, LocalStore, Auth } from './store.js';
import * as Mesa from './mesa.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* =====================================================================
 * Modelo de datos
 * ===================================================================== */
const SKILL_ROWS = 12, ATTACK_ROWS = 7;

function blank() {
  const stat = () => ({ pool: '', max: '', edge: '' });
  return {
    name: '', player: '', playerId: '', descriptor: '', type: '', focus: '',
    tier: '1', effort: '1', xp: '0',
    might: stat(), speed: stat(), intellect: stat(),
    adv: { capabilities: false, perfection: false, effort: false, skill: false, other: false },
    recovery: { bonus: '', action: false, tenMin: false, hour: false, tenHours: false },
    damage: { impaired: false, debilitated: false },
    skills: Array.from({ length: SKILL_ROWS }, () => ({ name: '', test: '', t: false, s: false, i: false })),
    attacks: Array.from({ length: ATTACK_ROWS }, () => ({ name: '', mod: '', damage: '' })),
    abilities: '', cyphers: '', cypherLimit: '', equipment: '', armorDetails: '', armor: '',
    background: '', arcs: '', notes: '',
    portraitFit: 'cover', portraitPos: { x: 50, y: 50 },
  };
}

/** Completa `data` con los campos que falten respecto a la plantilla vacía. */
function normalize(data) {
  const merge = (base, src) => {
    if (Array.isArray(base)) {
      return base.map((b, i) => merge(b, Array.isArray(src) ? src[i] : undefined))
        .concat(Array.isArray(src) ? src.slice(base.length) : []);
    }
    if (base && typeof base === 'object') {
      const out = {};
      for (const k of Object.keys(base)) out[k] = merge(base[k], src ? src[k] : undefined);
      if (src && typeof src === 'object') for (const k of Object.keys(src)) if (!(k in out)) out[k] = src[k];
      return out;
    }
    return src === undefined || src === null ? base : src;
  };
  return merge(blank(), data || {});
}

const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o, p, v) {
  const ks = p.split('.');
  const last = ks.pop();
  ks.reduce((a, k) => a[k], o)[last] = v;
}

/* =====================================================================
 * Disposición de campos sobre las plantillas (px sobre 1200 × 896)
 * ===================================================================== */
const F = (k, f, x, y, w, h, o = {}) => ({ k, f, x, y, w, h, ...o });

const FRONT = [
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
];

// Reservas: [clave, x reserva, ancho reserva, x ventaja, ancho ventaja]
// Columna izquierda: total (reserva actual). Columna derecha: lista con el valor
// inicial y sus incrementos (uno por línea) y, abajo, la ventaja (Edge).
for (const [k, px, pw, ex, ew] of [
  ['might', 36, 56, 96, 52], ['speed', 152, 54, 208, 52], ['intellect', 264, 54, 320, 56],
]) {
  FRONT.push(
    F('text', `${k}.pool`, px, 302, pw, 88, { fs: 36, cls: 'center', ph: '–', title: 'Reserva actual' }),
    F('steps', `${k}.max`, ex, 300, ew, 66, { ph: 'inicial\n+…' }),
    F('text', `${k}.edge`, ex, 368, ew, 22, { fs: 17, cls: 'center', ph: '–', title: 'Ventaja (Edge)' }),
  );
}

// Habilidades: 12 filas entre y=595 y y=840
for (let i = 0; i < SKILL_ROWS; i++) {
  const y = 595 + i * (245 / SKILL_ROWS) + 1, h = 245 / SKILL_ROWS - 2;
  FRONT.push(
    F('text', `skills.${i}.name`, 35, y, 256, h, { fs: 14 }),
    F('text', `skills.${i}.test`, 294, y, 18, h, { fs: 12, cls: 'center' }),
    F('dot', `skills.${i}.t`, 315, y, 19, h, { title: 'Entrenado' }),
    F('dot', `skills.${i}.s`, 336, y, 19, h, { title: 'Especializado' }),
    F('dot', `skills.${i}.i`, 357, y, 21, h, { title: 'Incapacidad' }),
  );
}

// Ataques: 7 filas entre y=694 y y=838
for (let i = 0; i < ATTACK_ROWS; i++) {
  const y = 694 + i * (144 / ATTACK_ROWS) + 1, h = 144 / ATTACK_ROWS - 2;
  FRONT.push(
    F('text', `attacks.${i}.name`, 412, y, 294, h, { fs: 14 }),
    F('text', `attacks.${i}.mod`, 710, y, 37, h, { fs: 13, cls: 'center' }),
    F('text', `attacks.${i}.damage`, 750, y, 45, h, { fs: 13, cls: 'center' }),
  );
}

const BACK = [
  F('md', 'background', 22, 124, 348, 466),
  F('md', 'arcs', 22, 622, 348, 254),
  F('md', 'notes', 414, 124, 350, 750),
  F('portrait', 'portrait', 815, 62, 375, 820),
];

/* =====================================================================
 * Markdown mínimo (negrita, cursiva, listas anidadas, títulos, citas, hr)
 * ===================================================================== */
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(?!\s)(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?!\s)(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(?!\s)([^*]+?)\*/g, '<em>$1</em>')
    .replace(/(^|[\s(¡¿"«])_(?!\s)([^_]+?)_(?=$|[\s.,;:!?)"»])/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>');
}
function renderMD(src) {
  const lines = (src || '').replace(/\r/g, '').split('\n');
  let html = '', para = [];
  const stack = []; // listas abiertas: {type, indent}
  const flush = () => { if (para.length) { html += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; } };
  const closeTo = indent => {
    while (stack.length && stack[stack.length - 1].indent > indent) html += `</li></${stack.pop().type}>`;
  };
  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ');
    let m;
    if (!line.trim()) { flush(); closeTo(-1); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); closeTo(-1); html += '<hr>'; continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flush(); closeTo(-1);
      html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`;
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) { flush(); closeTo(-1); html += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
    if ((m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/))) {
      flush();
      const indent = m[1].length, type = /\d/.test(m[2]) ? 'ol' : 'ul';
      closeTo(indent);
      const top = stack[stack.length - 1];
      if (!top || top.indent < indent) {
        const start = type === 'ol' && parseInt(m[2], 10) !== 1 ? ` start="${parseInt(m[2], 10)}"` : '';
        html += `<${type}${start}><li>`;
        stack.push({ type, indent });
      } else if (top.type !== type) {
        html += `</li></${stack.pop().type}><${type}><li>`;
        stack.push({ type, indent });
      } else {
        html += '</li><li>';
      }
      html += inline(m[3]);
      continue;
    }
    if (stack.length && /^\s/.test(line)) { html += '<br>' + inline(line.trim()); continue; }
    closeTo(-1);
    para.push(line);
  }
  flush(); closeTo(-1);
  return html;
}

/** Ejemplos de la ventana de ayuda (a la izquierda el texto, a la derecha cómo se ve). */
const MD_EXAMPLES = [
  '**negrita**, *cursiva* y ~~tachado~~',
  '- un elemento\n- otro elemento\n  - sublista (dos espacios delante)',
  '1. primer paso\n2. segundo paso',
  '### Encabezado\nTexto debajo del encabezado.',
  '> Una cita o frase del personaje.',
  'Párrafo de arriba.\n\n---\n\nPárrafo tras una línea separadora.',
  '### Golpe salvaje (2 Might)\nAtaque cuerpo a cuerpo que inflige **+3 daño**.\n- *Acción*\n- Solo con armas pesadas',
];

/* =====================================================================
 * Construcción de la interfaz
 * ===================================================================== */
const state = { id: null, data: blank(), portrait: null };
const fields = []; // {spec, el}

function place(el, s) {
  el.classList.add('f');
  el.style.setProperty('--x', s.x);
  el.style.setProperty('--y', s.y);
  el.style.setProperty('--w', s.w);
  el.style.setProperty('--h', s.h);
  if (s.title) el.title = s.title;
}

function build(sheet, specs) {
  for (const s of specs) {
    let el;
    if (s.k === 'text') {
      el = document.createElement('input');
      el.type = 'text';
      el.autocomplete = 'off';
      el.spellcheck = false;
      if (s.cls) el.classList.add(...s.cls.split(' '));
      if (s.ph) el.placeholder = s.ph;
      el.dataset.fs = s.fs || Math.min(s.h * 0.72, 30);
      el.addEventListener('input', () => { setPath(state.data, s.f, el.value); fitInput(el); changed(s.f); });
    } else if (s.k === 'cb' || s.k === 'dot') {
      el = document.createElement('button');
      el.type = 'button';
      el.className = 'cb' + (s.k === 'dot' ? ' dot' : '');
      el.addEventListener('click', () => {
        const v = !getPath(state.data, s.f);
        setPath(state.data, s.f, v);
        el.classList.toggle('on', v);
        changed(s.f);
      });
    } else if (s.k === 'steps') {
      el = document.createElement('textarea');
      el.className = 'steps';
      el.wrap = 'off';
      el.spellcheck = false;
      el.placeholder = s.ph || '';
      el.addEventListener('input', () => { setPath(state.data, s.f, el.value); fitSteps(el, s); changed(s.f); });
    } else if (s.k === 'md') {
      el = document.createElement('div');
      el.className = 'md';
      el.addEventListener('click', e => { if (!e.target.closest('a')) openEditor(el, s); });
    } else if (s.k === 'portrait') {
      el = buildPortrait();
    }
    place(el, s);
    sheet.appendChild(el);
    fields.push({ spec: s, el });
  }
}

/* ---- ajuste automático del tamaño de letra ---- */
const measureCtx = document.createElement('canvas').getContext('2d');
function fitInput(el) {
  const base = +el.dataset.fs;
  const cs = getComputedStyle(el);
  measureCtx.font = `${cs.fontWeight} ${base}px ${cs.fontFamily}`;
  const avail = el.offsetWidth - 6;
  const w = measureCtx.measureText(el.value || '').width;
  const fs = w > avail && w > 0 ? Math.max(8, base * avail / w) : base;
  el.style.fontSize = fs + 'px';
}
/** Lista de valores de una reserva: reduce la letra si no cabe y muestra la suma como pista. */
function fitSteps(el, s) {
  let fs = 13;
  el.style.fontSize = fs + 'px';
  while ((el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && fs > 7) {
    fs -= 0.5;
    el.style.fontSize = fs + 'px';
  }
  const nums = (el.value.match(/[-+]?\d+/g) || []).map(Number);
  const sum = nums.reduce((a, b) => a + b, 0);
  el.title = 'Valor inicial y sus incrementos, uno por línea' + (nums.length ? `\nReserva máxima: ${sum}` : '');
  const pool = fields.find(f => f.spec.f === s.f.replace(/\.max$/, '.pool'));
  if (pool) pool.el.placeholder = nums.length ? String(sum) : '–';
}
function fitMD(el) {
  let fs = 13;
  el.style.fontSize = fs + 'px';
  while (el.scrollHeight > el.clientHeight + 1 && fs > 6) {
    fs -= 0.5;
    el.style.fontSize = fs + 'px';
  }
}
function renderBox(el, s) {
  const v = getPath(state.data, s.f) || '';
  el.innerHTML = renderMD(v);
  el.classList.toggle('empty', !v.trim());
  fitMD(el);
}

/* ---- editor markdown ---- */
let editor = null;
function openEditor(box, s) {
  if (editor) closeEditor();
  const ta = document.createElement('textarea');
  ta.className = 'md-edit';
  place(ta, s);
  ta.classList.remove('f');
  Object.assign(ta.style, { left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px' });
  ta.value = getPath(state.data, s.f) || '';
  ta.spellcheck = true;

  const tools = document.createElement('div');
  tools.className = 'md-tools';
  tools.style.left = s.x + 'px';
  tools.style.top = Math.max(2, s.y - 32) + 'px';
  const T = [
    ['B', 'Negrita (Ctrl+B)', () => wrap(ta, '**'), 'font-weight:800'],
    ['I', 'Cursiva (Ctrl+I)', () => wrap(ta, '*'), 'font-style:italic'],
    ['|'],
    ['•', 'Lista', () => prefix(ta, () => '- ')],
    ['1.', 'Lista numerada', () => prefix(ta, (_, i) => `${i + 1}. `)],
    ['H', 'Encabezado', () => prefix(ta, () => '### ')],
    ['❝', 'Cita', () => prefix(ta, () => '> ')],
    ['—', 'Línea separadora', () => insert(ta, '\n---\n')],
    ['|'],
    ['✓', 'Terminar (Esc)', () => ta.blur()],
  ];
  for (const [label, title, fn, css] of T) {
    if (label === '|') { const sp = document.createElement('span'); sp.className = 'sep'; tools.appendChild(sp); continue; }
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    if (css) b.style.cssText = css;
    b.addEventListener('mousedown', e => e.preventDefault()); // no perder el foco
    b.addEventListener('click', () => { fn(); ta.dispatchEvent(new Event('input')); });
    tools.appendChild(b);
  }

  ta.addEventListener('input', () => { setPath(state.data, s.f, ta.value); changed(s.f); });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); ta.blur(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); wrap(ta, '**'); ta.dispatchEvent(new Event('input')); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); wrap(ta, '*'); ta.dispatchEvent(new Event('input')); }
    if (e.key === 'Enter' && !e.shiftKey) continueList(ta, e);
  });
  ta.addEventListener('blur', closeEditor);

  box.classList.add('editing');
  box.parentNode.append(ta, tools);
  editor = { ta, tools, box, s };
  ta.focus();
}
function closeEditor() {
  if (!editor) return;
  const { ta, tools, box, s } = editor;
  editor = null;
  ta.remove();
  tools.remove();
  box.classList.remove('editing');
  renderBox(box, s);
}
function insert(ta, text) {
  ta.focus();
  if (!document.execCommand('insertText', false, text)) ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
}
function wrap(ta, mark) {
  const { selectionStart: a, selectionEnd: b, value } = ta;
  const sel = value.slice(a, b) || 'texto';
  insert(ta, mark + sel + mark);
  ta.setSelectionRange(a + mark.length, a + mark.length + sel.length);
}
function prefix(ta, fn) {
  const v = ta.value;
  const a = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
  let b = v.indexOf('\n', Math.max(ta.selectionEnd - (ta.selectionEnd > ta.selectionStart ? 1 : 0), a));
  if (b < 0) b = v.length;
  const out = v.slice(a, b).split('\n').map((l, i) => fn(l, i) + l.replace(/^(\s*)([-*+]|\d+[.)]|#{1,4}|>)\s+/, '$1')).join('\n');
  ta.setSelectionRange(a, b);
  insert(ta, out);
}
function continueList(ta, e) {
  const v = ta.value, p = ta.selectionStart;
  const lineStart = v.lastIndexOf('\n', p - 1) + 1;
  const line = v.slice(lineStart, p);
  const m = line.match(/^(\s*)([-*+]|(\d+)([.)]))\s+(.*)$/);
  if (!m) return;
  e.preventDefault();
  if (!m[5].trim()) { // ítem vacío: termina la lista
    ta.setSelectionRange(lineStart, p);
    insert(ta, '');
    return;
  }
  const bullet = m[3] ? `${+m[3] + 1}${m[4]}` : m[2];
  insert(ta, `\n${m[1]}${bullet} `);
  ta.dispatchEvent(new Event('input'));
}

/* ---- retrato ---- */
let portraitEl;
function buildPortrait() {
  const box = document.createElement('div');
  box.className = 'portrait cover';
  box.innerHTML = `
    <img alt="Retrato" hidden draggable="false">
    <div class="empty-msg">Haz clic o arrastra aquí una imagen para el retrato</div>
    <div class="p-ctrl">
      <button type="button" data-a="load">Cargar imagen</button>
      <button type="button" data-a="fit">Ajustar</button>
      <button type="button" data-a="clear">Quitar</button>
    </div>`;
  const img = $('img', box);
  const file = $('#portrait-file');
  $('.empty-msg', box).addEventListener('click', () => file.click());
  box.addEventListener('click', e => {
    const a = e.target.dataset.a;
    if (a === 'load') file.click();
    if (a === 'fit') {
      state.data.portraitFit = state.data.portraitFit === 'cover' ? 'contain' : 'cover';
      showPortrait();
      changed('portraitFit');
    }
    if (a === 'clear' && state.portrait) {
      state.portrait = null;
      showPortrait();
      savePortrait();
    }
  });
  file.addEventListener('change', () => { if (file.files[0]) loadPortrait(file.files[0]); file.value = ''; });
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('drag'); });
  box.addEventListener('dragleave', () => box.classList.remove('drag'));
  box.addEventListener('drop', e => {
    e.preventDefault();
    box.classList.remove('drag');
    const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
    if (f) loadPortrait(f);
  });
  // arrastrar para encuadrar (modo "rellenar")
  img.addEventListener('pointerdown', e => {
    if (state.data.portraitFit !== 'cover') return;
    e.preventDefault();
    img.setPointerCapture(e.pointerId);
    const r = img.getBoundingClientRect();
    const pos0 = { ...(state.data.portraitPos || { x: 50, y: 50 }) };
    const px = e.clientX, py = e.clientY;
    const move = ev => {
      const clamp = v => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
      state.data.portraitPos = {
        x: clamp(pos0.x - (ev.clientX - px) / r.width * 150),
        y: clamp(pos0.y - (ev.clientY - py) / r.height * 150),
      };
      img.style.objectPosition = `${state.data.portraitPos.x}% ${state.data.portraitPos.y}%`;
    };
    const up = () => {
      img.removeEventListener('pointermove', move);
      img.removeEventListener('pointerup', up);
      changed('portraitPos');
    };
    img.addEventListener('pointermove', move);
    img.addEventListener('pointerup', up);
  });
  portraitEl = box;
  return box;
}
function showPortrait() {
  const img = $('img', portraitEl);
  const has = !!state.portrait;
  img.hidden = !has;
  if (has) img.src = state.portrait; else img.removeAttribute('src');
  $('.empty-msg', portraitEl).hidden = has;
  portraitEl.classList.toggle('cover', state.data.portraitFit === 'cover');
  portraitEl.classList.toggle('contain', state.data.portraitFit !== 'cover');
  $('[data-a="fit"]', portraitEl).textContent = state.data.portraitFit === 'cover' ? 'Ver entera' : 'Rellenar';
  $('[data-a="fit"]', portraitEl).hidden = !has;
  $('[data-a="clear"]', portraitEl).hidden = !has;
  const p = state.data.portraitPos || { x: 50, y: 50 };
  img.style.objectPosition = `${p.x}% ${p.y}%`;
}
/** Reduce una imagen a JPEG de como mucho ~600 KB (límite de Firestore: 1 MB por documento). */
function compressImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      let max = 1100, q = 0.86, out;
      do {
        const k = Math.min(1, max / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * k);
        c.height = Math.round(im.height * k);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(im, 0, 0, c.width, c.height);
        out = c.toDataURL('image/jpeg', q);
        if (q > 0.6) q -= 0.08; else max = Math.round(max * 0.8);
      } while (out.length > 600000 && max > 200);
      resolve(out);
    };
    im.onerror = () => reject(new Error('No se pudo leer la imagen'));
    im.src = src;
  });
}
async function shrinkPortrait(dataURL) {
  if (!dataURL) return null;
  return dataURL.length <= 600000 ? dataURL : compressImage(dataURL);
}
async function loadPortrait(file) {
  const url = URL.createObjectURL(file);
  try {
    state.portrait = await compressImage(url);
    state.data.portraitPos = { x: 50, y: 50 };
    showPortrait();
    savePortrait();
  } catch (e) {
    status(e.message, true);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* =====================================================================
 * Carga / guardado
 * ===================================================================== */
function fill() {
  for (const { spec: s, el } of fields) {
    if (s.k === 'text') { el.value = getPath(state.data, s.f) ?? ''; fitInput(el); }
    else if (s.k === 'steps') { el.value = getPath(state.data, s.f) ?? ''; fitSteps(el, s); }
    else if (s.k === 'cb' || s.k === 'dot') el.classList.toggle('on', !!getPath(state.data, s.f));
    else if (s.k === 'md') renderBox(el, s);
    else if (s.k === 'portrait') showPortrait();
  }
  fillPlayerSelect();
}

/** Desplegable de jugador de la ficha abierta (con opción de crear uno nuevo). */
function fillPlayerSelect() {
  const sel = $('#player');
  const cur = Mesa.playerById(state.data.playerId) ? state.data.playerId : '';
  const o = (v, t) => { const e = document.createElement('option'); e.value = v; e.textContent = t; return e; };
  sel.replaceChildren(
    o('', '— Sin jugador —'),
    ...Mesa.cache.players.filter(p => p.active !== false || p.id === cur).map(p => o(p.id, p.name || 'Sin nombre')),
    o('__new', '+ Nuevo jugador…'),
  );
  sel.value = cur;
}

let saveTimer = null, dirty = false;
function changed(path) {
  dirty = true;
  status('Cambios sin guardar…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 1500);
  if (['name', 'player', 'descriptor', 'type', 'focus'].includes(path)) updateListItem();
}
async function save() {
  clearTimeout(saveTimer);
  if (!dirty || state.id == null) return;
  dirty = false;
  try {
    await Store.update(state.id, { data: state.data });
    status('Guardado en la nube ' + new Date().toLocaleTimeString());
  } catch (e) {
    dirty = true;
    status('Error al guardar: ' + e.message, true);
  }
}
async function savePortrait() {
  try {
    clearTimeout(saveTimer);
    dirty = false;
    await Store.update(state.id, { portrait: state.portrait, data: state.data });
    status('Retrato guardado');
  } catch (e) { status('Error al guardar el retrato: ' + e.message, true); }
}
function status(msg, err = false) {
  const s = $('#status');
  s.textContent = msg;
  s.classList.toggle('err', err);
}

async function open(id) {
  await save();
  if (editor) closeEditor();
  status('Abriendo…');
  const rec = await Store.get(id);
  if (!rec) { status('La ficha ya no existe', true); await refreshList(); return; }
  state.id = rec.id;
  state.data = normalize(rec.data);
  state.portrait = rec.portrait || null;
  // la lista en memoria comparte los datos de la ficha abierta (para jugadores y partidas)
  const cached = Mesa.cache.characters.find(c => c.id === rec.id);
  if (cached) cached.data = state.data;
  fill();
  markActive();
  try { localStorage.setItem('ogoa-last', String(id)); } catch { /* sin almacenamiento */ }
  document.title = (state.data.name || 'Sin nombre') + ' · Old Gods of Appalachia';
  status('Abierta');
}

/* ---- lista lateral ---- */
const subtitle = d => [d.player, [d.descriptor, d.type].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'sin definir';
async function refreshList() {
  const recs = await Store.all();
  for (const r of recs) if (r.id === state.id) r.data = state.data;
  Mesa.cache.characters = recs;
  recs.sort((a, b) => (a.data.name || '').localeCompare(b.data.name || '', 'es', { sensitivity: 'base' }) || String(a.id).localeCompare(String(b.id)));
  const ul = $('#list');
  ul.innerHTML = '';
  for (const r of recs) {
    const li = document.createElement('li');
    li.dataset.id = r.id;
    li.innerHTML = '<span class="n"></span><span class="d"></span>';
    $('.n', li).textContent = r.data.name || 'Sin nombre';
    $('.d', li).textContent = subtitle(r.data);
    li.addEventListener('click', () => open(r.id));
    ul.appendChild(li);
  }
  markActive();
  const has = recs.length > 0;
  for (const b of ['#btn-dup', '#btn-del', '#btn-export', '#btn-print']) $(b).disabled = !has;
  return recs;
}
function markActive() {
  $$('#list li').forEach(li => li.classList.toggle('active', li.dataset.id === state.id));
}
function updateListItem() {
  const li = $(`#list li[data-id="${state.id}"]`);
  if (!li) return;
  $('.n', li).textContent = state.data.name || 'Sin nombre';
  $('.d', li).textContent = subtitle(state.data);
  document.title = (state.data.name || 'Sin nombre') + ' · Old Gods of Appalachia';
}

/* ---- acciones ---- */
async function createNew(data = {}, portrait = null) {
  await save();
  const rec = await Store.create(normalize(data), portrait);
  await refreshList();
  await open(rec.id);
  return rec;
}

function download(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const slug = s => (s || 'ficha').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'ficha';

async function importFiles(files) {
  let n = 0, firstId = null, games = null;
  for (const f of files) {
    try {
      const json = JSON.parse(await f.text());
      const full = !Array.isArray(json) && (Array.isArray(json.characters) || Array.isArray(json.players));
      const items = Array.isArray(json) ? json : full ? (json.characters || []) : [json];
      // copia completa: primero jugadores, luego fichas, luego partidas y sesiones (con los ids nuevos)
      const pMap = full && Array.isArray(json.players) ? await Mesa.restorePlayers(json) : new Map();
      const charMap = new Map();
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        const data = { ...(it.data && typeof it.data === 'object' ? it.data : it) };
        if (data.playerId) data.playerId = pMap.get(data.playerId) || data.playerId;
        const rec = await Store.create(normalize(data), await shrinkPortrait(it.portrait || null));
        if (it.id) charMap.set(it.id, rec.id);
        firstId ??= rec.id;
        n++;
      }
      if (full && Array.isArray(json.campaigns)) games = await Mesa.restoreGames(json, pMap, charMap);
    } catch (e) {
      status(`No se pudo importar ${f.name}: ${e.code || e.message}`, true);
    }
  }
  if (n || games) {
    await refreshList();
    if (await Mesa.migratePlayers()) await refreshList();
    fillPlayerSelect();
    if (firstId) await open(firstId);
    Mesa.refreshCurrent();
    status([`Importadas ${n} ficha${n === 1 ? '' : 's'}`, games && `${games.campaigns} partidas y ${games.sessions} sesiones`].filter(Boolean).join(', '));
  }
}

/* ---- escalado en pantalla ---- */
function applyZoom() {
  const main = $('#main');
  const avail = main.clientWidth - 48;
  const z = Math.max(0.35, Math.min(1.35, avail / 1200));
  $$('.sheet').forEach(s => { s.style.zoom = z; });
}

/* =====================================================================
 * Arranque
 * ===================================================================== */
async function init() {
  build($('#front'), FRONT);
  build($('#back'), BACK);
  applyZoom();
  window.addEventListener('resize', applyZoom);

  $('#btn-new').addEventListener('click', () => createNew());
  $('#player').addEventListener('change', async e => {
    let id = e.target.value;
    if (id === '__new') {
      const name = prompt('Nombre del nuevo jugador:');
      if (!name || !name.trim()) { fillPlayerSelect(); return; }
      id = (await Mesa.createPlayer(name)).id;
    }
    const p = Mesa.playerById(id);
    state.data.playerId = p?.id || '';
    state.data.player = p?.name || '';
    fillPlayerSelect();
    changed('player');
  });
  Mesa.init({
    status,
    async openCharacter(id) { Mesa.showView('fichas'); await open(id); },
    async newCharacter(data) { Mesa.showView('fichas'); await createNew(data); },
    async playersChanged() {
      // un jugador renombrado o borrado: la ficha abierta debe reflejarlo antes de guardarse
      const p = Mesa.playerById(state.data.playerId);
      if (state.data.playerId && !p) state.data.player = '';
      state.data.playerId = p?.id || '';
      if (p) state.data.player = p.name;
      fillPlayerSelect();
      await refreshList();
    },
  });
  $('#btn-dup').addEventListener('click', async () => {
    await save();
    const copy = structuredClone(state.data);
    copy.name = (copy.name || 'Sin nombre') + ' (copia)';
    await createNew(copy, state.portrait);
  });
  $('#btn-del').addEventListener('click', async () => {
    if (state.id == null) return;
    const used = Mesa.cache.sessions.filter(s => Object.values(s.attendance || {}).some(a => a.characterId === state.id)).length;
    const warn = used ? `\n\nEste personaje aparece en ${used} sesión${used === 1 ? '' : 'es'}: allí se verá como "(ficha borrada)"; las estadísticas no cambian.` : '';
    if (!confirm(`¿Borrar la ficha "${state.data.name || 'Sin nombre'}"? No se puede deshacer.${warn}`)) return;
    clearTimeout(saveTimer);
    dirty = false;
    await Store.remove(state.id);
    state.id = null;
    const recs = await refreshList();
    if (recs.length) await open(recs[0].id);
    else await createNew();
  });
  $('#btn-export').addEventListener('click', async () => {
    await save();
    download(`${slug(state.data.name)}.json`, { app: 'ogoa-fichas', version: 1, data: state.data, portrait: state.portrait });
  });
  $('#btn-export-all').addEventListener('click', async () => {
    await save();
    await Mesa.flushAll();
    status('Preparando copia…');
    const recs = await Promise.all((await Store.all()).map(r => Store.get(r.id)));
    await Mesa.load();
    status('Copia descargada');
    const stamp = new Date().toISOString().slice(0, 10);
    download(`fichas-ogoa-${stamp}.json`, {
      app: 'ogoa-fichas', version: 2,
      characters: recs.map(r => ({ id: r.id, data: r.data, portrait: r.portrait })),
      ...Mesa.snapshot(),
    });
  });
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async e => {
    await importFiles([...e.target.files]);
    e.target.value = '';
  });

  // imprimir: menú con ambas caras / solo anverso / solo reverso
  const printBtn = $('#btn-print'), printMenu = $('#print-menu');
  const toggleMenu = show => {
    printMenu.hidden = !show;
    printBtn.setAttribute('aria-expanded', String(show));
  };
  printBtn.addEventListener('click', () => toggleMenu(printMenu.hidden));
  document.addEventListener('click', e => { if (!e.target.closest('.menu-wrap')) toggleMenu(false); });
  printMenu.addEventListener('click', async e => {
    const what = e.target.dataset.print;
    if (!what) return;
    toggleMenu(false);
    document.body.dataset.print = what;
    if (editor) closeEditor();
    await save();
    window.print();
  });

  // ayuda de Markdown
  const help = $('#help');
  const grid = $('#help-grid');
  for (const ex of MD_EXAMPLES) {
    const pre = document.createElement('pre');
    pre.textContent = ex;
    const out = document.createElement('div');
    out.className = 'md';
    out.innerHTML = renderMD(ex);
    grid.append(pre, out);
  }
  $('#btn-help').addEventListener('click', () => { help.hidden = false; $('.close', help).focus(); });
  help.addEventListener('click', e => { if (e.target === help || e.target.closest('[data-close]')) help.hidden = true; });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!help.hidden) help.hidden = true; toggleMenu(false); }
  });
  window.addEventListener('beforeprint', () => { if (editor) closeEditor(); });
  window.addEventListener('beforeunload', e => {
    if (dirty || Mesa.hasPending()) { save(); Mesa.flushAll(); e.preventDefault(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); Mesa.flushAll(); } });

  // re-ajustar cuando terminen de cargar las fuentes web
  document.fonts?.ready.then(() => { if (state.id != null) fill(); });

  $('#btn-login').addEventListener('click', async () => {
    try { await Auth.signIn(); }
    catch (e) {
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        showLogin('No se pudo iniciar sesión: ' + (e.code || e.message));
      }
    }
  });
  for (const id of ['#btn-logout', '#btn-switch']) {
    $(id).addEventListener('click', async () => { await save(); await Mesa.flushAll(); await Auth.signOut(); location.reload(); });
  }
  $('#btn-migrate').addEventListener('click', migrateLocal);

  Auth.onChange(startSession);
}

/* ---- sesión ---- */
function showLogin(msg = '', mode = 'login') {
  $('#login').hidden = false;
  $('#login-msg').textContent = msg;
  $('#login-msg').hidden = !msg;
  $('#btn-login').hidden = mode !== 'login';
  $('#btn-switch').hidden = mode !== 'denied';
  $('#login-busy').hidden = mode !== 'busy';
}

let sessionStarted = false;
async function startSession(user) {
  if (!user) { showLogin(); return; }
  if (sessionStarted) return;
  showLogin('Conectando como ' + user.email + '…', 'busy');
  let recs;
  try {
    recs = await refreshList();
  } catch (e) {
    if (e.code === 'permission-denied') {
      showLogin(`La cuenta ${user.email} no tiene acceso a estas fichas. Pide al administrador que la autorice, o entra con otra cuenta.`, 'denied');
    } else {
      showLogin('No se pudo conectar con la base de datos: ' + (e.code || e.message), 'denied');
    }
    return;
  }
  sessionStarted = true;
  $('#login').hidden = true;
  $('#user-email').textContent = user.email;

  // jugadores, partidas y sesiones; las fichas antiguas con "Jugador" escrito a mano se enlazan solas
  try {
    await Mesa.load();
    const linked = await Mesa.migratePlayers();
    if (linked) recs = await refreshList();
  } catch (e) {
    status('No se pudieron cargar jugadores y partidas: ' + (e.code || e.message), true);
  }

  let last = null, view = location.hash.slice(1);
  try { last = localStorage.getItem('ogoa-last'); view ||= localStorage.getItem('ogoa-view'); } catch { /* nada */ }
  if (!recs.length) await createNew();
  else await open(recs.some(r => r.id === last) ? last : recs[0].id);
  Mesa.showView(view || 'fichas');
  checkLocal();
}

/* ---- fichas guardadas en el navegador antes de usar la nube ---- */
const MIGRATED = 'ogoa-migrated';
async function checkLocal() {
  let done = false;
  try { done = localStorage.getItem(MIGRATED) === '1'; } catch { /* nada */ }
  const local = done ? [] : await LocalStore.all();
  const btn = $('#btn-migrate');
  btn.hidden = !local.length;
  btn.textContent = `Subir a la nube ${local.length} ficha${local.length > 1 ? 's' : ''} de este navegador`;
  return local;
}
async function migrateLocal() {
  const local = await checkLocal();
  if (!local.length) return;
  const names = local.map(r => '• ' + (r.data?.name || 'Sin nombre')).join('\n');
  if (!confirm(`Se subirán a la nube estas fichas guardadas en este navegador:\n\n${names}\n\n¿Continuar?`)) return;
  const btn = $('#btn-migrate');
  btn.disabled = true;
  let n = 0, firstId = null;
  try {
    for (const r of local) {
      status(`Subiendo ${n + 1} de ${local.length}…`);
      const rec = await Store.create(normalize(r.data), await shrinkPortrait(r.portrait));
      firstId ??= rec.id;
      n++;
    }
    try { localStorage.setItem(MIGRATED, '1'); } catch { /* nada */ }
    btn.hidden = true;
    await refreshList();
    await open(firstId);
    status(`Subidas ${n} ficha${n > 1 ? 's' : ''} a la nube`);
  } catch (e) {
    status(`Error al subir (${n} subidas): ${e.code || e.message}`, true);
  } finally {
    btn.disabled = false;
  }
}

init().catch(e => showLogin('Error al iniciar la aplicación: ' + e.message, 'denied'));
