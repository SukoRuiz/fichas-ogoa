/* Fichas de personaje · Old Gods of Appalachia
 * Web estática (GitHub Pages). Los datos se guardan en Firebase (Firestore)
 * y solo pueden verlos las cuentas de Google autorizadas en las reglas.
 * Jugadores, partidas, sesiones y estadísticas están en mesa.js; imprimir y
 * exportar a PDF o imagen, en export.js.
 *
 * Las fichas se abren siempre desde un jugador, una partida o la lista de fichas
 * sin jugador, y el visor solo muestra las fichas de ese contexto. Crear, importar,
 * exportar, imprimir o asignar fichas se hace desde Jugadores y Partidas.
 */
import { Cloud as Store, LocalStore, Auth } from './store.js';
import * as Mesa from './mesa.js';
import * as Export from './export.js';
import { DEFAULT_LAYOUT, getLayout, orientationOf, paperOf, paperMM } from './layouts/index.js';
import { expandFields } from './layouts/fields.js';
import * as Editor from './editor.js';
import { renderMD, fitInput, fitBox, getPath, place, applyPortraitFit } from './sheet.js';
import { esc, decider, saveBlob, slug } from './ui.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const norm = s => (s || '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');

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
    background: '', arcs: '', notes: '', shortNotes: '',
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

