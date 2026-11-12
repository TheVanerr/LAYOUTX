# -*- coding: utf-8 -*-
"""Layout Çizim Motoru – STEP dosyasından yerleşim planı (layout) üreten yerel web uygulaması.

Çalıştırma:  python layout_app.py          (tarayıcıda http://127.0.0.1:8765 açılır; yalnızca bu bilgisayarda)
             pythonw layout_app.py --app    hafif uygulama: kendi penceresinde açılır, pencere kapanınca kapanır (masaüstü simgesi)
             pythonw layout_app.py --protocol layoutx://start   app/baslat.html'deki "Başlat" düğmesi (sunucu arka planda)
             python layout_app.py --install / --uninstall      masaüstü + Başlat menüsü simgesi ve layoutx:// bağlantısı
Projeler:    LAYOUT/projects/<seri no>-<MÜŞTERİ>-<MODEL>/
Akış:        Yeni proje (kapak bilgileri) -> STEP yükle -> boru hattı (OCP okuma, üçgenleme, VTK görünümler, geometri)
             -> bölümleri düzenle (otomatik kayıt + canlı önizleme) -> PDF / HTML indir (belge tarayıcıda belge/kaynak.js ile üretilir).
Yalnızca standart kütüphane + numpy; ağır işler tools/ betiklerine alt süreç olarak verilir.
"""
import os, re, sys, json, glob, time, copy, shutil, threading, subprocess, webbrowser, datetime, tempfile, pathlib
import urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECTS = os.path.join(ROOT, "projects")
TOOLS = os.path.join(ROOT, "tools")
APPDIR = os.path.join(ROOT, "app")
BELGE = os.path.join(ROOT, "belge")
TEMPLATE = os.path.join(TOOLS, "sablon-layout-veri.json")
SETTINGS = os.path.join(TOOLS, "ayarlar.json")
# alt betikler her zaman python.exe ile (pythonw ile başlatılsa da), konsol penceresi açmadan
PY = sys.executable[:-len("pythonw.exe")] + "python.exe" if sys.executable.lower().endswith("pythonw.exe") and \
    os.path.exists(sys.executable[:-len("pythonw.exe")] + "python.exe") else sys.executable
NOWIN = getattr(subprocess, "CREATE_NO_WINDOW", 0)
PORT = int(os.environ.get("LAYOUT_PORT", "8765"))
JOBS = {}
LAST_SEEN = [time.time()]          # son istek zamanı (boşta kalınca kendini kapatma)
IDLE_LIMIT = 15 * 60               # arka plan / uygulama kipinde: bu kadar sn istek gelmezse kapanır
APP_ID = "layoutx"
LOCALAPP = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "LayoutX")
sys.path.insert(0, ROOT)
import layout_db  # noqa: E402  GitHub deposu veritabanı
DB = None          # main() içinde kurulur (günlük işlevi hazır olunca)
LOCK = threading.Lock()
SAVE_LOCK = threading.Lock()
AX = {"+X": (1, 0, 0), "-X": (-1, 0, 0), "+Y": (0, 1, 0), "-Y": (0, -1, 0), "+Z": (0, 0, 1), "-Z": (0, 0, -1)}
TR_MAP = str.maketrans("çğıöşüÇĞİÖŞÜâîûÂÎÛ", "cgiosuCGIOSUaiuAIU")
DESIGNS = ("bant", "ust", "kose")
BRANDS = ("DOLFIN", "ENVA", "VICO", "KSYSTEM")
MIME = {".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png",
        ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
        ".pdf": "application/pdf", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}


# ---------------------------------------------------------------- yardımcılar
def safe_name(s):
    return re.sub(r'[\\/:*?"<>|]+', "-", str(s or "")).strip().strip(".").strip()


def slug(s):
    return re.sub(r"[^A-Za-z0-9]+", "-", str(s).translate(TR_MAP)).strip("-")


def ascii_upper(s):
    """Klasör adındaki müşteri: Türkçe karaktersiz büyük harf (örn. ŞİŞECAM -> SISECAM)."""
    return str(s).translate(TR_MAP).upper()


def proj_dir(name):
    d = os.path.normpath(os.path.join(PROJECTS, safe_name(name)))
    if os.path.dirname(d) != os.path.normpath(PROJECTS):
        raise ValueError("geçersiz proje adı")
    return d


def find_veri(d):
    L = sorted(glob.glob(os.path.join(d, "*-layout-veri.json")))
    return L[0] if L else None


def find_steps(d):
    return sorted({p for ext in ("*.STEP", "*.step", "*.stp", "*.STP") for p in glob.glob(os.path.join(d, ext))})


def find_step(d):
    L = find_steps(d)
    return L[0] if L else None


def load_json(p, default=None):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        if default is not None:
            return default
        raise


def save_json(p, d):
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, p)


def mtime(p):
    try:
        return os.path.getmtime(p)
    except OSError:
        return 0


