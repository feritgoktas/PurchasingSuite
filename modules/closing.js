/**
 * modules/closing.js — FSH-P Closing Cockpit
 *
 * KAPSAM ÖNERİSİDİR (CLAUDE.md bölüm 9). Modülün ne üreteceği henüz
 * kesinleşmediği için burada makul bir ilk sürüm kuruldu: kapanış, "veri
 * eksiksiz mi" sorusunun cevaplandığı ve dönemin özetinin dondurulduğu yerdir.
 *
 * Altı panel:
 *   1. Kapanış kontrol listesi — tek yazılan veri budur
 *   2. Veri kapsamı — fiyatı girilmemiş aktif ürünler
 *   3. Fiyat hareketi — önceki döneme göre en çok değişenler
 *   4. Oteller arası fark
 *   5. Teklif durumu
 *   6. Kullanıcı bazlı giriş sayısı
 *
 * Bu modül ledger.js ve rfq.js dosyalarını ÇAĞIRMAZ; onların verisini
 * storage.js üzerinden okur (CLAUDE.md bölüm 2.5).
 */

import { t, ad as cevirAd } from "../core/i18n.js";
import * as S from "../core/storage.js";
import * as A from "../core/auth.js";
import {
  el, temizle, tablo, panel, bildir, sayi, yuzde, tarih,
  buDonem, oncekiDonem, donemListesi, jsonIndir,
} from "../core/ui.js";

export const modul = "closing";
export const navAnahtar = "nav.closing";

const MADDELER = [
  "closing.check.prices",
  "closing.check.gaps",
  "closing.check.quotes",
  "closing.check.suppliers",
  "closing.check.review",
];

const durum = { donem: oncekiDonem(buDonem()), otel: "*" };

let kap = null;

export async function ciz(hedef) {
  kap = hedef;
  await yenile();
}

async function yenile() {
  temizle(kap);
  kap.append(await araclarCiz());

  const secenek = { otelKodu: durum.otel === "*" ? "*" : durum.otel };
  const ledger = await S.oku("ledger", durum.donem, secenek);
  const onceki = await S.oku("ledger", oncekiDonem(durum.donem), secenek);
  const rfq = await S.oku("rfq", durum.donem, secenek);
  const kapanis = await S.oku(modul, durum.donem, secenek);

  const urunler = await S.master("urunler");
  const tedarikciler = await S.master("tedarikciler");
  const oteller = await S.master("oteller");

  kap.append(kontrolListesiCiz(kapanis));
  kap.append(kapsamCiz(ledger, urunler, oteller));
  kap.append(hareketCiz(ledger, onceki, urunler));
  kap.append(otelFarkiCiz(ledger, urunler, oteller));
  kap.append(teklifDurumuCiz(rfq));
  kap.append(girisDagilimiCiz(ledger, rfq));
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

  return el("div", {}, [
    el("p", { class: "view__intro", text: t("closing.intro") }),
    el("div", { class: "topbar", style: "padding-left:0;padding-right:0;background:none;border:0" }, [
      sec(t("common.period"), durum.donem,
        donemListesi(12).map((d) => ({ deger: d, etiket: d })), (v) => (durum.donem = v)),
      sec(t("common.hotel"), durum.otel,
        [{ deger: "*", etiket: t("common.allHotels") },
         ...oteller.map((o) => ({ deger: o.kod, etiket: cevirAd(o.ad) }))], (v) => (durum.otel = v)),
      el("div", { class: "spacer", style: "margin-left:auto" }),
      el("button", { class: "btn", text: t("closing.exportPackage"), onclick: paketAktar }),
    ]),
  ]);
}

/* ---------- 1. kontrol listesi ---------- */

function kontrolListesiCiz(kapanis) {
  const otelKodu = durum.otel === "*" ? A.anaOtel() : durum.otel;
  const govde = el("div");

  for (const madde of MADDELER) {
    const ayni = kapanis.filter((k) => k.madde === madde && k.otelKodu === otelKodu);
    // Yazma her zaman kendi kaydımıza yapılır; gösterimde işaretleyen kim varsa o görünür.
    const benim = ayni.find((k) => k._kullanici === A.kullaniciKodu());
    const mevcut = ayni.find((k) => k.tamam === true) || benim;
    const tamam = ayni.some((k) => k.tamam === true);

    const kutu = el("input", { type: "checkbox", checked: tamam, onchange: async (e) => {
      try {
        await S.yaz(modul, durum.donem, {
          ...(benim ? { id: benim.id } : {}),
          otelKodu,
          madde,
          tamam: e.target.checked,
          tarih: new Date().toISOString().slice(0, 10),
        });
        bildir(t("closing.checkSaved"));
        await yenile();
      } catch (err) {
        console.error(err);
        e.target.checked = !e.target.checked;
        bildir(t("error.saveFailed"), true);
      }
    }});

    govde.append(
      el("label", { class: "settings__row", style: "cursor:pointer" }, [
        el("div", {}, [
          el("strong", { text: t(madde) }),
          mevcut ? el("span", { text: t("closing.checkedBy", {
            kisi: mevcut._kullanici, tarih: tarih(mevcut.tarih),
          }) }) : el("span", { text: t("closing.notChecked") }),
        ]),
        kutu,
      ])
    );
  }

  return panel(t("closing.checklist"), t("closing.checklistHint", { otel: otelKodu }), govde);
}

