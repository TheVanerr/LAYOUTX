# -*- coding: utf-8 -*-
"""Makine yerleşim planı (layout) üretici – STEP'ten üretilen görünümler + veri JSON -> tek dosya HTML (TR/EN/DE).
Girdi : <makine_klasörü>/*-layout-veri.json  (makine/elektrik/pnömatik + 'geometri' bloğu)
        <makine_klasörü>/views/views_meta.json + view_*.png  (tools/render_views.py çıktısı)
Çıktı : <makine_klasörü>/<makine.dosya_adi>.html  (yoksa <model>-Layout.html)
Kullanım: python tools/build_layout.py "<makine_klasörü>" [artifact_parcasi.html] [--no-pdf] [--out=<yol.html>]
          PDF indir düğmesi için TR/EN/DE PDF'i headless Chrome/Edge ile basılıp HTML'e gömülür (--no-pdf: atla).
          Belge: kapak + antetli A3 yatay sayfalar (P&PX ile aynı kapak / antet / başlık bloğu); sayfa dizgisi belge/belge.js.
"""
import json, base64, os, html, math, sys, glob, re, shutil, pathlib, tempfile, subprocess

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
FLAGS = {a.split("=")[0] for a in sys.argv[1:] if a.startswith("--")}
OPTS = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
HERE = os.path.abspath(ARGS[0]) if ARGS else os.getcwd()
_veri = sorted(glob.glob(os.path.join(HERE, "*-layout-veri.json")))
if not _veri:
    sys.exit(f"'{HERE}' içinde *-layout-veri.json bulunamadı")
DATA = json.load(open(_veri[0], encoding="utf-8"))
_vm = os.path.join(HERE, "views", "views_meta.json")
if not os.path.exists(_vm):
    sys.exit("Görünümler yok (views/views_meta.json): önce STEP'ten görünümleri üretin")
VIEWS = json.load(open(_vm, encoding="utf-8"))
_ad = DATA["makine"].get("dosya_adi") or (DATA["makine"]["model"].replace(" ", "-") + "-Layout")
OUT = os.path.abspath(OPTS["out"]) if OPTS.get("out") else os.path.join(HERE, _ad + ".html")


def _doldur(o, rep):
    """Şablondan gelen standart metinlerdeki {A} {kesit} {V} yer tutucularını elektrik verisiyle doldurur."""
    if isinstance(o, dict):
        return {k: _doldur(v, rep) for k, v in o.items()}
    if isinstance(o, list):
        return [_doldur(v, rep) for v in o]
    if isinstance(o, str):
        for k, v in rep.items():
            o = o.replace(k, v)
    return o


_el = DATA.get("elektrik", {})
DATA = _doldur(DATA, {"{A}": str(_el.get("ana_salter_a", "")), "{kesit}": str(_el.get("kablo", {}).get("kesit_mm2", "")),
                      "{V}": str(_el.get("gerilim_v", 400))})


def T(obj):
    """Üç dilli metin -> <span data-tr data-en data-de>."""
    if isinstance(obj, dict):
        tr, en, de = _l3(obj)
        return ('<span class="i18n" data-tr="%s" data-en="%s" data-de="%s">%s</span>'
                % (html.escape(tr, True), html.escape(en, True), html.escape(de, True), html.escape(tr)))
    return html.escape(str(obj))


def _l3(obj):
    """{tr, en, de} -> üç metin; boş dil Türkçeye (o da boşsa diğerine) düşer."""
    tr = str(obj.get("tr") or obj.get("en") or obj.get("de") or "")
    return tr, str(obj.get("en") or tr), str(obj.get("de") or tr)


def t3(tr, en, de):
    return T({"tr": tr, "en": en, "de": de})


