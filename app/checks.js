/* Eksikler: LAYOUT-KURALLARI.md'deki teslim öncesi kontrol listesi (§8), yazım kuralları (§6) ve
   her layout'ta sorulacaklar (§9). Her madde bir bölüme ve mümkünse bir alana bağlıdır; tıklanınca o alana gidilir.
   Düzey: error (teslim edilmez), warn (gözden geçir), info (bilgi). Metinler program dilinde (t_). */

const LayoutChecks = (() => {
  const S = () => LayoutSections;
  const LANGS = ['tr', 'en', 'de'];
  const LN = { tr: 'TR', en: 'EN', de: 'DE' };
  const filled = (v) => String(v == null ? '' : v).trim() !== '';
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const any = (v) => (isObj(v) ? LANGS.some((l) => filled(v[l])) : filled(v));

  /* §6: paftada soru, varsayım ve çekince bulunmaz */
  const BANNED = {
    tr: [/tahmin/i, /yaklaşık/i, /doğrulanacak/i, /teyit edilecek/i, /kontrol edilecek/i, /varsayıl/i, /eklenecek/i, /belirlenecek/i, /sorulacak/i, /\bTBD\b/i],
    en: [/\bapprox/i, /\bestimated?\b/i, /to be (confirmed|checked|added|defined|determined)/i, /\bassum/i, /\bTB[CDA]\b/i],
    de: [/\bca\./i, /\bcirca\b/i, /ungefähr/i, /geschätzt/i, /zu (bestätigen|prüfen|ergänzen)/i, /angenommen/i, /wird ergänzt/i]
  };
  const SKIP_KEYS = new Set(['kaynak_step', 'dosya_adi', 'proje', 'eksen', 'gorunum', 'anchor', 'yon', 'sinif', 'mk', 'anahtar', 'ref', 'koruma', 'sayfa']);
  const LETTER_CARD = { E: 'Elektrik', P: 'Hava', W: 'Su', D: 'Tahliye', X: 'Egzoz', S: 'Yağ ayırıcı' };

  /** Metin alanlarını yollarıyla gezer: cb(path, value, lang | null, i18nNesnesi) */
  function walk(o, path, cb) {
    if (o == null) return;
    if (Array.isArray(o)) {
      o.forEach((v, i) => walk(v, path.concat(String(i)), cb));
      return;
    }
    if (isObj(o)) {
      const keys = Object.keys(o);
      if (keys.length && keys.every((k) => LANGS.includes(k))) {
        LANGS.forEach((l) => cb(path, o[l], l, o));
        return;
      }
      keys.forEach((k) => {
        if (k.startsWith('_') || SKIP_KEYS.has(k)) return;
        walk(o[k], path.concat(k), cb);
      });
      return;
    }
    if (typeof o === 'string') cb(path, o, null, null);
  }

  function run(ctx) {
    const out = [];
    const add = (level, path, text, extra) => {
      const p = Array.isArray(path) ? path.join('.') : (path || '');
      out.push(Object.assign({ level, path: p, sec: (extra && extra.sec) || S().sectionOfPath(p), text }, extra || {}));
    };
    const d = ctx.data || {};
    const M = d.makine || {};
    const G = d.geometri || {};
    const E = d.elektrik || {};
    const P = d.pnomatik || {};
    const D = d.diger || {};
    const VM = ctx.views_meta;
    const template = !!ctx.template;

    /* ── Model ve görünümler ── */
    if (!template) {
      if (!ctx.step && !VM) add('error', '', t_('STEP dosyası yok. Dosyalar sekmesinden ya da "Model ve görünümler" bölümünden yükleyin.'), { sec: 'model', act: 'uploadStep' });
      else if (!ctx.step) add('info', '', t_('STEP bu bilgisayarda yok (büyük olduğu için veritabanına alınmaz). Görünümler hazır; yeniden üretmek gerekirse STEP yükleyin.'), { sec: 'model', act: 'uploadStep' });
      if (!VM) add('error', '', t_('Görünümler üretilmedi; pafta önizlemesi ve teslim paftası için gerekli.'), { sec: 'model', act: 'views' });
      else if (!VM.rear) add('warn', '', t_('Arka görünüm yok (§2: arka görünüm şeridi). "Görünümler" ile yeniden üretin.'), { sec: 'arka', act: 'views' });
      if (VM && !(Number(G.boy) > 0 && Number(G.en) > 0 && Number(G.yukseklik) > 0)) add('error', 'geometri.boy', t_('Makine kutusu ölçüleri (L × W × H) eksik.'));
    }

    /* ── Kapak ve antet ── */
    [['seri_no', 'Proje no (seri no)'], ['musteri', 'Müşteri'], ['model', 'Model'], ['tarih', 'Tarih'], ['rev', 'Revizyon'], ['hazirlayan', 'Hazırlayan']]
      .forEach(([k, label]) => {
        if (template && ['seri_no', 'musteri', 'model', 'tarih'].includes(k)) return;
        if (!any(M[k])) add('error', ['makine', k], t_('Kapak: {f} boş.', { f: t_(label) }));
      });
    if (!template && filled(M.tarih) && !/^\d{2}\.\d{2}\.\d{4}$/.test(String(M.tarih))) add('warn', 'makine.tarih', t_('Tarih gg.aa.yyyy biçiminde yazılmalı.'));
    if (!template && !any(M.tam_ad)) add('warn', 'makine.tam_ad', t_('Kapak: Tip (makine tam adı) boş.'));
    if (!template && !filled(M.kontrol) && !filled(M.onay)) add('info', 'makine.kontrol', t_('Kapakta ve antette Kontrol / Onay imza alanları boş.'));
    if (!template && !filled(M.dosya_adi)) add('warn', 'makine.dosya_adi', t_('Dosya adı boş; model adından türetilir.'));
    if (filled(M.rev) && !/^\d{2}$/.test(String(M.rev).trim())) add('info', 'makine.rev', t_('Revizyon iki haneli sayıyla yazılır (ilk yayın 00).'));

    /* ── Elektrik (§5, §9) ── */
    if (!(Number(E.toplam_guc_kw) > 0)) add(template ? 'info' : 'error', 'elektrik.toplam_guc_kw', t_('Toplam güç (kW) girilmedi.'));
    if (!(Number(E.ana_salter_a) > 0)) add('error', 'elektrik.ana_salter_a', t_('Ana şalter (A) girilmedi.'));
    if (!(Number(E.gerilim_v) > 0)) add('warn', 'elektrik.gerilim_v', t_('Hesap gerilimi (V) yok; 400 V ile hesaplanır.'));
    if (!any(E.besleme)) add('error', 'elektrik.besleme', t_('Besleme gerilimi yazılmadı.'));
    if (!template && !any(E.kablo_giris)) add('warn', 'elektrik.kablo_giris', t_('Kablo girişinin yeri yazılmadı.'));
    if (!any(E.topraklama)) add('warn', 'elektrik.topraklama', t_('Topraklama (TN-S, PE) metni yok.'));

    /* ── Besleme kablosu (§8: her paftada bulunur) ── */
    const K = E.kablo;
    if (!K) add('error', 'elektrik.kablo', t_('Besleme kablosu ve koruma bölümü yok (her paftada bulunmalı).'), { act: 'addCable' });
    else {
      if (!(Number(K.kesit_mm2) > 0)) add('error', 'elektrik.kablo.kesit_mm2', t_('Kablo kesiti (mm²) girilmedi.'));
      if (!(K.uzunluklar_m || []).length) add('warn', 'elektrik.kablo.uzunluklar_m', t_('Kablo uzunlukları (5 / 10 / 15 / 20 m) yok.'));
      if (!(K.sartlar || []).some(any)) add('warn', 'elektrik.kablo.sartlar', t_('Müşteri tesisatında zorunlu olanlar listesi boş.'));
      if (!any(K.tanim)) add('info', 'elektrik.kablo.tanim', t_('Kablo tanımı (damar renkleri) boş.'));
      const A = Number(E.ana_salter_a);
      const need = A > 100 ? 35 : A > 63 ? 25 : A > 50 ? 16 : A > 40 ? 10 : A > 25 ? 6 : A > 20 ? 4 : 2.5;
      if (A > 0 && Number(K.kesit_mm2) > 0 && Number(K.kesit_mm2) < need) {
        add('warn', 'elektrik.kablo.kesit_mm2', t_('{a} A sigorta için {k} mm² kesit küçük görünüyor (önerilen en az {n} mm²).', { a: A, k: K.kesit_mm2, n: need }));
      }
    }

    /* ── Bağlantı noktaları (§4, §8) ── */
    const pts = G.noktalar || {};
    const keys = Object.keys(pts);
    if (!keys.length) add('error', 'geometri.noktalar', t_('Bağlantı noktası yok (E, P, W, D, X).'));
    const L = Number(G.boy) || 0;
    const W = Number(G.en) || 0;
    const H = Number(G.yukseklik) || 0;
    const [ox, oy, oz] = Array.isArray(G.origin) ? G.origin.map(Number) : [0, 0, 0];
    const SA = G.servis_alani || {};
    keys.forEach((k) => {
      const p = pts[k] || {};
      const base = ['geometri', 'noktalar', k];
      if (!any(p.ad)) add('error', base.concat('ad'), t_('Bağlantı {k}: adı yazılmadı.', { k }));
      if (!any(p.detay)) add('warn', base.concat('detay'), t_('Bağlantı {k}: detay metni (ölçü, tip, konum) yok.', { k }));
      if (!template && 'rel' in p) add('warn', base, t_('Bağlantı {k}: konumu henüz yerleştirilmedi (görünümleri üretin ya da görünüme tıklayarak yerleştirin).', { k }));
      if (!template && L > 0 && ['x', 'y', 'z'].every((a) => Number.isFinite(Number(p[a]))) && !('rel' in p)) {
        const outside = Number(p.x) < ox - (SA.sol || 0) || Number(p.x) > ox + L + (SA.sag || 0) ||
          Number(p.y) < oy - (SA.on || 0) || Number(p.y) > oy + W + (SA.arka || 0) || Number(p.z) < oz - 50 || Number(p.z) > oz + H + 50;
        if (outside) add('warn', base.concat('x'), t_('Bağlantı {k}: konum makine kutusunun dışında görünüyor.', { k }));
      }
    });
    /* her bağlantı türünün detay kartı */
    const cards = d.detaylar || [];
    const cardKeys = cards.map((c) => String(c.anahtar || '').toUpperCase());
    const letters = [...new Set(keys.map((k) => k.replace(/[^A-Z]/gi, '').toUpperCase().charAt(0)).filter((c) => LETTER_CARD[c]))];
    letters.forEach((c) => {
      if (!cardKeys.some((ck) => ck.replace(/[^A-Z]/g, '').includes(c))) {
        add(template ? 'info' : 'warn', 'detaylar', t_('{t} ({c}) bağlantısının detay kartı yok (§8).', { t: t_(LETTER_CARD[c]), c }), { sec: 'detaylar' });
      }
    });
    cards.forEach((c, i) => {
      const base = ['detaylar', String(i)];
      const name = c.anahtar || `#${i + 1}`;
      if (!any(c.baslik)) add('warn', base.concat('baslik'), t_('Detay kartı {n}: başlık yok.', { n: name }));
      if (!template && (!c.gorunum || !VM || !VM[c.gorunum])) add('warn', base.concat('gorunum'), t_('Detay kartı {n}: yakın görünüm seçilmedi ya da üretilmedi.', { n: name }));
      if (!(c.satirlar || []).some((r) => any(r.deger))) add('warn', base.concat('satirlar'), t_('Detay kartı {n}: değer tablosu boş.', { n: name }));
    });

    /* ── Hava · su · egzoz · tahliye: noktası olan bağlantının bilgisi ── */
    const hasLetter = (c) => keys.some((k) => k.toUpperCase().startsWith(c));
    if (hasLetter('P') && !any(P.basinc)) add('warn', 'pnomatik.basinc', t_('Hava bağlantısı var ama hava basıncı yazılmadı.'));
    if (hasLetter('P') && !any(P.baglanti)) add('warn', 'pnomatik.baglanti', t_('Hava bağlantısının ölçüsü / yeri yazılmadı.'));
    if (hasLetter('W') && !any(D.su)) add('warn', 'diger.su', t_('Su girişi var ama ölçüsü / yeri yazılmadı.'));
    if (hasLetter('W') && !any(D.su_basinc)) add('warn', 'diger.su_basinc', t_('Su basıncı yazılmadı.'));
    if (hasLetter('D') && !any(D.tahliye)) add('warn', 'diger.tahliye', t_('Tahliye var ama ölçüsü / yeri yazılmadı.'));
    if (hasLetter('X') && !any(D.egzoz)) add('warn', 'diger.egzoz', t_('Egzoz var ama kanal ölçüsü yazılmadı.'));
    if (!any(D.sicaklik)) add('info', 'diger.sicaklik', t_('Çalışma sıcaklığı yazılmadı.'));

    /* ── Ölçüler (§9: boş ağırlık) ── */
    const rows = G.olcu_satirlari || [];
    rows.forEach((r, i) => {
      const name = S().txt(r.ad) || t_('Satır {n}', { n: i + 1 });
      if (!any(r.deger)) add(/ağırlık|weight|gewicht/i.test(name) ? 'warn' : 'info', ['geometri', 'olcu_satirlari', String(i), 'deger'], t_('Ölçüler: "{n}" değeri boş (paftada görünmez).', { n: name }));
      if (typeof r.deger === 'string' && /\{[LWH]\}/.test(r.deger)) add('warn', ['geometri', 'olcu_satirlari', String(i), 'deger'], t_('Ölçüler: "{n}" içinde doldurulmamış yer tutucu var.', { n: name }));
    });
    if (!rows.some((r) => /ağırlık|weight|gewicht/i.test(S().txt(r.ad)))) add('info', 'geometri.olcu_satirlari', t_('Ölçü tablosunda boş ağırlık satırı yok.'));

    /* ── Servis alanı / notlar ── */
    const SIDE = { on: 'Ön', arka: 'Arka', sol: 'Sol', sag: 'Sağ' };
    ['on', 'arka', 'sol', 'sag'].forEach((k) => {
      if (Number(SA[k]) !== 1000 && SA[k] != null) add('info', ['geometri', 'servis_alani', k], t_('Servis alanı {s}: {v} mm (standart 1000 mm).', { s: t_(SIDE[k]), v: SA[k] }));
    });
    if (![].concat(G.notlar || [], E.notlar || []).some(any)) add('warn', 'geometri.notlar', t_('Notlar boş (ölçü notu, servis alanı + terazileme, bağlantıların yeri).'));
    if (!(E.yukler || []).length && !template) add('info', 'elektrik.yukler', t_('Yük listesi yok (yalnızca elektrik şeması varsa eklenir).'));

    /* ── Yazım kuralları ve üç dil (§6) ── */
    const seenI18n = new Set();
    walk(d, [], (path, value, lang, obj) => {
      const p = path.join('.');
      const where = label(path);
      if (obj && !seenI18n.has(p)) {
        seenI18n.add(p);
        const fullCount = LANGS.filter((l) => filled(obj[l])).length;
        if (fullCount > 0 && fullCount < 3) {
          const miss = LANGS.filter((l) => !filled(obj[l])).map((l) => LN[l]).join(', ');
          add('warn', p, t_('Üç dil eksik ({m} boş): {w}', { m: miss, w: where }), { lang: LANGS.find((l) => !filled(obj[l])) });
        }
      }
      const s = String(value || '');
      if (!s.trim()) return;
      const ex = { lang: lang || undefined };
      const langs = lang ? [lang] : ['tr'];
      langs.forEach((l) => {
        const hit = (BANNED[l] || []).find((re) => re.test(s));
        if (hit) add('error', p, t_('Yasaklı ifade ({l}): "{x}" – değerler kesin yazılır. {w}', { l: LN[l], x: s.match(hit)[0], w: where }), ex);
      });
      if (/(?<!\d)~/.test(s)) add('error', p, t_('"~" işareti kullanılmış (değerler kesin yazılır; 3~ faz gösterimi serbest): {w}', { w: where }), ex);
      if (/\?/.test(s)) add('error', p, t_('Soru işareti var (paftada soru bulunmaz): {w}', { w: where }), ex);
      if (/\(\s*eklenecek\s*\)|\bxx+\b/i.test(s)) add('error', p, t_('Yer tutucu metin kalmış: {w}', { w: where }), ex);
      if (/\bG\s?\d+(\s\d\/\d)?"|\bG\s?\d\/\d"?/.test(s)) add('warn', p, t_('İnç ölçüsü "G" önekiyle yazılmış (1 1/2", 1/2" biçiminde yazılır): {w}', { w: where }), ex);
      if (/\.(step|stp)\b/i.test(s)) add('warn', p, t_('Metinde çalışma dosyası adı geçiyor (proje adı kullanılır): {w}', { w: where }), ex);
      if (lang === 'en' && /(?<![\d.,])\d+,\d{1,2}(?![\d.,])/.test(s)) add('warn', p, t_('EN metinde ondalık ayırıcı virgül (EN\'de nokta): {w}', { w: where }), ex);
      if ((lang === 'tr' || lang === 'de') && /(?<![\d.,])\d+\.\d{1,2}(?![\d.,])/.test(s) && !/\d+\.\d+\.\d+/.test(s)) {
        add('warn', p, t_('{l} metinde ondalık ayırıcı nokta ({l}\'de virgül): {w}', { l: LN[lang], w: where }), ex);
      }
    });

    const order = { error: 0, warn: 1, info: 2 };
    const secOrder = Object.fromEntries(S().SECTIONS.map((s, i) => [s.id, i]));
    return out.sort((a, b) => (order[a.level] - order[b.level]) || ((secOrder[a.sec] || 0) - (secOrder[b.sec] || 0)));
  }

  const LABELS = {
    makine: 'Kapak', elektrik: 'Elektrik', pnomatik: 'Hava', diger: 'Su · egzoz · tahliye', geometri: 'Geometri', detaylar: 'Detay kartı',
    noktalar: 'Bağlantı', olcu_satirlari: 'Ölçüler', kablo: 'Kablo', sartlar: 'zorunlu', notlar: 'Not', satirlar: 'satır', etiketler: 'etiket',
    ad: 'ad', detay: 'detay', deger: 'değer', baslik: 'başlık', tam_ad: 'tip', musteri: 'müşteri', yukler: 'Yük listesi',
    basinc: 'Basınç', baglanti: 'Hava bağlantısı', hazirlik: 'Hava hazırlık', tuketiciler: 'Pnömatik tüketiciler', su: 'Su girişi',
    su_basinc: 'Su basıncı', sicaklik: 'Çalışma sıcaklığı', su_dolum: 'Otomatik su dolumu', tahliye: 'Tahliye', tahliye_hat: 'Müşteri tahliye hattı',
    egzoz: 'Egzoz', yag_ayirici: 'Yağ ayırıcı', besleme: 'Besleme gerilimi', ust_koruma: 'Müşteri tarafı koruma', rcd: 'Kaçak akım koruması',
    kablo_oneri: 'Besleme kablosu', kablo_giris: 'Kablo girişi', topraklama: 'Topraklama', faz_sirasi: 'Faz sırası', kumanda: 'Kumanda gerilimi',
    kontrol: 'Kontrol sistemi', tanim: 'Kablo tanımı', tip: 'Kablo tipi', giris_kisa: 'Şemadaki kablo girişi yazısı', on_yazi: 'Ön taraf yazısı',
    arka_baslik: 'Bölüm başlığı', yukler_baslik: 'Bölüm başlığı'
  };
  function label(path) {
    return path.map((p) => (/^\d+$/.test(p) ? `#${Number(p) + 1}` : (LABELS[p] ? t_(LABELS[p]) : p.replace(/_/g, ' ')))).join(' › ');
  }

  function counts(list) {
    const bySec = {};
    let e = 0;
    let w = 0;
    let i = 0;
    list.forEach((c) => {
      const s = (bySec[c.sec] = bySec[c.sec] || { error: 0, warn: 0, info: 0 });
      s[c.level] += 1;
      if (c.level === 'error') e += 1;
      else if (c.level === 'warn') w += 1;
      else i += 1;
    });
    return { bySec, error: e, warn: w, info: i };
  }

  return { run, counts };
})();
