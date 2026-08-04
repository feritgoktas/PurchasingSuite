/**
 * core/app.js — açılış, gezinme, ayarlar
 *
 * Modüller burada tembel yüklenir. Yeni bir modül eklemek için MODULLER
 * dizisine bir satır yazmak yeterlidir; başka hiçbir dosyaya dokunulmaz.
 */

import { i18nBaslat, dilAyarla, dil, t, ad as cevirAd, dilListesi } from "./i18n.js";
import * as A from "./auth.js";
import * as S from "./storage.js";
import { el, temizle, bildir } from "./ui.js";

const MODULLER = [
  { kod: "ledger", yukle: () => import("../modules/ledger.js") },
  { kod: "rfq", yukle: () => import("../modules/rfq.js") },
  { kod: "closing", yukle: () => import("../modules/closing.js") },
];

const navKap = document.querySelector("[data-nav]");
const gorunumKap = document.querySelector("[data-view]");
const baslikKap = document.querySelector("[data-title]");
const kullaniciKap = document.querySelector("[data-user-switch]");
const otelSatiri = document.querySelector("[data-hotel-line]");
const depoSatiri = document.querySelector("[data-storage-mode]");

let aktifSayfa = "ledger";

baslat();

async function baslat() {
  try {
    await A.authBaslat();
    await i18nBaslat(A.tercihDil());
    const kip = await S.storageBaslat();
    depoSatiri.textContent = t(kip === "bellek" ? "app.modeDemo" : "app.modeSaved");
    await arayuzCiz();
    await sayfaAc(aktifSayfa);
  } catch (e) {
    console.error(e);
    gorunumKap.append(
      el("div", { class: "empty" }, [
        el("strong", { text: "Startup failed" }),
        String(e.message || e),
      ])
    );
  }
}

async function arayuzCiz() {
  const kullanici = A.aktifKullanici();
  const oteller = await S.master("oteller");
  const otel = oteller.find((o) => o.kod === kullanici.anaOtel);
  otelSatiri.textContent = cevirAd(otel?.ad) || kullanici.anaOtel;

  temizle(navKap);
  for (const m of MODULLER) {
    if (!A.modulErisimi(m.kod)) continue;
    const modulNav = { ledger: "nav.ledger", rfq: "nav.rfq", closing: "nav.closing" }[m.kod];
    navKap.append(
      el("button", {
        class: "rail__link",
        text: t(modulNav),
        "aria-current": aktifSayfa === m.kod ? "page" : null,
        onclick: () => sayfaAc(m.kod),
      })
    );
  }
  navKap.append(
    el("button", {
      class: "rail__link",
      text: t("nav.settings"),
      "aria-current": aktifSayfa === "settings" ? "page" : null,
      onclick: () => sayfaAc("settings"),
    })
  );

  temizle(kullaniciKap);
  kullaniciKap.append(
    el("div", { class: "field" }, [
      el("label", { text: t("app.signedInAs") }),
      el("select", {
        onchange: async (e) => {
          A.kullaniciSec(e.target.value);
          await dilAyarla(A.tercihDil());
          await arayuzCiz();
          await sayfaAc(aktifSayfa);
        },
      }, A.kullaniciListesi().map((k) =>
        el("option", {
          value: k.kullanici,
          text: k.adSoyad || k.kullanici,
          selected: k.kullanici === kullanici.kullanici,
        })
      )),
    ])
  );
}

async function sayfaAc(kod) {
  aktifSayfa = kod;
  temizle(gorunumKap);
  await arayuzCiz();

  if (kod === "settings") {
    baslikKap.textContent = t("nav.settings");
    gorunumKap.append(await ayarlarCiz());
    return;
  }

  const tanim = MODULLER.find((m) => m.kod === kod);
  if (!tanim) return;

  const m = await tanim.yukle();
  baslikKap.append(
    el("span", { text: t(m.navAnahtar) }),
    el("em", { text: "  " + t("app.titleHint") })
  );
  await m.ciz(gorunumKap);
}

async function ayarlarCiz() {
  const kap = el("div", { class: "settings" });

  if (!S.kaliciMi()) {
    kap.append(el("div", { class: "notice" }, [el("span", { text: t("app.demoNotice") })]));
  }

  kap.append(
    el("div", { class: "settings__row" }, [
      el("div", {}, [
        el("strong", { text: t("settings.language") }),
        el("span", { text: t("settings.languageHint") }),
      ]),
      el("select", {
        onchange: async (e) => {
          A.tercihDilYaz(e.target.value);
          await dilAyarla(e.target.value);
          await sayfaAc("settings");
          bildir(t("settings.languageSaved"));
        },
      }, dilListesi().map((d) =>
        el("option", { value: d.kod, text: d.etiket, selected: d.kod === dil() })
      )),
    ])
  );

  const oteller = await S.master("oteller");
  kap.append(
    el("div", { class: "settings__row" }, [
      el("div", {}, [
        el("strong", { text: t("settings.defaultHotel") }),
        el("span", { text: t("settings.defaultHotelHint") }),
      ]),
      el("div", { class: "cell-strong", text: cevirAd(oteller.find((o) => o.kod === A.anaOtel())?.ad) }),
    ])
  );

  kap.append(
    el("div", { class: "settings__row" }, [
      el("div", {}, [
        el("strong", { text: t("settings.storage") }),
        el("span", { text: t(S.kaliciMi() ? "settings.storageServer" : "settings.storageMemory") }),
      ]),
      el("span", { class: `tag ${S.kaliciMi() ? "tag--fall" : "tag--warn"}`, text: S.adapterAdi() }),
    ])
  );

  kap.append(
    el("div", { class: "settings__row" }, [
      el("div", {}, [
        el("strong", { text: t("settings.role") }),
        el("span", { text: t("settings.roleHint") }),
      ]),
      el("span", { class: "tag tag--accent", text: A.aktifKullanici().rol }),
    ])
  );

  return kap;
}