/* ---------- 2. veri kapsamı ---------- */

function kapsamCiz(ledger, urunler, oteller) {
  const aktifUrunler = urunler.filter((u) => u.aktif !== false);
  const hedefOteller = durum.otel === "*" ? oteller.filter((o) => o.aktif !== false) : oteller.filter((o) => o.kod === durum.otel);

  const satirlar = [];
  for (const otel of hedefOteller) {
    const girilen = new Set(ledger.filter((k) => k.otelKodu === otel.kod).map((k) => k.urunKodu));
    const eksik = aktifUrunler.filter((u) => !girilen.has(u.kod));
    satirlar.push({
      otel,
      girilen: girilen.size,
      toplam: aktifUrunler.length,
      oran: aktifUrunler.length ? (girilen.size / aktifUrunler.length) * 100 : 0,
      eksik,
    });
  }

  const sutunlar = [
    { baslik: t("common.hotel"), hucre: (s) => cevirAd(s.otel.ad) },
    { baslik: t("closing.covered"), sinif: "num", hucre: (s) => `${s.girilen} / ${s.toplam}` },
    { baslik: t("closing.coverage"), hucre: (s) =>
      el("span", {
        class: `tag ${s.oran >= 90 ? "tag--fall" : s.oran >= 60 ? "tag--warn" : "tag--rise"}`,
        text: `${sayi(s.oran, 0)}%`,
      }) },
    { baslik: t("closing.missing"), sinif: "cell-dim", hucre: (s) =>
      s.eksik.length ? s.eksik.slice(0, 6).map((u) => cevirAd(u.ad)).join(", ") + (s.eksik.length > 6 ? ` +${s.eksik.length - 6}` : "") : "—" },
  ];

  return panel(t("closing.coverageTitle"), t("closing.coverageHint"), tablo(sutunlar, satirlar));
}

/* ---------- 3. fiyat hareketi ---------- */

function hareketCiz(ledger, onceki, urunler) {
  const ort = (liste) => liste.length ? liste.reduce((a, b) => a + b, 0) / liste.length : null;
  const grupla = (kayitlar) => {
    const m = new Map();
    for (const k of kayitlar) {
      if (!m.has(k.urunKodu)) m.set(k.urunKodu, []);
      m.get(k.urunKodu).push(k.birimFiyat);
    }
    return m;
  };

  const simdi = grupla(ledger), evvel = grupla(onceki);
  const satirlar = [];
  for (const [kod, fiyatlar] of simdi) {
    const o = evvel.get(kod);
    if (!o) continue;
    const a = ort(fiyatlar), b = ort(o);
    if (!b) continue;
    satirlar.push({
      kod,
      urun: urunler.find((u) => u.kod === kod),
      simdi: a, evvel: b,
      degisim: ((a - b) / b) * 100,
    });
  }
  satirlar.sort((x, y) => Math.abs(y.degisim) - Math.abs(x.degisim));

  const sutunlar = [
    { baslik: t("common.product"), hucre: (s) => s.urun ? cevirAd(s.urun.ad) : s.kod },
    { baslik: t("closing.previousAvg"), sinif: "num cell-dim", hucre: (s) => sayi(s.evvel) },
    { baslik: t("closing.currentAvg"), sinif: "num", hucre: (s) => sayi(s.simdi) },
    { baslik: t("ledger.priceChange"), hucre: (s) =>
      el("span", {
        class: `tag ${s.degisim > 0.5 ? "tag--rise" : s.degisim < -0.5 ? "tag--fall" : "tag--flat"}`,
        text: yuzde(s.degisim),
      }) },
  ];

  return panel(
    t("closing.movement"),
    t("closing.movementHint", { donem: oncekiDonem(durum.donem) }),
    tablo(sutunlar, satirlar.slice(0, 15), {
      bosBaslik: t("closing.noComparison"),
      bosMetin: t("closing.noComparisonHint"),
    })
  );
}

/* ---------- 4. oteller arası fark ---------- */

