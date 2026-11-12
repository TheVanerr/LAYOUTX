# LayoutX – Layout Çizim Motoru

STEP modelinden makine yerleşim planı (layout) üreten program: kapak + antetli A3 yatay sayfalar, TR / EN / DE,
PDF ya da HTML çıktı. Arayüz P&PX (P&ID / pnömatik) programlarıyla aynıdır.

## Başlatma

1. İlk kez: `Kurulum.bat` (masaüstü simgesi + `layoutx://` başlatma bağlantısı; yönetici izni gerekmez).
2. Masaüstündeki **Layout Çizim Motoru** simgesi ya da `index.html` (çift tık; dosyadan açılınca başlatma sayfasına, `app/baslat.html`, geçer).
3. Ana ekranda **Veritabanı** sekmesinden özel `layoutx-veri` deposuna bağlanın; projeler oradan gelir.

Gereksinimler: Windows, Python 3.11 (numpy, OCP / OpenCASCADE, vtk), Edge ya da Chrome.

## Web sürümü (PWA, GitHub Pages)

Adres: https://thevanerr.github.io/LAYOUTX/ · telefona ya da bilgisayara **Uygulamayı yükle** ile kurulur
(manifest kimliği `cnk-layoutx-cizim-motoru-3f7a2c91`).

- Kurulum (bir kez): depo **Settings → Pages → Build and deployment → Source: GitHub Actions** (önerilen:
  her `main` gönderiminde `.github/workflows/pages.yml` denetler, `tools/build_site.py` ile yalnız gereken dosyaları
  yayınlar). **Deploy from branch** (`main`, `/ (root)`) de çalışır: depo kökü sitenin kendisidir.
- Web sürümü sunucusuzdur: veriler tarayıcıda (IndexedDB) durur ve doğrudan GitHub API ile `layoutx-veri`
  deposuna eşitlenir. Erişim anahtarı yalnız o tarayıcıda saklanır; siteye ya da bu depoya hiçbir veri girmez.
- Kapak, metinler, önizleme, HTML indirme ve PDF (tarayıcının "PDF olarak kaydet"i) çalışır.
  STEP okuma ve görünüm üretme yalnız masaüstündedir; üretilen görünümler veritabanıyla web'e gelir.
- Yerelde deneme: `python tools/build_site.py _site` → `_site` klasörünü herhangi bir statik sunucuyla açın
  (`?web=1` masaüstü sunucusunda da web kipini zorlar).

## Klasörler

| Yol | İçerik |
|---|---|
| `layout_app.py` | Yerel sunucu (http://127.0.0.1:8765) |
| `layout_db.py` | Veritabanı: GitHub deposuyla eşitleme |
| `app/` | Arayüz (`web.js`: web kipi depolama + eşitleme, `baslat.html`: masaüstü başlatma sayfası, `icons/`) |
| `.github/workflows/pages.yml` | GitHub Pages yayını |
| `index.html` · `manifest.webmanifest` · `sw.js` | Uygulama sayfası (masaüstü ve web aynı) · PWA |
| `belge/` | Belge üretimi ve çalışma zamanı (`kaynak.js`, `belge.js`, `belge.css`), logolar, yazı tipleri |
| `tools/` | STEP okuma, görünümler, şablon, çeviri sözlüğü, site üretimi, test |
| `projects/` | Projeler (programla gelmez; veritabanı deposundan eşitlenir) |

Ayrıntılar: [tools/README.md](tools/README.md) · pafta standardı: [LAYOUT-KURALLARI.md](LAYOUT-KURALLARI.md)

Test: `python tools/test_layout_db.py`
