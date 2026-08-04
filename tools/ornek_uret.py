#!/usr/bin/env python3
"""Gösterim verisi üretir (data/ornek.json).

Sunucu çalışmadığında uygulama bu dosyayı belleğe yükler; paneller boş
açılmaz. Gerçek veri değildir, fiyatlar rastgele türetilmiştir.

  python3 tools/ornek_uret.py            → data/ornek.json
  python3 tools/ornek_uret.py --yaz      → ayrıca data/ altına gerçek dosyalar
"""
import json, pathlib, random, sys
from datetime import date, timedelta

KOK = pathlib.Path(__file__).resolve().parent.parent
random.seed(20260804)

urunler = json.loads((KOK / "config/urunler.json").read_text(encoding="utf-8"))
tedarikciler = json.loads((KOK / "config/tedarikciler.json").read_text(encoding="utf-8"))
oteller = [o["kod"] for o in json.loads((KOK / "config/oteller.json").read_text(encoding="utf-8"))]
kullanicilar = ["cihan", "fatih", "ferit"]

TABAN = {  # ürün kodu -> yaklaşık birim fiyat
    "SBZ-0012": 38, "SBZ-0021": 26, "SBZ-0034": 19,
    "MYV-0031": 45, "MYV-0042": 62,
    "ET-0004": 640, "ET-0017": 410,
    "BLK-0009": 380, "BLK-0022": 295,
    "NF-TEK-0231": 210, "NF-TEK-0244": 96,
    "NF-TMZ-0102": 148, "NF-TMZ-0115": 72,
}

def donemler(adet=3):
    bugun = date.today().replace(day=1)
    liste = []
    for _ in range(adet):
        liste.append(bugun.strftime("%Y-%m"))
        bugun = (bugun - timedelta(days=1)).replace(day=1)
    return list(reversed(liste))

def tedarikci_havuzu(kategori):
    uygun = [t for t in tedarikciler if kategori in t.get("kategoriler", []) and t.get("aktif") is not False]
    return uygun or [t for t in tedarikciler if t.get("aktif") is not False]

dosyalar = {}

def ekle(modul, otel, donem, kullanici, kayit):
    yol = f"data/{modul}/{otel}/{donem}/{kullanici}.json"
    zarf = dosyalar.setdefault(yol, {
        "sema": 1, "modul": modul, "otelKodu": otel, "donem": donem,
        "kullanici": kullanici, "guncelleme": f"{donem}-28T09:00:00+03:00", "kayitlar": [],
    })
    kayit["id"] = "%s-%s-%s-%04d" % (
        {"ledger": "LDG", "rfq": "RFQ"}[modul], otel.replace("-", ""),
        kayit["tarih"].replace("-", ""), len(zarf["kayitlar"]) + 1)
    zarf["kayitlar"].append(kayit)

# ---- ledger: 3 dönem, iki otel, haftalık girişler ----
gida = [u for u in urunler if not u["kategori"].startswith("NF")]
for i, donem in enumerate(donemler(3)):
    surukleme = 1 + 0.035 * i                      # dönemden döneme genel artış
    for otel in oteller:
        otel_katsayi = 1.0 if otel == oteller[0] else 1.045   # ikinci otel biraz pahalı
        for urun in gida:
            taban = TABAN.get(urun["kod"], 50) * surukleme * otel_katsayi
            for hafta in (1, 3):                    # ayda iki giriş
                gun = f"{donem}-{hafta * 7:02d}"
                for ted in random.sample(tedarikci_havuzu(urun["kategori"]),
                                         k=min(3, len(tedarikci_havuzu(urun["kategori"])))):
                    ekle("ledger", otel, donem, random.choice(kullanicilar), {
                        "tarih": gun,
                        "otelKodu": otel,
                        "urunKodu": urun["kod"],
                        "tedarikciKodu": ted["kod"],
                        "birim": urun["birim"],
                        "birimFiyat": round(taban * random.uniform(0.88, 1.18), 2),
                        "paraBirimi": "TRY",
                        "kdvOrani": 1,
                        "not": "",
                    })

# ---- rfq: non-food talepler ----
nonfood = [u for u in urunler if u["kategori"].startswith("NF")]
son = donemler(2)
for j, donem in enumerate(son):
    for k, urun in enumerate(nonfood):
        otel = oteller[k % len(oteller)]
        talep = f"RFQ-{donem[:4]}-{1000 + j * 10 + k}"
        gun = f"{donem}-{8 + k:02d}"
        havuz = tedarikci_havuzu(urun["kategori"])
        taban = TABAN.get(urun["kod"], 100)
        for ted in random.sample(havuz, k=min(3, len(havuz))):
            ekle("rfq", otel, donem, random.choice(kullanicilar), {
                "talepNo": talep,
                "tarih": gun,
                "otelKodu": otel,
                "kalemKodu": urun["kod"],
                "tedarikciKodu": ted["kod"],
                "teklifFiyat": round(taban * random.uniform(0.85, 1.35), 2),
                "paraBirimi": "TRY",
                "kdvOrani": 20,
                "terminGun": random.choice([7, 10, 14, 21, 30]),
                "gecerlilikTarihi": (date.fromisoformat(gun) + timedelta(days=random.choice([20, 45, 90]))).isoformat(),
                "durum": "onaylandi" if (j == 0 and k == 0) else "acik",
                "not": "",
            })

hedef = KOK / "data" / "ornek.json"
hedef.parent.mkdir(parents=True, exist_ok=True)
hedef.write_text(json.dumps(dosyalar, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

kayit_sayisi = sum(len(z["kayitlar"]) for z in dosyalar.values())
print(f"ornek.json: {len(dosyalar)} dosya, {kayit_sayisi} kayıt, {hedef.stat().st_size // 1024} KB")

if "--yaz" in sys.argv:
    for yol, icerik in dosyalar.items():
        p = KOK / yol
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(icerik, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"data/ altına {len(dosyalar)} dosya yazıldı")
