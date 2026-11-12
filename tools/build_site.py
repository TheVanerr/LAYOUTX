# -*- coding: utf-8 -*-
"""GitHub Pages sitesi (PWA, web kipi): uygulama arayüzü + belge çalışma zamanı + şablon -> _site/
Kullanım: python tools/build_site.py [_site] [--version=<sürüm>]   (GitHub Actions: .github/workflows/pages.yml)
Web kipinde sunucu yoktur: veriler tarayıcıda (IndexedDB) ve GitHub deposunda (layoutx-veri); STEP işleme masaüstündedir.
Proje verileri (projects/) siteye girmez."""
import os, re, sys, shutil, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
opts = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
OUT = os.path.abspath(args[0] if args else os.path.join(ROOT, "_site"))
VERSION = opts.get("version") or os.environ.get("GITHUB_SHA", "")[:12] or time.strftime("%Y%m%d%H%M%S")

if os.path.isdir(OUT):
    shutil.rmtree(OUT)
os.makedirs(OUT)
skip = shutil.ignore_patterns("__pycache__", "*.pyc", "*.tmp")
# Depo kökü zaten sitenin kendisidir (Pages "Deploy from branch" ile de çalışır); burada yalnız gereken dosyalar
# ayıklanır (Python araçları, belgeler siteye girmez) ve service worker'a sürüm yazılır.
shutil.copytree(os.path.join(ROOT, "app"), os.path.join(OUT, "app"), ignore=skip)
shutil.copytree(os.path.join(ROOT, "belge"), os.path.join(OUT, "belge"), ignore=skip)
os.makedirs(os.path.join(OUT, "tools"))
shutil.copy(os.path.join(ROOT, "tools", "sablon-layout-veri.json"), os.path.join(OUT, "tools", "sablon-layout-veri.json"))
shutil.copy(os.path.join(ROOT, "manifest.webmanifest"), os.path.join(OUT, "manifest.webmanifest"))

with open(os.path.join(ROOT, "sw.js"), encoding="utf-8") as f:
    sw = f.read().replace("__BUILD__", VERSION)
with open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8") as f:
    f.write(sw)

with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
    html = f.read()
html = html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n  <meta name="layoutx-mode" content="web">', 1)
html = re.sub(r"\s*<script>\s*// Dosyadan \(çift tıkla\).*?</script>", "", html, count=1, flags=re.S)   # masaüstü başlatıcısına yönlendirme yok
for bad in re.findall(r'(?:src|href)="(/[^"]*)"', html):
    sys.exit(f"index.html içinde mutlak yol var (Pages alt klasöründe çalışmaz): {bad}")
for css in ("app.css",):
    with open(os.path.join(ROOT, "app", css), encoding="utf-8") as f:
        for bad in re.findall(r"url\(\s*['\"]?(/[^'\")]*)", f.read()):
            sys.exit(f"app/{css} içinde mutlak yol var (Pages alt klasöründe çalışmaz): {bad}")
with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
    f.write(html)
shutil.copy(os.path.join(OUT, "index.html"), os.path.join(OUT, "404.html"))
open(os.path.join(OUT, ".nojekyll"), "w").close()

n = sum(len(fs) for _, _, fs in os.walk(OUT))
size = sum(os.path.getsize(os.path.join(d, x)) for d, _, fs in os.walk(OUT) for x in fs)
print(f"site: {OUT} · {n} dosya · {size / 1e6:.1f} MB · sürüm {VERSION}")