function otelFarkiCiz(ledger, urunler, oteller) {
  if (durum.otel !== "*") {
    return panel(t("closing.hotelGap"), t("closing.hotelGapHint"),
      el("div", { class: "empty" }, [
        el("strong", { text: t("closing.selectAllHotels") }),
        t("closing.selectAllHotelsHint"),
      ]));
  }

  const ort = (l) => l.length ? l.reduce((a, b) => a + b, 0) / l.length : null;
  const kodlar = oteller.map((o) => o.kod);
  const urunKodlari = [...new Set(ledger.map((k) => k.urunKodu))];

  const satirlar = [];
  for (const kod of urunKodlari) {
    const degerler = {};
    for (const o of kodlar) {
      degerler[o] = ort(ledger.filter((k) => k.urunKodu === kod && k.otelKodu === o).map((k) => k.birimFiyat));
    }
    const dolu = Object.values(degerler).filter((v) => v != null);
    if (dolu.length < 2) continue;
    const min = Math.min(...dolu), max = Math.max(...dolu);
    satirlar.push({ kod, urun: urunler.find((u) => u.kod === kod), degerler, fark: ((max - min) / min) * 100 });
  }
  satirlar.sort((a, b) => b.fark - a.fark);

  const sutunlar = [
    { baslik: t("common.product"), hucre: (s) => s.urun ? cevirAd(s.urun.ad) : s.kod },
    ...oteller.map((o) => ({
      baslik: cevirAd(o.ad), sinif: "num",
      hucre: (s) => s.degerler[o.kod] == null ? "—" : sayi(s.degerler[o.kod]),
    })),
    { baslik: t("ledger.gap"), hucre: (s) =>
      el("span", { class: `tag ${s.fark > 10 ? "tag--rise" : s.fark > 5 ? "tag--warn" : "tag--flat"}`, text: yuzde(s.fark) }) },
  ];

  return panel(t("closing.hotelGap"), t("closing.hotelGapHint"),
    tablo(sutunlar, satirlar, { bosBaslik: t("ledger.noOverlapTitle"), bosMetin: t("ledger.noOverlapHint") }));
}

/* ---------- 5. teklif durumu ---------- */

function teklifDurumuCiz(rfq) {
  const bugun = new Date().toISOString().slice(0, 10);
  const say = (f) => String(rfq.filter(f).length);

  const govde = el("div", { class: "stat-row" }, [
    kutu(String(new Set(rfq.map((k) => k.talepNo)).size), t("rfq.stat.requests")),
    kutu(say((k) => (k.durum || "acik") === "acik"), t("rfq.stat.open")),
    kutu(say((k) => k.durum === "onaylandi"), t("rfq.status.onaylandi")),
    kutu(say((k) => k.gecerlilikTarihi && k.gecerlilikTarihi < bugun), t("rfq.stat.expired")),
  ]);
  return panel(t("closing.quotes"), t("closing.quotesHint"), govde);
}

function kutu(deger, etiket) {
  return el("div", { class: "stat" }, [
    el("div", { class: "stat__val", text: deger }),
    el("div", { class: "stat__lbl", text: etiket }),
  ]);
}

/* ---------- 6. giriş dağılımı ---------- */

function girisDagilimiCiz(ledger, rfq) {
  const kullanicilar = A.kullaniciListesi();
  const satirlar = kullanicilar.map((k) => ({
    kullanici: k,
    ledger: ledger.filter((x) => x._kullanici === k.kullanici).length,
    rfq: rfq.filter((x) => x._kullanici === k.kullanici).length,
  }));

  const sutunlar = [
    { baslik: t("common.enteredBy"), hucre: (s) => s.kullanici.adSoyad || s.kullanici.kullanici },
    { baslik: t("nav.ledger"), sinif: "num", hucre: (s) => String(s.ledger) },
    { baslik: t("nav.rfq"), sinif: "num", hucre: (s) => String(s.rfq) },
    { baslik: t("closing.total"), sinif: "num cell-strong", hucre: (s) => String(s.ledger + s.rfq) },
  ];

  return panel(t("closing.contribution"), t("closing.contributionHint"), tablo(sutunlar, satirlar));
}

/* ---------- dışa aktarma ---------- */

async function paketAktar() {
  const secenek = { otelKodu: durum.otel === "*" ? "*" : durum.otel };
  const paket = {
    olusturma: new Date().toISOString(),
    olusturan: A.kullaniciKodu(),
    donem: durum.donem,
    otel: durum.otel,
    ledger: await S.oku("ledger", durum.donem, secenek),
    rfq: await S.oku("rfq", durum.donem, secenek),
    kapanis: await S.oku(modul, durum.donem, secenek),
  };
  jsonIndir(`closing-${durum.donem}-${durum.otel}.json`, paket);
  bildir(t("closing.exported"));
}