def img_data(path):
    with open(path, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")


G = DATA["geometri"]
E = DATA.setdefault("elektrik", {})
M = DATA["makine"]
# yarım kalmış (yeni) projelerde de pafta üretilsin: eksik sayısal alanlar için güvenli değerler
for _k, _v in (("toplam_guc_kw", 0), ("ana_salter_a", 0), ("cos_phi", 0.85), ("besleme", "")):
    if E.get(_k) in (None, ""):
        E[_k] = _v
if not E["cos_phi"]:
    E["cos_phi"] = 0.85
M.setdefault("model", M.get("proje") or "Layout")
G.setdefault("noktalar", {})
G.setdefault("servis_alani", {"on": 1000, "arka": 1000, "sol": 1000, "sag": 1000})
L, W, H = G["boy"], G["en"], G["yukseklik"]
ox, oy, oz = G["origin"]          # makine referans köşesi: sol-ön-alt (görünüm koordinatları)
P = G["noktalar"]                 # bağlantı noktaları
SA = G["servis_alani"]            # servis mesafeleri (mm): on, arka, sol, sag


# ---------------------------------------------------------------- SVG yardımcıları
def fmt(v):
    return f"{int(round(v))}"


S = 1.0   # aktif görünümün ölçek birimi (viewBox genişliği × 0.0165); dim/marker boyutları buna göre


def dim_h(x1, x2, y, text, cls="dim"):
    """Yatay ölçü çizgisi; model koordinatları (y yukarı), SVG'de y ters çevrilir."""
    ys = -y
    ext = 0.22 * S
    return (f'<g class="{cls}">'
            f'<line x1="{x1}" y1="{ys+ext}" x2="{x1}" y2="{ys-ext*0.5}"/>'
            f'<line x1="{x2}" y1="{ys+ext}" x2="{x2}" y2="{ys-ext*0.5}"/>'
            f'<line x1="{x1}" y1="{ys}" x2="{x2}" y2="{ys}" marker-start="url(#arrS)" marker-end="url(#arrE)"/>'
            f'<text x="{(x1+x2)/2}" y="{ys-0.18*S}" text-anchor="middle">{text}</text></g>')


def dim_v(y1, y2, x, text, cls="dim"):
    """Dikey ölçü; döndürülmüş yazı çizginin solunda durur (rotate(-90) ile harfler taban çizgisinin soluna düşer)."""
    ext = 0.22 * S
    return (f'<g class="{cls}">'
            f'<line x1="{x-ext}" y1="{-y1}" x2="{x+ext*0.5}" y2="{-y1}"/>'
            f'<line x1="{x-ext}" y1="{-y2}" x2="{x+ext*0.5}" y2="{-y2}"/>'
            f'<line x1="{x}" y1="{-y1}" x2="{x}" y2="{-y2}" marker-start="url(#arrS)" marker-end="url(#arrE)"/>'
            f'<text transform="translate({x-0.18*S},{-(y1+y2)/2}) rotate(-90)" text-anchor="middle">{text}</text></g>')


def marker(x, y, key):
    return (f'<g class="pt"><circle cx="{x}" cy="{-y}" r="{0.62*S:.1f}"/>'
            f'<text x="{x}" y="{-y}" dy="0.36em" text-anchor="middle">{key}</text></g>')


def d3(tr, en, de):
    return {"tr": tr, "en": en, "de": de}


def label(x, y, obj, anchor="start", cls="lbl"):
    """SVG metni; üç dilli sözlük verilirse <text class='i18n' data-tr/en/de> olarak yazılır (SVG içinde span kullanılamaz)."""
    if isinstance(obj, dict):
        tr, en, de = _l3(obj)
        return (f'<text class="{cls} i18n" x="{x}" y="{-y}" text-anchor="{anchor}" '
                f'data-tr="{html.escape(tr, True)}" data-en="{html.escape(en, True)}" '
                f'data-de="{html.escape(de, True)}">{html.escape(tr)}</text>')
    return f'<text class="{cls}" x="{x}" y="{-y}" text-anchor="{anchor}">{html.escape(str(obj))}</text>'


def view_scale(bounds):
    return (bounds[2] - bounds[0]) * 0.0165


DEFS = ('<defs>'
        '<marker id="arrE" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
        '<path d="M0,1 L9,5 L0,9 z"/></marker>'
        '<marker id="arrS" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
        '<path d="M10,1 L1,5 L10,9 z"/></marker>'
        '<marker id="arrC" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">'
        '<path class="c" d="M0,0 L10,5 L0,10 z"/></marker>'
        '</defs>')


def final_bounds(name, bounds):
    """bounds = (xmin, ymin, xmax, ymax) model koordinatlarında; görüntü sınırlarıyla birleştirilir."""
    v = VIEWS[name]
    return (min(v["x0"], bounds[0]), min(v["y0"], bounds[1]), max(v["x1"], bounds[2]), max(v["y1"], bounds[3]))


def svg_view(name, extra, fb, cls="view"):
    v = VIEWS[name]
    x0, y0, x1, y1 = v["x0"], v["y0"], v["x1"], v["y1"]
    vx0, vy0, vx1, vy1 = fb
    vb = f'{vx0:.0f} {-vy1:.0f} {vx1-vx0:.0f} {vy1-vy0:.0f}'
    img = img_data(os.path.join(HERE, "views", v["png"]))
    return (f'<svg class="{cls}" viewBox="{vb}" style="--fs:{S:.1f}px" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">{DEFS}'
            f'<image href="{img}" x="{x0}" y="{-y1}" width="{x1-x0}" height="{y1-y0}" preserveAspectRatio="none"/>'
            + "".join(extra) + '</svg>')


# ---------------------------------------------------------------- görünümler
EXT = [0, 0, 0, 0]   # aktif görünümde çizilen öğelerin kapsamı (viewBox için)


def ext_add(x0, y0, x1=None, y1=None):
    x1 = x0 if x1 is None else x1
    y1 = y0 if y1 is None else y1
    EXT[0] = min(EXT[0], x0, x1); EXT[1] = min(EXT[1], y0, y1)
    EXT[2] = max(EXT[2], x0, x1); EXT[3] = max(EXT[3], y0, y1)


def begin_view(name, base, k):
    """base: model koordinatlarında zorunlu kapsam; k: yazı ölçeği (tam genişlik ~0.011, yarım ~0.021)."""
    global S
    fb = final_bounds(name, base)
    S = (fb[2] - fb[0]) * k
    EXT[:] = list(fb)


def end_view(name, extra, cls="view"):
    fb = (EXT[0] - 0.5 * S, EXT[1] - 0.5 * S, EXT[2] + 0.5 * S, EXT[3] + 0.5 * S)
    return svg_view(name, extra, fb, cls)


def DH(x1, x2, y, text, cls="dim"):
    ext_add(min(x1, x2), y - 1.5 * S, max(x1, x2), y + 0.4 * S)
    return dim_h(x1, x2, y, text, cls)


def DV(y1, y2, x, text, cls="dim"):
    ext_add(x - 1.3 * S, min(y1, y2), x + 0.4 * S, max(y1, y2))
    return dim_v(y1, y2, x, text, cls)


def MK(x, y, key):
    ext_add(x - 0.8 * S, y - 0.8 * S, x + 0.8 * S, y + 0.8 * S)
    return marker(x, y, key)


def LB(x, y, obj, anchor="start", cls="lbl"):
    txt = _l3(obj)[0] if isinstance(obj, dict) else str(obj)
    w = len(txt) * 0.42 * S
    if anchor == "middle":
        ext_add(x - w / 2, y - 0.4 * S, x + w / 2, y + 0.9 * S)
    elif anchor == "end":
        ext_add(x - w, y - 0.4 * S, x, y + 0.9 * S)
    else:
        ext_add(x, y - 0.4 * S, x + w, y + 0.9 * S)
    return label(x, y, obj, anchor, cls)


def extra_dims(key, out):
    for d in G.get(key, []):
        if d["yon"] == "h":
            out.append(DH(d["a"], d["b"], d["c"], fmt(d["b"] - d["a"]), cls="dim dim-2"))
        else:
            out.append(DV(d["a"], d["b"], d["c"], fmt(d["b"] - d["a"]), cls="dim dim-2"))


def shown(p, view):
    """gorunum: 'hepsi' (ön + yan + arka) ya da virgüllü liste ('on', 'yan', 'arka'); üst görünümde bütün noktalar çizilir."""
    g = p.get("gorunum", "on")
    return g == "hepsi" or view in [s.strip() for s in g.split(",")]


def proj(name, x, y, z):
    """Görünüm koordinatlarındaki nokta -> 'name' görünümünün ekran koordinatları.
    Dünya (STEP) = R_üst^T · (x, y, z); ekran = R_name · dünya (R satırları views_meta.json'da)."""
    Rt, Rv = VIEWS["top"]["R"], VIEWS[name]["R"]
    w = [Rt[0][i] * x + Rt[1][i] * y + Rt[2][i] * z for i in range(3)]
    return (sum(a * b for a, b in zip(Rv[0], w)), sum(a * b for a, b in zip(Rv[1], w)))


def ordinate(view, keys, y):
    """Ordinat ölçüsü: sol uç (x = ox) 0 referansı; her bağlantı için çentik + 'değer (anahtar)' dik yazısı."""
    ticks = [(proj(view, ox, oy, oz)[0], "0")]
    ticks += [(proj(view, P[k]["x"], P[k]["y"], P[k]["z"])[0], f'{fmt(P[k]["x"] - ox)} ({k})') for k in keys if k in P]
    xs = [t[0] for t in ticks]
    out = [f'<g class="dim dim-2 ord"><line x1="{min(xs)}" y1="{-y}" x2="{max(xs)}" y2="{-y}"/>']
    for x, txt in ticks:
        out.append(f'<line x1="{x}" y1="{-y - 0.3 * S}" x2="{x}" y2="{-y + 0.3 * S}"/>'
                   f'<text transform="translate({x + 0.28 * S},{-(y - 0.45 * S)}) rotate(-90)" text-anchor="end">{txt}</text>')
        ext_add(x - 0.6 * S, y - 0.45 * S - len(txt) * 0.42 * S, x + 0.6 * S, y + 0.3 * S)
    return "".join(out) + "</g>"


# --- üst görünüm (plan)
begin_view("top", (ox - SA["sol"], oy - SA["on"], ox + L + SA["sag"], oy + W + SA["arka"]), 0.011)
top_extra = []
top_extra.append(f'<rect class="svc" x="{ox-SA["sol"]}" y="{-(oy+W+SA["arka"])}" '
                 f'width="{L+SA["sol"]+SA["sag"]}" height="{W+SA["on"]+SA["arka"]}"/>')
top_extra.append(f'<rect class="outline" x="{ox}" y="{-(oy+W)}" width="{L}" height="{W}"/>')
top_extra.append(DH(ox, ox + L, oy + W + SA["arka"] + 1.7 * S, fmt(L)))
top_extra.append(DV(oy, oy + W, ox + L + SA["sag"] + 1.7 * S, fmt(W)))
top_extra.append(DH(ox - SA["sol"], ox, oy - SA["on"] - 1.0 * S, fmt(SA["sol"]), cls="dim dim-svc"))
top_extra.append(DH(ox + L, ox + L + SA["sag"], oy - SA["on"] - 1.0 * S, fmt(SA["sag"]), cls="dim dim-svc"))
top_extra.append(DV(oy - SA["on"], oy, ox - SA["sol"] - 1.0 * S, fmt(SA["on"]), cls="dim dim-svc"))
top_extra.append(DV(oy + W, oy + W + SA["arka"], ox - SA["sol"] - 1.0 * S, fmt(SA["arka"]), cls="dim dim-svc"))
extra_dims("ek_olculer_ust", top_extra)
for key, p in P.items():
    top_extra.append(MK(p["x"], p["y"], key))
top_extra.append(LB(ox + L / 2, oy - SA["on"] - 0.45 * S,
                    G.get("on_yazi") or d3("OPERATÖR / YÜKLEME TARAFI", "OPERATOR / LOADING SIDE", "BEDIENER- / BELADESEITE"),
                    "middle", "side"))
top_extra.append(LB(ox + L / 2, oy + W + SA["arka"] + 0.5 * S,
                    d3("ARKA – SERVİS", "REAR – SERVICE", "RÜCKSEITE – SERVICE"), "middle", "side"))
for lb in G.get("etiketler_ust", []):
    top_extra.append(LB(lb["x"], lb["y"], lb["ad"], lb.get("anchor", "middle")))
svg_top = end_view("top", top_extra)

# --- ön görünüm (ordinat_on varsa: bağlantılar ön yüzde; ordinatlar zeminin altında, L ölçüsü üstte)
begin_view("front", (ox, oz, ox + L, oz + H), 0.011)
front_extra = [f'<rect class="outline" x="{ox}" y="{-(oz+H)}" width="{L}" height="{H}"/>',
               DH(ox, ox + L, oz + H + 1.4 * S, fmt(L)) if G.get("ordinat_on") else DH(ox, ox + L, oz - 2.0 * S, fmt(L)),
               DV(oz, oz + H, ox + L + 2.0 * S, fmt(H))]
extra_dims("ek_olculer_on", front_extra)
for key, p in P.items():
    if shown(p, "on"):
        front_extra.append(MK(p["x"], p["z"], key))
front_extra.append(f'<line class="floor" x1="{ox-3*S}" y1="{-oz}" x2="{ox+L+3*S}" y2="{-oz}"/>')
ext_add(ox - 3 * S, oz, ox + L + 3 * S, oz)
if G.get("ordinat_on"):
    front_extra.append(ordinate("front", G["ordinat_on"], oz - 0.9 * S))
svg_front = end_view("front", front_extra)

# --- yan görünüm
begin_view("side", (oy, oz, oy + W, oz + H), 0.021)
side_extra = [f'<rect class="outline" x="{oy}" y="{-(oz+H)}" width="{W}" height="{H}"/>',
              DH(oy, oy + W, oz - 2.0 * S, fmt(W)),
              DV(oz, oz + H, oy + W + 2.0 * S, fmt(H))]
extra_dims("ek_olculer_yan", side_extra)
for key, p in P.items():
    if shown(p, "yan"):
        side_extra.append(MK(p["y"], p["z"], key))
side_extra.append(f'<line class="floor" x1="{oy-2*S}" y1="{-oz}" x2="{oy+W+2*S}" y2="{-oz}"/>')
ext_add(oy - 2 * S, oz, oy + W + 2 * S, oz)
side_extra.append(LB(oy, oz - 1.0 * S, d3("ÖN", "FRONT", "VORNE"), "middle", "side"))
side_extra.append(LB(oy + W, oz - 1.0 * S, d3("ARKA", "REAR", "HINTEN"), "middle", "side"))
svg_side = end_view("side", side_extra)

# --- arka görünüm (isteğe bağlı: views_cfg'de "rear" varsa); makinenin arkasından bakış, sol uç sağda
svg_rear = ""
if "rear" in VIEWS:
    rx0, rx1 = sorted((proj("rear", ox, oy, oz)[0], proj("rear", ox + L, oy, oz)[0]))
    begin_view("rear", (rx0, oz, rx1, oz + H), 0.011)
    rear_extra = [f'<rect class="outline" x="{rx0}" y="{-(oz+H)}" width="{L}" height="{H}"/>',
                  DH(rx0, rx1, oz + H + 1.4 * S, fmt(L))]
    extra_dims("ek_olculer_arka", rear_extra)
    for key, p in P.items():
        if shown(p, "arka"):
            rear_extra.append(MK(*proj("rear", p["x"], p["y"], p["z"]), key))
    rear_extra.append(f'<line class="floor" x1="{rx0-3*S}" y1="{-oz}" x2="{rx1+3*S}" y2="{-oz}"/>')
    ext_add(rx0 - 3 * S, oz, rx1 + 3 * S, oz)
    if G.get("ordinat_arka"):
        rear_extra.append(ordinate("rear", G["ordinat_arka"], oz - 0.9 * S))
    for lb in G.get("etiketler_arka", []):
        rear_extra.append(LB(lb["x"], lb["y"], lb["ad"], lb.get("anchor", "middle"), "side"))
    svg_rear = end_view("rear", rear_extra)


# --- bağlantı detayları (yakın görünüm + açıklama etiketleri + değer tablosu)
def detail_svg(d):
    name = d.get("gorunum")
    if name not in VIEWS:
        return ""
    v = VIEWS[name]
    begin_view(name, (v["x0"], v["y0"], v["x1"], v["y1"]), 0.026)
    out = []
    for e in d.get("etiketler", []):
        sx, sy = proj(name, e["x"], e["y"], e["z"])
        if "ok_z" in e or "ok_from" in e:   # kablo / hat yönü oku: ok_from [x, y, z] ya da aynı x-y'de ok_z kotundan noktaya
            fx, fy = proj(name, *e["ok_from"]) if "ok_from" in e else proj(name, e["x"], e["y"], e["ok_z"])
            out.append(f'<line class="cable" x1="{fx}" y1="{-fy}" x2="{sx}" y2="{-sy}" marker-end="url(#arrC)"/>')
            ext_add(min(fx, sx), min(fy, sy), max(fx, sx), max(fy, sy))
        dx, dy = e.get("dx", 0), e.get("dy", 0)
        lx, ly = sx + dx, sy + dy
        if dx or dy:
            out.append(f'<line class="leader" x1="{sx}" y1="{-sy}" x2="{lx}" y2="{-ly}"/>')
        if e.get("mk"):
            out.append(MK(sx, sy, e["mk"]))
        elif dx or dy:
            out.append(f'<circle class="dot" cx="{sx}" cy="{-sy}" r="{0.2*S:.1f}"/>')
        if "ad" in e:
            anchor = "end" if dx < 0 else ("start" if dx > 0 else "middle")
            tx = lx + (-0.25 * S if dx < 0 else 0.25 * S if dx > 0 else 0)
            out.append(LB(tx, ly - 0.3 * S, e["ad"], anchor, e.get("sinif", "dlbl")))
    return end_view(name, out, "view det")


def detail_card(d):
    rows = "".join(row(T(r["ad"]), T(r["deger"]) if isinstance(r["deger"], dict) else html.escape(str(r["deger"])))
                   for r in d.get("satirlar", []) if _has(r.get("deger")))
    svg = detail_svg(d)
    ph = f'<div class="ph">{svg}</div>' if svg else ""
    tbl = f'<table><colgroup><col style="width:36%"><col></colgroup><tbody>{rows}</tbody></table>' if rows else ""
    return (f'<div class="dcard lb-part" data-kind="col"><h3><span class="chip">{html.escape(d.get("anahtar", ""))}</span>{T(d.get("baslik", ""))}</h3>'
            f'{ph}{tbl}</div>')

# --- izometrik görünüm (ölçeksiz)
iso_html = ""
if "iso" in VIEWS:
    iso_html = (f'<img class="iso" width="{VIEWS["iso"].get("W", 1000)}" height="{VIEWS["iso"].get("H", 1000)}" '
                f'src="{img_data(os.path.join(HERE, "views", VIEWS["iso"]["png"]))}" alt="3D isometric view">')


def _has(v):
    """Boş / eksik alanları tabloya koyma (şablondan gelen boş değerler)."""
    if v is None:
        return False
    if isinstance(v, dict):
        return any(str(x).strip() for x in v.values())
    return bool(str(v).strip())


_arka =G["arka_baslik"] if _has(G.get("arka_baslik")) else d3("Arka görünüm (servis tarafı)", "Rear view (service side)", "Rückansicht (Serviceseite)")
# ---------------------------------------------------------------- tablolar
U_V = E.get("gerilim_v") or 400   # hesap gerilimi (V, fazlar arası)
I_n = E["toplam_guc_kw"] * 1000 / (math.sqrt(3) * U_V * E["cos_phi"])


def row(k, v):
    return f'<tr><th>{k}</th><td>{v}</td></tr>'


elec_rows = "".join([
    row(t3("Besleme gerilimi", "Supply voltage", "Versorgungsspannung"), T(E["besleme"])),
    row(t3("Toplam kurulu güç", "Total installed power", "Gesamtanschlussleistung"), f'<b>{E["toplam_guc_kw"]} kW</b>'),
    row(t3("Ana şalter", "Main switch", "Hauptschalter"), f'<b>{E["ana_salter_a"]} A</b>'),
    row(t3("Hesaplanan nominal akım", "Calculated rated current", "Berechneter Nennstrom"),
        f'{I_n:.0f} A <small>' + T({l: f'({E["toplam_guc_kw"]} kW / (√3 · {U_V} V · cos φ {c}))'
                                    for l, c in zip(("tr", "en", "de"), (f'{E["cos_phi"]:.2f}'.replace(".", ","),
                                                                          f'{E["cos_phi"]:.2f}',
                                                                          f'{E["cos_phi"]:.2f}'.replace(".", ",")))}) + '</small>'),
] + [row(lbl, T(E[k])) for k, lbl in [
    ("ust_koruma", t3("Müşteri tarafı koruma", "Customer-side protection", "Kundenseitige Absicherung")),
    ("rcd", t3("Kaçak akım koruması", "Residual-current protection", "Fehlerstromschutz")),
    ("kablo_oneri", t3("Besleme kablosu", "Supply cable", "Zuleitung")),
    ("kablo_giris", t3("Kablo girişi", "Cable entry", "Kabeleinführung")),
    ("topraklama", t3("Topraklama", "Earthing", "Erdung") if _has(E.get("faz_sirasi"))
     else t3("Topraklama / faz sırası", "Earthing / phase sequence", "Erdung / Drehfeld")),
    ("faz_sirasi", t3("Faz sırası", "Phase sequence", "Drehfeld")),
    ("kumanda", t3("Kumanda gerilimi", "Control voltage", "Steuerspannung")),
    ("kontrol", t3("Kontrol sistemi", "Control system", "Steuerung")),
] if _has(E.get(k))])

load_rows = "".join(
    f'<tr><td class="mono">{y["ref"]}</td><td>{T(y["ad"])}</td><td class="num">{y["kw"]}</td>'
    f'<td>{html.escape(y["koruma"])}</td><td class="num">{y.get("sayfa", "")}</td></tr>'
    for y in E.get("yukler", []))
_yb = E.get("yukler_baslik", {"tr": "Yük listesi", "en": "Load list", "de": "Verbraucherliste"})
pn = DATA.get("pnomatik", {})
dg = DATA.get("diger", {})
util_rows = "".join([row(lbl, T(src[k])) for src, k, lbl in [
    (pn, "basinc", t3("Basınçlı hava", "Compressed air", "Druckluft")),
    (pn, "baglanti", t3("Hava bağlantısı", "Air connection", "Luftanschluss")),
    (pn, "hazirlik", t3("Hava hazırlık", "Air preparation", "Luftaufbereitung")),
    (pn, "tuketiciler", t3("Pnömatik tüketiciler", "Pneumatic consumers", "Pneumatische Verbraucher")),
    (dg, "sicaklik", t3("Çalışma sıcaklığı", "Operating temperature", "Betriebstemperatur")),
    (dg, "su_basinc", t3("Su basıncı", "Water pressure", "Wasserdruck")),
    (dg, "su", t3("Su girişi", "Water inlet", "Wasserzulauf")),
    (dg, "su_dolum", t3("Otomatik su dolumu", "Automatic water filling", "Automatische Wasserbefüllung")),
    (dg, "tahliye", t3("Tahliye", "Drain", "Ablauf")),
    (dg, "tahliye_hat", t3("Müşteri tahliye hattı", "Customer drain line", "Kundenseitige Ablaufleitung")),
    (dg, "yag_ayirici", t3("Yağ ayırıcı", "Oil separator", "Ölabscheider")),
    (dg, "egzoz", t3("Egzoz", "Exhaust", "Abluft")),
] if _has(src.get(k))])

details = "".join(detail_card(d) for d in DATA.get("detaylar", []))
# ---------------------------------------------------------------- besleme kablosu (isteğe bağlı: elektrik.kablo)
def num(v, nd=2):
    s = f"{v:.{nd}f}"
    return {"tr": s.replace(".", ","), "en": s, "de": s.replace(".", ",")}


def pct(v, nd=2):
    n = num(v, nd)
    return {"tr": "%" + n["tr"], "en": n["en"] + " %", "de": n["de"] + " %"}


def st(x, y, obj, anchor="start", cls=""):
    """Şema SVG metni (y aşağı); üç dilli sözlük -> i18n."""
    if isinstance(obj, dict):
        tr, en, de = _l3(obj)
        return (f'<text class="i18n {cls}" x="{x}" y="{y}" text-anchor="{anchor}" data-tr="{html.escape(tr, True)}" '
                f'data-en="{html.escape(en, True)}" data-de="{html.escape(de, True)}">{html.escape(tr)}</text>')
    return f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{anchor}">{html.escape(str(obj))}</text>'


# IEC 60445 iletken renkleri
CORES = [("L1", "#8b5a2b", d3("Faz 1 · kahverengi", "Phase 1 · brown", "Außenleiter 1 · braun")),
         ("L2", "#1d1d1d", d3("Faz 2 · siyah", "Phase 2 · black", "Außenleiter 2 · schwarz")),
         ("L3", "#8f969c", d3("Faz 3 · gri", "Phase 3 · grey", "Außenleiter 3 · grau")),
         ("N", "#2e6fd2", d3("Nötr · mavi", "Neutral · blue", "Neutralleiter · blau")),
         ("PE", "url(#gy)", d3("Koruma topraklaması · yeşil-sarı", "Protective earth · green-yellow", "Schutzleiter · grün-gelb"))]
GY = ('<pattern id="gy" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
      '<rect width="4" height="8" fill="#2f9a47"/><rect x="4" width="4" height="8" fill="#f0c419"/></pattern>')


def single_line_svg(K):
    A, ma = E["ana_salter_a"], K.get("rcd_ma", 30)
    ys = {"L1": 78, "L2": 102, "L3": 126, "N": 150, "PE": 214}
    col = {k: c for k, c, _ in CORES}
    o = [f'<svg class="sld" viewBox="0 0 760 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="single-line diagram"><defs>{GY}</defs>',
         '<rect class="box" x="52" y="20" width="270" height="250"/>', '<rect class="box" x="520" y="20" width="230" height="250"/>',
         '<rect class="sheath" x="368" y="62" width="112" height="168" rx="14"/>']
    for k, y in ys.items():
        if k == "PE":
            o.append(f'<line class="w" x1="40" y1="{y}" x2="712" y2="{y}" stroke="#2f9a47"/>'
                     f'<line class="w" x1="40" y1="{y}" x2="712" y2="{y}" stroke="#f0c419" stroke-dasharray="10 10"/>')
        else:
            if k == "L2":
                o.append(f'<line class="w halo" x1="40" y1="{y}" x2="712" y2="{y}"/>')
            o.append(f'<line class="w" x1="40" y1="{y}" x2="712" y2="{y}" stroke="{col[k]}"/>')
        o.append(st(32, y + 5, k, "end", "wl"))
        o.append(f'<circle class="term" cx="712" cy="{y}" r="4"/>')
    # müşteri panosu: sigorta (3P) + kaçak akım (4P) + topraklama hattı
    o.append('<rect class="dev" x="96" y="66" width="54" height="72" rx="3"/>' + st(123, 107, f"{A} A", "middle", "dv"))
    o.append(st(123, 58, d3("Sigorta 3P", "Fuse 3P", "Sicherung 3P"), "middle", "dl"))
    o.append('<rect class="dev" x="194" y="66" width="70" height="96" rx="3"/>' + st(229, 104, f"{A} A", "middle", "dv")
             + st(229, 126, f"{ma} mA", "middle", "dv"))
    t = K.get("rcd_tip")
    o.append(st(229, 58, d3("Kaçak akım 4P" + (f" · tip {t}" if t else ""), "RCD 4P" + (f" · type {t}" if t else ""),
                            "FI 4P" + (f" · Typ {t}" if t else "")), "middle", "dl"))
    o.append('<line class="gnd" x1="96" y1="214" x2="96" y2="240"/><line class="gnd" x1="82" y1="240" x2="110" y2="240"/>'
             '<line class="gnd" x1="87" y1="246" x2="105" y2="246"/><line class="gnd" x1="92" y1="252" x2="100" y2="252"/>')
    o.append(st(118, 246, d3("Topraklama hattı – N'den ayrı", "Earthing conductor – separate from N", "Erdungsleiter – getrennt von N"), "start", "ds"))
    o.append(st(62, 38, d3("MÜŞTERİ DAĞITIM PANOSU", "CUSTOMER DISTRIBUTION BOARD", "KUNDENSEITIGE VERTEILUNG"), "start", "bt"))
    # kablo
    o.append(st(424, 50, f'{K["damar_sayisi"]} × {K["kesit_mm2"]} mm² Cu', "middle", "dv"))
    o.append(st(424, 250, K["yapi"], "middle", "dl"))
    # makine panosu: ana şalter
    o.append('<rect class="dev" x="586" y="66" width="56" height="72" rx="3"/>' + st(614, 107, f"{A} A", "middle", "dv"))
    o.append(st(614, 58, d3("Ana şalter", "Main switch", "Hauptschalter"), "middle", "dl"))
    o.append(st(530, 38, d3("MAKİNE ELEKTRİK PANOSU", "MACHINE ELECTRICAL PANEL", "SCHALTSCHRANK MASCHINE"), "start", "bt"))
    o.append(st(530, 246, K["giris_kisa"] if _has(K.get("giris_kisa")) else d3("Kablo girişi (E)", "Cable entry (E)", "Kabeleinführung (E)"), "start", "ds"))
    return "".join(o) + "</svg>"


def cross_section_svg():
    o = [f'<svg class="xsec" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="cable cross-section"><defs>{GY}</defs>',
         '<circle class="jacket" cx="110" cy="110" r="100"/><circle class="filler" cx="110" cy="110" r="88"/>']
    for i, (k, c, _) in enumerate(CORES):
        a = math.radians(-90 + i * 72)
        cx, cy = 110 + 47 * math.cos(a), 110 + 47 * math.sin(a)
        o.append(f'<circle class="core" cx="{cx:.1f}" cy="{cy:.1f}" r="33" fill="{c}"/>'
                 f'<circle class="cu" cx="{cx:.1f}" cy="{cy:.1f}" r="17"/>'
                 f'<text class="cl" x="{cx:.1f}" y="{cy + 6:.1f}" text-anchor="middle">{k}</text>')
    return "".join(o) + "</svg>"


K = E.get("kablo") or None
if K:
    for _k, _v in (("damar_sayisi", 5), ("kesit_mm2", 0), ("yapi", "3P + N + PE"), ("uzunluklar_m", [5, 10, 15, 20])):
        if K.get(_k) in (None, ""):
            K[_k] = _v
    if not K["kesit_mm2"]:
        K = None   # kesit verilmeden kablo bölümü üretilmez (Eksikler listesinde görünür)
cable_parts = ""
if K:
    rho = K.get("rho_ohm_mm2_m", 0.0225)   # bakır, 70 °C iletken sıcaklığı
    crow = ""
    for Lm in K["uzunluklar_m"]:
        du = math.sqrt(3) * I_n * Lm * rho * E["cos_phi"] / K["kesit_mm2"]
        crow += (f'<tr><td class="num">{Lm} m</td><td class="num"><b>{K["damar_sayisi"]} × {K["kesit_mm2"]} mm²</b></td>'
                 f'<td>{html.escape(K["yapi"])}</td><td class="num">{T(num(du))} V</td><td class="num">{T(pct(du / U_V * 100))}</td></tr>')
    A_, kW_ = E["ana_salter_a"], E["toplam_guc_kw"]
    i1, c2 = num(I_n, 1), num(E["cos_phi"], 2)
    note = d3(f"Kesit, {A_} A sigortaya göre seçilmiştir. Gerilim düşümü (ΔU) {kW_} kW tam yükte ({i1['tr']} A, {U_V} V, cos φ {c2['tr']}) hesaplanmıştır.",
              f"Cross-section selected for the {A_} A circuit breaker. Voltage drop (ΔU) calculated at {kW_} kW full load ({i1['en']} A, {U_V} V, cos φ {c2['en']}).",
              f"Querschnitt nach dem {A_}-A-Leitungsschutzschalter gewählt. Spannungsfall (ΔU) bei {kW_} kW Volllast ({i1['de']} A, {U_V} V, cos φ {c2['de']}) berechnet.")
    legend = "".join(f'<li><span class="sw sw-{k.lower()}"></span><b>{k}</b>{T(lbl)}</li>' for k, c, lbl in CORES)
    reqs = "".join(f"<li>{T(r)}</li>" for r in K.get("sartlar", []) if _has(r))
    tip = "" if not _has(K.get("tip")) else f'<p class="fine"><b>{t3("Kablo tipi", "Cable type", "Leitungstyp")}:</b> {T(K["tip"])}</p>'
    cable_parts = f"""
    <div class="lb-part" data-kind="full"><div class="cab">
      <figure>{single_line_svg(K)}<figcaption>{t3("Bağlantı şeması: müşteri panosu → besleme kablosu → makine ana şalteri. PE hattı koruma elemanlarından geçmez ve nötrden ayrıdır.", "Connection diagram: customer board → supply cable → machine main switch. The PE conductor bypasses the protective devices and is separate from neutral.", "Anschlussschema: Kundenverteilung → Zuleitung → Hauptschalter der Maschine. Der Schutzleiter läuft nicht über die Schutzorgane und ist vom Neutralleiter getrennt.")}</figcaption></figure>
      <figure class="xs">{cross_section_svg()}<ul class="cores">{legend}</ul><figcaption>{T(K.get("tanim", ""))}</figcaption></figure>
    </div></div>
    <div class="lb-part" data-kind="col">
      <h3 class="sub">{t3("Kablo kesiti – kablo uzunluğuna göre", "Cable cross-section by cable length", "Leiterquerschnitt nach Leitungslänge")}</h3>
      <table><colgroup><col style="width:17%"><col style="width:27%"><col style="width:22%"><col style="width:16%"><col style="width:18%"></colgroup>
      <thead><tr><th class="num">{t3("Uzunluk", "Length", "Länge")}</th><th class="num">{t3("Kesit (Cu)", "Cross-section (Cu)", "Querschnitt (Cu)")}</th><th>{t3("Damarlar", "Cores", "Adern")}</th><th class="num">ΔU (V)</th><th class="num">ΔU (%)</th></tr></thead>
      <tbody>{crow}</tbody></table>
      <p class="fine">{T(note)}</p>
      {tip}
    </div>"""
    if reqs:
        cable_parts += f"""
    <div class="lb-part" data-kind="col">
      <h3 class="sub">{t3("Müşteri tesisatında bulunması zorunlu olanlar", "Mandatory on the customer's installation", "Kundenseitig zwingend erforderlich")}</h3>
      <ol class="req">{reqs}</ol>
    </div>"""

pt_rows = "".join(
    f'<tr><td><span class="chip">{k}</span></td><td>{T(p["ad"])}</td>'
    f'<td class="num">{fmt(p["x"]-ox)}</td><td class="num">{fmt(p["y"]-oy)}</td><td class="num">{fmt(p["z"]-oz)}</td>'
    f'<td>{T(p["detay"])}</td></tr>'
    for k, p in P.items())

dim_rows = "".join(
    [row(t3("Boy (L) × En (W) × Yükseklik (H)", "Length (L) × Width (W) × Height (H)", "Länge (L) × Breite (B) × Höhe (H)"),
         f'<b>{fmt(L)} × {fmt(W)} × {fmt(H)} mm</b>')]
    + [row(T(d["ad"]), T(d["deger"]) if isinstance(d["deger"], dict) else html.escape(str(d["deger"]))) for d in G.get("olcu_satirlari", [])])

notes = "".join(f"<li>{T(n)}</li>" for n in E.get("notlar", []) + G.get("notlar", []) if _has(n))


# ---------------------------------------------------------------- belge kaynağı: bölümler -> (tarayıcıda) A3 antetli sayfalar
def sec(sid, title, body):
    """Belge bölümü; title düz metin ya da {tr, en, de}. Sayfa dizgisi belge.js'tedir (paginate)."""
    if not body.strip():
        return ""
    tr, en, de = _l3(title) if isinstance(title, dict) else (title, title, title)
    return (f'<section class="lb-sec" data-sec="{sid}" data-tr="{html.escape(tr, True)}" data-en="{html.escape(en, True)}" '
            f'data-de="{html.escape(de, True)}">{body}</section>\n')


KV = '<colgroup><col style="width:36%"><col></colgroup>'
pair = (f'<div><p class="lb-cap">{t3("Yan görünüm (sağ)", "Side view (right)", "Seitenansicht (rechts)")}</p>{svg_side}</div>'
        + (f'<div><p class="lb-cap">{t3("3D izometrik görünüm (ölçeksiz)", "3D isometric view (not to scale)", "3D-Isometrie (nicht maßstäblich)")}</p>{iso_html}</div>' if iso_html else ""))
pt_head = (f'<colgroup><col style="width:5%"><col style="width:23%"><col style="width:6%"><col style="width:6%"><col style="width:6%"><col></colgroup>'
           f'<thead><tr><th></th><th>{t3("Bağlantı", "Connection", "Anschluss")}</th><th class="num">X</th><th class="num">Y</th><th class="num">Z</th>'
           f'<th>{t3("Detay", "Detail", "Detail")}</th></tr></thead>')
load_head = (f'<colgroup><col style="width:9%"><col style="width:43%"><col style="width:9%"><col style="width:30%"><col style="width:9%"></colgroup>'
             f'<thead><tr><th>Ref</th><th>{t3("Tüketici", "Load", "Verbraucher")}</th><th class="num">kW</th>'
             f'<th>{t3("Koruma / sürücü", "Protection / drive", "Schutz / Antrieb")}</th><th class="num">{t3("Sayfa", "Page", "Seite")}</th></tr></thead>')
details = "".join(detail_card(d) for d in DATA.get("detaylar", []))

SRC = "".join([
    sec("ust", d3("Üst görünüm (plan) – servis alanı ile", "Top view (plan) – with service area", "Draufsicht – mit Servicebereich"),
        f'<div class="lb-part lb-view" data-kind="full">{svg_top}</div>'),
    sec("on", d3("Ön görünüm (operatör tarafı)", "Front view (operator side)", "Vorderansicht (Bedienerseite)"),
        f'<div class="lb-part lb-view" data-kind="full">{svg_front}</div>'),
    sec("arka", _arka, f'<div class="lb-part lb-view" data-kind="full">{svg_rear}</div>') if svg_rear else "",
    sec("yan", d3("Yan görünüm · 3D izometrik", "Side view · 3D isometric", "Seitenansicht · 3D-Isometrie"),
        f'<div class="lb-part" data-kind="full"><div class="lb-pair">{pair}</div></div>'),
    sec("olculer", d3("Ölçüler", "Dimensions", "Abmessungen"), f'<table class="lb-part" data-kind="table">{KV}<tbody>{dim_rows}</tbody></table>'),
    sec("elektrik", d3("Elektrik bağlantısı", "Electrical connection", "Elektrischer Anschluss"),
        f'<table class="lb-part" data-kind="table">{KV}<tbody>{elec_rows}</tbody></table>'),
    sec("tesisat", d3("Hava · su · egzoz · tahliye", "Air · water · exhaust · drain", "Luft · Wasser · Abluft · Ablauf"),
        f'<table class="lb-part" data-kind="table">{KV}<tbody>{util_rows}</tbody></table>') if util_rows else "",
    sec("noktalar", d3("Bağlantı noktaları (referans: sol-ön-alt köşe, mm)", "Connection points (reference: front-left-bottom corner, mm)",
                       "Anschlusspunkte (Bezug: Ecke vorne links unten, mm)"),
        f'<table class="lb-part" data-kind="table" data-w="full">{pt_head}<tbody>{pt_rows}</tbody></table>') if pt_rows else "",
    sec("detaylar", d3("Bağlantı detayları", "Connection details", "Anschlussdetails"), details),
    sec("kablo", d3("Besleme kablosu ve koruma", "Supply cable and protection", "Zuleitung und Absicherung"), cable_parts),
    sec("yukler", _yb, f'<table class="lb-part" data-kind="table" data-w="full">{load_head}<tbody>{load_rows}</tbody></table>') if load_rows else "",
    sec("notlar", d3("Notlar", "Notes", "Hinweise"), f'<ul class="notes lb-part" data-kind="list">{notes}</ul>') if notes else "",
])

# ---------------------------------------------------------------- kapak / antet bilgileri, logo, yazı tipleri
BELGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "belge")
LOGO_FILES = {"DOLFIN": "dolfin.png", "ENVA": "enva.svg", "VICO": "vico.png", "KSYSTEM": "ksystem.png"}
BRAND_COLORS = {"DOLFIN": "#ff0000", "ENVA": "#007938", "VICO": "#C41E3A", "KSYSTEM": "#1B04AE"}
try:
    SETTINGS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "ayarlar.json"), encoding="utf-8"))
