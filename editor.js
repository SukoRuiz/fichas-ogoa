/* Editor de layouts de ficha (pestaña Layouts).
 *
 * Permite crear layouts nuevos subiendo la imagen de cada página y dibujando encima
 * las zonas de datos, y retocar los incluidos (se guarda una versión "modificada" que
 * se puede restaurar). Todo se guarda en Firestore: layouts/{id} y layoutImages/{id}__{página}.
 */
import { LayoutDocs, LayoutImages } from './store.js';
import { LAYOUTS, getLayout, setStored, toDoc, orientationOf } from './layouts/index.js';
import { CATALOG, TABLES, KIND_LABEL, catalogItem, tableCols } from './layouts/fields.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clean = o => JSON.parse(JSON.stringify(o)); // Firestore no admite undefined
const r2 = v => Math.round(v * 2) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const imgKey = (lid, pid) => `${lid}__${pid}`;

let ctx = null;       // { status, preview(id), download(name, obj), campaignsUsing(id) }
let stored = [];      // documentos guardados en Firestore ({ id, name, pages })
const imgCache = new Map();
const ui = { id: null, page: 0, sel: -1, zoom: 'fit', pending: null };

const cur = () => getLayout(ui.id);
const curPage = () => cur()?.pages[ui.page] || null;
const isEditable = l => !!l && (l.custom || l.modified);

/* =====================================================================
 * Carga y guardado
 * ===================================================================== */
export async function load() {
  stored = await LayoutDocs.all();
  setStored(stored);
}
function upsertStored(d) {
  const i = stored.findIndex(x => x.id === d.id);
  if (i >= 0) stored[i] = d; else stored.push(d);
}

/** Carga las imágenes subidas de un layout (las incluidas ya tienen su URL). */
export async function ensureImages(l) {
  await Promise.all(l.pages.filter(p => p.image && !String(p.background || '').startsWith('data:')).map(async p => {
    const k = imgKey(l.id, p.id);
    if (!imgCache.has(k)) imgCache.set(k, (await LayoutImages.get(k))?.img || '');
    p.background = imgCache.get(k);
  }));
}

const timers = new Map();
function changed(l) {
  l._rev = (l._rev || 0) + 1;
  clearTimeout(timers.get(l.id));
  timers.set(l.id, setTimeout(() => persist(l.id), 700));
  ctx.status('Cambios sin guardar…');
}
async function persist(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  const l = getLayout(id);
  if (!l || !isEditable(l)) return;
  const d = clean(toDoc(l));
  try {
    await LayoutDocs.set(id, d);
    upsertStored({ id, ...d });
    ctx.status('Layout guardado ' + new Date().toLocaleTimeString());
  } catch (e) {
    ctx.status('Error al guardar el layout: ' + (e.code || e.message), true);
  }
}
export const flush = () => Promise.all([...timers.keys()].map(persist));
export const hasPending = () => timers.size > 0;

/** Reduce la imagen de una página a JPEG de menos de ~900 KB (límite de Firestore: 1 MB). */
function compressPage(file) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      let max = Math.min(2000, Math.max(im.width, im.height)), q = 0.88, out, w, h;
      do {
        const k = max / Math.max(im.width, im.height);
        w = Math.round(im.width * k);
        h = Math.round(im.height * k);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, w, h);
        g.drawImage(im, 0, 0, w, h);
        out = c.toDataURL('image/jpeg', q);
        if (q > 0.64) q -= 0.06; else max = Math.round(max * 0.85);
      } while (out.length > 900000 && max > 400);
      URL.revokeObjectURL(u);
      resolve({ url: out, w, h });
    };
    im.onerror = () => { URL.revokeObjectURL(u); reject(new Error('No se pudo leer la imagen')); };
    im.src = u;
  });
}
async function urlToDataURL(url) {
  if (!url || url.startsWith('data:')) return url || '';
  const blob = await (await fetch(url)).blob();
  return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
}

/* =====================================================================
 * Vista
 * ===================================================================== */
