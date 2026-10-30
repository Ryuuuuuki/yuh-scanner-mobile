// Yuh Scanner Mobile — "Levar para o formulário no PC": conexão com a Yuh Extension.
// O QR Code da extensão traz o endereço do carteiro (Cloudflare), a caixa do PC e a chave
// pública dele. O celular cria a sua chave, os dois mostram o mesmo código de 4 números e,
// depois de confirmado, cada documento vai TRANCADO com a chave que só aquele PC tem.
import { novoPar, segredo, codigo, trancar, aleatorio } from "./cripto.js";

const K_PCS = "yuh-pcs", K_ID = "yuh-cel-id";
const ler = (k, padrao) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch { return padrao; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export function pcs(){ return ler(K_PCS, []); }
function salvarPcs(l){ gravar(K_PCS, l); }
export function meuId(){ let id = ler(K_ID, null); if (!id){ id = aleatorio(12); gravar(K_ID, id); } return id; }
export function nomeDoCelular(){
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iPad";
  const m = /Android[^;]*;\s*([^;)]+?)(\s+Build|\))/.exec(ua);
  const modelo = m && m[1] && !/^(K|wv)$/.test(m[1].trim()) ? m[1].trim() : "";
  return modelo ? `Android ${modelo}`.slice(0, 40) : "Celular Android";
}

// lê o texto do QR (link do app com #par=…) → { u, c, k, n } ou null
export function lerQr(texto){
  try {
    const i = String(texto).indexOf("#par="); if (i < 0) return null;
    const b = texto.slice(i + 5).replace(/-/g, "+").replace(/_/g, "/");
    const o = JSON.parse(decodeURIComponent(escape(atob(b + "===".slice((b.length + 3) % 4)))));
    if (o.v !== 1 || !/^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$))/.test(o.u) || !/^[A-Za-z0-9_-]{22,64}$/.test(o.c) || typeof o.k !== "string") return null;
    return { u: o.u.replace(/\/+$/, ""), c: o.c, k: o.k, n: String(o.n || "PC").slice(0, 40) };
  } catch { return null; }
}

async function postar(u, c, pacote){
  const r = await fetch(`${u}/c/${c}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pacote) });
  if (!r.ok) throw new Error(r.status === 413 ? "O documento ficou grande demais para enviar." : r.status === 429 ? "A caixa do PC está cheia. Abra a Yuh Extension no PC para receber." : "Não consegui falar com o carteiro (sem internet?).");
  return (await r.json()).id;
}

// 1º passo: manda a chave do celular e calcula o código → { codigo, pendente }
export async function comecarConexao(qr){
  const par = await novoPar();
  const seg = await segredo(par.privJwk, qr.k);
  const de = meuId();
  await postar(qr.u, qr.c, { tipo: "par", de, pub: par.pub, nome: nomeDoCelular() });
  return { codigo: await codigo(qr.k, par.pub), pendente: { qr, seg } };
}
// 2º passo (códigos iguais): confirma e guarda o PC
export async function confirmarConexao({ qr, seg }){
  const de = meuId();
  await postar(qr.u, qr.c, { tipo: "ok", de, ...(await trancar(seg, { ok: true })) });
  const l = pcs().filter(p => p.c !== qr.c);
  l.unshift({ id: qr.c, nome: qr.n, u: qr.u, c: qr.c, segredo: seg, quando: Date.now() });
  salvarPcs(l);
  return l[0];
}
export async function desconectarPc(pc){
  try { await postar(pc.u, pc.c, { tipo: "tchau", de: meuId(), ...(await trancar(pc.segredo, { tchau: true })) }); } catch {}
  salvarPcs(pcs().filter(p => p.id !== pc.id));
}

// reduz as páginas (mais rápido de enviar) → data URLs JPEG
async function paraDataUrl(blob){
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  const url = c.toDataURL("image/jpeg", 0.85); c.width = c.height = 0;
  return url;
}
// envia → id do pacote
export async function enviarAoPc(pc, nome, blobs){
  const imagens = [];
  for (const b of blobs.slice(0, 6)) imagens.push(await paraDataUrl(b));
  return postar(pc.u, pc.c, { tipo: "doc", de: meuId(), ...(await trancar(pc.segredo, { nome, imagens })) });
}
// a extensão pegou o pacote? (ele some da caixa quando ela pega)
export async function foiEntregue(pc, id){
  try { const r = await fetch(`${pc.u}/c/${pc.c}/${id}?so=existe`); return r.ok && !(await r.json()).existe; } catch { return false; }
}

// o que já foi para cada PC (para mandar só o que falta quando conecta de novo)
const K_ENV = "yuh-enviados";
export function jaEnviado(pc, doc){ const m = ler(K_ENV, {}); return m[pc.id]?.[doc.id] === doc.alterado; }
export function marcarEnviado(pc, doc){
  const m = ler(K_ENV, {}); const x = m[pc.id] || (m[pc.id] = {});
  x[doc.id] = doc.alterado;
  const ids = Object.keys(x); if (ids.length > 300) for (const k of ids.slice(0, ids.length - 300)) delete x[k];
  gravar(K_ENV, m);
}
