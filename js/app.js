// Yuh Scanner Mobile — interface e fluxo do app.
import { endireitar, aplicarFiltro, girar, reduzir, miniatura, paraJpeg, carregarImagem, novoCanvas, liberar, LADO_FOTO } from "./imagem.js";
import { acharFolha, cantosPadrao, movimento } from "./bordas.js";
import * as banco from "./banco.js";
import { montarPdf } from "./pdf.js";
import { sugestoesDeNome } from "./ocr.js";
import * as ponte from "./ponte.js";

export const VERSAO = "1.3.2";
const $ = id => document.getElementById(id);
const celular = $("celular");
const FILTROS = [["realcado", "Realçado"], ["original", "Original"], ["cinza", "Cinza"], ["pb", "P&B"]];

/* ================= estado ================= */
// página em memória: { pid, cantos, filtro, rot, mini, url (imagem pronta), w, h }
// (as fotos e páginas grandes ficam no banco; aqui só o necessário para a tela)
let docs = [], docAtual = null, novas = [], refazendo = null, docAlvo = null, camDe = "tInicio";
const retaCache = new Map(); // pid -> página endireitada (sem filtro), só as últimas usadas

const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const esperar = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* ================= navegação ================= */
let empilhado = false; // um passo no histórico: o "voltar" do Android fecha a tela em vez de sair do app
function ir(tela){
  for (const t of document.querySelectorAll(".tela")) t.hidden = t.id !== tela;
  // ajustando as bordas a câmera continua ligada (voltar para ela é instantâneo)
  if (tela === "tBordas") clearTimeout(tDetecta);
  else if (tela !== "tCamera") pararCamera();
  if (tela !== "tInicio" && !empilhado){ history.pushState({ yuh: 1 }, ""); empilhado = true; }
}

/* ================= aviso / processando ================= */
let tAviso;
function avisar(t, acao){
  const a = $("aviso"); a.textContent = t; a.className = "aviso on" + (acao ? " acao" : "");
  if (acao){ const b = document.createElement("button"); b.textContent = acao.t; b.onclick = () => { a.className = "aviso"; acao.f(); }; a.append(b); }
  clearTimeout(tAviso); tAviso = setTimeout(() => a.className = "aviso", acao ? 6000 : 2800);
}
function processando(t){
  let p = celular.querySelector(".processando");
  if (t === false){ p?.remove(); return; }
  if (!p){ p = document.createElement("div"); p.className = "processando"; p.setAttribute("role", "status"); p.innerHTML = `<div><span class="roda"></span><span></span></div>`; celular.append(p); }
  p.querySelector("span:last-child").textContent = t;
}
async function comEspera(t, fn){
  processando(t); await esperar();
  try { return await fn(); }
  catch (e) { console.error(e); avisar("Algo deu errado: " + (e.message || e)); }
  finally { processando(false); }
}

/* ================= processar uma página ================= */
// a foto grande já está no banco: tira da memória (as páginas endireitadas ficam no cache)
function liberarFoto(p){ if (p._foto){ for (const [k, v] of retaCache) if (v === p._foto) retaCache.delete(k); liberar(p._foto); delete p._foto; } }
const chavePagina = p => JSON.stringify([p.cantos.map(c => [Math.round(c.x), Math.round(c.y)]), p.filtro, p.rot]);
async function fotoDe(p){ if (p._foto) return p._foto; const b = await banco.lerFoto(p.pid); if (!b) throw new Error("foto da página não encontrada"); return carregarImagem(b); }
async function retaDe(p){
  const k = p.pid + JSON.stringify(p.cantos);
  if (retaCache.has(k)) return retaCache.get(k);
  const foto = await fotoDe(p), r = endireitar(foto, p.cantos);
  if (foto !== p._foto) liberar(foto);
  retaCache.set(k, r);
  if (retaCache.size > 2){ const velha = retaCache.keys().next().value; liberar(retaCache.get(velha)); retaCache.delete(velha); }
  return r;
}
// gera a página pronta (endireitada + filtro + giro), guarda no banco e atualiza a imagem da tela
async function processar(p){
  const reta = await retaDe(p);
  const filtrada = aplicarFiltro(reta, p.filtro), pronta = girar(filtrada, p.rot);
  if (pronta !== filtrada) liberar(filtrada);
  const blob = await paraJpeg(pronta, .9);
  p.mini = miniatura(pronta); p.w = pronta.width; p.h = pronta.height;
  liberar(pronta);
  await banco.guardarPronta(p.pid, chavePagina(p), blob);
  if (p.url) URL.revokeObjectURL(p.url);
  p.url = URL.createObjectURL(blob);
  p.previas = null;
}
// ao abrir um documento: usa a página já pronta do banco (ou refaz se mudou)
async function carregarPagina(p){
  if (p.url) return;
  const r = await banco.lerPronta(p.pid);
  if (r && r.chave === chavePagina(p)){
    p.url = URL.createObjectURL(r.blob);
    if (!p.w){ const im = new Image(); im.src = p.url; await im.decode().catch(() => {}); p.w = im.naturalWidth; p.h = im.naturalHeight; }
  } else await processar(p);
}

