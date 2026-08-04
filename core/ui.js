/**
 * core/ui.js — ortak arayüz bileşenleri
 *
 * Modüller kendi HTML'ini elle kurmaz; buradaki yapıcıları kullanır.
 * Böylece tablo, form ve biçimlendirme davranışı tek yerden değişir.
 */

import { t, dil } from "./i18n.js";

/* ---------- element yardımcıları ---------- */

export function el(etiket, ozellik = {}, cocuklar = []) {
  const d = document.createElement(etiket);
  for (const [k, v] of Object.entries(ozellik)) {
    if (v == null || v === false) continue;
    if (k === "class") d.className = v;
    else if (k === "html") d.innerHTML = v;
    else if (k === "text") d.textContent = v;
    else if (k.startsWith("on")) d.addEventListener(k.slice(2).toLowerCase(), v);
    else d.setAttribute(k, v === true ? "" : v);
  }
  for (const c of [].concat(cocuklar)) {
    if (c == null || c === false) continue;
    d.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return d;
}

export function temizle(kap) {
  while (kap.firstChild) kap.removeChild(kap.firstChild);
  return kap;
}

/* ---------- biçimlendirme ---------- */

const yerel = () => (dil() === "tr" ? "tr-TR" : "en-GB");

export function sayi(deger, basamak = 2) {
  if (deger == null || Number.isNaN(deger)) return "—";
  return Number(deger).toLocaleString(yerel(), {
    minimumFractionDigits: basamak,
    maximumFractionDigits: basamak,
  });
}

export function para(deger, birim = "TRY") {
  if (deger == null || Number.isNaN(deger)) return "—";
  return `${sayi(deger)} ${birim}`;
}

export function tarih(iso) {
  if (!iso) return "—";
  return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString(
    yerel(),
    { day: "2-digit", month: "short", year: "numeric" }
  );
}

export function yuzde(deger, basamak = 1) {
  if (deger == null || !Number.isFinite(deger)) return "—";
  const isaret = deger > 0 ? "+" : "";
  return `${isaret}${sayi(deger, basamak)}%`;
}

/** Değişim rozeti: artış kırmızı, düşüş yeşil, değişmeyen nötr. */
export function degisimRozeti(oran) {
  if (oran == null || !Number.isFinite(oran)) {
    return el("span", { class: "tag tag--flat", text: "—" });
  }
  const sinif = oran > 0.5 ? "tag--rise" : oran < -0.5 ? "tag--fall" : "tag--flat";
  return el("span", { class: `tag ${sinif}`, text: yuzde(oran) });
}

/* ---------- imza bileşeni: yayılım çubuğu ---------- */

/**
 * Bir ürünün tedarikçiler arası fiyat aralığını çizer.
 * Sol uç = en ucuz, sağ uç = en pahalı, çentikler = tekil teklifler.
 * Aralık ne kadar genişse pazarlık payı o kadar büyüktür — bu panelin
 * asıl bilgisi budur, süs değildir.
 */
export function yayilimCubugu(fiyatlar, kapsamMin, kapsamMax) {
  const G = 132, Y = 18, p = 4;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "spread");
  svg.setAttribute("viewBox", `0 0 ${G} ${Y}`);
  svg.setAttribute("role", "img");

  const min = Math.min(...fiyatlar), max = Math.max(...fiyatlar);
  svg.setAttribute("aria-label", `${sayi(min)} – ${sayi(max)}`);

  const alt = kapsamMin ?? min, ust = kapsamMax ?? max;
  const genislik = ust - alt || 1;
  const x = (v) => p + ((v - alt) / genislik) * (G - 2 * p);

  const yol = (sinif, ...attr) => {
    const e = document.createElementNS("http://www.w3.org/2000/svg", attr[0]);
    e.setAttribute("class", sinif);
    for (let i = 1; i < attr.length; i += 2) e.setAttribute(attr[i], attr[i + 1]);
    svg.append(e);
  };

  yol("spread__track", "rect", "x", p, "y", Y / 2 - 1, "width", G - 2 * p, "height", 2, "rx", 1);
  yol("spread__range", "rect", "x", x(min), "y", Y / 2 - 3, "width", Math.max(x(max) - x(min), 1), "height", 6, "rx", 2);
  for (const f of fiyatlar) {
    yol("spread__tick", "line", "x1", x(f), "y1", Y / 2 - 5, "x2", x(f), "y2", Y / 2 + 5);
  }
  yol("spread__dot--low", "circle", "cx", x(min), "cy", Y / 2, "r", 3);
  yol("spread__dot--high", "circle", "cx", x(max), "cy", Y / 2, "r", 3);
  return svg;
}

