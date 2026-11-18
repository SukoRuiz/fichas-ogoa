/* Cálculos de horas, asistencia y periodicidad de las partidas, y gráficos
 * sencillos (HTML + SVG, sin librerías).
 *
 * Definiciones:
 *  - Horas teóricas de una sesión: horario previsto (inicio–fin); si no hay,
 *    la duración prevista por sesión de su partida.
 *  - Horas reales: horario real (inicio–fin) menos las pausas; si no hay horario,
 *    la duración real escrita a mano. Si no hay nada, la sesión no cuenta en horas reales.
 *  - Solo cuentan las sesiones "jugadas". Las "planificadas" son futuras y las
 *    "canceladas" solo se cuentan aparte.
 *  - Asistencia: presentes / convocados (los jugadores que figuran en la sesión).
 */

export const FREQS = [
  { v: 7, label: 'Semanal' },
  { v: 14, label: 'Quincenal' },
  { v: 21, label: 'Cada 3 semanas' },
  { v: 30, label: 'Mensual' },
  { v: 0, label: 'Irregular' },
];
export const CAMPAIGN_STATUS = { activa: 'Activa', pausada: 'En pausa', terminada: 'Terminada' };
export const SESSION_STATUS = { jugada: 'Jugada', planificada: 'Planificada', cancelada: 'Cancelada' };

/* ---------------- tiempo ---------------- */
const toMin = t => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  return m ? +m[1] * 60 + +m[2] : null;
};
/** Minutos entre dos horas "HH:MM" (si el fin es menor, pasa de medianoche). */
export function span(a, b) {
  const x = toMin(a), y = toMin(b);
  if (x == null || y == null) return null;
  return y > x ? y - x : y + 1440 - x;
}
export function plannedMin(s, c) {
  const m = span(s.plannedStart, s.plannedEnd);
  if (m != null) return m;
  const h = parseFloat(String(c?.plannedHours ?? '').replace(',', '.'));
  return h > 0 ? Math.round(h * 60) : null;
}
export function realMin(s) {
  const m = span(s.actualStart, s.actualEnd);
  if (m != null) return Math.max(0, m - (+s.breakMin || 0));
  const h = parseFloat(String(s.realHours ?? '').replace(',', '.'));
  return h > 0 ? Math.round(h * 60) : null;
}
export const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
export const fmtNum = (n, d = 1) => (n == null || !isFinite(n) ? '—' : (d ? nf1 : nf0).format(n));
/** Horas en decimal: "37,5 h". */
export const fmtH = min => (min == null ? '—' : `${fmtNum(min / 60)} h`);
/** Duración corta: "3 h 45 min". */
export function fmtDur(min) {
  if (min == null) return '—';
  const h = Math.floor(Math.abs(min) / 60), m = Math.round(Math.abs(min) % 60);
  const s = (h ? `${h} h` : '') + (m ? `${h ? ' ' : ''}${m} min` : '') || '0 min';
  return min < 0 ? '−' + s : s;
}
export const fmtSigned = min => (min == null ? '—' : (min > 0 ? '+' : '') + fmtDur(min));
export const fmtPct = x => (x == null || !isFinite(x) ? '—' : `${nf0.format(x * 100)} %`);
export function fmtDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString('es-ES', opts);
}
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ---------------- orden y numeración ---------------- */
export const bySessionDate = (a, b) =>
  (a.date || '').localeCompare(b.date || '') || (a.plannedStart || a.actualStart || '').localeCompare(b.plannedStart || b.actualStart || '');

/** Número de cada sesión dentro de su partida (las canceladas no se numeran). */
export function numberSessions(sessions) {
  const n = new Map(), count = new Map();
  for (const s of [...sessions].sort(bySessionDate)) {
    if (s.status === 'cancelada') continue;
    const k = s.campaignId;
    count.set(k, (count.get(k) || 0) + 1);
    n.set(s.id, count.get(k));
  }
  return n;
}

export const attendanceList = s => Object.entries(s.attendance || {}).map(([playerId, a]) => ({ playerId, ...a }));

/* ---------------- agregados ---------------- */
const median = xs => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b), m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * Estadísticas de un conjunto de sesiones.
 * @param sessions sesiones ya filtradas (cualquier estado)
 * @param campaignsById Map id -> partida (para las horas teóricas por defecto)
 */
