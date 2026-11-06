/* Layout belgesi çalışma zamanı: kapak, antet, başlık bloğu ve sayfa dizgisi (A3 yatay).
   P&PX'teki kapak tasarımları (covers.js), antet (sheet.js renderLetterhead) ve başlık bloğu (ISO 7200) ile aynı düzen.
   Pafta HTML'ine build_layout.py tarafından gömülür; Layout Stüdyosu kapak önizlemesinde de aynı dosyayı kullanır. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.LayoutBelge = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MM = 96 / 25.4;
  const PAGE_W = 1587.4;
  const PAGE_H = 1122.5;

  /* A3 yatay sayfa geometrisi (mm) – P&ID ile aynı: antet çizgileri, ISO 5457 bölge çerçevesi, başlık bloğu */
  const GEO = {
    W: 420,
    H: 297,
    mx: 12,
    headerRule: 15.5,
    footerRule: 284,
    frame: { x0: 12, y0: 19, x1: 408, y1: 281 },
    inner: { x0: 16, y0: 23, x1: 404, y1: 277 },
    title: { x: 234, y: 241, w: 170, h: 36 }
  };
  /* İçerik akışı: iki sütun (P&ID açıklama sayfası) ya da tam genişlik; sağ sütun başlık bloğunun üstünde biter */
  const FLOW = { x: 21, y: 28, w: 378, colW: 185, colX: [21, 214], gap: 6, fit: 1 };

  const INK = '#000000';
  const GRAY = '#6b7280';
  const FONT = "Calibri, Carlito, 'Segoe UI', Selawik, Arial, sans-serif";
  const HEADER_FONT = "'Segoe UI', Selawik, Calibri, Carlito, Arial, sans-serif";

  const BRANDS = {
    DOLFIN: { type: 'text', name: 'DOLFIN', sub: 'Makine Sanayi', footer: 'CNK ELEKTRONİK MAKİNE SAN A.Ş.', color: '#ff0000', logo: 'dolfin' },
    ENVA: { type: 'logo', footer: 'Enva Specialist Waste Ltd', color: '#007938', logo: 'enva' },
    VICO: { type: 'logo', footer: 'vico AB', color: '#C41E3A', logo: 'vico' },
    KSYSTEM: { type: 'logo', footer: 'K.SYSTEM GMBH', color: '#1B04AE', logo: 'ksystem', label: 'K.SYSTEM' }
  };
  const BRAND_LIST = [['DOLFIN', 'DOLFIN'], ['ENVA', 'ENVA'], ['VICO', 'VICO'], ['KSYSTEM', 'K.SYSTEM']];

  const DESIGNS = [
    { id: 'bant', name: 'Kırmızı Bant', hint: 'Solda dikey bant, sağda bilgi listesi' },
    { id: 'ust', name: 'Üst Bant', hint: 'Üstte tam genişlik bant, altta bilgi tablosu' },
    { id: 'kose', name: 'Köşe Blok', hint: 'Köşede renkli blok, ortada büyük başlık' }
  ];
  const DEFAULT_DESIGN = 'bant';
  const MARK = 'LAYOUT';

  const TEXT = {
    tr: {
      drawing: 'Çizim Adı', project: 'Proje No', customer: 'Müşteri', model: 'Model', type: 'Tip',
      prepared: 'Hazırlayan', checked: 'Kontrol', approved: 'Onay', date: 'Tarih',
      docType: 'Belge Türü', docTypeValue: 'Yerleşim Planı', unit: 'Ölçü Birimi', scale: 'Ölçek', scaleValue: 'Ölçeksiz',
      rev: 'Rev.', sheet: 'Sayfa', revDesc: 'Açıklama', pages: 'Sayfa Sayısı',
      kicker: 'YERLEŞİM PLANI', std: 'Ölçüler mm', continued: ' (devam)', and: 've',
      pdf: 'PDF indir', print: 'Yazdır', langs: 'Diller', cancel: 'İptal', busy: 'PDF hazırlanıyor…',
      pdfNote: 'Seçilen diller sırayla (TR → EN → DE) kapaklarıyla birlikte tek PDF dosyasında birleştirilip indirilir (A3 yatay).'
    },
    en: {
      drawing: 'Drawing Title', project: 'Project No', customer: 'Customer', model: 'Model', type: 'Type',
      prepared: 'Prepared', checked: 'Checked', approved: 'Approved', date: 'Date',
      docType: 'Document Type', docTypeValue: 'Installation Layout', unit: 'Unit', scale: 'Scale', scaleValue: 'Not to scale',
      rev: 'Rev.', sheet: 'Sheet', revDesc: 'Description', pages: 'Pages',
      kicker: 'INSTALLATION LAYOUT', std: 'Dimensions in mm', continued: ' (continued)', and: 'and',
      pdf: 'Download PDF', print: 'Print', langs: 'Languages', cancel: 'Cancel', busy: 'Preparing PDF…',
      pdfNote: 'The selected languages are combined in order (TR → EN → DE), each with its cover, into one PDF file (A3 landscape).'
    },
    de: {
      drawing: 'Zeichnungstitel', project: 'Projekt-Nr.', customer: 'Kunde', model: 'Modell', type: 'Typ',
      prepared: 'Erstellt', checked: 'Geprüft', approved: 'Freigabe', date: 'Datum',
      docType: 'Dokumentart', docTypeValue: 'Aufstellungsplan', unit: 'Einheit', scale: 'Maßstab', scaleValue: 'Ohne Maßstab',
      rev: 'Rev.', sheet: 'Blatt', revDesc: 'Beschreibung', pages: 'Seiten',
      kicker: 'AUFSTELLUNGSPLAN', std: 'Maße in mm', continued: ' (Fortsetzung)', and: 'und',
      pdf: 'PDF herunterladen', print: 'Drucken', langs: 'Sprachen', cancel: 'Abbrechen', busy: 'PDF wird erstellt…',
      pdfNote: 'Die gewählten Sprachen werden nacheinander (TR → EN → DE) mit Deckblatt zu einer PDF-Datei zusammengefasst (A3 quer).'
    }
  };
  const LANGS = ['tr', 'en', 'de'];

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const n = (v) => +Number(v).toFixed(3);

  /** Düz metin ya da {tr, en, de} sözlüğü -> istenen dil (boşsa Türkçe) */
  function pick(v, lang) {
    if (v && typeof v === 'object' && !Array.isArray(v)) return String(v[lang] || v.tr || v.en || v.de || '');
    return v == null ? '' : String(v);
  }
  const upper = (s, lang) => String(s || '').toLocaleUpperCase(lang === 'tr' ? 'tr' : lang);

  /** "2026-10-23" -> "23.10.2026"; "23.10.2026" olduğu gibi */
  function formatDate(v) {
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : String(v || '');
  }

  function brandOf(meta) {
    return BRANDS[meta && meta.firma] || BRANDS.DOLFIN;
  }

  /** Kapak ve antette kullanılan bilgiler (makine bloğundan) */
  function infoFrom(meta, lang, opts) {
    const o = opts || {};
    const L = TEXT[lang] ? lang : 'tr';
    const brand = brandOf(meta);
    const logos = o.logos || {};
    return {
      lang: L,
      t: TEXT[L],
      brand,
      color: brand.color,
      logo: logos[brand.logo] || '',
      company: brand.footer || '',
      seriNo: pick(meta.seri_no, L),
      musteri: pick(meta.musteri, L),
      model: pick(meta.model, L),
      tamAd: pick(meta.tam_ad, L),
      hazirlayan: pick(meta.hazirlayan, L),
      kontrol: pick(meta.kontrol, L),
      onay: pick(meta.onay, L),
      tarih: formatDate(pick(meta.tarih, L)),
      rev: pick(meta.rev, L),
      revizyonlar: Array.isArray(meta.revizyonlar) ? meta.revizyonlar.filter((r) => r && (r.rev || r.aciklama)) : [],
      pages: o.pages
    };
  }

  /* ─────────────────────────── Kapak ─────────────────────────── */

  function titleSize(text, sizes) {
    const len = String(text).length;
    if (len <= 10) return sizes[0];
    if (len <= 16) return sizes[1];
    if (len <= 24) return sizes[2];
    if (len <= 34) return sizes[3];
    return sizes[4];
  }

  function coverParts(I) {
    const logoImg = I.logo ? `<img class="pcv-logo" src="${esc(I.logo)}" alt="">` : `<div class="pcv-logo"></div>`;
    const kicker = `<div class="pcv-kicker">${esc(I.t.kicker)}</div>`;
    const modelUp = upper(I.model, I.lang);
    const title = (sizes) => `<h1 class="pcv-title" style="font-size:${titleSize(modelUp, sizes)}px">${esc(modelUp)}</h1>`;
    const customer = `<div class="pcv-customer">${esc(upper(I.musteri, I.lang))}</div>`;
    const type = I.tamAd && I.tamAd !== I.model ? `<div class="pcv-type">${esc(I.tamAd)}</div>` : '';
    const box = (label, name) => `<div class="pcv-sign-box"><span>${esc(label)}</span><b>${esc(name)}</b></div>`;
    const sign = `<div class="pcv-sign">${box(I.t.prepared, I.hazirlayan)}${box(I.t.checked, I.kontrol)}${box(I.t.approved, I.onay)}</div>`;
    const fields = [
      [I.t.project, I.seriNo, true],
      [I.t.customer, I.musteri],
      [I.t.model, I.model],
      [I.t.docType, I.t.docTypeValue],
      [I.t.unit, 'mm'],
      [I.t.rev, I.rev],
      [I.t.date, I.tarih],
      [I.t.pages, I.pages == null ? '' : I.pages]
    ];
    const list = fields.map(([l, v, s]) => `<div class="pcv-row"><dt>${esc(l)}</dt><dd${s ? ' class="strong"' : ''}>${esc(v)}</dd></div>`).join('');
    const cells = fields.map(([l, v, s]) => `<div class="pcv-cell"><span>${esc(l)}</span><b${s ? ' class="strong"' : ''}>${esc(v)}</b></div>`).join('');
    return { logoImg, kicker, title, customer, type, sign, list, cells };
  }

  const RENDER = {
    bant(I, p) {
      return `
        <aside class="pcv-band"><span class="pcv-band-std">${esc(I.t.std)}</span><span class="pcv-band-mark">${MARK}</span></aside>
        <div class="pcv-main">
          ${p.logoImg}
          <div class="pcv-body">
            <div class="pcv-head">${p.kicker}${p.title([104, 86, 68, 54, 44])}<div class="pcv-rule"></div>${p.customer}${p.type}</div>
            <dl class="pcv-list">${p.list}</dl>
          </div>
          ${p.sign}
          <div class="pcv-foot">${esc(I.company)}</div>
        </div>`;
    },
    ust(I, p) {
      return `
        <section class="pcv-u-band">
          <span class="pcv-u-std">${esc(I.t.std)}</span><span class="pcv-u-mark">${MARK}</span>
          <div class="pcv-u-text">${p.kicker}${p.title([118, 98, 78, 62, 50])}${p.customer}${p.type}</div>
        </section>
        <section class="pcv-u-lower">
          <div class="pcv-u-left">${p.logoImg}<div class="pcv-foot">${esc(I.company)}</div></div>
          <div class="pcv-u-right"><div class="pcv-cells">${p.cells}</div>${p.sign}</div>
        </section>`;
    },
    kose(I, p) {
      return `
        <div class="pcv-k-top"></div><div class="pcv-k-side"></div>
        <div class="pcv-k-block"><span>${esc(I.t.std)}</span><b>${MARK}</b></div>
        <div class="pcv-k-logo">${p.logoImg}</div>
        <div class="pcv-k-head">${p.kicker}${p.title([112, 92, 72, 58, 46])}<div class="pcv-rule"></div>${p.customer}${p.type}</div>
        <div class="pcv-k-lower"><div class="pcv-cells">${p.cells}</div>${p.sign}</div>
        <div class="pcv-k-foot pcv-foot">${esc(I.company)}</div>`;
    }
  };

  /** Kapak sayfası (A3 yatay, 1587 × 1122 px). opts: { logos, pages } */
  function cover(design, meta, lang, opts) {
    const id = RENDER[design] ? design : DEFAULT_DESIGN;
    const I = infoFrom(meta || {}, lang, opts);
    const page = document.createElement('div');
    page.className = `lb-print pcv pcv-${id}`;
    page.lang = I.lang;
    page.style.setProperty('--pcv-accent', I.color);
    page.innerHTML = RENDER[id](I, coverParts(I));
    return page;
  }

  /* ─────────────────────────── Antet + çerçeve + başlık bloğu (SVG, mm) ─────────────────────────── */

  function textEl(x, y, value, opts) {
    const o = opts || {};
    const size = o.size || 3;
    const baseline = o.middle ? y + size * 0.35 : y;
    return `<text x="${n(x)}" y="${n(baseline)}" font-size="${n(size)}" font-family="${o.font || FONT}"` +
      ` fill="${o.fill || INK}" stroke="none"` +
      `${o.anchor ? ` text-anchor="${o.anchor}"` : ''}` +
      `${o.bold ? ' font-weight="700"' : ''}` +
      `${o.spacing ? ` letter-spacing="${o.spacing}"` : ''}>${esc(value)}</text>`;
  }

  /** Yazının hücreye sığması için punto (Calibri ortalama harf genişliği ≈ 0,5 em) */
  function fitSize(text, width, size, min) {
    const est = String(text).length * size * 0.5;
    if (est <= width) return size;
    return Math.max(min || 1.6, size * width / est);
  }

  function clip(text, width, size) {
    const max = Math.floor(width / (size * 0.5));
    const s = String(text);
    return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
  }

  function letterhead(I, pageNo) {
    const g = GEO;
    const color = I.color;
    const parts = [];
    const baseline = g.headerRule - 3.4;
    if (I.brand.type === 'logo' && I.logo) {
      parts.push(`<image href="${esc(I.logo)}" x="${g.mx}" y="${baseline - 5}" height="6.5" width="40" preserveAspectRatio="xMinYMid meet"/>`);
    } else {
      const name = I.brand.name || '';
      parts.push(textEl(g.mx, baseline, name, { size: 6, bold: true, fill: color, font: HEADER_FONT, spacing: 0.15 }));
      parts.push(textEl(g.mx + name.length * 4.15 + 2.5, baseline, upper(I.brand.sub, 'tr'), { size: 2.7, fill: '#777777', font: HEADER_FONT, spacing: 0.32 }));
    }
    parts.push(textEl(g.W - g.mx, baseline, upper(I.model, I.lang), { size: 3.4, bold: true, fill: color, anchor: 'end', font: HEADER_FONT, spacing: 0.13 }));
    parts.push(`<path d="M${g.mx} ${g.headerRule}H${g.W - g.mx}" stroke="${color}" stroke-width="0.53"/>`);
    parts.push(`<path d="M${g.mx} ${g.footerRule}H${g.W - g.mx}" stroke="${color}" stroke-width="0.53"/>`);
    parts.push(textEl(g.mx, g.footerRule + 5, I.company, { size: 3.2, fill: color }));
    parts.push(textEl(g.W - g.mx, g.footerRule + 5, String(pageNo), { size: 3.6, fill: color, anchor: 'end' }));
    return parts.join('');
  }

  /** Bölge kılavuzları (ISO 5457) */
  function zones() {
    const g = GEO;
    const f = g.frame;
    const cols = Math.max(4, Math.round((f.x1 - f.x0) / 50));
    const rows = Math.max(3, Math.round((f.y1 - f.y0) / 50));
    const parts = [`<rect x="${f.x0}" y="${f.y0}" width="${f.x1 - f.x0}" height="${f.y1 - f.y0}" fill="none" stroke="${INK}" stroke-width="0.35"/>`];
    parts.push(`<rect x="${g.inner.x0}" y="${g.inner.y0}" width="${g.inner.x1 - g.inner.x0}" height="${g.inner.y1 - g.inner.y0}" fill="none" stroke="${INK}" stroke-width="0.5"/>`);
    const cw = (g.inner.x1 - g.inner.x0) / cols;
    const rh = (g.inner.y1 - g.inner.y0) / rows;
    const ticks = [];
    for (let i = 0; i <= cols; i += 1) {
      const x = n(g.inner.x0 + cw * i);
      ticks.push(`M${x} ${f.y0}V${g.inner.y0}M${x} ${g.inner.y1}V${f.y1}`);
      if (i < cols) {
        const cx = x + cw / 2;
        parts.push(textEl(cx, f.y0 + 2, i + 1, { size: 2.2, fill: GRAY, anchor: 'middle', middle: true }));
        parts.push(textEl(cx, f.y1 - 2, i + 1, { size: 2.2, fill: GRAY, anchor: 'middle', middle: true }));
      }
    }
    for (let j = 0; j <= rows; j += 1) {
      const y = n(g.inner.y0 + rh * j);
      ticks.push(`M${f.x0} ${y}H${g.inner.x0}M${g.inner.x1} ${y}H${f.x1}`);
      if (j < rows) {
        const letter = String.fromCharCode(65 + j);
        const cy = y + rh / 2;
        parts.push(textEl(f.x0 + 2, cy, letter, { size: 2.2, fill: GRAY, anchor: 'middle', middle: true }));
        parts.push(textEl(f.x1 - 2, cy, letter, { size: 2.2, fill: GRAY, anchor: 'middle', middle: true }));
      }
    }
    parts.push(`<path d="${ticks.join('')}" fill="none" stroke="${INK}" stroke-width="0.2"/>`);
    return parts.join('');
  }

  function cell(x, y, w, h, label, value, opts) {
    const o = opts || {};
    const size = fitSize(value, w - 2.4, o.size || 2.9, 1.7);
    return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="#fff" stroke="${INK}" stroke-width="0.2"/>` +
      textEl(x + 1.2, y + 2.4, label, { size: 1.9, fill: GRAY }) +
      textEl(x + 1.2, y + h - 1.5, clip(value, w - 2.4, size), { size, bold: o.bold, fill: INK });
  }

  /** Revizyon tablosunun kapladığı yükseklik (mm) */
  function revisionHeight(I) {
    const k = Math.min(4, I.revizyonlar.length);
    return k ? (k + 1) * 4.5 : 0;
  }

  /** Başlık bloğu (ISO 7200 alanları; P&ID ile aynı yerleşim) */
  function titleBlock(I, title, pageNo, total) {
    const t = I.t;
    const { x, y, w, h } = GEO.title;
    const logoW = 38;
    const X = x + logoW;
    const Wd = w - logoW;
    const parts = [];
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="${INK}" stroke-width="0.5"/>`);
    parts.push(`<rect x="${x}" y="${y}" width="${logoW}" height="${h}" fill="#fff" stroke="${INK}" stroke-width="0.2"/>`);
    if (I.logo) {
      parts.push(`<image href="${esc(I.logo)}" x="${x + 3}" y="${y + 6}" width="${logoW - 6}" height="${h - 12}" preserveAspectRatio="xMidYMid meet"/>`);
    } else {
      parts.push(textEl(x + logoW / 2, y + h / 2, I.brand.name || I.brand.label || '', { size: 7, bold: true, fill: I.color, anchor: 'middle', middle: true }));
    }
    parts.push(cell(X, y, Wd, 12, t.drawing, title, { size: 4.6, bold: true }));
    const third = Wd / 3;
    parts.push(cell(X, y + 12, third, 8, t.project, I.seriNo, { bold: true }));
    parts.push(cell(X + third, y + 12, third, 8, t.customer, I.musteri));
    parts.push(cell(X + third * 2, y + 12, third, 8, t.model, I.model));
    const fourth = Wd / 4;
    parts.push(cell(X, y + 20, fourth, 8, t.prepared, I.hazirlayan, { size: 2.6 }));
    parts.push(cell(X + fourth, y + 20, fourth, 8, t.checked, I.kontrol, { size: 2.6 }));
    parts.push(cell(X + fourth * 2, y + 20, fourth, 8, t.approved, I.onay, { size: 2.6 }));
    parts.push(cell(X + fourth * 3, y + 20, fourth, 8, t.date, I.tarih, { size: 2.6 }));
    const c = [Wd * 0.26, Wd * 0.16, Wd * 0.22, Wd * 0.12, Wd * 0.24];
    const values = [[t.docType, t.docTypeValue], [t.unit, 'mm'], [t.scale, t.scaleValue], [t.rev, I.rev], [t.sheet, `${pageNo} / ${total}`]];
    let cx = X;
    values.forEach(([label, value], i) => {
      parts.push(cell(cx, y + 28, c[i], 8, label, value, { size: 2.5 }));
      cx += c[i];
    });
    parts.push(`<path d="M${x} ${y}H${x + w}" stroke="${I.color}" stroke-width="0.7"/>`);

    const revisions = I.revizyonlar.slice(-4);
    if (revisions.length) {
      const rh = 4.5;
      const top = y - rh * (revisions.length + 1);
      const cols = [14, 22, w - 14 - 22 - 30, 30];
      const rows = [[t.rev, t.date, t.revDesc, t.prepared]].concat(revisions.map((r) => [
        pick(r.rev, I.lang), formatDate(pick(r.tarih, I.lang)), pick(r.aciklama, I.lang), pick(r.hazirlayan, I.lang)
      ]));
      rows.forEach((row, ri) => {
        let rx = x;
        row.forEach((val, ci) => {
          const size = ri === 0 ? 1.9 : 2.3;
          parts.push(`<rect x="${n(rx)}" y="${n(top + rh * ri)}" width="${n(cols[ci])}" height="${rh}" fill="#fff" stroke="${INK}" stroke-width="0.2"/>`);
          parts.push(textEl(rx + 1, top + rh * ri + rh / 2, clip(val, cols[ci] - 2, size), { size, fill: ri === 0 ? GRAY : INK, middle: true }));
          rx += cols[ci];
        });
      });
    }
    return parts.join('');
  }

  function frameSvg(I, title, pageNo, total) {
    return `<svg class="lb-frame" xmlns="http://www.w3.org/2000/svg" width="${GEO.W}mm" height="${GEO.H}mm" viewBox="0 0 ${GEO.W} ${GEO.H}" font-family="${FONT}" style="font-variant-ligatures:none">` +
      `<rect x="0" y="0" width="${GEO.W}" height="${GEO.H}" fill="#ffffff"/>` +
      letterhead(I, pageNo) + zones() + titleBlock(I, title, pageNo, total) + '</svg>';
  }

  /* ─────────────────────────── Sayfa dizgisi ─────────────────────────── */

  /** Kaynaktaki i18n öğelerini dile çevirir (span metni / SVG text) */
  function applyLang(rootEl, lang) {
    rootEl.querySelectorAll('.i18n').forEach((el) => {
      el.textContent = el.getAttribute('data-' + lang) || el.getAttribute('data-tr') || '';
    });
  }

  function secTitle(sec, lang) {
    return sec.getAttribute('data-' + lang) || sec.getAttribute('data-tr') || '';
  }

  function joinTitles(names, t) {
    if (names.length <= 1) return names.join('');
    return `${names.slice(0, -1).join(', ')} ${t.and} ${names[names.length - 1]}`;
  }

  /**
   * Kaynak bölümleri (.lb-sec > .lb-part) antetli A3 sayfalara dağıtır.
   * Parça türleri: full (tam genişlik, bölünmez) · col (sütun, bölünmez) · table (satırlardan bölünür) · list (maddelerden bölünür).
   * table/list için data-w="full" tam genişlik, aksi hâlde sütun genişliği.
   * Dönüş: { pages: [HTMLElement], total, first: { bölümId: sayfaSırası } }
   */
  function paginate(src, meta, lang, opts) {
    const o = opts || {};
    const I = infoFrom(meta, lang, o);
    const work = src.cloneNode(true);
    applyLang(work, I.lang);

    const host = document.createElement('div');
    host.className = 'lb-measure';
    host.style.setProperty('--lb-accent', I.color);
    document.body.appendChild(host);

    const measureBox = (nodes, wmm) => {
      const box = document.createElement('div');
      box.style.width = `${wmm}mm`;
      box.style.display = 'flow-root';
      nodes.forEach((nd) => box.appendChild(nd));
      host.appendChild(box);
      return box;
    };

    const sections = [];
    let num = 0;
    try {
      work.querySelectorAll(':scope > .lb-sec').forEach((secEl) => {
        const partEls = [...secEl.children].filter((c) => c.classList.contains('lb-part'));
        if (!partEls.length) return;
        num += 1;   // bölüm numarası tam belgedeki gibi kalır (seçmeli PDF'te de)
        if (Array.isArray(o.only) && !o.only.includes(secEl.getAttribute('data-sec'))) return;
        const sec = { id: secEl.getAttribute('data-sec'), num, title: secTitle(secEl, I.lang), parts: [] };
        const head = (cont) => {
          const el = document.createElement('div');
          el.className = 'rp-head';
          const num = document.createElement('span');
          num.className = 'rp-num';
          num.textContent = String(sec.num);
          const ttl = document.createElement('span');
          ttl.className = 'rp-title';
          ttl.textContent = upper(sec.title, I.lang);
          if (cont) {
            const c = document.createElement('span');
            c.className = 'rp-cont';
            c.textContent = I.t.continued;
            ttl.appendChild(c);
          }
          el.appendChild(num);
          el.appendChild(ttl);
          return el;
        };
        sec.head = head;
        let b = measureBox([head(false)], FLOW.colW);
        sec.headH = b.getBoundingClientRect().height / MM;
        b.remove();
        b = measureBox([head(true)], FLOW.colW);
        sec.contH = b.getBoundingClientRect().height / MM;
        b.remove();

        partEls.forEach((el) => {
          const kind = el.getAttribute('data-kind') || 'full';
          const full = kind === 'full' || el.getAttribute('data-w') === 'full';
          const wmm = full ? FLOW.w : FLOW.colW;
          const part = { kind, full, el };
          const box = measureBox([el.cloneNode(true)], wmm);
          const inner = box.firstElementChild;
          const top = box.getBoundingClientRect().top;
          const bottom = box.getBoundingClientRect().bottom;
          if (kind === 'table' || kind === 'list') {
            const items = kind === 'table' ? [...inner.querySelectorAll(':scope > tbody > tr')] : [...inner.querySelectorAll(':scope > li')];
            const tops = items.map((it) => it.getBoundingClientRect().top);
            const lastBottom = items.length ? items[items.length - 1].getBoundingClientRect().bottom : top;
            part.pre = items.length ? (tops[0] - top) / MM : 0;
            part.post = Math.max(0, (bottom - lastBottom) / MM);
            part.rows = items.map((it, i) => ((i < items.length - 1 ? tops[i + 1] : lastBottom) - tops[i]) / MM);
            part.items = kind === 'table' ? [...el.querySelectorAll(':scope > tbody > tr')] : [...el.querySelectorAll(':scope > li')];
          } else {
            part.h = (bottom - top) / MM;
          }
          box.remove();
          sec.parts.push(part);
        });
        sections.push(sec);
      });
    } finally {
      host.remove();
    }
    if (!sections.length) return { pages: [], total: 0, first: {} };

    /* Akış */
    const hL = GEO.inner.y1 - 5 - FLOW.y;
    const hR = GEO.title.y - revisionHeight(I) - 5 - FLOW.y;
    const pages = [];
    let pg = null;
    let used = [0, 0];
    let col = 0;
    const newPage = () => {
      pg = { frags: [], secs: [] };
      pages.push(pg);
      used = [0, 0];
      col = 0;
    };
    const fresh = () => pg.frags.length === 0;
    const add = (f, sec) => {
      pg.frags.push(f);
      if (!pg.secs.includes(sec)) pg.secs.push(sec);
    };
    const fullSlot = () => {
      let y = Math.max(used[0], used[1]);
      if (y > 0) y += FLOW.gap;
      return { y, room: hR - y };
    };
    const colSlot = () => {
      const lim = col === 0 ? hL : hR;
      let y = used[col];
      if (y > 0) y += FLOW.gap;
      return { y, room: lim - y };
    };
    const advanceCol = () => {
      if (col === 0) col = 1;
      else newPage();
    };
    newPage();

    const placeBlock = (sec, part, withHead) => {
      const h = (withHead ? sec.headH : 0) + part.h;
      const build = () => {
        const d = document.createElement('div');
        if (withHead) d.appendChild(sec.head(false));
        d.appendChild(part.el.cloneNode(true));
        return d;
      };
      if (part.full) {
        let s = fullSlot();
        if (h > s.room + 0.01 && !fresh()) {
          newPage();
          s = fullSlot();
        }
        const k = h > s.room ? s.room / h : 1;
        add({ x: FLOW.x, y: FLOW.y + s.y, w: FLOW.w, k, build }, sec);
        used[0] = used[1] = s.y + h * k;
        col = 0;
        return;
      }
      for (;;) {
        const s = colSlot();
        if (h <= s.room + 0.01) {
          add({ x: FLOW.colX[col], y: FLOW.y + s.y, w: FLOW.colW, k: 1, build }, sec);
          used[col] = s.y + h;
          return;
        }
        if (fresh() && col === 0) {
          const k = s.room / h;
          add({ x: FLOW.colX[0], y: FLOW.y + s.y, w: FLOW.colW, k, build }, sec);
          used[0] = s.y + h * k;
          return;
        }
        advanceCol();
      }
    };

    const placeRows = (sec, part, withHead) => {
      const rows = part.rows;
      const total = rows.length;
      let i = 0;
      while (i < total) {
        const headMode = i === 0 ? (withHead ? 'head' : '') : 'cont';
        const hd = headMode === 'head' ? sec.headH : headMode === 'cont' ? sec.contH : 0;
        const s = part.full ? fullSlot() : colSlot();
        const regionEmpty = part.full ? fresh() : (used[col] === 0 || fresh());
        const room = s.room - hd - part.pre - part.post - FLOW.fit;
        const need = i === 0 ? Math.min(3, total) : 1;
        let fit = 0;
        let acc = 0;
        while (fit < need && i + fit < total && acc + rows[i + fit] <= room) {
          acc += rows[i + fit];
          fit += 1;
        }
        if (fit < need && !regionEmpty) {
          if (part.full) newPage();
          else advanceCol();
          continue;
        }
        const from = i;
        let taken = 0;
        while (i < total && (i === from || taken + rows[i] <= room)) {
          taken += rows[i];
          i += 1;
        }
        const to = i;
        const h = hd + part.pre + taken + part.post;
        const build = () => {
          const d = document.createElement('div');
          if (headMode) d.appendChild(sec.head(headMode === 'cont'));
          const shell = part.el.cloneNode(false);
          if (part.kind === 'table') {
            [...part.el.children].forEach((c) => {
              if (c.tagName !== 'TBODY') shell.appendChild(c.cloneNode(true));
            });
            const tb = document.createElement('tbody');
            for (let r = from; r < to; r += 1) tb.appendChild(part.items[r].cloneNode(true));
            shell.appendChild(tb);
          } else {
            if (shell.tagName === 'OL') shell.setAttribute('start', String(from + 1));
            for (let r = from; r < to; r += 1) shell.appendChild(part.items[r].cloneNode(true));
          }
          d.appendChild(shell);
          return d;
        };
        if (part.full) {
          add({ x: FLOW.x, y: FLOW.y + s.y, w: FLOW.w, k: 1, build }, sec);
          used[0] = used[1] = s.y + h;
          col = 0;
          if (i < total) newPage();
        } else {
          add({ x: FLOW.colX[col], y: FLOW.y + s.y, w: FLOW.colW, k: 1, build }, sec);
          used[col] = s.y + h;
          if (i < total) advanceCol();
        }
      }
    };

    sections.forEach((sec) => {
      sec.parts.forEach((part, pi) => {
        const withHead = pi === 0;
        if (part.kind === 'table' || part.kind === 'list') {
          if (part.rows.length) placeRows(sec, part, withHead);
        } else {
          placeBlock(sec, part, withHead);
        }
      });
    });
    if (pages.length > 1 && !pages[pages.length - 1].frags.length) pages.pop();

    /* Sayfaları kur */
    const total = pages.length;
    const first = {};
    const out = pages.map((p, idx) => {
      const el = document.createElement('div');
      el.className = 'lb-print lb-sheet';
      el.lang = I.lang;
      el.style.setProperty('--lb-accent', I.color);
      el.setAttribute('data-secs', p.secs.map((s) => s.id).join(' '));
      p.secs.forEach((s) => {
        if (!(s.id in first)) first[s.id] = idx;
      });
      el.innerHTML = frameSvg(I, joinTitles(p.secs.map((s) => s.title), I.t), idx + 1, total);
      p.frags.forEach((f) => {
        const outer = document.createElement('div');
        outer.className = 'lb-frag';
        outer.style.left = `${n(f.x)}mm`;
        outer.style.top = `${n(f.y)}mm`;
        outer.style.width = `${n(f.w)}mm`;
        const inner = f.build();
        if (f.k < 1) {
          inner.style.width = `${n(f.w / f.k)}mm`;
          inner.style.zoom = String(n(f.k));
        }
        outer.appendChild(inner);
        el.appendChild(outer);
      });
      return el;
    });
    return { pages: out, total, first };
  }

  /* ─────────────────────────── Pafta HTML'inin ekran / baskı davranışı ─────────────────────────── */

  function readJson(id) {
    const el = document.getElementById(id);
    return el ? JSON.parse(el.textContent) : null;
  }

  async function fontsReady() {
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    } catch (e) { /* yazı tipi API'si yoksa beklemeden devam */ }
  }

  /** Bir dilin kapağı + sayfaları. opts: { only: [bölüm kimlikleri] (yoksa hepsi), cover: false (kapaksız) } */
  function buildLang(cfg, src, lang, opts) {
    const o = opts || {};
    const res = paginate(src, cfg.meta, lang, { logos: cfg.logos, only: o.only });
    const cov = o.cover === false ? null : cover(cfg.design, cfg.meta, lang, { logos: cfg.logos, pages: res.total });
    return { cover: cov, pages: res.pages, total: res.total, first: res.first };
  }

  /** Yazdırma kökü: seçilen diller sırayla, her biri kapağıyla */
  function printRoot(cfg, src, langs, opts) {
    const root = document.createElement('div');
    root.id = 'print-root';
    langs.filter((l) => TEXT[l]).forEach((l) => {
      const b = buildLang(cfg, src, l, opts);
      if (b.cover) root.appendChild(b.cover);
      b.pages.forEach((p) => root.appendChild(p));
    });
    return root;
  }

  /** Tarayıcının yazdırma penceresi (Hedef: "PDF olarak kaydet") – sunucu ya da gömülü PDF olmadan da çalışır */
  function printDoc(cfg, src, langs, opts) {
    const old = document.getElementById('print-root');
    if (old) old.remove();
    const root = printRoot(cfg, src, langs, opts);
    document.body.appendChild(root);
    document.body.classList.add('printing');
    const oldTitle = document.title;
    document.title = `${cfg.file || 'Layout'}-${langs.join('-').toUpperCase()}`;
    const done = () => {
      window.removeEventListener('afterprint', done);
      root.remove();
      document.title = oldTitle;
      document.body.classList.remove('printing');
    };
    window.addEventListener('afterprint', done);
    const imgs = [...root.querySelectorAll('img')];
    Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => null) : null))).then(() => setTimeout(() => window.print(), 150));
  }

  /** Pafta HTML'i açılınca çağrılır: sayfaları dizer, dil düğmeleri ve PDF indirmeyi bağlar */
  async function startDocument() {
    const cfg = readJson('lb-meta');
    const srcEl = document.getElementById('lb-src');
    if (!cfg || !srcEl) return;
    srcEl.remove();   // aynı kimlikli SVG tanımları (oklar) görünür sayfalarda kalsın
    await fontsReady();

    // Baskı kipi (headless tarayıcı): #pdf-print=tr,en[&secs=ust,on][&cover=0]
    const printMode = /#pdf-print=([a-z,]+)/.exec(location.hash);
    if (printMode) {
      const secs = /[#&]secs=([a-z,]*)/.exec(location.hash);
      const opts = { only: secs ? secs[1].split(',').filter(Boolean) : undefined, cover: !/[#&]cover=0/.test(location.hash) };
      document.body.appendChild(printRoot(cfg, srcEl, printMode[1].split(','), opts));
      document.body.classList.add('printing');
      window.LB_READY = true;
      return;
    }

    const embed = /[?&]embed=1/.test(location.search);
    if (embed) document.body.classList.add('lb-embed');
    const mount = document.getElementById('lb-pages');
    const state = { lang: 'tr', total: 0, first: {}, cover: null };
    const shells = [];

    function fit() {
      const avail = Math.max(200, mount.clientWidth - 48);
      const k = Math.min(1, avail / PAGE_W);
      shells.forEach((s) => {
        s.style.width = `${PAGE_W * k}px`;
        s.style.height = `${PAGE_H * k}px`;
        s.firstElementChild.style.transform = `scale(${k})`;
      });
    }

    // Dışa aktarılmış HTML: seçilen diller (her biri kapağıyla) arka arkaya, dil seçimi yok
    const ex = cfg.export && Array.isArray(cfg.export.langs) && cfg.export.langs.length ? cfg.export : null;
    const exOpts = ex ? { only: ex.only || undefined, cover: ex.cover !== false } : undefined;

    function render(lang) {
      const langs = ex ? ex.langs.filter((l) => TEXT[l]) : [lang];
      lang = langs[0];
      let all = [];
      langs.forEach((l, li) => {
        const b = buildLang(cfg, srcEl, l, exOpts);
        if (li === 0) {
          state.total = b.total;
          state.first = b.first;
        }
        if (b.cover) all.push(b.cover);
        all = all.concat(b.pages);
      });
      state.lang = lang;
      mount.replaceChildren();
      shells.length = 0;
      all.forEach((pageEl, i) => {
        const shell = document.createElement('div');
        shell.className = 'lb-shell';
        shell.setAttribute('data-page', String(i));
        if (pageEl.hasAttribute('data-secs')) shell.setAttribute('data-secs', pageEl.getAttribute('data-secs'));
        pageEl.style.transformOrigin = 'top left';
        shell.appendChild(pageEl);
        mount.appendChild(shell);
        shells.push(shell);
      });
      fit();
      document.documentElement.lang = lang;
      document.querySelectorAll('[data-doc-lang]').forEach((btn) => {
        const on = btn.getAttribute('data-doc-lang') === lang;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
      });
      document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = TEXT[lang][el.getAttribute('data-t')] || ''; });
      try { localStorage.setItem('layout-doc-lang', lang); } catch (e) { /* tarayıcı hafızası kapalı */ }
      window.dispatchEvent(new CustomEvent('lb-rendered', { detail: { lang, total: state.total } }));
    }

    function goto(sec) {
      const shell = sec === 'kapak' ? shells[0] : shells.find((s) => (s.getAttribute('data-secs') || '').split(' ').includes(sec));
      if (shell) shell.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return !!shell;
    }

    window.addEventListener('resize', fit);
    document.querySelectorAll('[data-doc-lang]').forEach((btn) => {
      btn.addEventListener('click', () => render(btn.getAttribute('data-doc-lang')));
    });
    let saved = null;
    try { saved = localStorage.getItem('layout-doc-lang'); } catch (e) { /* yok */ }
    const fromUrl = /[?&]lang=(tr|en|de)/.exec(location.search);
    render(fromUrl ? fromUrl[1] : (TEXT[saved] ? saved : 'tr'));
    window.LBDoc = {
      goto, setLang: render, state, fit,
      /** Uygulamadan: tarayıcıyla yazdır / PDF olarak kaydet. opts: { only, cover } */
      print: (langs, opts) => printDoc(cfg, srcEl, langs && langs.length ? langs : [state.lang], opts),
      sections: () => [...srcEl.querySelectorAll(':scope > .lb-sec')].map((s) => s.getAttribute('data-sec'))
    };
    if (ex) {
      // dil seçimi yok; düğme seçilen dilleri tarayıcıyla basar (Hedef: PDF olarak kaydet)
      document.querySelectorAll('.lang-seg').forEach((el) => { el.hidden = true; el.style.display = 'none'; });
      const btn = document.getElementById('pdf-open');
      if (btn) {
        btn.setAttribute('data-t', 'print');
        btn.textContent = TEXT[state.lang].print;
        btn.addEventListener('click', () => printDoc(cfg, srcEl, ex.langs, exOpts));
      }
    } else {
      bindPdf(cfg, srcEl, state);
    }
    window.LB_READY = true;
  }

  /** PDF indir: gömülü PDF'ten seçilen dillerin sayfaları pdf-lib ile birleştirilir; yoksa yazdırma penceresi */
  function bindPdf(cfg, srcEl, state) {
    const dlg = document.getElementById('pdf-dlg');
    const openBtn = document.getElementById('pdf-open');
    if (!dlg || !openBtn) return;
    const go = dlg.querySelector('button.go');
    const busy = dlg.querySelector('.busy');
    const data = document.getElementById('pdf-data');
    const boxes = [...dlg.querySelectorAll('input[name="pdf-lang"]')];
    const sync = () => {
      go.disabled = !boxes.some((b) => b.checked);
      boxes.forEach((b) => b.parentElement.classList.toggle('is-on', b.checked));
    };
    boxes.forEach((b) => b.addEventListener('change', sync));
    openBtn.addEventListener('click', () => {
      boxes.forEach((b) => { b.checked = b.value === state.lang; });
      sync();
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    });
    const closeDlg = () => { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); };
    dlg.querySelector('button.cancel').addEventListener('click', closeDlg);
    const printBtn = dlg.querySelector('button.print');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        const langs = boxes.filter((b) => b.checked).map((b) => b.value);
        closeDlg();
        printDoc(cfg, srcEl, langs.length ? langs : [state.lang]);
      });
    }
    const fileName = (langs) => `${cfg.file || 'Layout'}-${langs.join('-').toUpperCase()}`;
    const bytesOf = (b64) => {
      const s = atob(b64);
      const u = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i += 1) u[i] = s.charCodeAt(i);
      return u;
    };
    go.addEventListener('click', async () => {
      const langs = boxes.filter((b) => b.checked).map((b) => b.value);
      if (!(data && window.PDFLib)) {
        closeDlg();
        printDoc(cfg, srcEl, langs);
        return;
      }
      go.disabled = true;
      busy.hidden = false;
      try {
        const ranges = JSON.parse(data.getAttribute('data-ranges'));
        const srcPdf = await PDFLib.PDFDocument.load(bytesOf(data.textContent.trim()));
        const outPdf = await PDFLib.PDFDocument.create();
        const idx = [];
        langs.forEach((l) => { for (let i = ranges[l][0]; i < ranges[l][1]; i += 1) idx.push(i); });
        (await outPdf.copyPages(srcPdf, idx)).forEach((p) => outPdf.addPage(p));
        const who = brandOf(cfg.meta).footer || 'CNK';
        outPdf.setTitle(cfg.title || fileName(langs));
        outPdf.setAuthor(who);
        outPdf.setCreator(who);
        outPdf.setProducer(who);
        outPdf.setLanguage(langs[0]);
        const blob = new Blob([await outPdf.save()], { type: 'application/pdf' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${fileName(langs)}.pdf`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
        closeDlg();
      } catch (e) {
        closeDlg();
        printDoc(cfg, srcEl, langs);
      } finally {
        busy.hidden = true;
        sync();
      }
    });
  }

  return {
    MM, PAGE_W, PAGE_H, GEO, FLOW, BRANDS, BRAND_LIST, DESIGNS, DEFAULT_DESIGN, TEXT, LANGS,
    pick, formatDate, upper, infoFrom, cover, frameSvg, paginate, applyLang, startDocument
  };
});
