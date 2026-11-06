# LayoutX – Layout Çizim Motoru

STEP modelinden makine yerleşim planı (layout) üreten program: kapak + antetli A3 yatay sayfalar, TR / EN / DE,
PDF ya da HTML çıktı. Arayüz P&PX (P&ID / pnömatik) programlarıyla aynıdır.

## Başlatma

1. İlk kez: `Kurulum.bat` (masaüstü simgesi + `layoutx://` başlatma bağlantısı; yönetici izni gerekmez).
2. Masaüstündeki **Layout Çizim Motoru** simgesi ya da `Layout.html` (çift tık).
3. Ana ekranda **Veritabanı** sekmesinden özel `layoutx-veri` deposuna bağlanın; projeler oradan gelir.

Gereksinimler: Windows, Python 3.11 (numpy, OCP / OpenCASCADE, vtk), Edge ya da Chrome.

## Klasörler

| Yol | İçerik |
|---|---|
| `layout_app.py` | Yerel sunucu (http://127.0.0.1:8765) |
| `layout_db.py` | Veritabanı: GitHub deposuyla eşitleme |
| `app/` | Arayüz |
| `tools/` | STEP okuma, görünümler, belge üretici, belge çalışma zamanı (`tools/belge/`) |
| `projects/` | Projeler (programla gelmez; veritabanı deposundan eşitlenir) |

Ayrıntılar: [tools/README.md](tools/README.md) · pafta standardı: [LAYOUT-KURALLARI.md](LAYOUT-KURALLARI.md)

Test: `python tools/test_layout_db.py`