export function summarize(sessions, campaignsById) {
  const played = sessions.filter(s => s.status === 'jugada').sort(bySessionDate);
  const out = {
    played: played.length,
    cancelled: sessions.filter(s => s.status === 'cancelada').length,
    upcoming: sessions.filter(s => s.status === 'planificada').sort(bySessionDate),
    planned: 0, real: 0, withReal: 0, withPlanned: 0,
    cmpPlanned: 0, cmpReal: 0, cmpCount: 0, // solo sesiones con ambos valores
    convocations: 0, presences: 0,
    first: played[0]?.date || null, last: played.at(-1)?.date || null,
    intervals: [], avgInterval: null, medInterval: null, maxInterval: null,
    rows: [],
  };
  for (const s of played) {
    const c = campaignsById.get(s.campaignId);
    const p = plannedMin(s, c), r = realMin(s);
    if (p != null) { out.planned += p; out.withPlanned++; }
    if (r != null) { out.real += r; out.withReal++; }
    if (p != null && r != null) { out.cmpPlanned += p; out.cmpReal += r; out.cmpCount++; }
    const att = attendanceList(s);
    out.convocations += att.length;
    out.presences += att.filter(a => a.present).length;
    out.rows.push({ s, c, p, r });
  }
  // periodicidad: días entre sesiones jugadas consecutivas (de la misma fecha no cuenta)
  const dates = [...new Set(played.map(s => s.date).filter(Boolean))];
  for (let i = 1; i < dates.length; i++) out.intervals.push(dayDiff(dates[i - 1], dates[i]));
  if (out.intervals.length) {
    out.avgInterval = out.intervals.reduce((a, b) => a + b, 0) / out.intervals.length;
    out.medInterval = median(out.intervals);
    out.maxInterval = Math.max(...out.intervals);
  }
  out.attendance = out.convocations ? out.presences / out.convocations : null;
  out.avgReal = out.withReal ? out.real / out.withReal : null;
  out.avgPlanned = out.withPlanned ? out.planned / out.withPlanned : null;
  out.deviation = out.cmpCount ? out.cmpReal - out.cmpPlanned : null;
  out.deviationPct = out.cmpPlanned ? out.deviation / out.cmpPlanned : null;
  out.sinceLast = out.last ? dayDiff(out.last, today()) : null;
  return out;
}

/** Asistencia y horas por jugador sobre sesiones jugadas. */
export function byPlayer(sessions, campaignsById) {
  const m = new Map();
  for (const s of sessions) {
    if (s.status !== 'jugada') continue;
    const r = realMin(s), p = plannedMin(s, campaignsById.get(s.campaignId));
    for (const a of attendanceList(s)) {
      const e = m.get(a.playerId) || { playerId: a.playerId, conv: 0, pres: 0, real: 0, planned: 0, last: null, campaigns: new Set() };
      e.conv++;
      e.campaigns.add(s.campaignId);
      if (a.present) {
        e.pres++;
        if (r != null) e.real += r;
        if (p != null) e.planned += p;
        if (!e.last || s.date > e.last) e.last = s.date;
      }
      m.set(a.playerId, e);
    }
  }
  return [...m.values()].map(e => ({ ...e, pct: e.conv ? e.pres / e.conv : null }));
}

/** Sesiones y horas reales por mes, incluidos los meses sin sesiones. */
export function byMonth(sessions) {
  const played = sessions.filter(s => s.status === 'jugada' && s.date).sort(bySessionDate);
  if (!played.length) return [];
  const key = d => d.slice(0, 7);
  const m = new Map();
  for (const s of played) {
    const e = m.get(key(s.date)) || { n: 0, real: 0 };
    e.n++;
    e.real += realMin(s) || 0;
    m.set(key(s.date), e);
  }
  const out = [];
  let [y, mo] = key(played[0].date).split('-').map(Number);
  const [ly, lm] = key(played.at(-1).date).split('-').map(Number);
  while (y < ly || (y === ly && mo <= lm)) {
    const k = `${y}-${String(mo).padStart(2, '0')}`;
    out.push({ key: k, ...(m.get(k) || { n: 0, real: 0 }) });
    if (++mo > 12) { mo = 1; y++; }
  }
  return out;
}