/* ================= câmera ================= */
let fluxo = null, trilha = null, tDetecta = null, ultimo = null, paradoDesde = 0, semFolhaDesde = 0, armado = true, disparando = false;
async function abrirCamera(paraDoc, desarmado = false){
  docAlvo = paraDoc || null;
  camDe = !$("tDoc").hidden ? "tDoc" : "tInicio";
  novas = []; atualizarPilha();
  ir("tCamera");
  $("camErro").hidden = true; $("camDica").hidden = false; $("camDica").textContent = "Abrindo a câmera…";
  desenharContorno(null);
  const video = $("video");
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador não dá acesso à câmera.");
    fluxo = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1920 } } });
    if ($("tCamera").hidden){ pararCamera(); return; }
    trilha = fluxo.getVideoTracks()[0];
    try { await trilha.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch {}
    const capac = trilha.getCapabilities?.() || {};
    $("camFlash").hidden = !capac.torch;
    video.srcObject = fluxo; video.hidden = false;
    await video.play().catch(() => {});
    $("camDica").textContent = "Procurando a folha…";
    armado = !desarmado; ultimo = null; paradoDesde = 0; semFolhaDesde = 0;
    detectarAoVivo();
  } catch (e) {
    video.hidden = true; $("camDica").hidden = true;
    $("camFlash").hidden = true;
    $("camErroTxt").textContent = {
      NotAllowedError: "O acesso à câmera foi negado. Libere a câmera para este app nas configurações do navegador e tente de novo.",
      NotFoundError: "Não achei nenhuma câmera neste aparelho.",
      NotReadableError: "A câmera está sendo usada por outro app. Feche o outro app e tente de novo.",
      OverconstrainedError: "A câmera deste aparelho não aceitou as configurações pedidas.",
    }[e.name] || "A câmera não está disponível agora. Você ainda pode usar uma foto da galeria.";
    $("camErro").hidden = false;
  }
}
function pararCamera(){
  clearTimeout(tDetecta); tDetecta = null;
  if (fluxo){ fluxo.getTracks().forEach(t => t.stop()); fluxo = null; trilha = null; }
  $("camFlash").setAttribute("aria-pressed", "false"); $("camFlash").style.color = "";
}
// procura a folha no vídeo (até 4 vezes por segundo; menos em celular mais lento);
// no modo Auto, tira a foto quando ela fica parada
let custoDeteccao = 0;
function detectarAoVivo(){
  clearTimeout(tDetecta);
  if (!fluxo || $("tCamera").hidden || disparando) return;
  const v = $("video");
  if (v.videoWidth){
    const t0 = performance.now();
    const q = acharFolha(v), w = v.videoWidth, h = v.videoHeight;
    custoDeteccao = custoDeteccao ? custoDeteccao * .7 + (performance.now() - t0) * .3 : performance.now() - t0;
    desenharContorno(q);
    const auto = $("camAuto").getAttribute("aria-pressed") === "true";
    if (!q){
      $("camDica").textContent = "Procurando a folha…"; paradoDesde = 0;
      // folha sumiu por mais de 1 s = trocaram a folha: o Auto volta a valer
      if (!semFolhaDesde) semFolhaDesde = performance.now();
      else if (performance.now() - semFolhaDesde > 1000) armado = true;
    } else {
      semFolhaDesde = 0;
      const mexeu = movimento(q, ultimo, w, h);
      if (mexeu > .02) paradoDesde = performance.now();
      if (!armado && ultimo && mexeu > .12) armado = true; // depois de uma foto, só tira outra quando trocar a folha
      const parado = performance.now() - paradoDesde;
      if (auto && armado){
        $("camDica").textContent = parado > 500 ? "Segure firme…" : "Folha encontrada";
        if (parado > 1300 && !disparando){ armado = false; disparar(); }
      } else $("camDica").textContent = auto ? "Troque a folha para a próxima foto" : "Folha encontrada · toque no botão";
    }
    ultimo = q;
  }
  // a busca nunca ocupa mais de ~1/4 do tempo: o celular continua respondendo ao toque
  tDetecta = setTimeout(detectarAoVivo, Math.max(250, custoDeteccao * 4));
}
function desenharContorno(q){
  const pol = $("contorno").querySelector("polygon"), v = $("video");
  if (!q || !v.videoWidth){ pol.setAttribute("points", ""); return; }
  const r = $("contorno").getBoundingClientRect(), s = Math.max(r.width / v.videoWidth, r.height / v.videoHeight);
  const ox = (r.width - v.videoWidth * s) / 2, oy = (r.height - v.videoHeight * s) / 2;
  pol.setAttribute("points", q.map(p => `${ox + p.x * s},${oy + p.y * s}`).join(" "));
}
// tira a foto na hora: usa o quadro atual do vídeo (pedir a foto "em alta" ao Android
// demora segundos e falha em vários aparelhos)
async function disparar(){
  const v = $("video");
  if (disparando || !fluxo || !v.videoWidth) return;
  disparando = true; clearTimeout(tDetecta);
  const f = $("flash"); f.classList.remove("on"); void f.offsetWidth; f.classList.add("on");
  $("camDisparo").disabled = true;
  navigator.vibrate?.(30);
  try {
    const foto = reduzir(v, LADO_FOTO);   // congela o quadro antes de qualquer espera
    processando("Preparando a foto…"); await esperar();
    await novaFoto(foto);
  } catch (e) {
    console.error(e); avisar("Não consegui tirar a foto, tente de novo");
  } finally {
    processando(false); disparando = false; $("camDisparo").disabled = false;
  }
}
async function novaFoto(foto){
  const q = acharFolha(foto);
  await abrirBordasNova({ pid: novoId(), _foto: foto, cantos: q || cantosPadrao(foto.width, foto.height), filtro: "realcado", rot: 0, achou: !!q });
}
function atualizarPilha(){
  const n = novas.length;
  $("camPilha").hidden = !n; $("camPilhaVazia").hidden = !!n;
  if (n){ $("camPilhaN").textContent = n; $("camPilhaImg").src = novas[n - 1].mini; }
}
async function fotosDaGaleria(arqs){
  pararCamera();
  for (const [i, f] of arqs.entries()){
    const p = await comEspera(arqs.length > 1 ? `Endireitando ${i + 1} de ${arqs.length}…` : "Endireitando…", async () => {
      const foto = reduzir(await carregarImagem(f), LADO_FOTO), q = acharFolha(foto);
      const p = { pid: novoId(), _foto: foto, cantos: q || cantosPadrao(foto.width, foto.height), filtro: "realcado", rot: 0 };
      await banco.guardarFoto(p.pid, await paraJpeg(foto, .92));
      await processar(p); liberarFoto(p);
      return p;
    });
    if (p) novas.push(p);
  }
  atualizarPilha();
  if (novas.length) concluirCaptura(); else ir(camDe);
}

