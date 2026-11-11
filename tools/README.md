# STEP -> layout araç zinciri

Pafta standardı (arayüz, bölüm sırası, işaret harfleri, elektrik standardı, yazım kuralları):
[../LAYOUT-KURALLARI.md](../LAYOUT-KURALLARI.md). Claude Code'da "layout" istendiğinde ya da `/layout` yazıldığında
`.claude/skills/layout` bu kuralları yükler.

## Uygulama: Layout Çizim Motoru

Arayüz P&PX (P&ID / pnömatik) programlarıyla aynıdır: koyu zemin, kırmızı antet çizgisi, aynı kapak stüdyosu, aynı
antet ve başlık bloğu. Yalnızca bu bilgisayarda çalışır (http://127.0.0.1:8765).

### Başlatma

| Yol | Ne olur |
|---|---|
| **İlk kez:** `Kurulum.bat` (çift tık) | Masaüstü ve Başlat menüsüne **Layout Çizim Motoru** simgesi, `layoutx://` başlatma bağlantısı (yalnız bu kullanıcı, yönetici izni yok). Kaldırma: `python layout_app.py --uninstall` |
| Masaüstü simgesi | Hafif uygulama: kendi penceresinde (adres çubuksuz) açılır; pencere kapanınca, süren iş bitince kendini kapatır |
| `Layout.html` (çift tık) | Tarayıcıda başlatma sayfası: uygulama çalışıyorsa doğrudan açar; değilse **Uygulamayı başlat** (arka planda başlatıp bu sekmede açar) ya da **Ayrı pencerede aç** |
| `Layout.bat` | Konsollu başlatma (günlük ekranda; sorun ararken) |

`app/index.html` dosyadan açılırsa `Layout.html`'e yönlenir. Arka plandan başlatılan sunucu 15 dakika hiç istek gelmezse
(iş sürmüyorsa) kendini kapatır; günlük `%LOCALAPPDATA%\LayoutX\layout.log`. Simge: `app/icon.ico` (`python tools/make_icon.py`).

### Dil

- **Program dili** (ana ekranın sağ üstü ve alt çubuk): arayüzün tamamı TR / EN / DE. Sözlük `tools/i18n-dict.tsv`
  (Türkçe metin ⇥ English ⇥ Deutsch) → `python tools/build_i18n.py` → `app/i18n-dict.js`. Kodda metinler `t_('…')`.
- **Belge dili** (üst çubuk): önizlemenin, kapağın ve PDF'in dili; program dilinden bağımsızdır.

### Veritabanı (GitHub deposu)

Ana ekranın **Veritabanı** sekmesi: özel bir GitHub deposu (`kullanici/layoutx-veri`) veritabanı olur; P&PX'teki yapının
aynısı (`layout_db.py`). Depo + erişim anahtarı (fine-grained, yalnız bu depo, Contents: Read and write) girilip
**Bağlan** denir; herkese açık depoya bağlanılmaz. Anahtar yalnız bu bilgisayarda, `%LOCALAPPDATA%\LayoutX\veritabani.json`
içinde durur (depoya, proje klasörüne ve tarayıcıya gitmez).

- Depoda dosyalar programdaki gibi durur: `projects/<proje>/…` (veri JSON, `views/`, `views_cfg.json`,
  `step-structure.json`, imalat resmi PDF'leri), `tools/sablon-layout-veri.json`, `tools/ayarlar.json`.
  Girmeyenler: STEP, `_work/`, indirilen `…-Layout….pdf/html` çıktıları, 50 MB üstü dosyalar.
- Kayıt önce proje klasörüne yazılır; değişenler birkaç saniye içinde ve dakikada bir **tek commit** olarak gönderilir,
  depodaki yenilikler aynı anda alınır (açık proje kendiliğinden yenilenir). Dal başı yalnız ileri güncellenir; başka
  bilgisayar arada gönderdiyse yeniden alınıp birleştirilir. Alt çubukta durum (☁), tıklayınca hemen eşitler.
- İki bilgisayarda aynı dosya değişirse yeni olan asıl dosya olur, eskisi `<dosya>.catisma-<tarih>` olarak saklanır;
  silme ile düzenleme karşılaşırsa düzenleme kalır. Eski sürümler GitHub commit geçmişindedir.
- İnternet yoksa ya da GitHub hız sınırına takılırsa değişiklikler bilgisayarda bekler, sonra kendiliğinden gider.
- Başka bilgisayarda: LAYOUT program klasörünü kopyalayın, aynı depo ve anahtarla bağlanın; projeler (görünümleriyle)
  gelir. STEP gelmez; görünümleri yeniden üretmek gerekirse STEP o bilgisayara yüklenir.
- Test: `python tools/test_layout_db.py` (sahte GitHub sunucusuyla, gerçek depoya dokunmaz).

### İndir: PDF ya da HTML

Önizleme her değişiklikte kendiliğinden tazelenir; ayrıca pafta üretmek gerekmez. Üst çubuktaki **İndir (PDF / HTML)**
(Ctrl+P): biçim (PDF / HTML), diller (bir ya da birkaç) ve bölümler (kapak dahil) seçilir. Birden çok dil seçilirse
her dil kapağıyla TR → EN → DE sırasıyla **tek dosyada** arka arkaya gelir. Dosya proje klasörüne de kaydedilir
(`<dosya_adi>-TR-EN.pdf` / `.html`; bölüm seçildiyse `…-secim`).

- **PDF:** headless Chrome/Edge ile A3 yatay, vektörel. **Tarayıcıda yazdır** sunucusuz çalışır (Hedef: "PDF olarak kaydet").
- **HTML:** tek dosya, internet ve program gerekmez; içindeki **Yazdır** düğmesiyle PDF de alınır.
- Komut satırı: `python tools/build_layout.py "projects/<proje>" --no-pdf --out=x.html --langs=tr,en [--secs=ust,on] [--cover=0]`.

- **Ana ekran:** `projects/` altındaki projeler kart olarak listelenir (seri no, model, müşteri; STEP, görünümler,
  pafta durumu, PDF sayısı ve eksik sayısı). Arama kutusu seri no / müşteri / model içinde arar.
- **+ Yeni Proje:** kapak bilgileri (proje no, müşteri, model, tip, marka, hazırlayan, kontrol, onay, tarih, rev) girilir;
  klasör `projects/<seri no>-<MÜŞTERİ>-<MODEL>` olarak açılır. Başlangıç verisi şablon ya da başka bir projenin kopyası
  olabilir (kopyada metinler ve tablolar gelir, bağlantı noktaları yeni makinenin kutusuna oranlanır). STEP seçilirse
  boru hattı (STEP okuma, üçgenleme, VTK görünümler, geometri, önizleme) hemen başlar, günlük ekranda akar.
- **Çalışma ekranı:** solda **Bölümler** (belgedeki sırayla; her satırda eksik / uyarı sayısı) ve **Dosyalar**; ortada
  belgenin canlı önizlemesi (kapak + antetli A3 sayfalar; bölüme tıklayınca o sayfaya gider) ya da **Nokta yerleştirme**
  (noktayı seçip üst görünüme tıkla: x–y, ön görünüme tıkla: x–z); sağda **Düzenle** (seçili bölümün alanları, TR/EN/DE
  alt alta) ve **Eksikler** (LAYOUT-KURALLARI §6, §8, §9 denetimi; maddeye tıklayınca ilgili alana gider).
- **Kayıt:** her değişiklik otomatik kaydedilir (Ctrl+S hemen yazar), önizleme kendiliğinden tazelenir. Geri al / yinele:
  Ctrl+Z / Ctrl+Y. Kayıt başarısız olursa 15 sn'de bir yeniden denenir.
- **Kapak:** üst çubuktaki Kapak düğmesi P&PX'teki kapak stüdyosunu açar: bilgiler üstteki kutulardan değişir, üç
  tasarımdan (Kırmızı Bant, Üst Bant, Köşe Blok) biri seçilir. Seçim `tools/ayarlar.json`'a yazılır, tüm projelerde geçerlidir.
- **Belge dili:** TR / EN / DE düğmeleri önizlemenin ve kapağın dilini değiştirir.
- **Görünümler:** eksen seçimi yanlışsa ya da STEP değiştiyse yeniden üretir (STEP yeniden okunmaz, `_work/` kullanılır;
  elle eklenen `detay_*` görünümleri korunur).
- **İmzalar:** yeni projelerde Hazırlayan *Fatih GÜRAL*, Kontrol ve Onay *Furkan BIÇAK*, Rev *00* kendiliğinden gelir
  (şablondan; Şablon sekmesinden değiştirilebilir).
- **Şablon** sekmesi: `tools/sablon-layout-veri.json` (yeni projelerin başlangıç değerleri, ÇNK standardı; `rel` =
  makine kutusuna göre 0–1 oranı, `{L} {W} {H}` yer tutucuları ölçülerle doldurulur; standart elektrik metinlerindeki
  `{A}` (ana şalter), `{kesit}` (kablo kesiti) ve `{V}` (gerilim) paftada değerleriyle yazılır).
- Doğrudan bağlantı: `?p=<proje>&s=<bölüm>&tab=edit|checks&mode=picker&studio=1`, `?new=1`, `?sablon=1`.
- Proje klasöründe `_work/` (model.brep, tris.npy, structure.json, onizleme.html) ara dosyalardır; yer açmak için
  silinebilir (silinirse bir sonraki çalıştırmada STEP yeniden okunur).

### Dosyalar

| Yol | İçerik |
|---|---|
| `Layout.html` · `Kurulum.bat` · `Layout.bat` | Başlatma sayfası · simge ve bağlantı kurulumu · konsollu başlatma |
| `layout_app.py` | Yerel sunucu: projeler, kayıt, boru hattı, önizleme, pafta ve PDF; `--app`, `--protocol`, `--install`, `--uninstall` |
| `app/` | Arayüz (`index.html`, `app.css`, `app.js`, `sections.js` bölümler, `form.js` alanlar, `checks.js` eksikler, `studio.js` kapak, `i18n.js` + `i18n-dict.js` program dili, `icon.png` / `icon.ico`) |
| `tools/belge/` | Belge çalışma zamanı (`belge.js`: kapak, antet, başlık bloğu, sayfa dizgisi, PDF; `belge.css`), logolar, yazı tipleri (OFL) |
| `tools/ayarlar.json` | Kapak tasarımı (tüm projeler) |
| `projects/` | Projeler |

## Komut satırı (aynı işin elle yapılışı)

Klasör yapısı: `LAYOUT/projects/<MAKİNE>/` içinde `<makine>.STEP`, `*-layout-veri.json`, `views/`, `step-structure.json`, `<Model>-Layout.html`.
Betikler ortaktır (`LAYOUT/tools/`). Komutlar `LAYOUT/` klasöründen:

1. `python tools/read_step.py "projects/<MAKİNE>/<dosya>.STEP" <gecici_klasor>`
   STEP okur (OCP/OpenCASCADE), `structure.json` (montaj ağacı + bbox) ve `model.brep` yazar. 413 MB için ~12 dk, 97 MB için ~3 dk.
2. `python tools/mesh_model.py <gecici>/model.brep <gecici> 25 2.0`
   Köşegeni < 25 mm olan katıları (cıvata vb.) eler, 2 mm sapma ile üçgenler -> `tris.npy` (~1 dk).
3. `python tools/render_views_vtk.py <gecici>/tris.npy "projects/<MAKİNE>/views" tools/views_cfg_<makine>.json`
   VTK ile gölgeli + kenar çizgili (feature edge + siluet) üst/ön/yan PNG, izometrik PNG ve `views_meta.json`.
   Eksen eşlemesi cfg içindeki R matrisleridir (satırlar: ekran-x, ekran-y, bakana doğru eksen; dünya
   koordinatlarında); izometrik görünüm `"dir"` (bakana doğru dünya vektörü) ile tanımlanır.
   Mevcut cfg'ler: `views_cfg_kbn.json` (KBN 2B 1650), `views_cfg_ult.json` (ULT M200 3B L).
   `render_views.py` eski matplotlib sürümüdür (kenar çizgisiz, yedek).
4. `python tools/build_layout.py "projects/<MAKİNE>" [artifact_parcasi.html] [--no-pdf] [--out=<yol.html>]`
   `*-layout-veri.json` + `views/` -> `<dosya_adi>.html` (tek dosya: kapak + antetli A3 yatay sayfalar, TR/EN/DE). İkinci argüman verilirse
   claude.ai artifact için doctype'sız gövde parçasını da yazar.

Veri JSON'daki `geometri` bloğu görünüm koordinatlarında yazılır: `origin` = sol-ön-alt köşe, `boy/en/yukseklik`,
`servis_alani`, `noktalar` (E/P/W/D/X bağlantı işaretleri), ek ölçü çizgileri ve etiketler.

İsteğe bağlı ekler (yoksa paftada çıkmaz):
- **Arka görünüm:** `views_cfg.json` içinde `"rear"` görünümü varsa pafta arka görünüm şeridi alır. Noktanın
  `gorunum` alanı `hepsi` ya da virgüllü liste (`on`, `yan`, `arka`); üst görünümde bütün noktalar çizilir.
  `ek_olculer_arka` (ekran koordinatı: arka görünümde x = −X), `etiketler_arka`, `ordinat_arka` (sol uçtan X ordinatları).
- **Yakın detay görünümleri:** cfg görünümüne `"crop": [x0, y0, x1, y1]` (görünüm ekran koordinatı, mm) ve yüksek
  `px_per_mm` verilir; `"dir"` ile eğik bakış da olur. `detaylar` listesindeki her kart: `gorunum` (görünüm adı),
  `etiketler` (x, y, z görünüm koordinatı + `dx`/`dy` etiket kaydırması, `mk` işaret harfi, `ok_z` kablo oku), `satirlar`.
- **Besleme kablosu bölümü:** `elektrik.kablo` (damar sayısı, kesit, uzunluklar, `sartlar`) → tek hat şeması, kablo
  kesiti (IEC 60445 renkleri) ve uzunluğa göre gerilim düşümü tablosu (`gerilim_v`, `cos_phi`, 70 °C Cu).
  `kablo.giris_kisa`: şemadaki makine panosu giriş yazısı (boşsa "Kablo girişi (E)").
- **Bağlantılar ön yüzdeyse** (ör. konveyörlü makineler): `geometri.ordinat_on` (sol uçtan X ordinatları ön
  görünümde, zeminin altında; L ölçüsü bu durumda görünümün üstüne geçer). `geometri.on_yazi`: üst görünümdeki ön taraf
  yazısı (boşsa "OPERATÖR / YÜKLEME TARAFI"; konveyörlü makinede yükleme uçtadır). `diger.yag_ayirici`: "Hava · su ·
  egzoz · tahliye" tablosunda yağ ayırıcı satırı (bağlantı harfleri S1 emiş, S2 dönüş).
- `geometri.arka_baslik`: arka görünüm başlığı (boşsa "Arka görünüm (servis tarafı)"). `makine.tam_ad` ve
  `makine.musteri` düz metin ya da üç dilli sözlük olabilir.
- Uygulama görünümleri yeniden üretirken cfg'deki ek görünümleri (rear, detay_*) korur.

**PDF indir düğmesi** (her paftada, başlıkta): TR/EN/DE onay kutuları → seçilen dillerin sayfaları (her dil kapağıyla)
tek PDF'te birleşip doğrudan iner (`<dosya_adi>-TR-DE.pdf` gibi; A3 yatay, vektör). Nasıl çalışır: `build_layout.py`
HTML'i yazar, aynı HTML'in yazdırma kipini (`#pdf-print=tr,en,de`) headless Chrome/Edge ile PDF'e basar, her dilin sayfa
aralığını ayrı baskılarla sayar ve PDF'i + `tools/vendor/pdf-lib.min.js`'i (MIT) HTML'e gömer; tarayıcıda pdf-lib seçilen
aralıkları tek `copyPages` çağrısıyla yeni PDF'e kopyalar. Derleme ~30 sn uzar. `--no-pdf` ile atlanır; gömülü PDF yoksa
düğme yazdırma penceresini açar. Tarayıcı yolu bulunamazsa `CHROME_PATH` ortam değişkeniyle verilir.

**Sayfa dizgisi** (`tools/belge/belge.js`): HTML'deki `#lb-src` bölümleri (`.lb-sec` > `.lb-part`; tür `full` tam
genişlik, `col` sütun, `table` / `list` satırlardan bölünür) açılışta ölçülür ve A3 yatay antetli sayfalara dağıtılır
(iki sütun 185 mm; sağ sütun ve tam genişlik öğeler başlık bloğunun üstünde biter; sığmayan bölünmez öğe ölçeklenir).
Dil değişince sayfalar yeniden dizilir. Ekranda sayfalar pencere genişliğine ölçeklenir; `?embed=1` başlık çubuğunu gizler
(uygulamadaki önizleme). `subprocess` ile Chrome çağrılırken çıktı yakalanmamalı (crashpad boruyu açık tutar).
