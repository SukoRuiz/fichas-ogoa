/* Piezas comunes para dibujar una ficha: Markdown, ajuste del tamaño de letra y una
 * versión de solo lectura (la usa el modo "Ver" del editor de layouts).
 */
import { expandFields } from './layouts/fields.js';

export const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

/* =====================================================================
 * Markdown mínimo (negrita, cursiva, listas anidadas, títulos, citas, hr)
 * ===================================================================== */
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(?!\s)(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?!\s)(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(?!\s)([^*]+?)\*/g, '<em>$1</em>')
    .replace(/(^|[\s(¡¿"«])_(?!\s)([^_]+?)_(?=$|[\s.,;:!?)"»])/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>');
}
export function renderMD(src) {
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

/* =====================================================================
 * Ajuste automático del tamaño de letra
 * ===================================================================== */
const measureCtx = document.createElement('canvas').getContext('2d');
/** Línea de texto: reduce la letra (desde data-fs) hasta que el texto quepa a lo ancho. */
export function fitInput(el) {
  const base = +el.dataset.fs;
  const cs = getComputedStyle(el);
  measureCtx.font = `${cs.fontWeight} ${base}px ${cs.fontFamily}`;
  const avail = el.offsetWidth - 6;
  const w = measureCtx.measureText((el.value ?? el.textContent) || '').width;
  const fs = w > avail && w > 0 ? Math.max(8, base * avail / w) : base;
  el.style.fontSize = fs + 'px';
}
/** Caja de Markdown o lista de valores: reduce la letra hasta que no se salga. */
export function fitBox(el, base = 13, min = 6) {
  let fs = base;
  el.style.fontSize = fs + 'px';
  while ((el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && fs > min) {
    fs -= 0.5;
    el.style.fontSize = fs + 'px';
  }
}

/** Coloca un elemento sobre la página (coordenadas en px de la imagen). */
export function place(el, s) {
  el.classList.add('f');
  el.style.setProperty('--x', s.x);
  el.style.setProperty('--y', s.y);
  el.style.setProperty('--w', s.w);
  el.style.setProperty('--h', s.h);
  if (s.title) el.title = s.title;
}

/** Ajuste del retrato dentro de su zona: "contain" (ver entera) o "cover" (rellenar, con encuadre). */
export function applyPortraitFit(box, img, data) {
  const cover = data.portraitFit === 'cover';
  box.classList.toggle('cover', cover);
  box.classList.toggle('contain', !cover);
  const p = data.portraitPos || { x: 50, y: 50 };
  img.style.objectPosition = cover ? `${p.x}% ${p.y}%` : '50% 50%';
}

/**
 * Dibuja una página de una ficha en solo lectura dentro de `host`
 * (mismo aspecto que en la vista Fichas, pero sin poder modificar nada).
 * Solo usa elementos estáticos (sin inputs ni object-fit), así sirve igual para
 * el modo Ver del editor, la impresión y la exportación a PDF o imagen.
 * `host` debe estar ya en el documento para que se pueda ajustar la letra.
 */
export function renderReadOnly(host, page, data, portrait) {
  const out = [];
  for (const s of expandFields(page.fields)) {
    const v = getPath(data, s.f);
    const el = document.createElement('div');
    if (s.k === 'text') {
      el.className = 'tx';
      if (s.cls) el.classList.add(...s.cls.split(' '));
      el.textContent = v ?? '';
      el.dataset.fs = s.fs || Math.min(s.h * 0.72, 30);
    } else if (s.k === 'steps') {
      el.className = 'steps-ro';
      el.textContent = v ?? '';
    } else if (s.k === 'md') {
      el.className = 'md';
      el.innerHTML = renderMD(v || '');
    } else if (s.k === 'cb' || s.k === 'dot') {
      el.className = 'cbx' + (s.k === 'dot' ? ' dot' : '');
      el.textContent = v ? (s.k === 'dot' ? '●' : '✕') : '';
    } else if (s.k === 'portrait') {
      el.className = 'portrait-ro';
      if (portrait) {
        const cover = data.portraitFit === 'cover';
        const p = data.portraitPos || { x: 50, y: 50 };
        el.style.backgroundImage = `url("${portrait}")`;
        el.style.backgroundSize = cover ? 'cover' : 'contain';
        el.style.backgroundPosition = cover ? `${p.x}% ${p.y}%` : '50% 50%';
      }
    } else continue;
    place(el, s);
    host.appendChild(el);
    out.push([s, el]);
  }
  for (const [s, el] of out) {
    if (s.k === 'text') fitInput(el);
    else if (s.k === 'md') fitBox(el, s.fs || 13);
    else if (s.k === 'steps') fitBox(el, 13, 7);
  }
}