/* ================= ajustar bordas ================= */
let bordasPag = null, editandoBordas = null, escala = 1;
async function abrirBordasNova(p){
  bordasPag = p; editandoBordas = null;
  $("bordBaseNova").hidden = false; $("bordBaseEdit").hidden = true;
  $("bordTitulo").textContent = refazendo ? "Nova foto da página" : `Página ${novas.length + 1}`;
  $("bordMais").hidden = !!refazendo; $("bordConcluir").textContent = refazendo ? "Usar esta" : "Concluir";
  ir("tBordas"); await esperar(); montarBordas();
  if (!p.achou) avisar("Não achei a folha sozinho: arraste as bolinhas até os cantos");
}
async function abrirBordasEditar(p){
  const foto = await comEspera("Abrindo a foto…", () => fotoDe(p));
  if (!foto) return;
  bordasPag = { ...p, _foto: foto, cantos: p.cantos.map(c => ({ ...c })) }; editandoBordas = p;
  $("bordBaseNova").hidden = true; $("bordBaseEdit").hidden = false;
  $("bordTitulo").textContent = "Ajustar bordas";
  ir("tBordas"); await esperar(); montarBordas();
}
function montarBordas(){
  const foto = bordasPag._foto, palco = $("palco"), cv = $("bordCanvas");
  const r = palco.getBoundingClientRect();
  escala = Math.min((r.width - 48) / foto.width, (r.height - 48) / foto.height);
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(foto.width * escala * dpr); cv.height = Math.round(foto.height * escala * dpr);
  cv.style.width = Math.round(foto.width * escala) + "px"; cv.style.height = Math.round(foto.height * escala) + "px";
  const g = cv.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(foto, 0, 0, cv.width, cv.height);
  const Q = $("quadro"); Q.querySelectorAll(".alca").forEach(a => a.remove());
  bordasPag.cantos.forEach((c, i) => {
    const a = document.createElement("div"); a.className = "alca"; a.innerHTML = "<i></i>";
    a.setAttribute("role", "slider"); a.setAttribute("aria-label", ["Canto superior esquerdo", "Canto superior direito", "Canto inferior direito", "Canto inferior esquerdo"][i]);
    Q.append(a); arrastarAlca(a, i);
  });
  desenharBordas();
}
function desenharBordas(){
  const c = bordasPag.cantos;
  $("bordSvg").querySelector("polygon").setAttribute("points", c.map(p => `${p.x * escala},${p.y * escala}`).join(" "));
  $("quadro").querySelectorAll(".alca").forEach((a, i) => { a.style.left = c[i].x * escala + "px"; a.style.top = c[i].y * escala + "px"; });
}
function arrastarAlca(a, i){
  let lupa = null;
  const mover = e => {
    if (!lupa) return;
    const r = $("bordCanvas").getBoundingClientRect(), f = bordasPag._foto;
    const x = Math.max(0, Math.min(f.width, (e.clientX - r.left) / escala)), y = Math.max(0, Math.min(f.height, (e.clientY - r.top) / escala));
    bordasPag.cantos[i] = { x, y }; desenharBordas();
    const pr = $("palco").getBoundingClientRect();
    lupa.style.left = (e.clientX - pr.left - 55) + "px"; lupa.style.top = Math.max(4, e.clientY - pr.top - 150) + "px";
    const g = lupa.firstChild.getContext("2d"), sl = 50 / escala;  // ~2,2× ampliado
    g.fillStyle = "#000"; g.fillRect(0, 0, 220, 220);
    g.drawImage(f, x - sl / 2, y - sl / 2, sl, sl, 0, 0, 220, 220);
  };
  a.addEventListener("pointerdown", e => {
    e.preventDefault(); a.setPointerCapture(e.pointerId);
    lupa = document.createElement("div"); lupa.className = "lupa";
    const lc = novoCanvas(220, 220); lc.style.width = lc.style.height = "110px"; lupa.append(lc); $("palco").append(lupa);
    mover(e);
  });
  a.addEventListener("pointermove", mover);
  const fim = () => { lupa?.remove(); lupa = null; };
  a.addEventListener("pointerup", fim); a.addEventListener("pointercancel", fim);
}
$("bordTudo").onclick = () => { const f = bordasPag._foto; bordasPag.cantos = [{ x: 0, y: 0 }, { x: f.width, y: 0 }, { x: f.width, y: f.height }, { x: 0, y: f.height }]; desenharBordas(); };
// confirma a foto nova: guarda a foto, gera a página
async function confirmarBordaNova(){
  const p = bordasPag;
  const ok = await comEspera("Endireitando a folha…", async () => {
    await banco.guardarFoto(p.pid, await paraJpeg(p._foto, .92));
    await processar(p);
    return true;
  });
  if (!ok) return false;
  liberarFoto(p); delete p.achou;
  if (refazendo){ // "Refazer": troca a foto da página, mantém o lugar
    const velho = refazendo; refazendo = null;
    const i = docAtual.paginas.indexOf(velho);
    if (velho.url) URL.revokeObjectURL(velho.url);
    await banco.apagarFoto(velho.pid).catch(() => {});
    p.filtro = velho.filtro; docAtual.paginas[i] = p;
    if (p.filtro !== "realcado") await comEspera("Aplicando…", () => processar(p));
    await banco.salvarDoc(docAtual);
    abrirDoc(docAtual, i); avisar(`Página ${i + 1} trocada`);
    return null;
  }
  novas.push(p); atualizarPilha();
  return true;
}
$("bordMais").onclick = async () => {
  if (await confirmarBordaNova() !== true) return;
  ir("tCamera"); abrirCameraDeNovo();
};
$("bordConcluir").onclick = async () => { if (await confirmarBordaNova() === true) concluirCaptura(); };
$("bordRefazer").onclick = () => { ir("tCamera"); abrirCameraDeNovo(false); };
$("bordVoltar").onclick = () => { if (editandoBordas) abrirDoc(docAtual, docAtual.paginas.indexOf(editandoBordas)); else { ir("tCamera"); abrirCameraDeNovo(); } };
$("bordCancelar").onclick = () => { liberar(bordasPag?._foto); abrirDoc(docAtual, docAtual.paginas.indexOf(editandoBordas)); };
$("bordAplicar").onclick = async () => {
  const p = editandoBordas; p.cantos = bordasPag.cantos;
  p._foto = bordasPag._foto;              // reaproveita a foto já aberta
  await comEspera("Endireitando…", () => processar(p));
  liberarFoto(p);
  await banco.salvarDoc(docAtual);
  abrirDoc(docAtual, docAtual.paginas.indexOf(p)); avisar("Bordas ajustadas");
};
// volta para a câmera mantendo as páginas já tiradas
// desarmado: o Auto espera trocar a folha (não tira de novo a mesma)
async function abrirCameraDeNovo(desarmado = true){
  if (fluxo && trilha?.readyState === "live"){
    // câmera ainda ligada: só volta para ela
    ir("tCamera"); atualizarPilha();
    armado = !desarmado; ultimo = null; paradoDesde = 0; semFolhaDesde = 0;
    $("camDica").textContent = novas.length ? "Próxima página…" : "Procurando a folha…";
    detectarAoVivo();
    return;
  }
  const guardadas = novas, alvo = docAlvo, de = camDe;
  const ab = abrirCamera(alvo, desarmado); novas = guardadas; camDe = de; atualizarPilha(); await ab;
  if (novas.length) $("camDica").textContent = "Próxima página…";
}
async function concluirCaptura(){
  pararCamera();
  if (!novas.length){ ir(camDe); return; }
  try { await concluirCaptura2(); }
  catch (e) { console.error(e); avisar("Não consegui guardar o documento: " + (e.message || e)); ir("tInicio"); desenharInicio(); }
}
async function concluirCaptura2(){
  if (docAlvo){
    docAlvo.paginas.push(...novas);
    await banco.salvarDoc(docAlvo);
    abrirDoc(docAlvo, docAlvo.paginas.length - novas.length);
    avisar(plural(novas.length, "página adicionada", "páginas adicionadas"));
  } else {
    const d = { id: novoId(), nome: nomePadrao(), criado: Date.now(), paginas: novas.slice() };
    await banco.salvarDoc(d);
    docs.unshift(d); abrirDoc(d, 0);
  }
  novas = [];
}
function nomePadrao(){ const d = new Date(), z = v => String(v).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}_Documento`; }

/* ================= documento ================= */
let pagVista = 0;
async function abrirDoc(d, i = 0){
  docAtual = d; pagVista = Math.max(0, Math.min(i ?? 0, d.paginas.length - 1));
  ir("tDoc"); desenharDoc(true);
  // carrega as páginas prontas aos poucos, começando pela que está na tela
  const ordem = d.paginas.map((p, k) => k).sort((a, b) => Math.abs(a - pagVista) - Math.abs(b - pagVista));
  for (const k of ordem){
    const p = d.paginas[k]; if (!p || p.url) continue;
    try { await carregarPagina(p); } catch (e) { console.error(e); }
    if (docAtual !== d) return;
    const im = $("carrossel").children[d.paginas.indexOf(p)]?.querySelector("img");
    if (im) { im.src = p.url; im.hidden = false; im.previousElementSibling?.remove(); }
    if (d.paginas.indexOf(p) === pagVista) desenharFiltros();
  }
}
function desenharDoc(rolar){
  const d = docAtual;
  $("docNome").textContent = d.nome;
  $("docInfo").textContent = `${plural(d.paginas.length, "página", "páginas")} · toque para renomear`;
  const C = $("carrossel"); C.innerHTML = "";
  d.paginas.forEach((p, k) => {
    const s = document.createElement("div"); s.className = "slide";
    const im = document.createElement("img"); im.alt = `Página ${k + 1}`;
    if (p.url) im.src = p.url; else { im.hidden = true; const c = document.createElement("div"); c.className = "carregando"; s.append(c); }
    s.append(im); C.append(s);
  });
  if (rolar) requestAnimationFrame(() => { C.scrollLeft = pagVista * C.clientWidth; });
  desenharIndic(); desenharFiltros();
}
function desenharIndic(){
  const I = $("indic"), n = docAtual.paginas.length; I.innerHTML = "";
  if (n <= 12) for (let i = 0; i < n; i++){ const b = document.createElement("i"); if (i === pagVista) b.className = "on"; I.append(b); }
  const t = document.createElement("span"); t.textContent = ` ${pagVista + 1} de ${n}`; I.append(t);
}
$("carrossel").addEventListener("scroll", () => {
  const C = $("carrossel"), i = Math.round(C.scrollLeft / Math.max(1, C.clientWidth));
  if (docAtual && i !== pagVista && i < docAtual.paginas.length){ pagVista = i; desenharIndic(); desenharFiltros(); }
}, { passive: true });
let prevVez = 0;
async function desenharFiltros(){
  const F = $("filtros"), p = docAtual?.paginas[pagVista]; if (!p) return;
  const vez = ++prevVez;
  F.innerHTML = "";
  const botoes = FILTROS.map(([k, rot]) => {
    const b = document.createElement("button"); b.className = "filtro"; b.setAttribute("aria-pressed", p.filtro === k);
    const im = document.createElement("img"); im.alt = ""; b.append(im, document.createTextNode(rot));
    if (p.previas?.[k]) im.src = p.previas[k];
    b.onclick = async () => {
      if (p.filtro === k) return;
      p.filtro = k;
      await comEspera("Aplicando…", () => processar(p));
      await banco.salvarDoc(docAtual);
      desenharDoc(false);
    };
    F.append(b); return im;
  });
  // prévias pequenas de cada filtro (feitas a partir da foto, uma vez por página)
  if (!p.previas){
    try {
      const foto = await fotoDe(p); if (vez !== prevVez) return;
      const peq = reduzir(foto, 700), k = peq.width / foto.width;
      const reta = endireitar(peq, p.cantos.map(c => ({ x: c.x * k, y: c.y * k })));
      const base = reduzir(reta, 160), prev = {};
      for (const [f] of FILTROS){ const a = aplicarFiltro(base, f), g = girar(a, p.rot); prev[f] = miniatura(g, 112); liberar(a, g); }
      // (reduzir devolve a própria imagem quando ela já é pequena: só libera cópias)
      liberar(reta); if (base !== reta) liberar(base);
      if (peq !== foto) liberar(peq);
      if (foto !== p._foto) liberar(foto);
      p.previas = prev;
    } catch { return; }
    if (vez !== prevVez) return;
    FILTROS.forEach(([f], i) => botoes[i].src = p.previas[f]);
  }
}
$("fGirar").onclick = async () => {
  const p = docAtual.paginas[pagVista]; if (!p) return;
  p.rot = (p.rot + 1) % 4;
  await comEspera("Girando…", () => processar(p));
  await banco.salvarDoc(docAtual); desenharDoc(false);
};
$("fBordas").onclick = () => { const p = docAtual.paginas[pagVista]; if (p) abrirBordasEditar(p); };
$("fAdd").onclick = () => abrirCamera(docAtual);
$("fRefazer").onclick = () => {
  const p = docAtual.paginas[pagVista]; if (!p) return;
  refazendo = p;
  abrirCamera(null).then(() => { camDe = "tDoc"; if (fluxo) $("camDica").textContent = `Tirando de novo a página ${pagVista + 1}`; });
};
$("fExcluir").onclick = () => folhaBaixo({
  titulo: `Excluir a página ${pagVista + 1}?`,
  texto: docAtual.paginas.length > 1 ? "Ela sai do documento." : "É a única página: o documento inteiro vai ser excluído.",
  opcoes: [{ t: "Excluir página", perigo: true, f: async () => {
    if (docAtual.paginas.length === 1){ await excluirDocumento(docAtual); return; }
    const [p] = docAtual.paginas.splice(pagVista, 1);
    if (p.url) URL.revokeObjectURL(p.url);
    await banco.apagarFoto(p.pid); await banco.salvarDoc(docAtual);
    abrirDoc(docAtual, Math.min(pagVista, docAtual.paginas.length - 1)); avisar("Página excluída");
  } }],
});
async function excluirDocumento(d){
  await banco.excluirDoc(d);
  d.paginas.forEach(p => p.url && URL.revokeObjectURL(p.url));
  docs = docs.filter(x => x !== d);
  ir("tInicio"); desenharInicio(); avisar("Documento excluído");
}
$("docVoltar").onclick = () => { ir("tInicio"); desenharInicio(); };
$("docTitulo").onclick = () => renomear(docAtual, () => desenharDoc(false));
$("docMenu").onclick = () => menuDoc(docAtual);
function menuDoc(d){
  folhaBaixo({
    titulo: d.nome,
    opcoes: [
      { t: "Renomear", f: () => renomear(d, () => docAtual === d && !$("tDoc").hidden ? desenharDoc(false) : desenharInicio()) },
      { t: "Organizar páginas", f: async () => { if (docAtual !== d || $("tDoc").hidden) await abrirDoc(d, 0); abrirGrade(); } },
      { t: "Conectar ao PC", f: abrirLeitorQr },
      ...(ponte.pcs().length ? [{ t: "PCs conectados", f: mostrarPcs }] : []),
      { t: "Excluir documento", perigo: true, f: () => folhaBaixo({
        titulo: "Excluir o documento?", texto: `“${d.nome}” e ${d.paginas.length > 1 ? `as ${d.paginas.length} páginas somem` : "a página some"} do celular.`,
        opcoes: [{ t: "Excluir documento", perigo: true, f: () => excluirDocumento(d) }],
      }) },
    ],
  });
}
const limparNome = s => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/[. ]+$/, "").trim();
function renomear(d, depois){
  folhaBaixo({ titulo: "Nome do documento", campo: d.nome, ok: "Salvar nome", aoOk: async v => {
    const n = limparNome(v); if (!n) return;
    d.nome = n; await banco.salvarDoc(d); depois?.();
  } });
}

/* ================= organizar (segurar e arrastar) ================= */
function abrirGrade(){ ir("tGrade"); desenharGrade(); }
function desenharGrade(){
  const G = $("grade"); G.innerHTML = "";
  docAtual.paginas.forEach((p, i) => {
    const d = document.createElement("div"); d.className = "peca"; d.dataset.i = i;
    d.innerHTML = `<img alt=""><span>${i + 1}</span>`; d.querySelector("img").src = p.mini;
    G.append(d);
  });
}
(() => {
  const G = $("grade"); let seg = null, timer = null;
  G.addEventListener("pointerdown", e => {
    const d = e.target.closest(".peca"); if (!d) return;
    const x0 = e.clientX, y0 = e.clientY, i = +d.dataset.i;
    seg = { d, i, x0, y0, ativo: false };
    timer = setTimeout(() => {
      if (!seg) return; seg.ativo = true; d.classList.add("arrastando"); G.style.touchAction = "none";
      const f = document.createElement("img"); f.className = "fantasma"; f.src = docAtual.paginas[i].mini; f.style.left = x0 + "px"; f.style.top = y0 + "px"; document.body.append(f); seg.f = f;
      navigator.vibrate?.(20);
    }, 280);
  });
  G.addEventListener("pointermove", e => {
    if (!seg) return;
    if (!seg.ativo){ if (Math.hypot(e.clientX - seg.x0, e.clientY - seg.y0) > 10){ clearTimeout(timer); seg = null; } return; }
    e.preventDefault();
    seg.f.style.left = e.clientX + "px"; seg.f.style.top = e.clientY + "px";
    G.querySelectorAll(".peca").forEach(p => p.classList.remove("alvo"));
    const alvo = document.elementFromPoint(e.clientX, e.clientY)?.closest(".peca");
    if (alvo && alvo !== seg.d) alvo.classList.add("alvo");
  });
  const fim = async e => {
    clearTimeout(timer); if (!seg) return;
    const { ativo, d, i } = seg; seg.f?.remove(); G.style.touchAction = "";
    const s = seg; seg = null;
    if (ativo){
      const alvo = document.elementFromPoint(e.clientX, e.clientY)?.closest(".peca");
      if (alvo && alvo !== d){
        const j = +alvo.dataset.i; const [p] = docAtual.paginas.splice(i, 1); docAtual.paginas.splice(j, 0, p);
        await banco.salvarDoc(docAtual); avisar(`Página ${i + 1} agora é a ${j + 1}`);
      }
      desenharGrade();
    } else if (e.type === "pointerup" && s) abrirDoc(docAtual, i);
  };
  G.addEventListener("pointerup", fim); G.addEventListener("pointercancel", fim);
  G.addEventListener("contextmenu", e => e.preventDefault());
})();
$("gradeVoltar").onclick = $("gradePronto").onclick = () => abrirDoc(docAtual, pagVista);
$("docGrade").onclick = abrirGrade;

/* ================= folha de baixo ================= */
function folhaBaixo({ titulo, texto, opcoes, campo, ok, aoOk, corpo }){
  const v = document.createElement("div"); v.className = "veu";
  v.innerHTML = `<div class="folha-baixo" role="dialog" aria-modal="true"><div class="puxador"></div><h3></h3></div>`;
  const F = v.querySelector(".folha-baixo"); F.querySelector("h3").textContent = titulo;
  const fechar = () => { v.classList.remove("on"); setTimeout(() => v.remove(), 220); };
  if (texto){ const p = document.createElement("p"); p.textContent = texto; F.append(p); }
  if (corpo) corpo(F, fechar);
  if (campo !== undefined){
    const l = document.createElement("label"); l.className = "campo"; l.innerHTML = `<span class="linha"><input enterkeyhint="done" autocomplete="off"></span>`;
    const inp = l.querySelector("input"); inp.value = campo; F.append(l);
    const b = document.createElement("button"); b.className = "btn principal"; b.textContent = ok || "OK";
    b.onclick = () => { fechar(); aoOk(inp.value); };
    inp.onkeydown = e => { if (e.key === "Enter") b.click(); };
    F.append(b); setTimeout(() => { inp.focus(); inp.select(); }, 250);
  }
  if (opcoes){
    const L = document.createElement("div"); L.className = "opcoes-lista";
    for (const o of opcoes){ const b = document.createElement("button"); if (o.perigo) b.className = "perigo"; b.textContent = o.t; b.onclick = () => { fechar(); setTimeout(o.f, 230); }; L.append(b); }
    const c = document.createElement("button"); c.textContent = "Cancelar"; c.style.color = "var(--tinta-2)"; c.onclick = fechar; L.append(c);
    F.append(L);
  }
  v.addEventListener("click", e => { if (e.target === v) fechar(); });
  celular.append(v); requestAnimationFrame(() => v.classList.add("on"));
  return fechar;
}

/* ================= salvar / enviar ================= */
$("bSalvar").onclick = () => {
  let formato = "pdf";
  folhaBaixo({
    titulo: "Salvar ou enviar",
    corpo: (F, fechar) => {
      const n0 = docAtual.paginas.length;
      if (n0 > 1){
        F.insertAdjacentHTML("beforeend", `
        <div class="escolha" role="group" aria-label="Como salvar">
          <button id="eUm" aria-pressed="true">${ICO_UM}Um arquivo<small>As ${n0} páginas juntas</small></button>
          <button id="eVarios" aria-pressed="false">${ICO_VARIOS}Vários arquivos<small>Separar, cada um com seu nome</small></button>
        </div>`);
        F.querySelector("#eVarios").onclick = () => { fechar(); setTimeout(() => abrirSeparado(docAtual), 200); };
      }
      // levar para o formulário no PC (Yuh Extension)
      const lpcs = ponte.pcs(), alvo = lpcs.find(p => p.id === pcEscolhido) || lpcs[0];
      F.insertAdjacentHTML("beforeend", `<button class="opc destaque" id="oPc"><span class="ico">${ICO_PC}</span>
        <span style="flex:1;min-width:0"><b>Levar para o formulário no PC</b><small>Manda para a Yuh Extension, que lê os dados</small><span class="pc${alvo ? "" : " nenhum"}"><i></i><span id="oPcNome"></span></span></span>${lpcs.length > 1 ? '<span class="trocar" id="oTrocar">trocar</span>' : ""}</button>`);
      F.querySelector("#oPcNome").textContent = alvo ? alvo.nome : "Nenhum PC conectado · toque para conectar";
      F.querySelector("#oPc").onclick = e => {
        fechar();
        if (!alvo) return setTimeout(abrirLeitorQr, 230);
        if (e.target.id === "oTrocar") return setTimeout(escolherPc, 230);
        setTimeout(() => levarParaPc(alvo, docAtual), 230);
      };
      F.insertAdjacentHTML("beforeend", `
        <label class="campo">Nome do arquivo<span class="linha"><input id="sNome" enterkeyhint="done" autocomplete="off"><span class="ext" id="sExt">.pdf</span></span></label>
        <div class="seg" role="group" aria-label="Formato"><button id="sPdf" aria-pressed="true">PDF</button><button id="sJpg" aria-pressed="false">JPG</button></div>
        <p id="sInfo"></p>
        <button class="btn principal" id="sEnviar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>Enviar (WhatsApp, e-mail…)</button>
        <button class="btn" id="sBaixar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>Salvar no celular</button>`);
      const nome = F.querySelector("#sNome"); nome.value = docAtual.nome;
      const info = () => {
        const n = docAtual.paginas.length;
        F.querySelector("#sExt").textContent = formato === "pdf" ? ".pdf" : n > 1 ? "_p01.jpg…" : ".jpg";
        F.querySelector("#sInfo").textContent = formato === "pdf" ? `Um PDF com ${plural(n, "página", "páginas")}.` : n > 1 ? `${n} imagens JPG, uma por página.` : "Uma imagem JPG.";
      };
      const seg = f => { formato = f; F.querySelector("#sPdf").setAttribute("aria-pressed", f === "pdf"); F.querySelector("#sJpg").setAttribute("aria-pressed", f === "jpg"); info(); };
      F.querySelector("#sPdf").onclick = () => seg("pdf"); F.querySelector("#sJpg").onclick = () => seg("jpg");
      info();
      const gerar = async () => {
        const novo = limparNome(nome.value);
        if (novo && novo !== docAtual.nome){ docAtual.nome = novo; await banco.salvarDoc(docAtual); desenharDoc(false); }
        return comEspera(formato === "pdf" ? "Montando o PDF…" : "Preparando as imagens…", () => formato === "pdf" ? gerarPdf(docAtual).then(f => [f]) : gerarJpgs(docAtual));
      };
      F.querySelector("#sEnviar").onclick = async () => {
        const arqs = await gerar(); if (!arqs) return;
        if (navigator.canShare?.({ files: arqs })){
          fechar(); await compartilhar(arqs, docAtual.nome);
        } else { baixar(arqs); fechar(); avisar("Este navegador não envia arquivos direto: salvei no celular"); }
      };
      F.querySelector("#sBaixar").onclick = async () => {
        const arqs = await gerar(); if (!arqs) return;
        baixar(arqs); fechar();
        avisar(arqs.length > 1 ? `${arqs.length} imagens salvas em Downloads` : `“${arqs[0].name}” salvo em Downloads`);
      };
    },
  });
};
/* ================= vários arquivos (salvar separado) ================= */
const ICO_UM = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>';
const ICO_VARIOS = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="2" y="5" width="9" height="13" rx="1.5"/><rect x="13" y="5" width="9" height="13" rx="1.5"/><path d="M4.5 9h4M15.5 9h4M4.5 12h4M15.5 12h4"/></svg>';
const ICO_TESOURA = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/></svg>';
const ICO_LUPA = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
let sep = null; // { doc, arquivos:[{ pags, nome, sug }], formato, base }

