# Layout kuralları – ÇNK yerleşim planı standardı

Her yeni yerleşim planı (layout) bu kurallarla üretilir. Referans pafta: **`0626051-TOMTA-ULT M200 3B L` (Rev C)** –
bölüm sırası ve veri yapısı bu paftadakiyle aynıdır. Kapak, antet ve başlık bloğu P&ID / pnömatik dokümanlarıyla
(P&PX) aynıdır. Uygulama: Layout Çizim Motoru (masaüstü simgesi, `Layout.html` ya da `python layout_app.py`; ilk kez `Kurulum.bat`). Komutlar ve araç zinciri: [tools/README.md](tools/README.md).

## 1. Klasör ve adlandırma

- Proje klasörü: `LAYOUT/projects/<seri no>-<MÜŞTERİ>-<MODEL>/` (müşteri adı Türkçe karaktersiz büyük harf, örn.
  `projects/0326067-MITAS-KBN 2B 1500`). Uygulamada "+ Yeni Proje" kapak bilgilerinden klasörü kendisi açar.
- Klasör içeriği:

| Dosya | İçerik |
|---|---|
| `*.STEP` | Kaynak model (git LFS) |
| `<proje>.pdf` | ÇNK imalat resmi (varsa) – ana ölçüler buradan alınır |
| `<proje-kısa>-layout-veri.json` | Paftanın tek veri kaynağı (TR/EN/DE metinler + geometri) |
| `views_cfg.json` | Görünüm eksenleri (R matrisleri) + yakın detay görünümleri |
| `views/` | VTK görünümleri (`view_*.png`) + `views_meta.json` |
| `step-structure.json` | Montaj ağacı + kutu ölçüleri |
| `<PROJE>-Layout-TR-EN.pdf` / `.html` | Uygulamadaki "İndir" çıktısı: seçilen diller arka arkaya tek dosya, kapak + antetli A3 yatay sayfalar |
| `<PROJE>-Layout-TR-EN.pdf` | Uygulamadaki "PDF İndir" çıktısı (seçilen diller, her dil kapağıyla) |
| `_work/` | Ara dosyalar (`model.brep`, `tris.npy`, `structure.json`, `onizleme.html`); silinebilir |

- `makine.dosya_adi` = `<seri no>-<MÜŞTERİ>-<MODEL>-Layout` (boşluklar tire).
- İlk yayın Rev **00**; her içerik değişikliğinde bir artar (01, 02 …). Tarih `gg.aa.yyyy`. Hazırlayan **Fatih GÜRAL**,
  Kontrol ve Onay **Furkan BIÇAK** (şablon varsayılanı).
- Kapak / antet alanları (`makine`): `seri_no`, `musteri`, `model`, `tam_ad`, `firma` (DOLFIN · ENVA · VICO · KSYSTEM;
  logo ve renk buna göre), `hazirlayan`, `kontrol`, `onay`, `tarih`, `rev`, `revizyonlar` ([{rev, tarih, aciklama, hazirlayan}];
  son dördü başlık bloğunun üstündeki tabloda).

## 2. Pafta arayüzü – sabit bölüm sırası

| # | Bölüm | İçerik |
|---|---|---|
| 1 | Kapak (A3 yatay) | P&PX kapak tasarımı (Kırmızı Bant / Üst Bant / Köşe Blok; seçim `tools/ayarlar.json`, tüm projelerde aynı): "YERLEŞİM PLANI", model, müşteri, tip; Proje no, Müşteri, Model, Belge türü, Ölçü birimi, Rev, Tarih, Sayfa sayısı; Hazırlayan / Kontrol / Onay kutuları; marka logosu ve firma |
| 2 | Üst görünüm (plan) – servis alanı ile | Tam genişlik. Makine dış çizgisi, taralı servis alanı, L ve W ölçüleri, servis mesafeleri, bütün bağlantı işaretleri, "OPERATÖR / YÜKLEME TARAFI" ve "ARKA – SERVİS" yazıları, bölge etiketleri |
| 3 | Ön görünüm (operatör tarafı) | Tam genişlik. L, H, zemin çizgisi, önemli kotlar (yükleme / kapı / masa yüksekliği) |
| 4 | Arka görünüm (servis tarafı) | Tam genişlik. L, arkadaki bağlantı işaretleri, sol uçtan X ordinatları, bağlantı yükseklik kotları, uç etiketleri |
| 5 | Yan görünüm (sağ) + 3D izometrik (ölçeksiz) | Yan yana. Yanda W, H ve ön/arka yazıları |
| 6 | Ölçüler · Elektrik bağlantısı · Hava · su · egzoz · tahliye | Üç tablo yan yana |
| 7 | Bağlantı noktaları | X / Y / Z, referans sol-ön-alt köşe (mm) + detay metni |
| 8 | Bağlantı detayları | Her bağlantı türü için kart: yakın görünüm + oklu açıklamalar + değer tablosu |
| 9 | Besleme kablosu ve koruma | Tek hat şeması, kablo kesiti (IEC 60445 renkleri), uzunluğa göre kesit / ΔU tablosu, müşteri tesisatında zorunlu olanlar |
| 10 | Yük listesi | Yalnızca elektrik şeması varsa |
| 11 | Notlar | Ölçü notu, servis alanı + terazileme, bağlantıların yeri ve X referansı |
| 12 | Antet + başlık bloğu (her sayfada) | Üstte marka ve model, kırmızı çizgiler, altta firma ve sayfa no; ISO 5457 bölge çerçevesi; ISO 7200 başlık bloğu: Çizim adı (sayfadaki bölümler), Proje no, Müşteri, Model, Hazırlayan, Kontrol, Onay, Tarih, Belge türü, Ölçü birimi (mm), Ölçek, Rev, Sayfa n / N |