/* =====================================================================
 * Gráficos
 * ===================================================================== */
const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count, p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(k => k * p).find(s => s >= raw) || p * 10;
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(+v.toFixed(6));
  if (ticks.at(-1) < max) ticks.push(+(ticks.at(-1) + step).toFixed(6));
  return ticks;
}

/** Columna con 4 px redondeados arriba y base recta. */
function colPath(x, y, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Gráfico de columnas. items: [{ label, value, target?, tip }]
 * `target` (opcional) se dibuja como una marca horizontal (p. ej. horas teóricas).
 */
export function columnChart(host, { items, yFmt = v => fmtNum(v), height = 220, labelEvery = 0 }) {
  const n = items.length;
  if (!n) { host.innerHTML = '<p class="viz-empty">Sin datos todavía.</p>'; return; }
  const padL = 44, padR = 12, padT = 14, padB = 34;
  const band = Math.max(26, Math.min(64, ((host.clientWidth || 600) - padL - padR) / n));
  const W = padL + padR + band * n, H = height, ih = H - padT - padB;
  const max = Math.max(...items.map(i => Math.max(i.value || 0, i.target || 0)));
  const ticks = niceTicks(max);
  const top = ticks.at(-1) || 1;
  const Y = v => padT + ih - (v / top) * ih;
  const bw = Math.min(24, band * 0.62);
  const every = labelEvery || Math.max(1, Math.ceil(40 / band));
  let g = '';
  for (const t of ticks) {
    g += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${Y(t)}" y2="${Y(t)}"/>`;
    g += `<text class="tick" x="${padL - 6}" y="${Y(t) + 4}" text-anchor="end">${escText(yFmt(t))}</text>`;
  }
  items.forEach((it, i) => {
    const cx = padL + band * i + band / 2;
    const v = it.value || 0;
    g += `<path class="col" d="${colPath(cx - bw / 2, Y(v), bw, Y(0) - Y(v))}"/>`;
    if (it.target != null) {
      const ty = Y(it.target);
      g += `<line class="target-halo" x1="${cx - bw / 2 - 5}" x2="${cx + bw / 2 + 5}" y1="${ty}" y2="${ty}"/>`;
      g += `<line class="target" x1="${cx - bw / 2 - 5}" x2="${cx + bw / 2 + 5}" y1="${ty}" y2="${ty}"/>`;
    }
    if (i % every === 0) g += `<text class="xlab" x="${cx}" y="${H - padB + 16}" text-anchor="middle">${escText(it.label)}</text>`;
    g += `<rect class="hit" x="${padL + band * i}" y="${padT}" width="${band}" height="${ih + 20}" data-tip="${escAttr(it.tip || '')}"/>`;
  });
  g += `<line class="axis" x1="${padL}" x2="${W - padR}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  host.innerHTML = `<div class="viz-scroll"><svg class="viz" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">${g}</svg></div>`;
}

/** Barras horizontales (HTML). items: [{ label, value (0..1), text, tip }] */
export function barList(host, items) {
  if (!items.length) { host.innerHTML = '<p class="viz-empty">Sin datos todavía.</p>'; return; }
  host.innerHTML = `<div class="bars">${items.map(it => `
    <div class="bar-row" data-tip="${escAttr(it.tip || '')}">
      <span class="bar-label">${escText(it.label)}</span>
      <span class="bar-track"><span class="bar" style="width:${Math.max(0, Math.min(1, it.value || 0)) * 100}%"></span></span>
      <span class="bar-val">${escText(it.text)}</span>
    </div>`).join('')}</div>`;
}

/** Tooltip compartido para cualquier elemento con data-tip. */
let tipEl;
export function enableTooltips(root) {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'viz-tip';
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
  }
  root.addEventListener('pointermove', e => {
    const t = e.target.closest?.('[data-tip]');
    if (!t || !t.dataset.tip) { tipEl.hidden = true; return; }
    tipEl.textContent = t.dataset.tip;
    tipEl.hidden = false;
    const r = tipEl.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
  });
  root.addEventListener('pointerleave', () => { tipEl.hidden = true; });
}
