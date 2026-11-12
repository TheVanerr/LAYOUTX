/* Layout Çizim Motoru – arayüz denetleyicisi.
   Ana ekran (projeler, şablon), yeni proje (kapak bilgileriyle), çalışma ekranı (solda bölümler, ortada belge,
   sağda düzenleme ve eksikler), otomatik kayıt, canlı önizleme, nokta yerleştirme, STEP boru hattı, pafta ve PDF.
   Program dili TR / EN / DE (t_), belge dili ayrı (üst çubuk). */

const LayoutApp = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => LayoutForm.esc(v);
  const S = LayoutSections;
  const B = LayoutBelge;
  const BRAND_COLOR = { DOLFIN: '#ff0000', ENVA: '#007938', VICO: '#C41E3A', KSYSTEM: '#1B04AE' };
  const AXES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
  const TRMAP = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U', â: 'a', î: 'i', û: 'u' };
  const ascii = (s) => String(s || '').replace(/[çğıöşüÇĞİÖŞÜâîû]/g, (c) => TRMAP[c] || c);
  const slug = (s) => ascii(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').trim();
  const fmtSize = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);
  const locale = () => ({ tr: 'tr-TR', en: 'en-GB', de: 'de-DE' }[LayoutI18n.lang] || 'tr-TR');
  const fmtTime = (t) => (t ? new Date(t * 1000).toLocaleString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const VIEW_NAMES = { top: 'üst', front: 'ön', rear: 'arka', side: 'yan', iso: 'izometrik' };
  const WEB = LayoutWeb.active;   // GitHub Pages / PWA: sunucu yok, veriler tarayıcıda + GitHub deposunda

  const state = {
    projects: [], issues: {},
    name: null, detail: null, data: null, template: false,
    section: 'kapak', lang: 'tr', mode: 'doc', rightTab: 'edit',
    dirty: false, saving: null, saveTimer: null, retryTimer: null, savedAt: null, saveError: null,
    previewTimer: null, previewBusy: false, previewAgain: false, previewOk: false, pageTotal: 0,
    history: [], future: [], snap: null, histTimer: null,
    checks: [], checkTimer: null, ui: { collapsed: new Set(), opened: new Set() },
    settings: { kapakTasarimi: 'bant' }, pickKey: null, jobTimer: null, online: true,
    db: null, dbRev: null, dbSeen: {}, dbTimer: null, dbForm: false, baseMtime: 0
  };

  /* ─────────────────────────── Yardımcılar ─────────────────────────── */

  async function api(method, url, body, raw) {
    if (WEB) return LayoutWeb.handle(method, url, body);
    let r;
    try {
      r = await fetch(url, {
        method,
        headers: raw ? {} : { 'Content-Type': 'application/json' },
        body: raw ? body : (body !== undefined ? JSON.stringify(body) : undefined)
      });
    } catch (e) {
      setOnline(false);
      throw new Error(t_('Uygulama sunucusuna ulaşılamıyor'));
    }
    setOnline(true);
    let j = null;
    try { j = await r.json(); } catch (e) { j = { error: r.statusText }; }
    if (!r.ok) throw new Error((j && j.error) || r.statusText);
    return j;
  }

  function setOnline(on) {
    if (state.online === on) return;
    state.online = on;
    $('offline').classList.toggle('hidden', on);
    if (on && state.dirty) saveNow();
  }

  async function heartbeat() {
    if (WEB) {
      onDbStatus(await LayoutWeb.Sync.status());
      return;
    }
    try {
      const r = await fetch('/api/ping', { cache: 'no-store' });
      setOnline(r.ok);
      if (r.ok) {
        const j = await r.json();
        if (j.db) onDbStatus(j.db);
      }
    } catch (e) {
      setOnline(false);
    }
  }

  /* ─────────────────────────── Veritabanı (GitHub deposu) ─────────────────────────── */

  function dbLevel(s) {
    if (!s || !s.connected) return '';
    if (s.error) return 'err';
    if (s.busy || s.pending) return 'busy';
    return 'ok';
  }

  function dbText(s) {
    if (!s || !s.connected) return t_('Veritabanı bağlı değil');
    if (s.busy) return t_('Eşitleniyor…');
    if (s.error) return t_('Eşitleme hatası');
    if (s.pending) return t_('{n} dosya gönderilecek', { n: s.pending });
    return s.last ? t_('Eşitlendi · {t}', { t: fmtTime(s.last) }) : t_('Eşitlenmedi');
  }

  /** Sunucudan gelen veritabanı durumu: göstergeler + başka bilgisayardan gelen değişiklikler */
  function onDbStatus(s) {
    const prev = state.db;
    state.db = s;
    const lvl = dbLevel(s);
    $('dbDot').className = `db-dot ${lvl}`;
    const chip = $('dbChip');
    chip.className = `db-chip ${lvl}`;
    chip.textContent = `☁ ${dbText(s)}`;
    chip.title = s && s.connected ? `${s.repo}${s.error ? ' · ' + s.error : ''}` : t_('Veritabanı sekmesinden GitHub deposuna bağlanın');
    if (!$('homeDb').classList.contains('hidden') && !state.dbForm) renderDb();
    if (state.dbRev === null) {
      state.dbRev = s.rev;
      state.dbSeen = Object.assign({}, s.changed || {});
    } else if (s.rev !== state.dbRev) {
      state.dbRev = s.rev;
      const ch = s.changed || {};
      if (!$('home').classList.contains('hidden')) renderProjects();
      else if (state.name && ch[state.name] && ch[state.name] !== state.dbSeen[state.name]) {
        if (!state.dirty && !state.saving) {
          reloadDetail(true);
          toast(t_('Başka bilgisayardaki değişiklikler alındı.'));
        } else {
          toast(t_('Bu projede başka bilgisayardan değişiklik geldi; kaydettiğinizde sizin sürümünüz asıl olur, gelen sürüm .catisma kopyası olarak saklanır.'), 'error');
        }
      }
      state.dbSeen = Object.assign({}, ch);
    }
    if (prev && prev.busy && !s.busy && s.error) toast(s.error, 'error');
    clearTimeout(state.dbTimer);
    if (s.busy) state.dbTimer = setTimeout(pollDb, 1500);
  }

  async function pollDb() {
    try { onDbStatus(await api('GET', '/api/db')); } catch (e) { /* bağlantı uyarısı ayrıca çıkar */ }
  }

  function selectHomeTab(tab) {
    document.querySelectorAll('.home-tab').forEach((b) => b.classList.toggle('active', b.dataset.homeTab === tab));
    $('homeProjects').classList.toggle('hidden', tab !== 'projects');
    $('homeDb').classList.toggle('hidden', tab !== 'db');
    $('projSearch').classList.toggle('hidden', tab !== 'projects');
    if (tab === 'db') {
      state.dbForm = !(state.db && state.db.connected);
      renderDb();
      pollDb();
    }
  }

  function renderDb() {
    const s = state.db || { connected: false };
    const L = (x, p) => esc(t_(x, p));
    const box = $('dbPanel');
    const synced = `<div class="db-cols">
      <div class="db-card"><h2>${L('Depoya girenler')}</h2><ul>
        <li>${L('Proje verileri (kapak, metinler, tablolar, bağlantı noktaları)')}</li>
        <li>${L('Görünümler (üst, ön, arka, yan, izometrik, yakın detaylar) ve görünüm ayarları')}</li>
        <li>${L('Montaj ağacı, imalat resmi PDF\'leri')}</li>
        <li>${L('Şablon ve kapak tasarımı')}</li></ul></div>
      <div class="db-card"><h2>${L('Depoya girmeyenler')}</h2><ul>
        <li>${L('STEP dosyaları (büyük; bilgisayarda kalır). Başka bilgisayarda görünümler hazır gelir.')}</li>
        <li>${L('Ara dosyalar (_work) ve indirilen PDF / HTML çıktıları')}</li>
        <li>${L('50 MB üstü dosyalar')}</li>
        <li>${L('Erişim anahtarı (yalnız bu bilgisayarda saklanır)')}</li></ul></div></div>
      <div class="db-card"><h2>${L('Kayıt nasıl çalışır')}</h2><ul>
        <li>${L('Her değişiklik önce bu bilgisayardaki proje klasörüne yazılır; internet kesilse de kaybolmaz.')}</li>
        <li>${L('Değişenler birkaç saniye içinde, ayrıca dakikada bir tek commit olarak depoya gönderilir; depodaki yenilikler aynı anda alınır.')}</li>
        <li>${L('İki bilgisayarda aynı dosya değişirse yeni olan asıl dosya olur, eskisi yanında .catisma-<tarih> adıyla saklanır. Silme ile düzenleme karşılaşırsa düzenleme kalır.')}</li>
        <li>${L('Eski sürümler GitHub\'daki commit geçmişinden alınabilir.')}</li></ul></div>`;
    if (state.dbForm || !s.connected) {
      box.innerHTML = `<div class="db-card">
        <h2>${L('Verileriniz nerede dursun?')}</h2>
        <p>${L('Özel bir GitHub deposu veritabanı olur: ücretsizdir, her kayıt geçmişte durur, her bilgisayardan erişilir.')}</p>
        <ol>
          <li><a href="https://github.com/new?name=layoutx-veri&amp;visibility=private" target="_blank" rel="noopener">${L('Özel depo oluşturun')}</a> ${L('(layoutx-veri oluşturduysanız geçin).')}</li>
          <li><a href="https://github.com/settings/personal-access-tokens/new?name=LayoutX%20veri&amp;description=LayoutX%20veri%20deposu&amp;contents=write&amp;expires_in=365" target="_blank" rel="noopener">${L('Erişim anahtarı oluşturun')}</a>. ${L('"Only select repositories" altında yalnız bu depoyu seçin; Contents: Read and write.')}</li>
          <li>${WEB ? L('Anahtarı aşağıya yapıştırıp Bağlan deyin. Anahtar yalnız bu tarayıcıda saklanır, başka yere gönderilmez; yalnız bu depoya izinli olmalıdır.') : L('Anahtarı aşağıya yapıştırıp Bağlan deyin. Anahtar yalnız bu bilgisayarda saklanır, depoya ve tarayıcıya gitmez.')}</li>
        </ol>
        <form id="dbForm" class="db-form">
          <div class="field"><label for="dbRepo">${L('Depo (kullanıcı/depo)')}</label><input id="dbRepo" class="field-input" value="${esc(s.repo || 'TheVanerr/layoutx-veri')}" autocomplete="off" spellcheck="false"></div>
          <div class="field"><label for="dbToken">${L('Erişim anahtarı')}</label><input id="dbToken" class="field-input" type="password" autocomplete="off" spellcheck="false" placeholder="${s.connected ? esc(t_('Boş bırakılırsa mevcut anahtar kalır')) : 'github_pat_…'}"></div>
          <div class="insp-actions"><button type="submit" class="btn btn-primary" id="dbGo">${L('Bağlan')}</button>${s.connected ? `<button type="button" class="btn" id="dbCancel">${L('Vazgeç')}</button>` : ''}</div>
        </form>
        <div class="field-help" id="dbResult"></div>
      </div>${synced}`;
      $('dbForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        $('dbGo').disabled = true;
        $('dbResult').className = 'field-help';
        $('dbResult').textContent = t_('Deneniyor…');
        try {
          const st = await api('POST', '/api/db/connect', { repo: $('dbRepo').value.trim(), token: $('dbToken').value.trim() });
          state.dbForm = false;
          onDbStatus(st);
          renderDb();
          toast(t_('Bağlandı: {r}. İlk eşitleme başladı.', { r: st.repo }));
          setTimeout(pollDb, 800);
        } catch (err) {
          $('dbGo').disabled = false;
          $('dbResult').className = 'field-help warn';
          $('dbResult').textContent = err.message;
        }
      });
      if ($('dbCancel')) $('dbCancel').addEventListener('click', () => { state.dbForm = false; renderDb(); });
      return;
    }
    const lvl = dbLevel(s);
    const rows = [
      [t_('Durum'), dbText(s)],
      [t_('Son eşitleme'), s.last ? fmtTime(s.last) : '—'],
      [t_('Depodaki dosya'), String(s.files || 0)],
      [t_('Bu bilgisayar'), s.machine || '—']
    ];
    box.innerHTML = `<div class="db-card">
        <h2><span class="db-dot ${lvl}"></span>${L('GitHub deposu')}: ${esc(s.repo)}</h2>
        <p>${L('Özel depo. Projeler bu depodan her bilgisayara gelir; değişiklikler kendiliğinden gönderilir.')}</p>
        <dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        ${s.error ? `<p class="err">${esc(s.error)}</p>` : ''}
        ${(s.skipped || []).length ? `<p>${L('Depoya alınmayan büyük dosyalar (bilgisayarda kalır):')} ${esc(s.skipped.join(', '))}</p>` : ''}
        ${(s.conflicts || []).length ? `<p>${L('Çakışma kopyaları (eski sürümler, inceleyip silebilirsiniz):')} ${esc(s.conflicts.join(', '))}</p>` : ''}
        <div class="insp-actions">
          <button type="button" class="btn btn-primary" id="dbSync"${s.busy ? ' disabled' : ''}>${s.busy ? L('Eşitleniyor…') : L('Şimdi eşitle')}</button>
          <a class="btn" href="https://github.com/${esc(s.repo)}" target="_blank" rel="noopener" style="text-decoration:none">${L('GitHub\'da aç')}</a>
          <button type="button" class="btn" id="dbChange">${L('Depoyu ya da anahtarı değiştir')}</button>
          <button type="button" class="btn btn-danger" id="dbOff">${L('Bağlantıyı kaldır')}</button>
        </div>
      </div>${synced}`;
    $('dbSync').addEventListener('click', syncNow);
    $('dbChange').addEventListener('click', () => { state.dbForm = true; renderDb(); });
    $('dbOff').addEventListener('click', async () => {
      const ok = await confirmBox(t_('Bağlantıyı kaldır'), t_('Bu bilgisayar depoyla eşitlenmeyi bırakır ve erişim anahtarı silinir. Proje dosyaları ve depodaki veriler silinmez.'), t_('Bağlantıyı kaldır'));
      if (!ok) return;
      onDbStatus(await api('POST', '/api/db/disconnect', {}));
      state.dbForm = true;
      renderDb();
    });
  }

  async function syncNow() {
    if (!(state.db && state.db.connected)) {
      showHome().then(() => selectHomeTab('db'));
      return;
    }
    await flushSave();
    try {
      onDbStatus(Object.assign({}, await api('POST', '/api/db/sync', {}), { busy: true }));
    } catch (e) { toast(e.message, 'error'); }
  }

  let toastTimer = null;
  function toast(msg, type) {
    const el = $('toast');
    el.textContent = msg;
    el.className = `toast ${type || ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), type === 'error' ? 7000 : 3600);
  }

  function modal(html, cls) {
    const root = $('modalRoot');
    root.innerHTML = `<div class="modal-overlay"><div class="modal ${cls || ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    const m = root.querySelector('.modal');
    const first = m.querySelector('input:not([type=hidden]):not([type=checkbox]), select, textarea, button.btn-primary');
    if (first) setTimeout(() => first.focus(), 30);
    return m;
  }
  const closeModal = () => { $('modalRoot').innerHTML = ''; };
  const modalOpen = () => !!$('modalRoot').firstElementChild;

  function confirmBox(title, text, okLabel) {
    return new Promise((resolve) => {
      const m = modal(`<h2>${esc(title)}</h2><p class="modal-sub">${esc(text)}</p>
        <div class="modal-actions"><button type="button" class="btn" data-a="no">${esc(t_('Vazgeç'))}</button><button type="button" class="btn btn-primary" data-a="ok">${esc(okLabel || t_('Tamam'))}</button></div>`);
      m.addEventListener('click', (e) => {
        const a = e.target.dataset && e.target.dataset.a;
        if (!a) return;
        closeModal();
        resolve(a === 'ok');
      });
    });
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const i = document.createElement('input');
      i.type = 'file';
      i.accept = accept;
      i.addEventListener('change', () => resolve(i.files[0] || null));
      i.click();
    });
  }

  /** Büyük dosya yükleme (ilerleme çubuğuyla) */
  function upload(name, kind, file, onProgress) {
    if (WEB) return LayoutWeb.upload(name, kind, file);
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('PUT', `/api/upload?name=${encodeURIComponent(name)}&kind=${kind}&filename=${encodeURIComponent(file.name)}`);
      x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      x.onload = () => {
        let j = {};
        try { j = JSON.parse(x.responseText); } catch (e) { /* boş yanıt */ }
        if (x.status >= 200 && x.status < 300) resolve(j); else reject(new Error(j.error || x.statusText));
      };
      x.onerror = () => reject(new Error(t_('Bağlantı hatası (sunucu kapalı olabilir)')));
      x.send(file);
    });
  }

  const today = S.today;
  const derivedName = (m) => safe(`${(m.seri_no || '').trim()}-${ascii(S.txt(m.musteri)).toUpperCase().trim()}-${(m.model || '').trim()}`);
  const derivedFile = (m) => `${slug(`${m.seri_no || ''}-${ascii(S.txt(m.musteri)).toUpperCase()}-${m.model || ''}`)}-Layout`;
  const designName = () => t_((B.DESIGNS.find((d) => d.id === coverDesign()) || {}).name || '');

  /* ─────────────────────────── Ana ekran ─────────────────────────── */

  async function showHome() {
    await flushSave();
    stopJobPoll();
    LayoutStudio.close();
    state.name = null;
    state.detail = null;
    state.data = null;
    state.template = false;
    $('app').classList.add('hidden');
    $('home').classList.remove('hidden');
    document.title = t_('Layout Çizim Motoru');
    selectHomeTab('projects');
    await renderProjects();
  }

  async function renderProjects() {
    const list = $('projectList');
    try {
      state.projects = await api('GET', '/api/projects');
    } catch (e) {
      list.innerHTML = `<div class="home-empty">${esc(t_('Projeler okunamadı: {e}. Uygulamayı masaüstündeki "Layout Çizim Motoru" simgesiyle ya da index.html ile başlatın.', { e: e.message }))}</div>`;
      return;
    }
    $('projCount').textContent = state.projects.length || '';
    drawCards();
    loadIssueCounts();
  }

  function drawCards() {
    const list = $('projectList');
    const q = ascii($('projSearch').value).toLowerCase().trim();
    const rows = state.projects.filter((p) => !q || ascii([p.name, p.meta.seri_no, S.txt(p.meta.musteri), p.meta.model].join(' ')).toLowerCase().includes(q));
    if (!state.projects.length) {
      list.innerHTML = `<div class="home-empty">${esc(t_('Henüz proje yok. "+ Yeni Proje" ile kapak bilgilerini girerek başlayın.'))}</div>`;
      return;
    }
    if (!rows.length) {
      list.innerHTML = `<div class="home-empty">${esc(t_('Aramayla eşleşen proje yok.'))}</div>`;
      return;
    }
    list.innerHTML = rows.map((p) => {
      const m = p.meta;
      const chips = [];
      if (p.job === 'running') chips.push(`<span class="pc-chip warn">${esc(t_('İşlem sürüyor…'))}</span>`);
      chips.push(p.step ? `<span class="pc-chip has">STEP · ${fmtSize(p.stepSize)}</span>` : `<span class="pc-chip">${esc(t_('STEP yok'))}</span>`);
      chips.push(p.views ? `<span class="pc-chip has">${esc(t_('Görünümler'))}</span>` : `<span class="pc-chip">${esc(t_('Görünüm yok'))}</span>`);
      if (p.pdfs.length) chips.push(`<span class="pc-chip has">PDF · ${p.pdfs.length}</span>`);
      if ((p.htmls || []).length) chips.push(`<span class="pc-chip has">HTML · ${p.htmls.length}</span>`);
      const iss = state.issues[p.name];
      chips.push(`<span class="pc-chip ${iss ? (iss.error ? 'has' : iss.warn ? 'warn' : 'ok') : ''}" data-issues="${esc(p.name)}">${esc(iss ? issueText(iss) : t_('Eksikler…'))}</span>`);
      return `<button type="button" class="project-card" data-name="${esc(p.name)}" style="--brand:${BRAND_COLOR[m.firma] || BRAND_COLOR.DOLFIN}">
        <div class="pc-no">${esc(m.seri_no || '—')}</div>
        <div class="pc-model">${esc(m.model || p.name)}</div>
        <div class="pc-customer">${esc(S.txt(m.musteri))}${S.txt(m.tam_ad) ? ' · ' + esc(S.txt(m.tam_ad)) : ''}</div>
        <div class="pc-chips">${chips.join('')}</div>
        <div class="pc-meta">${esc(t_('Rev.'))} ${esc(m.rev || '—')} · ${esc(m.tarih || '')} · ${esc(m.firma || 'DOLFIN')} · ${esc(t_('güncelleme'))} ${fmtTime(p.updated)}</div>
      </button>`;
    }).join('');
  }

  const issueText = (c) => (c.error ? t_('{n} eksik', { n: c.error }) : c.warn ? t_('{n} uyarı', { n: c.warn }) : t_('Eksik yok'));

  async function loadIssueCounts() {
    const names = state.projects.map((p) => p.name);
    let i = 0;
    const worker = async () => {
      while (i < names.length) {
        const n = names[i++];
        try {
          const d = await api('GET', `/api/project?name=${encodeURIComponent(n)}`);
          state.issues[n] = LayoutChecks.counts(runChecks(d, d.data));
          const chip = document.querySelector(`[data-issues="${CSS.escape(n)}"]`);
          if (chip) {
            const c = state.issues[n];
            chip.textContent = issueText(c);
            chip.className = `pc-chip ${c.error ? 'has' : c.warn ? 'warn' : 'ok'}`;
          }
        } catch (e) { /* kart yine de açılır */ }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  /* ─────────────────────────── Yeni proje ─────────────────────────── */

  async function newProjectModal() {
    let tpl = {};
    try { tpl = (await api('GET', '/api/template')).makine || {}; } catch (e) { /* şablonsuz da açılır */ }
    const brands = B.BRAND_LIST.map(([v, tx]) => `<option value="${v}">${tx}</option>`).join('');
    const copies = state.projects.map((p) => `<option value="${esc(p.name)}">${esc(t_('Kopyası: {p}', { p: p.name }))}</option>`).join('');
    const axis = (id, def) => `<select id="${id}" class="field-input">${AXES.map((a) => `<option${a === def ? ' selected' : ''}>${a}</option>`).join('')}</select>`;
    const L = (s) => esc(t_(s));
    const m = modal(`
      <h2>${L('Yeni Proje')}</h2>
      <p class="modal-sub">${L('Kapak bilgilerini girin. Proje projects/ klasöründe açılır; STEP seçerseniz görünümler hemen üretilir.')}</p>
      <form id="npForm" class="modal-grid">
        <div class="field span2"><label for="npCopy">${L('Başlangıç verisi')}</label>
          <select id="npCopy" class="field-input"><option value="">${L('Şablon (varsayılan değerler)')}</option>${copies}</select>
          <div class="field-help">${L('Benzer bir makine için seçilen projenin metinleri ve tabloları kopyalanır; bağlantı noktaları yeni makinenin ölçüsüne oranlanır. O proje değişmez.')}</div></div>
        <div class="field"><label for="npSeri">${L('Proje no (seri no)')} *</label><input id="npSeri" class="field-input" placeholder="0000000" required autocomplete="off"></div>
        <div class="field"><label for="npFirma">${L('Marka')}</label><select id="npFirma" class="field-input">${brands}</select></div>
        <div class="field"><label for="npMusteri">${L('Müşteri')} *</label><input id="npMusteri" class="field-input" placeholder="MÜŞTERİ" required autocomplete="off"></div>
        <div class="field"><label for="npModel">${L('Model')} *</label><input id="npModel" class="field-input" placeholder="ULT M200 3B L" required autocomplete="off"></div>
        <div class="field span2"><label for="npTip">${L('Tip (makine tam adı)')}</label><input id="npTip" class="field-input" placeholder="Ultrasonik Yıkama Makinesi – ULT M200 3B L" autocomplete="off"></div>
        <div class="field"><label for="npHaz">${L('Hazırlayan')}</label><input id="npHaz" class="field-input" value="${esc(tpl.hazirlayan || 'Fatih GÜRAL')}" autocomplete="off"></div>
        <div class="field"><label for="npTarih">${L('Tarih')}</label><input id="npTarih" class="field-input" type="date" value="${LayoutForm.toIso(today())}"></div>
        <div class="field"><label for="npKontrol">${L('Kontrol')}</label><input id="npKontrol" class="field-input" value="${esc(tpl.kontrol || 'Furkan BIÇAK')}" autocomplete="off"></div>
        <div class="field"><label for="npOnay">${L('Onay')}</label><input id="npOnay" class="field-input" value="${esc(tpl.onay || 'Furkan BIÇAK')}" autocomplete="off"></div>
        <div class="field"><label for="npRev">${L('Revizyon')}</label><input id="npRev" class="field-input" value="${esc(tpl.rev || '00')}" autocomplete="off"></div>
        <div class="field${WEB ? ' hidden' : ''}"><label for="npStep">${L('STEP dosyası')}</label><input id="npStep" class="field-input" type="file" accept=".step,.stp,.STEP,.STP"></div>
        <details class="adv span2${WEB ? ' hidden' : ''}"><summary>${L('STEP ayarları (eksenler, eleme)')}</summary>
          <div class="modal-grid" style="margin-top:8px">
            <div class="field"><label for="npUp">${L('Yukarı eksen')}</label>${axis('npUp', '+Y')}</div>
            <div class="field"><label for="npFront">${L('Operatör tarafı')}</label>${axis('npFront', '+Z')}</div>
            <div class="field"><label for="npMin">${L('Küçük parça eleme (mm)')}</label><input id="npMin" class="field-input" type="number" value="25"></div>
            <div class="field"><label for="npDefl">${L('Üçgenleme sapması (mm)')}</label><input id="npDefl" class="field-input" type="number" value="2" step="0.5"></div>
            <div class="field-help span2">${L('SolidWorks dışa aktarımlarında yukarı eksen genelde +Y\'dir. Operatör tarafı, yükleme kapağının baktığı eksendir; yanlışsa projede "Görünümler" ile düzeltilir.')}</div>
          </div>
        </details>
        <div class="field span2"><label>${L('Klasör')}</label><div class="folder-preview" id="npFolder">projects/…</div></div>
        <div class="progress span2 hidden" id="npProg"><div></div></div>
      </form>
      <div class="modal-actions"><span class="left" id="npStatus"></span><button type="button" class="btn" id="npCancel">${L('İptal')}</button><button type="submit" form="npForm" class="btn btn-primary" id="npGo">${L('Oluştur')}</button></div>`, 'wide');
    const upd = () => {
      const n = derivedName({ seri_no: $('npSeri').value, musteri: $('npMusteri').value, model: $('npModel').value });
      $('npFolder').textContent = `projects/${n}`;
    };
    ['npSeri', 'npMusteri', 'npModel'].forEach((id) => $(id).addEventListener('input', upd));
    upd();
    $('npCancel').addEventListener('click', closeModal);
    m.querySelector('#npForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const makine = {
        seri_no: $('npSeri').value.trim(), musteri: $('npMusteri').value.trim(), model: $('npModel').value.trim(),
        tam_ad: $('npTip').value.trim(), firma: $('npFirma').value, hazirlayan: $('npHaz').value.trim(),
        kontrol: $('npKontrol').value.trim(), onay: $('npOnay').value.trim(), tarih: LayoutForm.fromIso($('npTarih').value) || today(),
        rev: $('npRev').value.trim() || '00'
      };
      if (makine.tam_ad) makine.tam_ad = { tr: makine.tam_ad, en: makine.tam_ad, de: makine.tam_ad };
      else delete makine.tam_ad;
      const file = WEB ? null : $('npStep').files[0];
      $('npGo').disabled = true;
      try {
        $('npStatus').textContent = t_('Proje oluşturuluyor…');
        const res = await api('POST', '/api/create', { makine, kopya: $('npCopy').value });
        if (file) {
          $('npProg').classList.remove('hidden');
          await upload(res.name, 'step', file, (f) => {
            $('npProg').firstElementChild.style.width = `${Math.round(f * 100)}%`;
            $('npStatus').textContent = t_('STEP yükleniyor… %{p} ({s})', { p: Math.round(f * 100), s: fmtSize(file.size) });
          });
          await api('POST', '/api/pipeline', { name: res.name, up: $('npUp').value, front: $('npFront').value,
            min_diag: Number($('npMin').value) || 25, defl: Number($('npDefl').value) || 2, force_read: true, auto_geometry: true });
        }
        closeModal();
        await openProject(res.name, { section: 'kapak' });
        if (file) jobModal('pipeline');
        else toast(t_('{n} oluşturuldu. Görünümler için STEP yükleyin.', { n: res.name }));
      } catch (err) {
        $('npStatus').textContent = '';
        $('npGo').disabled = false;
        toast(err.message, 'error');
      }
    });
  }

  /* ─────────────────────────── Çalışma ekranı ─────────────────────────── */

  async function openProject(name, opts) {
    const o = opts || {};
    await flushSave();
    let d;
    try {
      d = await api('GET', `/api/project?name=${encodeURIComponent(name)}`);
    } catch (e) {
      toast(t_('Proje açılamadı: {e}', { e: e.message }), 'error');
      return;
    }
    state.template = false;
    state.name = name;
    state.detail = d;
    state.data = d.data;
    resetHistory();
    state.dirty = false;
    state.saveError = null;
    state.savedAt = d.veriMtime;
    state.baseMtime = d.veriMtime;
    state.previewOk = false;
    state.pageTotal = 0;
    state.pickKey = null;
    state.ui = { collapsed: new Set(), opened: new Set() };
    $('home').classList.add('hidden');
    $('app').classList.remove('hidden');
    document.title = `${name} – Layout`;
    setWorkspaceMode();
    recheck(true);
    const c = LayoutChecks.counts(state.checks);
    state.section = o.section || state.section || 'kapak';
    if (!S.byId[state.section]) state.section = 'kapak';
    renderAll();
    selectRightTab(c.error || c.warn ? 'checks' : 'edit');
    setMode('doc');
    loadPreview(true);
    if (d.job === 'running') jobModal(d.jobKind || 'pipeline');
  }

  async function openTemplate() {
    await flushSave();
    let data;
    try { data = await api('GET', '/api/template'); } catch (e) { toast(e.message, 'error'); return; }
    state.template = true;
    state.name = null;
    state.detail = { data, views_meta: null, cfg: null, files: [], step: '', doc: { exists: false } };
    state.data = data;
    resetHistory();
    state.dirty = false;
    state.savedAt = null;
    state.ui = { collapsed: new Set(), opened: new Set() };
    $('home').classList.add('hidden');
    $('app').classList.remove('hidden');
    document.title = `${t_('Şablon')} – Layout`;
    setWorkspaceMode();
    recheck(true);
    state.section = 'kapak';
    renderAll();
    selectRightTab('edit');
    setMode('doc');
  }

  function setWorkspaceMode() {
    const tm = state.template;
    ['btnViews', 'btnPdf'].forEach((id) => $(id).classList.toggle('hidden', tm));
    if (WEB) $('btnViews').classList.add('hidden');
    $('cvMode').classList.toggle('hidden', tm);
    $('btnRefresh').classList.toggle('hidden', tm);
    $('projName').textContent = tm ? t_('Şablon – yeni projelerin başlangıç değerleri') : state.name;
    document.querySelectorAll('#docLang button').forEach((b) => b.classList.toggle('active', b.dataset.lang === state.lang));
  }

  function renderAll() {
    renderSections();
    renderInspector();
    renderChecks();
    renderFiles();
    renderStatus();
    updateSaveState();
    updateCvInfo();
  }

  /* ─── Bölüm listesi ─── */

  function renderSections() {
    const box = $('sectionList');
    const { numbers, has } = S.docNumbers(state.data, state.detail.views_meta);
    const cnt = LayoutChecks.counts(state.checks).bySec;
    let group = null;
    const html = [];
    S.SECTIONS.forEach((s) => {
      if (state.template && s.id === 'model') return;
      if (s.group !== group) {
        group = s.group;
        html.push(`<div class="sec-group">${esc(t_(group))}</div>`);
      }
      const c = cnt[s.id] || { error: 0, warn: 0 };
      const mark = s.mark || (numbers[s.id] ? String(numbers[s.id]) : '–');
      const stateHtml = c.error ? `<span class="e" title="${esc(t_('{n} eksik', { n: c.error }))}">${c.error}</span>` : '';
      const warnHtml = c.warn ? `<span class="w" title="${esc(t_('{n} uyarı', { n: c.warn }))}">${c.warn}</span>` : '';
      const okHtml = !c.error && !c.warn ? (s.doc && s.doc !== 'kapak' && !has[s.id] ? `<span class="off" title="${esc(t_('Bu bölüm belgede yok (boş)'))}">${esc(t_('yok'))}</span>` : '<span class="ok">✓</span>') : '';
      html.push(`<button type="button" class="sec-row${s.id === state.section ? ' active' : ''}" data-sec="${s.id}">
        <span class="sec-num">${esc(mark)}</span>
        <span class="sec-name"><b>${esc(t_(s.title))}</b><small>${esc(t_(s.sub))}</small></span>
        <span class="sec-state">${stateHtml}${warnHtml}${okHtml}</span></button>`);
    });
    box.innerHTML = html.join('');
  }

  function selectSection(id, opts) {
    const o = opts || {};
    if (!S.byId[id]) return;
    state.section = id;
    document.querySelectorAll('.sec-row').forEach((r) => r.classList.toggle('active', r.dataset.sec === id));
    renderInspector();
    if (!o.keepTab) selectRightTab('edit');
    const sec = S.byId[id];
    if (sec.doc && state.mode === 'doc') gotoDoc(sec.doc);
    if (o.path) setTimeout(() => LayoutForm.focusPath($('inspector'), o.path, o.lang), 40);
  }

  function selectRightTab(tab) {
    state.rightTab = tab;
    document.querySelectorAll('.right-panel .panel-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('tab-edit').classList.toggle('hidden', tab !== 'edit');
    $('tab-checks').classList.toggle('hidden', tab !== 'checks');
  }

  /* ─── Düzenleme formu ─── */

  function formCtx() {
    return {
      data: state.data,
      ui: state.ui,
      change,
      act,
      custom,
      options(name) {
        if (name === 'detailViews') {
          const vm = state.detail.views_meta || {};
          const keys = Object.keys(vm).filter((k) => k.startsWith('detay'));
          return [['', t_('(görünüm yok)')]].concat(keys.map((k) => [k, `${t_('Yakın:')} ${k.replace(/^detay_/, '')}`]));
        }
        return [];
      }
    };
  }

  function renderInspector() {
    const box = $('inspector');
    const scroll = $('tab-edit').scrollTop;
    const sec = S.byId[state.section];
    const { numbers, has } = S.docNumbers(state.data, state.detail.views_meta);
    box.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'insp-head';
    const inDoc = sec.doc === 'kapak' ? t_('Belgede: kapak ve her sayfanın anteti')
      : sec.doc ? (has[sec.id] ? t_('Belgede {n}. bölüm', { n: numbers[sec.id] }) : t_('Belgede görünmüyor (içerik boş)'))
        : t_('Belgede yer almaz; görünümler ve ölçüler buradan gelir');
    head.innerHTML = `<span class="insp-num">${esc(sec.mark || numbers[sec.id] || '–')}</span><div><div class="insp-title">${esc(t_(sec.title))}</div><div class="insp-sub">${esc(t_(sec.sub))} · ${esc(inDoc)}</div></div>`;
    box.appendChild(head);
    const own = state.checks.filter((c) => c.sec === sec.id && c.level !== 'info');
    if (own.length) {
      const n = document.createElement('div');
      n.className = 'note-box warn';
      n.innerHTML = `${esc(t_('{n} madde eksik ya da gözden geçirilmeli.', { n: own.length }))} <button type="button" class="btn btn-xs" style="margin-left:6px" data-goto-checks>${esc(t_('Eksikleri göster'))}</button>`;
      n.querySelector('[data-goto-checks]').addEventListener('click', () => selectRightTab('checks'));
      box.appendChild(n);
    }
    LayoutForm.render(box, sec.fields, formCtx());
    $('tab-edit').scrollTop = scroll;
  }

  /* ─── Değişiklik, geri al, kayıt ─── */

  function change(path, value, opts) {
    const o = opts || {};
    const p = LayoutForm.split(path);
    const m = state.data.makine || {};
    const before = { name: derivedName(m), file: derivedFile(m) };
    pushHistory();
    LayoutForm.set(state.data, p, value);
    if (p[0] === 'makine' && ['seri_no', 'musteri', 'model'].includes(p[1]) && !state.template) {
      // dosya adı ve proje adı elle değiştirilmediyse yeni bilgilerle birlikte güncellenir
      if (!m.dosya_adi || m.dosya_adi === before.file) m.dosya_adi = derivedFile(m);
      if (!m.proje || m.proje === before.name) m.proje = derivedName(m);
    }
    markDirty();
    scheduleRecheck();
    if (o.rerender) renderInspector();
    if (p[0] === 'makine') LayoutStudio.refresh();
    if (state.mode === 'picker' && p[1] === 'noktalar') renderPicker();
  }

  function pushHistory() {
    if (state.histTimer) return;
    state.history.push(state.snap);
    if (state.history.length > 120) state.history.shift();
    state.future = [];
    state.histTimer = setTimeout(() => {
      state.histTimer = null;
      state.snap = JSON.stringify(state.data);
      updateUndo();
    }, 700);
    updateUndo();
  }

  function resetHistory() {
    clearTimeout(state.histTimer);
    state.histTimer = null;
    state.history = [];
    state.future = [];
    state.snap = JSON.stringify(state.data);
    updateUndo();
  }

  function settleHistory() {
    if (state.histTimer) {
      clearTimeout(state.histTimer);
      state.histTimer = null;
      state.snap = JSON.stringify(state.data);
    }
  }

  function undo() {
    settleHistory();
    if (!state.history.length) return;
    state.future.push(state.snap);
    state.snap = state.history.pop();
    restoreSnap();
  }

  function redo() {
    settleHistory();
    if (!state.future.length) return;
    state.history.push(state.snap);
    state.snap = state.future.pop();
    restoreSnap();
  }

  function restoreSnap() {
    state.data = JSON.parse(state.snap);
    state.detail.data = state.data;
    markDirty();
    recheck(true);
    renderSections();
    renderInspector();
    renderChecks();
    LayoutStudio.refresh();
    if (state.mode === 'picker') renderPicker();
    updateUndo();
  }

  function updateUndo() {
    $('btnUndo').disabled = !state.history.length && !state.histTimer;
    $('btnRedo').disabled = !state.future.length;
  }

  function markDirty() {
    state.dirty = true;
    if (!state.template && state.name) schedulePreview();
    updateSaveState();
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => saveNow(), 800);
  }

  function updateSaveState() {
    const el = $('saveState');
    el.className = 'save-state';
    if (state.saveError) {
      el.classList.add('err');
      el.textContent = t_('Kaydedilemedi: {e} (yeniden denenecek)', { e: state.saveError });
    } else if (state.saving) {
      el.textContent = t_('Kaydediliyor…');
    } else if (state.dirty) {
      el.classList.add('dirty');
      el.textContent = t_('Kaydedilmemiş değişiklik');
    } else if (state.savedAt) {
      el.textContent = t_('Kaydedildi · {t}', { t: fmtTime(state.savedAt) });
    } else {
      el.textContent = state.template ? t_('Şablon') : '';
    }
  }

  async function saveNow(announce) {
    clearTimeout(state.saveTimer);
    if (state.saving) {
      await state.saving;
      if (!state.dirty) return true;
    }
    if (!state.dirty) {
      if (announce) toast(t_('Kayıtlı – değişiklik yok.'));
      return true;
    }
    const target = state.template ? null : state.name;
    const payload = clone(state.data);
    state.dirty = false;
    let ok = true;
    state.saving = (async () => {
      updateSaveState();
      try {
        if (state.template) await api('PUT', '/api/template', payload);
        else {
          const r = await api('POST', '/api/save', { name: target, data: payload, base: state.baseMtime });
          state.savedAt = r.mtime;
          state.baseMtime = r.mtime;
          if (r.conflict) toast(t_('Dosya bu arada başka yerden değişmişti; sizin sürümünüz kaydedildi, öbürü {f} olarak saklandı.', { f: r.conflict }), 'error');
        }
        if (state.template) state.savedAt = Date.now() / 1000;
        state.saveError = null;
        clearTimeout(state.retryTimer);
      } catch (e) {
        ok = false;
        state.dirty = true;
        state.saveError = e.message;
        clearTimeout(state.retryTimer);
        state.retryTimer = setTimeout(() => saveNow(), 15000);
      }
    })();
    await state.saving;
    state.saving = null;
    updateSaveState();
    if (ok && announce) toast(state.template ? t_('Şablon kaydedildi.') : t_('Kaydedildi.'));
    if (ok && !state.template && target === state.name) schedulePreview();
    return ok;
  }

  async function flushSave() {
    if (state.dirty || state.saving) await saveNow();
  }

  /* ─── Eksikler ─── */

  function runChecks(detail, data) {
    return LayoutChecks.run({
      data, views_meta: detail.views_meta, cfg: detail.cfg, files: detail.files, step: detail.step,
      doc: detail.doc, template: state.template && detail === state.detail
    });
  }

  function recheck(silent) {
    if (!state.detail) return;
    state.checks = runChecks(state.detail, state.data);
    if (!silent) {
      renderSections();
      renderChecks();
    }
  }

  function scheduleRecheck() {
    clearTimeout(state.checkTimer);
    state.checkTimer = setTimeout(() => recheck(false), 250);
  }

  function renderChecks() {
    const list = state.checks;
    const c = LayoutChecks.counts(list);
    const badge = $('checkBadge');
    badge.classList.toggle('hidden', !(c.error || c.warn));
    badge.classList.toggle('warn', !c.error && !!c.warn);
    badge.textContent = c.error || c.warn;
    const box = $('checkList');
    if (!list.length) {
      box.innerHTML = `<div class="check-ok">✓ ${esc(t_('Eksik yok. Teslim öncesi kontrol listesi tamam.'))}</div>`;
      return;
    }
    const pills = `<div class="check-summary"><span class="check-pill e">${esc(t_('{n} eksik', { n: c.error }))}</span><span class="check-pill w">${esc(t_('{n} uyarı', { n: c.warn }))}</span><span class="check-pill i">${esc(t_('{n} bilgi', { n: c.info }))}</span></div>`;
    const groups = { error: t_('Teslim edilmeden tamamlanmalı'), warn: t_('Gözden geçirin'), info: t_('Bilgi') };
    let cur = null;
    const rows = list.map((it, i) => {
      let g = '';
      if (it.level !== cur) {
        cur = it.level;
        g = `<div class="check-group">${esc(groups[cur])}</div>`;
      }
      const sec = S.byId[it.sec];
      return `${g}<button type="button" class="check-row" data-i="${i}"><span class="check-dot ${it.level}"></span><span>${esc(it.text)}<small>${esc(sec ? t_(sec.title) : '')}</small></span></button>`;
    }).join('');
    box.innerHTML = pills + rows;
  }

  function onCheckClick(i) {
    const it = state.checks[i];
    if (!it) return;
    if (it.act && !it.path) {
      selectSection(it.sec);
      act(it.act);
      return;
    }
    selectSection(it.sec, { path: it.path, lang: it.lang });
  }

  /* ─── Durum çubuğu ─── */

  function renderStatus() {
    if (state.template) {
      $('statusDoc').textContent = 'tools/sablon-layout-veri.json';
      $('statusFolder').textContent = '';
      return;
    }
    const outs = (state.detail.files || []).filter((f) => (f.kind === 'pdf' || f.kind === 'html') && /-Layout/.test(f.name));
    $('statusDoc').textContent = t_('Çıktılar: {n} dosya (PDF / HTML)', { n: outs.length });
    $('statusFolder').textContent = `projects/${state.name}`;
  }

  /* ─── Dosyalar ─── */

  function renderFiles() {
    const box = $('fileList');
    if (state.template) {
      box.innerHTML = `<div class="file-empty">${esc(t_('Şablonun dosyası yok.'))}</div>`;
      return;
    }
    const files = state.detail.files || [];
    const groups = [
      ['step', 'Model (STEP)'], ['pdf', 'PDF (imalat resmi ve çıktılar)'], ['html', 'HTML çıktıları'], ['data', 'Veri'], ['view', 'Görünümler'], ['other', 'Diğer']
    ];
    const html = [WEB ? `<div class="file-actions"><button type="button" class="btn btn-sm" data-act="uploadPdf">${esc(t_('İmalat resmi ekle'))}</button></div>`
      : `<div class="file-actions"><button type="button" class="btn btn-sm" data-act="uploadStep">${esc(t_('STEP yükle'))}</button><button type="button" class="btn btn-sm" data-act="uploadPdf">${esc(t_('İmalat resmi ekle'))}</button><button type="button" class="btn btn-sm" data-act="openFolder">${esc(t_('Klasörü aç'))}</button></div>`];
    groups.forEach(([k, label]) => {
      const fs = files.filter((f) => f.kind === k);
      if (!fs.length && (k === 'other' || k === 'view')) return;
      html.push(`<div class="file-group"><h3>${esc(t_(label))} <span class="file-count">${fs.length}</span></h3>${fs.length ? fs.map((f) =>
        `<button type="button" class="file-row" data-file="${esc(f.name)}" data-kind="${f.kind}" data-url="${esc(f.url)}" title="${esc(f.name)} · ${fmtTime(f.mtime)}"><span>${esc(f.name.replace(/^views\//, ''))}</span><span class="file-size">${fmtSize(f.size)}</span></button>`).join('') : `<div class="file-empty">${esc(t_('Yok'))}</div>`}</div>`);
    });
    box.innerHTML = html.join('');
  }

  function openFile(btn) {
    const kind = btn.dataset.kind;
    if (['html', 'pdf', 'view'].includes(kind)) window.open(btn.dataset.url, '_blank');
    else api('POST', '/api/open', { name: state.name, file: btn.dataset.file }).catch((e) => toast(e.message, 'error'));
  }

  /* ─────────────────────────── Önizleme ─────────────────────────── */

  function setDocLang(l) {
    state.lang = l;
    try { localStorage.setItem('layout-app-lang', l); } catch (e) { /* yok */ }
    document.querySelectorAll('#docLang button').forEach((b) => b.classList.toggle('active', b.dataset.lang === l));
    const w = frameWin();
    if (w && w.LBDoc) w.LBDoc.setLang(l);
    LayoutStudio.refresh();
    updateCvInfo();
  }

  const frameWin = () => {
    try { return $('preview').contentWindow; } catch (e) { return null; }
  };

  function gotoDoc(docSec) {
    const w = frameWin();
    if (w && w.LBDoc) w.LBDoc.goto(docSec);
  }

  function showEmpty(html) {
    $('preview').classList.add('hidden');
    $('picker').classList.add('hidden');
    const e = $('cvEmpty');
    e.innerHTML = html;
    e.classList.remove('hidden');
  }

  function emptyState() {
    const L = (s, p) => esc(t_(s, p));
    if (state.template) {
      showEmpty(`<h2>${L('Şablon')}</h2><p>${L('Yeni projeler bu değerlerle başlar (ÇNK standardı). "rel" verilen bağlantı noktaları makine kutusuna göre yerleşir; {L} {W} {H} ölçülerle, {A} {kesit} {V} elektrik değerleriyle doldurulur.', { L: '{L}', W: '{W}', H: '{H}', A: '{A}', kesit: '{kesit}', V: '{V}' })}</p><p>${L('Soldan bölüm seçip sağdan düzenleyin; değişiklikler otomatik kaydedilir.')}</p>`);
      return;
    }
    const d = state.detail;
    if (WEB && !d.views_meta) {
      showEmpty(`<h2>${L('Görünümler henüz yok')}</h2><p>${L('Web sürümünde STEP okunamaz. Projeyi masaüstü uygulamasında açıp STEP\'ten görünümleri üretin; veritabanı eşitlenince görünümler buraya kendiliğinden gelir. Kapak ve metinleri şimdiden doldurabilirsiniz.')}</p>`);
    } else if (!d.step) {
      showEmpty(`<h2>${L('STEP dosyası yok')}</h2><p>${L('Görünümler (üst, ön, arka, yan, izometrik) ve makine ölçüleri STEP\'ten üretilir. Kapak ve metinleri şimdiden doldurabilirsiniz.')}</p><div class="actions"><button type="button" class="btn btn-primary" data-act="uploadStep">${L('STEP yükle')}</button></div>`);
    } else if (!d.views_meta) {
      showEmpty(`<h2>${L('Görünümler üretilmedi')}</h2><p>${L('{s} yüklü. Görünümleri üretmek için eksenleri seçip çalıştırın (büyük dosyalarda birkaç dakika sürer).', { s: d.step })}</p><div class="actions"><button type="button" class="btn btn-primary" data-act="views">${L('Görünümleri üret')}</button></div>`);
    }
  }

  function loadPreview(initial) {
    if (state.template) {
      emptyState();
      return;
    }
    const d = state.detail;
    if (!d.views_meta) {
      emptyState();
      updateCvInfo();
      return;
    }
    $('cvEmpty').classList.add('hidden');
    if (state.mode === 'doc') $('preview').classList.remove('hidden');
    refreshPreview();
  }

  function schedulePreview() {
    clearTimeout(state.previewTimer);
    state.previewTimer = setTimeout(refreshPreview, 500);
  }

  async function refreshPreview() {
    if (state.template || !state.name || !state.detail.views_meta) return;
    if (state.previewBusy) {
      state.previewAgain = true;
      return;
    }
    const name = state.name;
    state.previewBusy = true;
    $('cvBusy').classList.remove('hidden');
    try {
      const html = await buildDoc({ embed: { lang: state.lang } });
      if (name !== state.name) return;
      setFrame(html);
      state.previewOk = true;
    } catch (e) {
      if (name === state.name) {
        $('cvInfo').innerHTML = `<span style="color:#ff8585">${esc(t_('Önizleme üretilemedi: {e}', { e: e.message }))}</span>`;
        toast(t_('Önizleme üretilemedi: {e}', { e: e.message }), 'error');
      }
    } finally {
      state.previewBusy = false;
      $('cvBusy').classList.add('hidden');
      if (state.previewAgain) {
        state.previewAgain = false;
        schedulePreview();
      }
    }
  }

  function setFrame(html) {
    const f = $('preview');
    const w = frameWin();
    let y = 0;
    try { y = w && w.document && w.document.scrollingElement ? w.document.scrollingElement.scrollTop : 0; } catch (e) { y = 0; }
    f.dataset.restore = String(y);
    f.srcdoc = html;
  }

  /* ─── Belge üretimi (belge/kaynak.js): önizleme ve çıktılar tarayıcıda, masaüstü ve web aynı ─── */

  let assetsP = null;
  const dataUrl = (blob) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
  async function fetchData(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return dataUrl(await r.blob());
  }
  function docAssets() {
    if (!assetsP) {
      assetsP = (async () => {
        const [css, js] = await Promise.all(['belge/belge.css', 'belge/belge.js'].map((u) => fetch(u).then((r) => {
          if (!r.ok) throw new Error(`${u}: ${r.status}`);
          return r.text();
        })));
        const fonts = {};
        await Promise.all([[400, 'selawk'], [600, 'selawksb'], [700, 'selawkb']].map(async ([w, f]) => { fonts[w] = await fetchData(`belge/fonts/${f}.ttf`); }));
        const logos = {};
        await Promise.all(Object.entries(LayoutKaynak.LOGO_FILES).map(async ([k, f]) => { logos[k] = await fetchData(`belge/logos/${f}`); }));
        return { css, js, fonts, logos };
      })().catch((e) => {
        assetsP = null;
        throw e;
      });
    }
    return assetsP;
  }
  async function projectImages() {
    const vm = state.detail.views_meta || {};
    const key = state.name + '|' + (state.detail.files || []).filter((f) => f.kind === 'view').map((f) => `${f.name}:${f.mtime}`).join(',');
    if (state.imgCache && state.imgCache.key === key) return state.imgCache.map;
    let map;
    if (WEB) map = await LayoutWeb.images(state.name, vm);
    else {
      map = {};
      for (const v of Object.values(vm)) {
        if (v && v.png && !map[v.png]) map[v.png] = await fetchData(`/files/${encodeURIComponent(state.name)}/views/${encodeURIComponent(v.png)}?t=${Date.now()}`);
      }
    }
    state.imgCache = { key, map };
    return map;
  }
  /** Pafta HTML'i (geçerli, kaydedilmemiş düzenlemeler dahil). opts: { embed: {lang}, export: {langs, only, cover} } */
  async function buildDoc(opts) {
    const o = opts || {};
    const [assets, images] = await Promise.all([docAssets(), projectImages()]);
    return LayoutKaynak.build({ data: state.data, views: state.detail.views_meta, images, design: coverDesign(), assets,
      export: o.export || null, embed: o.embed || null });
  }
  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  }

  function onFrameLoad() {
    const f = $('preview');
    const w = frameWin();
    if (!w) return;
    const restore = Number(f.dataset.restore || 0);
    let tries = 0;
    const wait = () => {
      tries += 1;
      if (w.LB_READY && w.LBDoc) {
        state.pageTotal = w.LBDoc.state.total;
        if (restore) w.scrollTo(0, restore);
        else {
          const sec = S.byId[state.section];
          if (sec && sec.doc && sec.doc !== 'kapak') w.LBDoc.goto(sec.doc);
        }
        w.addEventListener('lb-rendered', (ev) => {
          state.pageTotal = ev.detail.total;
          updateCvInfo();
        });
        w.document.addEventListener('keydown', onKey);
        updateCvInfo();
        LayoutStudio.refresh();
      } else if (tries < 100) setTimeout(wait, 60);
    };
    wait();
  }

  function updateCvInfo() {
    const el = $('cvInfo');
    if (!state.detail || state.template) {
      el.textContent = '';
      return;
    }
    if (!state.detail.views_meta) {
      el.textContent = t_('Önizleme için görünümler gerekli');
      return;
    }
    el.innerHTML = `${esc(t_('A3 yatay'))} · <b>${esc(t_('kapak + {n} sayfa', { n: state.pageTotal || '…' }))}</b> · ${state.lang.toUpperCase()} · ${esc(t_('kapak tasarımı'))}: ${esc(designName())}`;
  }

  /* ─── Orta alan: belge / nokta yerleştirme ─── */

  function setMode(mode) {
    if (mode === 'picker' && !(state.detail && state.detail.views_meta)) {
      toast(t_('Nokta yerleştirmek için önce görünümleri üretin.'), 'error');
      mode = 'doc';
    }
    state.mode = mode;
    document.querySelectorAll('#cvMode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    if (state.template || !state.detail.views_meta) {
      emptyState();
      return;
    }
    $('cvEmpty').classList.add('hidden');
    $('preview').classList.toggle('hidden', mode !== 'doc');
    $('picker').classList.toggle('hidden', mode !== 'picker');
    if (mode === 'picker') {
      if (state.section !== 'noktalar') selectSection('noktalar', { keepTab: true });
      renderPicker();
    }
  }

  function renderPicker() {
    const box = $('picker');
    const pts = (state.data.geometri || {}).noktalar || {};
    const keys = Object.keys(pts);
    if (!state.pickKey || !pts[state.pickKey]) state.pickKey = keys[0] || null;
    const vm = state.detail.views_meta;
    const img = (v) => {
      const f = (state.detail.files || []).find((x) => x.name === `views/${vm[v].png}`);
      return f && WEB ? f.url : `/files/${encodeURIComponent(state.name)}/views/${encodeURIComponent(vm[v].png)}?t=${state.detail.veriMtime || Date.now()}`;
    };
    box.innerHTML = `
      <div class="picker-head">
        <span>${esc(t_('Nokta:'))}</span>
        <div class="pk-keys">${keys.map((k) => `<button type="button" class="pk-key${k === state.pickKey ? ' active' : ''}" data-key="${esc(k)}">${esc(k)}</button>`).join('')}</div>
        <button type="button" class="btn btn-xs" data-act="addPoint">${esc(t_('+ Nokta'))}</button>
        <span style="margin-left:auto">${esc(t_('Üst görünüme tıklayınca x – y, ön görünüme tıklayınca x – z yazılır (mm, görünüm koordinatları).'))}</span>
      </div>
      ${keys.length ? '' : `<div class="note-box warn">${esc(t_('Henüz bağlantı noktası yok. "+ Nokta" ile ekleyin.'))}</div>`}
      <div class="viewbox-wrap"><h3>${esc(t_('Üst görünüm (plan)'))}</h3><div class="viewbox" data-view="top"><img alt="" src="${img('top')}"></div></div>
      <div class="viewbox-wrap"><h3>${esc(t_('Ön görünüm (operatör tarafı)'))}</h3><div class="viewbox" data-view="front"><img alt="" src="${img('front')}"></div></div>`;
    drawMarkers();
  }

  function drawMarkers() {
    const vm = state.detail.views_meta;
    const pts = (state.data.geometri || {}).noktalar || {};
    [['top', ['x', 'y']], ['front', ['x', 'z']]].forEach(([view, ax]) => {
      const vb = document.querySelector(`#picker .viewbox[data-view="${view}"]`);
      if (!vb) return;
      vb.querySelectorAll('.mk').forEach((e) => e.remove());
      const m = vm[view];
      Object.entries(pts).forEach(([k, p]) => {
        if (!Number.isFinite(Number(p[ax[0]])) || !Number.isFinite(Number(p[ax[1]]))) return;
        const fx = (p[ax[0]] - m.x0) / (m.x1 - m.x0);
        const fy = (m.y1 - p[ax[1]]) / (m.y1 - m.y0);
        if (fx < -0.05 || fx > 1.05 || fy < -0.05 || fy > 1.05) return;
        const d = document.createElement('div');
        d.className = `mk${k === state.pickKey ? ' sel' : ''}`;
        d.textContent = k;
        d.style.left = `${fx * 100}%`;
        d.style.top = `${fy * 100}%`;
        vb.appendChild(d);
      });
    });
  }

  function pickAt(ev) {
    const vb = ev.target.closest('.viewbox');
    if (!vb || ev.target.tagName !== 'IMG' || !state.pickKey) return;
    const view = vb.dataset.view;
    const ax = view === 'top' ? ['x', 'y'] : ['x', 'z'];
    const m = state.detail.views_meta[view];
    const r = ev.target.getBoundingClientRect();
    const fx = (ev.clientX - r.left) / r.width;
    const fy = (ev.clientY - r.top) / r.height;
    const key = state.pickKey;
    const p = clone(state.data.geometri.noktalar[key]);
    delete p.rel;
    p[ax[0]] = Math.round(m.x0 + fx * (m.x1 - m.x0));
    p[ax[1]] = Math.round(m.y1 - fy * (m.y1 - m.y0));
    ['x', 'y', 'z'].forEach((a) => { if (p[a] == null) p[a] = 0; });
    change(['geometri', 'noktalar', key], p);
    drawMarkers();
    if (state.section === 'noktalar') renderInspector();
    toast(`${key}: ${ax[0]} = ${p[ax[0]]}, ${ax[1]} = ${p[ax[1]]} mm`);
  }

  /* ─────────────────────────── Özel form parçaları ─────────────────────────── */

  const axName = (v) => {
    const a = v.map(Math.abs);
    const i = a.indexOf(Math.max(...a));
    return (v[i] < 0 ? '-' : '+') + 'XYZ'[i];
  };

  function custom(name, box) {
    const d = state.detail;
    const G = state.data.geometri || {};
    const E = state.data.elektrik || {};
    if (name === 'modelInfo') {
      const vm = d.views_meta || {};
      const top = d.cfg && d.cfg.views && d.cfg.views.top && d.cfg.views.top.R;
      const axes = top ? t_('yukarı {u} · operatör {f}', { u: axName(top[2]), f: axName(top[1].map((x) => -x)) }) : '—';
      const dets = Object.keys(vm).filter((k) => k.startsWith('detay'));
      LayoutForm.render(box, [
        { k: 'kv', rows: [
          ['STEP', d.step ? `${d.step} (${fmtSize(d.stepSize)})` : t_('yok')],
          ['Görünümler', d.views_meta ? ['top', 'front', 'rear', 'side', 'iso'].filter((k) => vm[k]).map((k) => t_(VIEW_NAMES[k])).join(', ') : t_('üretilmedi')],
          ['Eksenler', axes],
          ['Yakın detay görünümleri', dets.length ? dets.map((k) => k.replace('detay_', '')).join(', ') : t_('yok')],
          ['İmalat resmi (PDF)', (d.files || []).filter((f) => f.kind === 'pdf' && !/-Layout-/.test(f.name)).map((f) => f.name).join(', ') || t_('yok')]
        ] },
        ...(WEB ? [{ k: 'note', text: 'Web sürümü: STEP okuma ve görünüm üretme masaüstü uygulamasında yapılır; görünümler veritabanından hazır gelir.' }] : []),
        { k: 'actions', buttons: WEB ? [{ label: 'İmalat resmi ekle', act: 'uploadPdf' }] : [
          { label: d.step ? 'STEP değiştir' : 'STEP yükle', act: 'uploadStep', primary: !d.step },
          { label: 'Görünümleri üret', act: 'views', primary: !!d.step && !d.views_meta },
          { label: 'İmalat resmi ekle', act: 'uploadPdf' },
          { label: 'Klasörü aç', act: 'openFolder' }
        ] }
      ], formCtx());
      return;
    }
    if (name === 'rearInfo') {
      if (!(d.views_meta && d.views_meta.rear)) {
        LayoutForm.render(box, [{ k: 'note', warn: true, text: 'Bu projede arka görünüm yok. "Görünümler" ile yeniden üretince arka görünüm de çıkar (STEP yeniden okunmaz).' },
          { k: 'actions', buttons: [{ label: 'Görünümleri üret', act: 'views' }] }], formCtx());
      }
      return;
    }
    if (name === 'dimsInfo') {
      const r = (v) => Math.round(Number(v) || 0);
      LayoutForm.render(box, [{ k: 'kv', rows: [['Tablonun ilk satırı (otomatik)', `${r(G.boy)} × ${r(G.en)} × ${r(G.yukseklik)} mm (L × W × H)`]] }], formCtx());
      return;
    }
    if (name === 'currentInfo') {
      const U = Number(E.gerilim_v) || 400;
      const cos = Number(E.cos_phi) || 0.85;
      const I = (Number(E.toplam_guc_kw) || 0) * 1000 / (Math.sqrt(3) * U * cos);
      const num = I ? (LayoutI18n.lang === 'en' ? I.toFixed(1) : I.toFixed(1).replace('.', ',')) + ' A' : '—';
      box.innerHTML = `<label class="field-label"><span>${esc(t_('Hesaplanan nominal akım'))}</span></label><div class="field-input" style="opacity:.8">${num}</div>`;
      box.style.gridColumn = 'span 2';
      return;
    }
    if (name === 'points') {
      renderPoints(box);
      return;
    }
    if (name === 'cable') renderCable(box);
  }

  function renderPoints(box) {
    const G = state.data.geometri;
    const pts = G.noktalar || {};
    const keys = Object.keys(pts);
    const ctx = formCtx();
    const head = document.createElement('div');
    head.className = 'field-help';
    head.textContent = t_('X / Y / Z görünüm koordinatlarıdır; paftada sol-ön-alt köşeye göre yazılır. Görünüm: "hepsi" ya da virgüllü liste (on, yan, arka); üst görünümde bütün noktalar çizilir.');
    box.appendChild(head);
    const L = Number(G.boy) || 0;
    const [ox, oy, oz] = Array.isArray(G.origin) ? G.origin : [0, 0, 0];
    keys.forEach((k) => {
      const p = pts[k];
      const base = ['geometri', 'noktalar', k];
      const kk = base.join('.');
      const collapsed = state.ui.collapsed.has(kk);
      const li = document.createElement('div');
      li.className = `list-item${collapsed ? ' collapsed' : ''}${state.pickKey === k ? ' sel' : ''}`;
      li.dataset.path = kk;
      const rel = 'rel' in p;
      const pos = rel ? t_('yerleştirilmedi') : `${Math.round(p.x - ox)} / ${Math.round(p.y - oy)} / ${Math.round(p.z - oz)} mm`;
      li.innerHTML = `<div class="li-head"><div class="li-title" style="cursor:pointer"><span class="chip">${esc(k)}</span>${esc(S.txt(p.ad) || t_('(adsız)'))} <span style="color:var(--muted);font-weight:400">· ${esc(pos)}</span></div>
        <div class="li-tools"><button type="button" title="${esc(t_('Görünümde yerleştir'))}" data-pick="${esc(k)}">⌖</button><button type="button" title="${esc(t_('Harfi değiştir'))}" data-rename="${esc(k)}">✎</button><button type="button" class="del" title="${esc(t_('Sil'))}" data-del="${esc(k)}">×</button></div></div>`;
      const body = document.createElement('div');
      body.className = 'li-body';
      const fields = [
        rel ? { k: 'note', warn: true, text: t_('Konum makine kutusuna göre oran olarak duruyor ({r}); görünümler üretilince yerleşir ya da görünüme tıklayarak yerleştirin.', { r: p.rel.join(', ') }) }
          : { k: 'row', cols: 3, fields: [{ k: 'num', path: 'x', label: 'x' }, { k: 'num', path: 'y', label: 'y' }, { k: 'num', path: 'z', label: 'z' }] },
        { k: 'text', path: 'gorunum', label: 'Görünüm (hepsi / on, yan, arka)', ph: 'hepsi' },
        { k: 'i18n', path: 'ad', label: 'Ad' },
        { k: 'i18n', path: 'detay', label: 'Detay (ölçü, tip, konum)' }
      ];
      fields.forEach((f) => body.appendChild(LayoutForm.renderField(f, ctx, base)));
      li.appendChild(body);
      li.querySelector('.li-title').addEventListener('click', () => {
        if (li.classList.toggle('collapsed')) state.ui.collapsed.add(kk); else state.ui.collapsed.delete(kk);
      });
      box.appendChild(li);
    });
    const add = document.createElement('div');
    add.className = 'add-row';
    add.innerHTML = `<button type="button" class="btn btn-sm" data-act="addPoint">${esc(t_('+ Nokta ekle'))}</button>`;
    box.appendChild(add);
    if (L <= 0 && keys.length) {
      const n = document.createElement('div');
      n.className = 'note-box warn';
      n.textContent = t_('Makine kutusu ölçüleri yok; konumlar görünümler üretildikten sonra doğrulanabilir.');
      box.appendChild(n);
    }
    box.addEventListener('click', (e) => {
      const tg = e.target;
      if (tg.dataset.pick) {
        state.pickKey = tg.dataset.pick;
        setMode('picker');
        renderInspector();
      } else if (tg.dataset.del) {
        confirmBox(t_('Bağlantı noktasını sil'), t_('{k} noktası silinsin mi?', { k: tg.dataset.del }), t_('Sil')).then((ok) => {
          if (!ok) return;
          const next = Object.assign({}, state.data.geometri.noktalar);
          delete next[tg.dataset.del];
          change(['geometri', 'noktalar'], next, { rerender: true });
        });
      } else if (tg.dataset.rename) {
        pointKeyModal(tg.dataset.rename);
      }
    });
  }

  function pointKeyModal(oldKey) {
    const m = modal(`<h2>${esc(oldKey ? t_('{k} harfini değiştir', { k: oldKey }) : t_('Yeni bağlantı noktası'))}</h2>
      <p class="modal-sub">${esc(t_('E elektrik · P hava · W su · D (D1…Dn) tahliye · X egzoz · B fan / ısıtıcı · S1/S2 yağ ayırıcı'))}</p>
      <div class="field"><label for="pkKey">${esc(t_('İşaret harfi'))}</label><input id="pkKey" class="field-input" value="${esc(oldKey || '')}" maxlength="6" autocomplete="off"></div>
      <div class="modal-actions"><button type="button" class="btn" data-a="no">${esc(t_('Vazgeç'))}</button><button type="button" class="btn btn-primary" data-a="ok">${esc(oldKey ? t_('Değiştir') : t_('Ekle'))}</button></div>`);
    const go = () => {
      const k = $('pkKey').value.trim().toUpperCase().replace(/\s+/g, '');
      if (!k) return;
      const pts = state.data.geometri.noktalar || {};
      if (pts[k] && k !== oldKey) {
        toast(t_('{k} zaten var.', { k }), 'error');
        return;
      }
      const next = {};
      if (oldKey) {
        Object.keys(pts).forEach((x) => { next[x === oldKey ? k : x] = pts[x]; });
      } else {
        Object.assign(next, pts);
        const G = state.data.geometri;
        const [ox, oy, oz] = Array.isArray(G.origin) ? G.origin : [0, 0, 0];
        next[k] = { x: Math.round(ox + (G.boy || 0) / 2), y: Math.round(oy + (G.en || 0)), z: Math.round(oz + (G.yukseklik || 0) / 2), gorunum: 'arka',
          ad: S.blank3(), detay: S.blank3() };
      }
      closeModal();
      state.pickKey = k;
      change(['geometri', 'noktalar'], next, { rerender: true });
      if (state.mode === 'picker') renderPicker();
    };
    m.addEventListener('click', (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (a === 'no') closeModal();
      if (a === 'ok') go();
    });
    $('pkKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  function renderCable(box) {
    const E = state.data.elektrik || {};
    const K = E.kablo;
    const ctx = formCtx();
    if (!K) {
      LayoutForm.render(box, [
        { k: 'note', warn: true, text: 'Besleme kablosu bölümü yok. Her paftada bulunur: tek hat şeması, kablo kesiti (IEC 60445 renkleri), uzunluğa göre kesit / ΔU tablosu, müşteri tesisatında zorunlu olanlar.' },
        { k: 'actions', buttons: [{ label: 'Kablo bölümünü ekle (şablondan)', act: 'addCable', primary: true }] }
      ], ctx);
      return;
    }
    const U = Number(E.gerilim_v) || 400;
    const cos = Number(E.cos_phi) || 0.85;
    const I = (Number(E.toplam_guc_kw) || 0) * 1000 / (Math.sqrt(3) * U * cos);
    const rho = Number(K.rho_ohm_mm2_m) || 0.0225;
    const kes = Number(K.kesit_mm2) || 0;
    const dec = (v, n) => (LayoutI18n.lang === 'en' ? v.toFixed(n) : v.toFixed(n).replace('.', ','));
    const rows = (K.uzunluklar_m || []).map((Lm) => {
      const du = kes ? Math.sqrt(3) * I * Lm * rho * cos / kes : 0;
      return [`${Lm} m`, kes ? `ΔU ${dec(du, 2)} V · ${dec(du / U * 100, 2)} %` : '—'];
    });
    LayoutForm.render(box, [
      { k: 'row', cols: 3, fields: [
        { k: 'num', path: 'elektrik.kablo.damar_sayisi', label: 'Damar sayısı' },
        { k: 'num', path: 'elektrik.kablo.kesit_mm2', label: 'Kesit (mm²)' },
        { k: 'text', path: 'elektrik.kablo.yapi', label: 'Damar yapısı' }
      ] },
      { k: 'row', cols: 3, fields: [
        { k: 'nums', path: 'elektrik.kablo.uzunluklar_m', label: 'Uzunluklar (m)' },
        { k: 'num', path: 'elektrik.kablo.rcd_ma', label: 'Kaçak akım (mA)' },
        { k: 'text', path: 'elektrik.kablo.rcd_tip', label: 'Röle tipi (A / AC / B)' }
      ] },
      { k: 'num', path: 'elektrik.kablo.rho_ohm_mm2_m', label: 'Özdirenç (Ω·mm²/m, 70 °C Cu)', step: 0.0001 },
      { k: 'kv', rows: [['Nominal akım', I ? `${dec(I, 1)} A` : '—']].concat(rows) },
      { k: 'i18n', path: 'elektrik.kablo.giris_kisa', label: 'Şemadaki kablo girişi yazısı', optional: true },
      { k: 'i18n', path: 'elektrik.kablo.tanim', label: 'Kablo tanımı' },
      { k: 'i18n', path: 'elektrik.kablo.tip', label: 'Kablo tipi', optional: true },
      { k: 'list', path: 'elektrik.kablo.sartlar', label: 'Müşteri tesisatında zorunlu olanlar', title: (it) => S.txt(it) || t_('(boş)'), blank: S.blank3, item: [{ k: 'i18n', path: '', label: 'Madde' }] }
    ], ctx);
  }

  /* ─────────────────────────── Eylemler ─────────────────────────── */

  async function act(name) {
    if (name === 'cover') return LayoutStudio.open();
    if (name === 'picker') return setMode('picker');
    if (name === 'views') return viewsModal();
    if (name === 'openFolder') return api('POST', '/api/open', { name: state.name }).catch((e) => toast(e.message, 'error'));
    if (name === 'addPoint') return pointKeyModal(null);
    if (name === 'uploadStep') return uploadStep();
    if (name === 'uploadPdf') return uploadPdf();
    if (name === 'addCable') {
      try {
        const tpl = await api('GET', '/api/template');
        const k = clone((tpl.elektrik || {}).kablo || { damar_sayisi: 5, kesit_mm2: 16, yapi: '3P + N + PE', uzunluklar_m: [5, 10, 15, 20], rcd_ma: 30, rho_ohm_mm2_m: 0.0225, sartlar: [] });
        change(['elektrik', 'kablo'], k, { rerender: true });
        toast(t_('Kablo bölümü şablondan eklendi; kesiti sigortaya göre kontrol edin.'));
      } catch (e) { toast(e.message, 'error'); }
      return null;
    }
    if (name === 'stdNote') {
      const notes = Array.isArray(state.data.geometri.notlar) ? state.data.geometri.notlar.slice() : [];
      const std = [
        { tr: 'Makinenin her yönünde 1000 mm servis alanı boş bırakılmalıdır.', en: 'A service area of 1000 mm must be kept clear on all sides of the machine.', de: 'Rund um die Maschine ist ein Servicebereich von 1000 mm freizuhalten.' },
        { tr: 'Makine ayarlı ayaklarla, su terazisi kullanılarak boyuna ve enine teraziye alınır; zemin düz ve yük taşıyabilen beton olmalıdır.',
          en: 'The machine is levelled lengthwise and crosswise on its adjustable feet using a spirit level; the floor must be flat, load-bearing concrete.',
          de: 'Die Maschine wird auf den Stellfüßen mit einer Wasserwaage längs und quer ausgerichtet; der Boden muss eben und tragfähig (Beton) sein.' }
      ];
      let added = 0;
      std.forEach((n) => {
        if (!notes.some((x) => S.txt(x) === n.tr)) {
          notes.push(n);
          added += 1;
        }
      });
      change(['geometri', 'notlar'], notes, { rerender: true });
      toast(added ? t_('{n} standart not eklendi.', { n: added }) : t_('Standart notlar zaten var.'));
    }
    return null;
  }

  async function uploadStep() {
    const f = await pickFile('.step,.stp,.STEP,.STP');
    if (!f) return;
    modal(`<h2>${esc(t_('STEP yükleniyor'))}</h2><p class="modal-sub">${esc(f.name)} · ${fmtSize(f.size)}</p><div class="progress"><div id="upBar"></div></div><div class="modal-actions"><span class="left" id="upTxt"></span></div>`);
    try {
      await flushSave();
      await upload(state.name, 'step', f, (x) => {
        $('upBar').style.width = `${Math.round(x * 100)}%`;
        $('upTxt').textContent = `%${Math.round(x * 100)}`;
      });
      closeModal();
      await reloadDetail(true);
      toast(t_('STEP yüklendi. Görünümleri üretin.'));
      viewsModal(true);
    } catch (e) {
      closeModal();
      toast(e.message, 'error');
    }
  }

  async function uploadPdf() {
    const f = await pickFile('.pdf,application/pdf');
    if (!f) return;
    try {
      await upload(state.name, 'pdf', f);
      await reloadDetail();
      toast(t_('{f} eklendi (ana ölçüler imalat resminden alınır).', { f: f.name }));
    } catch (e) { toast(e.message, 'error'); }
  }

  function viewsModal(fresh) {
    const d = state.detail;
    if (!d.step) {
      toast(t_('Önce STEP dosyası yükleyin.'), 'error');
      return;
    }
    const top = d.cfg && d.cfg.views && d.cfg.views.top && d.cfg.views.top.R;
    const up = top ? axName(top[2]) : '+Y';
    const front = top ? axName(top[1].map((x) => -x)) : '+Z';
    const hasGeo = Number((state.data.geometri || {}).boy) > 0;
    const axis = (id, def) => `<select id="${id}" class="field-input">${AXES.map((a) => `<option${a === def ? ' selected' : ''}>${a}</option>`).join('')}</select>`;
    const L = (s, p) => esc(t_(s, p));
    const m = modal(`<h2>${L('Görünümleri üret')}</h2>
      <p class="modal-sub">${L('{s} · üst, ön, arka, yan ve izometrik görünümler VTK ile üretilir. Elle eklenen yakın detay görünümleri korunur.', { s: d.step })}</p>
      <div class="modal-grid">
        <div class="field"><label for="vwUp">${L('Yukarı eksen')}</label>${axis('vwUp', up)}</div>
        <div class="field"><label for="vwFront">${L('Operatör tarafı')}</label>${axis('vwFront', front)}</div>
      </div>
      <label class="switch-row"><span>${L('Makine kutusunu ve oranlı noktaları STEP\'ten doldur')}</span><input type="checkbox" id="vwGeo"${!hasGeo || fresh ? ' checked' : ''}></label>
      <label class="switch-row"><span>${L('STEP\'i yeniden oku (dosya değiştiyse; büyük dosyada birkaç dakika)')}</span><input type="checkbox" id="vwRead"${fresh ? ' checked' : ''}></label>
      <div class="modal-actions"><button type="button" class="btn" data-a="no">${L('Vazgeç')}</button><button type="button" class="btn btn-primary" data-a="ok">${L('Çalıştır')}</button></div>`);
    m.addEventListener('click', async (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (a === 'no') closeModal();
      if (a !== 'ok') return;
      try {
        await flushSave();
        await api('POST', '/api/pipeline', { name: state.name, up: $('vwUp').value, front: $('vwFront').value, auto_geometry: $('vwGeo').checked, force_read: $('vwRead').checked });
        jobModal('pipeline');
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  /** İndir: biçim (PDF / HTML), diller (birden çoksa arka arkaya tek dosya), bölümler; dosya proje klasörüne de kaydedilir */
  function pdfDialog() {
    if (state.template) return;
    if (!state.detail.views_meta) {
      toast(t_('İndirmek için önce görünümleri üretin.'), 'error');
      return;
    }
    const { numbers, has } = S.docNumbers(state.data, state.detail.views_meta);
    const secs = S.SECTIONS.filter((s) => s.doc && s.doc !== 'kapak' && has[s.id]);
    const L = (s, p) => esc(t_(s, p));
    let fmt = 'pdf';
    try { if (localStorage.getItem('layout-export-fmt') === 'html') fmt = 'html'; } catch (e) { /* yok */ }
    const m = modal(`<h2>${L('İndir')}</h2>
      <p class="modal-sub">${L('Sıra: kapak, antetli sayfalar. Birden çok dil seçilirse her dil kapağıyla birlikte TR, EN, DE sırasıyla tek dosyada birleşir.')}</p>
      <div class="pdf-langs"><span>${L('Biçim')}</span>
        <div class="seg" id="exFmt" role="group"><button type="button" data-fmt="pdf">PDF</button><button type="button" data-fmt="html">HTML</button></div></div>
      <div class="pdf-langs"><span>${L('Diller')}</span>${['tr', 'en', 'de'].map((l) => `<label class="pdf-lang${l === state.lang ? ' is-on' : ''}"><input type="checkbox" name="pl" value="${l}"${l === state.lang ? ' checked' : ''}> ${l.toUpperCase()}</label>`).join('')}</div>
      <div class="field"><label class="field-label"><span>${L('Bölümler')}</span></label>
        <div class="pdf-secs">
          <label class="all"><input type="checkbox" id="psAll" checked> ${L('Tümü')}</label>
          <label><input type="checkbox" name="ps" value="kapak" checked> ${L('Kapak')}</label>
          ${secs.map((s) => `<label><input type="checkbox" name="ps" value="${s.doc}" checked> ${numbers[s.id]}. ${esc(t_(s.title))}</label>`).join('')}
        </div></div>
      <div class="note-box" id="exNote"></div>
      <div class="modal-actions"><span class="left" id="pdfStatus"></span><button type="button" class="btn" data-a="no">${L('İptal')}</button><button type="button" class="btn" data-a="print" id="exPrint">${L('Tarayıcıda yazdır')}</button><button type="button" class="btn btn-primary" data-a="ok" id="exGo"></button></div>`, 'wide');
    const setFmt = (f) => {
      fmt = f;
      try { localStorage.setItem('layout-export-fmt', f); } catch (e) { /* yok */ }
      m.querySelectorAll('[data-fmt]').forEach((b) => b.classList.toggle('active', b.dataset.fmt === f));
      $('exGo').textContent = f === 'html' ? t_('HTML indir') : (WEB ? t_('PDF olarak kaydet') : t_('PDF indir'));
      $('exPrint').classList.toggle('hidden', f === 'html' || WEB);
      $('exNote').textContent = f === 'html'
        ? t_('HTML: tek dosya, internet ve program gerekmez; seçilen diller arka arkaya. Açınca sağ üstteki "Yazdır" düğmesiyle PDF de alınır.')
        : WEB ? t_('PDF: tarayıcının yazdırma penceresi açılır; Hedef olarak "PDF olarak kaydet" seçin (A3 yatay, kenar boşluğu yok). Seçilen diller arka arkaya tek dosya olur.')
          : t_('PDF: A3 yatay, vektörel. Dosya proje klasörüne kaydedilir ve indirilir. "Tarayıcıda yazdır" sunucu olmadan da çalışır (Hedef: "PDF olarak kaydet").');
    };
    setFmt(fmt);
    const boxes = () => [...m.querySelectorAll('input[name=ps]')];
    m.addEventListener('change', (e) => {
      if (e.target.name === 'pl') e.target.parentElement.classList.toggle('is-on', e.target.checked);
      if (e.target.id === 'psAll') boxes().forEach((b) => { b.checked = e.target.checked; });
      if (e.target.name === 'ps') $('psAll').checked = boxes().every((b) => b.checked);
    });
    const choice = () => {
      const langs = ['tr', 'en', 'de'].filter((l) => m.querySelector(`input[name=pl][value=${l}]`).checked);
      const sel = boxes().filter((b) => b.checked).map((b) => b.value);
      const cover = sel.includes('kapak');
      const only = sel.filter((x) => x !== 'kapak');
      const all = boxes().every((b) => b.checked);
      return { langs, cover, only: all ? null : only, empty: !sel.length };
    };
    m.addEventListener('click', async (e) => {
      if (e.target.dataset && e.target.dataset.fmt) {
        setFmt(e.target.dataset.fmt);
        return;
      }
      const a = e.target.dataset && e.target.dataset.a;
      if (a === 'no') closeModal();
      if (a !== 'ok' && a !== 'print') return;
      const c = choice();
      if (!c.langs.length) {
        $('pdfStatus').textContent = t_('En az bir dil seçin.');
        return;
      }
      if (c.empty) {
        $('pdfStatus').textContent = t_('En az bir bölüm seçin.');
        return;
      }
      if (a === 'print' || (a === 'ok' && fmt === 'pdf' && WEB)) {
        const w = frameWin();
        if (!(w && w.LBDoc && w.LBDoc.print)) {
          $('pdfStatus').textContent = t_('Önizleme henüz hazır değil; birkaç saniye sonra tekrar deneyin.');
          return;
        }
        closeModal();
        w.focus();
        w.LBDoc.print(c.langs, { only: c.only || undefined, cover: c.cover });
        return;
      }
      e.target.disabled = true;
      $('pdfStatus').textContent = fmt === 'html' ? t_('HTML hazırlanıyor…') : t_('PDF hazırlanıyor…');
      try {
        await flushSave();
        const file = `${LayoutKaynak.fileName(state.data)}-${c.langs.map((l) => l.toUpperCase()).join('-')}${c.only || !c.cover ? '-secim' : ''}`;
        if (fmt === 'html') {
          const html = await buildDoc({ export: { langs: c.langs, only: c.only, cover: c.cover } });
          downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${file}.html`);
          closeModal();
          if (!WEB) {
            await api('POST', '/api/savefile', { name: state.name, file: `${file}.html`, text: html });
            toast(t_('Kaydedildi: {p}', { p: `projects/${state.name}/${file}.html` }));
            reloadDetail();
          } else toast(t_('İndirildi: {f}', { f: `${file}.html` }));
        } else {
          const html = await buildDoc({});
          const r = await api('POST', '/api/print', { name: state.name, html, file: `${file}.pdf`, langs: c.langs, secs: c.only, cover: c.cover });
          closeModal();
          const link = document.createElement('a');
          link.href = `${r.url}?dl=1`;
          link.download = r.file;
          document.body.appendChild(link);
          link.click();
          link.remove();
          toast(t_('Kaydedildi: {p}', { p: `projects/${state.name}/${r.file}` }));
          reloadDetail();
        }
      } catch (err) {
        e.target.disabled = false;
        $('pdfStatus').textContent = fmt === 'html'
          ? t_('HTML üretilemedi: {e}', { e: err.message })
          : t_('PDF üretilemedi: {e}. "Tarayıcıda yazdır" ile alabilirsiniz.', { e: err.message });
      }
    });

  }

  /* ─── Arka plan işleri (boru hattı, teslim paftası) ─── */

  function jobModal(kind) {
    const name = state.name;
    const L = (s) => esc(t_(s));
    const title = kind === 'build' ? L('Teslim paftası üretiliyor') : L('Görünümler üretiliyor');
    const sub = kind === 'build' ? L('HTML yazılır, TR / EN / DE PDF headless tarayıcıyla basılıp gömülür (yaklaşık yarım dakika).') : L('STEP okuma → üçgenleme → VTK görünümler → geometri → önizleme. Büyük dosyada birkaç dakika sürer; pencereyi kapatabilirsiniz, iş sürer.');
    modal(`<h2>${title}</h2><p class="modal-sub">${sub}</p>
      <div class="job-head" id="jobHead"><span class="spin"></span><span id="jobStep">${L('Başlıyor…')}</span></div>
      <pre class="log" id="jobLog"></pre>
      <div class="modal-actions"><button type="button" class="btn" id="jobClose">${L('Arka planda sürsün')}</button></div>`, 'xwide');
    $('jobClose').addEventListener('click', closeModal);
    pollJob(name, kind);
  }

  function stopJobPoll() {
    clearInterval(state.jobTimer);
    state.jobTimer = null;
  }

  function pollJob(name, kind) {
    stopJobPoll();
    const tick = async () => {
      let s;
      try { s = await api('GET', `/api/status?name=${encodeURIComponent(name)}`); } catch (e) { return; }
      const secs = s.t0 ? Math.round(Date.now() / 1000 - s.t0) : 0;
      const job = $('statusJob');
      job.className = `job${s.state === 'error' ? ' err' : s.state === 'done' ? ' ok' : ''}`;
      job.textContent = s.state === 'running' ? `${kind === 'build' ? t_('Pafta') : t_('Görünümler')}: ${s.step} · ${secs} ${t_('sn')}`
        : s.state === 'done' ? t_('İşlem tamamlandı') : s.state === 'error' ? t_('İşlem hatası – günlüğe bakın') : '';
      const log = $('jobLog');
      if (log) {
        const atEnd = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
        log.textContent = (s.log || []).join('\n');
        if (atEnd) log.scrollTop = log.scrollHeight;
        $('jobStep').textContent = `${s.step || ''}${secs ? ` · ${secs} ${t_('sn')}` : ''}`;
        $('jobHead').className = `job-head${s.state === 'done' ? ' done' : s.state === 'error' ? ' err' : ''}`;
      }
      if (s.state !== 'running') {
        stopJobPoll();
        if ($('jobClose')) $('jobClose').textContent = t_('Kapat');
        if (s.state === 'done' && name === state.name) {
          // boru hattı veriyi (geometri, noktalar) değiştirir; pafta üretimi yalnız dosya durumunu
          await reloadDetail(kind !== 'build');
          if (kind === 'build') {
            const doc = state.detail.doc || {};
            toast(t_('Pafta üretildi: {n}', { n: `${doc.name || ''}${doc.pdf ? ' (' + t_('PDF gömülü') + ')' : ''}` }));
          } else toast(t_('Görünümler üretildi.'));
          setTimeout(() => { if ($('jobLog')) closeModal(); }, 1200);
        } else if (s.state === 'error') {
          toast(t_('İşlem hata verdi; günlüğe bakın.'), 'error');
        }
        setTimeout(() => { if (!state.jobTimer) $('statusJob').textContent = ''; }, 8000);
      }
    };
    tick();
    state.jobTimer = setInterval(tick, 1300);
  }

  /** Sunucudaki proje bilgisini tazeler (dataToo değilse düzenlemeler korunur) */
  async function reloadDetail(dataToo) {
    if (!state.name) return;
    await flushSave();
    try {
      const d = await api('GET', `/api/project?name=${encodeURIComponent(state.name)}`);
      state.detail = d;
      if (dataToo) {
        state.data = d.data;
        state.baseMtime = d.veriMtime;
        resetHistory();
      } else {
        d.data = state.data;
      }
      recheck(true);
      renderAll();
      if (d.views_meta) {
        setMode(state.mode === 'picker' ? 'picker' : 'doc');
        if (dataToo) loadPreview(true);
      } else emptyState();
      updateCvInfo();
    } catch (e) { toast(e.message, 'error'); }
  }

  /* ─── Kapak tasarımı ayarı ─── */

  const coverDesign = () => state.settings.kapakTasarimi || 'bant';
  async function setCoverDesign(id) {
    try {
      state.settings = await api('PUT', '/api/settings', { kapakTasarimi: id });
      if (state.name) {
        await reloadDetail();
        schedulePreview();
      }
      return true;
    } catch (e) {
      toast(e.message, 'error');
      return false;
    }
  }

  /* ─── Program dili ─── */

  function onUiLang() {
    LayoutI18n.apply(document);
    if (state.db) onDbStatus(state.db);
    if (!$('home').classList.contains('hidden')) {
      document.title = t_('Layout Çizim Motoru');
      drawCards();
      if (!$('homeDb').classList.contains('hidden')) renderDb();
    } else if (state.data) {
      setWorkspaceMode();
      recheck(true);
      renderAll();
      if (state.mode === 'picker') renderPicker();
      if (!state.detail.views_meta || state.template) emptyState();
      if (LayoutStudio.isOpen()) {
        LayoutStudio.close();
        LayoutStudio.open();
      }
    }
  }

  /* ─────────────────────────── Olaylar ─────────────────────────── */

  function onKey(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      if (modalOpen()) {
        closeModal();
        e.preventDefault();
        return;
      }
      if (LayoutStudio.isOpen()) {
        LayoutStudio.close();
        e.preventDefault();
      }
      return;
    }
    if ($('app').classList.contains('hidden')) return;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveNow(true);
      return;
    }
    if (mod && e.key.toLowerCase() === 'p' && !state.template) {
      e.preventDefault();
      pdfDialog();
      return;
    }
    const inField = /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '');
    if (mod && !inField && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (mod && !inField && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  }

  function bind() {
    document.querySelectorAll('.home-tab').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.homeTab === 'template') openTemplate();
      else selectHomeTab(b.dataset.homeTab);
    }));
    $('dbChip').addEventListener('click', () => {
      if (state.db && state.db.connected && !state.db.error) syncNow();
      else showHome().then(() => selectHomeTab('db'));
    });
    document.querySelectorAll('[data-ui-lang]').forEach((b) => b.addEventListener('click', () => LayoutI18n.set(b.dataset.uiLang)));
    LayoutI18n.onChange(onUiLang);
    $('btnNewProject').addEventListener('click', newProjectModal);
    // PWA: tarayıcı yüklemeye izin verince "Uygulamayı yükle" görünür
    let installEvt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      installEvt = e;
      $('btnInstall').classList.remove('hidden');
    });
    window.addEventListener('appinstalled', () => { installEvt = null; $('btnInstall').classList.add('hidden'); });
    $('btnInstall').addEventListener('click', async () => {
      if (!installEvt) return;
      installEvt.prompt();
      try { await installEvt.userChoice; } catch (e) { /* vazgeçildi */ }
      installEvt = null;
      $('btnInstall').classList.add('hidden');
    });
    $('projSearch').addEventListener('input', drawCards);
    $('projectList').addEventListener('click', (e) => {
      const card = e.target.closest('.project-card');
      if (card) openProject(card.dataset.name);
    });
    $('btnHome').addEventListener('click', showHome);
    $('btnUndo').addEventListener('click', undo);
    $('btnRedo').addEventListener('click', redo);
    $('btnSave').addEventListener('click', () => saveNow(true));
    $('btnCover').addEventListener('click', () => LayoutStudio.open());
    $('btnViews').addEventListener('click', () => viewsModal());
    $('btnPdf').addEventListener('click', pdfDialog);
    $('btnRefresh').addEventListener('click', () => refreshPreview());
    $('btnRetry').addEventListener('click', async () => {
      await heartbeat();
      if (state.online) {
        toast(t_('Bağlantı yeniden kuruldu.'));
        if (state.name) reloadDetail();
        else renderProjects();
      } else toast(t_('Uygulama sunucusuna ulaşılamıyor'), 'error');
    });
    $('docLang').addEventListener('click', (e) => { if (e.target.dataset.lang) setDocLang(e.target.dataset.lang); });
    $('cvMode').addEventListener('click', (e) => { if (e.target.dataset.mode) setMode(e.target.dataset.mode); });
    $('sectionList').addEventListener('click', (e) => {
      const r = e.target.closest('.sec-row');
      if (r) selectSection(r.dataset.sec);
    });
    document.querySelectorAll('.left-panel .panel-tab').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('.left-panel .panel-tab').forEach((x) => x.classList.toggle('active', x === b));
      $('tab-sections').classList.toggle('hidden', b.dataset.tab !== 'sections');
      $('tab-files').classList.toggle('hidden', b.dataset.tab !== 'files');
    }));
    document.querySelectorAll('.right-panel .panel-tab').forEach((b) => b.addEventListener('click', () => selectRightTab(b.dataset.tab)));
    $('checkList').addEventListener('click', (e) => {
      const r = e.target.closest('.check-row');
      if (r) onCheckClick(Number(r.dataset.i));
    });
    $('fileList').addEventListener('click', (e) => {
      const f = e.target.closest('.file-row');
      if (f) return openFile(f);
      if (e.target.dataset.act) act(e.target.dataset.act);
      return null;
    });
    $('cvEmpty').addEventListener('click', (e) => { if (e.target.dataset.act) act(e.target.dataset.act); });
    $('picker').addEventListener('click', (e) => {
      const k = e.target.closest('.pk-key');
      if (k) {
        state.pickKey = k.dataset.key;
        document.querySelectorAll('.pk-key').forEach((x) => x.classList.toggle('active', x === k));
        drawMarkers();
        if (state.section === 'noktalar') renderInspector();
        return;
      }
      if (e.target.dataset.act) {
        act(e.target.dataset.act);
        return;
      }
      pickAt(e);
    });
    $('preview').addEventListener('load', onFrameLoad);
    document.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', () => {
      // sunucuya "sayfa kapandı": başka pencere / sekme açık değilse uygulama kendini kapatır
      if (WEB) return;
      try { navigator.sendBeacon('/api/bye'); } catch (e) { /* yok */ }
      if (state.dirty && state.name && !state.template) {
        try {
          fetch('/api/save', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: state.name, data: state.data }) });
        } catch (e) { /* sayfa kapanıyor */ }
      }
    });
    window.addEventListener('beforeunload', (e) => {
      if (state.dirty && state.template) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    setInterval(heartbeat, 30000);
    heartbeat();
  }

  async function init() {
    LayoutI18n.apply(document);
    document.title = t_('Layout Çizim Motoru');
    try { const l = localStorage.getItem('layout-app-lang'); if (B.TEXT[l]) state.lang = l; } catch (e) { /* yok */ }
    try { state.settings = await api('GET', '/api/settings'); } catch (e) { /* varsayılan */ }
    LayoutStudio.init({
      data: () => state.data,
      change: (p, v, o) => change(p, v, o),
      coverDesign,
      setCoverDesign,
      pageCount: () => state.pageTotal,
      docLang: () => state.lang,
      setDocLang,
      saveNow,
      pdfDialog,
      toast,
      afterStudio: () => {
        if (state.data) {
          renderInspector();
          renderSections();
          renderChecks();
        }
      }
    });
    bind();
    // Yer imi / doğrudan bağlantı: ?p=<proje>&s=<bölüm>&tab=edit|checks&mode=picker&studio=1&pdf=1 · ?new=1 · ?sablon=1 · ?ui=en
    const q = new URLSearchParams(location.search);
    await renderProjects();
    if (q.get('db') === '1') selectHomeTab('db');
    if (q.get('new') === '1') newProjectModal();
    else if (q.get('sablon') === '1') openTemplate();
    else if (q.get('p')) {
      await openProject(q.get('p'), { section: q.get('s') || undefined });
      if (q.get('s')) selectSection(q.get('s'), { keepTab: true });
      if (q.get('tab')) selectRightTab(q.get('tab'));
      if (q.get('mode') === 'picker') setMode('picker');
      if (q.get('studio') === '1') LayoutStudio.open();
      if (q.get('pdf') === '1') pdfDialog();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  return { state, openProject, showHome };
})();