Belge A3 yatay basılır; bölümler sayfalara kendiliğinden dizilir (`tools/belge/belge.js`): görünümler tam genişlik,
tablolar iki sütun hâlinde akar, uzun tablolar "(devam)" diye sonraki sütuna / sayfaya geçer, sağ sütun başlık bloğunun
üstünde biter. Görsel dil (Calibri / Carlito ve Segoe UI / Selawik yazı tipleri, mavi ölçü çizgileri, turuncu bağlantı
işaretleri, marka rengi antet) `tools/belge/` ve `tools/build_layout.py` içinde sabittir; proje başına değiştirilmez.

## 3. Görünümler

- Eksenler `views_cfg.json` içinde R matrisleriyle verilir. `u` = yukarı, `f` = operatör tarafı (bakana doğru), `r = u × f`:
  `top [r, −f, u]`, `front [r, u, f]`, `side [−f, u, r]`, `rear [−r, u, −f]`, izometrik `dir = f + r + 0,85·u`.
- Görünüm koordinatları: x sağa (boy), y arkaya (en; küçük y = operatör tarafı), z yukarı. `origin` = sol-ön-alt köşe.
- Ön görünüm her zaman operatör / yükleme tarafıdır; yan görünüm sağ uçtan bakıştır; arka görünümde sol uç resmin sağındadır.
- Çözünürlük: ana görünümler 0,5 px/mm, izometrik 0,4 px/mm, `supersample 2`, `line_width 1.3`, `feature_angle 35`.
- Yakın detay görünümü: `detay_<tür>` adıyla (`detay_elektrik`, `detay_hava`, `detay_su`, `detay_tahliye`, `detay_egzoz`),
  `crop` + 0,8–2,4 px/mm; eğik bakış için `dir`.

## 4. Bağlantı işaretleri ve detay kartları

| Harf | Bağlantı |
|---|---|
| E | Elektrik besleme girişi (kablo giriş deliği) |
| P | Basınçlı hava girişi |
| W | Su girişi |
| D (D1…Dn) | Tahliye çıkışları |
| X | Egzoz / buhar çıkışı |
| B | Fan / ısıtıcı grubu (gerekirse) |

- Üst görünümde bütün işaretler çizilir; ön / yan / arka görünümde noktanın `gorunum` listesine göre.
- Bağlantılar bir yüzde toplanıyorsa o görünümde uçtan X ordinatları ve zeminden yükseklik kotları verilir.
- Her bağlantı türünün kartında en az şu satırlar bulunur: bağlantı ölçüsü / tipi, konum (uçtan ve zeminden mm),
  basınç ya da değer, müşterinin bağlantı şekli.

## 5. Elektrik standardı

Kullanıcı başka değer vermedikçe:

- Besleme 3~ 380 V AC, 50 Hz – 3P + N + PE; hesap gerilimi 380 V, cos φ 0,85.
- Toplam güç (kW) ve ana şalter (A) kullanıcıdan alınır.
- Müşteri panosu: 1 × `<A>` A sigorta, 3 kutuplu + 1 × `<A>` A / 30 mA kaçak akım koruma rölesi, 4 kutuplu.
  Röle tipi ve marka yazılmaz.
