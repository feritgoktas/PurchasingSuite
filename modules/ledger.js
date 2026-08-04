/**
 * modules/ledger.js — gıda fiyat takibi ve karşılaştırma
 *
 * Bu modül yalnızca core/ katmanını kullanır. Diğer modülleri çağırmaz.
 * Veriye erişim yalnızca storage.js üzerindendir (CLAUDE.md bölüm 2).
 */

import { t, ad as cevirAd } from "../core/i18n.js";
import * as S from "../core/storage.js";
import * as A from "../core/auth.js";
import {
  el, temizle, tablo, panel, cekmece, bildir, sayi, para, tarih, yuzde,
  degisimRozeti, yayilimCubugu, buDonem, oncekiDonem, donemListesi,
  ceyrekDonemleri, haftaNo, csvIndir,
} from "../core/ui.js";

export const modul = "ledger";
export const navAnahtar = "nav.ledger";

const durum = {
  donem: buDonem(),
  otel: "*",
  kategori: "*",
  gorunum: "aylik", // haftalik | aylik | ceyreklik
};

let kap = null;

export async function ciz(hedef) {
  kap = hedef;
  await yenile();
}

async function yenile() {
  temizle(kap);
  kap.append(await araclarCiz());

  const donemler =
    durum.gorunum === "ceyreklik" ? ceyrekDonemleri(durum.donem) : [durum.donem];
  const secenek = { otelKodu: durum.otel === "*" ? "*" : durum.otel };

  const kayitlarPaket = await S.okuDonemler(modul, donemler, secenek);
  const kayitlar = donemler.flatMap((d) => kayitlarPaket[d].map((k) => ({ ...k, _donem: d })));
  const oncekiler = await S.oku(modul, oncekiDonem(donemler[0]), secenek);

  const urunler = await S.master("urunler");
  const tedarikciler = await S.master("tedarikciler");
  const oteller = await S.master("oteller");

  kap.append(ozetCiz(kayitlar, oncekiler));

  if (durum.gorunum === "haftalik") {
    kap.append(haftalikCiz(kayitlar, urunler, tedarikciler));
  } else {
    kap.append(ozetTabloCiz(kayitlar, oncekiler, urunler, tedarikciler, oteller));
  }

  if (durum.otel === "*") {
    kap.append(otelKarsilastirCiz(kayitlar, urunler, oteller));
  }
}

/* ------------------------------------------------------------------ *
 * Araç çubuğu
 * ------------------------------------------------------------------ */

async function araclarCiz() {
  const oteller = await S.aktifMaster("oteller");
  const urunler = await S.master("urunler");
  const kategoriler = [...new Set(urunler.map((u) => u.kategori))].sort();

  const sec = (etiket, deger, secenekler, degisti) =>
    el("div", { class: "field" }, [
      el("label", { text: etiket }),
      el("select", { onchange: (e) => { degisti(e.target.value); yenile(); } },
        secenekler.map((s) =>
          el("option", { value: s.deger, text: s.etiket, selected: s.deger === deger })
        )
      ),
    ]);

  const gorunumDugmesi = (kod, etiket) =>
    el("button", {
      "aria-pressed": String(durum.gorunum === kod),
      text: etiket,
      onclick: () => { durum.gorunum = kod; yenile(); },
    });

  return el("div", { class: "topbar", style: "padding-left:0;padding-right:0;background:none;border:0" }, [
    sec(t("common.period"), durum.donem,
      donemListesi(12).map((d) => ({ deger: d, etiket: d })),
      (v) => (durum.donem = v)),
    sec(t("common.hotel"), durum.otel,
      [{ deger: "*", etiket: t("common.allHotels") },
       ...oteller.map((o) => ({ deger: o.kod, etiket: cevirAd(o.ad) }))],
      (v) => (durum.otel = v)),
    sec(t("common.category"), durum.kategori,
      [{ deger: "*", etiket: t("common.allCategories") },
       ...kategoriler.map((k) => ({ deger: k, etiket: k }))],
      (v) => (durum.kategori = v)),
    el("div", { class: "seg" }, [
      gorunumDugmesi("haftalik", t("ledger.weekly")),
      gorunumDugmesi("aylik", t("ledger.monthly")),
      gorunumDugmesi("ceyreklik", t("ledger.quarterly")),
    ]),
    el("div", { class: "spacer", style: "margin-left:auto" }),
    el("button", { class: "btn", text: t("common.exportCsv"), onclick: disaAktar }),
    el("button", { class: "btn btn--primary", text: t("ledger.addPrice"), onclick: () => formAc() }),
  ]);
}

