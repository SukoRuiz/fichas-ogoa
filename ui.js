/* Piezas de interfaz compartidas: ventana de pregunta con varias opciones. */

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Pregunta con botones. Devuelve una promesa con { v, all }:
 *   v   el valor del botón pulsado (o `cancel` si se cierra con Esc / ✕)
 *   all si estaba marcada la casilla "aplicar a los siguientes" (solo con `remember`)
 *
 * ask({ title, html, buttons: [{ v, label, primary?, danger? }], cancel, remember: 'texto' })
 */
export function ask({ title, html = '', buttons, cancel = null, remember = '' }) {
  const host = document.getElementById('dialog');
  return new Promise(resolve => {
    host.innerHTML = `
    <div class="modal-card ask-card" role="alertdialog" aria-modal="true" aria-labelledby="ask-title">
      <div class="modal-head">
        <h2 id="ask-title">${esc(title)}</h2>
        <button type="button" class="close" data-v="__cancel" title="Cerrar (Esc)">✕</button>
      </div>
      <div class="ask-body">${html}</div>
      ${remember ? `<label class="check ask-all"><input type="checkbox" id="ask-all"> ${esc(remember)}</label>` : ''}
      <div class="modal-foot"><span class="grow"></span>
        ${buttons.map((b, i) => `<button type="button" class="btn${b.primary ? ' primary' : ''}${b.danger ? ' danger' : ''}" data-v="${i}">${esc(b.label)}</button>`).join('')}
      </div>
    </div>`;
    const done = v => {
      const all = !!host.querySelector('#ask-all')?.checked;
      host.hidden = true;
      host.innerHTML = '';
      document.removeEventListener('keydown', onKey, true);
      resolve({ v, all });
    };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(cancel); } };
    document.addEventListener('keydown', onKey, true);
    host.onclick = e => {
      const b = e.target.closest('[data-v]');
      if (e.target === host) return done(cancel);
      if (!b) return;
      done(b.dataset.v === '__cancel' ? cancel : buttons[+b.dataset.v].v);
    };
    host.hidden = false;
    host.querySelector('.btn.primary, .modal-foot .btn')?.focus();
  });
}

/**
 * Decisiones repetidas en una importación: si el usuario marca "aplicar a los
 * siguientes", no se vuelve a preguntar para ese tipo de elemento.
 */
export function decider() {
  const fixed = new Map();
  return async (kind, opts) => {
    if (fixed.has(kind)) return fixed.get(kind);
    const { v, all } = await ask(opts);
    if (all) fixed.set(kind, v);
    return v;
  };
}

/** Descarga un archivo generado en el navegador. */
export function saveBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const slug = s => (s || 'ficha').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'ficha';