/* ---------- panel ve tablo ---------- */

export function panel(baslik, aciklama, govde, aksiyonlar = []) {
  const bas = el("div", { class: "panel__head" }, [
    el("h2", { text: baslik }),
    aciklama ? el("p", { text: aciklama }) : null,
    el("div", { class: "spacer" }),
    ...aksiyonlar,
  ]);
  const kap = el("div", { class: "panel" }, [bas]);
  kap.append(
    el("div", { class: govde.dataset?.flush ? "panel__body panel__body--flush" : "panel__body" }, [govde])
  );
  return kap;
}

/**
 * @param {object[]} sutunlar  { anahtar, baslik, sinif, hucre(satir) }
 * @param {object[]} satirlar
 * @param {object} [secenek]   { altSatir(satir), bosMetin }
 */
export function tablo(sutunlar, satirlar, secenek = {}) {
  const kap = el("div");
  kap.dataset.flush = "1";

  if (!satirlar.length) {
    kap.append(
      el("div", { class: "empty" }, [
        el("strong", { text: secenek.bosBaslik || t("common.noData") }),
        secenek.bosMetin || "",
      ])
    );
    return kap;
  }

  const thead = el("thead", {}, [
    el("tr", {}, [
      secenek.altSatir ? el("th", { style: "width:24px" }) : null,
      ...sutunlar.map((s) => el("th", { class: s.sinif, text: s.baslik })),
    ]),
  ]);

  const tbody = el("tbody");
  for (const satir of satirlar) {
    const tr = el("tr");
    let acik = false, altTr = null;

    if (secenek.altSatir) {
      const dugme = el("button", {
        class: "row-toggle",
        "aria-expanded": "false",
        "aria-label": t("common.details"),
        text: "▸",
        onclick: () => {
          acik = !acik;
          dugme.textContent = acik ? "▾" : "▸";
          dugme.setAttribute("aria-expanded", String(acik));
          if (acik) {
            altTr = el("tr", { class: "sub" }, [
              el("td", { colspan: sutunlar.length + 1 }, [secenek.altSatir(satir)]),
            ]);
            tr.after(altTr);
          } else {
            altTr?.remove();
            altTr = null;
          }
        },
      });
      tr.append(el("td", {}, [dugme]));
    }

    for (const s of sutunlar) {
      tr.append(el("td", { class: s.sinif }, [s.hucre ? s.hucre(satir) : satir[s.anahtar] ?? "—"]));
    }
    tbody.append(tr);
  }

  kap.append(el("table", { class: "grid" }, [thead, tbody]));
  return kap;
}

/* ---------- form çekmecesi ---------- */

/**
 * @param {string} baslik
 * @param {object[]} alanlar  { ad, etiket, tip, secenekler, deger, zorunlu, adim }
 * @param {function} kaydet   async (degerler) => void
 */