function setPath(o, p, v) {
  const ks = p.split('.');
  const last = ks.pop();
  // un layout puede usar rutas que la ficha aún no tiene (p. ej. más filas de habilidades)
  ks.reduce((a, k, i) => (a[k] ??= /^\d+$/.test(ks[i + 1] ?? last) ? [] : {}), o)[last] = v;
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
const state = { id: null, data: blank(), portrait: null, vctx: null }; // vctx: contexto del visor (ver más abajo)
const fields = []; // {spec, el} del layout que se está mostrando
let layout = null;  // layout mostrado (ver layouts/)
let builtRev = -1;  // versión del layout cuando se construyeron las hojas (el editor la sube)

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

/** Lista de valores de una reserva: reduce la letra si no cabe y muestra la suma como pista. */
function fitSteps(el, s) {
  fitBox(el, 13, 7);
  const nums = (el.value.match(/[-+]?\d+/g) || []).map(Number);
  const sum = nums.reduce((a, b) => a + b, 0);
  el.title = 'Valor inicial y sus incrementos, uno por línea' + (nums.length ? `\nReserva máxima: ${sum}` : '');
  const pool = fields.find(f => f.spec.f === s.f.replace(/\.max$/, '.pool'));
  if (pool) pool.el.placeholder = nums.length ? String(sum) : '–';
}
function renderBox(el, s) {
  const v = getPath(state.data, s.f) || '';
  el.innerHTML = renderMD(v);
  el.classList.toggle('empty', !v.trim());
  fitBox(el, s.fs || 13);
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
  box.addEventListener('dblclick', e => { if (e.target === img) file.click(); });
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
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('drag'); });
  box.addEventListener('dragleave', () => box.classList.remove('drag'));
  box.addEventListener('drop', e => {
    e.preventDefault();
    box.classList.remove('drag');
    const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
    if (f) loadPortrait(f);
  });
  // arrastrar para encuadrar (modo "rellenar")
  // La imagen se escala para cubrir la zona (a lo alto o a lo ancho) y lo que sobra
  // se puede desplazar: el desplazamiento sigue al ratón píxel a píxel.
  img.addEventListener('pointerdown', e => {
    if (state.data.portraitFit !== 'cover' || !img.naturalWidth) return;
    e.preventDefault();
    img.setPointerCapture(e.pointerId);
    const r = img.getBoundingClientRect();
    const k = Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight);
    const ox = img.naturalWidth * k - r.width, oy = img.naturalHeight * k - r.height; // lo que sobra
    const pos0 = { ...(state.data.portraitPos || { x: 50, y: 50 }) };
    const px = e.clientX, py = e.clientY;
    const move = ev => {
      const clamp = v => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
      state.data.portraitPos = {
        x: ox > 0.5 ? clamp(pos0.x - (ev.clientX - px) / ox * 100) : 50,
        y: oy > 0.5 ? clamp(pos0.y - (ev.clientY - py) / oy * 100) : 50,
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
  if (!portraitEl) return; // el layout no tiene retrato
  const img = $('img', portraitEl);
  const has = !!state.portrait;
  img.hidden = !has;
  if (has) img.src = state.portrait; else img.removeAttribute('src');
  $('.empty-msg', portraitEl).hidden = has;
  applyPortraitFit(portraitEl, img, state.data);
  $('[data-a="fit"]', portraitEl).textContent = state.data.portraitFit === 'cover' ? 'Ver entera' : 'Rellenar';
  $('[data-a="fit"]', portraitEl).hidden = !has;
  $('[data-a="clear"]', portraitEl).hidden = !has;
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
}

/* =====================================================================
 * Layouts: qué hojas se muestran y dónde va cada campo
 * ===================================================================== */
const PX_PER_MM = 96 / 25.4;

function buildLayout(l) {
  if (editor) closeEditor();
  layout = l;
  builtRev = l._rev;
  fields.length = 0;
  portraitEl = null;
  const host = $('#sheets');
  host.replaceChildren();
  for (const pg of l.pages) {
    const o = orientationOf(pg);
    const sheet = document.createElement('div');
    sheet.className = `sheet ${o} pg-${paperOf(l)}-${o}`;
    sheet.dataset.page = pg.id;
    sheet.style.width = pg.width + 'px';
    sheet.style.height = pg.height + 'px';
    // Ctrl+P en el visor: cada cara ocupa su papel entero (sin margen)
    const [wmm, hmm] = paperMM(l, pg);
    sheet.style.setProperty('--pz', Math.min(wmm * PX_PER_MM / pg.width, hmm * PX_PER_MM / pg.height).toFixed(4));
    if (pg.paper) sheet.style.background = pg.paper;
    if (pg.background) {
      const img = document.createElement('img');
      img.className = 'bg';
      img.alt = '';
      img.src = pg.background;
      sheet.appendChild(img);
    }
    build(sheet, expandFields(pg.fields));
    host.appendChild(sheet);
  }
  applyZoom();
}

/** Layout de una ficha: desde una partida, el de esa partida; si no, el de su partida principal. */
function layoutIdFor(id, vc = state.vctx) {
  const c = vc?.type === 'campaign' ? Mesa.campaignById(vc.id) : null;
  if (c && getLayout(c.layoutId) && c.members.some(m => m.characterId === id)) return c.layoutId;
  return Mesa.layoutForCharacter(id).layoutId;
}

async function applyLayout() {
  const l = getLayout(layoutIdFor(state.id)) || getLayout(DEFAULT_LAYOUT);
  if (l !== layout || l._rev !== builtRev) {
    try { await Editor.ensureImages(l); } catch (e) { status('No se pudo cargar la imagen del layout: ' + (e.code || e.message), true); }
    buildLayout(l);
  }
}

let saveTimer = null, dirty = false;
function changed(path) {
  dirty = true;
  status('Cambios sin guardar…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 1500);
  if (['name', 'descriptor', 'type', 'focus'].includes(path)) updateListItem();
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

/* =====================================================================
 * Visor de fichas: siempre dentro de un contexto
 *   { type: 'player', id }   las fichas de un jugador
 *   { type: 'campaign', id } las fichas de los jugadores de una partida
 *   { type: 'unassigned' }   las fichas sin jugador
 * ===================================================================== */
const charById = id => Mesa.cache.characters.find(c => c.id === id) || null;
const byCharName = (a, b) => (a.data.name || '').localeCompare(b.data.name || '', 'es', { sensitivity: 'base' }) || String(a.id).localeCompare(String(b.id));
const describe = d => [d.descriptor, d.type, d.focus].filter(Boolean).join(' · ');

/** Contexto natural de una ficha: su jugador, o "sin jugador". */
function homeContext(id) {
  const pid = charById(id)?.data.playerId;
  return Mesa.playerById(pid) ? { type: 'player', id: pid } : { type: 'unassigned' };
}
function validContext(vc) {
  if (!vc) return false;
  if (vc.type === 'player') return !!Mesa.playerById(vc.id);
  if (vc.type === 'campaign') return !!Mesa.campaignById(vc.id);
  return vc.type === 'unassigned';
}
/** Fichas de un contexto, en el orden en que se listan. */
function contextChars(vc) {
  const all = Mesa.cache.characters;
  if (vc?.type === 'player') return all.filter(c => c.data.playerId === vc.id).sort(byCharName);
  if (vc?.type === 'campaign') {
    const c = Mesa.campaignById(vc.id);
    const ids = [...new Set((c?.members || []).map(m => m.characterId).filter(Boolean))];
    return ids.map(charById).filter(Boolean);
  }
  if (vc?.type === 'unassigned') return all.filter(c => !Mesa.playerById(c.data.playerId)).sort(byCharName);
  return [];
}
function contextLabel(vc) {
  if (vc?.type === 'player') { const n = Mesa.playerById(vc.id)?.name || 'Sin nombre'; return { back: n, title: `Fichas de ${n}` }; }
  if (vc?.type === 'campaign') { const n = Mesa.campaignById(vc.id)?.name || 'Sin nombre'; return { back: n, title: `Fichas de la partida` }; }
  return { back: 'Fichas sin jugador', title: 'Fichas sin jugador' };
}
function subtitle(c, vc = state.vctx) {
  const d = c.data;
  if (vc?.type === 'campaign') return [Mesa.playerById(d.playerId)?.name, [d.descriptor, d.type].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'sin definir';
  return describe(d) || 'sin definir';
}

async function open(id, vc = null) {
  await save();
  if (editor) closeEditor();
  status('Abriendo…');
  const rec = await Store.get(id);
  if (!rec) { status('La ficha ya no existe', true); await loadCharacters(); Mesa.refresh(); return false; }
  state.id = rec.id;
  state.data = normalize(rec.data);
  state.portrait = rec.portrait || null;
  // la lista en memoria comparte los datos de la ficha abierta (para jugadores y partidas)
  const cached = charById(rec.id);
  if (cached) cached.data = state.data;
  else Mesa.cache.characters.push({ id: rec.id, data: state.data });
  const inCtx = c => validContext(c) && contextChars(c).some(x => x.id === rec.id);
  if (vc && inCtx(vc)) state.vctx = vc;
  else if (!inCtx(state.vctx)) state.vctx = homeContext(rec.id);
  await applyLayout();
  fill();
  renderList();
  try {
    localStorage.setItem('ogoa-last', String(id));
    localStorage.setItem('ogoa-ctx', JSON.stringify(state.vctx));
  } catch { /* sin almacenamiento */ }
  status('Abierta');
  return true;
}

/** Recarga de Firestore la lista de fichas (sin retratos). */
async function loadCharacters() {
  const recs = await Store.all();
  for (const r of recs) if (r.id === state.id) r.data = state.data;
  Mesa.cache.characters = recs;
  return recs;
}

function renderList() {
  const vc = state.vctx;
  const lbl = contextLabel(vc);
  $('#btn-back').textContent = '← ' + lbl.back;
  $('#btn-back').title = vc?.type === 'campaign' ? 'Volver a la partida' : vc?.type === 'player' ? 'Volver al jugador' : 'Volver a las fichas sin jugador';
  $('#ctx-title').textContent = lbl.title;
  const ul = $('#list');
  ul.innerHTML = '';
  const list = contextChars(vc);
  for (const r of list) {
    const li = document.createElement('li');
    li.dataset.id = r.id;
    li.innerHTML = '<span class="n"></span><span class="d"></span>';
    $('.n', li).textContent = r.data.name || 'Sin nombre';
    $('.d', li).textContent = subtitle(r);
    li.addEventListener('click', () => open(r.id));
    ul.appendChild(li);
  }
  if (!list.length) ul.innerHTML = '<li class="empty">No hay fichas aquí.</li>';
  markActive();
}
function markActive() {
  $$('#list li').forEach(li => li.classList.toggle('active', li.dataset.id === state.id));
}
function updateListItem() {
  const li = $(`#list li[data-id="${state.id}"]`);
  if (!li) return;
  $('.n', li).textContent = state.data.name || 'Sin nombre';
  $('.d', li).textContent = subtitle({ data: state.data });
}

async function openCharacter(id, vc = null) {
  if (!(await open(id, vc))) return;
  Mesa.showView('fichas');
}
function backToContext() {
  const vc = state.vctx;
  if (vc?.type === 'campaign') Mesa.showCampaign(vc.id);
  else if (vc?.type === 'player') Mesa.showPlayer(vc.id);
  else Mesa.showUnassigned();
}

/* =====================================================================
 * Acciones sobre fichas (se usan desde Jugadores y Partidas)
 * ===================================================================== */
const loadRec = async id => (id === state.id ? { id, data: state.data, portrait: state.portrait } : Store.get(id));

/** Crea una ficha para un jugador (o sin jugador). Opcional: la asigna a la partida y la abre. */
async function createCharacter(playerId = '', { campaignId = '', openIt = true } = {}) {
  await save();
  const p = Mesa.playerById(playerId);
  const rec = await Store.create(normalize({ playerId: p?.id || '', player: p?.name || '' }));
  Mesa.cache.characters.push({ id: rec.id, data: rec.data });
  if (campaignId) Mesa.linkCharacters(campaignId, [rec.id]);
  else if (p) Mesa.fillEmptySlots(p.id);
  if (openIt) await openCharacter(rec.id, campaignId ? { type: 'campaign', id: campaignId } : null);
  else Mesa.refresh();
  return rec;
}

async function duplicateCharacter(id) {
  await save();
  const rec = await loadRec(id);
  if (!rec) return;
  const copy = structuredClone(rec.data);
  copy.name = (copy.name || 'Sin nombre') + ' (copia)';
  const n = await Store.create(normalize(copy), rec.portrait || null);
  Mesa.cache.characters.push({ id: n.id, data: n.data });
  Mesa.refresh();
  status(`Ficha duplicada: ${copy.name}`);
}

async function deleteCharacter(id) {
  const c = charById(id);
  if (!c) return;
  const used = Mesa.cache.sessions.filter(s => Object.values(s.attendance || {}).some(a => a.characterId === id)).length;
  const warn = used ? `\n\nEste personaje aparece en ${used} sesión${used === 1 ? '' : 'es'}: allí se verá como "(ficha borrada)"; las estadísticas no cambian.` : '';
  if (!confirm(`¿Borrar la ficha "${c.data.name || 'Sin nombre'}"? No se puede deshacer.${warn}`)) return;
  if (id === state.id) { clearTimeout(saveTimer); dirty = false; }
  await Store.remove(id);
  Mesa.cache.characters = Mesa.cache.characters.filter(x => x.id !== id);
  if (id === state.id) { state.id = null; state.data = blank(); state.portrait = null; }
  Mesa.refresh();
  status('Ficha borrada');
}

/** Descarga fichas en .json: una sola en el formato de siempre, varias juntas en un archivo. */
async function exportCharacters(ids, base = 'fichas') {
  if (!ids.length) return;
  await save();
  status('Preparando…');
  const recs = (await Promise.all(ids.map(loadRec))).filter(Boolean);
  if (recs.length === 1) {
    const r = recs[0];
    download(`${slug(r.data.name)}.json`, { app: 'ogoa-fichas', version: 1, id: r.id, data: r.data, portrait: r.portrait || null });
  } else {
    download(`${slug(base)}.json`, { app: 'ogoa-fichas', version: 1, characters: recs.map(r => ({ id: r.id, data: r.data, portrait: r.portrait || null })) });
  }
  status(`Exportada${recs.length === 1 ? '' : 's'} ${recs.length} ficha${recs.length === 1 ? '' : 's'}`);
}

/** Abre la ventana de imprimir / PDF / imagen con estas fichas. */
function printCharacters(ids, { title = 'Fichas', file = 'fichas', campaignId = '' } = {}) {
  const vc = campaignId ? { type: 'campaign', id: campaignId } : null;
  Export.open({
    title, file,
    items: ids.map(charById).filter(Boolean).map(c => ({
      id: c.id, name: c.data.name || 'Sin nombre',
      sub: [Mesa.playerById(c.data.playerId)?.name, describe(c.data)].filter(Boolean).join(' · '),
      layoutId: layoutIdFor(c.id, vc),
    })),
  });
}

function download(name, obj) {
  saveBlob(name, new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
}

/* ---------------- importar ---------------- */
let importTarget = null; // dónde van las fichas importadas: { type, id } o null (copia completa)
function chooseImport(target) {
  importTarget = target;
  $('#import-file').click();
}

/** Jugador de una ficha importada: el del contexto, el de la copia o uno con el mismo nombre. */
function resolvePlayer(data, pMap, target) {
  if (target?.type === 'player' && Mesa.playerById(target.id)) {
    data.playerId = target.id;
    data.player = Mesa.playerById(target.id).name;
    return;
  }
  if (target?.type === 'unassigned') { data.playerId = ''; data.player = ''; return; }
  let pid = pMap.get(data.playerId) || (Mesa.playerById(data.playerId) ? data.playerId : '');
  if (!pid && data.player) pid = Mesa.playerByName(data.player)?.id || '';
  if (pid) { data.playerId = pid; data.player = Mesa.playerById(pid).name; }
  else data.playerId = ''; // si trae nombre de jugador, migratePlayers lo crea y la enlaza
}

/** Ficha que ya existe: la misma (por id) o una con el mismo nombre y el mismo jugador. */
function findExisting(it, data) {
  const byId = it.id && charById(it.id);
  if (byId) return byId;
  const key = norm(data.name);
  if (!key) return null;
  const samePlayer = d => (d.playerId || data.playerId ? d.playerId === data.playerId : norm(d.player) === norm(data.player));
  return Mesa.cache.characters.find(c => norm(c.data.name) === key && samePlayer(c.data)) || null;
}

async function overwriteCharacter(existing, data, portrait) {
  if (!data.playerId && existing.data.playerId) { data.playerId = existing.data.playerId; data.player = existing.data.player; }
  const nd = normalize(data);
  const isOpen = existing.id === state.id;
  if (isOpen) { clearTimeout(saveTimer); dirty = false; if (editor) closeEditor(); }
  // sin retrato en el archivo: se conserva el que ya tenía
  await Store.update(existing.id, portrait ? { data: nd, portrait } : { data: nd });
  if (isOpen) {
    state.data = nd;
    if (portrait) state.portrait = portrait;
    if (Mesa.currentView() === 'fichas') { await applyLayout(); fill(); }
  }
  existing.data = nd;
}

async function importFiles(files, target = null) {
  await save();
  const decide = decider();
  const res = { created: 0, overwritten: 0, skipped: 0, ids: [], layouts: 0, games: null };
  for (const f of files) {
    try {
      const json = JSON.parse(await f.text());
      // un layout exportado
      if (json && !Array.isArray(json) && (json.app === 'ogoa-layout' || Array.isArray(json.layout?.pages))) {
        if (await Editor.importLayout(json, decide)) res.layouts++;
        continue;
      }
      const full = !Array.isArray(json) && (Array.isArray(json.players) || Array.isArray(json.campaigns));
      const items = Array.isArray(json) ? json : Array.isArray(json.characters) ? json.characters : [json];
      const many = items.length > 1 || files.length > 1;
      // copia completa: primero jugadores, luego fichas, luego layouts, partidas y sesiones
      const pMap = full && Array.isArray(json.players) ? await Mesa.restorePlayers(json) : new Map();
      const charMap = new Map();
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        const src = it.data && typeof it.data === 'object' ? it.data : it;
        const { app, version, id: _id, portrait: _p, ...data } = { ...src };
        resolvePlayer(data, pMap, target);
        const portrait = await shrinkPortrait(it.portrait || null);
        const existing = findExisting(it, data);
        let id, choice = 'new';
        if (existing) {
          const who = Mesa.playerById(existing.data.playerId)?.name;
          choice = await decide('ficha', {
            title: 'Esa ficha ya existe',
            html: `<p>Ya hay una ficha <b>${esc(existing.data.name || 'Sin nombre')}</b>${who ? ` de <b>${esc(who)}</b>` : ' sin jugador'}${describe(existing.data) ? ` <span class="muted">(${esc(describe(existing.data))})</span>` : ''}.</p>
              <p>¿Sobrescribir sus datos con los del archivo, crear otra ficha nueva o dejarla como está?</p>`,
            buttons: [{ v: 'overwrite', label: 'Sobrescribir', primary: true }, { v: 'new', label: 'Crear otra' }, { v: 'skip', label: 'Omitir' }],
            cancel: 'skip',
            remember: many ? 'Hacer lo mismo con las demás fichas que ya existan' : '',
          });
        }
        if (choice === 'skip') { id = existing.id; res.skipped++; }
        else if (choice === 'overwrite') { await overwriteCharacter(existing, data, portrait); id = existing.id; res.overwritten++; res.ids.push(id); }
        else {
          const rec = await Store.create(normalize(data), portrait);
          Mesa.cache.characters.push({ id: rec.id, data: rec.data });
          id = rec.id;
          res.created++;
          res.ids.push(id);
        }
        if (it.id) charMap.set(it.id, id);
      }
      if (full && Array.isArray(json.layouts)) res.layouts += await Editor.restore(json.layouts, decide);
      if (full && Array.isArray(json.campaigns)) {
        const g = await Mesa.restoreGames(json, pMap, charMap, decide);
        res.games = res.games ? { campaigns: res.games.campaigns + g.campaigns, sessions: res.games.sessions + g.sessions } : g;
      }
    } catch (e) {
      status(`No se pudo importar ${f.name}: ${e.code || e.message}`, true);
    }
  }
  if (!res.created && !res.overwritten && !res.skipped && !res.layouts && !res.games) return;
  await loadCharacters();
  if (await Mesa.migratePlayers()) await loadCharacters();
  for (const pid of new Set(res.ids.map(id => charById(id)?.data.playerId).filter(Boolean))) Mesa.fillEmptySlots(pid);
  let note = '';
  if (target?.type === 'campaign' && res.ids.length) {
    const { unlinked } = Mesa.linkCharacters(target.id, res.ids);
    if (unlinked) note = ` · ${unlinked} sin asignar en la partida (asígnalas en su pestaña Jugadores)`;
  }
  Mesa.refresh();
  if (Mesa.currentView() === 'fichas') renderList();
  const parts = [
    res.created && `${res.created} ficha${res.created === 1 ? '' : 's'} nueva${res.created === 1 ? '' : 's'}`,
    res.overwritten && `${res.overwritten} sobrescrita${res.overwritten === 1 ? '' : 's'}`,
    res.skipped && `${res.skipped} omitida${res.skipped === 1 ? '' : 's'}`,
    res.layouts && `${res.layouts} layout${res.layouts === 1 ? '' : 's'}`,
    res.games && `${res.games.campaigns} partidas y ${res.games.sessions} sesiones`,
  ].filter(Boolean);
  status('Importado: ' + (parts.join(', ') || 'nada') + note);
}

/* ---- copia de seguridad completa ---- */
async function exportBackup() {
  await save();
  await Mesa.flushAll();
  status('Preparando copia…');
  const recs = await Promise.all((await Store.all()).map(r => Store.get(r.id)));
  await Mesa.load();
  await Editor.flush();
  const layouts = await Editor.snapshot();
  status('Copia descargada');
  const stamp = new Date().toISOString().slice(0, 10);
  download(`fichas-ogoa-${stamp}.json`, {
    app: 'ogoa-fichas', version: 2,
    characters: recs.map(r => ({ id: r.id, data: r.data, portrait: r.portrait })),
    ...Mesa.snapshot(),
    layouts,
  });
}

/* ---- escalado en pantalla ---- */
function applyZoom() {
  const avail = $('#main').clientWidth - 48;
  for (const s of $$('#sheets .sheet')) {
    s.style.zoom = Math.max(0.35, Math.min(1.35, avail / parseFloat(s.style.width)));
  }
}

/* =====================================================================
 * Arranque
 * ===================================================================== */
async function init() {
  buildLayout(getLayout(DEFAULT_LAYOUT));
  Editor.init({
    status,
    download,
    campaignsUsing: id => Mesa.cache.campaigns.filter(c => (getLayout(c.layoutId) ? c.layoutId : DEFAULT_LAYOUT) === id).length,
    // fichas para el modo "Ver" del editor
    characters: () => Mesa.cache.characters,
    currentCharacter: () => state.id,
    loadCharacter: id => loadRec(id),
    openCharacter: id => openCharacter(id),
    playerName: id => Mesa.playerById(id)?.name || '',
  });
  Export.init({ status, load: loadRec, flush: save });
  const pfile = $('#portrait-file');
  pfile.addEventListener('change', () => { if (pfile.files[0]) loadPortrait(pfile.files[0]); pfile.value = ''; });
  window.addEventListener('resize', applyZoom);

  Mesa.init({
    status,
    openCharacter,
    hasOpenCharacter: () => state.id != null && !!charById(state.id),
    fichasTab: () => (state.vctx?.type === 'campaign' ? 'partidas' : 'jugadores'),
    // al volver al visor: la partida puede haber cambiado de layout o la ficha de contexto
    async onEnterFichas() {
      if (state.id == null) return;
      if (!validContext(state.vctx)) state.vctx = homeContext(state.id);
      await applyLayout();
      fill();
      renderList();
    },
    renderLayouts: () => Editor.render(),
    async playersChanged() {
      // un jugador renombrado o borrado: la ficha abierta debe reflejarlo antes de guardarse
      const p = Mesa.playerById(state.data.playerId);
      if (state.data.playerId && !p) state.data.player = '';
      state.data.playerId = p?.id || '';
      if (p) state.data.player = p.name;
      await loadCharacters();
    },
    fichas: {
      create: createCharacter,
      duplicate: duplicateCharacter,
      remove: deleteCharacter,
      export: exportCharacters,
      print: printCharacters,
      import: chooseImport,
      flush: save,
    },
  });
  $('#btn-back').addEventListener('click', backToContext);
  $('#btn-export-all').addEventListener('click', exportBackup);
  $('#btn-import').addEventListener('click', () => chooseImport(null));
  $('#import-file').addEventListener('change', async e => {
    const files = [...e.target.files];
    e.target.value = '';
    const t = importTarget;
    importTarget = null;
    if (files.length) await importFiles(files, t);
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
    if (e.key === 'Escape' && !help.hidden) help.hidden = true;
  });
  window.addEventListener('beforeprint', () => { if (editor) closeEditor(); });
  window.addEventListener('beforeunload', e => {
    if (dirty || Mesa.hasPending() || Editor.hasPending()) { save(); Mesa.flushAll(); Editor.flush(); e.preventDefault(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); Mesa.flushAll(); Editor.flush(); } });

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
    $(id).addEventListener('click', async () => { await save(); await Mesa.flushAll(); await Editor.flush(); await Auth.signOut(); location.reload(); });
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
  try {
    await loadCharacters();
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

  // layouts creados o modificados desde la web
  try { await Editor.load(); } catch (e) { status('No se pudieron cargar los layouts guardados: ' + (e.code || e.message), true); }

  // jugadores, partidas y sesiones; las fichas antiguas con "Jugador" escrito a mano se enlazan solas
  try {
    await Mesa.load();
    if (await Mesa.migratePlayers()) await loadCharacters();
  } catch (e) {
    status('No se pudieron cargar jugadores y partidas: ' + (e.code || e.message), true);
  }

  // se vuelve a donde se estaba: una ficha (con su contexto) o una pestaña
  let last = null, vc = null, view = location.hash.slice(1);
  try {
    last = localStorage.getItem('ogoa-last');
    vc = JSON.parse(localStorage.getItem('ogoa-ctx') || 'null');
    view ||= localStorage.getItem('ogoa-view');
  } catch { /* nada */ }
  if (view === 'fichas' && last && charById(last) && (await open(last, validContext(vc) ? vc : null))) Mesa.showView('fichas');
  else Mesa.showView(view && view !== 'fichas' ? view : 'jugadores');
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
  let n = 0;
  try {
    for (const r of local) {
      status(`Subiendo ${n + 1} de ${local.length}…`);
      await Store.create(normalize(r.data), await shrinkPortrait(r.portrait));
      n++;
    }
    try { localStorage.setItem(MIGRATED, '1'); } catch { /* nada */ }
    btn.hidden = true;
    await loadCharacters();
    if (await Mesa.migratePlayers()) await loadCharacters();
    Mesa.refresh();
    status(`Subidas ${n} ficha${n > 1 ? 's' : ''} a la nube`);
  } catch (e) {
    status(`Error al subir (${n} subidas): ${e.code || e.message}`, true);
  } finally {
    btn.disabled = false;
  }
}

init().catch(e => showLogin('Error al iniciar la aplicación: ' + e.message, 'denied'));
