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
Scripts em `testes/` (ver `testes/README.md`). Compatibilidade mínima pensada: **iOS 15+** e **Chrome/Android 87+** (Samsung Internet 14+). Sintaxe até ES2020.
Playwright (Chromium) com câmera falsa: `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<arquivo.y4m>` (vídeo de uma folha sobre a mesa) e perfis `Pixel 7` / `iPhone 13`. WebKit não está instalado no ambiente: o Safari real só é testado no iPhone do Iuri. Para nomes com acento no download, rodar com `LANG=C.UTF-8`.

## Versões
- 1.2.0 Levar para o formulário no PC (Yuh Extension): menu ⋮ → Conectar ao PC (QR + código de 4 números), pacotes trancados (ECDH+AES-GCM, `js/cripto.js` = cópia de `yuh-extension/lib/cripto.js`) via carteiro na Cloudflare; Kuru nas esperas.
- 1.2.1 Ícone de QR Code no canto superior direito da tela inicial (ao lado da lua) abre direto o leitor para conectar ao PC.
- 1.3.0 Ao conectar (QR + código), manda sozinho para o PC todos os documentos do celular que ainda não foram para ele (até 20; controle em localStorage `yuh-enviados` por PC, doc.id → alterado). A extensão (0.3.2) lê vários em fila.
- 1.3.1 Folga embaixo em todas as telas quando o Android entrega ao app também a faixa da barra de botões (◀ ● ■) sem avisar: `ajustarFundo()` em app.js (Android em pé e `screen.height - innerHeight < 70` → `--fundo-extra: 48px`); no CSS tudo usa `var(--fundo)` = max(área segura, folga).
- 1.0.0 app; 1.0.1 foto com um toque (quadro do vídeo, câmera fica ligada nas bordas); 1.1.0 vários arquivos (salvar separado) + Sugerir nome; 1.1.1 sem `viewport-fit=cover` (no Android novo o app ficava por baixo da barra de navegação: o Chrome não informa a área segura); 1.1.2 compatibilidade: `100vh` antes de `100dvh` (Chrome < 108 / iOS < 15.4 abriam em branco), sem `inset` (iOS 14), memória de imagens liberada na hora (limite do iPhone), plano B do Enviar (NotAllowedError), aviso em aba anônima, moldura de celular só no computador, layout compacto em tela baixa.

## Pendências
- Testar no iPhone e Android de verdade (câmera, flash, Auto, compartilhar).
- Ideias: detecção mais precisa em mesa clara; OCR/PDF pesquisável; enviar para o PC (Yuh Scanner Windows).
