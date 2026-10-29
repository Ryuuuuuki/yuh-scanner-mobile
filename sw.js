// Yuh Scanner Mobile — guarda o app no celular para abrir rápido e funcionar sem internet.
// Ao publicar uma versão nova, aumente VERSAO: o celular baixa tudo de novo sozinho.
const VERSAO = "1.1.2";
const CACHE = "yuh-mobile-" + VERSAO;
const CACHE_OCR = "yuh-ocr-5.1.1"; // não muda a cada versão do app (o leitor é sempre o mesmo)
const ARQUIVOS = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/imagem.js", "js/bordas.js", "js/banco.js", "js/pdf.js", "js/ocr.js",
  "fontes/atkinson-hyperlegible-latin-400-normal.woff2", "fontes/atkinson-hyperlegible-latin-700-normal.woff2",
  "icones/icone-192.png", "icones/icone-512.png", "icones/icone-32.png", "icones/apple-touch-icon.png",
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS.map(a => new Request(a, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("yuh-mobile-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  // o leitor de texto (pasta ocr/, ~5 MB) só é baixado quando alguém usa "Sugerir nome";
  // depois fica guardado para funcionar sem internet
  const ocr = new URL(e.request.url).pathname.includes("/ocr/");
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(resp => {
    if (ocr && resp.ok){ const copia = resp.clone(); caches.open(CACHE_OCR).then(c => c.put(e.request, copia)); }
    return resp;
  })));
});
