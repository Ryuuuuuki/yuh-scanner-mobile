const { chromium, devices } = require('playwright');
const D = '/tmp/claude-0/e2e/mobile/';
const ok = (c, m) => { console.log((c ? 'ok: ' : 'FALHOU: ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${D}camera.y4m`] });
  // ---------- tamanhos de tela ----------
  const telas = { 'iPhone SE (1ª geração) 320x568': { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    'Android pequeno 360x640': { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    'iPhone 13': devices['iPhone 13'], 'Galaxy S20 Ultra': devices['Galaxy S20 Ultra'] || { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
    'Tablet 768x1024': { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true } };
  for (const [nome, cfg] of Object.entries(telas)){
    const ctx = await b.newContext({ ...cfg, permissions: ['camera'] }); const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8791/'); await p.waitForTimeout(700);
    const problemas = [];
    const checa = async tela => {
      const r = await p.evaluate(() => {
        const W = innerWidth, H = innerHeight, fora = [];
        for (const el of document.querySelectorAll('.tela:not([hidden]) button, .tela:not([hidden]) input, .folha-baixo button, .fab')){
          const q = el.getBoundingClientRect(); if (!q.width || getComputedStyle(el).visibility === 'hidden') continue;
          if (el.closest('.tira, .filtros, .sug, .carrossel, .grade, .lista, .sep-lista')) continue; // listas que rolam
          if (q.right > W + 1 || q.bottom > H + 1 || q.left < -1) fora.push((el.id || el.className || el.textContent).toString().slice(0, 30));
        }
        return { fora, scroll: document.documentElement.scrollWidth > W };
      });
      if (r.fora.length || r.scroll) problemas.push(`${tela}: ${r.fora.join(', ')}${r.scroll ? ' (rolagem lateral)' : ''}`);
    };
    await checa('início');
    await p.tap('#bDigitalizar'); await p.waitForTimeout(1500); await checa('câmera');
    await p.setInputFiles('#arqGaleria', [D + 'cena0.png', D + 'cena1.png', D + 'cena2.png']); await p.waitForSelector('#tDoc:not([hidden])', { timeout: 40000 }); await p.waitForTimeout(800);
    await checa('documento');
    await p.tap('#fBordas'); await p.waitForSelector('#tBordas:not([hidden])'); await p.waitForTimeout(400); await checa('bordas'); await p.tap('#bordCancelar'); await p.waitForTimeout(400);
    await p.tap('#bSalvar'); await p.waitForTimeout(500); await checa('salvar');
    await p.screenshot({ path: `${D}tam-${cfg.viewport.width}-salvar.png` });
    await p.tap('#eVarios'); await p.waitForTimeout(600); await p.tap('.cartao >> nth=0 >> .corte >> nth=0'); await p.waitForTimeout(300); await checa('vários arquivos');
    await p.screenshot({ path: `${D}tam-${cfg.viewport.width}-varios.png` });
    ok(!problemas.length && !errs.length, `${nome}: tudo cabe na tela${problemas.length ? ' → ' + problemas.join(' | ') : ''}${errs.length ? ' ERROS ' + errs : ''}`);
    await ctx.close();
  }
  // ---------- navegador antigo (sem "dvh") ----------
  {
    const ctx = await b.newContext({ ...devices['Pixel 7'] }); const p = await ctx.newPage();
    await p.route('**/css/app.css', async r => { const resp = await r.fetch(); r.fulfill({ response: resp, body: (await resp.text()).replace(/dvh/g, 'xvh') }); });
    await p.goto('http://localhost:8791/?antigo'); await p.waitForTimeout(800);
    const h = await p.$eval('.celular', e => e.getBoundingClientRect().height), fab = await p.$eval('.fab', e => e.getBoundingClientRect().bottom);
    ok(h > 500 && fab < h, `navegador sem "dvh": app ocupa a tela (${Math.round(h)} px) e o botão aparece`);
    await ctx.close();
  }
  // ---------- erros ----------
  {
    const ctx = await b.newContext({ ...devices['Pixel 7'] }); const p = await ctx.newPage(); // sem permissão de câmera
    await p.goto('http://localhost:8791/'); await p.waitForTimeout(600);
    await p.addInitScript(() => {});
    await p.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })); });
    await p.tap('#bDigitalizar'); await p.waitForTimeout(800);
    ok(await p.isVisible('#camErro') && (await p.textContent('#camErroTxt')).includes('negado'), 'câmera negada: explica e oferece a galeria');
    await ctx.close();
  }
  {
    const ctx = await b.newContext({ ...devices['Pixel 7'] }); const p = await ctx.newPage();
    await p.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined }); });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8791/'); await p.waitForTimeout(800);
    ok((await p.textContent('#aviso')).includes('anônim') && !errs.length, 'sem armazenamento (aba anônima): avisa sem travar');
    await ctx.close();
  }
  {
    const ctx = await b.newContext({ ...devices['Pixel 7'] }); const p = await ctx.newPage();
    await p.goto('http://localhost:8791/'); await p.waitForTimeout(600);
    await p.tap('#bDigitalizar'); await p.waitForTimeout(600);
    await p.setInputFiles('#arqGaleria', [D + 'cena0.png']); await p.waitForSelector('#tDoc:not([hidden])', { timeout: 30000 }); await p.waitForTimeout(500);
    await p.evaluate(() => { let n = 0; navigator.canShare = () => true; navigator.share = () => (++n === 1 ? Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })) : (window.__compartilhou = true, Promise.resolve())); });
    await p.tap('#bSalvar'); await p.waitForTimeout(400); await p.tap('#sEnviar'); await p.waitForTimeout(2000);
    const temBotao = await p.isVisible('#aviso button');
    if (temBotao) await p.tap('#aviso button'); await p.waitForTimeout(300);
    ok(temBotao && await p.evaluate(() => !!window.__compartilhou), 'celular recusou o enviar (demorou): aviso com botão "Enviar" resolve');
    await ctx.close();
  }
  // ---------- muitas fotos seguidas (memória) ----------
  {
    const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto('http://localhost:8791/'); await p.waitForTimeout(600);
    await p.tap('#bDigitalizar'); await p.waitForTimeout(600);
    const lista = []; for (let i = 0; i < 15; i++) lista.push(D + `cena${i % 3}.png`);
    await p.setInputFiles('#arqGaleria', lista); await p.waitForSelector('#tDoc:not([hidden])', { timeout: 180000 }); await p.waitForTimeout(1000);
    const vivos = await p.evaluate(() => [...document.querySelectorAll('canvas')].filter(c => c.width * c.height > 1e6).length);
    ok((await p.$$('#carrossel .slide')).length === 15 && !errs.length, `15 fotos seguidas sem erro (imagens grandes ainda na memória da tela: ${vivos})`);
    await ctx.close();
  }
  await b.close();
})();