def settings():
    s = load_json(SETTINGS, {})
    if s.get("kapakTasarimi") not in DESIGNS:
        s["kapakTasarimi"] = "bant"
    return s


def files_url(name, rel):
    return "/files/" + urllib.parse.quote(name) + "/" + "/".join(urllib.parse.quote(x) for x in rel.split("/"))


def text(v):
    if isinstance(v, dict):
        return v.get("tr") or v.get("en") or v.get("de") or ""
    return "" if v is None else str(v)


def project_files(d, name):
    """Proje klasöründeki dosyalar (ara dosyalar hariç), gruplu."""
    out = []
    for p in sorted(glob.glob(os.path.join(d, "*"))):
        if os.path.isdir(p) or os.path.basename(p).endswith(".tmp"):
            continue
        b = os.path.basename(p)
        ext = os.path.splitext(b)[1].lower()
        kind = ("step" if ext in (".step", ".stp") else "pdf" if ext == ".pdf" else "html" if ext == ".html"
                else "data" if ext == ".json" else "other")
        out.append({"name": b, "kind": kind, "size": os.path.getsize(p), "mtime": mtime(p), "url": files_url(name, b)})
    views = sorted(glob.glob(os.path.join(d, "views", "*.png")))
    for p in views:
        b = os.path.basename(p)
        out.append({"name": "views/" + b, "kind": "view", "size": os.path.getsize(p), "mtime": mtime(p), "url": files_url(name, "views/" + b)})
    return out


def summary(d):
    name = os.path.basename(d)
    veri = find_veri(d)
    data = load_json(veri, {}) if veri else {}
    m = data.get("makine", {})
    step = find_step(d)
    job = JOBS.get(name, {})
    return {"name": name, "veri": bool(veri),
            "meta": {k: m.get(k) for k in ("seri_no", "musteri", "model", "tam_ad", "rev", "tarih", "firma", "hazirlayan")},
            "step": os.path.basename(step) if step else "", "stepSize": os.path.getsize(step) if step else 0,
            "views": os.path.exists(os.path.join(d, "views", "views_meta.json")),
            "pdfs": [os.path.basename(p) for p in sorted(glob.glob(os.path.join(d, "*.pdf")))],
            "htmls": [os.path.basename(p) for p in sorted(glob.glob(os.path.join(d, "*-Layout*.html")))],
            "updated": max(mtime(veri or ""), mtime(os.path.join(d, "views", "views_meta.json"))),
            "job": job.get("state"), "jobKind": job.get("kind")}


def list_projects():
    os.makedirs(PROJECTS, exist_ok=True)
    out = []
    for d in sorted(glob.glob(os.path.join(PROJECTS, "*"))):
        b = os.path.basename(d)
        if os.path.isdir(d) and not b.startswith(("_", ".")) and find_veri(d):
            out.append(summary(d))
    return sorted(out, key=lambda p: -p["updated"])


def project_detail(name):
    d = proj_dir(name)
    veri = find_veri(d)
    if not veri:
        return None
    meta = os.path.join(d, "views", "views_meta.json")
    cfgp = os.path.join(d, "views_cfg.json")
    s = summary(d)
    s.update({"data": load_json(veri), "veriFile": os.path.basename(veri),
              "views_meta": load_json(meta, {}) if os.path.exists(meta) else None,
              "cfg": load_json(cfgp, {}) if os.path.exists(cfgp) else None,
              "files": project_files(d, name), "veriMtime": mtime(veri)})
    return s


# ---------------------------------------------------------------- yeni proje
def blank_like(o):
    if isinstance(o, dict):
        return {k: blank_like(v) for k, v in o.items()}
    if isinstance(o, list):
        return []
    if isinstance(o, (int, float)) and not isinstance(o, bool):
        return 0
    return ""


def data_from_copy(src):
    """Başka projeden başlangıç verisi: metinler ve tablolar gelir; makineye özgü koordinatlar
    makine kutusuna göre orana (rel) çevrilir, yeni STEP'in kutusuna yeniden yerleşir."""
    data = copy.deepcopy(src)
    g = data.get("geometri", {})
    try:
        ox, oy, oz = g["origin"]
        L, W, H = g["boy"] or 1, g["en"] or 1, g["yukseklik"] or 1
        for p in g.get("noktalar", {}).values():
            if all(k in p for k in ("x", "y", "z")):
                p["rel"] = [round((p.pop("x") - ox) / L, 4), round((p.pop("y") - oy) / W, 4), round((p.pop("z") - oz) / H, 4)]
    except (KeyError, TypeError, ValueError):
        pass
    for k in ("ek_olculer_ust", "ek_olculer_on", "ek_olculer_yan", "ek_olculer_arka", "etiketler_ust", "etiketler_arka"):
        if k in g:
            g[k] = []
    for k in ("origin", "boy", "en", "yukseklik", "zemin_model_y", "eksen"):
        g.pop(k, None)
    for d in data.get("detaylar", []):
        d.pop("etiketler", None)
        d.pop("gorunum", None)
    data["makine"]["revizyonlar"] = []
    return data


