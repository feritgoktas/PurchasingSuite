/**
 * modules/rfq.js — non-food fiyat teklifleri
 *
 * Teklifler talep numarasına göre gruplanır. Bir talebin altındaki teklifler
 * yan yana karşılaştırılır; en düşük teklif ve geçerliliği dolmuş teklifler
 * işaretlenir.
 */

import { t, ad as cevirAd } from "../core/i18n.js";
import * as S from "../core/storage.js";
import * as A from "../core/auth.js";
import {
  el, temizle, tablo, panel, cekmece, bildir, sayi, para, tarih, yuzde,
  buDonem, donemListesi, csvIndir,
} from "../core/ui.js";

export const modul = "rfq";
export const navAnahtar = "nav.rfq";

const DURUMLAR = ["acik", "onaylandi", "iptal"];

const durum = {
  donem: buDonem(),
  otel: "*",
  kayitDurumu: "*",
};

let kap = null;

export async function ciz(hedef) {
  kap = hedef;
  await yenile();
}

async function yenile() {
  temizle(kap);
  kap.append(await araclarCiz());

  const kayitlar = await S.oku(modul, durum.donem, {
    otelKodu: durum.otel === "*" ? "*" : durum.otel,
  });
  const suzulmus = durum.kayitDurumu === "*"
    ? kayitlar
    : kayitlar.filter((k) => (k.durum || "acik") === durum.kayitDurumu);

  const urunler = await S.master("urunler");
  const tedarikciler = await S.master("tedarikciler");
  const oteller = await S.master("oteller");

  kap.append(ozetCiz(suzulmus));
  kap.append(taleplerCiz(suzulmus, urunler, tedarikciler, oteller));
}

/* ---------- araç çubuğu ---------- */

async function araclarCiz() {
  const oteller = await S.aktifMaster("oteller");

  const sec = (etiket, deger, secenekler, degisti) =>
    el("div", { class: "field" }, [
      el("label", { text: etiket }),
      el("select", { onchange: (e) => { degisti(e.target.value); yenile(); } },
        secenekler.map((s) =>
          el("option", { value: s.deger, text: s.etiket, selected: s.deger === deger })
        )),
    ]);

  return el("div", { class: "topbar", style: "padding-left:0;padding-right:0;background:none;border:0" }, [
    sec(t("common.period"), durum.donem,
      donemListesi(12).map((d) => ({ deger: d, etiket: d })), (v) => (durum.donem = v)),
    sec(t("common.hotel"), durum.otel,
      [{ deger: "*", etiket: t("common.allHotels") },
       ...oteller.map((o) => ({ deger: o.kod, etiket: cevirAd(o.ad) }))], (v) => (durum.otel = v)),
    sec(t("rfq.status"), durum.kayitDurumu,
      [{ deger: "*", etiket: t("rfq.allStatuses") },
       ...DURUMLAR.map((d) => ({ deger: d, etiket: t(`rfq.status.${d}`) }))],
      (v) => (durum.kayitDurumu = v)),
    el("div", { class: "spacer", style: "margin-left:auto" }),
    el("button", { class: "btn", text: t("common.exportCsv"), onclick: disaAktar }),
    el("button", { class: "btn btn--primary", text: t("rfq.addQuote"), onclick: () => formAc() }),
  ]);
}

/* ---------- özet ---------- */

function ozetCiz(kayitlar) {
  const talepler = new Set(kayitlar.map((k) => k.talepNo));
  const acik = kayitlar.filter((k) => (k.durum || "acik") === "acik");
  const suresiDolmus = kayitlar.filter(gecerlilikDoldu);

  const govde = el("div", { class: "stat-row" }, [
    kutu(String(talepler.size), t("rfq.stat.requests")),
    kutu(String(kayitlar.length), t("rfq.stat.quotes")),
    kutu(String(acik.length), t("rfq.stat.open")),
    kutu(String(suresiDolmus.length), t("rfq.stat.expired")),
  ]);
  return panel(t("rfq.summary"), t("rfq.summaryHint"), govde);
}

function kutu(deger, etiket) {
  return el("div", { class: "stat" }, [
    el("div", { class: "stat__val", text: deger }),
    el("div", { class: "stat__lbl", text: etiket }),
  ]);
}

function gecerlilikDoldu(k) {
  return !!k.gecerlilikTarihi && k.gecerlilikTarihi < new Date().toISOString().slice(0, 10);
}

/* ---------- talep tablosu ---------- */

