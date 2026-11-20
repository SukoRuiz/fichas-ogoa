/* Imprimir y exportar fichas a PDF o imagen, listas para imprimir.
 *
 *  - Cada cara va en una hoja del papel de su layout (A4, A3 o Carta) con su orientación,
 *    centrada y lo más grande posible; el margen se elige (0 mm por defecto).
 *  - Doble cara: las caras de cada ficha van seguidas (anverso, reverso…). Si una ficha
 *    tiene un número impar de caras se añade una hoja en blanco, para que la siguiente
 *    empiece en una hoja nueva. Opcionalmente se giran 180° las caras pares.
 *  - Imprimir usa el diálogo del navegador (texto vectorial; «Guardar como PDF» da un PDF).
 *    «Descargar PDF» e «Imagen» generan el archivo directamente (cada cara como imagen).
 *
 * Las librerías de PDF, captura e imagen se cargan solo al usarlas.
 */
import { getLayout, DEFAULT_LAYOUT, paperOf, paperMM, PAPERS, orientationOf } from './layouts/index.js';
import { renderReadOnly } from './sheet.js';
import { ensureImages } from './editor.js';
import { esc, saveBlob, slug } from './ui.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const PX_PER_MM = 96 / 25.4;

let ctx = null; // { status(msg, err), load(id) -> { data, portrait }, flush() }
export function init(context) { ctx = context; }

/* ---------------- librerías (CDN, solo cuando hacen falta) ---------------- */
const LIBS = {
  html2canvas: ['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', () => window.html2canvas],
  jspdf: ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', () => window.jspdf?.jsPDF],
  jszip: ['https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', () => window.JSZip],
};
const loading = new Map();
function lib(name) {
  const [src, get] = LIBS[name];
  if (get()) return Promise.resolve(get());
  if (!loading.has(name)) {
    loading.set(name, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => (get() ? resolve(get()) : reject(new Error('No se pudo cargar ' + name)));
      s.onerror = () => { loading.delete(name); reject(new Error(`No se pudo cargar ${name} (¿sin conexión?)`)); };
      document.head.appendChild(s);
    }));
  }
  return loading.get(name);
}

/* =====================================================================
 * Ventana de opciones
 * ===================================================================== */
const PREFS_KEY = 'ogoa-export';
const DEFAULTS = { faces: 'all', margin: 0, duplex: true, rotate: false, dpi: 200, img: 'jpg' };
function prefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}

/**
 * Abre la ventana de imprimir / exportar.
 * items: [{ id, name, sub, layoutId }] en el orden en que se imprimirán.
 * title: de qué se trata (p. ej. "Fichas de Ana"); file: nombre base del archivo.
 */