def create_project(req):
    m = req.get("makine") or {}
    seri, musteri, model = (safe_name(m.get(k)) for k in ("seri_no", "musteri", "model"))
    if not seri or not musteri or not model:
        raise ValueError("Seri no, müşteri ve model gerekli")
    name = safe_name(f"{seri}-{ascii_upper(musteri)}-{model}")
    d = proj_dir(name)
    if os.path.exists(d):
        raise ValueError(f"Bu proje zaten var: {name}")
    src = req.get("kopya")
    if src:
        sv = find_veri(proj_dir(src))
        if not sv:
            raise ValueError("Kopyalanacak proje bulunamadı")
        data = data_from_copy(load_json(sv))
    else:
        data = load_json(TEMPLATE)
    mk = data.setdefault("makine", {})
    for k in ("seri_no", "musteri", "model", "tam_ad", "firma", "hazirlayan", "kontrol", "onay", "tarih", "rev"):
        if k in m and m[k] not in (None, ""):
            mk[k] = m[k]
    mk["seri_no"], mk["model"] = seri, model
    mk["musteri"] = m.get("musteri").strip()
    mk["proje"] = name
    mk["dosya_adi"] = slug(f"{seri}-{ascii_upper(musteri)}-{model}") + "-Layout"
    mk.setdefault("firma", "DOLFIN")
    mk["tarih"] = mk.get("tarih") or datetime.date.today().strftime("%d.%m.%Y")
    mk["rev"] = mk.get("rev") or "00"
    mk.setdefault("kontrol", "")
    mk.setdefault("onay", "")
    mk.setdefault("revizyonlar", [])
    mk["kaynak_step"] = ""
    data.pop("_yorum", None)
    data = {"_yorum": f"{name} yerleşim planı (layout) verisi.", **data}
    os.makedirs(d)
    save_json(os.path.join(d, slug(name).lower() + "-layout-veri.json"), data)
    return name


# ---------------------------------------------------------------- boru hattı
def make_cfg(up, front):
    import numpy as np
    u = np.array(AX[up], float)
    f = np.array(AX[front], float)
    if abs(np.dot(u, f)) > 1e-9:
        raise ValueError("Yukarı ve operatör eksenleri farklı olmalı")
    r = np.cross(u, f)
    iso = f + r + 0.85 * u
    return {"px_per_mm": 0.5, "supersample": 2, "margin_mm": 60, "feature_angle": 35, "line_width": 1.3,
            "views": {"top": {"R": [r.tolist(), (-f).tolist(), u.tolist()]},
                      "front": {"R": [r.tolist(), u.tolist(), f.tolist()]},
                      "side": {"R": [(-f).tolist(), u.tolist(), r.tolist()]},
                      "iso": {"dir": iso.tolist(), "up": u.tolist(), "px_per_mm": 0.4},
                      "rear": {"R": [(-r).tolist(), u.tolist(), (-f).tolist()]}}}


def axis_name(v):
    import numpy as np
    i = int(np.argmax(np.abs(v)))
    return ("-" if v[i] < 0 else "+") + "XYZ"[i]


def auto_geometry(d, work, cfg):
    """tris.npy'den görünüm koordinatlarında kutu; veri JSON'daki geometri bloğunu doldurur."""
    import numpy as np
    T = np.load(os.path.join(work, "tris.npy"))
    P = T.reshape(-1, 3)
    R = np.array(cfg["views"]["top"]["R"], float)
    xv, yv, zv = P @ R[0], P @ R[1], P @ R[2]
    ox, oy, oz = float(xv.min()), float(yv.min()), float(zv.min())
    L, W, H = float(np.ptp(xv)), float(np.ptp(yv)), float(np.ptp(zv))
    veri = find_veri(d)
    with SAVE_LOCK:
        data = load_json(veri)
        g = data.setdefault("geometri", copy.deepcopy(load_json(TEMPLATE)["geometri"]))
        for k, v in load_json(TEMPLATE)["geometri"].items():
            g.setdefault(k, copy.deepcopy(v))
        g["eksen"] = {"x": f"sağ = {axis_name(R[0])}", "y": f"arka = {axis_name(R[1])}", "z": f"yukarı = {axis_name(R[2])}"}
        g["zemin_model_y"] = round(oz, 1)
        g["origin"] = [round(ox, 1), round(oy, 1), round(oz, 1)]
        g["boy"], g["en"], g["yukseklik"] = round(L, 1), round(W, 1), round(H, 1)
        for p in g.get("noktalar", {}).values():
            if "rel" in p:
                fx, fy, fz = p.pop("rel")
                p["x"], p["y"], p["z"] = round(ox + fx * L), round(oy + fy * W), round(oz + fz * H)
        for r in g.get("olcu_satirlari", []):
            if isinstance(r.get("deger"), str):
                r["deger"] = r["deger"].replace("{L}", f"{L:.0f}").replace("{W}", f"{W:.0f}").replace("{H}", f"{H:.0f}")
        data["geometri"] = g
        save_json(veri, data)
    return g


