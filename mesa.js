/* Jugadores, partidas, sesiones y estadísticas.
 *
 *  players/{id}    { name, contact, notes, active }
 *  campaigns/{id}  { name, status, description, startDate, endDate, frequency (días; 0 = irregular),
 *                    plannedHours (duración prevista por sesión), defaultStart ("HH:MM"),
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
let ctx = null; // { openCharacter(id), newCharacter(data), status(msg, err), playersChanged() }
const ui = { view: 'fichas', playerId: null, campaignId: null, campaignTab: 'players', statsCampaign: '', statsYear: '' };

export const playerById = id => cache.players.find(p => p.id === id);
const charById = id => cache.characters.find(c => c.id === id);
const campaignById = id => cache.campaigns.find(c => c.id === id);
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
  if (!VIEWS.includes(v)) v = 'fichas';
  ui.view = v;
  document.body.dataset.view = v;
  for (const b of $$('#tabs [data-view]')) b.setAttribute('aria-selected', String(b.dataset.view === v));
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

export function init(context) {
  ctx = context;
  for (const b of $$('#tabs [data-view]')) b.addEventListener('click', () => showView(b.dataset.view));
  window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
  $('#btn-new-player').addEventListener('click', async () => {
    const p = await createPlayer('Nuevo jugador');
    ui.playerId = p.id;
    renderPlayerList();
    renderPlayerPanel();
    $('#panel-jugadores [data-f="name"]')?.select();
    ctx.playersChanged();
  });
  $('#btn-new-campaign').addEventListener('click', async () => {
    const c = await Campaigns.create({
      name: 'Nueva partida', status: 'activa', description: '', startDate: S.today(), endDate: '',
      frequency: 7, plannedHours: 4, defaultStart: '', layoutId: DEFAULT_LAYOUT, members: [],
    });
    cache.campaigns.push(c);
    ui.campaignId = c.id;
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
function fillList(ul, items, activeId, onPick) {
  ul.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    li.dataset.id = it.id;
    li.innerHTML = '<span class="n"></span><span class="d"></span>';
    $('.n', li).textContent = it.n;
    $('.d', li).textContent = it.d;
    if (it.muted) li.classList.add('muted');
    li.classList.toggle('active', it.id === activeId);
    li.addEventListener('click', () => onPick(it.id));
    ul.appendChild(li);
  }
  if (!items.length) ul.innerHTML = '<li class="empty">Todavía no hay ninguno. Pulsa +.</li>';
}

function renderPlayerList() {
  fillList($('#player-list'), cache.players.map(p => {
    const n = charsOf(p.id).length;
    return {
      id: p.id, n: p.name || 'Sin nombre', muted: p.active === false,
      d: [`${n} ficha${n === 1 ? '' : 's'}`, p.active === false ? 'inactivo' : ''].filter(Boolean).join(' · '),
    };
  }), ui.playerId, id => { ui.playerId = id; renderPlayerList(); renderPlayerPanel(); });
}

function renderCampaignList() {
  const order = { activa: 0, pausada: 1, terminada: 2 };
  const list = [...cache.campaigns].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || byName(a, b));
  fillList($('#campaign-list'), list.map(c => {
    const n = sessionsOf(c.id).filter(s => s.status === 'jugada').length;
    return {
      id: c.id, n: c.name || 'Sin nombre', muted: c.status === 'terminada',
      d: `${S.CAMPAIGN_STATUS[c.status] || ''} · ${n} sesi${n === 1 ? 'ón' : 'ones'} · ${c.members.length} jug.`,
    };
  }), ui.campaignId, id => { ui.campaignId = id; renderCampaignList(); renderCampaignPanel(); });
}

/* ---------------- piezas comunes ---------------- */
const tile = (label, value, sub = '') =>
  `<div class="tile"><div class="t-label">${esc(label)}</div><div class="t-value">${esc(value)}</div>${sub ? `<div class="t-sub">${esc(sub)}</div>` : ''}</div>`;
const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
const emptyPanel = (title, text) => `<div class="panel-card"><h2>${esc(title)}</h2><p class="hint">${esc(text)}</p></div>`;

/* =====================================================================
 * Panel de jugador
 * ===================================================================== */