/* ------------------------------------------------------------------ *
 * Gruplama ve hesaplama
 * ------------------------------------------------------------------ */

function filtrele(kayitlar, urunler) {
  if (durum.kategori === "*") return kayitlar;
  const kod = new Set(urunler.filter((u) => u.kategori === durum.kategori).map((u) => u.kod));
  return kayitlar.filter((k) => kod.has(k.urunKodu));
}

function urunGrupla(kayitlar) {
  const harita = new Map();
  for (const k of kayitlar) {
    if (!harita.has(k.urunKodu)) harita.set(k.urunKodu, []);
    harita.get(k.urunKodu).push(k);
  }
  return harita;
}

function ortalama(liste) {
  if (!liste.length) return null;
  return liste.reduce((a, b) => a + b, 0) / liste.length;
}

function degisimOrani(simdi, once) {
  if (once == null || simdi == null || once === 0) return null;
  return ((simdi - once) / once) * 100;
}

/* ------------------------------------------------------------------ *
 * Özet
 * ------------------------------------------------------------------ */

function ozetCiz(kayitlar, oncekiler) {
  const grup = urunGrupla(kayitlar);
  const oncekiGrup = urunGrupla(oncekiler);

  const degisimler = [];
  for (const [urunKodu, liste] of grup) {
    const o = oncekiGrup.get(urunKodu);
    if (!o) continue;
    const d = degisimOrani(
      ortalama(liste.map((k) => k.birimFiyat)),
      ortalama(o.map((k) => k.birimFiyat))
    );
    if (d != null) degisimler.push(d);
  }

  const govde = el("div", { class: "stat-row" }, [
    kutu(String(kayitlar.length), t("ledger.stat.records")),
    kutu(String(grup.size), t("ledger.stat.products")),
    kutu(String(new Set(kayitlar.map((k) => k.tedarikciKodu)).size), t("ledger.stat.suppliers")),
    kutu(degisimler.length ? yuzde(ortalama(degisimler)) : "—", t("ledger.stat.avgChange")),
  ]);
  return panel(t("ledger.summary"), t("ledger.summaryHint"), govde);
}

function kutu(deger, etiket) {
  return el("div", { class: "stat" }, [
    el("div", { class: "stat__val", text: deger }),
    el("div", { class: "stat__lbl", text: etiket }),
  ]);
}

/* ------------------------------------------------------------------ *
 * Ana tablo — ürün bazında karşılaştırma
 * ------------------------------------------------------------------ */