def run_proc(job, args, label):
    job["step"] = label
    job["log"].append(f"== {label}")
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    p = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                         encoding="utf-8", errors="replace", cwd=ROOT, env=env, creationflags=NOWIN)
    for line in p.stdout:
        job["log"].append(line.rstrip())
    p.wait()
    if p.returncode:
        raise RuntimeError(f"{label}: hata kodu {p.returncode}")


def run_pipeline(name, opts):
    d = proj_dir(name)
    work = os.path.join(d, "_work")
    os.makedirs(work, exist_ok=True)
    job = JOBS[name]
    log = job["log"].append
    try:
        step = find_step(d)
        if not step:
            raise RuntimeError("Proje klasöründe STEP dosyası yok")
        has_brep = os.path.exists(os.path.join(work, "model.brep"))
        has_tris = os.path.exists(os.path.join(work, "tris.npy"))
        need_mesh = opts.get("force_read") or opts.get("force_mesh") or not has_tris
        if opts.get("force_read") or (need_mesh and not has_brep):
            run_proc(job, [PY, os.path.join(TOOLS, "read_step.py"), step, work], "STEP okuma (OpenCASCADE)")
        else:
            log("== STEP okuma atlandı (önceki okuma kullanılıyor)")
        if need_mesh:
            run_proc(job, [PY, os.path.join(TOOLS, "mesh_model.py"), os.path.join(work, "model.brep"), work,
                           str(opts.get("min_diag", 25)), str(opts.get("defl", 2.0))], "Üçgenleme")
        else:
            log("== Üçgenleme atlandı (tris.npy mevcut)")
        cfg = make_cfg(opts.get("up", "+Y"), opts.get("front", "+Z"))
        cfgp = os.path.join(d, "views_cfg.json")
        if os.path.exists(cfgp):   # elle eklenen ek görünümler (yakın detaylar) korunur
            for k, v in load_json(cfgp, {}).get("views", {}).items():
                cfg["views"].setdefault(k, v)
        save_json(cfgp, cfg)
        run_proc(job, [PY, os.path.join(TOOLS, "render_views_vtk.py"), os.path.join(work, "tris.npy"), os.path.join(d, "views"), cfgp],
                 "Görünümler (VTK)")
        if os.path.exists(os.path.join(work, "structure.json")):
            shutil.copy(os.path.join(work, "structure.json"), os.path.join(d, "step-structure.json"))
        job["step"] = "Geometri"
        if opts.get("auto_geometry", True):
            g = auto_geometry(d, work, cfg)
            log(f"== Geometri: {g['boy']:.0f} × {g['en']:.0f} × {g['yukseklik']:.0f} mm, origin {g['origin']}")
        with SAVE_LOCK:
            veri = find_veri(d)
            data = load_json(veri)
            data["makine"]["kaynak_step"] = data["makine"].get("kaynak_step") or os.path.basename(step)
            save_json(veri, data)
        job["state"] = "done"
        job["step"] = "Tamam"
        log("== Bitti")
        db_touch()
    except Exception as e:
        job["state"] = "error"
        log(f"HATA: {e}")


def find_chrome():
    for b in (os.environ.get("CHROME_PATH"), r"C:\Program Files\Google\Chrome\Application\chrome.exe",
              r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
              r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
              shutil.which("chrome"), shutil.which("msedge"), shutil.which("google-chrome"), shutil.which("chromium")):
        if b and os.path.exists(b):
            return b
    raise RuntimeError("Chrome / Edge bulunamadı (CHROME_PATH ortam değişkeniyle verilebilir)")


def safe_file(fn, exts):
    fn = safe_name(os.path.basename(str(fn or "")))
    if not fn or not fn.lower().endswith(exts):
        raise ValueError("geçersiz dosya adı")
    return fn