function renderPlayerPanel() {
  const root = $('#panel-jugadores');
  let p = playerById(ui.playerId);
  if (!p && cache.players.length) { p = cache.players[0]; ui.playerId = p.id; renderPlayerList(); }
  if (!p) { root.innerHTML = emptyPanel('Jugadores', 'Crea el primer jugador con el botón + de la barra lateral. Los jugadores que ya figuraban en las fichas se han creado solos.'); return; }

  const cmap = campaignMap();
  const mine = cache.sessions.filter(s => s.attendance && p.id in s.attendance);
  const st = S.byPlayer(mine, cmap).find(e => e.playerId === p.id);
  const camps = cache.campaigns.filter(c => c.members.some(m => m.playerId === p.id) || mine.some(s => s.campaignId === c.id)).sort(byName);
  const chars = charsOf(p.id);

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
    <h3>Fichas de personaje</h3>
    <ul class="chips">${chars.map(c => `<li><button type="button" class="link" data-open="${esc(c.id)}">${esc(c.data.name || 'Sin nombre')}</button>
      <span class="muted">${esc([c.data.descriptor, c.data.type, c.data.focus].filter(Boolean).join(' · '))}</span></li>`).join('')
      || '<li class="muted">Ninguna. Asigna el jugador desde la propia ficha o crea una nueva.</li>'}</ul>
    <p><button type="button" class="btn" id="pl-newchar">+ Nueva ficha para este jugador</button></p>
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
  for (const b of $$('[data-open]', root)) b.addEventListener('click', () => ctx.openCharacter(b.dataset.open));
  for (const r of $$('[data-camp]', root)) r.addEventListener('click', () => { ui.campaignId = r.dataset.camp; showView('partidas'); });
  $('#pl-newchar', root).addEventListener('click', () => ctx.newCharacter({ playerId: p.id, player: p.name }));
  $('#pl-del', root).addEventListener('click', () => deletePlayer(p));
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
  if (!confirm(`¿Borrar el jugador "${p.name}"?${chars.length ? `\n\nSus ${chars.length} fichas se conservan, pero quedarán sin jugador.` : ''}`)) return;
  await flushAll();
  for (const c of chars) {
    await Cloud.setPlayer(c.id, '', '');
    c.data.playerId = '';
    c.data.player = '';
  }
  await Players.remove(p.id);
  cache.players = cache.players.filter(x => x.id !== p.id);
  ui.playerId = null;
  ctx.playersChanged();
  renderPlayerList();
  renderPlayerPanel();
  ctx.status('Jugador borrado');
}

/* =====================================================================
 * Panel de partida
 * ===================================================================== */