except (OSError, ValueError):
    SETTINGS = {}
META = dict(M)
META["firma"] = META.get("firma") if META.get("firma") in LOGO_FILES else "DOLFIN"


def file_data(path, mime):
    with open(path, "rb") as f:
        return f"data:{mime};base64," + base64.b64encode(f.read()).decode("ascii")


_lf = LOGO_FILES[META["firma"]]
LOGOS = {_lf.split(".")[0]: file_data(os.path.join(BELGE, "logos", _lf), "image/svg+xml" if _lf.endswith(".svg") else "image/png")}
FONT_FACES = "".join(
    f"@font-face {{ font-family: 'Selawik'; font-weight: {w}; src: url({file_data(os.path.join(BELGE, 'fonts', fn), 'font/ttf')}) format('truetype'); }}\n"
    for fn, w in (("selawk.ttf", 400), ("selawksb.ttf", 600), ("selawkb.ttf", 700)))
# Dışa aktarma (uygulamadaki "İndir → HTML"): seçilen diller arka arkaya, isteğe bağlı bölüm seçimi ve kapaksız
EXPORT = None
if OPTS.get("langs"):
    EXPORT = {"langs": [l for l in OPTS["langs"].split(",") if l in ("tr", "en", "de")] or ["tr"],
              "only": [x for x in OPTS["secs"].split(",") if x] if "secs" in OPTS else None,
              "cover": OPTS.get("cover", "1") != "0"}
