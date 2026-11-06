/* Bölümler: soldaki liste, belgedeki sıra (LAYOUT-KURALLARI §2) ve her bölümün düzenleme alanları.
   Alan türleri form.js'te: text, num, date, select, i18n, mixed (düz ya da üç dilli), nums, keys, xyz, list,
   heading, note, kv, actions, custom. Yollar veri JSON'unda noktalı yazılır (örn. "makine.seri_no"). */

const LayoutSections = (() => {
  const blank3 = () => ({ tr: '', en: '', de: '' });
  const today = () => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  };
  const txt = (v) => (v && typeof v === 'object' ? (v.tr || v.en || v.de || '') : (v == null ? '' : String(v)));
  const filled = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.values(v).some((x) => String(x || '').trim()) : String(v == null ? '' : v).trim() !== '');

  const ANCHORS = [['start', 'Sola dayalı'], ['middle', 'Ortalı'], ['end', 'Sağa dayalı']];
  const DIR = [['h', 'Yatay (h)'], ['v', 'Dikey (v)']];

  const dimList = (path, label, help) => ({
    k: 'list', path, label, help,
    title: (it) => `${it.yon === 'v' ? t_('Dikey') : t_('Yatay')} · ${Math.round((Number(it.b) || 0) - (Number(it.a) || 0))} mm`,
    blank: () => ({ yon: 'h', a: 0, b: 0, c: 0 }),
    item: [{ k: 'row', cols: 4, fields: [
      { k: 'select', path: 'yon', label: 'Yön', options: DIR },
      { k: 'num', path: 'a', label: 'Başlangıç' },
      { k: 'num', path: 'b', label: 'Bitiş' },
      { k: 'num', path: 'c', label: 'Konum' }
    ] }]
  });

  const labelList = (path, label) => ({
    k: 'list', path, label,
    title: (it) => txt(it.ad) || t_('(boş etiket)'),
    blank: () => ({ x: 0, y: 0, anchor: 'middle', ad: blank3() }),
    item: [
      { k: 'row', cols: 3, fields: [
        { k: 'num', path: 'x', label: 'x' },
        { k: 'num', path: 'y', label: 'y' },
        { k: 'select', path: 'anchor', label: 'Hizalama', options: ANCHORS }
      ] },
      { k: 'i18n', path: 'ad', label: 'Yazı' }
    ]
  });

  const SECTIONS = [
    {
      id: 'model', mark: 'M', group: 'Proje', title: 'Model ve görünümler', sub: 'STEP, eksenler, makine kutusu', doc: null,
      fields: [
        { k: 'custom', render: 'modelInfo' },
        { k: 'heading', text: 'Makine kutusu (görünüm koordinatları, mm)' },
        { k: 'row', cols: 3, fields: [
          { k: 'num', path: 'geometri.boy', label: 'Boy L' },
          { k: 'num', path: 'geometri.en', label: 'En W' },
          { k: 'num', path: 'geometri.yukseklik', label: 'Yükseklik H' }
        ] },
        { k: 'xyz', path: 'geometri.origin', label: 'Referans köşe (sol-ön-alt) x, y, z' },
        { k: 'note', text: 'Kutu ölçüleri ve referans köşe görünümler üretilirken STEP\'ten gelir. Ana ölçüler ÇNK imalat resmindekinden farklıysa buradan düzeltin; değerler tam mm yazılır.' }
      ]
    },
    {
      id: 'kapak', mark: 'K', group: 'Proje', title: 'Kapak ve antet', sub: 'Proje no, müşteri, imzalar, revizyonlar', doc: 'kapak',
      fields: [
        { k: 'actions', buttons: [{ label: 'Kapak stüdyosunu aç', act: 'cover', primary: true }] },
        { k: 'row', cols: 2, fields: [
          { k: 'text', path: 'makine.seri_no', label: 'Proje no (seri no)', ph: '0626051' },
          { k: 'select', path: 'makine.firma', label: 'Marka', options: LayoutBelge.BRAND_LIST, def: 'DOLFIN' }
        ] },
        { k: 'mixed', path: 'makine.musteri', label: 'Müşteri' },
        { k: 'text', path: 'makine.model', label: 'Model', ph: 'ULT M200 3B L' },
        { k: 'mixed', path: 'makine.tam_ad', label: 'Tip (makine tam adı)' },
        { k: 'row', cols: 3, fields: [
          { k: 'text', path: 'makine.hazirlayan', label: 'Hazırlayan' },
          { k: 'text', path: 'makine.kontrol', label: 'Kontrol' },
          { k: 'text', path: 'makine.onay', label: 'Onay' }
        ] },
        { k: 'row', cols: 2, fields: [
          { k: 'date', path: 'makine.tarih', label: 'Tarih' },
          { k: 'text', path: 'makine.rev', label: 'Revizyon', ph: '00' }
        ] },
        { k: 'heading', text: 'Belge' },
        { k: 'text', path: 'makine.proje', label: 'Proje adı (belge başlığı)' },
        { k: 'text', path: 'makine.dosya_adi', label: 'Dosya adı (HTML / PDF)', help: '<seri no>-<MÜŞTERİ>-<MODEL>-Layout, boşluklar tire.', derive: 'dosya_adi' },
        { k: 'text', path: 'makine.kaynak_step', label: 'Kaynak model (STEP)' },
        { k: 'heading', text: 'Revizyonlar' },
        {
          k: 'list', path: 'makine.revizyonlar', label: 'Revizyon geçmişi',
          help: 'Son dört revizyon her sayfada başlık bloğunun üstündeki tabloda görünür. İlk yayın Rev 00; her içerik değişikliğinde bir artar (01, 02, …).',
          title: (it) => `${t_('Rev.')} ${txt(it.rev) || '–'} · ${txt(it.tarih)} · ${txt(it.aciklama)}`,
          blank: (ctx) => ({ rev: ctx.data.makine.rev || '00', tarih: today(), aciklama: blank3(), hazirlayan: ctx.data.makine.hazirlayan || 'Fatih GÜRAL' }),
          item: [
            { k: 'row', cols: 3, fields: [
              { k: 'text', path: 'rev', label: 'Rev.' },
              { k: 'date', path: 'tarih', label: 'Tarih' },
              { k: 'text', path: 'hazirlayan', label: 'Hazırlayan' }
            ] },
            { k: 'mixed', path: 'aciklama', label: 'Açıklama' }
          ]
        }
      ]
    },
    {
      id: 'ust', group: 'Görünümler', title: 'Üst görünüm (plan)', sub: 'Servis alanı, etiketler, ek ölçüler', doc: 'ust',
      fields: [
        { k: 'heading', text: 'Servis alanı (mm)' },
        { k: 'row', cols: 4, fields: [
          { k: 'num', path: 'geometri.servis_alani.on', label: 'Ön' },
          { k: 'num', path: 'geometri.servis_alani.arka', label: 'Arka' },
          { k: 'num', path: 'geometri.servis_alani.sol', label: 'Sol' },
          { k: 'num', path: 'geometri.servis_alani.sag', label: 'Sağ' }
        ] },
        { k: 'mixed', path: 'geometri.on_yazi', label: 'Ön taraf yazısı', optional: true, help: 'Boşsa "OPERATÖR / YÜKLEME TARAFI" yazılır (konveyörlü makinede yükleme uçtadır).' },
        { k: 'heading', text: 'Etiketler ve ek ölçüler' },
        labelList('geometri.etiketler_ust', 'Bölge etiketleri'),
        dimList('geometri.ek_olculer_ust', 'Ek ölçüler', 'Yatay: a → b arası x, c = y konumu. Dikey: a → b arası y, c = x konumu (görünüm koordinatları, mm).')
      ]
    },
    {
      id: 'on', group: 'Görünümler', title: 'Ön görünüm', sub: 'Operatör tarafı, kotlar', doc: 'on',
      fields: [
        dimList('geometri.ek_olculer_on', 'Ek ölçüler (kotlar)', 'Dikey: a → b arası z (zeminden yükseklik), c = x konumu. Yatay: a → b arası x, c = z konumu.'),
        { k: 'keys', path: 'geometri.ordinat_on', label: 'X ordinatları (nokta harfleri)', optional: true, help: 'Bağlantılar ön yüzdeyse: sol uçtan X ordinatları zeminin altında verilir (örn. E, W, P, D1).' }
      ]
    },
    {
      id: 'arka', group: 'Görünümler', title: 'Arka görünüm', sub: 'Servis tarafı, ordinatlar', doc: 'arka',
      fields: [
        { k: 'custom', render: 'rearInfo' },
        { k: 'mixed', path: 'geometri.arka_baslik', label: 'Bölüm başlığı', optional: true, help: 'Boşsa "Arka görünüm (servis tarafı)".' },
        { k: 'keys', path: 'geometri.ordinat_arka', label: 'X ordinatları (nokta harfleri)', optional: true, help: 'Sol uçtan X ordinatları (arka görünümde sol uç resmin sağındadır).' },
        labelList('geometri.etiketler_arka', 'Etiketler'),
        dimList('geometri.ek_olculer_arka', 'Ek ölçüler', 'Ekran koordinatı: arka görünümde x = −X. Dikey ölçüler bağlantı yükseklik kotları içindir.')
      ]
    },
    {
      id: 'yan', group: 'Görünümler', title: 'Yan görünüm · 3D', sub: 'Sağdan bakış, izometrik', doc: 'yan',
      fields: [
        dimList('geometri.ek_olculer_yan', 'Ek ölçüler', 'Yatay: a → b arası y (en), c = z konumu. Dikey: a → b arası z, c = y konumu.'),
        { k: 'note', text: '3D izometrik görünüm ölçeksizdir ve STEP\'ten otomatik üretilir.' }
      ]
    },
    {
      id: 'olculer', group: 'Tablolar', title: 'Ölçüler', sub: 'L × W × H, ağırlık, kotlar', doc: 'olculer',
      fields: [
        { k: 'custom', render: 'dimsInfo' },
        {
          k: 'list', path: 'geometri.olcu_satirlari', label: 'Ölçü tablosu satırları',
          title: (it) => `${txt(it.ad) || t_('(adsız)')}${filled(it.deger) ? ' · ' + txt(it.deger) : ' · ' + t_('boş')}`,
          blank: () => ({ ad: blank3(), deger: '' }),
          item: [{ k: 'i18n', path: 'ad', label: 'Ad' }, { k: 'mixed', path: 'deger', label: 'Değer' }],
          help: 'Değeri boş satır paftada görünmez.'
        }
      ]
    },
    {
      id: 'elektrik', group: 'Tablolar', title: 'Elektrik bağlantısı', sub: 'Güç, şalter, besleme, koruma', doc: 'elektrik',
      fields: [
        { k: 'row', cols: 3, fields: [
          { k: 'num', path: 'elektrik.toplam_guc_kw', label: 'Toplam güç (kW)' },
          { k: 'num', path: 'elektrik.ana_salter_a', label: 'Ana şalter (A)' },
          { k: 'num', path: 'elektrik.gerilim_v', label: 'Hesap gerilimi (V)' }
        ] },
        { k: 'row', cols: 3, fields: [
          { k: 'num', path: 'elektrik.cos_phi', label: 'cos φ', step: 0.01 },
          { k: 'custom', render: 'currentInfo' }
        ] },
        { k: 'note', text: 'Standart metinlerdeki {A} (ana şalter), {kesit} (kablo kesiti) ve {V} (gerilim) paftada değerleriyle yazılır.' },
        { k: 'i18n', path: 'elektrik.besleme', label: 'Besleme gerilimi' },
        { k: 'i18n', path: 'elektrik.ust_koruma', label: 'Müşteri tarafı koruma' },
        { k: 'i18n', path: 'elektrik.rcd', label: 'Kaçak akım koruması' },
        { k: 'i18n', path: 'elektrik.kablo_oneri', label: 'Besleme kablosu' },
        { k: 'i18n', path: 'elektrik.kablo_giris', label: 'Kablo girişi' },
        { k: 'i18n', path: 'elektrik.topraklama', label: 'Topraklama' },
        { k: 'i18n', path: 'elektrik.faz_sirasi', label: 'Faz sırası', optional: true },
        { k: 'i18n', path: 'elektrik.kumanda', label: 'Kumanda gerilimi', optional: true },
        { k: 'i18n', path: 'elektrik.kontrol', label: 'Kontrol sistemi', optional: true }
      ]
    },
    {
      id: 'tesisat', group: 'Tablolar', title: 'Hava · su · egzoz · tahliye', sub: 'Pnömatik ve diğer bağlantılar', doc: 'tesisat',
      fields: [
        { k: 'heading', text: 'Basınçlı hava' },
        { k: 'i18n', path: 'pnomatik.basinc', label: 'Basınç', optional: true },
        { k: 'i18n', path: 'pnomatik.baglanti', label: 'Hava bağlantısı', optional: true },
        { k: 'i18n', path: 'pnomatik.hazirlik', label: 'Hava hazırlık', optional: true },
        { k: 'i18n', path: 'pnomatik.tuketiciler', label: 'Pnömatik tüketiciler', optional: true },
        { k: 'heading', text: 'Su · egzoz · tahliye' },
        { k: 'i18n', path: 'diger.sicaklik', label: 'Çalışma sıcaklığı', optional: true },
        { k: 'i18n', path: 'diger.su_basinc', label: 'Su basıncı', optional: true },
        { k: 'i18n', path: 'diger.su', label: 'Su girişi', optional: true },
        { k: 'i18n', path: 'diger.su_dolum', label: 'Otomatik su dolumu', optional: true },
        { k: 'i18n', path: 'diger.tahliye', label: 'Tahliye', optional: true },
        { k: 'i18n', path: 'diger.tahliye_hat', label: 'Müşteri tahliye hattı', optional: true },
        { k: 'i18n', path: 'diger.yag_ayirici', label: 'Yağ ayırıcı', optional: true },
        { k: 'i18n', path: 'diger.egzoz', label: 'Egzoz', optional: true },
        { k: 'note', text: 'Boş bırakılan satırlar paftada görünmez.' }
      ]
    },
    {
      id: 'noktalar', group: 'Tablolar', title: 'Bağlantı noktaları', sub: 'E · P · W · D · X · B konumları', doc: 'noktalar',
      fields: [
        { k: 'actions', buttons: [{ label: 'Görünüme tıklayarak yerleştir', act: 'picker', primary: true }] },
        { k: 'custom', render: 'points' }
      ]
    },
    {
      id: 'detaylar', group: 'Tablolar', title: 'Bağlantı detayları', sub: 'Yakın görünüm kartları', doc: 'detaylar',
      fields: [
        {
          k: 'list', path: 'detaylar', label: 'Detay kartları', collapsed: true,
          help: 'Her bağlantı türü için bir kart: yakın görünüm + açıklamalar + değer tablosu (bağlantı ölçüsü, konum, basınç, müşterinin bağlantı şekli).',
          title: (it) => `<span class="chip">${LayoutForm.esc(txt(it.anahtar) || '–')}</span>${LayoutForm.esc(txt(it.baslik) || t_('(başlıksız)'))}`,
          titleHtml: true,
          blank: () => ({ anahtar: '', baslik: blank3(), gorunum: '', etiketler: [], satirlar: [] }),
          item: [
            { k: 'row', cols: 2, fields: [
              { k: 'text', path: 'anahtar', label: 'İşaret (örn. D1–D4)' },
              { k: 'select', path: 'gorunum', label: 'Yakın görünüm', options: 'detailViews' }
            ] },
            { k: 'i18n', path: 'baslik', label: 'Başlık' },
            {
              k: 'list', path: 'satirlar', label: 'Değer tablosu',
              title: (it) => txt(it.ad) || t_('(adsız satır)'),
              blank: () => ({ ad: blank3(), deger: blank3() }),
              item: [{ k: 'i18n', path: 'ad', label: 'Ad' }, { k: 'mixed', path: 'deger', label: 'Değer' }]
            },
            {
              k: 'list', path: 'etiketler', label: 'Görünüm üzerindeki açıklamalar', collapsed: true,
              help: 'x, y, z görünüm koordinatı (mm); dx, dy etiket kaydırma; işaret harfi verilirse turuncu daire çizilir.',
              title: (it) => `${txt(it.mk) ? '[' + txt(it.mk) + '] ' : ''}${txt(it.ad) || t_('(yazısız)')}`,
              blank: () => ({ x: 0, y: 0, z: 0, dx: 0, dy: 0, ad: blank3() }),
              item: [
                { k: 'row', cols: 3, fields: [{ k: 'num', path: 'x', label: 'x' }, { k: 'num', path: 'y', label: 'y' }, { k: 'num', path: 'z', label: 'z' }] },
                { k: 'row', cols: 3, fields: [{ k: 'num', path: 'dx', label: 'dx' }, { k: 'num', path: 'dy', label: 'dy' }, { k: 'text', path: 'mk', label: 'İşaret' }] },
                { k: 'i18n', path: 'ad', label: 'Yazı' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'kablo', group: 'Tablolar', title: 'Besleme kablosu ve koruma', sub: 'Tek hat şeması, kesit, ΔU', doc: 'kablo',
      fields: [{ k: 'custom', render: 'cable' }]
    },
    {
      id: 'yukler', group: 'Tablolar', title: 'Yük listesi', sub: 'Yalnızca elektrik şeması varsa', doc: 'yukler',
      fields: [
        { k: 'i18n', path: 'elektrik.yukler_baslik', label: 'Bölüm başlığı', optional: true, def: () => ({ tr: 'Yük listesi', en: 'Load list', de: 'Verbraucherliste' }) },
        {
          k: 'list', path: 'elektrik.yukler', label: 'Tüketiciler',
          title: (it) => `${txt(it.ref)} · ${txt(it.ad)}${filled(it.kw) ? ' · ' + txt(it.kw) + ' kW' : ''}`,
          blank: () => ({ ref: '', ad: blank3(), kw: '', koruma: '', sayfa: '' }),
          item: [
            { k: 'row', cols: 3, fields: [{ k: 'text', path: 'ref', label: 'Ref' }, { k: 'text', path: 'kw', label: 'kW' }, { k: 'text', path: 'sayfa', label: 'Şema sayfası' }] },
            { k: 'i18n', path: 'ad', label: 'Tüketici' },
            { k: 'text', path: 'koruma', label: 'Koruma / sürücü' }
          ]
        }
      ]
    },
    {
      id: 'notlar', group: 'Tablolar', title: 'Notlar', sub: 'Ölçü, servis alanı, terazileme', doc: 'notlar',
      fields: [
        { k: 'list', path: 'geometri.notlar', label: 'Notlar', title: (it) => txt(it) || t_('(boş not)'), blank: blank3, item: [{ k: 'i18n', path: '', label: 'Not' }] },
        { k: 'list', path: 'elektrik.notlar', label: 'Elektrik notları', title: (it) => txt(it) || t_('(boş not)'), blank: blank3, item: [{ k: 'i18n', path: '', label: 'Not' }] },
        { k: 'actions', buttons: [{ label: 'Standart kurulum notunu ekle', act: 'stdNote' }] }
      ]
    }
  ];

  const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));

  /** Veri yolundan bölüm (Eksikler listesinden bölüme gitmek için) */
  function sectionOfPath(path) {
    const p = String(path || '');
    if (p.startsWith('makine')) return 'kapak';
    if (p.startsWith('detaylar')) return 'detaylar';
    if (p.startsWith('pnomatik') || p.startsWith('diger')) return 'tesisat';
    if (p.startsWith('elektrik.kablo')) return 'kablo';
    if (p.startsWith('elektrik.yukler')) return 'yukler';
    if (p.startsWith('elektrik.notlar') || p.startsWith('geometri.notlar')) return 'notlar';
    if (p.startsWith('elektrik')) return 'elektrik';
    if (p.startsWith('geometri.noktalar')) return 'noktalar';
    if (p.startsWith('geometri.olcu_satirlari')) return 'olculer';
    if (/^geometri\.(ek_olculer_on|ordinat_on)/.test(p)) return 'on';
    if (/^geometri\.(ek_olculer_arka|etiketler_arka|ordinat_arka|arka_baslik)/.test(p)) return 'arka';
    if (/^geometri\.ek_olculer_yan/.test(p)) return 'yan';
    if (/^geometri\.(boy|en|yukseklik|origin|eksen|zemin)/.test(p)) return 'model';
    if (p.startsWith('geometri')) return 'ust';
    return 'kapak';
  }

  /** Belgede görünen bölümler (build_layout.py ile aynı koşullar) */
  function presentInDoc(data, viewsMeta) {
    const E = data.elektrik || {};
    const G = data.geometri || {};
    const P = data.pnomatik || {};
    const D = data.diger || {};
    const K = E.kablo;
    const has = {
      model: false, kapak: true, ust: !!viewsMeta, on: !!viewsMeta, arka: !!(viewsMeta && viewsMeta.rear), yan: !!viewsMeta,
      olculer: true, elektrik: true,
      tesisat: ['basinc', 'baglanti', 'hazirlik', 'tuketiciler'].some((k) => filled(P[k])) ||
        ['sicaklik', 'su_basinc', 'su', 'su_dolum', 'tahliye', 'tahliye_hat', 'yag_ayirici', 'egzoz'].some((k) => filled(D[k])),
      noktalar: Object.keys(G.noktalar || {}).length > 0,
      detaylar: (data.detaylar || []).length > 0,
      kablo: !!(K && Number(K.kesit_mm2)),
      yukler: (E.yukler || []).length > 0,
      notlar: [].concat(E.notlar || [], G.notlar || []).some(filled)
    };
    return has;
  }

  /** Belgedeki bölüm numaraları (yalnız görünen bölümler, sırayla) */
  function docNumbers(data, viewsMeta) {
    const has = presentInDoc(data, viewsMeta);
    const out = {};
    let n = 0;
    SECTIONS.forEach((s) => {
      if (s.doc && s.doc !== 'kapak' && has[s.id]) out[s.id] = ++n;
    });
    return { numbers: out, has };
  }

  return { SECTIONS, byId, sectionOfPath, presentInDoc, docNumbers, blank3, today, txt, filled };
})();
