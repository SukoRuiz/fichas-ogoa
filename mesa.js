/* Jugadores, partidas, sesiones y estadísticas.
 *
 *  players/{id}    { name, contact, notes, active }
 *  campaigns/{id}  { name, status, description, startDate, endDate, frequency (días; 0 = irregular),
 *                    plannedHours (duración prevista por sesión), targetHours (horas totales previstas),
 *                    defaultStart ("HH:MM"),
 *                    layoutId (layout de ficha que usa la partida; ver layouts/),
 *                    members: [{ playerId, characterId }] }
 *  sessions/{id}   { campaignId, date, status (jugada|planificada|cancelada), title,
 *                    plannedStart, plannedEnd, actualStart, actualEnd, breakMin, realHours,
 *                    attendance: { [playerId]: { present, characterId } }, notes }
 */
import { Cloud, Players, Campaigns, Sessions } from './store.js';
import * as S from './stats.js';
import { LAYOUTS, DEFAULT_LAYOUT, getLayout } from './layouts/index.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => (s || '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');
const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
const charSort = (a, b) => (a.data.name || '').localeCompare(b.data.name || '', 'es', { sensitivity: 'base' });

/** Datos en memoria (los personajes los pone app.js al refrescar su lista). */
export const cache = { players: [], campaigns: [], sessions: [], characters: [] };
// ctx: { status(msg, err), openCharacter(id, viewCtx), hasOpenCharacter(), fichasTab(), onEnterFichas(),
//        renderLayouts(), playersChanged(), fichas: { create, duplicate, remove, export, print, import, flush } }
let ctx = null;
const ui = {
  view: 'jugadores', playerId: null, campaignId: null, campaignTab: 'players', statsCampaign: '', statsYear: '',
  playerFilter: '', campaignFilter: '',
};

export const playerById = id => (id ? cache.players.find(p => p.id === id) : undefined);
export const playerByName = name => cache.players.find(p => norm(p.name) === norm(name));
const charById = id => cache.characters.find(c => c.id === id);
export const campaignById = id => cache.campaigns.find(c => c.id === id);
const charName = id => (id ? (charById(id)?.data.name || '(ficha borrada)') : '');
const playerName = id => playerById(id)?.name || '(jugador borrado)';
const charsOf = pid => cache.characters.filter(c => c.data?.playerId === pid).sort(charSort);
const campaignMap = () => new Map(cache.campaigns.map(c => [c.id, c]));
const sessionsOf = cid => cache.sessions.filter(s => s.campaignId === cid).sort(S.bySessionDate);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const freqLabel = d => S.FREQS.find(f => f.v === +d)?.label || 'Irregular';

export async function load() {
  const [p, c, s] = await Promise.all([Players.all(), Campaigns.all(), Sessions.all()]);
  cache.players = p.sort(byName);
  cache.campaigns = c.map(x => ({ ...x, members: Array.isArray(x.members) ? x.members : [] }));
  cache.sessions = s;
}

/* =====================================================================
 * Jugadores: alta y enlace con las fichas existentes
 * ===================================================================== */
export async function createPlayer(name) {
  const p = await Players.create({ name: name.trim(), contact: '', notes: '', active: true });
  cache.players.push(p);
  cache.players.sort(byName);
  return p;
}

/**
 * Convierte el texto "Jugador" de las fichas antiguas en jugadores y las enlaza.
 * No borra nada: la ficha conserva el nombre y gana el campo playerId.
 * Devuelve cuántas fichas se han enlazado.
 */
export async function migratePlayers() {
  const known = new Map(cache.players.map(p => [norm(p.name), p]));
  let n = 0;
  for (const c of cache.characters) {
    const d = c.data || (c.data = {});
    if (d.playerId && playerById(d.playerId)) continue;
    const name = (d.player || '').trim();
    if (!name) continue;
    let p = known.get(norm(name));
    if (!p) { p = await createPlayer(name); known.set(norm(name), p); }
    await Cloud.setPlayer(c.id, p.id, p.name);
    d.playerId = p.id;
    d.player = p.name;
    n++;
  }
  return n;
}

/* =====================================================================
 * Guardado diferido (como en las fichas: se guarda solo al escribir)
 * ===================================================================== */
const STORES = { players: Players, campaigns: Campaigns, sessions: Sessions };
const pending = new Map();
function queue(coll, rec, patch, ms = 800) {
  Object.assign(rec, patch);
  const k = coll + '/' + rec.id;
  const e = pending.get(k) || { coll, id: rec.id, patch: {} };
  Object.assign(e.patch, patch);
  clearTimeout(e.t);
  e.t = setTimeout(() => flushOne(k), ms);
  pending.set(k, e);
  ctx.status('Cambios sin guardar…');
}
async function flushOne(k) {
  const e = pending.get(k);
  if (!e) return;
  pending.delete(k);
  clearTimeout(e.t);
  try {
    await STORES[e.coll].update(e.id, e.patch);
    ctx.status('Guardado en la nube ' + new Date().toLocaleTimeString());
  } catch (err) {
    ctx.status('Error al guardar: ' + (err.code || err.message), true);
  }
}
export const flushAll = () => Promise.all([...pending.keys()].map(flushOne));
export const hasPending = () => pending.size > 0;

/** Rellena y conecta los campos [data-f] de un panel con un registro. */
function bind(root, coll, rec, onInput) {
  for (const el of $$('[data-f]', root)) {
    const f = el.dataset.f;
    if (el.type === 'checkbox') el.checked = !!rec[f];
    else el.value = rec[f] ?? '';
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date' || el.type === 'time' ? 'change' : 'input', () => {
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.num !== undefined) v = v === '' ? '' : +v;
      queue(coll, rec, { [f]: v });
      onInput?.(f, v);
    });
  }
}

/* =====================================================================
 * Vistas
 * ===================================================================== */
export const VIEWS = ['fichas', 'jugadores', 'partidas', 'estadisticas', 'layouts'];

export function showView(v) {
  if (!VIEWS.includes(v)) v = 'jugadores';
  if (v === 'fichas' && !ctx.hasOpenCharacter()) v = 'jugadores'; // el visor solo se abre desde un jugador o una partida
  ui.view = v;
  document.body.dataset.view = v;
  const tab = v === 'fichas' ? ctx.fichasTab() : v;
  for (const b of $$('#tabs [data-view]')) b.setAttribute('aria-selected', String(b.dataset.view === tab));
  for (const el of $$('.side-view')) el.hidden = !el.dataset.view.split(' ').includes(v);
  $('#sheets').hidden = v !== 'fichas';
  for (const p of $$('.panel')) p.hidden = p.id !== 'panel-' + v;
  try { localStorage.setItem('ogoa-view', v); } catch { /* nada */ }
  if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
  if (v === 'jugadores') { renderPlayerList(); renderPlayerPanel(); }
  if (v === 'partidas') { renderCampaignList(); renderCampaignPanel(); }
  if (v === 'estadisticas') renderStats();
  if (v === 'layouts') ctx.renderLayouts?.();
  $('#main').scrollTop = 0;
  if (v === 'fichas') ctx.onEnterFichas?.();
}

/** Ir a un jugador, a una partida o a las fichas sin jugador. */
export function showPlayer(id) { ui.playerId = id; showView('jugadores'); }
export function showCampaign(id) { ui.campaignId = id; showView('partidas'); }
export function showUnassigned() { ui.playerId = UNASSIGNED; showView('jugadores'); }

/** Vuelve a dibujar la vista actual (sin mover el scroll), p. ej. tras crear o borrar una ficha. */
export function refresh() {
  const main = $('#main'), top = main.scrollTop;
  if (ui.view === 'jugadores') { renderPlayerList(); renderPlayerPanel(); }
  else if (ui.view === 'partidas') { renderCampaignList(); renderCampaignPanel(); }
  else if (ui.view === 'estadisticas') renderStats();
  else if (ui.view === 'layouts') ctx.renderLayouts?.();
  main.scrollTop = top;
}

export function init(context) {
  ctx = context;
  for (const b of $$('#tabs [data-view]')) b.addEventListener('click', () => showView(b.dataset.view));
  window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
  $('#player-filter').addEventListener('input', e => { ui.playerFilter = e.target.value; renderPlayerList(); });
  $('#campaign-filter').addEventListener('input', e => { ui.campaignFilter = e.target.value; renderCampaignList(); });
  $('#btn-new-player').addEventListener('click', async () => {
    const p = await createPlayer('Nuevo jugador');
    ui.playerId = p.id;
    ui.playerFilter = $('#player-filter').value = '';
    renderPlayerList();
    renderPlayerPanel();
    $('#panel-jugadores [data-f="name"]')?.select();
    ctx.playersChanged();
  });
  $('#btn-new-campaign').addEventListener('click', async () => {
    const c = await Campaigns.create({
      name: 'Nueva partida', status: 'activa', description: '', startDate: S.today(), endDate: '',
      frequency: 7, plannedHours: 4, targetHours: '', defaultStart: '', layoutId: DEFAULT_LAYOUT, members: [],
    });
    cache.campaigns.push(c);
    ui.campaignId = c.id;
    ui.campaignFilter = $('#campaign-filter').value = '';
    renderCampaignList();
    renderCampaignPanel();
    $('#panel-partidas [data-f="name"]')?.select();
  });
  S.enableTooltips($('#main'));
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (ui.view === 'estadisticas') renderCharts(); }, 150);
  });
}

