/**
 * core/i18n.js — dil motoru
 *
 * Kural (CLAUDE.md bölüm 6): kullanıcıya görünen hiçbir metin koda gömülmez.
 * Varsayılan dil "en". Eksik çeviri hata vermez, İngilizceye düşer.
 */

const DESTEKLENEN = ["en", "tr"];
const VARSAYILAN = "en";

let aktifDil = VARSAYILAN;
let sozluk = {};
let yedek = {};
const dinleyiciler = new Set();

export async function i18nBaslat(dil = VARSAYILAN) {
  yedek = await sozlukYukle(VARSAYILAN);
  await dilAyarla(dil, true);
}

async function sozlukYukle(dil) {
  const y = await fetch(`config/i18n/${dil}.json`);
  if (!y.ok) throw new Error(`Dil dosyası okunamadı: ${dil}`);
  return y.json();
}

export async function dilAyarla(dil, sessiz = false) {
  if (!DESTEKLENEN.includes(dil)) dil = VARSAYILAN;
  sozluk = dil === VARSAYILAN ? yedek : await sozlukYukle(dil);
  aktifDil = dil;
  document.documentElement.lang = dil;
  if (!sessiz) dinleyiciler.forEach((f) => f(dil));
}

export function dil() {
  return aktifDil;
}

export function dilDinle(fn) {
  dinleyiciler.add(fn);
  return () => dinleyiciler.delete(fn);
}

/**
 * Metin anahtarını çözer. {ad} biçimindeki yer tutucular doldurulur.
 *   t("ledger.week", { no: 32 })
 */
export function t(anahtar, degerler) {
  let metin = sozluk[anahtar] ?? yedek[anahtar];
  if (metin === undefined) {
    console.warn("Çeviri eksik:", anahtar);
    return anahtar;
  }
  if (degerler) {
    for (const [k, v] of Object.entries(degerler)) {
      metin = metin.replaceAll(`{${k}}`, String(v));
    }
  }
  return metin;
}

/**
 * Master kayıtlardaki iki dilli alanı çözer: { tr: "Domates", en: "Tomato" }
 * Arayüz metninden farklıdır — bu veri, i18n dosyalarında durmaz.
 */
export function ad(cokDilli) {
  if (cokDilli == null) return "";
  if (typeof cokDilli === "string") return cokDilli;
  return cokDilli[aktifDil] ?? cokDilli[VARSAYILAN] ?? Object.values(cokDilli)[0] ?? "";
}

export function dilListesi() {
  return DESTEKLENEN.map((k) => ({ kod: k, etiket: t(`settings.language.${k}`) }));
}