function ozetTabloCiz(hamKayitlar, oncekiler, urunler, tedarikciler, oteller) {
  const kayitlar = filtrele(hamKayitlar, urunler);
  const grup = urunGrupla(kayitlar);
  const oncekiGrup = urunGrupla(oncekiler);

  const urunBul = (kod) => urunler.find((u) => u.kod === kod);
  const tedBul = (kod) => tedarikciler.find((x) => x.kod === kod);

  const satirlar = [...grup.entries()]
    .map(([urunKodu, liste]) => {
      const fiyatlar = liste.map((k) => k.birimFiyat).filter((f) => f != null);
      const min = Math.min(...fiyatlar), max = Math.max(...fiyatlar);
      const enUcuz = liste.find((k) => k.birimFiyat === min);
      const enPahali = liste.find((k) => k.birimFiyat === max);
      const onceki = oncekiGrup.get(urunKodu);
      return {
        urunKodu,
        urun: urunBul(urunKodu),
        liste, fiyatlar, min, max,
        ort: ortalama(fiyatlar),
        enUcuz, enPahali,
        yayilim: min ? ((max - min) / min) * 100 : 0,
        degisim: degisimOrani(
          ortalama(fiyatlar),
          onceki ? ortalama(onceki.map((k) => k.birimFiyat)) : null
        ),
      };
    })
    .sort((a, b) => b.yayilim - a.yayilim);

  const sutunlar = [
    { baslik: t("common.product"), hucre: (s) =>
      el("div", {}, [
        el("div", { class: "cell-strong", text: s.urun ? cevirAd(s.urun.ad) : s.urunKodu }),
        el("div", { class: "cell-code", text: `${s.urunKodu} · ${s.urun?.birim ?? ""}` }),
      ]) },
    { baslik: t("ledger.lowest"), sinif: "num", hucre: (s) =>
      el("div", {}, [
        el("div", { class: "cell-strong", text: sayi(s.min) }),
        el("div", { class: "cell-code", text: tedBul(s.enUcuz?.tedarikciKodu)?.unvan ?? "—" }),
      ]) },
    { baslik: t("ledger.average"), sinif: "num", hucre: (s) => sayi(s.ort) },
    { baslik: t("ledger.highest"), sinif: "num", hucre: (s) =>
      el("div", {}, [
        el("div", { text: sayi(s.max) }),
        el("div", { class: "cell-code", text: tedBul(s.enPahali?.tedarikciKodu)?.unvan ?? "—" }),
      ]) },
    { baslik: t("ledger.spread"), hucre: (s) =>
      el("div", {}, [
        yayilimCubugu(s.fiyatlar),
        el("div", { class: "cell-code", text: s.fiyatlar.length > 1 ? yuzde(s.yayilim) : t("ledger.singleQuote") }),
      ]) },
    { baslik: t("ledger.priceChange"), hucre: (s) => degisimRozeti(s.degisim) },
    { baslik: t("common.records"), sinif: "num cell-dim", hucre: (s) => String(s.liste.length) },
  ];

  const govde = tablo(sutunlar, satirlar, {
    bosBaslik: t("ledger.emptyTitle"),
    bosMetin: t("ledger.emptyHint"),
    altSatir: (s) => detayCiz(s, tedarikciler, oteller),
  });

  return panel(
    t("ledger.comparison"),
    t("ledger.comparisonHint"),
    govde
  );
}

function detayCiz(satir, tedarikciler, oteller) {
  const tedBul = (kod) => tedarikciler.find((x) => x.kod === kod);
  const otelBul = (kod) => oteller.find((x) => x.kod === kod);

  const sutunlar = [
    { baslik: t("common.date"), hucre: (k) => tarih(k.tarih) },
    { baslik: t("common.hotel"), hucre: (k) => cevirAd(otelBul(k.otelKodu)?.ad) || k.otelKodu },
    { baslik: t("common.supplier"), hucre: (k) => {
      const ted = tedBul(k.tedarikciKodu);
      if (!ted) return k.tedarikciKodu;
      return ted.aktif === false
        ? el("span", {}, [ted.unvan, " ", el("span", { class: "tag tag--off", text: t("common.inactive") })])
        : ted.unvan;
    } },
    { baslik: t("ledger.unitPrice"), sinif: "num", hucre: (k) => para(k.birimFiyat, k.paraBirimi) },
    { baslik: t("common.vat"), sinif: "num cell-dim", hucre: (k) => `${k.kdvOrani ?? 0}%` },
    { baslik: t("common.note"), sinif: "cell-dim", hucre: (k) => k.not || "—" },
    { baslik: t("common.enteredBy"), sinif: "cell-dim", hucre: (k) =>
      el("div", {}, [
        k._kullanici,
        " ",
        A.duzenlenebilir(k)
          ? el("button", { class: "btn btn--ghost", text: t("common.edit"), onclick: () => formAc(k) })
          : el("span", { class: "cell-dim", title: t("error.readOnly"), text: "🔒" }),
      ]) },
  ];

  return tablo(sutunlar, [...satir.liste].sort((a, b) => a.birimFiyat - b.birimFiyat));
}