function taleplerCiz(kayitlar, urunler, tedarikciler, oteller) {
  const harita = new Map();
  for (const k of kayitlar) {
    const anahtar = `${k.talepNo}|${k.kalemKodu}|${k.otelKodu}`;
    if (!harita.has(anahtar)) harita.set(anahtar, []);
    harita.get(anahtar).push(k);
  }

  const satirlar = [...harita.values()].map((liste) => {
    const fiyatlar = liste.map((k) => k.teklifFiyat).filter((f) => f != null);
    const min = Math.min(...fiyatlar), max = Math.max(...fiyatlar);
    return {
      ilk: liste[0],
      liste,
      min, max,
      tasarruf: min && max !== min ? ((max - min) / max) * 100 : null,
      terminler: liste.map((k) => k.terminGun).filter((x) => x != null),
    };
  }).sort((a, b) => (b.tasarruf ?? 0) - (a.tasarruf ?? 0));

  const kalemAdi = (kod) => {
    const u = urunler.find((x) => x.kod === kod);
    return u ? cevirAd(u.ad) : kod;
  };
  const otelAdi = (kod) => cevirAd(oteller.find((o) => o.kod === kod)?.ad) || kod;

  const sutunlar = [
    { baslik: t("rfq.requestNo"), hucre: (s) =>
      el("div", {}, [
        el("div", { class: "cell-strong", text: s.ilk.talepNo }),
        el("div", { class: "cell-code", text: otelAdi(s.ilk.otelKodu) }),
      ]) },
    { baslik: t("rfq.itemCode"), hucre: (s) =>
      el("div", {}, [
        el("div", { text: kalemAdi(s.ilk.kalemKodu) }),
        el("div", { class: "cell-code", text: s.ilk.kalemKodu }),
      ]) },
    { baslik: t("rfq.quoteCount"), sinif: "num cell-dim", hucre: (s) => String(s.liste.length) },
    { baslik: t("rfq.bestQuote"), sinif: "num", hucre: (s) =>
      el("div", { class: "cell-strong", text: para(s.min, s.ilk.paraBirimi) }) },
    { baslik: t("rfq.highestQuote"), sinif: "num cell-dim", hucre: (s) => sayi(s.max) },
    { baslik: t("rfq.potentialSaving"), hucre: (s) =>
      s.tasarruf == null
        ? el("span", { class: "tag tag--flat", text: t("rfq.singleQuote") })
        : el("span", { class: "tag tag--fall", text: yuzde(-s.tasarruf) }) },
    { baslik: t("rfq.leadTime"), sinif: "num cell-dim", hucre: (s) =>
      s.terminler.length ? `${Math.min(...s.terminler)}–${Math.max(...s.terminler)}` : "—" },
    { baslik: t("rfq.status"), hucre: (s) => durumRozeti(s.liste) },
  ];

  return panel(
    t("rfq.requests"),
    t("rfq.requestsHint"),
    tablo(sutunlar, satirlar, {
      bosBaslik: t("rfq.emptyTitle"),
      bosMetin: t("rfq.emptyHint"),
      altSatir: (s) => tekliflerCiz(s, tedarikciler),
    })
  );
}

function durumRozeti(liste) {
  if (liste.some((k) => k.durum === "onaylandi")) {
    return el("span", { class: "tag tag--accent", text: t("rfq.status.onaylandi") });
  }
  if (liste.every((k) => k.durum === "iptal")) {
    return el("span", { class: "tag tag--flat", text: t("rfq.status.iptal") });
  }
  if (liste.some(gecerlilikDoldu)) {
    return el("span", { class: "tag tag--warn", text: t("rfq.expired") });
  }
  return el("span", { class: "tag tag--flat", text: t("rfq.status.acik") });
}

function tekliflerCiz(satir, tedarikciler) {
  const sirali = [...satir.liste].sort((a, b) => a.teklifFiyat - b.teklifFiyat);

  const sutunlar = [
    { baslik: t("common.supplier"), hucre: (k, i) => {
      const ted = tedarikciler.find((x) => x.kod === k.tedarikciKodu);
      const parcalar = [ted?.unvan ?? k.tedarikciKodu];
      if (k === sirali[0]) parcalar.push(" ", el("span", { class: "tag tag--fall", text: t("rfq.best") }));
      if (ted?.aktif === false) parcalar.push(" ", el("span", { class: "tag tag--off", text: t("common.inactive") }));
      return el("div", {}, parcalar);
    } },
    { baslik: t("rfq.quotedPrice"), sinif: "num", hucre: (k) => para(k.teklifFiyat, k.paraBirimi) },
    { baslik: t("common.vat"), sinif: "num cell-dim", hucre: (k) => `${k.kdvOrani ?? 0}%` },
    { baslik: t("rfq.leadTime"), sinif: "num", hucre: (k) => k.terminGun ?? "—" },
    { baslik: t("rfq.validUntil"), hucre: (k) =>
      gecerlilikDoldu(k)
        ? el("span", { class: "tag tag--warn", text: tarih(k.gecerlilikTarihi) })
        : tarih(k.gecerlilikTarihi) },
    { baslik: t("rfq.status"), hucre: (k) =>
      el("span", { class: "tag tag--flat", text: t(`rfq.status.${k.durum || "acik"}`) }) },
    { baslik: t("common.note"), sinif: "cell-dim", hucre: (k) => k.not || "—" },
    { baslik: t("common.enteredBy"), sinif: "cell-dim", hucre: (k) =>
      el("div", {}, [
        k._kullanici, " ",
        A.duzenlenebilir(k)
          ? el("button", { class: "btn btn--ghost", text: t("common.edit"), onclick: () => formAc(k) })
          : el("span", { class: "cell-dim", title: t("error.readOnly"), text: "🔒" }),
      ]) },
  ];

  return tablo(sutunlar, sirali);
}

