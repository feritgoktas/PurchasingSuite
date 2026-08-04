# Purchasing Suite

Otel satınalma ekibi için üç modüllü web uygulaması: fiyat takibi, teklif
yönetimi ve dönem kapanışı. Veri JSON dosyalarında tutulur, dış bağımlılık
yoktur, kurulum gerektirmez.

Kurallar ve veri şeması için **`CLAUDE.md`** dosyasına bakın. Kod değişikliği
yapan herkes (ve her AI oturumu) önce onu okur.

---

## Çalıştırma

Tek gereksinim Node.js (18 veya üstü).

```bash
node server.js
```

Tarayıcıdan `http://localhost:8080` açılır. Farklı port veya veri klasörü:

```bash
node server.js 9000 /ortak/satinalma-veri
```

**Ekip kullanımı:** `server.js`'i herkesin erişebildiği bir makinede çalıştırın
ve veri klasörünü paylaşılan bir yola verin. Üç kullanıcı aynı anda
çalışabilir; herkes kendi dosyasına yazdığı için kayıtlar birbirini ezmez.

Sunucu çalışmıyorsa uygulama **bellek kipinde** açılır: gösterim verisi
yüklenir, her şey gezilebilir, ancak yazılanlar sekme kapanınca kaybolur. Kip
sol alt köşede yazar.

---

## Modüller

| Modül | Ne yapar |
|---|---|
| **Ledger** | Gıda fiyatlarını haftalık, aylık ve çeyreklik karşılaştırır. Ürün bazında değişim yüzdesi, tedarikçiler arası yayılım, iki otelin aynı üründe ödediği fiyat farkı. |
| **RFQ** | Non-food tekliflerini talep numarası altında toplar, en düşük teklifi işaretler, geçerlilik tarihi geçenleri ayırır. |
| **Closing Cockpit** | Dönem özeti: kategori bazlı toplam, önceki döneme göre değişim, en çok artan kalemler, açık teklifler. **Kapsamı henüz onaylanmadı** — mevcut hali taslaktır. |

---

## Günlük kullanım

1. Sağ üstten kendi adınızı seçin — kayıtlar bu isimle damgalanır.
2. Otel ve dönem filtrelerini ayarlayın. `Tüm oteller` iki oteli birlikte gösterir.
3. **Yeni kayıt** ile fiyat veya teklif girin.
4. Yalnızca kendi girdiğiniz kayıtları düzenleyebilirsiniz. Başkasının kaydında
   düzenleme düğmesi çıkmaz.
5. Dil ve varsayılan otel **Ayarlar**'dan değiştirilir. Uygulama her zaman
   İngilizce açılır.

Silme yoktur. Yanlış kayıt pasifleştirilir; listelerden çıkar ama dosyada
kalır, böylece geçmiş karşılaştırmalar bozulmaz. Aynı kural pasif olan
tedarikçi ve ürünler için de geçerlidir: yeni kayıt listelerinde çıkmazlar,
eski kayıtlarda adları görünmeye devam eder.

---

## Yeni ürün veya tedarikçi eklemek

Kod değişikliği gerekmez. `config/urunler.json` veya
`config/tedarikciler.json` dosyasına bir satır eklenir:

```json
{ "kod": "SBZ-0055", "ad": { "tr": "Kabak", "en": "Zucchini" },
  "kategori": "SBZ", "birim": "kg", "aktif": true }
```

Ürün adı iki dilde yazılır. Bir tedarikçiyle çalışılmayacaksa kaydı silinmez,
`"aktif": false` yapılır.

---

## GitHub'a yükleme

Komut satırına gerek yok:

1. github.com → yeni depo, **Private** seçin.
2. **Add file → Upload files**, bu klasörü sürükleyin, **Commit changes**.
3. Bundan sonra düzenlemeleri Claude Code'un web arayüzünden yapabilirsiniz.

`data/` klasörünü yüklemeden önce düşünün: içinde gerçek tedarikçi fiyatları
olacak. Depo private olsa bile çoğu şirkette bu veri dışarı çıkmamalıdır. Kodu
GitHub'da, veriyi şirket içinde ayrı tutmak en temizi.

---

## Değişiklik yaparken

```bash
python3 tools/kontrol.py
```

Sözleşme ihlallerini ve eksik çevirileri yakalar. Temiz sonuç vermeden
değişiklik gönderilmez.

AI'dan değişiklik isterken tek dosyayı adlandırın:

> `modules/rfq.js` dosyasında çalış. Teklif tablosuna tedarikçi puanı sütunu
> ekle. `core/storage.js` sözleşmesini değiştirme, başka dosyaya dokunma.
> Yeni metin eklersen `en.json` ve `tr.json`'a da ekle.

---

## Bilinmesi gerekenler

- **Kimlik doğrulama yoktur.** Kullanıcı bir listeden seçilir. Bu, üç kişilik
  güvenilir bir ekipte yanlışlıkla başkasının kaydını bozmayı engeller; kötü
  niyetli erişimi engellemez. Sunucuyu iç ağda çalıştırın.
- **Yedek almak = klasörü kopyalamak.** `data/` klasörünün düzenli kopyası
  yeterli bir yedektir.
- **Fcount ve Receive Check bu depoda değildir.** Ancak `urunKodu` ve
  `tedarikciKodu` alanlarını buradaki master dosyalarla aynı kullanmaları
  gerekir; üç uygulamanın verisinin birleşebilmesi buna bağlıdır.