def print_html(name, html_text, file, langs, secs=None, cover=True):
    """Uygulamanın (tarayıcıda) ürettiği pafta HTML'ini headless tarayıcıyla A3 yatay PDF'e basar, proje klasörüne yazar."""
    d = proj_dir(name)
    if not find_veri(d):
        raise ValueError("proje yok")
    fn = safe_file(file, (".pdf",))
    os.makedirs(os.path.join(d, "_work"), exist_ok=True)
    src = os.path.join(d, "_work", "baski.html")
    with open(src, "w", encoding="utf-8") as f:
        f.write(html_text)
    url = pathlib.Path(src).resolve().as_uri() + "#pdf-print=" + ",".join(langs)
    if secs is not None:
        url += "&secs=" + ",".join(re.sub(r"[^a-z]", "", x) for x in secs)
    if not cover:
        url += "&cover=0"
    tmp = tempfile.mkdtemp(prefix="layout-pdf-")
    try:
        part = os.path.join(tmp, "out.pdf")
        subprocess.run([find_chrome(), "--headless=new", "--disable-gpu", "--disable-crash-reporter", "--no-first-run",
                        "--no-pdf-header-footer", "--virtual-time-budget=15000", "--user-data-dir=" + os.path.join(tmp, "profil"),
                        "--print-to-pdf=" + part, url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300,
                       creationflags=NOWIN)
        if not os.path.exists(part) or not os.path.getsize(part):
            raise RuntimeError("tarayıcı PDF üretmedi")
        shutil.move(part, os.path.join(d, fn))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return fn


def start_job(name, kind, target, *args):
    with LOCK:
        if JOBS.get(name, {}).get("state") == "running":
            raise RuntimeError("Bu projede bir işlem zaten çalışıyor")
        JOBS[name] = {"state": "running", "kind": kind, "log": [], "step": "Başlıyor", "t0": time.time()}
    threading.Thread(target=target, args=(name,) + args, daemon=True).start()


# ---------------------------------------------------------------- HTTP
class H(BaseHTTPRequestHandler):
    server_version = "LayoutX/2.0"

    def log_message(self, fmt, *a):
        if a and "/api/status" in str(a[0]):
            return
        log("%s - %s" % (self.address_string(), fmt % a))

    def send_json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def send_file(self, path, download=None):
        if not os.path.isfile(path):
            return self.send_json({"error": "bulunamadı"}, 404)
        ext = os.path.splitext(path)[1].lower()
        size = os.path.getsize(path)
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "no-store")
        if download:
            self.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(download))
        self.end_headers()
        with open(path, "rb") as f:
            shutil.copyfileobj(f, self.wfile, 1 << 20)

    def read_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def q(self):
        u = urllib.parse.urlparse(self.path)
        return u.path, dict(urllib.parse.parse_qsl(u.query))

    def static(self, base, rel):
        p = os.path.normpath(os.path.join(base, *[urllib.parse.unquote(x) for x in rel.split("/") if x]))
        if not p.startswith(os.path.normpath(base) + os.sep):
            return self.send_json({"error": "izin yok"}, 403)
        return self.send_file(p)

    def guard(self, fn):
        # canlılık: yalnız uygulama sayfasının API istekleri (tarayıcının kendi sorguları, ör. /sw.js, sayılmaz)
        rp = urllib.parse.urlparse(self.path).path
        if rp.startswith("/api/") and rp != "/api/bye":
            LAST_SEEN[0] = time.time()
        try:
            return fn()
        except (ConnectionError, BrokenPipeError):   # tarayıcı isteği yarıda bıraktı (indirme iptali vb.): yanıt verilecek kimse yok
            self.close_connection = True
            return None
        except (ValueError, RuntimeError, KeyError, layout_db.GitHubError) as e:
            return self.send_json({"error": str(e)}, 400)
        except Exception as e:   # beklenmeyen hata: istemciye anlaşılır mesaj
            return self.send_json({"error": f"{type(e).__name__}: {e}"}, 500)

    # ---- GET
    def do_GET(self):
        self.guard(self._get)

    def _get(self):
        path, qs = self.q()
        if path in ("/", "/index.html"):
            return self.send_file(os.path.join(ROOT, "index.html"))
        if path in ("/sw.js", "/manifest.webmanifest"):     # PWA: kök kapsamı için kökten sunulur
            return self.send_file(os.path.join(ROOT, path[1:]))
        if path.startswith("/tools/") and path.endswith(".json"):
            return self.static(TOOLS, path[7:])
        if path.startswith("/app/"):
            return self.static(APPDIR, path[5:])
        if path.startswith("/belge/"):
            return self.static(BELGE, path[7:])
        if path.startswith("/files/"):
            parts = [urllib.parse.unquote(x) for x in path[7:].split("/") if x]
            p = os.path.normpath(os.path.join(PROJECTS, *parts)) if parts else PROJECTS
            if not parts or "_work" in parts or not p.startswith(os.path.normpath(PROJECTS) + os.sep):
                return self.send_json({"error": "izin yok"}, 403)
            return self.send_file(p, download=parts[-1] if qs.get("dl") == "1" else None)
        if path == "/api/ping":
            return self.send_json({"app": APP_ID, "ok": True, "jobs": sum(1 for j in JOBS.values() if j.get("state") == "running"),
                                   "db": DB.status() if DB else None})
        if path == "/api/db":
            return self.send_json(DB.status())
        if path == "/api/projects":
            return self.send_json(list_projects())
        if path == "/api/project":
            r = project_detail(qs.get("name", ""))
            return self.send_json(r) if r else self.send_json({"error": "proje yok"}, 404)
        if path == "/api/status":
            return self.send_json(JOBS.get(qs.get("name", ""), {"state": "idle", "log": [], "step": ""}))
        if path == "/api/template":
            return self.send_json(load_json(TEMPLATE))
        if path == "/api/settings":
            return self.send_json(settings())
        return self.send_json({"error": "yok"}, 404)

    # ---- PUT (dosya yükleme / şablon / ayarlar)
    def do_PUT(self):
        self.guard(self._put)

    def _put(self):
        path, qs = self.q()
        if path == "/api/upload":
            name = qs.get("name", "")
            kind = qs.get("kind", "step")
            fn = safe_name(os.path.basename(qs.get("filename", "")))
            d = proj_dir(name)
            if not find_veri(d):
                return self.send_json({"error": "proje yok"}, 404)
            low = fn.lower()
            if kind == "step" and not low.endswith((".step", ".stp")):
                return self.send_json({"error": ".STEP / .STP dosyası seçin"}, 400)
            if kind == "pdf" and not low.endswith(".pdf"):
                return self.send_json({"error": "PDF dosyası seçin"}, 400)
            n = int(self.headers.get("Content-Length") or 0)
            tmp = os.path.join(d, fn + ".tmp")
            got = 0
            with open(tmp, "wb") as f:
                while got < n:
                    chunk = self.rfile.read(min(1 << 20, n - got))
                    if not chunk:
                        break
                    f.write(chunk)
                    got += len(chunk)
            if got < n:
                os.remove(tmp)
                return self.send_json({"error": "yükleme yarım kaldı"}, 400)
            if kind == "step":
                for old in find_steps(d):
                    os.remove(old)
                shutil.rmtree(os.path.join(d, "_work"), ignore_errors=True)
                with SAVE_LOCK:
                    veri = find_veri(d)
                    data = load_json(veri)
                    data["makine"]["kaynak_step"] = fn
                    save_json(veri, data)
            os.replace(tmp, os.path.join(d, fn))
            db_touch()
            return self.send_json({"ok": True, "name": fn, "bytes": got})
        if path == "/api/template":
            save_json(TEMPLATE, json.loads(self.read_body().decode("utf-8")))
            db_touch()
            return self.send_json({"ok": True})
        if path == "/api/settings":
            s = settings()
            req = json.loads(self.read_body().decode("utf-8") or "{}")
            if req.get("kapakTasarimi") in DESIGNS:
                s["kapakTasarimi"] = req["kapakTasarimi"]
            save_json(SETTINGS, s)
            db_touch()
            return self.send_json(s)
        return self.send_json({"error": "yok"}, 404)

    # ---- POST
    def do_POST(self):
        self.guard(self._post)

    def _post(self):
        path, qs = self.q()
        body = self.read_body()
        req = json.loads(body.decode("utf-8")) if body else {}
        name = req.get("name", "")
        if path == "/api/bye":
            BYE_AT[0] = time.time()
            return self.send_json({"ok": True})
        if path == "/api/db/connect":
            return self.send_json(DB.connect(req.get("repo", ""), req.get("token", "")))
        if path == "/api/db/sync":
            DB.trigger(0)
            return self.send_json(DB.status())
        if path == "/api/db/disconnect":
            return self.send_json(DB.disconnect())
        if path == "/api/create":
            n = create_project(req)
            db_touch()
            return self.send_json({"ok": True, "name": n})
        if path == "/api/save":
            d = proj_dir(name)
            veri = find_veri(d)
            if not veri:
                return self.send_json({"error": "proje yok"}, 404)
            if not isinstance(req.get("data"), dict) or "makine" not in req["data"] or "geometri" not in req["data"]:
                return self.send_json({"error": "veri eksik"}, 400)
            copy = None
            with SAVE_LOCK:
                # Bu sayfa açıkken dosya başka yerden (depodan, başka bilgisayardan) değiştiyse o sürüm kaybolmaz:
                # sayfadaki (yeni) sürüm asıl dosya olur, diskteki yanına .catisma-<tarih> olarak saklanır
                base = req.get("base")
                now = mtime(veri)
                if isinstance(base, (int, float)) and base > 0 and now > base + 0.002:
                    copy = veri + ".catisma-" + layout_db.stamp(now)
                    shutil.copy2(veri, copy)
                save_json(veri, req["data"])
            db_touch()
            return self.send_json({"ok": True, "mtime": mtime(veri), "conflict": os.path.basename(copy) if copy else None})
        if path == "/api/pipeline":
            d = proj_dir(name)
            if not find_veri(d):
                return self.send_json({"error": "proje yok"}, 404)
            if not find_step(d):
                return self.send_json({"error": "Önce STEP dosyası yükleyin"}, 400)
            start_job(name, "pipeline", run_pipeline, req)
            return self.send_json({"ok": True})
        if path == "/api/print":
            langs = [l for l in ("tr", "en", "de") if l in (req.get("langs") or [])]
            if not langs or not isinstance(req.get("html"), str):
                return self.send_json({"error": "En az bir dil seçin"}, 400)
            secs = req.get("secs")
            secs = [str(x) for x in secs] if isinstance(secs, list) else None
            fn = print_html(name, req["html"], req.get("file") or "Layout.pdf", langs, secs, req.get("cover") is not False)
            return self.send_json({"ok": True, "file": fn, "url": files_url(os.path.basename(proj_dir(name)), fn)})
        if path == "/api/savefile":
            d = proj_dir(name)
            if not find_veri(d) or not isinstance(req.get("text"), str):
                return self.send_json({"error": "proje yok"}, 404)
            fn = safe_file(req.get("file"), (".html",))
            with open(os.path.join(d, fn), "w", encoding="utf-8") as f:
                f.write(req["text"])
            return self.send_json({"ok": True, "file": fn, "url": files_url(os.path.basename(d), fn)})
        if path == "/api/open":
            d = proj_dir(name)
            rel = req.get("file", "")
            p = os.path.normpath(os.path.join(d, *[x for x in rel.split("/") if x])) if rel else d
            if (p == d or p.startswith(d + os.sep)) and os.path.exists(p):
                os.startfile(p)
                return self.send_json({"ok": True})
            return self.send_json({"error": "dosya yok"}, 404)
        return self.send_json({"error": "yok"}, 404)


