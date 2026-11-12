/* Web kipi (GitHub Pages / PWA): sunucu yoktur. Uygulamanın /api çağrıları burada karşılanır.
   - Dosyalar tarayıcı veritabanında (IndexedDB) depodaki yollarla durur: projects/<proje>/..., tools/sablon-layout-veri.json, tools/ayarlar.json
   - Veritabanı: özel GitHub deposu (layoutx-veri) ile eşitleme; layout_db.py ile aynı kurallar
     (üç yollu karşılaştırma, tek commit, dal başı yalnız ileri, yeni olan asıl dosya + .catisma kopyası, silme–düzenlemede düzenleme kalır).
   - STEP okuma ve görünüm üretme masaüstü uygulamasındadır; görünümler veritabanından hazır gelir.
   Masaüstünde (Python sunucusu) bu dosya hiçbir şey yapmaz. */

const LayoutWeb = (() => {
  const meta = document.querySelector('meta[name="layoutx-mode"]');
  // web kipi: Pages yapısı (meta), ?web=1 ya da masaüstü sunucusu (127.0.0.1) dışındaki her http(s) adresi
  const active = !!(meta && meta.content === 'web') || /[?&]web=1/.test(location.search) ||
    (/^https?:$/.test(location.protocol) && !/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname));
  const TOP_FILES = ['tools/sablon-layout-veri.json', 'tools/ayarlar.json'];
  const OUTPUT_RE = /-Layout(-[A-Z]{2})*(-secim)?\.(pdf|html)$/i;
  const MAX_BYTES = 50 * 1024 * 1024;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const TRMAP = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U', â: 'a', î: 'i', û: 'u', Â: 'A', Î: 'I', Û: 'U' };
  const ascii = (s) => String(s || '').replace(/[çğıöşüÇĞİÖŞÜâîûÂÎÛ]/g, (c) => TRMAP[c] || c);
  const slug = (s) => ascii(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').trim().replace(/^\.+|\.+$/g, '').trim();
  const t = (s, p) => (typeof t_ === 'function' ? t_(s, p) : s);
  const err = (m) => new Error(m);

  /* ─────────────── IndexedDB ─────────────── */
  let dbp = null;
  function idb() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const r = indexedDB.open('layoutx-veri', 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore('files', { keyPath: 'path' });
          r.result.createObjectStore('meta');
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    }
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await idb();
    return new Promise((resolve, reject) => {
      const x = d.transaction(store, mode);
      const s = x.objectStore(store);
      let out;
      Promise.resolve(fn(s)).then((v) => { out = v; });
      x.oncomplete = () => resolve(out);
      x.onerror = () => reject(x.error);
    });
  }
  const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const getFile = (path) => tx('files', 'readonly', (s) => req(s.get(path)));
  const allFiles = () => tx('files', 'readonly', (s) => req(s.getAll()));
  const delFile = (path) => tx('files', 'readwrite', (s) => req(s.delete(path)));
  const getMeta = (k) => tx('meta', 'readonly', (s) => req(s.get(k)));
  const setMeta = (k, v) => tx('meta', 'readwrite', (s) => req(s.put(v, k)));

  async function gitSha(bytes) {
    const head = enc.encode(`blob ${bytes.byteLength}\0`);
    const all = new Uint8Array(head.length + bytes.byteLength);
    all.set(head, 0);
    all.set(new Uint8Array(bytes), head.length);
    const h = await crypto.subtle.digest('SHA-1', all);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function putFile(path, bytes, mtime) {
    const b = bytes instanceof ArrayBuffer ? bytes : (bytes.buffer ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes);
    const rec = { path, bytes: b, mtime: mtime || Date.now(), sha: await gitSha(b), size: b.byteLength };
    await tx('files', 'readwrite', (s) => req(s.put(rec)));
    urlCache.delete(path);
    return rec;
  }
  const json = (obj) => enc.encode(JSON.stringify(obj, null, 2) + '\n');
  async function readJson(path) {
    const r = await getFile(path);
    return r ? JSON.parse(dec.decode(r.bytes)) : null;
  }

  /* Dosya bağlantıları (resim, PDF): nesne adresi, dosya değişince yenilenir */
  const urlCache = new Map();
  function urlFor(rec) {
    const c = urlCache.get(rec.path);
    if (c && c.sha === rec.sha) return c.url;
    if (c) URL.revokeObjectURL(c.url);
    const ext = rec.path.split('.').pop().toLowerCase();
    const type = { png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', pdf: 'application/pdf', json: 'application/json', html: 'text/html' }[ext] || 'application/octet-stream';
    const url = URL.createObjectURL(new Blob([rec.bytes], { type }));
    urlCache.set(rec.path, { sha: rec.sha, url });
    return url;
  }

  /* ─────────────── Projeler ─────────────── */
  const projOf = (path) => (path.startsWith('projects/') ? path.split('/')[1] : null);
  async function projectFiles(name) {
    const pre = `projects/${name}/`;
    return (await allFiles()).filter((r) => r.path.startsWith(pre));
  }
  async function veriRec(name) {
    const pre = `projects/${name}/`;
    return (await projectFiles(name)).filter((r) => r.path.slice(pre.length).indexOf('/') < 0 && r.path.endsWith('-layout-veri.json'))
      .sort((a, b) => a.path.localeCompare(b.path))[0] || null;
  }
  async function template() {
    const t0 = await readJson('tools/sablon-layout-veri.json');
    if (t0) return t0;
    const r = await fetch('tools/sablon-layout-veri.json', { cache: 'no-store' });
    if (!r.ok) throw err(t('Şablon bulunamadı'));
    const data = await r.json();
    await putFile('tools/sablon-layout-veri.json', json(data));
    return data;
  }
  async function settings() {
    const s = (await readJson('tools/ayarlar.json')) || {};
    if (!['bant', 'ust', 'kose'].includes(s.kapakTasarimi)) s.kapakTasarimi = 'bant';
    return s;
  }
  function kindOf(rel) {
    const ext = rel.split('.').pop().toLowerCase();
    if (rel.startsWith('views/')) return 'view';
    return ext === 'pdf' ? 'pdf' : ext === 'html' ? 'html' : ext === 'json' ? 'data' : (ext === 'step' || ext === 'stp') ? 'step' : 'other';
  }
  async function summaries() {
    const all = await allFiles();
    const names = [...new Set(all.map((r) => projOf(r.path)).filter(Boolean))];
    const out = [];
    for (const name of names) {
      const files = all.filter((r) => r.path.startsWith(`projects/${name}/`));
      const vr = files.filter((r) => r.path.split('/').length === 3 && r.path.endsWith('-layout-veri.json')).sort((a, b) => a.path.localeCompare(b.path))[0];
      if (!vr) continue;
      let data = {};
      try { data = JSON.parse(dec.decode(vr.bytes)); } catch (e) { /* bozuk dosya */ }
      const m = data.makine || {};
      const views = files.some((r) => r.path.endsWith('/views/views_meta.json'));
      out.push({
        name, veri: true, meta: { seri_no: m.seri_no, musteri: m.musteri, model: m.model, tam_ad: m.tam_ad, rev: m.rev, tarih: m.tarih, firma: m.firma, hazirlayan: m.hazirlayan },
        step: '', stepSize: 0, views,
        pdfs: files.filter((r) => r.path.endsWith('.pdf')).map((r) => r.path.split('/').pop()),
        htmls: files.filter((r) => /-Layout.*\.html$/.test(r.path)).map((r) => r.path.split('/').pop()),
        doc: { exists: false },
        updated: Math.max(...files.map((r) => r.mtime)) / 1000, job: null
      });
    }
    return out.sort((a, b) => b.updated - a.updated);
  }
  async function detail(name) {
    const vr = await veriRec(name);
    if (!vr) throw err(t('proje yok'));
    const files = await projectFiles(name);
    const pre = `projects/${name}/`;
    const find = (rel) => files.find((r) => r.path === pre + rel);
    const vm = find('views/views_meta.json');
    const cfg = find('views_cfg.json');
    const s = (await summaries()).find((p) => p.name === name) || {};
    return Object.assign(s, {
      data: JSON.parse(dec.decode(vr.bytes)), veriFile: vr.path.split('/').pop(), veriMtime: vr.mtime / 1000,
      views_meta: vm ? JSON.parse(dec.decode(vm.bytes)) : null, cfg: cfg ? JSON.parse(dec.decode(cfg.bytes)) : null,
      files: files.map((r) => {
        const rel = r.path.slice(pre.length);
        return { name: rel, kind: kindOf(rel), size: r.size || r.bytes.byteLength, mtime: r.mtime / 1000, url: urlFor(r) };
      }).filter((f) => f.kind !== 'view' || f.name.endsWith('.png') || f.name.endsWith('.json')),
      preview: false
    });
  }

  /** Görünüm resimleri (data URI) – belge üretici için */
  async function images(name, views) {
    const out = {};
    const pre = `projects/${name}/views/`;
    for (const v of Object.values(views || {})) {
      if (!v || !v.png || out[v.png]) continue;
      const r = await getFile(pre + v.png);
      if (r) out[v.png] = await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.readAsDataURL(new Blob([r.bytes], { type: 'image/png' }));
      });
    }
    return out;
  }

  function dataFromCopy(src) {
    const data = JSON.parse(JSON.stringify(src));
    const g = data.geometri || {};
    try {
      const [ox, oy, oz] = g.origin;
      const L = g.boy || 1;
      const W = g.en || 1;
      const H = g.yukseklik || 1;
      Object.values(g.noktalar || {}).forEach((p) => {
        if (['x', 'y', 'z'].every((k) => k in p)) {
          p.rel = [+((p.x - ox) / L).toFixed(4), +((p.y - oy) / W).toFixed(4), +((p.z - oz) / H).toFixed(4)];
          delete p.x; delete p.y; delete p.z;
        }
      });
    } catch (e) { /* ölçüsüz kaynak */ }
    ['ek_olculer_ust', 'ek_olculer_on', 'ek_olculer_yan', 'ek_olculer_arka', 'etiketler_ust', 'etiketler_arka'].forEach((k) => { if (k in g) g[k] = []; });
    ['origin', 'boy', 'en', 'yukseklik', 'zemin_model_y', 'eksen'].forEach((k) => delete g[k]);
    (data.detaylar || []).forEach((d) => { delete d.etiketler; delete d.gorunum; });
    data.makine.revizyonlar = [];
    return data;
  }

  async function create(body) {
    const m = body.makine || {};
    const seri = safe(m.seri_no);
    const musteri = safe(m.musteri);
    const model = safe(m.model);
    if (!seri || !musteri || !model) throw err(t('Seri no, müşteri ve model gerekli'));
    const name = safe(`${seri}-${ascii(musteri).toUpperCase()}-${model}`);
    if (await veriRec(name)) throw err(t('Bu proje zaten var: {n}', { n: name }));
    let data;
    if (body.kopya) {
      const src = await veriRec(body.kopya);
      if (!src) throw err(t('Kopyalanacak proje bulunamadı'));
      data = dataFromCopy(JSON.parse(dec.decode(src.bytes)));
    } else data = JSON.parse(JSON.stringify(await template()));
    const mk = data.makine = data.makine || {};
    ['seri_no', 'musteri', 'model', 'tam_ad', 'firma', 'hazirlayan', 'kontrol', 'onay', 'tarih', 'rev'].forEach((k) => {
      if (m[k] != null && m[k] !== '') mk[k] = m[k];
    });
    Object.assign(mk, { seri_no: seri, model, musteri: String(m.musteri).trim(), proje: name, dosya_adi: `${slug(`${seri}-${ascii(musteri).toUpperCase()}-${model}`)}-Layout` });
    if (!mk.firma) mk.firma = 'DOLFIN';
    if (!mk.rev) mk.rev = '00';
    if (!mk.tarih) {
      const d = new Date();
      mk.tarih = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    }
    ['kontrol', 'onay'].forEach((k) => { if (mk[k] == null) mk[k] = ''; });
    if (!mk.revizyonlar) mk.revizyonlar = [];
    mk.kaynak_step = '';
    delete data._yorum;
    const out = Object.assign({ _yorum: `${name} yerleşim planı (layout) verisi.` }, data);
    await putFile(`projects/${name}/${slug(name).toLowerCase()}-layout-veri.json`, json(out));
    Sync.trigger();
    return { ok: true, name };
  }

  async function save(body) {
    const vr = await veriRec(body.name);
    if (!vr) throw err(t('proje yok'));
    if (!body.data || !body.data.makine || !body.data.geometri) throw err(t('veri eksik'));
    let conflict = null;
    if (typeof body.base === 'number' && body.base > 0 && vr.mtime / 1000 > body.base + 0.002) {
      conflict = `${vr.path.split('/').pop()}.catisma-${stamp(vr.mtime / 1000)}`;
      await putFile(`projects/${body.name}/${conflict}`, vr.bytes, vr.mtime);
    }
    const rec = await putFile(vr.path, json(body.data));
    Sync.trigger();
    return { ok: true, mtime: rec.mtime / 1000, conflict };
  }

  async function upload(name, kind, file) {
    const low = file.name.toLowerCase();
    if (kind === 'step' || low.endsWith('.step') || low.endsWith('.stp')) {
      throw err(t('STEP okuma ve görünüm üretme masaüstü uygulamasında yapılır (Python, OpenCASCADE). Görünümler masaüstünde üretilince veritabanından buraya gelir.'));
    }
    if (!low.endsWith('.pdf')) throw err(t('PDF dosyası seçin'));
    if (file.size > MAX_BYTES) throw err(t('Dosya çok büyük (en çok 50 MB)'));
    await putFile(`projects/${name}/${safe(file.name)}`, await file.arrayBuffer());
    Sync.trigger();
    return { ok: true, name: file.name };
  }

  /** Dışa aktarılan HTML'i proje dosyalarına da koyar (veritabanına girmez: çıktılar eşitlenmez) */
  async function saveOutput(name, file, text) {
    await putFile(`projects/${name}/${file}`, enc.encode(text));
  }

  function stamp(ts) {
    const d = new Date(ts * 1000);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  /* ─────────────── GitHub deposu ─────────────── */
  function apiBase() {
    try {
      const o = localStorage.getItem('layoutx-github-api');      // yalnız yerel test sunucusu için
      if (o && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o)) return o;
    } catch (e) { /* yok */ }
    return 'https://api.github.com';
  }
  class GHError extends Error {
    constructor(m, o) {
      super(m);
      Object.assign(this, o || {});
    }
  }
  function b64(bytes) {
    const u = new Uint8Array(bytes);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(text) {
    const bin = atob(String(text).replace(/\s/g, ''));
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) u[i] = bin.charCodeAt(i);
    return u;
  }
  function remote(repo, token) {
    const [owner, name] = String(repo || '').trim().split('/');
    if (!owner || !name) throw new GHError(t('Depo adı kullanici/depo biçiminde olmalı'));
    const base = `${apiBase()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    let branch = null;
    async function send(method, path, body, allow) {
      let r;
      try {
        r = await fetch(base + path, {
          method, cache: 'no-store',
          headers: Object.assign({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
            token ? { Authorization: `Bearer ${token}` } : {}, body ? { 'Content-Type': 'application/json' } : {}),
          body: body ? JSON.stringify(body) : undefined
        });
      } catch (e) {
        throw new GHError(t('İnternet bağlantısı yok ya da GitHub\'a ulaşılamıyor. Değişiklikler bu tarayıcıda bekliyor.'), { offline: true });
      }
      if (allow && allow.includes(r.status)) return null;
      if (!r.ok) {
        let detail = '';
        try { detail = (await r.json()).message || ''; } catch (e) { /* gövde yok */ }
        const retry = Number(r.headers.get('retry-after')) || 0;
        const limited = retry > 0 || r.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(detail);
        if (r.status === 401) throw new GHError(t('GitHub erişim anahtarı geçersiz ya da süresi dolmuş. Veritabanı sekmesinden yenileyin.'), { auth: true });
        if ((r.status === 403 || r.status === 429) && limited) throw new GHError(t('GitHub hız sınırına ulaşıldı. Değişiklikler bekliyor, kendiliğinden gönderilecek.'), { retryAfter: retry || 60 });
        if (r.status === 403) throw new GHError(t('Erişim anahtarının bu depoya yazma izni yok (Contents: Read and write gerekli).'), { auth: true });
        if (r.status === 404) throw new GHError(t('Depo bulunamadı ya da erişim anahtarının bu depoya izni yok.'), { auth: true });
        if (r.status >= 500) throw new GHError(t('GitHub şu an yanıt vermiyor. Değişiklikler bekliyor.'), { offline: true });
        throw new GHError(`GitHub ${r.status}: ${detail}`);
      }
      const txt = await r.text();
      return txt ? JSON.parse(txt) : null;
    }
    async function info() {
      const d = await send('GET', '');
      branch = d.default_branch || 'main';
      return { private: !!d.private, push: d.permissions ? d.permissions.push : null, full: d.full_name || `${owner}/${name}` };
    }
    const br = async () => branch || (await info(), branch);
    return {
      repo: `${owner}/${name}`, info,
      async headSha() {
        const d = await send('GET', `/git/ref/heads/${await br()}`, null, [404, 409]);
        return d ? d.object.sha : null;
      },
      async commitInfo(sha) {
        const d = await send('GET', `/git/commits/${sha}`);
        return { sha, tree: d.tree.sha, at: Date.parse(d.committer.date) / 1000 };
      },
      async tree(sha) {
        const d = await send('GET', `/git/trees/${sha}?recursive=1`);
        if (d.truncated) throw new GHError(t('Depo bir seferde okunamayacak kadar büyük'));
        const m = {};
        (d.tree || []).forEach((e) => { if (e.type === 'blob') m[e.path] = e.sha; });
        return m;
      },
      async blob(sha) {
        const d = await send('GET', `/git/blobs/${sha}`);
        const bytes = unb64(d.content);
        if (await gitSha(bytes.buffer) !== sha) throw new GHError(t('Depodan gelen dosya bozuk, yeniden denenecek'), { offline: true });
        return bytes.buffer;
      },
      async init() {
        const text = '# LayoutX veri deposu\n\nBu depo Layout Çizim Motoru tarafından yönetilir (projeler, görünümler, şablon).\nDosyaları elle değiştirmeyin; eski sürümler commit geçmişindedir.\n';
        await send('PUT', '/contents/README.md', { message: 'LayoutX veri deposu', content: b64(enc.encode(text)) });
      },
      async postBlob(bytes) {
        return (await send('POST', '/git/blobs', { content: b64(bytes), encoding: 'base64' })).sha;
      },
      async commit(head, rows, message) {
        const tr = await send('POST', '/git/trees', { base_tree: head.tree, tree: rows });
        const c = await send('POST', '/git/commits', { message, tree: tr.sha, parents: [head.sha] });
        const moved = await send('PATCH', `/git/refs/heads/${await br()}`, { sha: c.sha, force: false }, [409, 422]);
        if (!moved) throw new GHError('Depo arada değişti', { conflict: true });
        return { sha: c.sha, tree: tr.sha, at: Date.now() / 1000 };
      }
    };
  }

  function tracked(rel) {
    if (TOP_FILES.includes(rel)) return true;
    const parts = rel.split('/');
    if (parts[0] !== 'projects' || parts.length < 3) return false;
    if (parts.slice(1).some((p) => p === '_work' || p.startsWith('.'))) return false;
    const low = rel.toLowerCase();
    if (/\.(step|stp|tmp|log)$/.test(low) || OUTPUT_RE.test(rel)) return false;
    return true;
  }

  const Sync = (() => {
    let state = null;
    let busy = false;
    let running = null;
    let timer = null;
    let rev = 0;
    const changed = {};
    const load = async () => { if (!state) state = (await getMeta('db')) || {}; return state; };
    const persist = () => setMeta('db', state);
    const connected = () => !!(state && state.repo && state.token);

    async function localMap() {
      const out = {};
      const skipped = [];
      (await allFiles()).forEach((r) => {
        if (!tracked(r.path)) return;
        if ((r.size || r.bytes.byteLength) > MAX_BYTES) skipped.push(r.path);
        else out[r.path] = r;
      });
      return { out, skipped };
    }
    async function pending() {
      const { out } = await localMap();
      const base = state.base || {};
      return [...new Set([...Object.keys(out), ...Object.keys(base)])].filter((p) => (out[p] ? out[p].sha : undefined) !== base[p]).length;
    }
    async function status() {
      await load();
      const s = state;
      return {
        connected: connected(), repo: s.repo || '', private: s.private, busy, last: s.last || 0, error: s.error || '', auth: !!s.authError,
        files: Object.keys(s.base || {}).length, skipped: s.skipped || [], conflicts: (s.conflicts || []).slice(-10),
        machine: t('Bu tarayıcı'), rev, changed: Object.assign({}, changed), web: true,
        pending: connected() ? await pending() : 0
      };
    }
    async function exchange(R) {
      let headSha = await R.headSha();
      if (!headSha) {
        await R.init();
        headSha = await R.headSha();
      }
      const known = state.head || {};
      const base = Object.assign({}, state.base || {});
      const { out: mine, skipped } = await localMap();
      state.skipped = skipped;
      const mineSha = Object.fromEntries(Object.entries(mine).map(([p, r]) => [p, r.sha]));
      const same = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);
      if (known.sha === headSha && same(mineSha, base)) return;
      let head = await R.commitInfo(headSha);
      const theirs = (known.sha === headSha && known.treeMap) ? Object.assign({}, known.treeMap)
        : Object.fromEntries(Object.entries(await R.tree(head.tree)).filter(([p]) => tracked(p)));
      const uploads = [];
      const removes = [];
      const got = [];
      const conflicts = [];
      const write = async (path, bytes, at) => { await putFile(path, bytes, at ? at * 1000 : undefined); got.push(path); };
      for (const path of [...new Set([...Object.keys(theirs), ...Object.keys(mineSha), ...Object.keys(base)])].sort()) {
        const tt = theirs[path];
        const m = mineSha[path];
        const b = base[path];
        if (tt === m) {
          if (tt === undefined) delete base[path]; else base[path] = tt;
          continue;
        }
        if (m === b) {
          if (tt === undefined) {
            await delFile(path);
            delete base[path];
            got.push(path);
          } else {
            const now = await getFile(path);
            if ((now ? now.sha : undefined) !== m) continue;   // arada kaydedildi: sonraki eşitlemede birleşir
            await write(path, await R.blob(tt));
            base[path] = tt;
          }
        } else if (tt === b) {
          if (m === undefined) removes.push(path); else uploads.push(path);
        } else if (tt === undefined) uploads.push(path);
        else if (m === undefined) {
          await write(path, await R.blob(tt));
          base[path] = tt;
        } else {
          const theirsBytes = await R.blob(tt);
          const localAt = mine[path].mtime / 1000;
          let loser;
          let loserAt;
          if (head.at > localAt) {
            loser = mine[path].bytes;
            loserAt = localAt;
            await write(path, theirsBytes);
            base[path] = tt;
          } else {
            loser = theirsBytes;
            loserAt = head.at;
            uploads.push(path);
          }
          const copy = `${path}.catisma-${stamp(loserAt)}`;
          await putFile(copy, loser);
          uploads.push(copy);
          conflicts.push(copy);
        }
      }
      if (uploads.length || removes.length) {
        const rows = [];
        let n = 0;
        for (const path of uploads) {
          const r = await getFile(path);
          if (!r) continue;
          if (theirs[path] !== r.sha) {
            rows.push({ path, mode: '100644', type: 'blob', sha: await R.postBlob(r.bytes) });
            n += 1;
            if (n > 40) await new Promise((res) => setTimeout(res, 750));
          }
          base[path] = r.sha;
        }
        removes.forEach((path) => {
          if (path in theirs) rows.push({ path, mode: '100644', type: 'blob', sha: null });
          delete base[path];
        });
        if (rows.length) {
          head = await R.commit(head, rows, `LayoutX: ${rows.length} dosya (web)`);
          rows.forEach((r) => { if (r.sha === null) delete theirs[r.path]; else theirs[r.path] = r.sha; });
        }
      }
      state.base = base;
      state.head = { sha: head.sha, at: head.at, treeMap: theirs };
      if (conflicts.length) state.conflicts = (state.conflicts || []).concat(conflicts);
      if (got.length) {
        rev += 1;
        got.forEach((p) => { const n = projOf(p); if (n) changed[n] = rev; });
      }
    }
    async function sync() {
      await load();
      if (!connected()) return status();
      if (running) return running;
      running = (async () => {
        busy = true;
        try {
          const R = remote(state.repo, state.token);
          for (let i = 0; i < 4; i += 1) {
            try {
              await exchange(R);
              break;
            } catch (e) {
              if (e.conflict && i < 3) continue;
              throw e;
            }
          }
          Object.assign(state, { error: '', authError: false, last: Date.now() / 1000, retryAt: 0 });
        } catch (e) {
          Object.assign(state, { error: e.message, authError: !!e.auth, retryAt: Date.now() / 1000 + (e.retryAfter || (e.auth ? 300 : 60)) });
        } finally {
          busy = false;
          await persist();
          running = null;
        }
        return status();
      })();
      return running;
    }
    function trigger(delay) {
      if (!connected()) return;
      clearTimeout(timer);
      timer = setTimeout(() => sync(), delay == null ? 8000 : delay);
    }
    async function connect(repo, token) {
      await load();
      token = String(token || '').trim() || state.token || '';
      if (!token) throw err(t('Erişim anahtarı gerekli'));
      const R = remote(repo, token);
      const info = await R.info();
      if (!info.private) throw err(t('Depo herkese açık. Müşteri verisi içerdiği için yalnız özel (private) depoya bağlanılır.'));
      if (info.push === false) throw err(t('Erişim anahtarının bu depoya yazma izni yok (Contents: Read and write gerekli).'));
      const same = state.repo === R.repo;
      state = Object.assign(same ? state : {}, { repo: R.repo, token, private: true, error: '', authError: false });
      await persist();
      trigger(0);
      const st = await status();
      st.busy = true;
      return st;
    }
    async function disconnect() {
      await load();
      state = { repo: state.repo };
      await persist();
      return status();
    }
    async function start() {
      await load();
      setInterval(() => { if (connected() && (state.retryAt || 0) <= Date.now() / 1000) sync(); }, 60000);
      if (connected()) trigger(1500);
    }
    return { status, sync, trigger, connect, disconnect, start, isBusy: () => busy };
  })();

  /* ─────────────── /api karşılığı ─────────────── */
  async function handle(method, url, body) {
    const u = new URL(url, location.href);
    const p = u.pathname.replace(/^.*\/api\//, '/api/');
    const q = (k) => u.searchParams.get(k) || '';
    const desktopOnly = () => { throw err(t('Bu işlem masaüstü uygulamasında yapılır (STEP okuma ve görünüm üretme Python ister). Görünümler masaüstünde üretilince veritabanından buraya gelir.')); };
    if (method === 'GET') {
      if (p === '/api/projects') return summaries();
      if (p === '/api/project') return detail(q('name'));
      if (p === '/api/template') return template();
      if (p === '/api/settings') return settings();
      if (p === '/api/status') return { state: 'idle', log: [], step: '' };
      if (p === '/api/db') return Sync.status();
      if (p === '/api/ping') return { app: 'layoutx', ok: true, web: true, db: await Sync.status() };
    }
    if (method === 'PUT') {
      if (p === '/api/template') {
        await putFile('tools/sablon-layout-veri.json', json(body));
        Sync.trigger();
        return { ok: true };
      }
      if (p === '/api/settings') {
        const s = await settings();
        if (['bant', 'ust', 'kose'].includes(body && body.kapakTasarimi)) s.kapakTasarimi = body.kapakTasarimi;
        await putFile('tools/ayarlar.json', json(s));
        Sync.trigger();
        return s;
      }
    }
    if (method === 'POST') {
      if (p === '/api/create') return create(body || {});
      if (p === '/api/save') return save(body || {});
      if (p === '/api/pipeline' || p === '/api/open' || p === '/api/print') return desktopOnly();
      if (p === '/api/db/connect') return Sync.connect(body.repo, body.token);
      if (p === '/api/db/sync') { Sync.trigger(0); const s = await Sync.status(); s.busy = true; return s; }
      if (p === '/api/db/disconnect') return Sync.disconnect();
      if (p === '/api/bye') return { ok: true };
    }
    throw err(`${method} ${p}: yok`);
  }

  if (active) Sync.start();
  return { active, handle, upload, images, saveOutput, Sync, tracked };
})();