/* ------------------------------------------------------------------ *
 * Otel karşılaştırma
 * ------------------------------------------------------------------ */

function otelKarsilastirCiz(kayitlar, urunler, oteller) {
  const kodlar = oteller.map((o) => o.kod);
  const grup = urunGrupla(filtrele(kayitlar, urunler));

  const satirlar = [];
  for (const [urunKodu, liste] of grup) {
    const ortalamalar = {};
    for (const kod of kodlar) {
      const f = liste.filter((k) => k.otelKodu === kod).map((k) => k.birimFiyat);
      ortalamalar[kod] = f.length ? ortalama(f) : null;
    }
    const dolu = Object.values(ortalamalar).filter((v) => v != null);
    if (dolu.length < 2) continue;
    satirlar.push({
      urunKodu,
      urun: urunler.find((u) => u.kod === urunKodu),
      ortalamalar,
      fark: degisimOrani(Math.max(...dolu), Math.min(...dolu)),
    });
  }
  satirlar.sort((a, b) => (b.fark ?? 0) - (a.fark ?? 0));

  const sutunlar = [
    { baslik: t("common.product"), hucre: (s) => s.urun ? cevirAd(s.urun.ad) : s.urunKodu },
    ...oteller.map((o) => ({
      baslik: cevirAd(o.ad), sinif: "num",
      hucre: (s) => s.ortalamalar[o.kod] == null ? "—" : sayi(s.ortalamalar[o.kod]),
    })),
    { baslik: t("ledger.gap"), hucre: (s) =>
      el("span", { class: `tag ${s.fark > 5 ? "tag--warn" : "tag--flat"}`, text: yuzde(s.fark) }) },
  ];

  return panel(
    t("ledger.compareHotels"),
    t("ledger.compareHotelsHint"),
    tablo(sutunlar, satirlar, {
      bosBaslik: t("ledger.noOverlapTitle"),
      bosMetin: t("ledger.noOverlapHint"),
    })
  );
}

/* ------------------------------------------------------------------ *
 * Haftalık görünüm
 * ------------------------------------------------------------------ */

function haftalikCiz(hamKayitlar, urunler, tedarikciler) {
  const kayitlar = filtrele(hamKayitlar, urunler);
  const haftalar = [...new Set(kayitlar.map((k) => haftaNo(k.tarih)))].sort((a, b) => a - b);
  const grup = urunGrupla(kayitlar);

  const satirlar = [...grup.entries()].map(([urunKodu, liste]) => {
    const haftalik = {};
    for (const h of haftalar) {
      const f = liste.filter((k) => haftaNo(k.tarih) === h).map((k) => k.birimFiyat);
      haftalik[h] = f.length ? ortalama(f) : null;
    }
    const dolu = haftalar.map((h) => haftalik[h]).filter((v) => v != null);
    return {
      urunKodu,
      urun: urunler.find((u) => u.kod === urunKodu),
      haftalik,
      trend: dolu.length > 1 ? degisimOrani(dolu[dolu.length - 1], dolu[0]) : null,
    };
  });

  const sutunlar = [
    { baslik: t("common.product"), hucre: (s) => s.urun ? cevirAd(s.urun.ad) : s.urunKodu },
    ...haftalar.map((h) => ({
      baslik: t("ledger.week", { no: h }), sinif: "num",
      hucre: (s) => s.haftalik[h] == null ? "—" : sayi(s.haftalik[h]),
    })),
    { baslik: t("ledger.trend"), hucre: (s) => degisimRozeti(s.trend) },
  ];

  return panel(
    t("ledger.weeklyView"),
    t("ledger.weeklyHint"),
    tablo(sutunlar, satirlar, { bosBaslik: t("ledger.emptyTitle"), bosMetin: t("ledger.emptyHint") })
  );
}

