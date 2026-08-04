/**
 * core/auth.js — oturum, kullanıcı, yetki
 *
 * UYARI (CLAUDE.md bölüm 5): burada gerçek kimlik doğrulama yoktur.
 * Kullanıcı bir listeden seçilir. Bu, üç kişilik güvenilir bir ekipte
 * "yanlışlıkla başkasının kaydını bozmayı" engeller — kötü niyetli erişimi
 * engellemez. Depoya erişimi olan herkes teknik olarak her şeyi değiştirebilir.
 * Gerçek yetkilendirme gerekirse sunucu tarafına taşınmalıdır.
 */

let kullanicilar = [];
let aktif = null;
const dinleyiciler = new Set();

export async function authBaslat() {
  const y = await fetch("config/kullanicilar.json");
  kullanicilar = await y.json();
  const kayitli = oku("ps.kullanici");
  aktif = kullanicilar.find((k) => k.kullanici === kayitli) || kullanicilar[0];
  return aktif;
}

export function aktifKullanici() {
  if (!aktif) throw new Error("authBaslat() çağrılmadı");
  return aktif;
}

export function kullaniciKodu() {
  return aktifKullanici().kullanici;
}

export function kullaniciListesi() {
  return kullanicilar;
}

export function kullaniciSec(kod) {
  const k = kullanicilar.find((x) => x.kullanici === kod);
  if (!k) throw new Error("Kullanıcı bulunamadı: " + kod);
  aktif = k;
  yaz("ps.kullanici", kod);
  dinleyiciler.forEach((f) => f(k));
  return k;
}

export function kullaniciDinle(fn) {
  dinleyiciler.add(fn);
  return () => dinleyiciler.delete(fn);
}

/** Kullanıcının tercih ettiği dil. Yoksa varsayılan "en". */
export function tercihDil() {
  return oku("ps.dil") || aktifKullanici().dil || "en";
}

export function tercihDilYaz(dil) {
  yaz("ps.dil", dil);
  aktif.dil = dil;
}

export function anaOtel() {
  return aktifKullanici().anaOtel;
}

/** Bir kaydı bu kullanıcı düzenleyebilir mi? Yalnızca kendi kayıtları. */
export function duzenlenebilir(kayit) {
  return !kayit._kullanici || kayit._kullanici === kullaniciKodu();
}

/** Master dosyaları yalnızca admin düzenler. */
export function adminMi() {
  return aktifKullanici().rol === "admin";
}

export function modulErisimi(modul) {
  const m = aktifKullanici().moduller;
  return !m || m.includes(modul);
}

/* Tercihler oturum içinde tutulur; kalıcı tercih sunucu eklendiğinde
   kullanıcı profiline yazılacak (CLAUDE.md bölüm 9). */
const tercihler = new Map();
function oku(k) { return tercihler.get(k) ?? null; }
function yaz(k, v) { tercihler.set(k, v); }