export function cekmece(baslik, alanlar, kaydet) {
  const girisler = {};

  const govde = el("div", { class: "drawer__body" });
  for (const a of alanlar) {
    let giris;
    if (a.tip === "select") {
      giris = el("select", { name: a.ad, required: a.zorunlu });
      for (const s of a.secenekler) {
        giris.append(el("option", { value: s.deger, text: s.etiket, selected: String(s.deger) === String(a.deger) }));
      }
    } else if (a.tip === "textarea") {
      giris = el("textarea", { name: a.ad, rows: 2 });
      giris.value = a.deger ?? "";
    } else {
      giris = el("input", { type: a.tip || "text", name: a.ad, required: a.zorunlu, step: a.adim, min: a.min });
      giris.value = a.deger ?? "";
    }
    girisler[a.ad] = giris;
    govde.append(el("div", { class: "field" }, [el("label", { text: a.etiket }), giris]));
  }

  const kapat = () => arka.remove();

  const kaydetDugmesi = el("button", { class: "btn btn--primary", text: t("common.save"), onclick: async () => {
    const degerler = {};
    for (const [ad, g] of Object.entries(girisler)) {
      if (g.required && !g.value) { g.focus(); return; }
      degerler[ad] = g.type === "number" ? (g.value === "" ? null : Number(g.value)) : g.value;
    }
    kaydetDugmesi.disabled = true;
    try {
      await kaydet(degerler);
      kapat();
    } catch (e) {
      console.error(e);
      bildir(t("error.saveFailed"), true);
      kaydetDugmesi.disabled = false;
    }
  }});

  const arka = el("div", { class: "drawer-bg", onclick: (e) => { if (e.target === arka) kapat(); } }, [
    el("div", { class: "drawer", role: "dialog", "aria-modal": "true" }, [
      el("div", { class: "drawer__head" }, [
        el("h2", { text: baslik }),
        el("div", { class: "spacer" }),
        el("button", { class: "btn btn--ghost", text: "✕", "aria-label": t("common.cancel"), onclick: kapat }),
      ]),
      govde,
      el("div", { class: "drawer__foot" }, [
        el("button", { class: "btn", text: t("common.cancel"), onclick: kapat }),
        kaydetDugmesi,
      ]),
    ]),
  ]);

  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { kapat(); document.removeEventListener("keydown", esc); }
  });

  document.body.append(arka);
  Object.values(girisler)[0]?.focus();
}

/* ---------- bildirim ---------- */

export function bildir(metin, hata = false) {
  const d = el("div", { class: `toast${hata ? " toast--bad" : ""}`, text: metin });
  document.body.append(d);
  setTimeout(() => d.remove(), 2600);
}

/* ---------- dönem yardımcıları ---------- */

export function buDonem() {
  return new Date().toISOString().slice(0, 7);
}

export function oncekiDonem(donem) {
  const [y, a] = donem.split("-").map(Number);
  return a === 1 ? `${y - 1}-12` : `${y}-${String(a - 1).padStart(2, "0")}`;
}

export function donemListesi(adet = 12) {
  const liste = [];
  let d = buDonem();
  for (let i = 0; i < adet; i++) { liste.push(d); d = oncekiDonem(d); }
  return liste;
}

export function ceyrekDonemleri(donem) {
  const [y, a] = donem.split("-").map(Number);
  const ilk = Math.floor((a - 1) / 3) * 3 + 1;
  return [0, 1, 2].map((i) => `${y}-${String(ilk + i).padStart(2, "0")}`);
}

/** ISO hafta numarası — haftalık görünüm tarihten türetilir, ayrı dosya açılmaz. */
export function haftaNo(isoTarih) {
  const d = new Date(isoTarih + "T00:00:00");
  const g = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  g.setUTCDate(g.getUTCDate() + 4 - (g.getUTCDay() || 7));
  const yilBasi = new Date(Date.UTC(g.getUTCFullYear(), 0, 1));
  return Math.ceil(((g - yilBasi) / 86400000 + 1) / 7);
}

/* ---------- dışa aktarma ---------- */

export function csvIndir(dosyaAdi, basliklar, satirlar) {
  const kacir = (v) => {
    const s = v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const metin = [basliklar, ...satirlar].map((r) => r.map(kacir).join(";")).join("\r\n");
  indir(dosyaAdi, "\uFEFF" + metin, "text/csv;charset=utf-8");
}

export function jsonIndir(dosyaAdi, veri) {
  indir(dosyaAdi, JSON.stringify(veri, null, 2), "application/json");
}

function indir(dosyaAdi, icerik, tip) {
  const url = URL.createObjectURL(new Blob([icerik], { type: tip }));
  const a = el("a", { href: url, download: dosyaAdi });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