export function open({ items, title, file }) {
  if (!items.length) { ctx.status('No hay fichas que imprimir', true); return; }
  const modal = $('#export-modal');
  const p = prefs();
  const layouts = [...new Set(items.map(it => it.layoutId))].map(id => getLayout(id) || getLayout(DEFAULT_LAYOUT));
  const maxPages = Math.max(...layouts.map(l => l.pages.length));
  const faceName = i => {
    const names = [...new Set(layouts.map(l => l.pages[i]?.name).filter(Boolean))];
    return names.length === 1 ? names[0].toLowerCase() : `${i + 1}ª cara`;
  };
  modal.innerHTML = `
  <div class="modal-card export-card" role="dialog" aria-modal="true" aria-labelledby="ex-title">
    <div class="modal-head">
      <h2 id="ex-title">Imprimir o exportar <span class="muted">· ${esc(title)}</span></h2>
      <button type="button" class="close" data-close title="Cerrar (Esc)">✕</button>
    </div>
    <fieldset><legend>Fichas <span class="calc" id="ex-count"></span></legend>
      ${items.length > 1 ? '<p class="ex-all"><button type="button" class="link" data-sel="all">Todas</button> · <button type="button" class="link" data-sel="none">Ninguna</button></p>' : ''}
      <div class="ex-list">${items.map((it, i) => `<label class="check"><input type="checkbox" data-it="${i}" checked> <span><b>${esc(it.name)}</b> <span class="muted">${esc(it.sub || '')}</span></span></label>`).join('')}</div>
    </fieldset>
    <div class="form-grid dark ex-opts">
      <label>Caras <select id="ex-faces">
        <option value="all">Todas${maxPages === 2 ? ' (anverso y reverso)' : ''}</option>
        ${maxPages > 1 ? Array.from({ length: maxPages }, (_, i) => `<option value="${i}">Solo ${esc(faceName(i))}</option>`).join('') : ''}
      </select></label>
      <label>Margen <select id="ex-margin">${[0, 3, 5, 10].map(m => `<option value="${m}">${m ? m + ' mm' : 'Sin margen'}</option>`).join('')}</select></label>
      <label>Resolución (PDF e imagen) <select id="ex-dpi">${[[150, '150 ppp · ligero'], [200, '200 ppp · normal'], [300, '300 ppp · alta']].map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
      <label>Formato de imagen <select id="ex-img"><option value="jpg">JPG (ligero)</option><option value="png">PNG (sin pérdida, pesa mucho)</option></select></label>
    </div>
    <fieldset><legend>Doble cara</legend>
      <label class="check"><input type="checkbox" id="ex-duplex"> Que cada ficha empiece en una hoja nueva (añade una cara en blanco si tiene un número impar)</label>
      <label class="check"><input type="checkbox" id="ex-rotate"> Girar 180° las caras pares (actívalo si al imprimir a doble cara el reverso sale cabeza abajo)</label>
      <p class="hint">Para hojas apaisadas, en la impresora elige «doble cara · voltear por el borde corto».</p>
    </fieldset>
    <p class="hint" id="ex-sum"></p>
    <p class="hint">«Imprimir» abre el diálogo del navegador (texto nítido; elige «Guardar como PDF» para un PDF y pon los márgenes en «Ninguno» si te lo pregunta). «Descargar PDF» e «Imagen» crean el archivo directamente.</p>
    <div class="modal-foot">
      <span class="ex-busy" id="ex-busy" hidden></span>
      <span class="grow"></span>
      <button type="button" class="btn" data-close>Cancelar</button>
      <button type="button" class="btn" data-go="img" title="Una imagen por cara (si son varias, en un .zip)">Imagen</button>
      <button type="button" class="btn" data-go="pdf">Descargar PDF</button>
      <button type="button" class="btn primary" data-go="print">Imprimir…</button>
    </div>
  </div>`;

  $('#ex-faces', modal).value = p.faces === 'all' || +p.faces < maxPages ? String(p.faces) : 'all';
  $('#ex-margin', modal).value = String(p.margin);
  $('#ex-dpi', modal).value = String(p.dpi);
  $('#ex-img', modal).value = p.img === 'png' ? 'png' : 'jpg';
  $('#ex-duplex', modal).checked = p.duplex;
  $('#ex-rotate', modal).checked = p.rotate;

  const chosen = () => $$('[data-it]', modal).filter(cb => cb.checked).map(cb => items[+cb.dataset.it]);
  const opts = () => ({
    faces: $('#ex-faces', modal).value,
    margin: +$('#ex-margin', modal).value,
    dpi: +$('#ex-dpi', modal).value,
    img: $('#ex-img', modal).value,
    duplex: $('#ex-duplex', modal).checked,
    rotate: $('#ex-rotate', modal).checked,
  });
  const summary = () => {
    const sel = chosen(), o = opts();
    $('#ex-count', modal).textContent = `· ${sel.length} de ${items.length}`;
    const plan = planPages(sel.map(it => ({ it, layout: getLayout(it.layoutId) || getLayout(DEFAULT_LAYOUT) })), o);
    const papers = [...new Set(plan.filter(x => !x.blank).map(x => `${PAPERS[paperOf(x.layout)].label} ${orientationOf(x.page) === 'landscape' ? 'apaisado' : 'vertical'}`))];
    const blanks = plan.filter(x => x.blank).length;
    $('#ex-sum', modal).textContent = sel.length
      ? `${plan.length} cara${plan.length === 1 ? '' : 's'}${blanks ? ` (${blanks} en blanco)` : ''} · ${papers.join(', ')}`
      : 'Elige al menos una ficha.';
    $('#ex-duplex', modal).disabled = o.faces !== 'all';
    for (const b of $$('[data-go]', modal)) b.disabled = !sel.length;
  };
  modal.addEventListener('change', summary);
  for (const b of $$('[data-sel]', modal)) b.addEventListener('click', () => { for (const cb of $$('[data-it]', modal)) cb.checked = b.dataset.sel === 'all'; summary(); });
  summary();

  const close = () => { modal.hidden = true; modal.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape' && !busy) close(); };
  document.addEventListener('keydown', onKey);
  let busy = false;
  modal.onclick = e => { if (!busy && (e.target === modal || e.target.closest('[data-close]'))) close(); };
  for (const b of $$('[data-go]', modal)) b.addEventListener('click', async () => {
    const o = opts(), sel = chosen();
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(o)); } catch { /* nada */ }
    busy = true;
    for (const x of $$('button', modal)) x.disabled = true;
    const bz = $('#ex-busy', modal);
    bz.hidden = false;
    const progress = t => { bz.textContent = t; };
    try {
      const n = sel.length === 1 ? slug(sel[0].name) : slug(file);
      if (b.dataset.go === 'print') { close(); await print(sel, o); return; }
      if (b.dataset.go === 'pdf') await toPDF(sel, o, n, progress);
      else await toImages(sel, o, n, progress);
      close();
    } catch (err) {
      ctx.status('No se pudo exportar: ' + (err.code || err.message), true);
      progress('Error: ' + (err.message || err));
      busy = false;
      for (const x of $$('button', modal)) x.disabled = false;
      summary();
    }
  });
  modal.hidden = false;
  $('[data-go="print"]', modal).focus();
}

