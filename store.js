/* Almacenamiento de las fichas.
 *
 *  - Cloud: Firestore (Firebase). Es el almacenamiento principal.
 *      characters/{id}  -> { data, created_at, updated_at, updated_by }
 *                          data.player (nombre) y data.playerId (enlace a players)
 *      portraits/{id}   -> { img }   (retrato aparte para que la lista cargue rápido)
 *      players/{id}     -> { name, contact, notes, active, ...meta }
 *      campaigns/{id}   -> partidas: { name, status, members: [{playerId, characterId}], ... }
 *      sessions/{id}    -> sesiones de juego: { campaignId, date, horarios, attendance, ... }
 *  - LocalStore: la base de datos antigua del navegador (IndexedDB). Solo se usa
 *    para subir a la nube las fichas que se crearon antes de usar Firebase.
 */
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, writeBatch, updateDoc,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const now = () => new Date().toISOString();
const who = () => auth.currentUser?.email || '';

/* ---------------- sesión ---------------- */
export const Auth = {
  onChange: cb => onAuthStateChanged(auth, cb),
  signIn() {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    return signInWithPopup(auth, p);
  },
  signOut: () => signOut(auth),
};

/* ---------------- Firestore ---------------- */
const CH = 'characters', PT = 'portraits';

export const Cloud = {
  async all() {
    const snap = await getDocs(collection(db, CH));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async get(id) {
    const [c, p] = await Promise.all([getDoc(doc(db, CH, id)), getDoc(doc(db, PT, id))]);
    if (!c.exists()) return null;
    return { id, ...c.data(), portrait: p.exists() ? p.data().img : null };
  },
  async create(data, portrait = null) {
    const ref = doc(collection(db, CH));
    const b = writeBatch(db);
    b.set(ref, { data, created_at: now(), updated_at: now(), updated_by: who() });
    if (portrait) b.set(doc(db, PT, ref.id), { img: portrait });
    await b.commit();
    return { id: ref.id, data, portrait };
  },
  async update(id, patch) {
    const b = writeBatch(db);
    const meta = { updated_at: now(), updated_by: who() };
    if ('data' in patch) meta.data = patch.data;
    b.update(doc(db, CH, id), meta);
    if ('portrait' in patch) {
      if (patch.portrait) b.set(doc(db, PT, id), { img: patch.portrait });
      else b.delete(doc(db, PT, id));
    }
    await b.commit();
  },
  async remove(id) {
    const b = writeBatch(db);
    b.delete(doc(db, CH, id));
    b.delete(doc(db, PT, id));
    await b.commit();
  },
  /** Enlaza una ficha con un jugador sin tocar el resto de sus datos. */
  setPlayer(id, playerId, name) {
    return updateDoc(doc(db, CH, id), {
      'data.playerId': playerId || '', 'data.player': name || '', updated_at: now(), updated_by: who(),
    });
  },
};

/* ---------------- colecciones simples (jugadores, partidas, sesiones) ---------------- */
function collectionStore(name) {
  return {
    async all() {
      const snap = await getDocs(collection(db, name));
      return snap.docs.map(d => ({ ...d.data(), id: d.id }));
    },
    async create(obj) {
      const ref = doc(collection(db, name));
      const rec = { ...obj, created_at: now(), updated_at: now(), updated_by: who() };
      const b = writeBatch(db);
      b.set(ref, rec);
      await b.commit();
      return { ...rec, id: ref.id };
    },
    update(id, patch) {
      const { id: _drop, ...rest } = patch;
      return updateDoc(doc(db, name, id), { ...rest, updated_at: now(), updated_by: who() });
    },
    /** Borra varios documentos de una vez (lotes de 400). */
    async removeMany(ids) {
      for (let i = 0; i < ids.length; i += 400) {
        const b = writeBatch(db);
        for (const id of ids.slice(i, i + 400)) b.delete(doc(db, name, id));
        await b.commit();
      }
    },
    remove(id) { return this.removeMany([id]); },
  };
}
export const Players = collectionStore('players');
export const Campaigns = collectionStore('campaigns');
export const Sessions = collectionStore('sessions');

/* ---------------- IndexedDB antiguo (solo lectura, para migrar) ---------------- */
export const LocalStore = {
  all() {
    return new Promise(resolve => {
      let r;
      try { r = indexedDB.open('ogoa-fichas', 1); } catch { return resolve([]); }
      r.onupgradeneeded = () => r.result.createObjectStore('characters', { keyPath: 'id', autoIncrement: true });
      r.onerror = () => resolve([]);
      r.onsuccess = () => {
        try {
          const q = r.result.transaction('characters', 'readonly').objectStore('characters').getAll();
          q.onsuccess = () => resolve(q.result || []);
          q.onerror = () => resolve([]);
        } catch { resolve([]); }
      };
    });
  },
};