function renderCampaignPanel() {
  const root = $('#panel-partidas');
  let c = campaignById(ui.campaignId);
  if (!c && cache.campaigns.length) { c = [...cache.campaigns].sort(byName)[0]; ui.campaignId = c.id; renderCampaignList(); }
  if (!c) { root.innerHTML = emptyPanel('Partidas', 'Crea la primera partida con el botón + de la barra lateral. Después añade sus jugadores y ve registrando cada sesión.'); return; }

  if (!getLayout(c.layoutId)) c.layoutId = DEFAULT_LAYOUT; // partidas anteriores a los layouts
  const sess = sessionsOf(c.id);
  const nums = S.numberSessions(sess);
  const sum = S.summarize(sess, campaignMap());

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
      <label>Hora habitual de inicio <input type="time" data-f="defaultStart"></label>
      <label>Layout de las fichas <select data-f="layoutId">${LAYOUTS.map(l => opt(l.id, l.name)).join('')}</select></label>
    </div>

    <div class="tiles">
      ${tile('Sesiones jugadas', sum.played, [sum.cancelled && plural(sum.cancelled, 'cancelada', 'canceladas'), sum.upcoming.length && plural(sum.upcoming.length, 'planificada', 'planificadas')].filter(Boolean).join(' · '))}
      ${tile('Horas reales', S.fmtH(sum.withReal ? sum.real : null), sum.avgReal != null ? `media ${S.fmtDur(sum.avgReal)}` : '')}
      ${tile('Horas teóricas', S.fmtH(sum.withPlanned ? sum.planned : null), sum.avgPlanned != null ? `media ${S.fmtDur(sum.avgPlanned)}` : '')}
      ${tile('Asistencia', S.fmtPct(sum.attendance), sum.convocations ? `${sum.presences} de ${sum.convocations}` : '')}
      ${tile('Periodicidad', sum.avgInterval != null ? `${S.fmtNum(sum.avgInterval)} días` : '—', `prevista: ${freqLabel(c.frequency).toLowerCase()}`)}
    </div>
    <p><button type="button" class="link" id="cp-stats">Ver estadísticas completas de esta partida →</button></p>

    <div class="sub-tabs" role="tablist">
      <button type="button" role="tab" data-ct="players" aria-selected="${ui.campaignTab === 'players'}">Jugadores <span class="count">${c.members.length}</span></button>
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

function characterOptions(playerId, selected) {
  const list = playerId ? charsOf(playerId) : [];
  let h = opt('', '— sin ficha —', !selected);
  for (const ch of list) h += opt(ch.id, ch.data.name || 'Sin nombre', ch.id === selected);
  if (selected && !list.some(ch => ch.id === selected)) h += opt(selected, charName(selected), true);
  return h;
}

const VIEW_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>';

function renderMembers(c) {
  const host = $('#cp-members');
  const used = new Set(c.members.map(m => m.playerId));
  const free = cache.players.filter(p => !used.has(p.id) && p.active !== false);
  host.innerHTML = `
    ${c.members.length ? `<div class="table-wrap"><table class="data members">
      <thead><tr><th>Jugador</th><th>Personaje</th><th></th></tr></thead>
      <tbody>${c.members.map((m, i) => `<tr>
        <td>${esc(playerName(m.playerId))}</td>
        <td><span class="char-cell"><select data-char="${i}">${characterOptions(m.playerId, m.characterId)}</select>
          <button type="button" class="x view" data-view-char="${i}" title="Ver ficha"${m.characterId && charById(m.characterId) ? '' : ' disabled'}>${VIEW_ICON}</button></span></td>
        <td class="num"><button type="button" class="x" data-rm="${i}" title="Quitar de la partida">✕</button></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Sin jugadores todavía.</p>'}
    <p class="add-row">
      <select id="cp-addplayer">${opt('', free.length ? 'Añadir jugador…' : 'No hay más jugadores activos')}${free.map(p => opt(p.id, p.name)).join('')}</select>
    </p>`;
  const count = $('[data-ct="players"] .count');
  if (count) count.textContent = c.members.length;
  const save = () => { queue('campaigns', c, { members: c.members }, 200); renderCampaignList(); };
  for (const s of $$('[data-char]', host)) s.addEventListener('change', () => {
    c.members[+s.dataset.char].characterId = s.value;
    const v = $(`[data-view-char="${s.dataset.char}"]`, host);
    if (v) v.disabled = !(s.value && charById(s.value));
    save();
  });
  for (const b of $$('[data-view-char]', host)) b.addEventListener('click', () => {
    const id = c.members[+b.dataset.viewChar]?.characterId;
    if (id && charById(id)) ctx.openCharacter(id);
  });
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
  statsData = { sum, one, nums, players, sess, cmap };

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
      <thead><tr><th>Partida</th><th>Estado</th><th class="num">Sesiones</th><th class="num">Reales</th><th class="num">Teóricas</th><th class="num">Diferencia</th><th class="num">Asistencia</th><th class="num">Periodicidad</th><th>Última</th></tr></thead>
      <tbody>${perCampaign.map(({ c, s }) => `<tr class="click" data-stc="${esc(c.id)}">
        <td>${esc(c.name)}</td><td>${esc(S.CAMPAIGN_STATUS[c.status] || '')}</td><td class="num">${s.played}</td>
        <td class="num">${S.fmtH(s.withReal ? s.real : null)}</td><td class="num">${S.fmtH(s.withPlanned ? s.planned : null)}</td>
        <td class="num">${S.fmtSigned(s.deviation)}</td><td class="num">${S.fmtPct(s.attendance)}</td>
        <td class="num">${s.avgInterval != null ? `${S.fmtNum(s.avgInterval)} d (${esc(freqLabel(c.frequency).toLowerCase())})` : '—'}</td>
        <td>${esc(S.fmtDate(s.last))}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td>Total</td><td></td><td class="num">${sum.played}</td><td class="num">${S.fmtH(sum.withReal ? sum.real : null)}</td><td class="num">${S.fmtH(sum.withPlanned ? sum.planned : null)}</td><td class="num">${S.fmtSigned(sum.deviation)}</td><td class="num">${S.fmtPct(sum.attendance)}</td><td class="num">${sum.avgInterval != null ? S.fmtNum(sum.avgInterval) + ' d' : '—'}</td><td>${esc(S.fmtDate(sum.last))}</td></tr></tfoot>
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
  const { sess, cmap, nums, one, players } = statsData;
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

/** Restaura partidas y sesiones de una copia con los ids nuevos de jugadores y fichas. */
export async function restoreGames(json, pMap, charMap) {
  const cMap = new Map();
  const mp = id => pMap.get(id) || id, mc = id => (id ? charMap.get(id) || '' : '');
  for (const c of json.campaigns || []) {
    const { id, created_at, updated_at, updated_by, ...data } = c;
    data.members = (data.members || []).map(m => ({ playerId: mp(m.playerId), characterId: mc(m.characterId) }));
    const nc = await Campaigns.create(data);
    cache.campaigns.push(nc);
    cMap.set(id, nc.id);
  }
  let n = 0;
  for (const s of json.sessions || []) {
    const { id, created_at, updated_at, updated_by, ...data } = s;
    if (!cMap.has(data.campaignId)) continue;
    data.campaignId = cMap.get(data.campaignId);
    data.attendance = Object.fromEntries(Object.entries(data.attendance || {}).map(([pid, a]) => [mp(pid), { ...a, characterId: mc(a.characterId) }]));
    cache.sessions.push(await Sessions.create(data));
    n++;
  }
  return { campaigns: cMap.size, sessions: n };
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
export function refreshCurrent() { if (ui.view !== 'fichas') showView(ui.view); }
