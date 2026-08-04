#!/usr/bin/env python3
"""Proje tutarlılık denetimi.

  1. Tüm JSON dosyaları geçerli mi?
  2. en.json ve tr.json aynı anahtarları mı taşıyor?
  3. Kodda çağrılan her t("anahtar") sözlükte var mı?
  4. Sözlükte kullanılmayan anahtar var mı?
  5. Modüller storage.js dışından veri okumaya çalışıyor mu? (sözleşme ihlali)
  6. Modüller birbirini import ediyor mu? (sözleşme ihlali)

  python3 tools/kontrol.py
"""
import json, pathlib, re, sys

KOK = pathlib.Path(__file__).resolve().parent.parent
hatalar, uyarilar = [], []

# 1 — JSON geçerliliği
for y in sorted(KOK.glob("config/**/*.json")) + sorted(KOK.glob("data/**/*.json")):
    try:
        json.loads(y.read_text(encoding="utf-8"))
    except Exception as e:
        hatalar.append(f"Bozuk JSON: {y.relative_to(KOK)} — {e}")

en = json.loads((KOK / "config/i18n/en.json").read_text(encoding="utf-8"))
tr = json.loads((KOK / "config/i18n/tr.json").read_text(encoding="utf-8"))

# 2 — dil parite
for eksik in sorted(set(en) - set(tr)):
    hatalar.append(f"tr.json içinde eksik anahtar: {eksik}")
for fazla in sorted(set(tr) - set(en)):
    hatalar.append(f"en.json içinde eksik anahtar: {fazla}")

# 3/4 — kod ile sözlük eşleşmesi
kaynaklar = list(KOK.glob("core/*.js")) + list(KOK.glob("modules/*.js"))
kullanilan, dinamik = set(), []
DESEN = re.compile(r't\(\s*"([a-zA-Z][\w.]*)"')
SARTLI = re.compile(r'\?\s*"([a-zA-Z][\w.]*)"\s*:\s*"([a-zA-Z][\w.]*)"')
SABLON = re.compile(r't\(\s*`([^`]+)`')

for y in kaynaklar:
    metin = y.read_text(encoding="utf-8")
    kullanilan |= set(DESEN.findall(metin))
    for a, b in SARTLI.findall(metin):
        if "." in a and "." in b:
            kullanilan |= {a, b}
    for kalip in SABLON.findall(metin):
        dinamik.append((y.name, kalip))

# t(madde) gibi dolaylı çağrılar: dizi ve nesne sabitlerinden topla
for y in kaynaklar:
    metin = y.read_text(encoding="utf-8")
    for grup in re.findall(r'=\s*\[([^\]]*"[\w.]+\.[\w.]+"[^\]]*)\]', metin):
        kullanilan |= set(re.findall(r'"([a-z][\w]*\.[\w.]+)"', grup))
    for grup in re.findall(r'\{([^{}]*:\s*"[\w]+\.[\w.]+"[^{}]*)\}', metin):
        kullanilan |= set(re.findall(r':\s*"([a-z][\w]*\.[\w.]+)"', grup))

kullanilan = {k for k in kullanilan if "." in k and not k.endswith(".js")}

for a in sorted(kullanilan - set(en)):
    hatalar.append(f"Kodda çağrılan anahtar sözlükte yok: {a}")

# şablon kalıplarının ön eki karşılanıyor mu
for dosya, kalip in dinamik:
    on = kalip.split("${")[0]
    if not any(k.startswith(on) for k in en):
        hatalar.append(f"Dinamik anahtar öneki karşılıksız: {on}* ({dosya})")

for a in sorted(set(en) - kullanilan):
    if not any(a.startswith(p) for p in ("settings.language.", "rfq.status.", "app.title")):
        uyarilar.append(f"Sözlükte var, kodda kullanılmıyor: {a}")

# 5/6 — sözleşme ihlalleri
for y in KOK.glob("modules/*.js"):
    metin = y.read_text(encoding="utf-8")
    for satir_no, satir in enumerate(metin.splitlines(), 1):
        if re.search(r'\bfetch\s*\(', satir):
            hatalar.append(f"Modül doğrudan fetch kullanıyor: {y.name}:{satir_no}")
        if re.search(r'localStorage|sessionStorage', satir):
            hatalar.append(f"Tarayıcı deposu kullanılmış: {y.name}:{satir_no}")
    for hedef in re.findall(r'from\s+"\.\./modules/([\w.]+)"', metin):
        hatalar.append(f"Modül başka modülü çağırıyor: {y.name} -> {hedef}")

print(f"Denetlenen kaynak: {len(kaynaklar)} js, {len(en)} çeviri anahtarı")
for u in uyarilar:
    print("UYARI:", u)
for h in hatalar:
    print("HATA :", h)
print("SONUÇ:", "temiz" if not hatalar else f"{len(hatalar)} hata")
sys.exit(1 if hatalar else 0)
