# Yuh Scanner Mobile — notas para o Claude

Projeto do Iuri (GitHub `Ryuuuuuki`). Conversa em português, informal, explicações simples. **Na interface, sempre perguntar os detalhes visuais antes de mudar** (pedido dele). Ele gosta de protótipo em HTML para avaliar.

- App pelo navegador (PWA) para **Android e iPhone** (no cartório tem os dois). Escolhido em vez de app nativo: iPhone nativo exige conta Apple paga + Mac; Android seria APK fora da loja.
- Hospedado no **GitHub Pages** deste repositório (branch `main`, raiz). Sessões do Claude não podem criar repositório nem ligar o Pages (o Iuri faz pelo site).
- Sem build: HTML/CSS/JS puros (módulos ES). Única biblioteca: **Tesseract.js 5.1.1** em `ocr/` (a mesma do Windows), carregada só no "Sugerir nome" e guardada pelo `sw.js` num cache próprio (`yuh-ocr-5.1.1`).
- Tudo roda no aparelho (detecção de bordas, filtros, PDF). Dados no IndexedDB (`js/banco.js`).
- Versão: `VERSAO` em `js/app.js` **e** em `sw.js` (iguais). Mudou arquivo → aumenta a versão, senão o celular continua com o cache antigo.
- Projeto irmão: Yuh Scanner para Windows (`Ryuuuuuki/yuh-scanner`), mesmas cores/fonte.
- Pasta de trabalho do Iuri no PC pessoal: `C:\Users\iurip\Documents\YuhScanner Mobile`.

## Testes
Playwright (Chromium) com câmera falsa: `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<arquivo.y4m>` (vídeo de uma folha sobre a mesa) e perfis `Pixel 7` / `iPhone 13`. WebKit não está instalado no ambiente: o Safari real só é testado no iPhone do Iuri. Para nomes com acento no download, rodar com `LANG=C.UTF-8`.

## Versões
- 1.0.0 app; 1.0.1 foto com um toque (quadro do vídeo, câmera fica ligada nas bordas); 1.1.0 vários arquivos (salvar separado) + Sugerir nome.

## Pendências
- Testar no iPhone e Android de verdade (câmera, flash, Auto, compartilhar).
- Ideias: detecção mais precisa em mesa clara; OCR/PDF pesquisável; enviar para o PC (Yuh Scanner Windows).
