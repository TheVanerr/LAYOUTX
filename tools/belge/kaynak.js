/* Belge kaynağı: proje verisi + görünümler -> tek dosya pafta HTML'i (kapak + antetli A3 sayfalar, TR/EN/DE).
   tools/build_layout.py'nin tarayıcıdaki birebir karşılığı; uygulama (masaüstü ve web) önizlemeyi ve çıktıları bununla üretir.
   build(input) eşzamanlıdır; gerekli dosyalar (belge.css/js, logolar, yazı tipleri, görünüm resimleri) dışarıdan verilir. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.LayoutKaynak = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LOGO_FILES = { DOLFIN: 'dolfin.png', ENVA: 'enva.svg', VICO: 'vico.png', KSYSTEM: 'ksystem.png' };
  const BRAND_COLORS = { DOLFIN: '#ff0000', ENVA: '#007938', VICO: '#C41E3A', KSYSTEM: '#1B04AE' };

  /* Python html.escape(s, quote=True) ile aynı */
  const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const str = (v) => (v == null ? '' : String(v));
  /* Python round(): yarımlar çifte yuvarlanır */
  function pyRound(v) {
    const f = Math.floor(v);
    const d = v - f;
    if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
    return Math.round(v);
  }
  const fmt = (v) => String(pyRound(Number(v) || 0));
  const fx = (v, n) => (Number(v) || 0).toFixed(n);

  function l3(obj) {
    const tr = str(obj.tr || obj.en || obj.de || '');
    return [tr, str(obj.en || tr), str(obj.de || tr)];
  }
  function T(obj) {
    if (isObj(obj)) {
      const [tr, en, de] = l3(obj);
      return `<span class="i18n" data-tr="${esc(tr)}" data-en="${esc(en)}" data-de="${esc(de)}">${esc(tr)}</span>`;
    }
    return esc(str(obj));
  }
  const d3 = (tr, en, de) => ({ tr, en, de });
  const t3 = (tr, en, de) => T(d3(tr, en, de));
  function has(v) {
    if (v == null) return false;
    if (isObj(v)) return Object.values(v).some((x) => String(x == null ? '' : x).trim());
    return String(v).trim() !== '';
  }
  function fill(o, rep) {
    if (Array.isArray(o)) return o.map((v) => fill(v, rep));
    if (isObj(o)) {
      const r = {};
      Object.keys(o).forEach((k) => { r[k] = fill(o[k], rep); });
      return r;
    }
    if (typeof o === 'string') {
      let s = o;
      Object.keys(rep).forEach((k) => { s = s.split(k).join(rep[k]); });
      return s;
    }
    return o;
  }

  const DEFS = '<defs>' +
    '<marker id="arrE" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,1 L9,5 L0,9 z"/></marker>' +
    '<marker id="arrS" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10,1 L1,5 L10,9 z"/></marker>' +
    '<marker id="arrC" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path class="c" d="M0,0 L10,5 L0,10 z"/></marker>' +
    '</defs>';
  const GY = '<pattern id="gy" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="4" height="8" fill="#2f9a47"/><rect x="4" width="4" height="8" fill="#f0c419"/></pattern>';
  const CORES = [['L1', '#8b5a2b', d3('Faz 1 · kahverengi', 'Phase 1 · brown', 'Außenleiter 1 · braun')],
    ['L2', '#1d1d1d', d3('Faz 2 · siyah', 'Phase 2 · black', 'Außenleiter 2 · schwarz')],
    ['L3', '#8f969c', d3('Faz 3 · gri', 'Phase 3 · grey', 'Außenleiter 3 · grau')],
    ['N', '#2e6fd2', d3('Nötr · mavi', 'Neutral · blue', 'Neutralleiter · blau')],
    ['PE', 'url(#gy)', d3('Koruma topraklaması · yeşil-sarı', 'Protective earth · green-yellow', 'Schutzleiter · grün-gelb')]];

  /** Bölümler (#lb-src içeriği) ve belge bilgileri. input: { data, views, images: {png: dataURI} } */
  function source(input) {
    const raw = JSON.parse(JSON.stringify(input.data));
    const el0 = raw.elektrik || {};
    const DATA = fill(raw, { '{A}': str(el0.ana_salter_a == null ? '' : el0.ana_salter_a),
      '{kesit}': str((el0.kablo || {}).kesit_mm2 == null ? '' : (el0.kablo || {}).kesit_mm2),
      '{V}': str(el0.gerilim_v == null ? 400 : el0.gerilim_v) });
    const VIEWS = input.views;
    const IMG = input.images || {};
    const G = DATA.geometri;
    const E = DATA.elektrik = DATA.elektrik || {};
    const M = DATA.makine;
    [['toplam_guc_kw', 0], ['ana_salter_a', 0], ['cos_phi', 0.85], ['besleme', '']].forEach(([k, v]) => {
      if (E[k] == null || E[k] === '') E[k] = v;
    });
    if (!E.cos_phi) E.cos_phi = 0.85;
    if (M.model == null) M.model = M.proje || 'Layout';
    if (!G.noktalar) G.noktalar = {};
    if (!G.servis_alani) G.servis_alani = { on: 1000, arka: 1000, sol: 1000, sag: 1000 };
    const L = G.boy;
    const W = G.en;
    const H = G.yukseklik;
    const [ox, oy, oz] = G.origin;
    const P = G.noktalar;
    const SA = G.servis_alani;

    let S = 1;
    let EXT = [0, 0, 0, 0];
    const extAdd = (x0, y0, x1, y1) => {
      if (x1 === undefined) x1 = x0;
      if (y1 === undefined) y1 = y0;
      EXT = [Math.min(EXT[0], x0, x1), Math.min(EXT[1], y0, y1), Math.max(EXT[2], x0, x1), Math.max(EXT[3], y0, y1)];
    };
    const dimH = (x1, x2, y, text, cls) => {
      const ys = -y;
      const ext = 0.22 * S;
      return `<g class="${cls || 'dim'}"><line x1="${x1}" y1="${ys + ext}" x2="${x1}" y2="${ys - ext * 0.5}"/>` +
        `<line x1="${x2}" y1="${ys + ext}" x2="${x2}" y2="${ys - ext * 0.5}"/>` +
        `<line x1="${x1}" y1="${ys}" x2="${x2}" y2="${ys}" marker-start="url(#arrS)" marker-end="url(#arrE)"/>` +
        `<text x="${(x1 + x2) / 2}" y="${ys - 0.18 * S}" text-anchor="middle">${text}</text></g>`;
    };
    const dimV = (y1, y2, x, text, cls) => {
      const ext = 0.22 * S;
      return `<g class="${cls || 'dim'}"><line x1="${x - ext}" y1="${-y1}" x2="${x + ext * 0.5}" y2="${-y1}"/>` +
        `<line x1="${x - ext}" y1="${-y2}" x2="${x + ext * 0.5}" y2="${-y2}"/>` +
        `<line x1="${x}" y1="${-y1}" x2="${x}" y2="${-y2}" marker-start="url(#arrS)" marker-end="url(#arrE)"/>` +
        `<text transform="translate(${x - 0.18 * S},${-(y1 + y2) / 2}) rotate(-90)" text-anchor="middle">${text}</text></g>`;
    };
    const marker = (x, y, key) => `<g class="pt"><circle cx="${x}" cy="${-y}" r="${fx(0.62 * S, 1)}"/>` +
      `<text x="${x}" y="${-y}" dy="0.36em" text-anchor="middle">${esc(key)}</text></g>`;
    const label = (x, y, obj, anchor, cls) => {
      if (isObj(obj)) {
        const [tr, en, de] = l3(obj);
        return `<text class="${cls} i18n" x="${x}" y="${-y}" text-anchor="${anchor}" data-tr="${esc(tr)}" data-en="${esc(en)}" data-de="${esc(de)}">${esc(tr)}</text>`;
      }
      return `<text class="${cls}" x="${x}" y="${-y}" text-anchor="${anchor}">${esc(str(obj))}</text>`;
    };
    const finalBounds = (name, b) => {
      const v = VIEWS[name];
      return [Math.min(v.x0, b[0]), Math.min(v.y0, b[1]), Math.max(v.x1, b[2]), Math.max(v.y1, b[3])];
    };
    const svgView = (name, extra, fb, cls) => {
      const v = VIEWS[name];
      const vb = `${fx(fb[0], 0)} ${fx(-fb[3], 0)} ${fx(fb[2] - fb[0], 0)} ${fx(fb[3] - fb[1], 0)}`;
      return `<svg class="${cls || 'view'}" viewBox="${vb}" style="--fs:${fx(S, 1)}px" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${DEFS}` +
        `<image href="${IMG[v.png] || ''}" x="${v.x0}" y="${-v.y1}" width="${v.x1 - v.x0}" height="${v.y1 - v.y0}" preserveAspectRatio="none"/>` +
        extra.join('') + '</svg>';
    };
    const beginView = (name, base, k) => {
      const fb = finalBounds(name, base);
      S = (fb[2] - fb[0]) * k;
      EXT = fb.slice();
    };
    const endView = (name, extra, cls) => svgView(name, extra, [EXT[0] - 0.5 * S, EXT[1] - 0.5 * S, EXT[2] + 0.5 * S, EXT[3] + 0.5 * S], cls);
    const DH = (x1, x2, y, text, cls) => {
      extAdd(Math.min(x1, x2), y - 1.5 * S, Math.max(x1, x2), y + 0.4 * S);
      return dimH(x1, x2, y, text, cls);
    };
    const DV = (y1, y2, x, text, cls) => {
      extAdd(x - 1.3 * S, Math.min(y1, y2), x + 0.4 * S, Math.max(y1, y2));
      return dimV(y1, y2, x, text, cls);
    };
    const MK = (x, y, key) => {
      extAdd(x - 0.8 * S, y - 0.8 * S, x + 0.8 * S, y + 0.8 * S);
      return marker(x, y, key);
    };
    const LB = (x, y, obj, anchor, cls) => {
      anchor = anchor || 'start';
      const txt = isObj(obj) ? l3(obj)[0] : str(obj);
      const w = txt.length * 0.42 * S;
      if (anchor === 'middle') extAdd(x - w / 2, y - 0.4 * S, x + w / 2, y + 0.9 * S);
      else if (anchor === 'end') extAdd(x - w, y - 0.4 * S, x, y + 0.9 * S);
      else extAdd(x, y - 0.4 * S, x + w, y + 0.9 * S);
      return label(x, y, obj, anchor, cls || 'lbl');
    };
    const extraDims = (key, out) => {
      (G[key] || []).forEach((d) => {
        if (d.yon === 'h') out.push(DH(d.a, d.b, d.c, fmt(d.b - d.a), 'dim dim-2'));
        else out.push(DV(d.a, d.b, d.c, fmt(d.b - d.a), 'dim dim-2'));
      });
    };
    const shown = (p, view) => {
      const g = p.gorunum == null ? 'on' : String(p.gorunum);
      return g === 'hepsi' || g.split(',').map((s) => s.trim()).includes(view);
    };
    const proj = (name, x, y, z) => {
      const Rt = VIEWS.top.R;
      const Rv = VIEWS[name].R;
      const w = [0, 1, 2].map((i) => Rt[0][i] * x + Rt[1][i] * y + Rt[2][i] * z);
      return [Rv[0][0] * w[0] + Rv[0][1] * w[1] + Rv[0][2] * w[2], Rv[1][0] * w[0] + Rv[1][1] * w[1] + Rv[1][2] * w[2]];
    };
    const ordinate = (view, keys, y) => {
      const ticks = [[proj(view, ox, oy, oz)[0], '0']].concat(keys.filter((k) => P[k])
        .map((k) => [proj(view, P[k].x, P[k].y, P[k].z)[0], `${fmt(P[k].x - ox)} (${k})`]));
      const xs = ticks.map((t) => t[0]);
      const out = [`<g class="dim dim-2 ord"><line x1="${Math.min(...xs)}" y1="${-y}" x2="${Math.max(...xs)}" y2="${-y}"/>`];
      ticks.forEach(([x, txt]) => {
        out.push(`<line x1="${x}" y1="${-y - 0.3 * S}" x2="${x}" y2="${-y + 0.3 * S}"/>` +
          `<text transform="translate(${x + 0.28 * S},${-(y - 0.45 * S)}) rotate(-90)" text-anchor="end">${esc(txt)}</text>`);
        extAdd(x - 0.6 * S, y - 0.45 * S - txt.length * 0.42 * S, x + 0.6 * S, y + 0.3 * S);
      });
      return out.join('') + '</g>';
    };

    /* üst görünüm (plan) */
    beginView('top', [ox - SA.sol, oy - SA.on, ox + L + SA.sag, oy + W + SA.arka], 0.011);
    const top = [];
    top.push(`<rect class="svc" x="${ox - SA.sol}" y="${-(oy + W + SA.arka)}" width="${L + SA.sol + SA.sag}" height="${W + SA.on + SA.arka}"/>`);
    top.push(`<rect class="outline" x="${ox}" y="${-(oy + W)}" width="${L}" height="${W}"/>`);
    top.push(DH(ox, ox + L, oy + W + SA.arka + 1.7 * S, fmt(L)));
    top.push(DV(oy, oy + W, ox + L + SA.sag + 1.7 * S, fmt(W)));
    top.push(DH(ox - SA.sol, ox, oy - SA.on - 1.0 * S, fmt(SA.sol), 'dim dim-svc'));
    top.push(DH(ox + L, ox + L + SA.sag, oy - SA.on - 1.0 * S, fmt(SA.sag), 'dim dim-svc'));
    top.push(DV(oy - SA.on, oy, ox - SA.sol - 1.0 * S, fmt(SA.on), 'dim dim-svc'));
    top.push(DV(oy + W, oy + W + SA.arka, ox - SA.sol - 1.0 * S, fmt(SA.arka), 'dim dim-svc'));
    extraDims('ek_olculer_ust', top);
    Object.keys(P).forEach((k) => top.push(MK(P[k].x, P[k].y, k)));
    top.push(LB(ox + L / 2, oy - SA.on - 0.45 * S, G.on_yazi || d3('OPERATÖR / YÜKLEME TARAFI', 'OPERATOR / LOADING SIDE', 'BEDIENER- / BELADESEITE'), 'middle', 'side'));
    top.push(LB(ox + L / 2, oy + W + SA.arka + 0.5 * S, d3('ARKA – SERVİS', 'REAR – SERVICE', 'RÜCKSEITE – SERVICE'), 'middle', 'side'));
    (G.etiketler_ust || []).forEach((lb) => top.push(LB(lb.x, lb.y, lb.ad, lb.anchor || 'middle')));
    const svgTop = endView('top', top);

    /* ön görünüm */
    beginView('front', [ox, oz, ox + L, oz + H], 0.011);
    const front = [`<rect class="outline" x="${ox}" y="${-(oz + H)}" width="${L}" height="${H}"/>`,
      (G.ordinat_on && G.ordinat_on.length) ? DH(ox, ox + L, oz + H + 1.4 * S, fmt(L)) : DH(ox, ox + L, oz - 2.0 * S, fmt(L)),
      DV(oz, oz + H, ox + L + 2.0 * S, fmt(H))];
    extraDims('ek_olculer_on', front);
    Object.keys(P).forEach((k) => { if (shown(P[k], 'on')) front.push(MK(P[k].x, P[k].z, k)); });
    front.push(`<line class="floor" x1="${ox - 3 * S}" y1="${-oz}" x2="${ox + L + 3 * S}" y2="${-oz}"/>`);
    extAdd(ox - 3 * S, oz, ox + L + 3 * S, oz);
    if (G.ordinat_on && G.ordinat_on.length) front.push(ordinate('front', G.ordinat_on, oz - 0.9 * S));
    const svgFront = endView('front', front);

    /* yan görünüm */
    beginView('side', [oy, oz, oy + W, oz + H], 0.021);
    const side = [`<rect class="outline" x="${oy}" y="${-(oz + H)}" width="${W}" height="${H}"/>`,
      DH(oy, oy + W, oz - 2.0 * S, fmt(W)), DV(oz, oz + H, oy + W + 2.0 * S, fmt(H))];
    extraDims('ek_olculer_yan', side);
    Object.keys(P).forEach((k) => { if (shown(P[k], 'yan')) side.push(MK(P[k].y, P[k].z, k)); });
    side.push(`<line class="floor" x1="${oy - 2 * S}" y1="${-oz}" x2="${oy + W + 2 * S}" y2="${-oz}"/>`);
    extAdd(oy - 2 * S, oz, oy + W + 2 * S, oz);
    side.push(LB(oy, oz - 1.0 * S, d3('ÖN', 'FRONT', 'VORNE'), 'middle', 'side'));
    side.push(LB(oy + W, oz - 1.0 * S, d3('ARKA', 'REAR', 'HINTEN'), 'middle', 'side'));
    const svgSide = endView('side', side);

    /* arka görünüm */
    let svgRear = '';
    if (VIEWS.rear) {
      const [rx0, rx1] = [proj('rear', ox, oy, oz)[0], proj('rear', ox + L, oy, oz)[0]].sort((a, b) => a - b);
      beginView('rear', [rx0, oz, rx1, oz + H], 0.011);
      const rear = [`<rect class="outline" x="${rx0}" y="${-(oz + H)}" width="${L}" height="${H}"/>`, DH(rx0, rx1, oz + H + 1.4 * S, fmt(L))];
      extraDims('ek_olculer_arka', rear);
      Object.keys(P).forEach((k) => {
        if (shown(P[k], 'arka')) {
          const [a, b] = proj('rear', P[k].x, P[k].y, P[k].z);
          rear.push(MK(a, b, k));
        }
      });
      rear.push(`<line class="floor" x1="${rx0 - 3 * S}" y1="${-oz}" x2="${rx1 + 3 * S}" y2="${-oz}"/>`);
      extAdd(rx0 - 3 * S, oz, rx1 + 3 * S, oz);
      if (G.ordinat_arka && G.ordinat_arka.length) rear.push(ordinate('rear', G.ordinat_arka, oz - 0.9 * S));
      (G.etiketler_arka || []).forEach((lb) => rear.push(LB(lb.x, lb.y, lb.ad, lb.anchor || 'middle', 'side')));
      svgRear = endView('rear', rear);
    }

    /* bağlantı detayları */
    const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
    const detailSvg = (d) => {
      const name = d.gorunum;
      if (!name || !VIEWS[name]) return '';
      const v = VIEWS[name];
      beginView(name, [v.x0, v.y0, v.x1, v.y1], 0.026);
      const out = [];
      (d.etiketler || []).forEach((e) => {
        const [sx, sy] = proj(name, e.x, e.y, e.z);
        if ('ok_z' in e || 'ok_from' in e) {
          const [fx0, fy0] = e.ok_from ? proj(name, e.ok_from[0], e.ok_from[1], e.ok_from[2]) : proj(name, e.x, e.y, e.ok_z);
          out.push(`<line class="cable" x1="${fx0}" y1="${-fy0}" x2="${sx}" y2="${-sy}" marker-end="url(#arrC)"/>`);
          extAdd(Math.min(fx0, sx), Math.min(fy0, sy), Math.max(fx0, sx), Math.max(fy0, sy));
        }
        const dx = e.dx || 0;
        const dy = e.dy || 0;
        const lx = sx + dx;
        const ly = sy + dy;
        if (dx || dy) out.push(`<line class="leader" x1="${sx}" y1="${-sy}" x2="${lx}" y2="${-ly}"/>`);
        if (e.mk) out.push(MK(sx, sy, e.mk));
        else if (dx || dy) out.push(`<circle class="dot" cx="${sx}" cy="${-sy}" r="${fx(0.2 * S, 1)}"/>`);
        if ('ad' in e) {
          const anchor = dx < 0 ? 'end' : (dx > 0 ? 'start' : 'middle');
          const tx = lx + (dx < 0 ? -0.25 * S : dx > 0 ? 0.25 * S : 0);
          out.push(LB(tx, ly - 0.3 * S, e.ad, anchor, e.sinif || 'dlbl'));
        }
      });
      return endView(name, out, 'view det');
    };
    const detailCard = (d) => {
      const rows = (d.satirlar || []).filter((r) => has(r.deger))
        .map((r) => row(T(r.ad), isObj(r.deger) ? T(r.deger) : esc(str(r.deger)))).join('');
      const svg = detailSvg(d);
      const ph = svg ? `<div class="ph">${svg}</div>` : '';
      const tbl = rows ? `<table><colgroup><col style="width:36%"><col></colgroup><tbody>${rows}</tbody></table>` : '';
      return `<div class="dcard lb-part" data-kind="col"><h3><span class="chip">${esc(d.anahtar || '')}</span>${T(d.baslik || '')}</h3>${ph}${tbl}</div>`;
    };

    const iso = VIEWS.iso;
    const isoHtml = iso ? `<img class="iso" width="${iso.W || 1000}" height="${iso.H || 1000}" src="${IMG[iso.png] || ''}" alt="3D isometric view">` : '';
    const arka = has(G.arka_baslik) ? G.arka_baslik : d3('Arka görünüm (servis tarafı)', 'Rear view (service side)', 'Rückansicht (Serviceseite)');

    /* tablolar */
    const UV = Number(E.gerilim_v) || 400;
    const In = Number(E.toplam_guc_kw) * 1000 / (Math.sqrt(3) * UV * Number(E.cos_phi));
    const cosTxt = fx(E.cos_phi, 2);
    const elecRows = [
      row(t3('Besleme gerilimi', 'Supply voltage', 'Versorgungsspannung'), T(E.besleme)),
      row(t3('Toplam kurulu güç', 'Total installed power', 'Gesamtanschlussleistung'), `<b>${E.toplam_guc_kw} kW</b>`),
      row(t3('Ana şalter', 'Main switch', 'Hauptschalter'), `<b>${E.ana_salter_a} A</b>`),
      row(t3('Hesaplanan nominal akım', 'Calculated rated current', 'Berechneter Nennstrom'),
        `${fx(In, 0)} A <small>` + T({
          tr: `(${E.toplam_guc_kw} kW / (√3 · ${UV} V · cos φ ${cosTxt.replace('.', ',')}))`,
          en: `(${E.toplam_guc_kw} kW / (√3 · ${UV} V · cos φ ${cosTxt}))`,
          de: `(${E.toplam_guc_kw} kW / (√3 · ${UV} V · cos φ ${cosTxt.replace('.', ',')}))`
        }) + '</small>')
    ].concat([
      ['ust_koruma', t3('Müşteri tarafı koruma', 'Customer-side protection', 'Kundenseitige Absicherung')],
      ['rcd', t3('Kaçak akım koruması', 'Residual-current protection', 'Fehlerstromschutz')],
      ['kablo_oneri', t3('Besleme kablosu', 'Supply cable', 'Zuleitung')],
      ['kablo_giris', t3('Kablo girişi', 'Cable entry', 'Kabeleinführung')],
      ['topraklama', has(E.faz_sirasi) ? t3('Topraklama', 'Earthing', 'Erdung') : t3('Topraklama / faz sırası', 'Earthing / phase sequence', 'Erdung / Drehfeld')],
      ['faz_sirasi', t3('Faz sırası', 'Phase sequence', 'Drehfeld')],
      ['kumanda', t3('Kumanda gerilimi', 'Control voltage', 'Steuerspannung')],
      ['kontrol', t3('Kontrol sistemi', 'Control system', 'Steuerung')]
    ].filter(([k]) => has(E[k])).map(([k, lbl]) => row(lbl, T(E[k])))).join('');

    const loadRows = (E.yukler || []).map((y) => `<tr><td class="mono">${esc(str(y.ref))}</td><td>${T(y.ad)}</td><td class="num">${esc(str(y.kw))}</td>` +
      `<td>${esc(str(y.koruma))}</td><td class="num">${esc(str(y.sayfa == null ? '' : y.sayfa))}</td></tr>`).join('');
    const yb = E.yukler_baslik || d3('Yük listesi', 'Load list', 'Verbraucherliste');
    const pn = DATA.pnomatik || {};
    const dg = DATA.diger || {};
    const utilRows = [
      [pn, 'basinc', t3('Basınçlı hava', 'Compressed air', 'Druckluft')],
      [pn, 'baglanti', t3('Hava bağlantısı', 'Air connection', 'Luftanschluss')],
      [pn, 'hazirlik', t3('Hava hazırlık', 'Air preparation', 'Luftaufbereitung')],
      [pn, 'tuketiciler', t3('Pnömatik tüketiciler', 'Pneumatic consumers', 'Pneumatische Verbraucher')],
      [dg, 'sicaklik', t3('Çalışma sıcaklığı', 'Operating temperature', 'Betriebstemperatur')],
      [dg, 'su_basinc', t3('Su basıncı', 'Water pressure', 'Wasserdruck')],
      [dg, 'su', t3('Su girişi', 'Water inlet', 'Wasserzulauf')],
      [dg, 'su_dolum', t3('Otomatik su dolumu', 'Automatic water filling', 'Automatische Wasserbefüllung')],
      [dg, 'tahliye', t3('Tahliye', 'Drain', 'Ablauf')],
      [dg, 'tahliye_hat', t3('Müşteri tahliye hattı', 'Customer drain line', 'Kundenseitige Ablaufleitung')],
      [dg, 'yag_ayirici', t3('Yağ ayırıcı', 'Oil separator', 'Ölabscheider')],
      [dg, 'egzoz', t3('Egzoz', 'Exhaust', 'Abluft')]
    ].filter(([src, k]) => has(src[k])).map(([src, k, lbl]) => row(lbl, T(src[k]))).join('');

    /* besleme kablosu */
    const num = (v, nd) => {
      const s = fx(v, nd === undefined ? 2 : nd);
      return { tr: s.replace('.', ','), en: s, de: s.replace('.', ',') };
    };
    const pct = (v) => {
      const n = num(v, 2);
      return { tr: '%' + n.tr, en: n.en + ' %', de: n.de + ' %' };
    };
    const st = (x, y, obj, anchor, cls) => {
      if (isObj(obj)) {
        const [tr, en, de] = l3(obj);
        return `<text class="i18n ${cls || ''}" x="${x}" y="${y}" text-anchor="${anchor || 'start'}" data-tr="${esc(tr)}" data-en="${esc(en)}" data-de="${esc(de)}">${esc(tr)}</text>`;
      }
      return `<text class="${cls || ''}" x="${x}" y="${y}" text-anchor="${anchor || 'start'}">${esc(str(obj))}</text>`;
    };
    let K = E.kablo || null;
    if (K) {
      [['damar_sayisi', 5], ['kesit_mm2', 0], ['yapi', '3P + N + PE'], ['uzunluklar_m', [5, 10, 15, 20]]].forEach(([k, v]) => {
        if (K[k] == null || K[k] === '') K[k] = v;
      });
      if (!Number(K.kesit_mm2)) K = null;
    }
    let cableParts = '';
    if (K) {
      const A = E.ana_salter_a;
      const ma = K.rcd_ma == null ? 30 : K.rcd_ma;
      const ys = { L1: 78, L2: 102, L3: 126, N: 150, PE: 214 };
      const col = Object.fromEntries(CORES.map(([k, c]) => [k, c]));
      const o = [`<svg class="sld" viewBox="0 0 760 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="single-line diagram"><defs>${GY}</defs>`,
        '<rect class="box" x="52" y="20" width="270" height="250"/>', '<rect class="box" x="520" y="20" width="230" height="250"/>',
        '<rect class="sheath" x="368" y="62" width="112" height="168" rx="14"/>'];
      Object.entries(ys).forEach(([k, y]) => {
        if (k === 'PE') {
          o.push(`<line class="w" x1="40" y1="${y}" x2="712" y2="${y}" stroke="#2f9a47"/><line class="w" x1="40" y1="${y}" x2="712" y2="${y}" stroke="#f0c419" stroke-dasharray="10 10"/>`);
        } else {
          if (k === 'L2') o.push(`<line class="w halo" x1="40" y1="${y}" x2="712" y2="${y}"/>`);
          o.push(`<line class="w" x1="40" y1="${y}" x2="712" y2="${y}" stroke="${col[k]}"/>`);
        }
        o.push(st(32, y + 5, k, 'end', 'wl'));
        o.push(`<circle class="term" cx="712" cy="${y}" r="4"/>`);
      });
      o.push('<rect class="dev" x="96" y="66" width="54" height="72" rx="3"/>' + st(123, 107, `${A} A`, 'middle', 'dv'));
      o.push(st(123, 58, d3('Sigorta 3P', 'Fuse 3P', 'Sicherung 3P'), 'middle', 'dl'));
      o.push('<rect class="dev" x="194" y="66" width="70" height="96" rx="3"/>' + st(229, 104, `${A} A`, 'middle', 'dv') + st(229, 126, `${ma} mA`, 'middle', 'dv'));
      const tp = K.rcd_tip;
      o.push(st(229, 58, d3('Kaçak akım 4P' + (tp ? ` · tip ${tp}` : ''), 'RCD 4P' + (tp ? ` · type ${tp}` : ''), 'FI 4P' + (tp ? ` · Typ ${tp}` : '')), 'middle', 'dl'));
      o.push('<line class="gnd" x1="96" y1="214" x2="96" y2="240"/><line class="gnd" x1="82" y1="240" x2="110" y2="240"/>' +
        '<line class="gnd" x1="87" y1="246" x2="105" y2="246"/><line class="gnd" x1="92" y1="252" x2="100" y2="252"/>');
      o.push(st(118, 246, d3("Topraklama hattı – N'den ayrı", 'Earthing conductor – separate from N', 'Erdungsleiter – getrennt von N'), 'start', 'ds'));
      o.push(st(62, 38, d3('MÜŞTERİ DAĞITIM PANOSU', 'CUSTOMER DISTRIBUTION BOARD', 'KUNDENSEITIGE VERTEILUNG'), 'start', 'bt'));
      o.push(st(424, 50, `${K.damar_sayisi} × ${K.kesit_mm2} mm² Cu`, 'middle', 'dv'));
      o.push(st(424, 250, K.yapi, 'middle', 'dl'));
      o.push('<rect class="dev" x="586" y="66" width="56" height="72" rx="3"/>' + st(614, 107, `${A} A`, 'middle', 'dv'));
      o.push(st(614, 58, d3('Ana şalter', 'Main switch', 'Hauptschalter'), 'middle', 'dl'));
      o.push(st(530, 38, d3('MAKİNE ELEKTRİK PANOSU', 'MACHINE ELECTRICAL PANEL', 'SCHALTSCHRANK MASCHINE'), 'start', 'bt'));
      o.push(st(530, 246, has(K.giris_kisa) ? K.giris_kisa : d3('Kablo girişi (E)', 'Cable entry (E)', 'Kabeleinführung (E)'), 'start', 'ds'));
      const sld = o.join('') + '</svg>';
      const xs = [`<svg class="xsec" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="cable cross-section"><defs>${GY}</defs>`,
        '<circle class="jacket" cx="110" cy="110" r="100"/><circle class="filler" cx="110" cy="110" r="88"/>'];
      CORES.forEach(([k, c], i) => {
        const a = (-90 + i * 72) * Math.PI / 180;
        const cx = 110 + 47 * Math.cos(a);
        const cy = 110 + 47 * Math.sin(a);
        xs.push(`<circle class="core" cx="${fx(cx, 1)}" cy="${fx(cy, 1)}" r="33" fill="${c}"/><circle class="cu" cx="${fx(cx, 1)}" cy="${fx(cy, 1)}" r="17"/>` +
          `<text class="cl" x="${fx(cx, 1)}" y="${fx(cy + 6, 1)}" text-anchor="middle">${k}</text>`);
      });
      const xsec = xs.join('') + '</svg>';
      const rho = K.rho_ohm_mm2_m == null ? 0.0225 : Number(K.rho_ohm_mm2_m);
      let crow = '';
      (K.uzunluklar_m || []).forEach((Lm) => {
        const du = Math.sqrt(3) * In * Lm * rho * Number(E.cos_phi) / Number(K.kesit_mm2);
        crow += `<tr><td class="num">${Lm} m</td><td class="num"><b>${K.damar_sayisi} × ${K.kesit_mm2} mm²</b></td>` +
          `<td>${esc(str(K.yapi))}</td><td class="num">${T(num(du))} V</td><td class="num">${T(pct(du / UV * 100))}</td></tr>`;
      });
      const A_ = E.ana_salter_a;
      const kW = E.toplam_guc_kw;
      const i1 = num(In, 1);
      const c2 = num(E.cos_phi, 2);
      const note = d3(`Kesit, ${A_} A sigortaya göre seçilmiştir. Gerilim düşümü (ΔU) ${kW} kW tam yükte (${i1.tr} A, ${UV} V, cos φ ${c2.tr}) hesaplanmıştır.`,
        `Cross-section selected for the ${A_} A circuit breaker. Voltage drop (ΔU) calculated at ${kW} kW full load (${i1.en} A, ${UV} V, cos φ ${c2.en}).`,
        `Querschnitt nach dem ${A_}-A-Leitungsschutzschalter gewählt. Spannungsfall (ΔU) bei ${kW} kW Volllast (${i1.de} A, ${UV} V, cos φ ${c2.de}) berechnet.`);
      const legend = CORES.map(([k, , lbl]) => `<li><span class="sw sw-${k.toLowerCase()}"></span><b>${k}</b>${T(lbl)}</li>`).join('');
      const reqs = (K.sartlar || []).filter(has).map((r) => `<li>${T(r)}</li>`).join('');
      const tip = has(K.tip) ? `<p class="fine"><b>${t3('Kablo tipi', 'Cable type', 'Leitungstyp')}:</b> ${T(K.tip)}</p>` : '';
      cableParts = `<div class="lb-part" data-kind="full"><div class="cab">
      <figure>${sld}<figcaption>${t3('Bağlantı şeması: müşteri panosu → besleme kablosu → makine ana şalteri. PE hattı koruma elemanlarından geçmez ve nötrden ayrıdır.', 'Connection diagram: customer board → supply cable → machine main switch. The PE conductor bypasses the protective devices and is separate from neutral.', 'Anschlussschema: Kundenverteilung → Zuleitung → Hauptschalter der Maschine. Der Schutzleiter läuft nicht über die Schutzorgane und ist vom Neutralleiter getrennt.')}</figcaption></figure>
      <figure class="xs">${xsec}<ul class="cores">${legend}</ul><figcaption>${T(K.tanim || '')}</figcaption></figure>
    </div></div>
    <div class="lb-part" data-kind="col">
      <h3 class="sub">${t3('Kablo kesiti – kablo uzunluğuna göre', 'Cable cross-section by cable length', 'Leiterquerschnitt nach Leitungslänge')}</h3>
      <table><colgroup><col style="width:17%"><col style="width:27%"><col style="width:22%"><col style="width:16%"><col style="width:18%"></colgroup>
      <thead><tr><th class="num">${t3('Uzunluk', 'Length', 'Länge')}</th><th class="num">${t3('Kesit (Cu)', 'Cross-section (Cu)', 'Querschnitt (Cu)')}</th><th>${t3('Damarlar', 'Cores', 'Adern')}</th><th class="num">ΔU (V)</th><th class="num">ΔU (%)</th></tr></thead>
      <tbody>${crow}</tbody></table>
      <p class="fine">${T(note)}</p>
      ${tip}
    </div>`;
      if (reqs) {
        cableParts += `<div class="lb-part" data-kind="col">
      <h3 class="sub">${t3('Müşteri tesisatında bulunması zorunlu olanlar', "Mandatory on the customer's installation", 'Kundenseitig zwingend erforderlich')}</h3>
      <ol class="req">${reqs}</ol>
    </div>`;
      }
    }

    const ptRows = Object.keys(P).map((k) => {
      const p = P[k];
      return `<tr><td><span class="chip">${esc(k)}</span></td><td>${T(p.ad)}</td><td class="num">${fmt(p.x - ox)}</td><td class="num">${fmt(p.y - oy)}</td>` +
        `<td class="num">${fmt(p.z - oz)}</td><td>${T(p.detay)}</td></tr>`;
    }).join('');
    const dimRows = [row(t3('Boy (L) × En (W) × Yükseklik (H)', 'Length (L) × Width (W) × Height (H)', 'Länge (L) × Breite (B) × Höhe (H)'), `<b>${fmt(L)} × ${fmt(W)} × ${fmt(H)} mm</b>`)]
      .concat((G.olcu_satirlari || []).map((d) => row(T(d.ad), isObj(d.deger) ? T(d.deger) : esc(str(d.deger))))).join('');
    const notes = [].concat(E.notlar || [], G.notlar || []).filter(has).map((n) => `<li>${T(n)}</li>`).join('');

    const sec = (sid, title, body) => {
      if (!String(body).trim()) return '';
      const [tr, en, de] = isObj(title) ? l3(title) : [title, title, title];
      return `<section class="lb-sec" data-sec="${sid}" data-tr="${esc(tr)}" data-en="${esc(en)}" data-de="${esc(de)}">${body}</section>\n`;
    };
    const KV = '<colgroup><col style="width:36%"><col></colgroup>';
    const pair = `<div><p class="lb-cap">${t3('Yan görünüm (sağ)', 'Side view (right)', 'Seitenansicht (rechts)')}</p>${svgSide}</div>` +
      (isoHtml ? `<div><p class="lb-cap">${t3('3D izometrik görünüm (ölçeksiz)', '3D isometric view (not to scale)', '3D-Isometrie (nicht maßstäblich)')}</p>${isoHtml}</div>` : '');
    const ptHead = '<colgroup><col style="width:5%"><col style="width:23%"><col style="width:6%"><col style="width:6%"><col style="width:6%"><col></colgroup>' +
      `<thead><tr><th></th><th>${t3('Bağlantı', 'Connection', 'Anschluss')}</th><th class="num">X</th><th class="num">Y</th><th class="num">Z</th><th>${t3('Detay', 'Detail', 'Detail')}</th></tr></thead>`;
    const loadHead = '<colgroup><col style="width:9%"><col style="width:43%"><col style="width:9%"><col style="width:30%"><col style="width:9%"></colgroup>' +
      `<thead><tr><th>Ref</th><th>${t3('Tüketici', 'Load', 'Verbraucher')}</th><th class="num">kW</th><th>${t3('Koruma / sürücü', 'Protection / drive', 'Schutz / Antrieb')}</th><th class="num">${t3('Sayfa', 'Page', 'Seite')}</th></tr></thead>`;
    const details = (DATA.detaylar || []).map(detailCard).join('');

    const SRC = [
      sec('ust', d3('Üst görünüm (plan) – servis alanı ile', 'Top view (plan) – with service area', 'Draufsicht – mit Servicebereich'), `<div class="lb-part lb-view" data-kind="full">${svgTop}</div>`),
      sec('on', d3('Ön görünüm (operatör tarafı)', 'Front view (operator side)', 'Vorderansicht (Bedienerseite)'), `<div class="lb-part lb-view" data-kind="full">${svgFront}</div>`),
      svgRear ? sec('arka', arka, `<div class="lb-part lb-view" data-kind="full">${svgRear}</div>`) : '',
      sec('yan', d3('Yan görünüm · 3D izometrik', 'Side view · 3D isometric', 'Seitenansicht · 3D-Isometrie'), `<div class="lb-part" data-kind="full"><div class="lb-pair">${pair}</div></div>`),
      sec('olculer', d3('Ölçüler', 'Dimensions', 'Abmessungen'), `<table class="lb-part" data-kind="table">${KV}<tbody>${dimRows}</tbody></table>`),
      sec('elektrik', d3('Elektrik bağlantısı', 'Electrical connection', 'Elektrischer Anschluss'), `<table class="lb-part" data-kind="table">${KV}<tbody>${elecRows}</tbody></table>`),
      utilRows ? sec('tesisat', d3('Hava · su · egzoz · tahliye', 'Air · water · exhaust · drain', 'Luft · Wasser · Abluft · Ablauf'), `<table class="lb-part" data-kind="table">${KV}<tbody>${utilRows}</tbody></table>`) : '',
      ptRows ? sec('noktalar', d3('Bağlantı noktaları (referans: sol-ön-alt köşe, mm)', 'Connection points (reference: front-left-bottom corner, mm)', 'Anschlusspunkte (Bezug: Ecke vorne links unten, mm)'),
        `<table class="lb-part" data-kind="table" data-w="full">${ptHead}<tbody>${ptRows}</tbody></table>`) : '',
      sec('detaylar', d3('Bağlantı detayları', 'Connection details', 'Anschlussdetails'), details),
      sec('kablo', d3('Besleme kablosu ve koruma', 'Supply cable and protection', 'Zuleitung und Absicherung'), cableParts),
      loadRows ? sec('yukler', yb, `<table class="lb-part" data-kind="table" data-w="full">${loadHead}<tbody>${loadRows}</tbody></table>`) : '',
      notes ? sec('notlar', d3('Notlar', 'Notes', 'Hinweise'), `<ul class="notes lb-part" data-kind="list">${notes}</ul>`) : ''
    ].join('');
    return { SRC, M };
  }

  const DOC_CSS = `
/* Pafta HTML'i: ekranda koyu zemin üzerinde A3 sayfalar (P&PX gibi), baskıda yalnız sayfalar */
* { box-sizing: border-box }
html, body { margin: 0 }
body { background: #30343c; color: #e8eaef; font: 13px/1.45 'Segoe UI', Selawik, system-ui, sans-serif; min-height: 100vh }
.lb-bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; padding: 8px 16px; background: #1b1e25; border-bottom: 2px solid var(--brand, #ff0000) }
.lb-bar .ttl { display: flex; flex-direction: column; min-width: 0; line-height: 1.25 }
.lb-bar strong { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.lb-bar .ttl > span { font-size: 11.5px; color: #8e96a6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.lb-bar .sp { flex: 1 }
.lang-seg { display: inline-flex; border: 1px solid #2f343e; border-radius: 6px; overflow: hidden; flex-shrink: 0 }
.lang-seg button { background: #23272f; color: #8e96a6; border: 0; border-right: 1px solid #2f343e; padding: 6px 11px; font: 600 12px 'Segoe UI', Selawik, sans-serif; cursor: pointer }
.lang-seg button:last-child { border-right: 0 }
.lang-seg button:hover { color: #e8eaef }
.lang-seg button.active { background: var(--brand, #ff0000); color: #fff }
.btn { background: #2b3039; color: #e8eaef; border: 1px solid #2f343e; border-radius: 6px; padding: 7px 14px; cursor: pointer; font: 600 12.5px 'Segoe UI', Selawik, sans-serif; white-space: nowrap; flex-shrink: 0 }
.btn:hover { background: #363c47 }
.btn-primary { background: var(--brand, #d40000); border-color: var(--brand, #d40000); color: #fff }
.btn-primary:hover { filter: brightness(1.12); background: var(--brand, #d40000) }
.btn:disabled { opacity: .45; cursor: default }
.btn:focus-visible, .lang-seg button:focus-visible { outline: 2px solid #5b9dff; outline-offset: 2px }
#lb-pages { display: flex; flex-direction: column; align-items: center; gap: 22px; padding: 24px 16px 56px }
.lb-shell { position: relative; flex-shrink: 0; overflow: hidden; background: #fff; box-shadow: 0 8px 28px rgba(0, 0, 0, .45); border-radius: 2px }
.lb-shell > .lb-print { position: absolute; left: 0; top: 0 }
body.lb-embed .lb-bar { display: none }
body.lb-embed #lb-pages { padding-top: 18px }
#lb-src { display: none }
dialog.pdfdlg { border: 0; border-top: 3px solid var(--brand, #ff0000); border-radius: 8px; padding: 20px 22px; background: #1b1e25; color: #e8eaef; width: min(400px, calc(100vw - 32px)); box-shadow: 0 20px 50px rgba(0, 0, 0, .6) }
dialog.pdfdlg::backdrop { background: rgba(0, 0, 0, .55) }
.pdfdlg h3 { margin: 0 0 12px; font-size: 15px; font-weight: 600 }
.pdfdlg .pdf-langs { display: flex; gap: 8px; margin-bottom: 12px }
.pdfdlg .pdf-lang { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border: 1px solid #2f343e; border-radius: 6px; font-weight: 600; cursor: pointer; color: #8e96a6 }
.pdfdlg .pdf-lang input { accent-color: var(--brand, #ff0000); margin: 0 }
.pdfdlg .pdf-lang.is-on { background: rgba(255, 0, 0, .14); color: #e8eaef; border-color: var(--brand, #ff0000) }
.pdfdlg p { font-size: 12px; color: #aab0bc; margin: 0 }
.pdfdlg p.busy { color: #f5c068; font-weight: 600; margin-top: 10px }
.pdfdlg .acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px }
@media (max-width: 640px) { .lb-bar { flex-wrap: wrap } .lb-bar .sp { display: none } }
@page { size: 420mm 297mm; margin: 0 }
@media print {
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important }
  html, body { background: #fff !important; min-height: 0 }
  body.printing > :not(#print-root) { display: none !important }
  #print-root > .lb-print { break-after: page; page-break-after: always; margin: 0 }
  #print-root > .lb-print:last-child { break-after: auto; page-break-after: auto }
}
`;

  /**
   * Tam pafta HTML'i.
   * input: { data, views, images: {png: dataURI}, design, assets: { css, js, fonts: {400,600,700: dataURI}, logos: {DOLFIN: dataURI, …} },
   *          export: {langs, only, cover} | null, embed: {lang} | null }
   */
  function build(input) {
    const { SRC, M } = source(input);
    const META = Object.assign({}, M);
    META.firma = LOGO_FILES[META.firma] ? META.firma : 'DOLFIN';
    const file = M.dosya_adi || `${String(M.model).split(' ').join('-')}-Layout`;
    const lf = LOGO_FILES[META.firma];
    const logos = {};
    logos[lf.split('.')[0]] = (input.assets.logos || {})[META.firma] || '';
    const fonts = input.assets.fonts || {};
    const fontFaces = [400, 600, 700].filter((w) => fonts[w])
      .map((w) => `@font-face { font-family: 'Selawik'; font-weight: ${w}; src: url(${fonts[w]}) format('truetype'); }\n`).join('');
    const meta = JSON.stringify({ meta: META, design: input.design || 'bant', logos, file, title: M.proje || M.model, export: input.export || null })
      .replace(/<\//g, '<\\/');
    const accent = BRAND_COLORS[META.firma];
    const title = esc(`${M.proje || M.model} – Layout`);
    const mus = isObj(M.musteri) ? l3(M.musteri)[0] : str(M.musteri);
    const embed = input.embed ? `<script>window.LB_OPTS = ${JSON.stringify({ embed: true, lang: input.embed.lang || 'tr' })};</script>\n` : '';
    const js = String(input.assets.js || '').replace(/<\/script/gi, '<\\/script');
    return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<style>
${fontFaces}${input.assets.css || ''}${DOC_CSS}</style>
</head>
<body>
${embed}<header class="lb-bar" style="--brand:${accent}">
  <div class="ttl"><strong>${esc(M.model)} · <span data-t="docTypeValue">Yerleşim Planı</span></strong><span>${esc(str(M.seri_no))} · ${esc(mus)} · Rev ${esc(str(M.rev))}</span></div>
  <span class="sp"></span>
  <div class="lang-seg" role="group" aria-label="Language">
    <button type="button" data-doc-lang="tr" aria-pressed="true">TR</button><button type="button" data-doc-lang="en" aria-pressed="false">EN</button><button type="button" data-doc-lang="de" aria-pressed="false">DE</button>
  </div>
  <button type="button" class="btn btn-primary" id="pdf-open" aria-haspopup="dialog" data-t="pdf">PDF indir</button>
</header>
<main id="lb-pages" style="--brand:${accent}"></main>
<div id="lb-src">
${SRC}</div>
<script type="application/json" id="lb-meta">${meta}</script>
<dialog class="pdfdlg" id="pdf-dlg" aria-labelledby="pdf-h" style="--brand:${accent}">
  <h3 id="pdf-h" data-t="pdf">PDF indir</h3>
  <div class="pdf-langs">
    <label class="pdf-lang"><input type="checkbox" name="pdf-lang" value="tr"> TR</label>
    <label class="pdf-lang"><input type="checkbox" name="pdf-lang" value="en"> EN</label>
    <label class="pdf-lang"><input type="checkbox" name="pdf-lang" value="de"> DE</label>
  </div>
  <p data-t="pdfNote"></p>
  <p class="busy" hidden data-t="busy"></p>
  <div class="acts"><button type="button" class="btn cancel" data-t="cancel">İptal</button><button type="button" class="btn print" data-t="print">Yazdır</button><button type="button" class="btn btn-primary go" data-t="pdf">PDF indir</button></div>
</dialog>
<script>
${js}
</script>
<script>LayoutBelge.startDocument();</script>
</body>
</html>
`;
  }

  /** Dosya adı (uzantısız) */
  function fileName(data) {
    const m = data.makine || {};
    return m.dosya_adi || `${String(m.model || 'Layout').split(' ').join('-')}-Layout`;
  }

  return { build, source, fileName, LOGO_FILES, BRAND_COLORS, pyRound };
});
