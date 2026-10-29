# Yuh Scanner Mobile

Digitalize documentos com a **câmera do celular**: o app acha a folha sozinho, endireita, deixa com cara de digitalizado e gera **PDF** ou **JPG** para salvar ou enviar (WhatsApp, e-mail…).

**Abrir o app:** https://ryuuuuuki.github.io/yuh-scanner-mobile/

Funciona em **Android e iPhone**, direto pelo navegador, e pode ser instalado na tela inicial:
- **Android (Chrome):** toque em **Instalar** no aviso do app (ou menu ⋮ → *Instalar app*).
- **iPhone (Safari):** toque em **Compartilhar** → **Adicionar à Tela de Início**.

## Recursos

- Câmera com **detecção automática da folha** e modo **Auto** (tira a foto sozinho quando a folha fica parada)
- **Ajustar bordas** com lupa, endireitamento da perspectiva
- Filtros **Realçado** (tira sombra, fundo branco), **Original**, **Cinza** e **P&B**
- Várias páginas, **organizar** arrastando, girar, refazer foto, excluir
- Importar fotos da **galeria**
- **PDF** ou **JPG**, com nome; enviar pelo compartilhar do celular ou salvar
- Documentos **guardados no próprio celular**; funciona **sem internet** depois da primeira abertura
- Tema claro/escuro

**Privacidade:** tudo é processado no próprio aparelho. Nenhuma foto ou documento é enviado para servidor algum.

## Estrutura

```
index.html              telas
css/app.css             visual (mesmas cores e fonte do Yuh Scanner para Windows)
js/app.js               fluxo e telas
js/bordas.js            acha a folha na foto (cantos)
js/imagem.js            endireitar, filtros, girar
js/banco.js             guarda os documentos no celular (IndexedDB)
js/pdf.js               monta o PDF
sw.js                   funciona sem internet e atualiza sozinho
manifest.webmanifest    instalar na tela inicial
docs/                   protótipo aprovado
```

## Publicar uma versão nova

1. Aumente a versão em `js/app.js` (`VERSAO`) **e** em `sw.js` (`VERSAO`) — as duas iguais.
2. Commit e push na branch `main`. O GitHub Pages publica em ~1 minuto e os celulares pegam a versão nova sozinhos na próxima abertura.

## Fonte

Atkinson Hyperlegible (Braille Institute), licença SIL Open Font License — `fontes/OFL.txt`.
