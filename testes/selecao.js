// Teste: selecionar vários documentos (segurar o dedo), juntar, baixar, excluir.
// Precisa do app servido em http://localhost:8791 (python3 -m http.server 8791).
const { chromium, devices } = require("playwright");
const falhas = []; const ok = (n, c, x = "") => { console.log((c ? "ok: " : "FALHOU: ") + n + (x ? " — " + x : "")); if (!c) falhas.push(n); };
(async () => {
  const b = await chromium.launch(); const c = await b.newContext({ ...devices["Pixel 7"], acceptDownloads: true }); const p = await c.newPage();
  const erros = []; p.on("pageerror", e => erros.push(e.message));
  await p.goto("http://localhost:8791/"); await p.waitForTimeout(600);
  await p.evaluate(async () => {
    const bnc = await import("./js/banco.js");
    for (const [i, [nome, np]] of [["Doc A", 1], ["Doc B", 2], ["Doc C", 1]].entries()){
      const paginas = [];
      for (let k = 0; k < np; k++){
        const cv = document.createElement("canvas"); cv.width = 600; cv.height = 800; const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 600, 800); g.fillStyle = "#000"; g.font = "40px sans-serif"; g.fillText(nome + " p" + (k + 1), 40, 100);
        const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", .9)); const pid = "p" + i + k; await bnc.guardarFoto(pid, blob);
        paginas.push({ pid, cantos: [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 800 }, { x: 0, y: 800 }], filtro: "original", rot: 0 });
      }
      await bnc.salvarDoc({ id: "d" + i, nome, criado: Date.now() - i * 1000, paginas });
    }
  });
  await p.reload(); await p.waitForTimeout(800);
  const segurar = async i => { const bx = await p.locator(".doc").nth(i).boundingBox(); await p.mouse.move(bx.x + 120, bx.y + 30); await p.mouse.down(); await p.waitForTimeout(600); await p.mouse.up(); };
  await segurar(0);
  ok("segurar entra na seleção", await p.locator("#tInicio.selecionando").count() === 1 && /1 selecionado/.test(await p.textContent("#sConta")));
  ok("Juntar desligado com 1", await p.locator('[data-a="juntar"]').isDisabled());
  await p.locator(".doc").nth(1).click();
  ok("tocar marca outro", /2 selecionados/.test(await p.textContent("#sConta")) && await p.locator(".doc.sel").count() === 2);
  await p.screenshot({ path: __dirname + "/tela-selecao.png" });
  // juntar
  await p.click('[data-a="juntar"]'); await p.waitForTimeout(300);
  await p.locator(".opcoes-lista button", { hasText: /^Juntar$/ }).click(); await p.waitForTimeout(2500);
  const nomes = await p.$$eval(".doc b", bs => bs.map(x => x.textContent));
  const pags = await p.$$eval(".doc small", s => s.map(x => x.textContent));
  ok("juntou num documento novo (3 páginas) e manteve os originais", nomes.length === 4 && /3 páginas/.test(pags[0]), nomes.join(", ") + " | " + pags[0]);
  ok("saiu da seleção", await p.locator("#tInicio.selecionando").count() === 0);
  // abrir o juntado mostra 3 páginas
  // baixar tudo num PDF só
  await segurar(1); await p.locator(".doc").nth(2).click();
  await p.click('[data-a="baixar"]'); await p.waitForTimeout(300);
  const dl = p.waitForEvent("download");
  await p.locator(".opc", { hasText: "Tudo num PDF só" }).click();
  const d = await dl; const f = await d.path(); const buf = require("fs").readFileSync(f);
  ok("baixou um PDF com as páginas dos dois", buf.slice(0, 4).toString() === "%PDF" && (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length === 3, d.suggestedFilename());
  // excluir
  await p.waitForTimeout(500);
  await segurar(0); await p.click("#sTudo");
  ok("selecionar tudo", /4 selecionados/.test(await p.textContent("#sConta")));
  await p.click('[data-a="excluir"]'); await p.waitForTimeout(300);
  await p.locator(".opcoes-lista button.perigo").click(); await p.waitForTimeout(800);
  ok("excluiu todos", await p.locator(".doc").count() === 0 && await p.evaluate(async () => (await (await import("./js/banco.js")).listarDocs()).length === 0));
  ok("sem erros", erros.length === 0, erros.join(" | "));
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : "\nTUDO CERTO");
  await b.close(); process.exit(falhas.length ? 1 : 0);
})();