# ---------------------------------------------------------------- günlük, başlatıcı, kurulum
LOG_FILE = None


def log(msg):
    """Konsolda ekrana, pythonw (konsolsuz) kipinde %LOCALAPPDATA%/LayoutX/layout.log dosyasına yazar."""
    line = time.strftime("%H:%M:%S ") + str(msg)
    try:
        if LOG_FILE:
            LOG_FILE.write(line + "\n")
            LOG_FILE.flush()
        elif sys.stderr:
            sys.stderr.write(line + "\n")
    except Exception:
        pass


def ping(timeout=0.6):
    """Bu bilgisayarda Layout sunucusu zaten çalışıyor mu?"""
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/ping", timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8")).get("app") == APP_ID
    except Exception:
        return False


def find_app_browser():
    """Uygulama penceresi için Edge (Windows 11'de her zaman var), yoksa Chrome."""
    for b in (r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
              os.environ.get("CHROME_PATH"), r"C:\Program Files\Google\Chrome\Application\chrome.exe",
              r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe", shutil.which("msedge"), shutil.which("chrome")):
        if b and os.path.exists(b):
            return b
    return None


def open_app_window(url):
    """Adres çubuksuz uygulama penceresi (HTML gibi hafif uygulama); kendi tarayıcı profiliyle açılır."""
    b = find_app_browser()
    if not b:
        webbrowser.open(url)
        return None
    prof = os.path.join(LOCALAPP, "pencere")
    os.makedirs(prof, exist_ok=True)
    return subprocess.Popen([b, f"--app={url}", f"--user-data-dir={prof}", "--no-first-run", "--no-default-browser-check",
                             "--disable-features=Translate", "--window-size=1680,1020", "--window-position=40,20"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def jobs_running():
    return any(j.get("state") == "running" for j in JOBS.values())


def make_server():
    os.chdir(ROOT)
    os.makedirs(PROJECTS, exist_ok=True)
    return ThreadingHTTPServer(("127.0.0.1", PORT), H)


BYE_AT = [0.0]      # son "sayfa kapandı" sinyali (uygulama sayfası kapanırken /api/bye)
BYE_WAIT = 40       # bu sürede başka pencere / sekme kendini bildirmezse kapanır (uygulama her 30 sn'de bir haber verir)


def idle_watchdog(srv, limit):
    """Arka plan kipinde: uygulama penceresi / sekmesi kapanınca (ya da limit sn hiç istek gelmezse) iş sürmüyorsa kapanır."""
    while True:
        time.sleep(2)
        if jobs_running():
            continue
        now = time.time()
        closed = BYE_AT[0] and LAST_SEEN[0] <= BYE_AT[0] + 0.5 and now - BYE_AT[0] > BYE_WAIT
        if closed or now - LAST_SEEN[0] > limit:
            log("Pencere kapandı, kapanıyor" if closed else "Boşta kaldı, kapanıyor")
            srv.shutdown()
            return


def pythonw():
    w = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    return w if os.path.exists(w) else sys.executable


def install(quiet=False):
    """layoutx:// bağlantısı (app/baslat.html'deki Başlat düğmesi) + masaüstü ve Başlat menüsü simgesi. Yönetici izni gerekmez."""
    import winreg
    script = os.path.abspath(__file__)
    icon = os.path.join(APPDIR, "icon.ico")
    cmd = f'"{pythonw()}" "{script}" --protocol "%1"'
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Classes\layoutx") as k:
        winreg.SetValueEx(k, None, 0, winreg.REG_SZ, "URL:Layout Çizim Motoru")
        winreg.SetValueEx(k, "URL Protocol", 0, winreg.REG_SZ, "")
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Classes\layoutx\DefaultIcon") as k:
        winreg.SetValueEx(k, None, 0, winreg.REG_SZ, icon)
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Classes\layoutx\shell\open\command") as k:
        winreg.SetValueEx(k, None, 0, winreg.REG_SZ, cmd)
    ps = ("$s = New-Object -ComObject WScript.Shell; "
          "foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'), $env:LAYOUT_ROOT)) { "
          "  $l = $s.CreateShortcut((Join-Path $dir $env:LAYOUT_LNK)); "
          "  $l.TargetPath = $env:LAYOUT_PYW; $l.Arguments = ('\"' + $env:LAYOUT_SCRIPT + '\" --app'); "
          "  $l.WorkingDirectory = $env:LAYOUT_ROOT; $l.IconLocation = ($env:LAYOUT_ICON + ',0'); "
          "  $l.Description = $env:LAYOUT_DESC; $l.Save() }")
    env = dict(os.environ, LAYOUT_PYW=pythonw(), LAYOUT_SCRIPT=script, LAYOUT_ROOT=ROOT, LAYOUT_ICON=icon,
               LAYOUT_LNK="Layout Çizim Motoru.lnk", LAYOUT_DESC="Layout Çizim Motoru – yerleşim planı (STEP → A3 pafta, TR / EN / DE)")
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], env=env,
                       capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=NOWIN)
    if r.returncode:
        raise RuntimeError("Kısayol oluşturulamadı: " + (r.stderr or r.stdout).strip())
    if not quiet:
        print("Kuruldu: masaüstü ve Başlat menüsünde 'Layout Çizim Motoru' simgesi, layoutx:// bağlantısı.")


def uninstall():
    import winreg
    for sub in (r"Software\Classes\layoutx\shell\open\command", r"Software\Classes\layoutx\shell\open", r"Software\Classes\layoutx\shell",
                r"Software\Classes\layoutx\DefaultIcon", r"Software\Classes\layoutx"):
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, sub)
        except OSError:
            pass
    ps = ("foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'), $env:LAYOUT_ROOT)) { "
          "  $p = Join-Path $dir $env:LAYOUT_LNK; if (Test-Path $p) { Remove-Item $p } }")
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], env=dict(os.environ, LAYOUT_ROOT=ROOT, LAYOUT_LNK="Layout Çizim Motoru.lnk"),
                   capture_output=True)
    print("Kaldırıldı: simgeler ve layoutx:// bağlantısı (proje dosyalarına dokunulmadı).")


