// Yuh Scanner Mobile — guarda o app no celular para abrir rápido e funcionar sem internet.
// Ao publicar uma versão nova, aumente VERSAO: o celular baixa tudo de novo sozinho.
const VERSAO = "1.0.1";
const CACHE = "yuh-mobile-" + VERSAO;
const ARQUIVOS = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/imagem.js", "js/bordas.js", "js/banco.js", "js/pdf.js",
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
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
