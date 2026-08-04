/**
 * server.js — bağımlılıksız yerel sunucu
 *
 *   node server.js            → http://localhost:8080
 *   node server.js 9000 /veri → farklı port ve veri klasörü
 *
 * İki iş yapar:
 *   1. Statik dosyaları sunar (index.html, core/, modules/, config/)
 *   2. data/ klasörü için küçük bir okuma/yazma API'si sağlar
 *
 * Yalnızca data/ altına yazar. Yol dışına çıkma girişimleri reddedilir.
 * Kimlik doğrulama yoktur — sunucuyu iç ağda çalıştırın (CLAUDE.md bölüm 5).
 */

const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const url = require("url");

const PORT = Number(process.argv[2]) || 8080;
const KOK = __dirname;
const VERI_KOK = path.resolve(KOK, process.argv[3] || "data");

const TIPLER = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function guvenliYol(kok, istenen) {
  const tam = path.resolve(kok, istenen);
  if (tam !== kok && !tam.startsWith(kok + path.sep)) return null;
  return tam;
}

function json(yanit, kod, govde) {
  const g = JSON.stringify(govde);
  yanit.writeHead(kod, { "Content-Type": TIPLER[".json"], "Content-Length": Buffer.byteLength(g) });
  yanit.end(g);
}

async function govdeOku(istek) {
  const parcalar = [];
  let boyut = 0;
  for await (const p of istek) {
    boyut += p.length;
    if (boyut > 5 * 1024 * 1024) throw new Error("Gövde çok büyük");
    parcalar.push(p);
  }
  return Buffer.concat(parcalar).toString("utf8");
}

const sunucu = http.createServer(async (istek, yanit) => {
  const ayrik = url.parse(istek.url, true);
  const yol = decodeURIComponent(ayrik.pathname);

  try {
    /* ---------- API ---------- */

    if (yol === "/api/ping") {
      return json(yanit, 200, { durum: "hazir", veriKok: path.relative(KOK, VERI_KOK) || "data" });
    }

    if (yol === "/api/file") {
      const istenen = String(ayrik.query.path || "").replace(/^data\//, "");
      const tam = guvenliYol(VERI_KOK, istenen);
      if (!tam || !tam.endsWith(".json")) return json(yanit, 400, { hata: "Geçersiz yol" });

      if (istek.method === "GET") {
        try {
          const metin = await fs.readFile(tam, "utf8");
          yanit.writeHead(200, { "Content-Type": TIPLER[".json"] });
          return yanit.end(metin);
        } catch {
          return json(yanit, 404, { hata: "Bulunamadı" });
        }
      }

      if (istek.method === "PUT") {
        const metin = await govdeOku(istek);
        try {
          JSON.parse(metin); // bozuk JSON diske yazılmaz
        } catch (e) {
          return json(yanit, 400, { hata: "Geçersiz JSON", ayrinti: String(e.message) });
        }
        await fs.mkdir(path.dirname(tam), { recursive: true });
        await fs.writeFile(tam, metin, "utf8");
        return json(yanit, 200, { durum: "yazildi" });
      }

      return json(yanit, 405, { hata: "Desteklenmeyen yöntem" });
    }

    if (yol === "/api/list") {
      const istenen = String(ayrik.query.dir || "").replace(/^data\//, "");
      const tam = guvenliYol(VERI_KOK, istenen);
      if (!tam) return json(yanit, 400, { hata: "Geçersiz yol" });
      try {
        const girisler = await fs.readdir(tam, { withFileTypes: true });
        return json(yanit, 200, girisler.filter((g) => g.isFile()).map((g) => g.name));
      } catch {
        return json(yanit, 200, []);
      }
    }

    /* ---------- statik ---------- */

    const istenen = yol === "/" ? "index.html" : yol.slice(1);
    const tam = guvenliYol(KOK, istenen);
    if (!tam) { yanit.writeHead(403); return yanit.end("Yasak"); }

    const govde = await fs.readFile(tam);
    yanit.writeHead(200, {
      "Content-Type": TIPLER[path.extname(tam)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    yanit.end(govde);
  } catch (e) {
    if (e && e.code === "ENOENT") { yanit.writeHead(404); return yanit.end("Bulunamadı"); }
    console.error(e);
    yanit.writeHead(500);
    yanit.end("Sunucu hatası");
  }
});

sunucu.listen(PORT, () => {
  console.log(`Purchasing Suite  →  http://localhost:${PORT}`);
  console.log(`Veri klasörü      →  ${VERI_KOK}`);
});
