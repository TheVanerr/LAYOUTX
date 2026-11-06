/* Program dili (TR / EN / DE). Anahtar Türkçe metnin kendisidir; sözlük app/i18n-dict.js'te.
   Kullanım: t_('Kaydedildi · {t}', { t: saat }). HTML'de: data-i18n (metin), data-i18n-title, data-i18n-ph.
   Belgenin (paftanın) dili ayrıdır: üst çubuktaki "Belge dili". */

const LayoutI18n = (() => {
  const LANGS = ['tr', 'en', 'de'];
  const NAMES = { tr: 'Türkçe', en: 'English', de: 'Deutsch' };
  let lang = 'tr';
  try {
    const s = localStorage.getItem('layout-ui-lang');
    if (LANGS.includes(s)) lang = s;
  } catch (e) { /* tarayıcı hafızası kapalı */ }
  const q = /[?&]ui=(tr|en|de)/.exec(location.search);
  if (q) lang = q[1];
  const listeners = [];
  const dict = () => (typeof LAYOUT_DICT !== 'undefined' ? LAYOUT_DICT : {});

  function t(s, p) {
    let out = s == null ? '' : String(s);
    if (lang !== 'tr') {
      const e = dict()[out];
      if (e) out = e[lang === 'en' ? 0 : 1] || out;
    }
    if (p) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m));
    return out;
  }

  function apply(root) {
    const r = root || document;
    r.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    r.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.getAttribute('data-i18n-title')); });
    r.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
    r.querySelectorAll('[data-ui-lang]').forEach((b) => b.classList.toggle('active', b.getAttribute('data-ui-lang') === lang));
    document.documentElement.lang = lang;
  }

  function set(l) {
    if (!LANGS.includes(l) || l === lang) return;
    lang = l;
    try { localStorage.setItem('layout-ui-lang', l); } catch (e) { /* yok */ }
    apply(document);
    listeners.forEach((fn) => fn(l));
  }

  /** Eksik çevirileri listeler (geliştirme denetimi): LayoutI18n.missing(['t_ anahtarları']) */
  function missing(keys) {
    return keys.filter((k) => !dict()[k]);
  }

  return { t, apply, set, missing, LANGS, NAMES, onChange: (fn) => listeners.push(fn), get lang() { return lang; } };
})();

const t_ = LayoutI18n.t;