def db_start():
    """Veritabanı eşitlemesini başlatır (depo bağlıysa açılışta depodan alır, değişiklikleri gönderir)."""
    global DB
    if DB is None:
        DB = layout_db.Database(ROOT, os.path.join(LOCALAPP, "veritabani.json"), log=log, file_lock=SAVE_LOCK)
    DB.start()


def db_touch():
    if DB is not None:
        DB.trigger()


def main():
    global LOG_FILE
    args = sys.argv[1:]
    url = f"http://127.0.0.1:{PORT}/"
    if "--install" in args:
        return install()
    if "--uninstall" in args:
        return uninstall()
    background = "--app" in args or "--protocol" in args or "--serve" in args
    if background and (sys.stderr is None or not hasattr(sys.stderr, "write")):   # pythonw: konsol yok, günlük dosyaya
        os.makedirs(LOCALAPP, exist_ok=True)
        LOG_FILE = open(os.path.join(LOCALAPP, "layout.log"), "a", encoding="utf-8")
        sys.stdout = sys.stderr = LOG_FILE
    want_window = "--app" in args or any(a.lower().startswith("layoutx://app") for a in args)
    if ping():                            # zaten çalışıyor: yalnız pencere / sekme açılır
        log("Sunucu zaten çalışıyor")
        if want_window:
            open_app_window(url)
        elif not background:
            webbrowser.open(url)
        return
    try:
        srv = make_server()
    except OSError as e:
        log(f"{PORT} numaralı kapı kullanılıyor: {e}")
        if not background:
            print(f"Kapı {PORT} başka bir program tarafından kullanılıyor (LAYOUT_PORT ortam değişkeniyle değiştirilebilir).")
        return
    log(f"Layout Çizim Motoru: {url}")
    db_start()
    if not background:
        print("Layout Çizim Motoru:", url, "(kapatmak için Ctrl+C)")
        if "--no-browser" not in args:
            threading.Timer(0.8, lambda: webbrowser.open(url)).start()
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass
        return
    # Pencere kipinde 150 sn, sekme kipinde IDLE_LIMIT boyunca hiç istek yoksa da kapanır (sayfa her 30 sn'de bir haber verir)
    threading.Thread(target=idle_watchdog, args=(srv, 150 if want_window else IDLE_LIMIT), daemon=True).start()
    if want_window:
        threading.Timer(0.3, lambda: open_app_window(url)).start()
    srv.serve_forever()
    srv.server_close()


if __name__ == "__main__":
    main()
