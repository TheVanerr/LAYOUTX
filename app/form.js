/* Sağ paneldeki düzenleme formu: bölüm tanımlarındaki alanları kutulara çevirir.
   Yazarken veri hemen güncellenir (odak kaybolmaz); liste ekleme / silme formu yeniden çizer. */

const LayoutForm = (() => {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const LANGS = ['tr', 'en', 'de'];

  const split = (p) => (Array.isArray(p) ? p : String(p || '').split('.').filter((x) => x !== ''));
  const join = (base, rel) => base.concat(split(rel));
  const key = (parts) => parts.join('.');

  function get(obj, parts) {
    return parts.reduce((a, k) => (a == null ? undefined : a[k]), obj);
  }

  /** Yol yoksa ara nesneleri oluşturur */
  function set(obj, parts, value) {
    if (!parts.length) return;
    let o = obj;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const k = parts[i];
      if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      o = o[k];
    }
    o[parts[parts.length - 1]] = value;
  }

  const isI18n = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const filled = (v) => String(v == null ? '' : v).trim() !== '';

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function labelEl(f, extra) {
    const l = el('label', 'field-label');
    l.innerHTML = `<span>${esc(t_(f.label || ''))}${f.optional ? ` <span style="opacity:.6">(${esc(t_('isteğe bağlı'))})</span>` : ''}</span>`;
    if (extra) l.appendChild(extra);
    return l;
  }

  function wrap(f, control, extra) {
    const w = el('div', 'field');
    if (f.label) w.appendChild(labelEl(f, extra));
    w.appendChild(control);
    if (f.help) w.appendChild(el('div', 'field-help', esc(t_(f.help))));
    return w;
  }

  function inputEl(type, value, path) {
    const i = document.createElement('input');
    i.type = type;
    i.className = 'field-input';
    i.value = value == null ? '' : value;
    i.dataset.path = key(path);
    i.autocomplete = 'off';
    i.spellcheck = false;
    return i;
  }

  function textareaOrInput(value, path, longHint) {
    const long = String(value || '').length > 58 || longHint;
    const i = long ? document.createElement('textarea') : document.createElement('input');
    if (!long) i.type = 'text';
    i.className = 'field-input';
    i.value = value == null ? '' : value;
    i.dataset.path = key(path);
    i.autocomplete = 'off';
    if (long) i.rows = Math.min(6, Math.max(2, Math.ceil(String(value || '').length / 52)));
    return i;
  }

  const toIso = (v) => {
    const m = String(v || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : '');
  };
  const fromIso = (v) => {
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
  };

  /* ─── Alan türleri ─── */

  const R = {
    text(f, ctx, base) {
      const p = join(base, f.path);
      const i = inputEl('text', get(ctx.data, p), p);
      if (f.ph) i.placeholder = f.ph;
      i.addEventListener('input', () => ctx.change(p, i.value));
      return wrap(f, i);
    },
    num(f, ctx, base) {
      const p = join(base, f.path);
      const v = get(ctx.data, p);
      const i = inputEl('number', v == null ? '' : v, p);
      i.step = f.step || 'any';
      i.addEventListener('input', () => {
        if (i.value === '') return ctx.change(p, 0, { quiet: true });
        const n = Number(i.value);
        if (Number.isFinite(n)) ctx.change(p, n);
      });
      return wrap(f, i);
    },
    date(f, ctx, base) {
      const p = join(base, f.path);
      const i = inputEl('date', toIso(get(ctx.data, p)), p);
      i.addEventListener('change', () => ctx.change(p, fromIso(i.value)));
      return wrap(f, i);
    },
    select(f, ctx, base) {
      const p = join(base, f.path);
      let v = get(ctx.data, p);
      if ((v == null || v === '') && f.def) v = f.def;
      const opts = typeof f.options === 'string' ? ctx.options(f.options) : f.options;
      const s = document.createElement('select');
      s.className = 'field-input';
      s.dataset.path = key(p);
      const list = opts.slice();
      if (v != null && v !== '' && !list.some(([o]) => o === v)) list.push([v, `${v} (${t_('listede yok')})`]);
      s.innerHTML = list.map(([o, t]) => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(t_(t))}</option>`).join('');
      s.addEventListener('change', () => ctx.change(p, s.value, { rerender: !!f.rerender }));
      return wrap(f, s);
    },
    i18n(f, ctx, base) {
      const p = join(base, f.path);
      return wrap(f, i18nBox(ctx, p, f));
    },
    mixed(f, ctx, base) {
      const p = join(base, f.path);
      const v = get(ctx.data, p);
      const link = el('button', 'lnk');
      link.type = 'button';
      if (isI18n(v)) {
        link.textContent = t_('Tek metin yap');
        link.title = t_('Üç dilde aynı yazılan özel adlar için (TR metni kalır)');
        link.addEventListener('click', () => ctx.change(p, v.tr || v.en || v.de || '', { rerender: true }));
        return wrap(f, i18nBox(ctx, p, f), link);
      }
      link.textContent = t_('Dillere ayır');
      link.title = t_('TR / EN / DE ayrı yazılsın');
      link.addEventListener('click', () => {
        const s = v == null ? '' : String(v);
        ctx.change(p, { tr: s, en: s, de: s }, { rerender: true });
      });
      const i = textareaOrInput(v, p);
      i.addEventListener('input', () => ctx.change(p, i.value));
      return wrap(f, i, link);
    },
    nums(f, ctx, base) {
      const p = join(base, f.path);
      const v = get(ctx.data, p);
      const i = inputEl('text', Array.isArray(v) ? v.join(', ') : '', p);
      i.placeholder = '5, 10, 15, 20';
      i.addEventListener('input', () => {
        const arr = i.value.split(/[,;\s]+/).filter(Boolean).map(Number).filter(Number.isFinite);
        ctx.change(p, arr);
      });
      return wrap(f, i);
    },
    keys(f, ctx, base) {
      const p = join(base, f.path);
      const v = get(ctx.data, p);
      const i = inputEl('text', Array.isArray(v) ? v.join(', ') : '', p);
      i.placeholder = 'E, P, W, D1';
      i.addEventListener('input', () => {
        const arr = i.value.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
        ctx.change(p, arr);
      });
      return wrap(f, i);
    },
    xyz(f, ctx, base) {
      const p = join(base, f.path);
      const v = get(ctx.data, p) || [0, 0, 0];
      const row = el('div', 'field-row r3');
      ['x', 'y', 'z'].forEach((ax, i) => {
        const inp = inputEl('number', v[i], p.concat(String(i)));
        inp.step = 'any';
        inp.title = ax;
        inp.addEventListener('input', () => {
          const cur = (get(ctx.data, p) || [0, 0, 0]).slice();
          cur[i] = Number(inp.value) || 0;
          ctx.change(p, cur);
        });
        row.appendChild(inp);
      });
      return wrap(f, row);
    },
    row(f, ctx, base) {
      const row = el('div', `field-row r${f.cols || 2}`);
      f.fields.forEach((sub) => row.appendChild(renderField(sub, ctx, base)));
      return row;
    },
    heading(f) {
      return el('div', 'insp-section', esc(t_(f.text)));
    },
    note(f) {
      return el('div', `note-box${f.warn ? ' warn' : ''}`, esc(t_(f.text)));
    },
    kv(f) {
      const dl = el('dl', 'kv');
      (f.rows || []).forEach(([k, v]) => {
        dl.appendChild(el('dt', null, esc(t_(k))));
        dl.appendChild(el('dd', null, esc(v)));
      });
      return dl;
    },
    actions(f, ctx) {
      const box = el('div', 'insp-actions');
      f.buttons.forEach((b) => {
        const btn = el('button', `btn btn-sm${b.primary ? ' btn-primary' : ''}`, esc(t_(b.label)));
        btn.type = 'button';
        if (b.title) btn.title = t_(b.title);
        btn.addEventListener('click', () => ctx.act(b.act, b));
        box.appendChild(btn);
      });
      return box;
    },
    custom(f, ctx, base) {
      const box = el('div', 'field');
      ctx.custom(f.render, box, base);
      return box;
    },
    list(f, ctx, base) {
      const p = join(base, f.path);
      const arr = get(ctx.data, p);
      const items = Array.isArray(arr) ? arr : [];
      const box = el('div', 'field');
      const head = labelEl({ label: `${t_(f.label)} (${items.length})` });
      box.appendChild(head);
      if (f.help) box.appendChild(el('div', 'field-help', esc(t_(f.help))));
      const list = el('div', 'list');
      items.forEach((item, i) => {
        const ip = p.concat(String(i));
        const k = key(ip);
        const collapsed = ctx.ui.collapsed.has(k) || (f.collapsed && !ctx.ui.opened.has(k));
        const li = el('div', `list-item${collapsed ? ' collapsed' : ''}`);
        li.dataset.path = k;
        const h = el('div', 'li-head');
        const title = el('div', 'li-title');
        const t = f.title ? f.title(item, i) : `#${i + 1}`;
        if (f.titleHtml) title.innerHTML = t; else title.textContent = t;
        title.style.cursor = 'pointer';
        title.addEventListener('click', () => {
          if (li.classList.toggle('collapsed')) {
            ctx.ui.collapsed.add(k);
            ctx.ui.opened.delete(k);
          } else {
            ctx.ui.collapsed.delete(k);
            ctx.ui.opened.add(k);
          }
        });
        h.appendChild(title);
        const tools = el('div', 'li-tools');
        const tool = (txt, tip, fn, cls) => {
          const b = el('button', cls || '', txt);
          b.type = 'button';
          b.title = t_(tip);
          b.addEventListener('click', fn);
          tools.appendChild(b);
        };
        tool('↑', 'Yukarı taşı', () => {
          if (i === 0) return;
          [items[i - 1], items[i]] = [items[i], items[i - 1]];
          ctx.change(p, items, { rerender: true });
        });
        tool('↓', 'Aşağı taşı', () => {
          if (i === items.length - 1) return;
          [items[i + 1], items[i]] = [items[i], items[i + 1]];
          ctx.change(p, items, { rerender: true });
        });
        tool('⧉', 'Çoğalt', () => {
          items.splice(i + 1, 0, JSON.parse(JSON.stringify(item)));
          ctx.change(p, items, { rerender: true });
        });
        tool('×', 'Sil', () => {
          items.splice(i, 1);
          ctx.change(p, items, { rerender: true });
        }, 'del');
        h.appendChild(tools);
        li.appendChild(h);
        const body = el('div', 'li-body');
        (f.item || []).forEach((sub) => body.appendChild(renderField(sub, ctx, ip)));
        li.appendChild(body);
        list.appendChild(li);
      });
      box.appendChild(list);
      const add = el('div', 'add-row');
      const btn = el('button', 'btn btn-sm', esc(t_('+ Ekle')));
      btn.type = 'button';
      btn.addEventListener('click', () => {
        const next = Array.isArray(get(ctx.data, p)) ? get(ctx.data, p) : [];
        const blank = f.blank ? f.blank(ctx) : {};
        next.push(blank);
        ctx.ui.opened.add(key(p.concat(String(next.length - 1))));
        ctx.change(p, next, { rerender: true });
      });
      add.appendChild(btn);
      box.appendChild(add);
      return box;
    }
  };

  /** TR / EN / DE kutuları; değer düz metinse Türkçe sayılır, yazınca sözlüğe çevrilir */
  function i18nBox(ctx, p, f) {
    let v = get(ctx.data, p);
    if (!isI18n(v) && f && f.def && (v == null || v === '')) v = f.def();
    const cur = isI18n(v) ? v : { tr: v == null ? '' : String(v), en: '', de: '' };
    const anyFilled = LANGS.some((l) => filled(cur[l]));
    const box = el('div', 'i18n');
    LANGS.forEach((l) => {
      const row = el('div', `i18n-row${anyFilled && !filled(cur[l]) ? ' empty' : ''}`);
      row.appendChild(el('span', null, l.toUpperCase()));
      const longest = Math.max(...LANGS.map((x) => String(cur[x] || '').length));
      const inp = textareaOrInput(cur[l], p, longest > 58);
      inp.dataset.lang = l;
      inp.addEventListener('input', () => {
        const now = get(ctx.data, p);
        const obj = isI18n(now) ? Object.assign({ tr: '', en: '', de: '' }, now) : { tr: now == null ? '' : String(now), en: '', de: '' };
        if (!isI18n(now) && f && f.def && (now == null || now === '')) Object.assign(obj, f.def());
        obj[l] = inp.value;
        ctx.change(p, obj);
        const any = LANGS.some((x) => filled(obj[x]));
        box.querySelectorAll('.i18n-row').forEach((r, ri) => r.classList.toggle('empty', any && !filled(obj[LANGS[ri]])));
      });
      row.appendChild(inp);
      box.appendChild(row);
    });
    return box;
  }

  function renderField(f, ctx, base) {
    const fn = R[f.k];
    if (!fn) return el('div', 'field-help', esc(t_('Bilinmeyen alan türü: {k}', { k: f.k })));
    return fn(f, ctx, base || []);
  }

  function render(container, fields, ctx) {
    fields.forEach((f) => container.appendChild(renderField(f, ctx, [])));
  }

  /** Eksikler listesinden gelen yolu bulup odaklar */
  function focusPath(container, path, lang) {
    const k = Array.isArray(path) ? key(path) : String(path || '');
    let target = null;
    const all = [...container.querySelectorAll('[data-path]')];
    if (lang) target = all.find((e) => e.dataset.path === k && e.dataset.lang === lang);
    if (!target) target = all.find((e) => e.dataset.path === k);
    if (!target) target = all.find((e) => e.dataset.path.startsWith(k + '.') || k.startsWith(e.dataset.path + '.'));
    if (!target) return false;
    for (let li = target.closest('.list-item'); li; li = li.parentElement && li.parentElement.closest('.list-item')) {
      li.classList.remove('collapsed');
    }
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (target.focus && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) {
      target.focus({ preventScroll: true });
      target.classList.remove('flash');
      void target.offsetWidth;
      target.classList.add('flash');
    }
    return true;
  }

  return { esc, split, join, get, set, render, renderField, focusPath, toIso, fromIso, isI18n };
})();
