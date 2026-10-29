const { chromium, devices } = require('playwright');
const fs = require('fs');
const D = '/tmp/claude-0/e2e/mobile/';
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${D}camera.y4m`] });
  const ctx = await b.newContext({ ...devices['Pixel 7'], acceptDownloads: true, permissions: ['camera'] });
  let p = await ctx.newPage();
  const errs = []; const ligar = pg => { pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text())); };
  ligar(p);
  const ok = (c, m) => { console.log((c ? 'ok: ' : 'FALHOU: ') + m); if (!c) process.exitCode = 1; };
  const S = n => p.screenshot({ path: `${D}app-${n}.png` });
  await p.goto('http://localhost:8791/'); await p.waitForTimeout(800);
  ok(await p.isVisible('.vazio'), 'início vazio');
  ok(await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), 'service worker registrado (funciona sem internet)');
  await S('1-inicio');
  await p.tap('#bDigitalizar');
  await p.waitForFunction(() => document.querySelector('#contorno polygon').getAttribute('points'), null, { timeout: 8000 });
  ok(true, 'achou a folha no vídeo ao vivo');
  await S('2-camera');
  await p.waitForSelector('#tBordas:not([hidden])', { timeout: 10000 });
  ok(true, 'modo Auto tirou a foto sozinho');
  await p.waitForTimeout(400); await S('3-bordas');
  const cantos = await p.evaluate(() => document.querySelector('#bordSvg polygon').getAttribute('points'));
  ok(cantos && cantos.split(' ').length === 4, 'bordas já vêm marcadas: ' + cantos);
  await p.tap('#bordMais'); await p.waitForTimeout(1500);
  ok(!(await p.isHidden('#tCamera')) && (await p.textContent('#camPilhaN')) === '1', 'voltou para a câmera com 1 página');
  // não tira de novo a mesma folha sozinho
  await p.waitForTimeout(3000);
  ok(!(await p.isHidden('#tCamera')), 'Auto não repete a mesma folha');
  await p.tap('#camDisparo'); await p.waitForSelector('#tBordas:not([hidden])', { timeout: 8000 });
  await p.tap('#bordConcluir'); await p.waitForSelector('#tDoc:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(1500);
  ok((await p.$$('#carrossel .slide img:not([hidden])')).length === 2, 'documento com 2 páginas');
  await S('4-documento');
  // filtro P&B e girar
  await p.tap('.filtro >> nth=3'); await p.waitForTimeout(2500);
  ok(await p.evaluate(() => document.querySelector('.filtro[aria-pressed="true"]').textContent) === 'P&B', 'filtro P&B');
  await S('5-pb');
  // galeria: foto já tirada antes
  await p.tap('#fAdd'); await p.waitForTimeout(800);
  await p.setInputFiles('#arqGaleria', D + 'cena1.png'); await p.waitForSelector('#tDoc:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(1500);
  ok((await p.$$('#carrossel .slide')).length === 3, 'foto da galeria entrou endireitada como página 3');
  // persiste ao fechar e abrir
  await p.close(); p = await ctx.newPage(); ligar(p);
  await p.goto('http://localhost:8791/'); await p.waitForTimeout(1200);
  ok((await p.$$('.doc')).length === 1 && (await p.textContent('.doc small')).includes('3 páginas'), 'documento continua lá depois de fechar o app');
  await S('6-lista');
  await p.tap('.doc'); await p.waitForTimeout(2000);
  ok((await p.$$('#carrossel .slide img:not([hidden])')).length === 3, 'páginas carregadas do celular');
  // renomear e salvar PDF
  await p.tap('#docTitulo'); await p.waitForTimeout(400); await p.fill('.folha-baixo input', 'Procuração Maria'); await p.tap('.folha-baixo .btn.principal'); await p.waitForTimeout(500);
  ok((await p.textContent('#docNome')) === 'Procuração Maria', 'renomear');
  await p.tap('#bSalvar'); await p.waitForTimeout(500); await S('7-salvar');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.tap('#sBaixar')]);
  await dl.saveAs(D + 'saida.pdf'); const pdf = fs.readFileSync(D + 'saida.pdf', 'latin1');
  ok(dl.suggestedFilename() === 'Procuração Maria.pdf' && (pdf.match(/\/Type \/Page /g) || []).length === 3, `PDF ${dl.suggestedFilename()} com 3 páginas (${Math.round(pdf.length / 1024)} KB)`);
  // excluir página
  await p.tap('#fExcluir'); await p.waitForTimeout(400); await p.tap('.opcoes-lista .perigo'); await p.waitForTimeout(1500);
  ok((await p.$$('#carrossel .slide')).length === 2, 'excluir página');
  // sem internet: o app abre do cache
  await ctx.setOffline(true);
  const p2 = await ctx.newPage(); await p2.goto('http://localhost:8791/').catch(e => errs.push('offline: ' + e.message)); await p2.waitForTimeout(1000);
  ok(await p2.isVisible('#bDigitalizar'), 'abre sem internet');
  await ctx.setOffline(false);
  console.log('erros JS:', errs);
  await b.close();
})();