- Topraklama: nötrden ayrı ve yalıtılmış PE hattı zorunlu (TN-S), TS HD 60364-5-54 ve Elektrik Tesislerinde
  Topraklamalar Yönetmeliği.
- Besleme kablosu bölümü her paftada bulunur: 5 damar, 5 / 10 / 15 / 20 m için kesit ve gerilim düşümü (70 °C Cu,
  ρ = 0,0225 Ω·mm²/m); kesit sigortaya göre seçilir (63 A → 16 mm²); kablo tipi H07RN-F 5G… veya NYY-J.

## 6. Yazım kuralları

Pafta müşteriye olduğu gibi gönderilir.

- Paftada soru, varsayım ve çekince bulunmaz: "tahmini", "yaklaşık", "doğrulanacak", "varsayılmıştır", "(eklenecek)",
  "~" yazılmaz. Değerler kesin yazılır.
- Kullanıcıya sorulacak her şey yalnızca sohbette sorulur. Bilinmeyen alan ya boş bırakılır (boş alan paftada
  görünmez) ya da modeldeki en iyi değerle doldurulur ve sohbette sorulur.
- Çalışma dosyası adları ve takma adlar (örn. "111.STEP") metinlerde geçmez; proje adı kullanılır.
- Ana ölçüler ÇNK imalat resminden alınır; resim yoksa STEP'ten ölçülür ve tam mm'ye yuvarlanır.
- İnç ölçüleri `1 1/2"`, `1/2"` biçiminde, "G" öneki olmadan yazılır.
- TR / EN / DE metinlerin üçü de eksiksiz yazılır; ondalık ayırıcı TR ve DE'de virgül, EN'de noktadır.
- Servis alanı her yönde 1000 mm'dir (aksi söylenmedikçe).
- Kurulum notu: makine ayarlı ayaklarla, su terazisi kullanılarak boyuna ve enine teraziye alınır; zemin düz ve yük
  taşıyabilen beton olmalıdır.

## 7. Üretim adımları

1. Klasörü kontrol et: STEP, varsa imalat resmi PDF'i. Seri no / müşteri / model klasör adından.
2. `read_step.py` → `_work/` (230 MB STEP ≈ 7 dk; arka planda çalıştır).
3. `mesh_model.py` (25 mm altı parçalar elenir, 2 mm sapma).
4. Eksenleri belirle (yukarı, operatör tarafı, uzun eksen); `views_cfg.json` yaz (top, front, side, iso, rear); render et.
5. Görüntüleri incele; elektrik panosunu, kablo girişini, hava / su / tahliye / egzoz bağlantılarını montaj ağacından ve
   mesh kesitlerinden bul; `detay_*` görünümlerini ekleyip yeniden render et.
6. Veri JSON'unu referans paftanın JSON'unu yapı şablonu alarak yaz (`makine`, `elektrik` + `kablo`, `pnomatik`, `diger`,
   `detaylar`, `geometri`).
7. Belgeyi uygulamanın önizlemesinde (ya da "İndir → PDF" çıktısını PNG'ye çevirip) etiket çakışması, işaret yeri ve
   sayfa bölünmesi açısından gözle kontrol et; müşteriye "İndir" ile PDF ya da HTML gönderilir.
8. Teslim öncesi kontrol listesini (§8) uygula.
9. Sohbette: üretilen dosyalar, kullanılan değerler ve sorulacak noktalar.

## 8. Teslim öncesi kontrol listesi

- Uygulamadaki **Eksikler** sekmesinde kırmızı madde yok (bu listeyi ve §6'yı kendiliğinden denetler).
- Bölümler §2 sırasında; arka görünüm, detay kartları ve besleme kablosu bölümü var.
- Her bağlantı noktasının adı, detayı ve X / Y / Z konumu var; her bağlantı türünün detay kartı var.
- HTML'de §6'daki yasaklı ifadeler yok.
- TR / EN / DE üç dil dolu; PDF indir düğmesi üç dilde de sayfa üretiyor.
- Ölçüler imalat resmiyle (varsa) uyumlu.

## 9. Her yeni layout'ta sohbette sorulacaklar

- Toplam güç (kW), ana şalter (A), besleme gerilimi / frekansı.
- Boş ağırlık (kg).
- Su girişi ölçüsü ve basıncı, hava bağlantısı ölçüsü ve basıncı, tahliye ölçüsü, egzoz kanal ölçüsü.
- Çalışma sıcaklıkları.
- İmalat resmi PDF'i yoksa: ana ölçülerin teyidi.
- Modelden kesin çıkarılamayan parça ve yerler (pano, kablo giriş deliği, vana tipleri).