/* ---------------- listas laterales ---------------- */
function fillList(ul, items, activeId, onPick, empty = 'Todavía no hay ninguno. Pulsa +.') {
  ul.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    li.dataset.id = it.id;
    li.innerHTML = '<span class="n"></span><span class="d"></span>';
    $('.n', li).textContent = it.n;
    $('.d', li).textContent = it.d;
    if (it.d2) {
      const d2 = document.createElement('span');
      d2.className = 'd';
      d2.textContent = it.d2;
      li.appendChild(d2);
    }
    if (it.muted) li.classList.add('muted');
    if (it.cls) li.classList.add(it.cls);
    li.classList.toggle('active', it.id === activeId);
    li.addEventListener('click', () => onPick(it.id));
    ul.appendChild(li);
  }
  if (!items.length) ul.innerHTML = `<li class="empty">${esc(empty)}</li>`;
}
const matches = (q, ...texts) => !q || texts.some(t => norm(t).includes(q));

const UNASSIGNED = '__sin-jugador';
const unassignedChars = () => cache.characters.filter(c => !playerById(c.data?.playerId)).sort(charSort);

function renderPlayerList() {
  const q = norm(ui.playerFilter);
  const items = cache.players.filter(p => matches(q, p.name, ...charsOf(p.id).map(c => c.data.name))).map(p => {
    const n = charsOf(p.id).length;
    return {
      id: p.id, n: p.name || 'Sin nombre', muted: p.active === false,
      d: [`${n} ficha${n === 1 ? '' : 's'}`, p.active === false ? 'inactivo' : ''].filter(Boolean).join(' · '),
    };
  });
  const free = unassignedChars();
  if (free.length || ui.playerId === UNASSIGNED) {
    items.push({ id: UNASSIGNED, n: 'Fichas sin jugador', d: plural(free.length, 'ficha', 'fichas'), cls: 'special' });
  }
  fillList($('#player-list'), items, ui.playerId, id => { ui.playerId = id; renderPlayerList(); renderPlayerPanel(); },
    q ? 'Ningún jugador coincide.' : 'Todavía no hay ninguno. Pulsa +.');
}

/** Última fecha jugada de una partida (o null). */
const lastPlayed = c => sessionsOf(c.id).filter(s => s.status === 'jugada' && s.date).at(-1)?.date || null;

function renderCampaignList() {
  const order = { activa: 0, pausada: 1, terminada: 2 };
  const q = norm(ui.campaignFilter);
  // por estado y, dentro de cada estado, la jugada más recientemente primero
  const list = cache.campaigns.filter(c => matches(q, c.name, c.description))
    .map(c => ({ c, last: lastPlayed(c) }))
    .sort((a, b) => (order[a.c.status] ?? 3) - (order[b.c.status] ?? 3) || (b.last || '').localeCompare(a.last || '') || byName(a.c, b.c));
  fillList($('#campaign-list'), list.map(({ c, last }) => {
    const n = sessionsOf(c.id).filter(s => s.status === 'jugada').length;
    return {
      id: c.id, n: c.name || 'Sin nombre', muted: c.status === 'terminada',
      d: `${S.CAMPAIGN_STATUS[c.status] || ''} · ${n} sesi${n === 1 ? 'ón' : 'ones'} · ${c.members.length} jug.`,
      d2: last ? `Última: ${S.fmtDate(last)}` : 'Sin sesiones jugadas',
    };
  }), ui.campaignId, id => { ui.campaignId = id; renderCampaignList(); renderCampaignPanel(); },
  q ? 'Ninguna partida coincide.' : 'Todavía no hay ninguna. Pulsa +.');
}

/* ---------------- piezas comunes ---------------- */
const tile = (label, value, sub = '') =>
  `<div class="tile"><div class="t-label">${esc(label)}</div><div class="t-value">${esc(value)}</div>${sub ? `<div class="t-sub">${esc(sub)}</div>` : ''}</div>`;
const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
const emptyPanel = (title, text) => `<div class="panel-card"><h2>${esc(title)}</h2><p class="hint">${esc(text)}</p></div>`;

/* ---------------- iconos y acciones de fichas ---------------- */
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  view: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>'),
  print: svg('<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>'),
  json: svg('<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>'),
  dup: svg('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 4H5a1 1 0 0 0-1 1v11"/>'),
  unlink: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-6 6.5-6s5.9 2.4 6.5 6M16 11h6"/>'),
  del: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>'),
};
const actBtn = (a, id, title, extra = '') => `<button type="button" class="x ico${a === 'del' ? ' danger' : ''}" data-fa="${a}" data-id="${esc(id)}" title="${esc(title)}"${extra}>${ICON[a]}</button>`;
/** Botones de una fila de ficha. `which`: lista de acciones a mostrar. */
const charActions = (id, which = ['view', 'print', 'json', 'dup', 'del']) => `<span class="acts">${which.map(a => actBtn(a, id, {
  view: 'Abrir la ficha', print: 'Imprimir / PDF / imagen', json: 'Exportar (.json)', dup: 'Duplicar',
  unlink: 'Quitar del jugador (queda sin jugador)', del: 'Borrar la ficha',
}[a])).join('')}</span>`;

/** Conecta los botones [data-fa] de un panel. `opts.viewCtx(id)`: contexto del visor al abrir. */
function wireCharActions(root, { viewCtx = () => null, campaignId = '', onUnlink } = {}) {
  for (const b of $$('[data-fa]', root)) b.addEventListener('click', async e => {
    e.stopPropagation();
    const id = b.dataset.id, f = ctx.fichas;
    const name = charById(id)?.data.name || 'ficha';
    if (b.dataset.fa === 'view') ctx.openCharacter(id, viewCtx(id));
    if (b.dataset.fa === 'print') f.print([id], { title: name, file: name, campaignId });
    if (b.dataset.fa === 'json') f.export([id]);
    if (b.dataset.fa === 'dup') f.duplicate(id);
    if (b.dataset.fa === 'del') f.remove(id);
    if (b.dataset.fa === 'unlink') onUnlink?.(id);
  });
}

/** Asigna una ficha a un jugador (o la deja sin jugador). La saca de las partidas del jugador anterior. */
export async function assignCharacter(id, pid) {
  const c = charById(id);
  if (!c) return;
  const old = c.data.playerId || '';
  if (old === (pid || '')) return;
  const p = playerById(pid);
  const inGames = old ? cache.campaigns.filter(g => g.members.some(m => m.playerId === old && m.characterId === id)) : [];
  if (inGames.length && !confirm(`"${c.data.name || 'Sin nombre'}" es el personaje de ${playerName(old)} en ${inGames.map(g => `"${g.name}"`).join(', ')}.\n\nSi la pasas ${p ? `a ${p.name}` : 'a "sin jugador"'}, se quitará de ${inGames.length === 1 ? 'esa partida' : 'esas partidas'} (las sesiones ya jugadas no cambian). ¿Continuar?`)) return false;
  await ctx.fichas.flush();
  await Cloud.setPlayer(id, p?.id || '', p?.name || '');
  c.data.playerId = p?.id || '';
  c.data.player = p?.name || '';
  for (const g of inGames) {
    for (const m of g.members) if (m.playerId === old && m.characterId === id) m.characterId = '';
    queue('campaigns', g, { members: g.members }, 200);
  }
  const filled = p ? fillEmptySlots(p.id) : 0;
  ctx.status((p ? `"${c.data.name || 'Sin nombre'}" asignada a ${p.name}` : `"${c.data.name || 'Sin nombre'}" queda sin jugador`)
    + (filled ? ` · puesta como su personaje en ${plural(filled, 'partida', 'partidas')}` : ''));
  refresh();
  return true;
}

/**
 * Si un jugador tiene una sola ficha, la pone como su personaje en las partidas
 * donde aún no tiene ninguno (como al añadirlo a una partida). Devuelve en cuántas.
 */
export function fillEmptySlots(pid) {
  const chars = charsOf(pid);
  if (chars.length !== 1) return 0;
  let n = 0;
  for (const g of cache.campaigns) {
    const m = g.members.find(x => x.playerId === pid && !x.characterId);
    if (!m) continue;
    m.characterId = chars[0].id;
    queue('campaigns', g, { members: g.members }, 200);
    n++;
  }
  return n;
}

/**
 * Pone las fichas `ids` como personaje de su jugador en la partida, si ese jugador
 * está en ella y aún no tiene personaje. Devuelve cuántas quedaron sin poner.
 */