function abrirSeparado(d){
  sep = { doc: d, arquivos: [{ pags: d.paginas.slice(), nome: "" }], formato: "pdf", base: "" };
  ir("tSep");
  $("vPdf").setAttribute("aria-pressed", "true"); $("vJpg").setAttribute("aria-pressed", "false");
  desenharSep();
  setTimeout(() => avisar("Começa tudo junto: toque na ✂ onde um documento termina"), 300);
}
const autoNomeSep = i => { const b = limparNome(sep.base) || sep.doc.nome; return sep.arquivos.length === 1 ? b : `${b} ${String(i + 1).padStart(2, "0")}`; };
const nomeFinalSep = (a, i) => limparNome(a.nome) || autoNomeSep(i);
const extSep = a => sep.formato === "pdf" ? ".pdf" : a.pags.length > 1 ? "pasta" : ".jpg";
function repetidosSep(){
  const c = {}; sep.arquivos.forEach((a, i) => { const k = nomeFinalSep(a, i).toLowerCase() + extSep(a); c[k] = (c[k] || 0) + 1; });
  return sep.arquivos.map((a, i) => c[nomeFinalSep(a, i).toLowerCase() + extSep(a)] > 1);
}
function avisoNome(c, a, rep){
  const av = c.querySelector(".aviso-nome");
  c.classList.toggle("repetido", rep);
  av.className = "aviso-nome" + (rep ? " erro" : "");
  av.textContent = rep ? "Nome repetido — vai sair como “(2)”" : !a.nome.trim() ? "Sem nome: vai com o nome em cinza" : limparNome(a.nome) !== a.nome.trim() ? "Vai sair como: " + limparNome(a.nome) : "";
}
function atualizarNomesSep(){
  const rep = repetidosSep();
  document.querySelectorAll("#sepLista .cartao").forEach((c, i) => { avisoNome(c, sep.arquivos[i], rep[i]); c.querySelector("input").placeholder = autoNomeSep(i); });
  resumoSep();
}
function desenharSep(rolarPara){
  const L = $("sepLista"); L.innerHTML = ""; const rep = repetidosSep();
  sep.arquivos.forEach((a, i) => {
    if (i > 0){
      const j = document.createElement("div"); j.className = "juntar";
      j.innerHTML = `<button>⤒ juntar com o de cima</button>`; j.querySelector("button").onclick = () => juntarSep(i); L.append(j);
    }
    const c = document.createElement("div"); c.className = "cartao";
    c.innerHTML = `<div class="cab"><span class="num">${i + 1}</span><span class="linha-nome"><input enterkeyhint="${i < sep.arquivos.length - 1 ? "next" : "done"}" autocomplete="off" autocapitalize="words" aria-label="Nome do arquivo ${i + 1}"><span class="ext"></span></span></div>
      <div class="aviso-nome"></div><div class="tira"></div><div class="sug"></div>`;
    const inp = c.querySelector("input"); inp.value = a.nome; inp.placeholder = autoNomeSep(i);
    c.querySelector(".ext").textContent = extSep(a);
    avisoNome(c, a, rep[i]);
    inp.addEventListener("focus", () => document.querySelectorAll("#sepLista .cartao").forEach((x, k) => x.classList.toggle("foco", k === i)));
    inp.addEventListener("input", () => { a.nome = inp.value; atualizarNomesSep(); });
    inp.addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const prox = document.querySelectorAll("#sepLista .cartao input")[i + 1];
      if (prox){ prox.focus(); prox.closest(".cartao").scrollIntoView({ block: "center", behavior: "smooth" }); } else inp.blur();
    });
    const T = c.querySelector(".tira");
    a.pags.forEach((p, k) => {
      if (k > 0){
        const x = document.createElement("button"); x.className = "corte"; x.setAttribute("aria-label", `Separar antes da página ${sep.doc.paginas.indexOf(p) + 1}`);
        x.innerHTML = `<i>${ICO_TESOURA}</i>`; x.onclick = () => separarSep(i, k); T.append(x);
      }
      const b = document.createElement("button"); b.className = "pg"; b.setAttribute("aria-label", `Ver a página ${sep.doc.paginas.indexOf(p) + 1}`);
      b.innerHTML = `<img alt=""><span>${sep.doc.paginas.indexOf(p) + 1}</span>`; b.querySelector("img").src = p.mini;
      b.onclick = () => verPagina(p, i);
      T.append(b);
    });
    desenharSugestoes(c, a, inp);
    L.append(c);
  });
  resumoSep();
  if (rolarPara !== undefined) L.querySelectorAll(".cartao")[rolarPara]?.scrollIntoView({ block: "center", behavior: "smooth" });
}
function desenharSugestoes(c, a, inp){
  const S = c.querySelector(".sug"); S.innerHTML = "";
  if (a.sug === "lendo"){ S.innerHTML = `<span class="lendo">Lendo a página ${sep.doc.paginas.indexOf(a.pags[0]) + 1}…</span>`; return; }
  if (Array.isArray(a.sug)){
    if (!a.sug.length){ S.innerHTML = `<span class="lendo">Não achei texto nesta página</span>`; return; }
    for (const t of a.sug){
      const b = document.createElement("button"); b.textContent = t; b.title = "Usar no nome";
      // toque junta ao que já está escrito: "Procuração" + "Maria" = "Procuração - Maria"
      b.onclick = () => { const atual = a.nome.trim().replace(/\s*-\s*$/, ""); a.nome = atual ? `${atual} - ${t}` : t; inp.value = a.nome; atualizarNomesSep(); };
      S.append(b);
    }
    return;
  }
  const ler = document.createElement("button"); ler.className = "ler"; ler.innerHTML = ICO_LUPA + "Sugerir nome";
  ler.onclick = async () => {
    a.sug = "lendo"; desenharSugestoes(c, a, inp);
    const pag = a.pags[0];
    try {
      await carregarPagina(pag);
      const r = await banco.lerPronta(pag.pid);
      const img = await carregarImagem(r.blob);
      try { a.sug = await sugestoesDeNome(img); } finally { liberar(img); }
    } catch (e) {
      console.error(e); a.sug = null; avisar("Não consegui ler a página: " + (e.message || e));
    }
    if (sep && sep.arquivos.includes(a)) desenharSugestoes(c, a, inp);
  };
  S.append(ler);
}
function separarSep(i, k){
  const a = sep.arquivos[i], novo = { pags: a.pags.splice(k), nome: "" };
  sep.arquivos.splice(i + 1, 0, novo);
  navigator.vibrate?.(15); desenharSep(i + 1);
}
function juntarSep(i){
  const de = sep.arquivos[i], para = sep.arquivos[i - 1];
  para.pags.push(...de.pags);
  if (!para.nome.trim()) para.nome = de.nome;
  sep.arquivos.splice(i, 1); desenharSep(i - 1);
}
function resumoSep(){
  const n = sep.arquivos.length, sem = sep.arquivos.filter(a => !a.nome.trim()).length, rep = repetidosSep().filter(Boolean).length;
  $("sepSub").textContent = `${plural(sep.doc.paginas.length, "página", "páginas")} → ${plural(n, "arquivo", "arquivos")}`;
  const R = $("resumo"); R.innerHTML = "";
  const s = (t, cl) => { const e = document.createElement("span"); if (cl) e.className = cl; e.textContent = t; R.append(e); };
  s(`${n - sem} de ${n} com nome`); if (sem) s(`${sem} com nome automático`, "meio"); if (rep) s(`${rep} com nome repetido`, "alerta");
  $("txtEnviar").textContent = n > 1 ? `Enviar ${n} arquivos` : "Enviar";
}
async function verPagina(p, i){
  await carregarPagina(p).catch(() => {});
  $("zImg").src = p.url || p.mini; $("zTit").textContent = `Página ${sep.doc.paginas.indexOf(p) + 1} · arquivo ${i + 1}`;
  $("zoom").hidden = false;
}
$("zFechar").onclick = () => { $("zoom").hidden = true; };
$("sepVoltar").onclick = () => { const d = sep.doc; sep = null; abrirDoc(d, pagVista); };
$("vPdf").onclick = () => { sep.formato = "pdf"; $("vPdf").setAttribute("aria-pressed", "true"); $("vJpg").setAttribute("aria-pressed", "false"); desenharSep(); };
$("vJpg").onclick = () => { sep.formato = "jpg"; $("vJpg").setAttribute("aria-pressed", "true"); $("vPdf").setAttribute("aria-pressed", "false"); desenharSep(); };
$("sepMais").onclick = () => folhaBaixo({ titulo: "Vários arquivos", opcoes: [
  { t: "Uma página por arquivo", f: () => { sep.arquivos = sep.doc.paginas.map(p => ({ pags: [p], nome: "" })); desenharSep(0); } },
  { t: "Juntar tudo de novo", f: () => { sep.arquivos = [{ pags: sep.doc.paginas.slice(), nome: "" }]; desenharSep(0); } },
  { t: "Mudar o nome base dos automáticos", f: () => folhaBaixo({ titulo: "Nome base", corpo: (F, fechar) => {
      F.insertAdjacentHTML("beforeend", `<p>Arquivos sem nome viram “Base 01”, “Base 02”…</p><label class="campo"><span class="linha"><input id="iBase" enterkeyhint="done" autocomplete="off"></span></label><button class="btn principal" id="okBase">Usar</button>`);
      const ib = F.querySelector("#iBase"); ib.value = sep.base; ib.placeholder = sep.doc.nome;
      const ok = () => { sep.base = ib.value; fechar(); desenharSep(); };
      F.querySelector("#okBase").onclick = ok; ib.onkeydown = e => { if (e.key === "Enter") ok(); };
      setTimeout(() => ib.focus(), 250);
    } }) },
] });
// gera os arquivos (nomes repetidos ganham " (2)", " (3)"…)
async function gerarSeparado(){
  const usados = new Map(), saida = [];
  for (const [i, a] of sep.arquivos.entries()){
    let nome = nomeFinalSep(a, i);
    const k = (nome + extSep(a)).toLowerCase(), n = (usados.get(k) || 0) + 1; usados.set(k, n);
    if (n > 1) nome += ` (${n})`;
    const pags = [];
    for (const p of a.pags){ await carregarPagina(p); const r = await banco.lerPronta(p.pid); pags.push({ blob: r.blob, w: p.w, h: p.h }); }
    if (sep.formato === "pdf") saida.push(await montarPdf(nome, pags));
    else pags.forEach((p, j) => saida.push(new File([p.blob], pags.length > 1 ? `${nome}_p${String(j + 1).padStart(2, "0")}.jpg` : `${nome}.jpg`, { type: "image/jpeg" })));
  }
  return saida;
}
$("bEnviarV").onclick = async () => {
  const arqs = await comEspera("Preparando os arquivos…", gerarSeparado); if (!arqs) return;
  if (navigator.canShare?.({ files: arqs })){
    await compartilhar(arqs);
  } else { baixar(arqs); avisar("Este navegador não envia arquivos direto: salvei no celular"); }
};
$("bBaixarV").onclick = async () => {
  const arqs = await comEspera("Preparando os arquivos…", gerarSeparado); if (!arqs) return;
  baixar(arqs);
  avisar(`${plural(arqs.length, "arquivo salvo", "arquivos salvos")} em Downloads`);
};