LBMETA = json.dumps({"meta": META, "design": SETTINGS.get("kapakTasarimi", "bant"), "logos": LOGOS, "file": _ad,
                     "title": M.get("proje") or M["model"], "export": EXPORT}, ensure_ascii=False).replace("</", "<\\/")
BELGE_CSS = open(os.path.join(BELGE, "belge.css"), encoding="utf-8").read()
BELGE_JS = open(os.path.join(BELGE, "belge.js"), encoding="utf-8").read()
ACCENT = BRAND_COLORS[META["firma"]]

DOC_CSS = """
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
"""

_title = html.escape((M.get("proje") or M["model"]) + " – Layout")
_mus = M["musteri"] if isinstance(M.get("musteri"), str) else _l3(M.get("musteri") or {})[0]
page = (f"<title>{_title}</title>\n<style>\n" + FONT_FACES + BELGE_CSS + DOC_CSS + "</style>\n" + f"""<header class="lb-bar" style="--brand:{ACCENT}">
  <div class="ttl"><strong>{html.escape(M["model"])} · <span data-t="docTypeValue">Yerleşim Planı</span></strong><span>{html.escape(str(M.get("seri_no", "")))} · {html.escape(_mus)} · Rev {html.escape(str(M.get("rev", "")))}</span></div>
  <span class="sp"></span>
  <div class="lang-seg" role="group" aria-label="Language">
    <button type="button" data-doc-lang="tr" aria-pressed="true">TR</button><button type="button" data-doc-lang="en" aria-pressed="false">EN</button><button type="button" data-doc-lang="de" aria-pressed="false">DE</button>
  </div>
  <button type="button" class="btn btn-primary" id="pdf-open" aria-haspopup="dialog" data-t="pdf">PDF indir</button>
</header>
<main id="lb-pages" style="--brand:{ACCENT}"></main>
<div id="lb-src">
{SRC}</div>
<script type="application/json" id="lb-meta">{LBMETA}</script>
<dialog class="pdfdlg" id="pdf-dlg" aria-labelledby="pdf-h" style="--brand:{ACCENT}">
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
<!--PDF-DATA-->
<script>
""" + BELGE_JS + """
</script>
<script>LayoutBelge.startDocument();</script>
""")