/* =====================================================================
 * Páginas a generar
 * ===================================================================== */
/** Lista de caras: [{ it, layout, page, blank, rotate }] en orden de impresión. */
function planPages(sel, o) {
  const out = [];
  sel.forEach(({ it, layout }, k) => {
    const pages = o.faces === 'all' ? layout.pages : layout.pages.filter((_, i) => i === +o.faces);
    for (const page of pages) out.push({ it, layout, page, blank: false });
    // a doble cara, la siguiente ficha empieza en hoja nueva
    if (o.faces === 'all' && o.duplex && pages.length % 2 && k < sel.length - 1) {
      out.push({ it, layout, page: pages.at(-1), blank: true });
    }
  });
  out.forEach((x, i) => { x.rotate = o.rotate && o.faces === 'all' && i % 2 === 1; });
  return out;
}

async function prepare(sel, o, progress = () => {}) {
  await ctx.flush();
  const withLayout = sel.map(it => ({ it, layout: getLayout(it.layoutId) || getLayout(DEFAULT_LAYOUT) }));
  for (const l of new Set(withLayout.map(x => x.layout))) await ensureImages(l);
  const recs = new Map();
  let i = 0;
  for (const { it } of withLayout) {
    progress(`Leyendo fichas… ${++i}/${withLayout.length}`);
    if (!recs.has(it.id)) recs.set(it.id, await ctx.load(it.id));
  }
  const plan = planPages(withLayout, o);
  for (const x of plan) x.rec = recs.get(x.it.id) || { data: {}, portrait: null };
  return plan;
}

/** Dibuja una cara (sin escalar) dentro de #print-root y espera a que carguen sus imágenes. */
async function buildSheet(x) {
  const { page } = x;
  const sheet = document.createElement('div');
  sheet.className = 'sheet static';
  sheet.style.width = page.width + 'px';
  sheet.style.height = page.height + 'px';
  if (page.paper) sheet.style.background = page.paper;
  const imgs = [];
  if (page.background) {
    const img = document.createElement('img');
    img.className = 'bg';
    img.alt = '';
    img.src = page.background;
    sheet.appendChild(img);
    imgs.push(img);
  }
  $('#print-root').appendChild(sheet);
  renderReadOnly(sheet, page, x.rec.data || {}, x.rec.portrait || null);
  const portrait = x.rec.portrait;
  if (portrait) { const im = new Image(); im.src = portrait; imgs.push(im); }
  await Promise.all(imgs.map(loaded));
  return sheet;
}
/** Espera a que cargue una imagen (sin colgarse si nunca avisa). */
function loaded(img, ms = 10000) {
  if (img.complete && img.naturalWidth) return Promise.resolve();
  return new Promise(r => {
    const t = setTimeout(r, ms);
    img.addEventListener('load', () => { clearTimeout(t); r(); }, { once: true });
    img.addEventListener('error', () => { clearTimeout(t); r(); }, { once: true });
  });
}

function clearRoot() { $('#print-root').replaceChildren(); }

/* =====================================================================
 * Imprimir (diálogo del navegador)
 * ===================================================================== */
let printing = false;
export const isPrinting = () => printing;