/* ---------- form ---------- */

async function formAc(mevcut = null) {
  const oteller = await S.aktifMaster("oteller");
  const urunler = await S.aktifMaster("urunler");
  const tedarikciler = await S.aktifMaster("tedarikciler");

  cekmece(
    mevcut ? t("rfq.editQuote") : t("rfq.addQuote"),
    [
      { ad: "talepNo", etiket: t("rfq.requestNo"), tip: "text", zorunlu: true,
        deger: mevcut?.talepNo || talepNoOner() },
      { ad: "tarih", etiket: t("common.date"), tip: "date", zorunlu: true,
        deger: mevcut?.tarih || new Date().toISOString().slice(0, 10) },
      { ad: "otelKodu", etiket: t("common.hotel"), tip: "select", zorunlu: true,
        deger: mevcut?.otelKodu || (durum.otel === "*" ? A.anaOtel() : durum.otel),
        secenekler: oteller.map((o) => ({ deger: o.kod, etiket: cevirAd(o.ad) })) },
      { ad: "kalemKodu", etiket: t("rfq.itemCode"), tip: "select", zorunlu: true,
        deger: mevcut?.kalemKodu,
        secenekler: urunler.map((u) => ({ deger: u.kod, etiket: `${cevirAd(u.ad)} (${u.birim})` })) },
      { ad: "tedarikciKodu", etiket: t("common.supplier"), tip: "select", zorunlu: true,
        deger: mevcut?.tedarikciKodu,
        secenekler: tedarikciler.map((x) => ({ deger: x.kod, etiket: x.unvan })) },
      { ad: "teklifFiyat", etiket: t("rfq.quotedPrice"), tip: "number", adim: "0.01", min: "0",
        zorunlu: true, deger: mevcut?.teklifFiyat },
      { ad: "paraBirimi", etiket: t("common.currency"), tip: "select",
        deger: mevcut?.paraBirimi || "TRY",
        secenekler: ["TRY", "EUR", "USD"].map((c) => ({ deger: c, etiket: c })) },
      { ad: "kdvOrani", etiket: t("common.vat"), tip: "number", adim: "1", min: "0",
        deger: mevcut?.kdvOrani ?? 20 },
      { ad: "terminGun", etiket: t("rfq.leadTime"), tip: "number", adim: "1", min: "0",
        deger: mevcut?.terminGun },
      { ad: "gecerlilikTarihi", etiket: t("rfq.validUntil"), tip: "date",
        deger: mevcut?.gecerlilikTarihi },
      { ad: "durum", etiket: t("rfq.status"), tip: "select", deger: mevcut?.durum || "acik",
        secenekler: DURUMLAR.map((d) => ({ deger: d, etiket: t(`rfq.status.${d}`) })) },
      { ad: "not", etiket: t("common.note"), tip: "textarea", deger: mevcut?.not },
    ],
    async (degerler) => {
      const kayit = { ...(mevcut ? { id: mevcut.id } : {}), ...degerler };
      const donem = kayit.tarih.slice(0, 7);
      await S.yaz(modul, donem, kayit);
      bildir(mevcut ? t("rfq.saved") : t("rfq.added"));
      if (donem !== durum.donem) durum.donem = donem;
      await yenile();
    }
  );
}

function talepNoOner() {
  const yil = new Date().getFullYear();
  const sira = String(Math.floor(Math.random() * 9000) + 1000);
  return `RFQ-${yil}-${sira}`;
}

/* ---------- dışa aktarma ---------- */

async function disaAktar() {
  const kayitlar = await S.oku(modul, durum.donem, {
    otelKodu: durum.otel === "*" ? "*" : durum.otel,
  });
  if (!kayitlar.length) return bildir(t("common.noData"), true);

  const tedarikciler = await S.master("tedarikciler");
  csvIndir(
    `rfq-${durum.donem}.csv`,
    ["id", "talepNo", "tarih", "otel", "kalemKodu", "tedarikciKodu", "tedarikci",
     "teklifFiyat", "paraBirimi", "kdv", "terminGun", "gecerlilik", "durum", "not", "giren"],
    kayitlar.map((k) => [
      k.id, k.talepNo, k.tarih, k.otelKodu, k.kalemKodu, k.tedarikciKodu,
      tedarikciler.find((x) => x.kod === k.tedarikciKodu)?.unvan ?? "",
      k.teklifFiyat, k.paraBirimi, k.kdvOrani, k.terminGun,
      k.gecerlilikTarihi, k.durum, k.not, k._kullanici,
    ])
  );
}
