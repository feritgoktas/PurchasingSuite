/**
 * core/storage.js — TEK veri erişim noktası
 *
 * Modüller dosya sistemine veya ağa doğrudan erişmez; tüm okuma/yazma
 * buradan geçer. Bu dosyanın dışa açtığı fonksiyon imzaları SÖZLEŞMEDİR ve
 * açık talimat olmadan değiştirilmez (CLAUDE.md bölüm 2 ve 8).
 *
 * İki adaptör vardır:
 *   sunucu — server.js çalışıyorsa. Veri data/ altındaki JSON dosyalarıdır,
 *            kalıcıdır, üç kullanıcı aynı klasörü paylaşır.
 *   bellek — sunucu yoksa. data/ornek.json belleğe yüklenir; uygulama boş
 *            açılmaz ama yazılanlar sekme kapanınca kaybolur.
 *
 * Fiziksel saklama yeri değiştiğinde (ör. Firebase) yalnızca adaptör
 * değişir; modüllerde tek satır kod değişmez.
 */

import { kullaniciKodu } from "./auth.js";

const SEMA = 1;

let adapter = null;
let adapterKod = "bellek";
let kalici = false;

/* ------------------------------------------------------------------ *
 * Yol üretimi
 * ------------------------------------------------------------------ */

function donemKlasoru(modul, otelKodu, donem) {
  return `data/${modul}/${otelKodu}/${donem}`;
}

function veriYolu(modul, otelKodu, donem, kullanici) {
  return `${donemKlasoru(modul, otelKodu, donem)}/${kullanici}.json`;
}

function bosZarf(modul, otelKodu, donem, kullanici) {
  return {
    sema: SEMA,
    modul,
    otelKodu,
    donem,
    kullanici,
    guncelleme: new Date().toISOString(),
    kayitlar: [],
  };
}

/* ------------------------------------------------------------------ *
 * Adaptör: sunucu
 * ------------------------------------------------------------------ */

