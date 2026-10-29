const { chromium, devices } = require('playwright');
const D = '/tmp/claude-0/e2e/mobile/';
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${D}camera.y4m`] });
  const ctx = await b.newContext({ ...devices['Pixel 7'], permissions: ['camera'] }); const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await p.goto('http://localhost:8790/app/'); await p.waitForTimeout(1500);
  await p.tap('#camAuto').catch(() => {});
  await p.tap('#bDigitalizar'); await p.waitForTimeout(500);
  // desliga o Auto para testar o botão
  if (await p.getAttribute('#camAuto', 'aria-pressed') === 'true') await p.tap('#camAuto');
  await p.waitForFunction(() => document.getElementById('video').videoWidth > 0, null, { timeout: 15000 }); await p.waitForTimeout(1500);
  for (let i = 1; i <= 3; i++){
    const t0 = Date.now(); await p.tap('#camDisparo');
    await p.waitForSelector('#tBordas:not([hidden])', { timeout: 15000 });
    const t1 = Date.now();
    console.log(`foto ${i}: 1 toque -> tela de bordas em ${t1 - t0} ms (celular 6x mais lento)`);
    await p.waitForTimeout(400); await p.tap('#bordMais');
    await p.waitForSelector('#tCamera:not([hidden])', { timeout: 20000 });
    console.log(`   voltar para a câmera: ${Date.now() - t1} ms (inclui endireitar e guardar a foto)`);
    await p.waitForTimeout(600);
  }
  console.log('detecção ao vivo (ms por vez):', Math.round(await p.evaluate(() => 0)) || '(ver custo)');
  await b.close();
})();