# Yerel dosya: tam HTML belgesi. İsteğe bağlı 2. argüman: artifact için gövde parçası (doctype/head olmadan).
PDF_MARK = "<!--PDF-DATA-->"
LANGS = ("tr", "en", "de")


def assemble(pg):
    head, rest = pg.split("<style>", 1)
    css, body = rest.split("</style>", 1)
    return ('<!doctype html>\n<html lang="tr">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + head + "<style>" + css + "</style>\n</head>\n<body>\n" + body + "\n</body>\n</html>\n")


def find_browser():
    for b in (os.environ.get("CHROME_PATH"),
              r"C:\Program Files\Google\Chrome\Application\chrome.exe",
              r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
              r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
              r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
              shutil.which("google-chrome"), shutil.which("chromium"), shutil.which("chrome"), shutil.which("msedge")):
        if b and os.path.exists(b):
            return b
    return None


def page_count(pdf):
    return len(re.findall(rb"/Type\s*/Page(?![a-zA-Z])", open(pdf, "rb").read()))


def print_pdf(html_path, langs, out):
    """HTML'in yazdırma kipini (#pdf-print=...) headless tarayıcıyla A3 yatay PDF'e basar."""
    browser = find_browser()
    if not browser:
        raise RuntimeError("Chrome / Edge bulunamadı (CHROME_PATH ile verilebilir)")
    tmp = tempfile.mkdtemp(prefix="layout-pdf-")
    try:
        url = pathlib.Path(html_path).resolve().as_uri() + "#pdf-print=" + ",".join(langs)
        # çıktı yakalanmaz: Chrome'un yan süreçleri (crashpad) boruyu açık tutar ve bekleme hiç bitmez
        subprocess.run([browser, "--headless=new", "--disable-gpu", "--disable-crash-reporter", "--no-first-run",
                        "--no-pdf-header-footer", "--virtual-time-budget=15000",
                        "--user-data-dir=" + os.path.join(tmp, "profil"), "--print-to-pdf=" + out, url],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if not os.path.exists(out) or os.path.getsize(out) == 0:
        raise RuntimeError("tarayıcı PDF üretmedi (" + ",".join(langs) + ")")
    return out


def pdf_block():
    """TR/EN/DE PDF'ini basıp gömülecek veri + pdf-lib döner (PDF indir düğmesi bunu kullanır)."""
    lib = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor", "pdf-lib.min.js")
    if not os.path.exists(lib):
        print("PDF gömülmedi: tools/vendor/pdf-lib.min.js yok; düğme yazdırma penceresini açar")
        return ""
    tmp = tempfile.mkdtemp(prefix="layout-pdfb-")
    try:
        combined = print_pdf(OUT, LANGS, os.path.join(tmp, "hepsi.pdf"))
        counts = [page_count(print_pdf(OUT, (l,), os.path.join(tmp, l + ".pdf"))) for l in LANGS]
        total = page_count(combined)
        if sum(counts) != total:
            raise RuntimeError(f"sayfa sayıları tutmuyor: {counts} / {total}")
        ranges, n0 = {}, 0
        for l, c in zip(LANGS, counts):
            ranges[l] = [n0, n0 + c]
            n0 += c
        b64 = base64.b64encode(open(combined, "rb").read()).decode("ascii")
        print(f"PDF gömüldü: {total} sayfa (" + ", ".join(f"{l.upper()} {c}" for l, c in zip(LANGS, counts)) + f"), {len(b64) / 1e6:.1f} MB")
        return (f'<script type="application/octet-stream" id="pdf-data" data-ranges="{html.escape(json.dumps(ranges), True)}">{b64}</script>\n'
                '<script>/* pdf-lib 1.17.1 – MIT License – https://github.com/Hopding/pdf-lib */\n'
                + open(lib, encoding="utf-8").read() + "\n</script>")
    except Exception as e:
        print("PDF gömülmedi:", e)
        return ""
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(assemble(page.replace(PDF_MARK, "")))
    if "--no-pdf" not in FLAGS:
        page = page.replace(PDF_MARK, pdf_block())
        with open(OUT, "w", encoding="utf-8") as f:
            f.write(assemble(page))
    print("yazıldı:", OUT, f"{os.path.getsize(OUT)/1e6:.2f} MB")
    if len(ARGS) > 1:
        with open(ARGS[1], "w", encoding="utf-8") as f:
            f.write(page.replace(PDF_MARK, ""))
        print("artifact parçası:", ARGS[1])