export function init(context) {
  ctx = context;
  $('#btn-new-layout').addEventListener('click', newLayout);
  $('#btn-import-layout').addEventListener('click', () => $('#layout-file').click());
  $('#layout-file').addEventListener('change', async e => {
    for (const f of e.target.files) {
      try { await importLayout(JSON.parse(await f.text())); }
      catch (err) { ctx.status(`No se pudo importar ${f.name}: ${err.message}`, true); }
    }
    e.target.value = '';
  });
  $('#layout-page-file').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) await onPageImage(f);
  });
  document.addEventListener('keydown', onKey);
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (visible()) renderCanvas(); }, 120); });
}
const visible = () => !$('#panel-layouts').hidden;

export function select(id) { ui.id = id; ui.page = 0; ui.sel = -1; }

function describe(l) {
  const kind = l.custom ? 'Subido' : l.modified ? 'Incluido · modificado' : 'Incluido';
  const n = l.pages.length;
  const o = [...new Set(l.pages.map(orientationOf))].map(x => (x === 'portrait' ? 'vertical' : 'horizontal')).join(' y ');
  const uses = ctx.campaignsUsing(l.id);
  return [kind, `${n} pág.${n ? ' ' + o : ''}`, uses && `${uses} partida${uses === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
}

function renderList() {
  const ul = $('#layout-list');
  ul.innerHTML = '';
  for (const l of LAYOUTS) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="n"></span><span class="d"></span>';
    $('.n', li).textContent = l.name || 'Sin nombre';
    $('.d', li).textContent = describe(l);
    li.classList.toggle('active', l.id === ui.id);
    li.addEventListener('click', () => { select(l.id); render(); });
    ul.appendChild(li);
  }
}

export async function render() {
  if (!cur()) select(LAYOUTS[0].id);
  renderList();
  const l = cur();
  if (ui.page >= l.pages.length) ui.page = Math.max(0, l.pages.length - 1);
  const pg = curPage(), ed = isEditable(l);
  const root = $('#panel-layouts');
  const kind = l.custom ? 'Subido' : l.modified ? 'Incluido · modificado' : 'Incluido';
  root.innerHTML = `
  <div class="panel-card ly">
    <div class="panel-head">
      <input class="title-input" id="ly-name" autocomplete="off" placeholder="Nombre del layout"${ed ? '' : ' disabled'}>
      <span class="badge">${kind}</span>
    </div>
    ${ed ? '' : '<p class="hint">Este layout viene incluido en la web. Para cambiar sus zonas pulsa «Modificar»: se guarda una versión modificada que siempre puedes restaurar al original.</p>'}
    <div class="ly-actions">
      ${ed ? '' : '<button type="button" class="btn primary" data-a="edit">Modificar</button>'}
      <button type="button" class="btn" data-a="preview" title="Abre la ficha que tenías abierta con este layout">Ver en la ficha</button>
      <button type="button" class="btn" data-a="dup">Duplicar</button>
      <button type="button" class="btn" data-a="export" title="Descarga el layout con sus imágenes (.json)">Exportar</button>
      <span class="grow"></span>
      ${l.modified ? '<button type="button" class="btn danger" data-a="restore">Restaurar original</button>' : ''}
      ${l.custom ? '<button type="button" class="btn danger" data-a="delete">Borrar layout</button>' : ''}
    </div>
    <div class="ly-pages">
      ${l.pages.map((p, i) => `<button type="button" class="ly-tab${i === ui.page ? ' on' : ''}" data-page="${i}">${esc(p.name || `Página ${i + 1}`)}</button>`).join('')}
      ${ed ? '<button type="button" class="ly-tab add" data-a="addpage" title="Añade una página a partir de la imagen de la plantilla (PNG o JPG)">+ Página</button>' : ''}
    </div>
    ${pg ? `
    <div class="ly-pagebar">
      <input id="ly-pname" autocomplete="off" placeholder="Nombre de la página"${ed ? '' : ' disabled'}>
      <span class="muted">${pg.width} × ${pg.height} px · ${orientationOf(pg) === 'portrait' ? 'vertical' : 'horizontal'}</span>
      <span class="grow"></span>
      ${ed ? `<button type="button" class="btn" data-a="left" title="Mover antes"${ui.page === 0 ? ' disabled' : ''}>←</button>
        <button type="button" class="btn" data-a="right" title="Mover después"${ui.page === l.pages.length - 1 ? ' disabled' : ''}>→</button>
        <button type="button" class="btn" data-a="image" title="Sustituye la imagen; las zonas se reescalan si cambia el tamaño">Cambiar imagen</button>
        <button type="button" class="btn danger" data-a="delpage">Quitar página</button>` : ''}
      <select id="ly-zoom" title="Zoom">${[['fit', 'Ajustar'], ['1', '100 %'], ['1.5', '150 %'], ['2', '200 %']].map(([v, t]) => `<option value="${v}"${String(ui.zoom) === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
    </div>
    <div class="ly-work">
      <div class="ly-canvas-wrap"><div class="ly-canvas" tabindex="0"></div></div>
      <div class="ly-props"></div>
    </div>` : `<p class="hint">Este layout aún no tiene páginas. Pulsa «+ Página» y elige la imagen de la plantilla (PNG o JPG); después dibuja encima las zonas de datos.</p>`}
  </div>`;

  $('#ly-name', root).value = l.name;
  $('#ly-name', root).addEventListener('input', e => { l.name = e.target.value; changed(l); renderList(); });
  for (const b of $$('[data-page]', root)) b.addEventListener('click', () => { ui.page = +b.dataset.page; ui.sel = -1; render(); });
  for (const b of $$('[data-a]', root)) b.addEventListener('click', () => action(b.dataset.a));
  if (pg) {
    $('#ly-pname', root).value = pg.name || '';
    $('#ly-pname', root).addEventListener('input', e => {
      pg.name = e.target.value;
      changed(l);
      $(`[data-page="${ui.page}"]`, root).textContent = pg.name || `Página ${ui.page + 1}`;
    });
    $('#ly-zoom', root).addEventListener('change', e => { ui.zoom = e.target.value; renderCanvas(); });
    await ensureImages(l);
    if (cur() !== l) return;
    renderCanvas();
    renderProps();
  }
}

/* ---------------- acciones del layout ---------------- */
async function action(a) {
  const l = cur(), pg = curPage();
  try {
    if (a === 'edit') {
      const d = clean(toDoc(l));
      await LayoutDocs.set(l.id, d);
      upsertStored({ id: l.id, ...d });
      setStored(stored);
      ctx.status('Ahora puedes modificar este layout');
      return render();
    }
    if (a === 'preview') { await flush(); return ctx.preview(l.id); }
    if (a === 'dup') {
      await ensureImages(l);
      const nid = LayoutDocs.newId();
      const d = clean(toDoc(l));
      d.name = `${l.name} (copia)`;
      for (const p of l.pages) if (p.image) await LayoutImages.set(imgKey(nid, p.id), { img: p.background });
      await LayoutDocs.set(nid, d);
      upsertStored({ id: nid, ...d });
      setStored(stored);
      select(nid);
      ctx.status('Layout duplicado');
      return render();
    }
    if (a === 'export') {
      await ensureImages(l);
      ctx.status('Preparando el layout…');
      const pages = [];
      for (const p of l.pages) {
        pages.push({ id: p.id, name: p.name, width: p.width, height: p.height, orientation: p.orientation || '', image: await urlToDataURL(p.background), fields: clean(p.fields) });
      }
      ctx.download(`layout-${(l.name || 'ficha').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_')}.json`,
        { app: 'ogoa-layout', version: 1, layout: { name: l.name, pages } });
      return ctx.status('Layout exportado');
    }
    if (a === 'restore') {
      if (!confirm(`¿Restaurar "${l.name}" a su versión original? Se pierden los cambios hechos aquí.`)) return;
      await removeStored(l);
      ctx.status('Layout restaurado');
      return render();
    }
    if (a === 'delete') {
      const uses = ctx.campaignsUsing(l.id);
      if (!confirm(`¿Borrar el layout "${l.name}"?${uses ? `\n\nLo usan ${uses} partida${uses === 1 ? '' : 's'}: pasarán a usar el layout por defecto.` : ''}`)) return;
      await removeStored(l);
      select(LAYOUTS[0].id);
      ctx.status('Layout borrado');
      return render();
    }
    if (a === 'addpage' || a === 'image') { ui.pending = a; return $('#layout-page-file').click(); }
    if (a === 'left' || a === 'right') {
      const j = ui.page + (a === 'left' ? -1 : 1);
      [l.pages[ui.page], l.pages[j]] = [l.pages[j], l.pages[ui.page]];
      ui.page = j;
      changed(l);
      return render();
    }
    if (a === 'delpage') {
      if (!confirm(`¿Quitar la página "${pg.name || ui.page + 1}" y sus zonas?`)) return;
      if (pg.image) await LayoutImages.remove(imgKey(l.id, pg.id));
      l.pages.splice(ui.page, 1);
      ui.sel = -1;
      changed(l);
      return render();
    }
  } catch (e) {
    ctx.status('Error: ' + (e.code || e.message), true);
  }
}

async function removeStored(l) {
  clearTimeout(timers.get(l.id));
  timers.delete(l.id);
  const d = stored.find(x => x.id === l.id);
  for (const p of d?.pages || []) if (p.image) await LayoutImages.remove(imgKey(l.id, p.id));
  await LayoutDocs.remove(l.id);
  stored = stored.filter(x => x.id !== l.id);
  setStored(stored);
}

async function newLayout() {
  const nid = LayoutDocs.newId();
  const d = { name: 'Nuevo layout', pages: [] };
  await LayoutDocs.set(nid, d);
  upsertStored({ id: nid, ...d });
  setStored(stored);
  select(nid);
  await render();
  $('#ly-name')?.select();
}

async function onPageImage(file) {
  const l = cur();
  if (!isEditable(l)) return;
  ctx.status('Subiendo imagen…');
  try {
    const { url, w, h } = await compressPage(file);
    if (ui.pending === 'addpage') {
      const pid = 'p' + Date.now().toString(36);
      await LayoutImages.set(imgKey(l.id, pid), { img: url });
      imgCache.set(imgKey(l.id, pid), url);
      l.pages.push({ id: pid, name: `Página ${l.pages.length + 1}`, width: w, height: h, orientation: '', image: true, background: url, fields: [] });
      ui.page = l.pages.length - 1;
    } else {
      const pg = curPage();
      const sx = w / pg.width, sy = h / pg.height;
      if (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001) {
        for (const z of pg.fields) { z.x = r2(z.x * sx); z.y = r2(z.y * sy); z.w = r2(z.w * sx); z.h = r2(z.h * sy); }
      }
      Object.assign(pg, { width: w, height: h, orientation: '', image: true, background: url });
      await LayoutImages.set(imgKey(l.id, pg.id), { img: url });
      imgCache.set(imgKey(l.id, pg.id), url);
    }
    ui.sel = -1;
    l._rev = (l._rev || 0) + 1;
    await persist(l.id);
    await render();
  } catch (e) {
    ctx.status('No se pudo subir la imagen: ' + (e.code || e.message), true);
  }
}

/** Importa un layout exportado (crea uno nuevo; no sustituye a ninguno). */
async function importLayout(json) {
  const L = json.layout || json;
  if (!Array.isArray(L.pages)) throw new Error('no es un layout');
  const nid = LayoutDocs.newId();
  const pages = [];
  for (const [i, p] of L.pages.entries()) {
    const pid = p.id || 'p' + i;
    const img = typeof p.image === 'string' && p.image.startsWith('data:') ? p.image : '';
    if (img) await LayoutImages.set(imgKey(nid, pid), { img });
    pages.push({ id: pid, name: p.name || '', width: +p.width, height: +p.height, orientation: p.orientation || '', image: !!img, background: img ? '' : (p.background || ''), fields: p.fields || [] });
  }
  const name = L.name && !LAYOUTS.some(x => x.name === L.name) ? L.name : `${L.name || 'Layout'} (importado)`;
  const d = clean({ name, pages });
  await LayoutDocs.set(nid, d);
  upsertStored({ id: nid, ...d });
  setStored(stored);
  select(nid);
  ctx.status(`Layout "${name}" importado`);
  if (visible()) await render();
}

/** Para la copia de seguridad completa: layouts guardados con sus imágenes. */
export async function snapshot() {
  const out = [];
  for (const d of stored) {
    const images = {};
    for (const p of d.pages || []) if (p.image) images[p.id] = (await LayoutImages.get(imgKey(d.id, p.id)))?.img || '';
    const { updated_at, updated_by, created_at, ...rest } = d;
    out.push({ ...rest, images });
  }
  return out;
}
/** Restaura layouts de una copia de seguridad (mismo id, así las partidas siguen apuntando a ellos). */
export async function restore(list) {
  for (const it of list || []) {
    const { id, images = {}, ...d } = it;
    if (!id) continue;
    for (const [pid, img] of Object.entries(images)) if (img) await LayoutImages.set(imgKey(id, pid), { img });
    await LayoutDocs.set(id, clean(d));
    upsertStored({ id, ...d });
  }
  setStored(stored);
  return (list || []).length;
}

/* =====================================================================
 * Lienzo: zonas sobre la imagen
 * ===================================================================== */
function scale(pg) {
  if (ui.zoom !== 'fit') return +ui.zoom;
  const w = $('.ly-canvas-wrap')?.clientWidth || 700;
  return Math.min(1, (w - 2) / pg.width);
}

function zoneHTML(z, i, ed) {
  const item = catalogItem(z.f);
  const label = item ? item.label : 'Sin campo: elige uno';
  let extra = '';
  if (z.k === 'table' && TABLES[z.f]) {
    const def = TABLES[z.f], cols = tableCols(z);
    const total = cols.reduce((a, c) => a + (+c.w || 0), 0) || 1;
    const n = Math.max(1, Math.round(z.rows || def.rows));
    for (let r = 1; r < n; r++) extra += `<div class="ly-row" style="top:${(r / n) * 100}%"></div>`;
    let x = 0;
    cols.forEach((c, j) => {
      const w = (+c.w || 0) / total;
      extra += `<span class="ly-col" style="left:${x * 100}%;width:${w * 100}%;height:${100 / n}%">${esc(def.cols.find(d => d.c === c.c)?.label || c.c)}</span>`;
      x += w;
      if (j < cols.length - 1) extra += `<div class="ly-div" data-div="${j}" style="left:${x * 100}%" title="Arrastra para ajustar las columnas"></div>`;
    });
  }
  return `<div class="ly-zone k-${esc(z.k)}${z.f ? '' : ' nofield'}${i === ui.sel ? ' sel' : ''}" data-i="${i}" style="left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px" title="${esc(label)}">${extra}<span class="ly-label">${esc(label)}</span>${ed ? '<span class="ly-rs" data-rs title="Arrastra para cambiar el tamaño"></span>' : ''}</div>`;
}

function renderCanvas() {
  const l = cur(), pg = curPage(), cv = $('.ly-canvas');
  if (!cv || !pg) return;
  const s = scale(pg), ed = isEditable(l);
  cv.style.width = pg.width * s + 'px';
  cv.style.height = pg.height * s + 'px';
  cv.classList.toggle('readonly', !ed);
  cv.innerHTML = `<div class="ly-inner" style="width:${pg.width}px;height:${pg.height}px;transform:scale(${s});--s:${s}">${pg.fields.map((z, i) => zoneHTML(z, i, ed)).join('')}</div>`;
  const inner = $('.ly-inner', cv);
  if (pg.background) inner.style.backgroundImage = `url("${pg.background}")`;
  inner.addEventListener('pointerdown', onPointerDown);
}

function posZone(i) {
  const z = curPage().fields[i], el = $(`.ly-zone[data-i="${i}"]`);
  if (!el) return;
  Object.assign(el.style, { left: z.x + 'px', top: z.y + 'px', width: z.w + 'px', height: z.h + 'px' });
}
function redrawZone(i) {
  const el = $(`.ly-zone[data-i="${i}"]`);
  if (el) el.outerHTML = zoneHTML(curPage().fields[i], i, isEditable(cur()));
}

function selectZone(i) {
  ui.sel = i;
  for (const el of $$('.ly-zone')) el.classList.toggle('sel', +el.dataset.i === i);
  renderProps();
}

function onPointerDown(e) {
  const l = cur(), pg = curPage(), ed = isEditable(l);
  const inner = e.currentTarget, s = scale(pg);
  const rect = inner.getBoundingClientRect();
  const P = ev => ({ x: (ev.clientX - rect.left) / s, y: (ev.clientY - rect.top) / s });
  const p0 = P(e);
  const zoneEl = e.target.closest('.ly-zone');
  let mode = null, i = zoneEl ? +zoneEl.dataset.i : -1;
  if (ed && e.target.dataset.rs !== undefined) mode = 'resize';
  else if (ed && e.target.dataset.div !== undefined) mode = 'div';
  else if (zoneEl) { selectZone(i); if (ed) mode = 'move'; }
  else if (ed) mode = 'draw';
  else selectZone(-1);
  if (!mode) return;
  e.preventDefault();
  $('.ly-canvas').focus({ preventScroll: true });
  try { inner.setPointerCapture(e.pointerId); } catch { /* puntero ya liberado */ }

  const z = pg.fields[i];
  if (mode === 'div' && (!z.cols || !z.cols.length)) z.cols = tableCols(z).map(c => ({ ...c }));
  const start = z ? clean(z) : null;
  const j = mode === 'div' ? +e.target.dataset.div : -1;
  let moved = false, draw = null;
  if (mode === 'draw') {
    draw = document.createElement('div');
    draw.className = 'ly-zone drawing';
    inner.appendChild(draw);
  }

  const move = ev => {
    const p = P(ev), dx = p.x - p0.x, dy = p.y - p0.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
    if (mode === 'move') {
      z.x = r2(clamp(start.x + dx, 0, pg.width - z.w));
      z.y = r2(clamp(start.y + dy, 0, pg.height - z.h));
      posZone(i);
    } else if (mode === 'resize') {
      z.w = r2(clamp(start.w + dx, 4, pg.width - z.x));
      z.h = r2(clamp(start.h + dy, 4, pg.height - z.y));
      posZone(i);
    } else if (mode === 'div') {
      const total = start.cols.reduce((a, c) => a + c.w, 0);
      const px = w => w / total * z.w;
      const left = start.cols.slice(0, j).reduce((a, c) => a + px(c.w), 0);
      const right = left + px(start.cols[j].w) + px(start.cols[j + 1].w);
      const b = clamp(left + px(start.cols[j].w) + dx, left + 4, right - 4);
      z.cols[j].w = +((b - left) / z.w * total).toFixed(4);
      z.cols[j + 1].w = +((right - b) / z.w * total).toFixed(4);
      redrawZone(i);
    } else if (mode === 'draw') {
      const x = clamp(Math.min(p0.x, p.x), 0, pg.width), y = clamp(Math.min(p0.y, p.y), 0, pg.height);
      Object.assign(draw.style, { left: x + 'px', top: y + 'px', width: Math.abs(dx) + 'px', height: Math.abs(dy) + 'px' });
    }
  };
  const up = ev => {
    inner.removeEventListener('pointermove', move);
    inner.removeEventListener('pointerup', up);
    inner.removeEventListener('pointercancel', up);
    if (mode === 'draw') {
      const p = P(ev);
      draw.remove();
      const w = Math.abs(p.x - p0.x), h = Math.abs(p.y - p0.y);
      if (w >= 4 && h >= 4) {
        pg.fields.push({ k: 'text', f: '', x: r2(Math.min(p0.x, p.x)), y: r2(Math.min(p0.y, p.y)), w: r2(w), h: r2(h) });
        ui.sel = pg.fields.length - 1;
        changed(l);
        renderCanvas();
        renderProps();
        $('#zp-f')?.focus();
      } else selectZone(-1);
      return;
    }
    if (moved) { changed(l); renderProps(); }
  };
  inner.addEventListener('pointermove', move);
  inner.addEventListener('pointerup', up);
  inner.addEventListener('pointercancel', up);
}

function onKey(e) {
  if (!visible() || ui.sel < 0 || e.target.closest?.('input, select, textarea')) return;
  const l = cur(), pg = curPage(), z = pg?.fields[ui.sel];
  if (!z || !isEditable(l)) return;
  const step = e.shiftKey ? 10 : 1;
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (d) {
    e.preventDefault();
    if (e.altKey) { z.w = Math.max(4, z.w + d[0]); z.h = Math.max(4, z.h + d[1]); }
    else { z.x = clamp(z.x + d[0], 0, pg.width - z.w); z.y = clamp(z.y + d[1], 0, pg.height - z.h); }
    posZone(ui.sel);
    changed(l);
    renderProps();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteZone();
  } else if (e.key === 'Escape') {
    selectZone(-1);
  }
}
function deleteZone() {
  const l = cur(), pg = curPage();
  pg.fields.splice(ui.sel, 1);
  ui.sel = -1;
  changed(l);
  renderCanvas();
  renderProps();
}

/* ---------------- panel de propiedades ---------------- */
function usedFields(l) {
  return new Set(l.pages.flatMap(p => p.fields.map(z => z.f)).filter(Boolean));
}

function renderProps() {
  const box = $('.ly-props');
  if (!box) return;
  const l = cur(), pg = curPage(), ed = isEditable(l);
  const z = pg?.fields[ui.sel];
  const used = usedFields(l);
  if (!z) {
    const missing = CATALOG.flatMap(g => g.items).filter(it => !used.has(it.f));
    box.innerHTML = `
      <h4>Zonas de esta página (${pg.fields.length})</h4>
      ${ed ? `<p class="hint">Arrastra sobre un hueco de la imagen para dibujar una zona y elige qué campo va en ella. Clic en una zona para seleccionarla, arrástrala para moverla y usa su esquina para cambiar el tamaño.
        Flechas: mover 1 px (Mayús: 10 px) · Alt + flechas: tamaño · Supr: borrar. En las tablas, arrastra las líneas verticales para ajustar las columnas.</p>` : ''}
      <ul class="ly-zlist">${pg.fields.map((q, i) => `<li><button type="button" class="link" data-zi="${i}">${esc(catalogItem(q.f)?.label || 'Sin campo')}</button> <span class="muted">${esc(KIND_LABEL[q.k] || q.k)}</span></li>`).join('') || '<li class="muted">Ninguna todavía.</li>'}</ul>
      ${missing.length ? `<h4>Campos sin colocar en este layout</h4><p class="muted small">${missing.map(it => esc(it.label)).join(' · ')}</p><p class="hint">No es obligatorio colocarlos todos: lo que un layout no muestra se conserva en la ficha.</p>` : ''}`;
    for (const b of $$('[data-zi]', box)) b.addEventListener('click', () => selectZone(+b.dataset.zi));
    return;
  }

  const item = catalogItem(z.f);
  const dis = ed ? '' : ' disabled';
  const def = z.k === 'table' ? TABLES[z.f] : null;
  const cols = def ? tableCols(z) : [];
  box.innerHTML = `
    <h4>Zona seleccionada</h4>
    <label>Campo <select id="zp-f"${dis}><option value="">— elige un campo —</option>${CATALOG.map(g => `<optgroup label="${esc(g.group)}">${g.items.map(it =>
      `<option value="${esc(it.f)}"${it.f === z.f ? ' selected' : ''}>${esc(it.label)}${used.has(it.f) && it.f !== z.f ? ' ✓' : ''}</option>`).join('')}</optgroup>`).join('')}</select></label>
    ${item && item.kinds.length > 1 ? `<label>Tipo <select id="zp-k"${dis}>${item.kinds.map(k => `<option value="${k}"${k === z.k ? ' selected' : ''}>${esc(KIND_LABEL[k])}</option>`).join('')}</select></label>` : ''}
    ${['text', 'md', 'steps', 'table'].includes(z.k) ? `<label>Tamaño de letra <input type="number" id="zp-fs" min="6" max="80" step="1" placeholder="automático" value="${z.fs ?? ''}"${dis}></label>` : ''}
    ${z.k === 'text' ? `<label class="check"><input type="checkbox" id="zp-c"${String(z.cls || '').includes('center') ? ' checked' : ''}${dis}> Centrado</label>` : ''}
    ${def ? `<label>Filas <input type="number" id="zp-rows" min="1" max="60" value="${z.rows || def.rows}"${dis}></label>
      <div class="zp-cols"><span>Columnas</span>${def.cols.map(c => `<label class="check"><input type="checkbox" data-col="${c.c}"${cols.some(x => x.c === c.c) ? ' checked' : ''}${dis}> ${esc(c.label)}</label>`).join('')}</div>` : ''}
    <div class="zp-xywh">${[['x', 'X'], ['y', 'Y'], ['w', 'Ancho'], ['h', 'Alto']].map(([g, t]) => `<label>${t} <input type="number" step="0.5" data-g="${g}" value="${z[g]}"${dis}></label>`).join('')}</div>
    ${ed ? `<div class="zp-btns"><button type="button" class="btn" id="zp-dup">Duplicar</button><button type="button" class="btn danger" id="zp-del">Borrar zona</button></div>` : ''}
    <p><button type="button" class="link" id="zp-back">← Todas las zonas</button></p>
    ${used.has(z.f) && pg.fields.filter(q => q.f === z.f).length + l.pages.filter(p => p !== pg).flatMap(p => p.fields).filter(q => q.f === z.f).length > 1
      ? '<p class="hint">Este campo está en más de una zona: se verá en todas.</p>' : ''}`;

  $('#zp-back', box).addEventListener('click', () => selectZone(-1));
  if (!ed) return;
  const apply = (full = true) => { changed(l); if (full) { redrawZone(ui.sel); renderProps(); } else posZone(ui.sel); };
  $('#zp-f', box).addEventListener('change', e => {
    const it = catalogItem(e.target.value);
    z.f = e.target.value;
    if (it) {
      if (!it.kinds.includes(z.k)) z.k = it.kinds[0];
      if (z.k === 'table') { z.rows = TABLES[z.f].rows; z.cols = TABLES[z.f].cols.map(c => ({ c: c.c, w: c.w })); }
      else { delete z.rows; delete z.cols; }
      if (it.def.fs && z.fs == null && z.k === 'text') z.fs = Math.min(it.def.fs, Math.round(z.h * 0.8));
      if (it.def.cls && z.cls == null) z.cls = it.def.cls;
    }
    apply();
  });
  $('#zp-k', box)?.addEventListener('change', e => { z.k = e.target.value; apply(); });
  $('#zp-fs', box)?.addEventListener('input', e => { if (e.target.value === '') delete z.fs; else z.fs = +e.target.value; changed(l); });
  $('#zp-c', box)?.addEventListener('change', e => { if (e.target.checked) z.cls = 'center'; else delete z.cls; changed(l); });
  $('#zp-rows', box)?.addEventListener('input', e => { if (+e.target.value >= 1) { z.rows = Math.round(+e.target.value); changed(l); redrawZone(ui.sel); } });
  for (const cb of $$('[data-col]', box)) cb.addEventListener('change', () => {
    const now = tableCols(z).map(c => ({ ...c }));
    const has = now.some(c => c.c === cb.dataset.col);
    if (cb.checked && !has) {
      const d = def.cols.find(c => c.c === cb.dataset.col);
      now.push({ c: d.c, w: d.w });
      now.sort((a, b) => def.cols.findIndex(c => c.c === a.c) - def.cols.findIndex(c => c.c === b.c));
    } else if (!cb.checked && has && now.length > 1) now.splice(now.findIndex(c => c.c === cb.dataset.col), 1);
    else { cb.checked = has; return; }
    z.cols = now;
    apply();
  });
  for (const inp of $$('[data-g]', box)) inp.addEventListener('input', () => {
    const v = parseFloat(inp.value);
    if (!isFinite(v)) return;
    z[inp.dataset.g] = inp.dataset.g === 'w' || inp.dataset.g === 'h' ? Math.max(4, v) : Math.max(0, v);
    apply(false);
  });
  $('#zp-dup', box).addEventListener('click', () => {
    const c = clean(z);
    c.x = Math.min(pg.width - c.w, c.x + 12);
    c.y = Math.min(pg.height - c.h, c.y + 12);
    pg.fields.push(c);
    ui.sel = pg.fields.length - 1;
    changed(l);
    renderCanvas();
    renderProps();
  });
  $('#zp-del', box).addEventListener('click', deleteZone);
}
