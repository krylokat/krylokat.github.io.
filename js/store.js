/*
 * Хранилище данных прототипа «ПожЭксперт+».
 * Таблицы (users, clients, projects, stages, documents, versions, reviews, remarks,
 * notifications, audit, aiArchive, aiFeedback) хранятся в localStorage браузера в виде JSON.
 * Файлы документов хранятся отдельно — в IndexedDB (в БД лежат только метаданные и ключ файла).
 * Так приложение работает на статическом хостинге (GitHub Pages) без сервера и без MySQL.
 */
(function () {
  'use strict';
  const DB_KEY = 'pozhexpert_db_v1';
  const SESSION_KEY = 'pozhexpert_session';
  const THEME_KEY = 'pozhexpert_theme';

  /* ---------- SHA-256 (чистый JS, работает и на https, и при открытии файла с диска) ---------- */
  function sha256(ascii) {
    function rightRotate(v, a) { return (v >>> a) | (v << (32 - a)); }
    const maxWord = Math.pow(2, 32);
    let result = '';
    const words = [];
    const asciiBitLength = ascii.length * 8;
    const hash = [], k = [];
    let primeCounter = 0;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, .5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (let i = 0; i < ascii.length; i++) {
      const j = ascii.charCodeAt(i);
      if (j >> 8) return null;
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength);
    let H = hash.slice(0, 8);
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, j += 16);
      const oldHash = H;
      H = H.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = H[0], e = H[4];
        const temp1 = H[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & H[5]) ^ ((~e) & H[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
        const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & H[1]) ^ (a & H[2]) ^ (H[1] & H[2]));
        H = [(temp1 + temp2) | 0].concat(H);
        H[4] = (H[4] + temp1) | 0;
      }
      for (let i = 0; i < 8; i++) H[i] = (H[i] + oldHash[i]) | 0;
    }
    for (let i = 0; i < 8; i++) for (let j = 3; j + 1; j--) { const b = (H[i] >> (j * 8)) & 255; result += ((b < 16) ? 0 : '') + b.toString(16); }
    return result;
  }
  function utf8(s) { return unescape(encodeURIComponent(s)); }
  /** Стойкий хеш пароля: соль + многократное хеширование (растяжение ключа). */
  function hashPassword(password, salt) {
    let h = sha256(utf8(salt + ':' + password));
    for (let i = 0; i < 2000; i++) h = sha256(h + salt);
    return h;
  }
  function newSalt() {
    const a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- Основная БД в localStorage ---------- */
  let db = null;
  function load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      db = raw ? JSON.parse(raw) : null;
    } catch (e) { db = null; }
    if (!db || !db.meta || db.meta.version !== 1) {
      db = window.PozhSeed.build();
      save();
    }
    return db;
  }
  function save() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
    catch (e) { console.error(e); alert('Не удалось сохранить данные: хранилище браузера переполнено.'); }
  }
  function reset() {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(SESSION_KEY);
    return Files.clear().then(() => { db = null; load(); });
  }
  function nextId(table) {
    db.meta.seq[table] = (db.meta.seq[table] || 0) + 1;
    return db.meta.seq[table];
  }
  function exportJson() { return JSON.stringify(db, null, 2); }
  function importJson(text) {
    const data = JSON.parse(text);
    if (!data.meta || !Array.isArray(data.users)) throw new Error('Файл не похож на резервную копию ПожЭксперт+');
    db = data; save();
  }

  /* ---------- Файлы в IndexedDB ---------- */
  const Files = (function () {
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('IndexedDB недоступна')); return; }
        const r = indexedDB.open('pozhexpert_files', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('files');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      return dbp;
    }
    function tx(mode, fn) {
      return open().then(idb => new Promise((resolve, reject) => {
        const t = idb.transaction('files', mode);
        const st = t.objectStore('files');
        const req = fn(st);
        t.oncomplete = () => resolve(req && req.result);
        t.onerror = () => reject(t.error);
      }));
    }
    return {
      put: (key, blob) => tx('readwrite', st => st.put(blob, key)),
      get: (key) => tx('readonly', st => st.get(key)),
      clear: () => tx('readwrite', st => st.clear()).catch(() => null),
      allKeys: () => tx('readonly', st => st.getAllKeys())
    };
  })();

  /* ---------- Сессия и тема ---------- */
  const Session = {
    get() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } },
    set(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); },
    clear() { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); }
  };
  const Theme = {
    get() { return localStorage.getItem(THEME_KEY) || 'light'; },
    set(t) { localStorage.setItem(THEME_KEY, t); document.documentElement.setAttribute('data-theme', t); },
    apply() { document.documentElement.setAttribute('data-theme', this.get()); }
  };

  window.PozhStore = {
    get db() { return db; }, load, save, reset, nextId, exportJson, importJson,
    hashPassword, newSalt, Files, Session, Theme
  };
})();