async function print(sel, o) {
  ctx.status('Preparando la impresión…');
  const plan = await prepare(sel, o);
  clearRoot();
  const root = $('#print-root');
  for (const x of plan) {
    const [wmm, hmm] = paperMM(x.layout, x.page);
    const sheetPage = document.createElement('div');
    sheetPage.className = `print-page pg-${paperOf(x.layout)}-${orientationOf(x.page)}`;
    sheetPage.style.width = wmm + 'mm';
    sheetPage.style.height = (hmm - 0.3) + 'mm'; // la altura justa puede desbordar por redondeo y dejar hojas en blanco
    sheetPage.style.padding = o.margin + 'mm';
    root.appendChild(sheetPage);
    if (x.blank) continue;
    const sheet = await buildSheet(x);
    const aw = (wmm - 2 * o.margin) * PX_PER_MM, ah = (hmm - 2 * o.margin) * PX_PER_MM;
    sheet.style.zoom = Math.min(aw / x.page.width, ah / x.page.height).toFixed(5);
    if (x.rotate) sheet.style.transform = 'rotate(180deg)';
    sheetPage.appendChild(sheet);
  }
  await document.fonts?.ready;
  printing = true;
  document.body.classList.add('printing');
  const done = () => {
    if (!printing) return;
    printing = false;
    document.body.classList.remove('printing');
    clearRoot();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  ctx.status('Listo para imprimir');
  window.print();
  setTimeout(() => { if (!matchMedia('print').matches) done(); }, 1000);
}

/* =====================================================================
 * PDF e imágenes (cada cara se dibuja en un lienzo del tamaño del papel)
 * ===================================================================== */
async function rasterize(plan, o, progress) {
  const html2canvas = await lib('html2canvas');
  await document.fonts?.ready;
  const out = [];
  let i = 0;
  for (const x of plan) {
    progress(`Generando cara ${++i} de ${plan.length}…`);
    const [wmm, hmm] = paperMM(x.layout, x.page);
    const k = o.dpi / 25.4; // px por mm
    const W = Math.round(wmm * k), H = Math.round(hmm * k), M = o.margin * k;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, W, H);
    if (!x.blank) {
      clearRoot();
      const sheet = await buildSheet(x);
      const s = Math.min((W - 2 * M) / x.page.width, (H - 2 * M) / x.page.height);
      const shot = await html2canvas(sheet, { scale: s, backgroundColor: '#ffffff', logging: false, useCORS: true });
      const dw = x.page.width * s, dh = x.page.height * s;
      g.save();
      if (x.rotate) { g.translate(W, H); g.rotate(Math.PI); }
      g.drawImage(shot, (W - dw) / 2, (H - dh) / 2, dw, dh);
      g.restore();
    }
    out.push({ x, canvas, wmm, hmm });
    await new Promise(r => setTimeout(r)); // deja respirar a la página
  }
  clearRoot();
  return out;
}

async function toPDF(sel, o, name, progress) {
  progress('Preparando…');
  const [jsPDF] = await Promise.all([lib('jspdf'), lib('html2canvas')]);
  const plan = await prepare(sel, o, progress);
  const pages = await rasterize(plan, o, progress);
  progress('Montando el PDF…');
  let pdf = null;
  for (const { canvas, wmm, hmm } of pages) {
    const orient = wmm > hmm ? 'landscape' : 'portrait';
    if (!pdf) pdf = new jsPDF({ orientation: orient, unit: 'mm', format: [wmm, hmm], compress: true });
    else pdf.addPage([wmm, hmm], orient);
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, wmm, hmm, undefined, 'FAST');
  }
  saveBlob(`${name}.pdf`, pdf.output('blob'));
  ctx.status(`PDF descargado (${pages.length} cara${pages.length === 1 ? '' : 's'})`);
}

async function toImages(sel, o, name, progress) {
  progress('Preparando…');
  await lib('html2canvas');
  // en imagen no tienen sentido las caras en blanco ni el giro
  const plan = (await prepare(sel, { ...o, duplex: false, rotate: false }, progress)).filter(x => !x.blank);
  const pages = await rasterize(plan, o, progress);
  const files = [];
  const used = new Map();
  for (const { x, canvas } of pages) {
    let base = `${slug(x.it.name)}-${slug(x.page.name || 'cara')}`;
    const n = (used.get(base) || 0) + 1;
    used.set(base, n);
    if (n > 1) base += `-${n}`;
    const png = o.img === 'png';
    files.push({ name: base + (png ? '.png' : '.jpg'), blob: await new Promise(r => canvas.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.92)) });
  }
  if (files.length === 1) saveBlob(files[0].name, files[0].blob);
  else {
    progress('Comprimiendo…');
    const JSZip = await lib('jszip');
    const zip = new JSZip();
    for (const f of files) zip.file(f.name, f.blob);
    saveBlob(`${name}.zip`, await zip.generateAsync({ type: 'blob' }));
  }
  ctx.status(files.length === 1 ? '1 imagen descargada' : `${files.length} imágenes descargadas (.zip)`);
}