export function linkCharacters(cid, ids) {
  const c = campaignById(cid);
  let linked = 0;
  for (const id of ids) {
    const ch = charById(id);
    if (!c || !ch) continue;
    if (c.members.some(m => m.characterId === id)) { linked++; continue; }
    const m = c.members.find(x => x.playerId === ch.data.playerId && !x.characterId);
    if (m) { m.characterId = id; linked++; }
  }
  if (c && linked) queue('campaigns', c, { members: c.members }, 200);
  return { linked, unlinked: ids.length - linked };
}

/* =====================================================================
 * Panel de jugador
 * ===================================================================== */
function renderPlayerPanel() {
  const root = $('#panel-jugadores');
  if (ui.playerId === UNASSIGNED) return renderUnassignedPanel(root);
  let p = playerById(ui.playerId);
  if (!p && cache.players.length) { p = cache.players[0]; ui.playerId = p.id; renderPlayerList(); }
  if (!p) {
    root.innerHTML = emptyPanel('Jugadores', 'Crea el primer jugador con el botón + de la barra lateral. Los jugadores que ya figuraban en las fichas se han creado solos.');
    if (unassignedChars().length) root.querySelector('.panel-card').insertAdjacentHTML('beforeend', '<p><button type="button" class="link" id="pl-free">Ver las fichas sin jugador →</button></p>');
    $('#pl-free', root)?.addEventListener('click', () => showUnassigned());
    return;
  }

  const cmap = campaignMap();
  const mine = cache.sessions.filter(s => s.attendance && p.id in s.attendance);
  const st = S.byPlayer(mine, cmap).find(e => e.playerId === p.id);
  const camps = cache.campaigns.filter(c => c.members.some(m => m.playerId === p.id) || mine.some(s => s.campaignId === c.id)).sort(byName);
  const chars = charsOf(p.id);
  const gamesOf = id => cache.campaigns.filter(c => c.members.some(m => m.characterId === id)).map(c => c.name || 'Sin nombre');
  const free = unassignedChars();
  const others = cache.characters.filter(c => playerById(c.data?.playerId) && c.data.playerId !== p.id).sort(charSort);

  root.innerHTML = `
  <div class="panel-card">
    <div class="panel-head">
      <input class="title-input" data-f="name" placeholder="Nombre del jugador" autocomplete="off">
      <label class="check"><input type="checkbox" data-f="active"> Activo</label>
    </div>
    <div class="form-grid">
      <label>Contacto <input data-f="contact" placeholder="Correo, teléfono…" autocomplete="off"></label>
      <label class="wide">Notas <textarea data-f="notes" rows="3" placeholder="Preferencias, disponibilidad…"></textarea></label>
    </div>
    <div class="tiles">
      ${tile('Sesiones jugadas', st ? st.pres : 0, st ? `de ${st.conv} convocadas` : 'ninguna todavía')}
      ${tile('Asistencia', S.fmtPct(st?.pct))}
      ${tile('Horas jugadas', S.fmtH(st ? st.real : null), 'horas reales')}
      ${tile('Última sesión', S.fmtDate(st?.last))}
    </div>

    <div class="h3-row"><h3>Fichas de personaje <span class="count">${chars.length}</span></h3></div>
    <div class="ficha-bar">
      <button type="button" class="btn primary" id="pl-newchar">+ Nueva ficha</button>
      <select id="pl-assign" title="Asignar a este jugador una ficha que ya existe">
        ${opt('', 'Asignar una ficha existente…')}
        ${free.length ? `<optgroup label="Sin jugador">${free.map(c => opt(c.id, c.data.name || 'Sin nombre')).join('')}</optgroup>` : ''}
        ${others.length ? `<optgroup label="De otros jugadores (se le quitará)">${others.map(c => opt(c.id, `${c.data.name || 'Sin nombre'} · ${playerName(c.data.playerId)}`)).join('')}</optgroup>` : ''}
      </select>
      <span class="grow"></span>
      <button type="button" class="btn" id="pl-import" title="Importa fichas (.json) para este jugador. Si ya existe, pregunta si se sobrescribe.">Importar</button>
      <button type="button" class="btn" id="pl-export"${chars.length ? '' : ' disabled'} title="Descarga todas sus fichas (.json)">Exportar</button>
      <button type="button" class="btn" id="pl-print"${chars.length ? '' : ' disabled'} title="Imprimir o exportar a PDF o imagen todas sus fichas">Imprimir / PDF</button>
    </div>
    ${chars.length ? `<div class="table-wrap"><table class="data fichas">
      <thead><tr><th>Personaje</th><th>Descriptor · tipo · foco</th><th>Partidas</th><th></th></tr></thead>
      <tbody>${chars.map(c => `<tr class="click" data-row="${esc(c.id)}">
        <td><b>${esc(c.data.name || 'Sin nombre')}</b></td>
        <td class="small">${esc([c.data.descriptor, c.data.type, c.data.focus].filter(Boolean).join(' · ') || '—')}</td>
        <td class="small">${esc(gamesOf(c.id).join(', ') || '—')}</td>
        <td class="num">${charActions(c.id, ['view', 'print', 'json', 'dup', 'unlink', 'del'])}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Ninguna todavía. Crea una nueva, asígnale una que ya exista o impórtala.</p>'}

    <h3>Partidas</h3>
    ${camps.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>Partida</th><th>Personaje</th><th class="num">Asistencia</th><th class="num">Horas</th></tr></thead>
      <tbody>${camps.map(c => {
        const ss = mine.filter(s => s.campaignId === c.id);
        const e = S.byPlayer(ss, cmap).find(x => x.playerId === p.id);
        const m = c.members.find(x => x.playerId === p.id);
        return `<tr class="click" data-camp="${esc(c.id)}"><td>${esc(c.name)}</td><td>${esc(charName(m?.characterId) || '—')}</td>
          <td class="num">${e ? `${e.pres}/${e.conv} · ${S.fmtPct(e.pct)}` : '—'}</td><td class="num">${S.fmtH(e ? e.real : null)}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<p class="muted">No participa en ninguna partida.</p>'}
    <div class="panel-foot"><button type="button" class="btn danger" id="pl-del">Borrar jugador</button></div>
  </div>`;

  bind(root, 'players', p, f => {
    if (f === 'name' || f === 'active') renderPlayerList();
  });
  // al terminar de escribir el nombre, se copia a sus fichas
  $('[data-f="name"]', root).addEventListener('change', () => renamePlayerInCharacters(p));
  const viewCtx = () => ({ type: 'player', id: p.id });
  for (const r of $$('[data-row]', root)) r.addEventListener('click', () => ctx.openCharacter(r.dataset.row, viewCtx()));
  wireCharActions(root, { viewCtx, onUnlink: id => assignCharacter(id, '') });
  for (const r of $$('[data-camp]', root)) r.addEventListener('click', () => showCampaign(r.dataset.camp));
  $('#pl-newchar', root).addEventListener('click', () => ctx.fichas.create(p.id));
  $('#pl-assign', root).addEventListener('change', async e => {
    const id = e.target.value;
    if (id && !(await assignCharacter(id, p.id))) e.target.value = '';
  });
  $('#pl-import', root).addEventListener('click', () => ctx.fichas.import({ type: 'player', id: p.id }));
  $('#pl-export', root).addEventListener('click', () => ctx.fichas.export(chars.map(c => c.id), `fichas-${p.name}`));
  $('#pl-print', root).addEventListener('click', () => ctx.fichas.print(chars.map(c => c.id), { title: `Fichas de ${p.name}`, file: `fichas-${p.name}` }));
  $('#pl-del', root).addEventListener('click', () => deletePlayer(p));
}

/** Panel de las fichas que no tienen jugador: se abren, se asignan o se exportan. */
function renderUnassignedPanel(root) {
  const chars = unassignedChars();
  const active = cache.players.filter(p => p.active !== false);
  root.innerHTML = `
  <div class="panel-card">
    <div class="panel-head"><h2>Fichas sin jugador</h2></div>
    <p class="hint">Fichas que no son de ningún jugador: importadas sin jugador, de un jugador borrado o que se quitaron a su jugador. Asígnalas a un jugador para que aparezcan en su página y en sus partidas.</p>
    <div class="ficha-bar">
      <button type="button" class="btn" id="ua-new" title="Crea una ficha en blanco sin jugador">+ Nueva ficha sin jugador</button>
      <span class="grow"></span>
      <button type="button" class="btn" id="ua-import">Importar</button>
      <button type="button" class="btn" id="ua-export"${chars.length ? '' : ' disabled'}>Exportar</button>
      <button type="button" class="btn" id="ua-print"${chars.length ? '' : ' disabled'}>Imprimir / PDF</button>
    </div>
    ${chars.length ? `<div class="table-wrap"><table class="data fichas">
      <thead><tr><th>Personaje</th><th>Descriptor · tipo · foco</th><th>Asignar a</th><th></th></tr></thead>
      <tbody>${chars.map(c => `<tr class="click" data-row="${esc(c.id)}">
        <td><b>${esc(c.data.name || 'Sin nombre')}</b>${c.data.player ? ` <span class="muted small">(antes: ${esc(c.data.player)})</span>` : ''}</td>
        <td class="small">${esc([c.data.descriptor, c.data.type, c.data.focus].filter(Boolean).join(' · ') || '—')}</td>
        <td><select data-assign="${esc(c.id)}">${opt('', 'Elige jugador…')}${active.map(p => opt(p.id, p.name)).join('')}</select></td>
        <td class="num">${charActions(c.id)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">No hay ninguna ficha sin jugador.</p>'}
  </div>`;
  const viewCtx = () => ({ type: 'unassigned' });
  for (const r of $$('[data-row]', root)) r.addEventListener('click', e => { if (!e.target.closest('select')) ctx.openCharacter(r.dataset.row, viewCtx()); });
  wireCharActions(root, { viewCtx });
  for (const s of $$('[data-assign]', root)) {
    s.addEventListener('click', e => e.stopPropagation());
    s.addEventListener('change', () => { if (s.value) assignCharacter(s.dataset.assign, s.value); });
  }
  $('#ua-new', root).addEventListener('click', () => ctx.fichas.create('', { openIt: true }));
  $('#ua-import', root).addEventListener('click', () => ctx.fichas.import({ type: 'unassigned' }));
  $('#ua-export', root).addEventListener('click', () => ctx.fichas.export(chars.map(c => c.id), 'fichas-sin-jugador'));
  $('#ua-print', root).addEventListener('click', () => ctx.fichas.print(chars.map(c => c.id), { title: 'Fichas sin jugador', file: 'fichas-sin-jugador' }));
}

async function renamePlayerInCharacters(p) {
  await flushAll();
  for (const c of charsOf(p.id)) {
    if (c.data.player === p.name) continue;
    c.data.player = p.name;
    await Cloud.setPlayer(c.id, p.id, p.name);
  }
  ctx.playersChanged();
}

async function deletePlayer(p) {
  const used = cache.sessions.some(s => s.attendance && p.id in s.attendance) || cache.campaigns.some(c => c.members.some(m => m.playerId === p.id));
  if (used) {
    alert(`${p.name} aparece en partidas o sesiones y sus datos cuentan en las estadísticas.\n\nEn lugar de borrarlo, desmarca "Activo". Si de verdad quieres borrarlo, quítalo antes de las partidas y sesiones.`);
    return;
  }
  const chars = charsOf(p.id);
  if (!confirm(`¿Borrar el jugador "${p.name}"?${chars.length ? `\n\nSus ${chars.length} fichas se conservan, pero quedarán sin jugador (en Jugadores → Fichas sin jugador).` : ''}`)) return;
  await flushAll();
  for (const c of chars) {
    await Cloud.setPlayer(c.id, '', '');
    c.data.playerId = '';
    c.data.player = '';
  }
  await Players.remove(p.id);
  cache.players = cache.players.filter(x => x.id !== p.id);
  ui.playerId = null;
  await ctx.playersChanged();
  renderPlayerList();
  renderPlayerPanel();
  ctx.status('Jugador borrado');
}

/* =====================================================================
 * Panel de partida
 * ===================================================================== */
/** Bloque "Avance hacia el objetivo de horas" (panel de partida y estadísticas). */
function progressBlock(c, pr, { chart = false } = {}) {
  if (pr.target == null) {
    return `<p class="hint">Pon las <b>horas totales previstas</b> de la partida para ver cuánto lleva jugado frente a lo previsto y cuándo terminaría al ritmo actual.</p>`;
  }
  const mark = pr.expectedNow != null ? pr.expectedNow / pr.target : null;
  const weeks = d => `${S.fmtNum(Math.abs(d) / 7)} semana${Math.abs(d) >= 7 && Math.abs(d) < 14 ? '' : 's'}`;
  const delay = pr.delayDays == null ? '' : Math.abs(pr.delayDays) < 4 ? 'según lo previsto' : pr.delayDays > 0 ? `${weeks(pr.delayDays)} más tarde de lo previsto` : `${weeks(pr.delayDays)} antes de lo previsto`;
  return `
    <div class="progress">
      <div class="progress-head">
        <span><b>${S.fmtH(pr.real)}</b> de ${S.fmtH(pr.target)} reales</span>
        <span class="muted">${pr.done ? 'Objetivo cumplido' : `${S.fmtPct(pr.pct)} · faltan ${S.fmtH(pr.remaining)}`}</span>
      </div>
      ${S.progressBar(pr.pct, mark, `${S.fmtPct(pr.pct)} del objetivo`)}
      ${mark != null ? `<p class="legend muted"><span class="key-mark"></span> lo previsto a día de hoy: ${S.fmtH(pr.expectedNow)} (${pr.vsPlan >= 0 ? 'vais ' + S.fmtH(pr.vsPlan) + ' por delante' : 'vais ' + S.fmtH(-pr.vsPlan) + ' por detrás'})</p>` : ''}
    </div>
    <div class="tiles">
      ${tile('Plan', pr.plannedSessions ? plural(pr.plannedSessions, 'sesión', 'sesiones') : '—', pr.plannedSessions ? `de ${S.fmtNum(+c.plannedHours)} h${pr.plannedEnd ? ` · fin previsto ${S.fmtDate(pr.plannedEnd)}` : ''}` : 'falta la duración por sesión')}
      ${tile('Ritmo real (por sesión)', pr.sum.avgReal != null ? S.fmtDur(pr.sum.avgReal) : '—', [pr.sum.avgInterval != null && `cada ${S.fmtNum(pr.sum.avgInterval)} días`, pr.perMonth != null && `${S.fmtH(pr.perMonth)} al mes`].filter(Boolean).join(' · ') || 'sin sesiones con horario real')}
      ${tile(pr.done ? 'Objetivo cumplido el' : 'Faltan, al ritmo actual', pr.done ? S.fmtDate(pr.estEnd) : pr.sessionsLeft != null ? plural(pr.sessionsLeft, 'sesión', 'sesiones') : '—', pr.done ? '' : [pr.estEnd && `fin estimado ${S.fmtDate(pr.estEnd)}`, delay].filter(Boolean).join(' · '))}
    </div>
    ${chart ? `<section class="viz-card">
      <h3>Horas acumuladas</h3>
      <p class="legend"><span class="key-line real"></span> Reales <span class="key-line plan"></span> Plan previsto <span class="key-line est"></span> Estimación al ritmo actual <span class="key-line target"></span> Objetivo</p>
      <div class="chart" id="ch-progress"></div>
    </section>` : ''}`;
}

function renderCampaignPanel() {
  const root = $('#panel-partidas');
  let c = campaignById(ui.campaignId);
  if (!c && cache.campaigns.length) { c = [...cache.campaigns].sort(byName)[0]; ui.campaignId = c.id; renderCampaignList(); }
  if (!c) { root.innerHTML = emptyPanel('Partidas', 'Crea la primera partida con el botón + de la barra lateral. Después añade sus jugadores y ve registrando cada sesión.'); return; }

  if (!getLayout(c.layoutId)) c.layoutId = DEFAULT_LAYOUT; // partidas anteriores a los layouts
  const sess = sessionsOf(c.id);
  const nums = S.numberSessions(sess);
  const sum = S.summarize(sess, campaignMap());
  const pr = S.progress(c, sess);
  const last = lastPlayed(c);

  root.innerHTML = `
  <div class="panel-card">
    <div class="panel-head">
      <input class="title-input" data-f="name" placeholder="Nombre de la partida" autocomplete="off">
      <select data-f="status">${Object.entries(S.CAMPAIGN_STATUS).map(([v, l]) => opt(v, l)).join('')}</select>
    </div>
    <div class="form-grid">
      <label class="wide">Descripción <textarea data-f="description" rows="2" placeholder="Módulo, ambientación, gancho…"></textarea></label>
      <label>Fecha de inicio <input type="date" data-f="startDate"></label>
      <label>Fecha de fin <input type="date" data-f="endDate"></label>
      <label>Periodicidad prevista <select data-f="frequency" data-num>${S.FREQS.map(f => opt(f.v, f.label)).join('')}</select></label>
      <label>Duración prevista por sesión (h) <input type="number" min="0" step="0.5" data-f="plannedHours" data-num></label>
      <label title="En cuántas horas de juego en total debería jugarse la partida">Horas totales previstas (h) <input type="number" min="0" step="1" data-f="targetHours" data-num placeholder="p. ej. 40"></label>
      <label>Hora habitual de inicio <input type="time" data-f="defaultStart"></label>
      <label>Layout de las fichas <select data-f="layoutId">${LAYOUTS.map(l => opt(l.id, l.name)).join('')}</select></label>
    </div>

    <div class="tiles">
      ${tile('Sesiones jugadas', sum.played, [sum.cancelled && plural(sum.cancelled, 'cancelada', 'canceladas'), sum.upcoming.length && plural(sum.upcoming.length, 'planificada', 'planificadas')].filter(Boolean).join(' · '))}
      ${tile('Última sesión', S.fmtDate(last), last ? `hace ${plural(S.dayDiff(last, S.today()), 'día', 'días')}` : '')}
      ${tile('Horas reales', S.fmtH(sum.withReal ? sum.real : null), sum.avgReal != null ? `media ${S.fmtDur(sum.avgReal)}` : '')}
      ${tile('Horas teóricas', S.fmtH(sum.withPlanned ? sum.planned : null), sum.avgPlanned != null ? `media ${S.fmtDur(sum.avgPlanned)}` : '')}
      ${tile('Real − teórico', S.fmtSigned(sum.deviation), sum.cmpCount ? `en ${plural(sum.cmpCount, 'sesión', 'sesiones')} con ambos datos` : 'faltan horarios')}
      ${tile('Asistencia', S.fmtPct(sum.attendance), sum.convocations ? `${sum.presences} de ${sum.convocations}` : '')}
      ${tile('Periodicidad', sum.avgInterval != null ? `${S.fmtNum(sum.avgInterval)} días` : '—', `prevista: ${freqLabel(c.frequency).toLowerCase()}`)}
    </div>
    <h3>Avance hacia el objetivo de horas</h3>
    <div id="cp-progress">${progressBlock(c, pr)}</div>
    <p><button type="button" class="link" id="cp-stats">Ver estadísticas completas de esta partida →</button></p>

    <div class="sub-tabs" role="tablist">
      <button type="button" role="tab" data-ct="players" aria-selected="${ui.campaignTab === 'players'}">Jugadores y fichas <span class="count">${c.members.length}</span></button>
      <button type="button" role="tab" data-ct="sessions" aria-selected="${ui.campaignTab === 'sessions'}">Sesiones <span class="count">${sess.length}</span></button>
    </div>
    <div class="sub-panel" data-cp="players"${ui.campaignTab === 'players' ? '' : ' hidden'}>
      <div id="cp-members"></div>
    </div>
    <div class="sub-panel" data-cp="sessions"${ui.campaignTab === 'sessions' ? '' : ' hidden'}>
    <div class="sub-bar"><button type="button" class="btn primary" id="cp-newsess">+ Nueva sesión</button></div>
    ${sess.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>Nº</th><th>Fecha</th><th>Título</th><th>Estado</th><th class="num">Teóricas</th><th class="num">Reales</th><th class="num">Diferencia</th><th class="num">Asistencia</th></tr></thead>
      <tbody>${sess.map(s => {
        const p = S.plannedMin(s, c), r = S.realMin(s), att = S.attendanceList(s);
        return `<tr class="click st-${esc(s.status)}" data-sess="${esc(s.id)}">
          <td>${nums.get(s.id) ?? '—'}</td><td>${esc(S.fmtDate(s.date))}</td><td>${esc(s.title || '')}</td>
          <td><span class="badge b-${esc(s.status)}">${esc(S.SESSION_STATUS[s.status] || s.status)}</span></td>
          <td class="num">${S.fmtDur(p)}</td><td class="num">${s.status === 'jugada' ? S.fmtDur(r) : '—'}</td>
          <td class="num">${s.status === 'jugada' && p != null && r != null ? S.fmtSigned(r - p) : '—'}</td>
          <td class="num">${att.length ? `${att.filter(a => a.present).length}/${att.length}` : '—'}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<p class="muted">Aún no hay sesiones. Pulsa “Nueva sesión” para registrar la primera.</p>'}
    </div>

    <div class="panel-foot"><button type="button" class="btn danger" id="cp-del">Borrar partida</button></div>
  </div>`;

  bind(root, 'campaigns', c, f => {
    if (f === 'name' || f === 'status') renderCampaignList();
    if (['targetHours', 'plannedHours', 'frequency', 'startDate'].includes(f)) $('#cp-progress', root).innerHTML = progressBlock(c, S.progress(c, sessionsOf(c.id)));
  });
  renderMembers(c);
  for (const b of $$('[data-ct]', root)) b.addEventListener('click', () => {
    ui.campaignTab = b.dataset.ct;
    for (const x of $$('[data-ct]', root)) x.setAttribute('aria-selected', String(x === b));
    for (const pnl of $$('[data-cp]', root)) pnl.hidden = pnl.dataset.cp !== ui.campaignTab;
  });
  for (const r of $$('[data-sess]', root)) r.addEventListener('click', () => openSession(cache.sessions.find(s => s.id === r.dataset.sess)));
  $('#cp-newsess', root).addEventListener('click', () => openSession(null, c));
  $('#cp-stats', root).addEventListener('click', () => { ui.statsCampaign = c.id; ui.statsYear = ''; showView('estadisticas'); });
  $('#cp-del', root).addEventListener('click', () => deleteCampaign(c));
}

function characterOptions(playerId, selected, withNew = false) {
  const list = playerId ? charsOf(playerId) : [];
  let h = opt('', '— sin ficha —', !selected);
  for (const ch of list) h += opt(ch.id, ch.data.name || 'Sin nombre', ch.id === selected);
  if (selected && !list.some(ch => ch.id === selected)) h += opt(selected, charName(selected), true);
  if (withNew && playerById(playerId)) h += opt('__new', '+ Nueva ficha…');
  return h;
}

function renderMembers(c) {
  const host = $('#cp-members');
  const used = new Set(c.members.map(m => m.playerId));
  const free = cache.players.filter(p => !used.has(p.id) && p.active !== false);
  const ids = [...new Set(c.members.map(m => m.characterId).filter(id => id && charById(id)))];
  const viewCtx = () => ({ type: 'campaign', id: c.id });
  host.innerHTML = `
    <div class="ficha-bar">
      <button type="button" class="btn" id="cp-open"${ids.length ? '' : ' disabled'} title="Abre las fichas de la partida (en la barra lateral solo se ven las de esta partida)">Ver fichas</button>
      <span class="grow"></span>
      <button type="button" class="btn" id="cp-import" title="Importa fichas (.json). Las de jugadores de la partida sin personaje se les asignan.">Importar</button>
      <button type="button" class="btn" id="cp-export"${ids.length ? '' : ' disabled'} title="Descarga las fichas de la partida (.json)">Exportar</button>
      <button type="button" class="btn" id="cp-print"${ids.length ? '' : ' disabled'} title="Imprimir o exportar a PDF o imagen las fichas de la partida">Imprimir / PDF</button>
    </div>
    ${c.members.length ? `<div class="table-wrap"><table class="data members">
      <thead><tr><th>Jugador</th><th>Personaje</th><th></th><th></th></tr></thead>
      <tbody>${c.members.map((m, i) => {
        const has = m.characterId && charById(m.characterId);
        return `<tr>
        <td><button type="button" class="link" data-player="${esc(m.playerId)}" title="Ir al jugador">${esc(playerName(m.playerId))}</button></td>
        <td><select data-char="${i}">${characterOptions(m.playerId, m.characterId, true)}</select></td>
        <td class="num">${has ? charActions(m.characterId, ['view', 'print', 'json']) : ''}</td>
        <td class="num"><button type="button" class="x" data-rm="${i}" title="Quitar de la partida">✕</button></td></tr>`;
      }).join('')}
      </tbody></table></div>` : '<p class="muted">Sin jugadores todavía.</p>'}
    <p class="add-row">
      <select id="cp-addplayer">${opt('', free.length ? 'Añadir jugador…' : 'No hay más jugadores activos')}${free.map(p => opt(p.id, p.name)).join('')}</select>
    </p>`;
  const count = $('[data-ct="players"] .count');
  if (count) count.textContent = c.members.length;
  const save = () => { queue('campaigns', c, { members: c.members }, 200); renderCampaignList(); };
  for (const s of $$('[data-char]', host)) s.addEventListener('change', async () => {
    const m = c.members[+s.dataset.char];
    if (s.value === '__new') {
      s.disabled = true;
      await flushAll();
      const rec = await ctx.fichas.create(m.playerId, { openIt: false });
      m.characterId = rec.id;
      save();
      renderMembers(c);
      return;
    }
    m.characterId = s.value;
    save();
    renderMembers(c);
  });
  for (const b of $$('[data-player]', host)) b.addEventListener('click', () => showPlayer(b.dataset.player));
  wireCharActions(host, { viewCtx, campaignId: c.id });
  for (const b of $$('[data-rm]', host)) b.addEventListener('click', () => { c.members.splice(+b.dataset.rm, 1); save(); renderMembers(c); });
  $('#cp-addplayer', host).addEventListener('change', e => {
    const pid = e.target.value;
    if (!pid) return;
    const chars = charsOf(pid);
    c.members.push({ playerId: pid, characterId: chars.length === 1 ? chars[0].id : '' });
    c.members.sort((a, b) => playerName(a.playerId).localeCompare(playerName(b.playerId), 'es'));
    save();
    renderMembers(c);
  });
  $('#cp-open', host).addEventListener('click', () => { if (ids.length) ctx.openCharacter(ids[0], viewCtx()); });
  $('#cp-import', host).addEventListener('click', () => ctx.fichas.import({ type: 'campaign', id: c.id }));
  $('#cp-export', host).addEventListener('click', () => ctx.fichas.export(ids, `fichas-${c.name}`));
  $('#cp-print', host).addEventListener('click', () => ctx.fichas.print(ids, { title: c.name || 'Partida', file: `fichas-${c.name}`, campaignId: c.id }));
}

async function deleteCampaign(c) {
  const sess = sessionsOf(c.id);
  if (!confirm(`¿Borrar la partida "${c.name}"${sess.length ? ` y sus ${sess.length} sesiones` : ''}? No se puede deshacer.\n\nLas fichas y los jugadores no se borran.`)) return;
  await flushAll();
  await Sessions.removeMany(sess.map(s => s.id));
  await Campaigns.remove(c.id);
  cache.sessions = cache.sessions.filter(s => s.campaignId !== c.id);
  cache.campaigns = cache.campaigns.filter(x => x.id !== c.id);
  ui.campaignId = null;
  renderCampaignList();
  renderCampaignPanel();
  ctx.status('Partida borrada');
}

/* =====================================================================
 * Ventana de sesión
 * ===================================================================== */
function addMinutes(hhmm, min) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m || !(min > 0)) return '';
  const t = (+m[1] * 60 + +m[2] + min) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function openSession(sess, campaign = campaignById(sess?.campaignId)) {
  const c = campaign;
  const isNew = !sess;
  const d = isNew ? {
    campaignId: c.id, date: S.today(), status: 'jugada', title: '',
    plannedStart: c.defaultStart || '',
    plannedEnd: addMinutes(c.defaultStart, Math.round((+c.plannedHours || 0) * 60)),
    actualStart: '', actualEnd: '', breakMin: '', realHours: '',
    attendance: Object.fromEntries(c.members.map(m => [m.playerId, { present: true, characterId: m.characterId || '' }])),
    notes: '',
  } : structuredClone(sess);
  d.attendance ||= {};
  const num = isNew ? null : S.numberSessions(sessionsOf(c.id)).get(sess.id);

  const modal = $('#session-modal');
  modal.innerHTML = `
  <div class="modal-card session-card" role="dialog" aria-modal="true" aria-labelledby="ss-title">
    <div class="modal-head">
      <h2 id="ss-title">${isNew ? 'Nueva sesión' : `Sesión ${num ?? ''}`.trim()} <span class="muted">· ${esc(c.name)}</span></h2>
      <button type="button" class="close" data-close title="Cerrar (Esc)">✕</button>
    </div>
    <div class="form-grid dark">
      <label>Fecha <input type="date" name="date" required></label>
      <label>Estado <select name="status">${Object.entries(S.SESSION_STATUS).map(([v, l]) => opt(v, l)).join('')}</select></label>
      <label class="wide">Título <input name="title" placeholder="Opcional: lo más memorable de la sesión" autocomplete="off"></label>
    </div>
    <fieldset><legend>Horario previsto <span class="calc" id="ss-planned"></span></legend>
      <div class="form-grid dark three">
        <label>Inicio <input type="time" name="plannedStart"></label>
        <label>Fin <input type="time" name="plannedEnd"></label>
        <p class="hint">Si se deja vacío, cuenta la duración prevista de la partida (${esc(S.fmtNum(+c.plannedHours || 0))} h).</p>
      </div>
    </fieldset>
    <fieldset class="real"><legend>Horario real <span class="calc" id="ss-real"></span></legend>
      <div class="form-grid dark four">
        <label>Inicio <input type="time" name="actualStart"></label>
        <label>Fin <input type="time" name="actualEnd"></label>
        <label>Pausas (min) <input type="number" min="0" step="5" name="breakMin"></label>
        <label>o duración (h) <input type="number" min="0" step="0.25" name="realHours" title="Solo si no apuntaste las horas de inicio y fin"></label>
      </div>
    </fieldset>
    <fieldset><legend>Asistencia <span class="calc" id="ss-att"></span></legend>
      <div id="ss-attendance"></div>
    </fieldset>
    <label class="block">Resumen y notas <textarea name="notes" rows="4" placeholder="Qué pasó, ganchos pendientes, PX entregados…"></textarea></label>
    <div class="modal-foot">
      ${isNew ? '' : '<button type="button" class="btn danger" id="ss-del">Borrar sesión</button>'}
      <span class="grow"></span>
      <button type="button" class="btn" data-close>Cancelar</button>
      <button type="button" class="btn primary" id="ss-save">Guardar</button>
    </div>
  </div>`;

  for (const el of $$('[name]', modal)) {
    el.value = d[el.name] ?? '';
    el.addEventListener('input', () => { d[el.name] = el.value; recalc(); });
  }
  $('[name="status"]', modal).addEventListener('change', recalc);

  function recalc() {
    const p = S.plannedMin(d, c), r = S.realMin(d);
    $('#ss-planned', modal).textContent = p != null ? `· ${S.fmtDur(p)}` : '';
    $('#ss-real', modal).textContent = r != null ? `· ${S.fmtDur(r)}${p != null ? ` (${S.fmtSigned(r - p)} respecto a lo previsto)` : ''}` : '';
    const att = S.attendanceList(d);
    $('#ss-att', modal).textContent = att.length ? `· ${att.filter(a => a.present).length} de ${att.length}` : '';
    $('fieldset.real', modal).classList.toggle('off', d.status !== 'jugada');
  }

  function renderAttendance() {
    const host = $('#ss-attendance', modal);
    const ids = Object.keys(d.attendance).sort((a, b) => playerName(a).localeCompare(playerName(b), 'es'));
    const free = cache.players.filter(p => !(p.id in d.attendance) && p.active !== false);
    host.innerHTML = `${ids.map(pid => {
      const a = d.attendance[pid];
      return `<div class="att-row${a.present ? '' : ' absent'}">
        <label class="check"><input type="checkbox" data-pres="${esc(pid)}"${a.present ? ' checked' : ''}> ${esc(playerName(pid))}</label>
        <select data-ch="${esc(pid)}">${characterOptions(pid, a.characterId)}</select>
        <button type="button" class="x" data-out="${esc(pid)}" title="Quitar de esta sesión (no estaba convocado)">✕</button>
      </div>`;
    }).join('') || '<p class="hint">La partida no tiene jugadores. Añádelos aquí o en la partida.</p>'}
    <div class="add-row"><select id="ss-add">${opt('', free.length ? 'Añadir jugador a esta sesión…' : 'No hay más jugadores')}${free.map(p => opt(p.id, p.name)).join('')}</select></div>
    <p class="hint">Marca solo a los que jugaron. Los desmarcados cuentan como ausencias en las estadísticas; quítalos con ✕ si no estaban convocados.</p>`;
    for (const cb of $$('[data-pres]', host)) cb.addEventListener('change', () => { d.attendance[cb.dataset.pres].present = cb.checked; cb.closest('.att-row').classList.toggle('absent', !cb.checked); recalc(); });
    for (const s of $$('[data-ch]', host)) s.addEventListener('change', () => { d.attendance[s.dataset.ch].characterId = s.value; });
    for (const b of $$('[data-out]', host)) b.addEventListener('click', () => { delete d.attendance[b.dataset.out]; renderAttendance(); recalc(); });
    $('#ss-add', host).addEventListener('change', e => {
      const pid = e.target.value;
      if (!pid) return;
      const chars = charsOf(pid);
      d.attendance[pid] = { present: true, characterId: chars.length === 1 ? chars[0].id : '' };
      renderAttendance();
      recalc();
    });
  }
  renderAttendance();
  recalc();

  const close = () => { modal.hidden = true; modal.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  modal.onclick = e => { if (e.target === modal || e.target.closest('[data-close]')) close(); };

  $('#ss-save', modal).addEventListener('click', async e => {
    if (!d.date) { $('[name="date"]', modal).focus(); return; }
    e.target.disabled = true;
    const { id, created_at, updated_at, updated_by, ...data } = d;
    data.breakMin = data.breakMin === '' ? '' : +data.breakMin;
    try {
      if (isNew) cache.sessions.push(await Sessions.create(data));
      else {
        await Sessions.update(sess.id, data);
        Object.assign(sess, data);
      }
      ctx.status('Sesión guardada');
      close();
      renderCampaignList();
      renderCampaignPanel();
    } catch (err) {
      e.target.disabled = false;
      ctx.status('Error al guardar la sesión: ' + (err.code || err.message), true);
    }
  });
  $('#ss-del', modal)?.addEventListener('click', async () => {
    if (!confirm('¿Borrar esta sesión? No se puede deshacer.')) return;
    await Sessions.remove(sess.id);
    cache.sessions = cache.sessions.filter(s => s.id !== sess.id);
    ctx.status('Sesión borrada');
    close();
    renderCampaignList();
    renderCampaignPanel();
  });

  modal.hidden = false;
  $('[name="date"]', modal).focus();
}

/* =====================================================================
 * Estadísticas
 * ===================================================================== */
let statsData = null;

function renderStats() {
  const root = $('#panel-estadisticas');
  const cmap = campaignMap();
  if (ui.statsCampaign && !cmap.has(ui.statsCampaign)) ui.statsCampaign = '';
  const years = [...new Set(cache.sessions.map(s => (s.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  if (ui.statsYear && !years.includes(ui.statsYear)) ui.statsYear = '';

  const inScope = s => (!ui.statsCampaign || s.campaignId === ui.statsCampaign) && (!ui.statsYear || (s.date || '').startsWith(ui.statsYear));
  const sess = cache.sessions.filter(inScope);
  const sum = S.summarize(sess, cmap);
  const one = ui.statsCampaign ? cmap.get(ui.statsCampaign) : null;
  const camps = one ? [one] : cache.campaigns.filter(c => !ui.statsYear || sess.some(s => s.campaignId === c.id));
  const nums = S.numberSessions(cache.sessions);
  const players = S.byPlayer(sess, cmap).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || b.pres - a.pres || playerName(a.playerId).localeCompare(playerName(b.playerId), 'es'));
  const progressOf = c => S.progress(c, sessionsOf(c.id)); // avance: siempre sobre todas las sesiones
  const onePr = one ? progressOf(one) : null;
  statsData = { sum, one, nums, players, sess, cmap, onePr };

  const freqTxt = one ? `prevista: ${freqLabel(one.frequency).toLowerCase()}` : (sum.medInterval != null ? `mediana ${S.fmtNum(sum.medInterval)} días` : '');
  const next = sum.upcoming.find(s => s.date >= S.today());
  const perCampaign = camps.map(c => ({ c, s: S.summarize(sess.filter(x => x.campaignId === c.id), cmap) }))
    .sort((a, b) => (b.s.last || '').localeCompare(a.s.last || '') || byName(a.c, b.c));

  root.innerHTML = `
  <div class="panel-card stats">
    <div class="panel-head"><h2>Estadísticas</h2></div>
    <div class="filters">
      <label>Partida <select id="st-camp">${opt('', 'Todas las partidas', !ui.statsCampaign)}${[...cache.campaigns].sort(byName).map(c => opt(c.id, c.name, c.id === ui.statsCampaign)).join('')}</select></label>
      <label>Periodo <select id="st-year">${opt('', 'Desde el principio', !ui.statsYear)}${years.map(y => opt(y, y, y === ui.statsYear)).join('')}</select></label>
    </div>

    <div class="tiles">
      ${one
        ? tile('Partida', S.CAMPAIGN_STATUS[one.status] || '—', `${one.members.length} jugadores · desde ${S.fmtDate(one.startDate || sum.first)}`)
        : tile('Partidas', camps.length, plural(camps.filter(c => c.status === 'activa').length, 'activa', 'activas'))}
      ${tile('Sesiones jugadas', sum.played, [sum.cancelled && plural(sum.cancelled, 'cancelada', 'canceladas'), sum.upcoming.length && plural(sum.upcoming.length, 'planificada', 'planificadas')].filter(Boolean).join(' · ') || ' ')}
      ${tile('Horas reales', S.fmtH(sum.withReal ? sum.real : null), sum.avgReal != null ? `media ${S.fmtDur(sum.avgReal)} por sesión` : 'sin datos')}
      ${tile('Horas teóricas', S.fmtH(sum.withPlanned ? sum.planned : null), sum.avgPlanned != null ? `media ${S.fmtDur(sum.avgPlanned)} por sesión` : 'sin datos')}
      ${tile('Real − teórico', S.fmtSigned(sum.deviation), sum.cmpCount ? `${sum.deviationPct > 0 ? '+' : ''}${S.fmtPct(sum.deviationPct)} en ${sum.cmpCount} sesiones con ambos datos` : 'faltan horarios')}
      ${tile('Asistencia', S.fmtPct(sum.attendance), sum.convocations ? `${sum.presences} presencias de ${sum.convocations}` : 'sin datos')}
      ${tile('Periodicidad', sum.avgInterval != null ? `cada ${S.fmtNum(sum.avgInterval)} días` : '—', [freqTxt, sum.maxInterval != null && `hueco máx. ${sum.maxInterval} días`].filter(Boolean).join(' · '))}
      ${tile('Última sesión', S.fmtDate(sum.last), [sum.sinceLast != null && `hace ${sum.sinceLast} días`, next && `próxima ${S.fmtDate(next.date, { day: 'numeric', month: 'short' })}`].filter(Boolean).join(' · '))}
    </div>
    ${one ? `<h3>Avance hacia el objetivo de horas <span class="muted small">(toda la partida)</span></h3>${progressBlock(one, onePr, { chart: onePr.target != null })}` : ''}
    ${sum.played && sum.withReal < sum.played ? `<p class="hint">${sum.played - sum.withReal === 1 ? '1 sesión jugada no tiene horario real y no cuenta' : `${sum.played - sum.withReal} sesiones jugadas no tienen horario real y no cuentan`} en las horas reales.</p>` : ''}

    <section class="viz-card">
      <h3>Horas por sesión</h3>
      <p class="legend"><span class="key-col"></span> Horas reales <span class="key-target"></span> Horas teóricas</p>
      <div class="chart" id="ch-sessions"></div>
    </section>
    <div class="viz-pair">
      <section class="viz-card">
        <h3>Horas reales por mes</h3>
        <p class="legend muted">Incluye los meses sin sesiones</p>
        <div class="chart" id="ch-months"></div>
      </section>
      <section class="viz-card">
        <h3>Asistencia por jugador</h3>
        <p class="legend muted">Sesiones jugadas sobre convocadas</p>
        <div class="chart" id="ch-att"></div>
      </section>
    </div>

    ${!one && perCampaign.length ? `<h3>Por partida</h3>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Partida</th><th>Estado</th><th class="num">Sesiones</th><th class="num">Reales</th><th class="num">Teóricas</th><th class="num">Diferencia</th><th class="num">Asistencia</th><th class="num">Periodicidad</th><th>Última</th><th class="num" title="Horas totales previstas de la partida">Objetivo</th><th title="Horas reales de toda la partida frente al objetivo">Avance (total)</th></tr></thead>
      <tbody>${perCampaign.map(({ c, s }) => {
        const pr = progressOf(c);
        return `<tr class="click" data-stc="${esc(c.id)}">
        <td>${esc(c.name)}</td><td>${esc(S.CAMPAIGN_STATUS[c.status] || '')}</td><td class="num">${s.played}</td>
        <td class="num">${S.fmtH(s.withReal ? s.real : null)}</td><td class="num">${S.fmtH(s.withPlanned ? s.planned : null)}</td>
        <td class="num">${S.fmtSigned(s.deviation)}</td><td class="num">${S.fmtPct(s.attendance)}</td>
        <td class="num">${s.avgInterval != null ? `${S.fmtNum(s.avgInterval)} d (${esc(freqLabel(c.frequency).toLowerCase())})` : '—'}</td>
        <td>${esc(S.fmtDate(s.last))}</td>
        <td class="num">${pr.target != null ? S.fmtH(pr.target) : '—'}</td>
        <td class="pcell">${pr.target != null ? `${S.progressBar(pr.pct, pr.expectedNow != null ? pr.expectedNow / pr.target : null)}<span class="small">${S.fmtPct(pr.pct)}</span>` : '<span class="muted">—</span>'}</td></tr>`;
      }).join('')}
      </tbody>
      <tfoot><tr><td>Total</td><td></td><td class="num">${sum.played}</td><td class="num">${S.fmtH(sum.withReal ? sum.real : null)}</td><td class="num">${S.fmtH(sum.withPlanned ? sum.planned : null)}</td><td class="num">${S.fmtSigned(sum.deviation)}</td><td class="num">${S.fmtPct(sum.attendance)}</td><td class="num">${sum.avgInterval != null ? S.fmtNum(sum.avgInterval) + ' d' : '—'}</td><td>${esc(S.fmtDate(sum.last))}</td><td></td><td></td></tr></tfoot>
    </table></div>` : ''}

    <h3>Por jugador</h3>
    ${players.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>Jugador</th><th class="num">Convocado</th><th class="num">Asistió</th><th class="num">Faltas</th><th class="num">Asistencia</th><th class="num">Horas jugadas</th><th>Última sesión</th></tr></thead>
      <tbody>${players.map(e => `<tr><td>${esc(playerName(e.playerId))}</td><td class="num">${e.conv}</td><td class="num">${e.pres}</td>
        <td class="num">${e.conv - e.pres}</td><td class="num">${S.fmtPct(e.pct)}</td><td class="num">${S.fmtH(e.real)}</td><td>${esc(S.fmtDate(e.last))}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Sin sesiones jugadas en este periodo.</p>'}

    <h3>Sesiones</h3>
    ${sess.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>Fecha</th>${one ? '' : '<th>Partida</th>'}<th>Nº</th><th>Título</th><th>Estado</th><th class="num">Teóricas</th><th class="num">Reales</th><th class="num">Diferencia</th><th>Asistentes</th></tr></thead>
      <tbody>${[...sess].sort(S.bySessionDate).reverse().map(s => {
        const c = cmap.get(s.campaignId), p = S.plannedMin(s, c), r = S.realMin(s);
        const pres = S.attendanceList(s).filter(a => a.present).map(a => playerName(a.playerId));
        return `<tr class="click st-${esc(s.status)}" data-sts="${esc(s.id)}"><td>${esc(S.fmtDate(s.date))}</td>${one ? '' : `<td>${esc(c?.name || '—')}</td>`}
          <td>${nums.get(s.id) ?? '—'}</td><td>${esc(s.title || '')}</td><td><span class="badge b-${esc(s.status)}">${esc(S.SESSION_STATUS[s.status] || s.status)}</span></td>
          <td class="num">${S.fmtDur(p)}</td><td class="num">${s.status === 'jugada' ? S.fmtDur(r) : '—'}</td>
          <td class="num">${s.status === 'jugada' && p != null && r != null ? S.fmtSigned(r - p) : '—'}</td>
          <td class="small">${esc(pres.join(', '))}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<p class="muted">No hay sesiones en este periodo.</p>'}
  </div>`;

  $('#st-camp', root).addEventListener('change', e => { ui.statsCampaign = e.target.value; renderStats(); });
  $('#st-year', root).addEventListener('change', e => { ui.statsYear = e.target.value; renderStats(); });
  for (const r of $$('[data-stc]', root)) r.addEventListener('click', () => { ui.statsCampaign = r.dataset.stc; renderStats(); });
  for (const r of $$('[data-sts]', root)) r.addEventListener('click', () => openSession(cache.sessions.find(s => s.id === r.dataset.sts)));
  renderCharts();
}

function renderCharts() {
  if (!statsData || !$('#ch-sessions')) return;
  const { sess, cmap, nums, one, players, onePr } = statsData;
  if (one && $('#ch-progress')) S.timeChart($('#ch-progress'), { ...S.progressSeries(one, sessionsOf(one.id), onePr), yFmt: v => `${S.fmtNum(v)} h` });
  const played = sess.filter(s => s.status === 'jugada').sort(S.bySessionDate);
  S.columnChart($('#ch-sessions'), {
    yFmt: v => `${S.fmtNum(v)} h`,
    items: played.map(s => {
      const c = cmap.get(s.campaignId), p = S.plannedMin(s, c), r = S.realMin(s);
      const att = S.attendanceList(s);
      return {
        label: one ? `${nums.get(s.id)}` : S.fmtDate(s.date, { day: 'numeric', month: 'numeric' }),
        value: r != null ? r / 60 : 0,
        target: p != null ? p / 60 : null,
        tip: [`Sesión ${nums.get(s.id) ?? ''} · ${S.fmtDate(s.date)}`, one ? s.title : c?.name, `Teóricas: ${S.fmtDur(p)}`,
          `Reales: ${r != null ? S.fmtDur(r) : 'sin apuntar'}`, p != null && r != null ? `Diferencia: ${S.fmtSigned(r - p)}` : '',
          `Asistencia: ${att.filter(a => a.present).length}/${att.length}`].filter(Boolean).join('\n'),
      };
    }),
  });
  const months = S.byMonth(sess);
  const mName = k => new Date(k + '-15T12:00:00').toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
  S.columnChart($('#ch-months'), {
    yFmt: v => `${S.fmtNum(v)} h`,
    height: 200,
    items: months.map(m => ({
      label: mName(m.key), value: m.real / 60,
      tip: `${new Date(m.key + '-15T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}\n${m.n} sesi${m.n === 1 ? 'ón' : 'ones'} · ${S.fmtH(m.real)}`,
    })),
  });
  S.barList($('#ch-att'), players.map(e => ({
    label: playerName(e.playerId), value: e.pct, text: `${S.fmtPct(e.pct)} · ${e.pres}/${e.conv}`,
    tip: `${playerName(e.playerId)}\nAsistió a ${e.pres} de ${e.conv} sesiones\n${S.fmtH(e.real)} jugadas`,
  })));
}

/** Para la copia de seguridad. */
export function snapshot() {
  const clean = ({ updated_by, ...r }) => r;
  return { players: cache.players.map(clean), campaigns: cache.campaigns.map(clean), sessions: cache.sessions.map(clean) };
}

/** Restaura los jugadores de una copia (reutiliza los que ya existen con el mismo nombre). Devuelve id antiguo -> nuevo. */
export async function restorePlayers(json) {
  const pMap = new Map();
  const known = new Map(cache.players.map(p => [norm(p.name), p]));
  for (const p of json.players || []) {
    let np = known.get(norm(p.name));
    if (!np) {
      const { id, created_at, updated_at, updated_by, ...data } = p;
      np = await Players.create(data);
      cache.players.push(np);
      known.set(norm(np.name), np);
    }
    pMap.set(p.id, np.id);
  }
  cache.players.sort(byName);
  return pMap;
}

/**
 * Restaura partidas y sesiones de una copia con los ids nuevos de jugadores y fichas.
 * Si la partida ya existe (mismo id o mismo nombre), pregunta si se sobrescribe, se crea
 * otra o se omite. Al sobrescribir, las sesiones de la copia sustituyen a las que tengan el mismo id.
 */
export async function restoreGames(json, pMap, charMap, decide) {
  const cMap = new Map(), overwritten = new Set(), skipped = new Set();
  const mp = id => pMap.get(id) || id, mc = id => (id ? charMap.get(id) || '' : '');
  const many = (json.campaigns || []).length > 1;
  for (const c of json.campaigns || []) {
    const { id, created_at, updated_at, updated_by, ...data } = c;
    data.members = (data.members || []).map(m => ({ playerId: mp(m.playerId), characterId: mc(m.characterId) }));
    const same = campaignById(id) || cache.campaigns.find(x => norm(x.name) === norm(data.name));
    let choice = 'new';
    if (same && decide) {
      choice = await decide('campaign', {
        title: 'Esa partida ya existe',
        html: `<p>Ya hay una partida <b>${esc(same.name || 'Sin nombre')}</b> (${plural(sessionsOf(same.id).length, 'sesión', 'sesiones')}).</p><p>¿Sobrescribirla con la de la copia, crear otra partida o dejarla como está?</p>`,
        buttons: [{ v: 'overwrite', label: 'Sobrescribir', primary: true }, { v: 'new', label: 'Crear otra' }, { v: 'skip', label: 'Omitir' }],
        cancel: 'skip', remember: many ? 'Hacer lo mismo con las demás partidas que ya existan' : '',
      });
    }
    if (choice === 'skip') { cMap.set(id, same.id); skipped.add(same.id); continue; }
    if (choice === 'overwrite') {
      await Campaigns.update(same.id, data);
      Object.assign(same, data);
      cMap.set(id, same.id);
      overwritten.add(same.id);
      continue;
    }
    const nc = await Campaigns.create(data);
    cache.campaigns.push(nc);
    cMap.set(id, nc.id);
  }
  let n = 0;
  for (const s of json.sessions || []) {
    const { id, created_at, updated_at, updated_by, ...data } = s;
    if (!cMap.has(data.campaignId)) continue;
    data.campaignId = cMap.get(data.campaignId);
    if (skipped.has(data.campaignId)) continue;
    data.attendance = Object.fromEntries(Object.entries(data.attendance || {}).map(([pid, a]) => [mp(pid), { ...a, characterId: mc(a.characterId) }]));
    const cur = overwritten.has(data.campaignId) && cache.sessions.find(x => x.id === id && x.campaignId === data.campaignId);
    if (cur) { await Sessions.update(cur.id, data); Object.assign(cur, data); }
    else cache.sessions.push(await Sessions.create(data));
    n++;
  }
  return { campaigns: cMap.size - skipped.size, sessions: n };
}

/**
 * Layout con el que se muestra una ficha: el de su partida. Si está en varias, manda
 * la activa con la sesión más reciente; si no está en ninguna, el layout por defecto.
 */
export function layoutForCharacter(charId) {
  const rank = { activa: 0, pausada: 1, terminada: 2 };
  const last = c => sessionsOf(c.id).filter(s => s.status !== 'cancelada').at(-1)?.date || c.startDate || '';
  const camps = cache.campaigns.filter(c => c.members.some(m => m.characterId === charId))
    .sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || last(b).localeCompare(last(a)));
  const c = camps[0] || null;
  return { layoutId: getLayout(c?.layoutId) ? c.layoutId : DEFAULT_LAYOUT, campaign: c };
}

export const currentView = () => ui.view;
