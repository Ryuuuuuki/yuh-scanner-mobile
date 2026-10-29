# Testes (Playwright + Chromium)

Rodados pelo Claude no ambiente dele; não fazem parte do app publicado.

1. `cena.js` gera fotos de exemplo (folha torta sobre mesa) a partir de `docs/prototipo-mobile.html`.
   Um script Python (ver histórico) transforma `cena0.png` em `camera.y4m`, o "vídeo da câmera".
2. Servir a raiz do repositório: `python3 -m http.server 8791 --bind 127.0.0.1`
3. `LANG=C.UTF-8 node app.js` (fluxo completo com câmera falsa), `varios.js` (vários arquivos + Sugerir nome),
   `compat.js` (tamanhos de tela, navegador sem `dvh`, câmera negada, sem armazenamento, enviar recusado, 15 fotos),
   `lento.js` (toque → foto com o processador 6× mais lento).

Os caminhos (`/tmp/claude-0/e2e/mobile/`) apontam para onde as fotos de exemplo ficam.
