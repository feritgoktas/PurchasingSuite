# Purchasing Suite — Proje Sözleşmesi

Bu dosya projenin **değişmez kurallarını** tanımlar. Her AI oturumunda ilk okunacak
dosyadır. Buradaki kurallar modül geliştirmelerinden bağımsızdır ve bir modül
isteği yüzünden değiştirilmez.

---

## 1. Proje

Otel satınalma ekibi için web tabanlı, JSON veri saklayan çok modüllü uygulama.

| Modül | Klasör dosyası | Amaç | Durum |
|---|---|---|---|
| Ledger | `modules/ledger.js` | Gıda ürünleri fiyat karşılaştırma (haftalık/aylık/çeyreklik) | Yazıldı |
| RFQ-Ist | `modules/rfq.js` | Non-food fiyat teklifleri | Yazıldı |
| Closing Cockpit (FSH-P) | `modules/closing.js` | Dönem kapanışı / konsolidasyon | Taslak — kapsam onay bekliyor |
| Receive Check | ayrı uygulama (Firebase) | Mal kabul kalite kontrol | Bu depo dışında |

**Not:** Fcount (Android sayım) ve Receive Check bu depoda değildir, ancak
`urunKodu` ve `tedarikciKodu` alanlarını bu depodaki master dosyalarla **aynı**
kullanmak zorundadır. Veri birleştirilebilirliği buna bağlıdır.

---

## 2. Değişmez Kurallar

Aşağıdaki maddeler açık talimat olmadan değiştirilemez. Bir istek bu kurallarla
çelişiyorsa uygulamadan önce çelişki bildirilir.

1. **Tek yazma kapısı.** Modüller dosya sistemine / ağa doğrudan erişmez.
   Yalnızca `core/storage.js` üzerinden okur ve yazar.
2. **Kullanıcı kendi dosyasına yazar.** Bir kullanıcı yalnızca kendi adına açılmış
   veri dosyasını değiştirir. Başka kullanıcının dosyasına yazma kodu yazılmaz.
3. **Silme yok, pasifleştirme var.** Ürün, tedarikçi ve otel kayıtları silinmez;
   `aktif: false` yapılır. Geçmiş kayıtların bütünlüğü bundan sağlanır.
4. **Metin koda gömülmez.** Kullanıcıya görünen her metin `t("anahtar")` ile
   gelir. Kodda düz Türkçe/İngilizce cümle bulunmaz.
5. **Modüller birbirini çağırmaz.** `ledger.js` içinden `rfq.js` fonksiyonu
   çağrılmaz. Ortak ihtiyaç varsa `core/` altına taşınır.
6. **Şema alanı zorunlu.** Her veri dosyası `sema` numarası taşır.
7. **Para birimi ve KDV her fiyat kaydında açıkça yazılır.** Varsayılan
   kabul edilmez.

---

## 3. Klasör Yapısı

```
index.html              Uygulama iskeleti
app.css                 Tüm görsel katman (tek dosya)
server.js               Bağımlılıksız yerel sunucu — node server.js
CLAUDE.md               Bu dosya
core/
  app.js                Açılış, gezinme, ayarlar ekranı
  storage.js            Veri okuma/yazma — TEK erişim noktası
  auth.js               Oturum, kullanıcı, yetki
  i18n.js               Dil motoru, t() ve ad() fonksiyonları
  ui.js                 Ortak bileşenler (tablo, çekmece, biçimleme, CSV)
config/
  oteller.json          Otel master
  urunler.json          Ürün master (ortak)
  tedarikciler.json     Tedarikçi master (ortak)
  kullanicilar.json     Kullanıcı ve rol tanımları
  i18n/en.json          Arayüz metinleri — İngilizce (varsayılan)
  i18n/tr.json          Arayüz metinleri — Türkçe
modules/
  ledger.js
  rfq.js
  closing.js
tools/
  kontrol.py            Sözleşme ve çeviri denetimi — her değişiklikten sonra çalıştır
  i18n_uret.py          Koddaki t() anahtarlarını sözlüklerle karşılaştırır
  ornek_uret.py         Gösterim verisi üretir
data/
  ornek.json            Sunucusuz açılışta yüklenen gösterim verisi
  <modul>/<otelKodu>/<donem>/<kullanici>.json
```

---

## 4. Otel Modeli

- İki otel: `HTL-01`, `HTL-02`. Otel listesi `config/oteller.json` içindedir.
- **Master dosyalar ortaktır.** Ürün ve tedarikçi listesi iki otel için tektir;
  otele göre çoğaltılmaz.
- **Veri otele göre ayrışır.** Her kayıt `otelKodu` taşır ve dosya yolu otel
  kodunu içerir.
- **Görünürlük ortaktır.** Her kullanıcı iki otelin de verisini okuyabilir.
  Panellerde otel filtresi bulunur; varsayılan kullanıcının ana otelidir.
- Karşılaştırma panelleri aynı ürün için iki otelin fiyatını yan yana
  gösterebilmelidir.

---

## 5. Yetki Modeli

| Yetki | Kural |
|---|---|
| Okuma | Tüm kullanıcılar, tüm oteller, tüm modüller |
| Yazma | Yalnızca kullanıcının kendi veri dosyası |
| Master düzenleme | Yalnızca `rol: "admin"` |

**Uyarı:** Bu ayrım arayüz seviyesindedir, güvenlik sınırı değildir. Veri
kaynağına erişebilen herkes teknik olarak her şeyi değiştirebilir. Gerçek
yetkilendirme gerektiğinde sunucu taraflı bir katman eklenmelidir.