// compartilhar precisa acontecer logo depois de um toque; se gerar os arquivos demorou,
// o celular recusa (NotAllowedError): aí um aviso com o botão "Enviar" resolve
async function compartilhar(arqs, titulo){
  try { await navigator.share(titulo ? { files: arqs, title: titulo } : { files: arqs }); return true; }
  catch (e) {
    if (e.name === "AbortError") return false;
    if (e.name === "NotAllowedError"){
      avisar("Arquivos prontos", { t: "Enviar", f: () => navigator.share({ files: arqs }).catch(x => x.name !== "AbortError" && avisar("Não consegui abrir o enviar")) });
      return false;
    }
    avisar("Não consegui abrir o enviar: " + e.message); return false;
  }
}
function baixar(arqs){
  // um de cada vez, com um respiro: alguns navegadores barram vários downloads juntos
  arqs.forEach((f, i) => setTimeout(() => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 15000);
  }, i * 400));
}
async function paginasProntas(d){
  const out = [];
  for (const p of d.paginas){
    await carregarPagina(p);
    const r = await banco.lerPronta(p.pid);
    out.push({ blob: r.blob, w: p.w, h: p.h });
  }
  return out;
}
async function gerarJpgs(d){
  const pags = await paginasProntas(d), n = pags.length;
  return pags.map((p, i) => new File([p.blob], n > 1 ? `${d.nome}_p${String(i + 1).padStart(2, "0")}.jpg` : `${d.nome}.jpg`, { type: "image/jpeg" }));
}
async function gerarPdf(d){ return montarPdf(d.nome, await paginasProntas(d)); }

