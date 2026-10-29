const { chromium, devices } = require('playwright');
const fs = require('fs');
const D = '/tmp/claude-0/e2e/mobile/';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'], acceptDownloads: true }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const ok = (c, m) => { console.log((c ? 'ok: ' : 'FALHOU: ') + m); if (!c) process.exitCode = 1; };
  const S = n => p.screenshot({ path: `${D}v-${n}.png` });
  await p.goto('http://localhost:8791/'); await p.waitForTimeout(800);
  ok((await p.textContent('.versao')).includes('1.1.'), 'versão 1.1.x');
  // documento de 5 páginas pela galeria
  await p.tap('#bDigitalizar'); await p.waitForTimeout(800);
  await p.setInputFiles('#arqGaleria', [D + 'cena0.png', D + 'cena1.png', D + 'cena2.png', D + 'cena0.png', D + 'cena1.png']);
  await p.waitForSelector('#tDoc:not([hidden])', { timeout: 40000 }); await p.waitForTimeout(1500);
  ok((await p.$$('#carrossel .slide')).length === 5, 'documento com 5 páginas');
  await p.tap('#bSalvar'); await p.waitForTimeout(400);
  ok(await p.isVisible('#eVarios'), 'escolha Um arquivo / Vários arquivos'); await S('1-escolha');
  await p.tap('#eVarios'); await p.waitForSelector('#tSep:not([hidden])'); await p.waitForTimeout(400);
  ok((await p.$$('.cartao')).length === 1 && (await p.textContent('#sepSub')).includes('5 páginas → 1 arquivo'), 'começa tudo junto');
  await p.tap('.cartao >> nth=0 >> .corte >> nth=1'); await p.waitForTimeout(300);
  await p.tap('.cartao >> nth=1 >> .corte >> nth=0'); await p.waitForTimeout(300);
  const tam = await p.$$eval('.cartao', l => l.map(c => c.querySelectorAll('.pg').length).join(','));
  ok(tam === '2,1,2', 'separou 2 + 1 + 2: ' + tam);
  // sugerir nome (lê a página de verdade)
  await p.tap('.cartao >> nth=0 >> .ler');
  await p.waitForFunction(() => !document.querySelector('.cartao .sug .lendo'), null, { timeout: 90000 });
  const sug = await p.$$eval('.cartao >> nth=0', () => 0).catch(() => 0);
  const chips = await p.$$eval('.cartao:first-child .sug button', l => l.map(x => x.textContent));
  console.log('   sugestões:', JSON.stringify(chips));
  ok(chips.some(t => /PROCURA/i.test(t)) && chips.some(t => /MARIA DE SOUZA/i.test(t)), 'sugeriu PROCURAÇÃO e MARIA DE SOUZA');
  const iP = chips.findIndex(t => /PROCURA/i.test(t)), iM = chips.findIndex(t => /MARIA/i.test(t));
  await p.tap(`.cartao:first-child .sug button >> nth=${iP}`); await p.tap(`.cartao:first-child .sug button >> nth=${iM}`); await p.waitForTimeout(200);
  const nome1 = await p.inputValue('.cartao >> nth=0 >> input');
  ok(/PROCURA.* - MARIA DE SOUZA/i.test(nome1), 'dois toques montam o nome: ' + nome1);
  await p.tap('.cartao >> nth=1 >> input'); await p.keyboard.type('Recibo José'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.activeElement === document.querySelectorAll('.cartao input')[2]), 'Enter pula para o próximo nome');
  await p.keyboard.type('Recibo José'); await p.waitForTimeout(100);
  ok((await p.$$('.cartao.repetido')).length === 2, 'nome repetido avisa');
  await S('2-separado');
  // ver página grande
  await p.tap('.cartao >> nth=2 >> .pg >> nth=0'); await p.waitForTimeout(500);
  ok(await p.isVisible('#zoom'), 'abre a página grande'); await S('3-zoom'); await p.tap('#zFechar');
  // salvar: 3 PDFs
  const downloads = []; p.on('download', d => downloads.push(d));
  await p.tap('#bBaixarV'); await p.waitForTimeout(4000);
  const nomes = [];
  for (const d of downloads){ const f = D + 'out-' + d.suggestedFilename(); await d.saveAs(f); nomes.push(d.suggestedFilename() + ':' + (fs.readFileSync(f, 'latin1').match(/\/Type \/Page /g) || []).length); }
  console.log('   baixados:', nomes.join(' | '));
  ok(downloads.length === 3 && nomes.some(n => n.startsWith('Recibo José (2).pdf:2')) && nomes.some(n => n.startsWith('Recibo José.pdf:1')), 'salvou 3 PDFs com páginas certas e (2) no repetido');
  // JPG
  await p.tap('#vJpg'); await p.waitForTimeout(200);
  ok((await p.textContent('.cartao >> nth=0 >> .ext')) === 'pasta' && (await p.textContent('.cartao >> nth=1 >> .ext')) === '.jpg', 'JPG: vários = pasta, 1 = .jpg');
  // menu: uma por arquivo
  await p.tap('#sepMais'); await p.waitForTimeout(300); await p.tap('.opcoes-lista button >> nth=0'); await p.waitForTimeout(500);
  ok((await p.$$('.cartao')).length === 5, 'uma página por arquivo');
  await p.evaluate(() => document.documentElement.dataset.theme = 'dark'); await p.waitForTimeout(200); await S('4-escuro');
  await p.tap('#sepVoltar'); await p.waitForTimeout(500);
  ok(!(await p.isHidden('#tDoc')), 'voltar leva ao documento');
  console.log('erros JS:', errs);
  await b.close();
})();
