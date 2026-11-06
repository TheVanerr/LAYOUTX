/* Kapak stüdyosu – P&PX'teki ile aynı: üstte bilgi kutuları, ortada seçili kapak, sağda üç tasarım.
   Seçilen tasarım tools/ayarlar.json'a yazılır ve tüm projelerde kullanılır. */

const LayoutStudio = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => LayoutForm.esc(v);
  const B = () => LayoutBelge;

  const FIELDS = [
    { key: 'seri_no', label: 'Proje No' },
    { key: 'musteri', label: 'Müşteri', mixed: true },
    { key: 'model', label: 'Model' },
    { key: 'tam_ad', label: 'Tip', mixed: true },
    { key: 'hazirlayan', label: 'Hazırlayan' },
    { key: 'kontrol', label: 'Kontrol' },
    { key: 'onay', label: 'Onay' },
    { key: 'tarih', label: 'Tarih', type: 'date' },
    { key: 'rev', label: 'Rev.' },
    { key: 'firma', label: 'Marka', options: () => B().BRAND_LIST }
  ];

  let app = null;
  let lang = 'tr';
  let timer = null;
  const studio = () => $('coverStudio');
  const isOpen = () => !studio().classList.contains('hidden');
  const logos = () => ({ dolfin: '/belge/logos/dolfin.png', enva: '/belge/logos/enva.svg', vico: '/belge/logos/vico.png', ksystem: '/belge/logos/ksystem.png' });

  function value(f) {
    const m = app.data().makine || {};
    const v = m[f.key];
    if (f.type === 'date') return LayoutForm.toIso(v);
    if (f.key === 'firma') return v || 'DOLFIN';
    if (v && typeof v === 'object') return v[lang] || v.tr || '';
    return v == null ? '' : v;
  }

  function fieldHtml(f) {
    const v = value(f);
    const id = `csf-${f.key}`;
    const control = f.options
      ? `<select id="${id}" class="field-input" data-field="${f.key}">${f.options().map(([o, t]) => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`
      : `<input id="${id}" class="field-input" data-field="${f.key}" type="${f.type || 'text'}" value="${esc(v)}" autocomplete="off">`;
    return `<div class="field"><label for="${id}">${esc(t_(f.label))}${f.mixed && typeof (app.data().makine || {})[f.key] === 'object' ? ` <span style="opacity:.6">(${lang.toUpperCase()})</span>` : ''}</label>${control}</div>`;
  }

  const stateText = (on) => (on ? t_('✓ Seçili kapak') : t_('Bu kapağı kullan'));

  function renderShell() {
    const design = app.coverDesign();
    studio().innerHTML = `
      <header class="cs-bar">
        <div class="cs-title">
          <h2>${esc(t_('Kapak'))}</h2>
          <span>${esc(t_('A3 yatay. Bilgileri yukarıdan değiştirin, kullanmak istediğiniz tasarımı sağdan seçin.'))}</span>
        </div>
        <div class="cs-actions">
          <span class="lang-label">${esc(t_('Belge dili'))}</span>
          <div class="seg" role="group" aria-label="Belge dili">${['tr', 'en', 'de'].map((l) => `<button type="button" data-cs-lang="${l}" class="${l === lang ? 'active' : ''}">${l.toUpperCase()}</button>`).join('')}</div>
          <button type="button" class="btn btn-sm" id="csSave">${esc(t_('Projeyi Kaydet'))}</button>
          <button type="button" class="btn btn-sm btn-primary" id="csPdf">${esc(t_('İndir (PDF / HTML)'))}</button>
          <button type="button" class="icon-btn" id="csClose" title="${esc(t_('Kapat (Esc)'))}">×</button>
        </div>
      </header>
      <div class="cs-fields">${FIELDS.map(fieldHtml).join('')}</div>
      <div class="cs-body">
        <div class="cs-stage" id="csStage"><div class="cs-sheet" data-sheet="stage"></div></div>
        <div class="cs-rail">
          ${B().DESIGNS.map((d) => `
            <div class="cs-card${d.id === design ? ' selected' : ''}" data-design="${d.id}" role="button" tabindex="0">
              <div class="cs-card-head"><span class="cs-card-name">${esc(t_(d.name))}</span><span class="cs-card-state">${stateText(d.id === design)}</span></div>
              <div class="cs-sheet-area"><div class="cs-sheet" data-sheet="${d.id}"></div></div>
              <div class="cs-card-hint">${esc(t_(d.hint))}</div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function renderPreviews() {
    if (!isOpen()) return;
    const meta = app.data().makine || {};
    const pages = app.pageCount();
    studio().querySelectorAll('.cs-sheet').forEach((host) => {
      const design = host.dataset.sheet === 'stage' ? app.coverDesign() : host.dataset.sheet;
      host.replaceChildren(B().cover(design, meta, lang, { logos: logos(), pages: pages || '' }));
    });
    fit();
  }

  function scaleSheet(sheet, k) {
    sheet.style.width = `${B().PAGE_W * k}px`;
    sheet.style.height = `${B().PAGE_H * k}px`;
    sheet.style.setProperty('--cs-k', k);
  }

  function fit() {
    if (!isOpen()) return;
    const stage = $('csStage');
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    scaleSheet(stage.querySelector('.cs-sheet'), Math.max(0.1, Math.min(box.width / B().PAGE_W, box.height / B().PAGE_H)));
    studio().querySelectorAll('.cs-sheet-area').forEach((area) => {
      const r = area.getBoundingClientRect();
      scaleSheet(area.querySelector('.cs-sheet'), Math.max(0.05, Math.min(r.width / B().PAGE_W, r.height / B().PAGE_H)));
    });
  }

  function apply(key, raw) {
    const f = FIELDS.find((x) => x.key === key);
    const m = app.data().makine;
    let v = raw;
    if (f.type === 'date') v = LayoutForm.fromIso(raw);
    if (f.mixed && m[key] && typeof m[key] === 'object') {
      const obj = Object.assign({ tr: '', en: '', de: '' }, m[key]);
      obj[lang] = v;
      v = obj;
    }
    app.change(['makine', key], v, { fromStudio: true });
  }

  function bind() {
    const root = studio();
    root.addEventListener('input', (e) => {
      const key = e.target.dataset && e.target.dataset.field;
      if (!key) return;
      apply(key, e.target.value);
      clearTimeout(timer);
      timer = setTimeout(renderPreviews, 60);
    });
    root.addEventListener('change', (e) => {
      const key = e.target.dataset && e.target.dataset.field;
      if (!key) return;
      apply(key, e.target.value.trim());
      renderPreviews();
    });
    root.addEventListener('click', async (e) => {
      const lb = e.target.closest('[data-cs-lang]');
      if (lb) {
        lang = lb.dataset.csLang;
        app.setDocLang(lang);
        renderShell();
        renderPreviews();
        return;
      }
      const card = e.target.closest('.cs-card');
      if (card) {
        choose(card.dataset.design);
        return;
      }
      const id = e.target.id;
      if (id === 'csClose') close();
      else if (id === 'csSave') app.saveNow(true);
      else if (id === 'csPdf') app.pdfDialog();
    });
    root.addEventListener('keydown', (e) => {
      const card = e.target.closest && e.target.closest('.cs-card');
      if (card && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        choose(card.dataset.design);
      }
    });
    window.addEventListener('resize', fit);
  }

  async function choose(id) {
    if (id === app.coverDesign()) return;
    const ok = await app.setCoverDesign(id);
    studio().querySelectorAll('.cs-card').forEach((card) => {
      const on = card.dataset.design === app.coverDesign();
      card.classList.toggle('selected', on);
      card.querySelector('.cs-card-state').textContent = stateText(on);
    });
    renderPreviews();
    if (ok) {
      const d = B().DESIGNS.find((x) => x.id === id);
      app.toast(t_('"{n}" seçildi. Tüm projelerin kapağı bundan sonra bu olacak (paftaları yeniden üretin).', { n: t_(d.name) }));
    }
  }

  function open() {
    lang = app.docLang();
    renderShell();
    studio().classList.remove('hidden');
    renderPreviews();
    requestAnimationFrame(fit);
  }

  function close() {
    if (!isOpen()) return;
    studio().classList.add('hidden');
    studio().innerHTML = '';
    app.afterStudio();
  }

  function refresh() {
    if (isOpen()) renderPreviews();
  }

  function init(appRef) {
    app = appRef;
    bind();
  }

  return { init, open, close, isOpen, refresh };
})();