/* ================= início ================= */
const ehIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
let pedidoInstalar = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); pedidoInstalar = e; if (!$("tInicio").hidden) desenharInicio(); });
const naoMostrarInstalar = () => { try { return localStorage.getItem("yuh-instalar-fechado") === "1"; } catch { return false; } };

function desenharInicio(){
  const L = $("lista"); L.innerHTML = "";
  // dica para instalar na tela inicial
  if (!instalado() && !naoMostrarInstalar() && (ehIOS || pedidoInstalar)){
    const b = document.createElement("div"); b.className = "instalar";
    b.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M12 7v7M9 11l3 3 3-3"/></svg>
      <div><b>Instale na tela inicial</b><span></span></div>`;
    b.querySelector("span").textContent = ehIOS ? "No Safari: toque em Compartilhar ⬆️ e depois em “Adicionar à Tela de Início”." : "Abre como um app, sem a barra do navegador.";
    if (pedidoInstalar){
      const ac = document.createElement("button"); ac.className = "acao-i"; ac.textContent = "Instalar";
      ac.onclick = async () => { pedidoInstalar.prompt(); await pedidoInstalar.userChoice.catch(() => {}); pedidoInstalar = null; desenharInicio(); };
      b.append(ac);
    }
    const x = document.createElement("button"); x.className = "fechar-i"; x.setAttribute("aria-label", "Não mostrar de novo"); x.textContent = "×";
    x.onclick = () => { try { localStorage.setItem("yuh-instalar-fechado", "1"); } catch {} b.remove(); };
    b.append(x); L.append(b);
  }
  if (!docs.length){
    L.insertAdjacentHTML("beforeend", `<div class="vazio"><div><div class="folha"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.5"/></svg></div>
      <strong>Nenhum documento ainda</strong>Toque em <b>Digitalizar</b> e aponte a câmera para a folha.<br>As bordas são encontradas sozinhas.</div></div>`);
  } else {
    const h = document.createElement("h2"); h.textContent = "Documentos"; L.append(h);
    for (const d of docs){
      const b = document.createElement("div"); b.className = "doc"; b.setAttribute("role", "button"); b.tabIndex = 0;
      b.innerHTML = `<img alt=""><span class="inf"><b></b><small></small></span><button class="mais" aria-label="Opções do documento"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>`;
      if (d.paginas[0]?.mini) b.querySelector("img").src = d.paginas[0].mini;
      b.querySelector("b").textContent = d.nome;
      b.querySelector("small").textContent = `${plural(d.paginas.length, "página", "páginas")} · ${quando(d.alterado || d.criado)}`;
      b.onclick = e => { if (!e.target.closest(".mais")) abrirDoc(d, 0); };
      b.onkeydown = e => { if (e.key === "Enter") abrirDoc(d, 0); };
      b.querySelector(".mais").onclick = () => menuDoc(d);
      L.append(b);
    }
  }
  const v = document.createElement("div"); v.className = "versao"; v.textContent = `Yuh Scanner Mobile ${VERSAO}`; L.append(v);
}
function quando(t){
  const d = new Date(t), hoje = new Date(), ontem = new Date(Date.now() - 864e5);
  const hr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === hoje.toDateString()) return `hoje, ${hr}`;
  if (d.toDateString() === ontem.toDateString()) return `ontem, ${hr}`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: d.getFullYear() === hoje.getFullYear() ? undefined : "2-digit" }) + `, ${hr}`;
}

/* ================= botões gerais ================= */
$("bDigitalizar").onclick = () => abrirCamera(null);
$("camFechar").onclick = () => { if (novas.length) concluirCaptura(); else { refazendo = null; pararCamera(); ir(camDe); } };
$("camDisparo").onclick = () => { armado = false; disparar(); };
$("camPilha").onclick = concluirCaptura;
$("camAuto").onclick = () => {
  const b = $("camAuto"), on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", on);
  try { localStorage.setItem("yuh-auto", on ? "1" : "0"); } catch {}
  avisar(on ? "Automático: tira a foto sozinho quando a folha fica parada" : "Manual: toque no botão para tirar");
};
try { if (localStorage.getItem("yuh-auto") === "0") $("camAuto").setAttribute("aria-pressed", "false"); } catch {}
$("camFlash").onclick = async () => {
  const b = $("camFlash"), on = b.getAttribute("aria-pressed") !== "true";
  try { await trilha?.applyConstraints({ advanced: [{ torch: on }] }); b.setAttribute("aria-pressed", on); b.style.color = on ? "#FFD34D" : ""; }
  catch { avisar("Este celular não deixa ligar o flash por aqui"); }
};
$("camGaleria").onclick = $("camGaleria2").onclick = () => $("arqGaleria").click();
$("arqGaleria").onchange = e => { const a = [...e.target.files]; e.target.value = ""; if (a.length) fotosDaGaleria(a); };
$("bQr").onclick = () => abrirLeitorQr();
$("bTema").onclick = () => {
  const r = document.documentElement, escuro = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  r.dataset.theme = escuro ? "light" : "dark";
  try { localStorage.setItem("yuh-tema", r.dataset.theme); } catch {}
};
try { const t = localStorage.getItem("yuh-tema"); if (t) document.documentElement.dataset.theme = t; } catch {}
window.addEventListener("resize", () => { if (!$("tBordas").hidden && bordasPag?._foto) montarBordas(); });
// botão "voltar" do Android: fecha a câmera/telas em vez de sair do app
window.addEventListener("popstate", () => {
  empilhado = false;
  const veu = celular.querySelector(".veu");
  if (veu) veu.click();
  else if (!$("zoom").hidden) $("zoom").hidden = true;
  else if (!$("tSep").hidden) $("sepVoltar").click();
  else if (!$("tCamera").hidden) $("camFechar").click();
  else if (!$("tBordas").hidden) $("bordVoltar").click();
  else if (!$("tGrade").hidden) $("gradeVoltar").click();
  else if (!$("tDoc").hidden) $("docVoltar").click();
  if ($("tInicio").hidden && !empilhado){ history.pushState({ yuh: 1 }, ""); empilhado = true; }
});

/* ================= levar para o formulário no PC (Yuh Extension) ================= */
const ICO_PC = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';
const KURU = "img/kuru.gif";
let pcEscolhido = null;

function escolherPc(){
  const l = ponte.pcs();
  folhaBaixo({ titulo: "Para qual PC?", opcoes: l.map(p => ({ t: p.nome, f: () => { pcEscolhido = p.id; $("bSalvar").click(); } })) });
}
function mostrarPcs(){
  const l = ponte.pcs();
  folhaBaixo({ titulo: "PCs conectados", texto: "Toque num PC para desconectar.", opcoes: [
    ...l.map(p => ({ t: `${p.nome} · desconectar`, perigo: true, f: async () => { await ponte.desconectarPc(p); if (pcEscolhido === p.id) pcEscolhido = null; avisar(`${p.nome} desconectado`); } })),
    { t: "Conectar outro PC", f: abrirLeitorQr },
  ] });
}

// câmera lendo o QR Code da Yuh Extension
let leitor = null;
async function abrirLeitorQr(){
  const t = document.createElement("div"); t.className = "cam-qr"; t.id = "camQr";
  t.innerHTML = `<div class="cam-topo"><button class="ic" aria-label="Fechar"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button><b>Conectar ao PC</b></div>
    <div class="visor"><video playsinline muted></video><div class="mira"><i></i><i></i><i></i><i></i><span class="linha-scan"></span></div></div>
    <div class="cam-dica-qr" id="qrDica">No PC, abra a <b>Yuh Extension</b> e toque no <b>ícone de celular</b> no topo. Depois aponte para o QR Code.</div>`;
  celular.append(t);
  const fechar = () => { leitor?.parar(); leitor = null; t.remove(); };
  t.querySelector(".cam-topo .ic").onclick = fechar;
  const video = t.querySelector("video");
  let parar = false, stream = null;
  leitor = { parar: () => { parar = true; stream?.getTracks().forEach(x => x.stop()); }, fechar };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
    video.srcObject = stream; await video.play();
  } catch { $("qrDica").textContent = "Não consegui abrir a câmera. Libere a câmera para este app e tente de novo."; return; }
  let detector = null;
  try { if ("BarcodeDetector" in window && (await BarcodeDetector.getSupportedFormats()).includes("qr_code")) detector = new BarcodeDetector({ formats: ["qr_code"] }); } catch {}
  if (!detector && !window.jsQR) await new Promise(ok => { const sc = document.createElement("script"); sc.src = "js/vendor/jsQR.js"; sc.onload = ok; sc.onerror = ok; document.head.append(sc); });
  const c = document.createElement("canvas"), g = c.getContext("2d", { willReadFrequently: true });
  const volta = async () => {
    if (parar) return;
    try {
      let texto = null;
      if (video.videoWidth){
        if (detector){ const r = await detector.detect(video); texto = r[0]?.rawValue || null; }
        else if (window.jsQR){
          const k = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
          c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
          g.drawImage(video, 0, 0, c.width, c.height);
          texto = window.jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: "dontInvert" })?.data || null;
        }
      }
      if (texto && qrLido(texto)) return;
    } catch {}
    setTimeout(volta, 250);
  };
  volta();
}
// também usado pelo link do QR (câmera comum) e pelos testes
function qrLido(texto){
  const qr = ponte.lerQr(texto);
  if (!qr){ if ($("qrDica")) $("qrDica").textContent = "Esse QR Code não é da Yuh Extension."; return false; }
  leitor?.fechar();
  conectarCom(qr);
  return true;
}
window.__yuhQr = qrLido;

async function conectarCom(qr){
  const tc = document.createElement("div"); tc.className = "tela-c"; tc.id = "telaCodigo";
  tc.innerHTML = `<header class="barra"><b style="margin-left:6px">Conectar ao PC</b></header><div class="meio"><img class="kuru" src="${KURU}" alt=""><b>Falando com o PC…</b></div>`;
  celular.append(tc);
  let r;
  try { r = await ponte.comecarConexao(qr); }
  catch (e) { tc.remove(); avisar(e.message || "Não consegui falar com o PC (sem internet?)"); return; }
  tc.innerHTML = `<header class="barra"><b style="margin-left:6px">Conectar ao PC</b></header>
    <div class="meio"><div class="ico-pc">${ICO_PC}</div><b class="nome-pc"></b>
      <span>Confira se o <b>mesmo código</b> aparece na tela do PC:</span>
      <div class="codigo">${[...r.codigo].map(d => `<span>${d}</span>`).join("")}</div>
      <small>Isso garante que você está conectando o seu PC, e não outro.</small></div>
    <div class="acoes"><button class="btn principal" id="cIgual">Os códigos são iguais</button><button class="btn leve" id="cDif">São diferentes · cancelar</button></div>`;
  tc.querySelector(".nome-pc").textContent = qr.n;
  tc.querySelector("#cDif").onclick = () => { tc.remove(); avisar("Conexão cancelada. Nada foi conectado."); };
  tc.querySelector("#cIgual").onclick = async () => {
    try {
      const pc = await ponte.confirmarConexao(r.pendente);
      pcEscolhido = pc.id;
      tc.innerHTML = `<div class="meio"><div class="ok-grande"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg></div>
        <b style="font-size:18px">Conectado!</b><span id="cEnvio"></span><span>Depois, em <b>Salvar ou enviar → Levar para o formulário no PC</b>, o documento vai direto para <b class="nome-pc"></b>.</span></div>
        <div class="acoes"><button class="btn principal" id="cOk">Entendi</button></div>`;
      tc.querySelector(".nome-pc").textContent = pc.nome;
      tc.querySelector("#cOk").onclick = () => tc.remove();
      enviarTudo(pc, tc.querySelector("#cEnvio"));
    } catch (e) { avisar(e.message || "Não consegui confirmar. Tente de novo."); }
  };
}

// assim que conecta: manda para o PC todos os documentos do celular que ainda não foram para ele
const MAX_DE_UMA_VEZ = 20;
async function enviarTudo(pc, el){
  const fila = docs.filter(d => d.paginas.length && !ponte.jaEnviado(pc, d)).slice(0, MAX_DE_UMA_VEZ);
  const msg = h => { if (el) el.innerHTML = h; };
  if (!fila.length){ msg("Não há documentos novos no celular para mandar."); return; }
  let ok = 0;
  for (const d of fila){
    msg(`<img class="kuru" src="${KURU}" alt="" style="width:64px;display:block;margin:0 auto 6px">Mandando os documentos do celular: <b>${ok + 1} de ${fila.length}</b>…`);
    try {
      const pags = await paginasProntas(d);
      await ponte.enviarAoPc(pc, d.nome, pags.map(p => p.blob));
      ponte.marcarEnviado(pc, d); ok++;
    } catch (e) {
      if (el) el.textContent = `Mandei ${ok} de ${fila.length}. ${e.message || "Não consegui mandar o resto."}`;
      return;
    }
  }
  msg(`<b style="color:var(--livre)">✓ ${ok === 1 ? "1 documento enviado" : ok + " documentos enviados"}</b> para a Yuh Extension.`);
}

async function levarParaPc(pc, d){
  const e = document.createElement("div"); e.className = "enviando";
  e.innerHTML = `<div><img class="kuru" src="${KURU}" alt=""><b></b><p>Trancado: só o seu PC consegue abrir</p></div>`;
  e.querySelector("b").textContent = `Enviando para ${pc.nome}…`;
  celular.append(e);
  try {
    const pags = await paginasProntas(d);
    const id = await ponte.enviarAoPc(pc, d.nome, pags.map(p => p.blob));
    ponte.marcarEnviado(pc, d);
    e.querySelector("b").textContent = "Enviado. Esperando o PC pegar…";
    let entregue = false;
    for (let i = 0; i < 12 && !entregue; i++){ await new Promise(r => setTimeout(r, 2500)); entregue = await ponte.foiEntregue(pc, id); }
    e.innerHTML = entregue
      ? `<div><div class="ok"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg></div><b>Chegou no PC</b><p>Já está na Yuh Extension</p></div>`
      : `<div><div class="ok"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg></div><b>Enviado</b><p>Chega assim que a Yuh Extension estiver aberta no PC (fica guardado por 24 h)</p></div>`;
    setTimeout(() => e.remove(), 2600);
  } catch (err) { e.remove(); avisar(err.message || "Não consegui enviar"); }
}

// aberto pela câmera comum (link do QR Code)
if (location.hash.startsWith("#par=")){
  const texto = location.href; history.replaceState(null, "", location.pathname + location.search);
  setTimeout(() => qrLido(texto), 600);
}

/* ================= atualização (service worker) ================= */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")){
  navigator.serviceWorker.register("sw.js").catch(() => {});
  let recarregou = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (recarregou) return; recarregou = true;
    // versão nova instalada: recarrega se estiver no início, senão oferece
    if (!$("tInicio").hidden) location.reload();
    else avisar("Versão nova do app pronta", { t: "Atualizar", f: () => location.reload() });
  });
}

/* ================= barra de botões do Android ================= */
// Em alguns Android, o app instalado às vezes recebe a tela inteira, INCLUSIVE a faixa da barra de
// botões (◀ ● ■), sem avisar (a "área segura" vem zerada). Aí os botões de baixo ficam escondidos.
// Se a altura do app for quase a tela toda (só a barra de cima descontada), damos uma folga embaixo.
function ajustarFundo(){
  let extra = 0;
  try {
    if (/Android/i.test(navigator.userAgent) && screen.height > screen.width){
      const sobra = screen.height - window.innerHeight;     // o que o sistema está ocupando (barra de cima + de baixo)
      if (sobra < 70) extra = 48;                            // normal: barra de cima (24–45) + de baixo (~48) ≥ 70
    }
  } catch {}
  document.documentElement.style.setProperty("--fundo-extra", extra + "px");
}
ajustarFundo();
window.addEventListener("resize", ajustarFundo);
window.visualViewport?.addEventListener("resize", ajustarFundo);
window.addEventListener("orientationchange", () => setTimeout(ajustarFundo, 300));
document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(ajustarFundo, 200); });

/* ================= começo ================= */
(async () => {
  try {
    if (!window.indexedDB) throw new Error("sem armazenamento");
    docs = await banco.listarDocs();
    banco.pedirPersistencia();
  } catch (e) {
    console.error(e);
    avisar("Este navegador não deixa o app guardar documentos (aba anônima?). Abra fora do modo anônimo.");
  }
  desenharInicio();
})();