const sunucuAdapter = {
  async oku(yol) {
    const y = await fetch(`api/file?path=${encodeURIComponent(yol)}`);
    if (y.status === 404) return null;
    if (!y.ok) throw new Error(`Okunamadı: ${yol} (${y.status})`);
    return y.json();
  },
  async yaz(yol, icerik) {
    const y = await fetch(`api/file?path=${encodeURIComponent(yol)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(icerik, null, 1),
    });
    if (!y.ok) throw new Error(`Yazılamadı: ${yol} (${y.status})`);
  },
  async listele(klasor) {
    const y = await fetch(`api/list?dir=${encodeURIComponent(klasor)}`);
    if (!y.ok) return [];
    return y.json();
  },
};

/* ------------------------------------------------------------------ *
 * Adaptör: bellek
 * ------------------------------------------------------------------ */

function bellekAdapterKur(baslangic) {
  const kutu = new Map(Object.entries(baslangic || {}));
  return {
    async oku(yol) {
      const v = kutu.get(yol);
      return v ? JSON.parse(JSON.stringify(v)) : null;
    },
    async yaz(yol, icerik) {
      kutu.set(yol, JSON.parse(JSON.stringify(icerik)));
    },
    async listele(klasor) {
      const on = klasor.endsWith("/") ? klasor : klasor + "/";
      return [...kutu.keys()]
        .filter((y) => y.startsWith(on) && !y.slice(on.length).includes("/"))
        .map((y) => y.slice(on.length));
    },
  };
}

/* ------------------------------------------------------------------ *
 * Başlatma
 * ------------------------------------------------------------------ */

/**
 * Sunucuyu yoklar, uygun adaptörü seçer.
 * @returns {Promise<"sunucu"|"bellek">}
 */
export async function storageBaslat() {
  try {
    const y = await fetch("api/ping", { cache: "no-store" });
    if (y.ok) {
      adapter = sunucuAdapter;
      adapterKod = "sunucu";
      kalici = true;
      return adapterKod;
    }
  } catch {
    /* sunucu yok — bellek kipine düşülür */
  }

  let tohum = {};
  try {
    const y = await fetch("data/ornek.json", { cache: "no-store" });
    if (y.ok) tohum = await y.json();
  } catch {
    /* gösterim verisi de yoksa uygulama boş açılır */
  }

  adapter = bellekAdapterKur(tohum);
  adapterKod = "bellek";
  kalici = false;
  return adapterKod;
}

export function kaliciMi() {
  return kalici;
}

export function adapterAdi() {
  return adapterKod;
}

function hazirMi() {
  if (!adapter) throw new Error("storageBaslat() çağrılmadı");
}

/* ------------------------------------------------------------------ *
 * Master dosyalar
 * ------------------------------------------------------------------ */

const masterOnbellek = new Map();

/**
 * Master listeyi döner. Pasif kayıtlar da gelir — geçmiş verinin
 * etiketleri kaybolmasın diye (CLAUDE.md bölüm 2.3).
 * @param {"urunler"|"tedarikciler"|"oteller"|"kullanicilar"} ad
 */
export async function master(ad) {
  if (masterOnbellek.has(ad)) return masterOnbellek.get(ad);
  const y = await fetch(`config/${ad}.json`, { cache: "no-store" });
  if (!y.ok) throw new Error(`Master okunamadı: ${ad}`);
  const veri = await y.json();
  masterOnbellek.set(ad, veri);
  return veri;
}

/** Yalnızca aktif kayıtlar. Yeni kayıt ekranlarındaki listeler bunu kullanır. */
export async function aktifMaster(ad) {
  return (await master(ad)).filter((k) => k.aktif !== false);
}

/* ------------------------------------------------------------------ *
 * Okuma
 * ------------------------------------------------------------------ */

async function otelListesiCoz(otelKodu) {
  if (!otelKodu || otelKodu === "*") return (await master("oteller")).map((o) => o.kod);
  return Array.isArray(otelKodu) ? otelKodu : [otelKodu];
}

/**
 * Bir dönemin kayıtlarını okur. Tüm kullanıcıların dosyaları birleştirilir;
 * okuma yetkisi herkeste ve her oteldedir (CLAUDE.md bölüm 5).
 *
 * @param {string} modul  "ledger" | "rfq" | "closing"
 * @param {string} donem  "2026-08"
 * @param {{otelKodu?: string|string[]}} [secenek]
 * @returns {Promise<object[]>} her kayıtta ayrıca `_kullanici` bulunur
 */
export async function oku(modul, donem, secenek = {}) {
  hazirMi();
  if (!donem) return [];

  const oteller = await otelListesiCoz(secenek.otelKodu);
  const tum = [];

  for (const otelKodu of oteller) {
    const klasor = donemKlasoru(modul, otelKodu, donem);
    let dosyalar = [];
    try {
      dosyalar = await adapter.listele(klasor);
    } catch {
      continue; // dönem henüz açılmamış
    }

    for (const dosya of dosyalar) {
      if (!dosya.endsWith(".json")) continue;
      try {
        const zarf = semaYukselt(await adapter.oku(`${klasor}/${dosya}`));
        if (!zarf) continue;
        for (const kayit of zarf.kayitlar || []) {
          if (kayit.aktif === false) continue;
          tum.push({ ...kayit, _kullanici: zarf.kullanici, _otel: zarf.otelKodu });
        }
      } catch (e) {
        console.warn("Okunamayan dosya atlandı:", dosya, e);
      }
    }
  }
  return tum;
}

/**
 * Birden çok dönemi tek çağrıda okur (çeyreklik görünüm için).
 * @returns {Promise<Object<string, object[]>>} dönem koduna göre eşlenmiş liste
 */
export async function okuDonemler(modul, donemler, secenek = {}) {
  const sonuc = {};
  await Promise.all(
    donemler.map(async (d) => {
      sonuc[d] = await oku(modul, d, secenek);
    })
  );
  return sonuc;
}

/* ------------------------------------------------------------------ *
 * Yazma
 * ------------------------------------------------------------------ */

/**
 * Kayıt ekler veya günceller. Yalnızca oturumdaki kullanıcının kendi
 * dosyasına yazar; başka kullanıcının dosyası hiçbir koşulda açılmaz.
 *
 * @param {string} modul
 * @param {string} donem
 * @param {object} kayit  id varsa günceller, yoksa yeni id üretir
 * @returns {Promise<object>} yazılan kayıt
 */
export async function yaz(modul, donem, kayit) {
  hazirMi();
  const kullanici = kullaniciKodu();
  const otelKodu = kayit.otelKodu;
  if (!otelKodu) throw new Error("kayit.otelKodu zorunludur");
  if (!donem) throw new Error("donem zorunludur");

  const yol = veriYolu(modul, otelKodu, donem, kullanici);
  const zarf =
    semaYukselt(await adapter.oku(yol)) || bosZarf(modul, otelKodu, donem, kullanici);

  const temiz = { ...kayit };
  delete temiz._kullanici;
  delete temiz._otel;
  delete temiz._donem;

  if (!temiz.id) {
    temiz.id = idUret(modul, otelKodu, temiz.tarih, zarf.kayitlar);
    zarf.kayitlar.push(temiz);
  } else {
    const i = zarf.kayitlar.findIndex((k) => k.id === temiz.id);
    if (i === -1) {
      // Kayıt başka kullanıcının dosyasında; bu kural sessizce aşılmaz.
      throw new Error("Bu kayıt bu kullanıcıya ait değil: " + temiz.id);
    }
    zarf.kayitlar[i] = { ...zarf.kayitlar[i], ...temiz };
  }

  zarf.guncelleme = new Date().toISOString();
  await adapter.yaz(yol, zarf);
  return temiz;
}

/** Kaydı pasifleştirir. Fiziksel silme yapılmaz (CLAUDE.md bölüm 2.3). */
export async function pasifle(modul, donem, kayit) {
  return yaz(modul, donem, { id: kayit.id, otelKodu: kayit.otelKodu, aktif: false });
}

/* ------------------------------------------------------------------ *
 * Şema
 * ------------------------------------------------------------------ */

function semaYukselt(zarf) {
  if (!zarf) return null;
  if (!zarf.sema) zarf.sema = 1;
  // sema 1 -> 2 dönüşümü buraya eklenecek. Eski dosyalar elle düzenlenmez.
  if (zarf.sema > SEMA) {
    console.warn(`Dosya bu sürümden yeni (sema ${zarf.sema}); salt okunur sayılmalı.`);
  }
  return zarf;
}

/* ------------------------------------------------------------------ *
 * Yardımcılar
 * ------------------------------------------------------------------ */

const ON_EK = { ledger: "LDG", rfq: "RFQ", closing: "CLS" };

function idUret(modul, otelKodu, tarih, mevcut) {
  const on = ON_EK[modul] || "GEN";
  const g = (tarih || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  const govde = `${on}-${otelKodu.replace(/-/g, "")}-${g}`;
  let sira = 1;
  const kullanilan = new Set((mevcut || []).map((k) => k.id));
  while (kullanilan.has(`${govde}-${String(sira).padStart(4, "0")}`)) sira++;
  return `${govde}-${String(sira).padStart(4, "0")}`;
}