/* ------------------------------------------------------------------ *
 * Kayıt formu
 * ------------------------------------------------------------------ */

async function formAc(mevcut = null) {
  const oteller = await S.aktifMaster("oteller");
  const urunler = await S.aktifMaster("urunler");
  const tedarikciler = await S.aktifMaster("tedarikciler");

  cekmece(
    mevcut ? t("ledger.editPrice") : t("ledger.addPrice"),
    [
      { ad: "tarih", etiket: t("common.date"), tip: "date", zorunlu: true,
        deger: mevcut?.tarih || new Date().toISOString().slice(0, 10) },
      { ad: "otelKodu", etiket: t("common.hotel"), tip: "select", zorunlu: true,
        deger: mevcut?.otelKodu || (durum.otel === "*" ? A.anaOtel() : durum.otel),
        secenekler: oteller.map((o) => ({ deger: o.kod, etiket: cevirAd(o.ad) })) },
      { ad: "urunKodu", etiket: t("common.product"), tip: "select", zorunlu: true,
        deger: mevcut?.urunKodu,
        secenekler: urunler.map((u) => ({ deger: u.kod, etiket: `${cevirAd(u.ad)} (${u.birim})` })) },
      { ad: "tedarikciKodu", etiket: t("common.supplier"), tip: "select", zorunlu: true,
        deger: mevcut?.tedarikciKodu,
        secenekler: tedarikciler.map((x) => ({ deger: x.kod, etiket: x.unvan })) },
      { ad: "birimFiyat", etiket: t("ledger.unitPrice"), tip: "number", adim: "0.01", min: "0",
        zorunlu: true, deger: mevcut?.birimFiyat },
      { ad: "paraBirimi", etiket: t("common.currency"), tip: "select",
        deger: mevcut?.paraBirimi || "TRY",
        secenekler: ["TRY", "EUR", "USD"].map((c) => ({ deger: c, etiket: c })) },
      { ad: "kdvOrani", etiket: t("common.vat"), tip: "number", adim: "1", min: "0",
        deger: mevcut?.kdvOrani ?? 1 },
      { ad: "not", etiket: t("common.note"), tip: "textarea", deger: mevcut?.not },
    ],
    async (degerler) => {
      const urun = urunler.find((u) => u.kod === degerler.urunKodu);
      const kayit = {
        ...(mevcut ? { id: mevcut.id } : {}),
        ...degerler,
        birim: urun?.birim ?? "",
      };
      const donem = kayit.tarih.slice(0, 7);
      await S.yaz(modul, donem, kayit);
      bildir(mevcut ? t("ledger.saved") : t("ledger.added"));
      if (donem !== durum.donem && durum.gorunum !== "ceyreklik") durum.donem = donem;
      await yenile();
    }
  );
}

/* ------------------------------------------------------------------ *
 * Dışa aktarma
 * ------------------------------------------------------------------ */

async function disaAktar() {
  const kayitlar = await S.oku(modul, durum.donem, {
    otelKodu: durum.otel === "*" ? "*" : durum.otel,
  });
  if (!kayitlar.length) return bildir(t("common.noData"), true);

  const urunler = await S.master("urunler");
  const tedarikciler = await S.master("tedarikciler");

  csvIndir(
    `ledger-${durum.donem}.csv`,
    ["id", "tarih", "otel", "urunKodu", "urun", "tedarikciKodu", "tedarikci",
     "birim", "birimFiyat", "paraBirimi", "kdv", "not", "giren"],
    kayitlar.map((k) => [
      k.id, k.tarih, k.otelKodu, k.urunKodu,
      cevirAd(urunler.find((u) => u.kod === k.urunKodu)?.ad),
      k.tedarikciKodu, tedarikciler.find((x) => x.kod === k.tedarikciKodu)?.unvan ?? "",
      k.birim, k.birimFiyat, k.paraBirimi, k.kdvOrani, k.not, k._kullanici,
    ])
  );
}
