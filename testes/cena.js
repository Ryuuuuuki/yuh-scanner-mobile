// gera fotos de exemplo (folha torta sobre mesa) usando o código do protótipo
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file:///home/claude/yuh-mobile/prototipo/prototipo-mobile.html'); await p.waitForTimeout(300);
  for (let i = 0; i < 3; i++){
    const r = await p.evaluate(() => { const c = cenaDeExemplo(); return { url: c.c.toDataURL('image/png'), quad: c.quad }; });
    require('fs').writeFileSync(`cena${i}.png`, Buffer.from(r.url.split(',')[1], 'base64'));
    require('fs').writeFileSync(`cena${i}.json`, JSON.stringify(r.quad));
  }
  await b.close();
})();