---

## 6. Dil Modeli

- Varsayılan dil: **`en`**. Uygulama her zaman İngilizce açılır.
- Kullanıcı Settings ekranından `en` / `tr` seçer; tercih kullanıcı profilinde
  saklanır ve sonraki açılışta korunur.
- Dil değişimi sayfa yenilemeden uygulanır.
- **Arayüz metni** → `config/i18n/*.json` içinde anahtarla.
- **Veri etiketi** (ürün adı, kategori adı, ret nedeni) → master JSON içinde
  iki dilli alan:
  ```json
  "ad": { "tr": "Domates", "en": "Tomato" }
  ```
- Eksik çeviri varsa İngilizce metne düşülür, hata verilmez.
- Sayı ve tarih biçimi seçili dile göre yerelleştirilir. **Veri içinde** tarih
  daima ISO (`YYYY-MM-DD`), ondalık ayırıcı daima nokta.

---

## 7. Veri Şeması

### 7.1 Ortak zarf

Tüm modüllerde aynıdır. Yalnızca `kayitlar` içeriği modüle göre değişir.

```json
{
  "sema": 1,
  "modul": "ledger",
  "otelKodu": "HTL-01",
  "donem": "2026-08",
  "kullanici": "cihan",
  "guncelleme": "2026-08-04T10:22:00+03:00",
  "kayitlar": []
}
```

### 7.2 Ledger kaydı

```json
{
  "id": "LDG-HTL01-20260804-0001",
  "tarih": "2026-08-04",
  "otelKodu": "HTL-01",
  "urunKodu": "SBZ-0012",
  "tedarikciKodu": "TED-004",
  "birim": "kg",
  "birimFiyat": 42.50,
  "paraBirimi": "TRY",
  "kdvOrani": 1,
  "not": ""
}
```

### 7.3 RFQ kaydı

```json
{
  "id": "RFQ-HTL01-20260804-0001",
  "talepNo": "RFQ-2026-0042",
  "tarih": "2026-08-04",
  "otelKodu": "HTL-01",
  "kalemKodu": "NF-0231",
  "tedarikciKodu": "TED-011",
  "teklifFiyat": 1850.00,
  "paraBirimi": "TRY",
  "kdvOrani": 20,
  "terminGun": 14,
  "gecerlilikTarihi": "2026-09-04",
  "durum": "acik",
  "not": ""
}
```

### 7.4 ID kuralı

`<MODUL>-<OTEL>-<YYYYAAGG>-<4 HANE SIRA>` — ID bir kez üretilir, asla değişmez.

### 7.5 Dönem biçimi

- Aylık: `2026-08`
- Çeyreklik: `2026-Q3` (yalnızca raporlamada; veri dosyaları aylık tutulur)
- Haftalık görünüm `tarih` alanından türetilir, ayrı dosya açılmaz.

### 7.6 Şema değişikliği

`sema` numarası artırılır ve `core/storage.js` içine eski sürümü okuyup yeni
sürüme çeviren bir dönüştürücü eklenir. Eski veri dosyaları elle düzenlenmez.

---

## 8. AI ile Çalışma Kuralları

1. **Tek dosya kuralı.** Bir istek yalnızca belirtilen dosyada değişiklik
   yapar. Başka dosyaya dokunulması gerekiyorsa önce bu bildirilir.
2. **Tam dosya yeniden yazılmaz.** Yalnızca değişen fonksiyon veya blok üretilir.
3. **Sözleşme değiştirilmez.** `core/storage.js` fonksiyon imzaları ve bölüm 7
   şeması, açık talimat olmadan değiştirilmez.
4. **Yeni alan eklerken** hem şema örneği hem `sema` numarası güncellenir.
5. **Yeni metin eklerken** hem `en.json` hem `tr.json` güncellenir.
6. Yeni bir modül eklendiğinde bölüm 1 tablosuna satır eklenir.

---

## 9. Çalıştırma ve Denetim

```bash
node server.js              # http://localhost:8080
python3 tools/kontrol.py    # sözleşme + çeviri denetimi
```

`server.js` yalnızca `data/` altına yazar, dış bağımlılığı yoktur ve kimlik
doğrulaması içermez — iç ağda çalıştırılır.

Sunucu çalışmıyorsa uygulama **bellek kipine** düşer: `data/ornek.json`
yüklenir, paneller dolu açılır, ancak yazılanlar sekme kapanınca kaybolur.
Kip, sol alt köşede ve Ayarlar ekranında gösterilir.

**Her değişiklikten sonra `tools/kontrol.py` çalıştırılır.** Denetlediği
sözleşme ihlalleri: modüllerin `storage.js` dışından veri okuması, modüllerin
birbirini import etmesi, sözlükte karşılığı olmayan `t()` anahtarı, iki dil
arasında anahtar farkı, bozuk JSON.

---

## 10. Açık Konular

- [ ] Closing Cockpit'in kapsamı: hangi modüllerden hangi veriyi tüketecek,
      çıktısı ne olacak?
- [ ] Veri dosyalarının fiziksel konumu: paylaşılan ağ klasörü mü, sunucu mu?
      (`core/storage.js` adaptörü bu karara göre doldurulacak.)
- [ ] Ledger ile Fcount arasında ürün master senkronizasyonu nasıl yapılacak?
- [ ] Fiyat geçmişinde tedarikçi pasifleştiğinde raporlarda nasıl gösterilecek?
