// Yuh Scanner Mobile — guarda os documentos no próprio celular (IndexedDB).
//   docs:   { id, nome, criado, alterado, paginas:[{ pid, cantos, filtro, rot, mini }] }
//   fotos:  pid -> Blob JPEG da foto original (para poder ajustar bordas/filtro depois)
//   prontas: pid -> { chave, blob } página tratada (evita refazer o processamento ao abrir)

const NOME = "yuh-scanner-mobile", VERSAO = 1;
let conexao = null;

function abrir(){
  if (conexao) return conexao;
  conexao = new Promise((ok, falha) => {
    const r = indexedDB.open(NOME, VERSAO);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("fotos")) db.createObjectStore("fotos");
      if (!db.objectStoreNames.contains("prontas")) db.createObjectStore("prontas");
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
  return conexao;
}
async function tx(lojas, modo, fn){
  const db = await abrir();
  return new Promise((ok, falha) => {
    const t = db.transaction(lojas, modo);
    let res;
    Promise.resolve(fn(...lojas.map(l => t.objectStore(l)))).then(v => { res = v; });
    t.oncomplete = () => ok(res);
    t.onerror = () => falha(t.error);
    t.onabort = () => falha(t.error || new Error("operação cancelada"));
  });
}
const pedido = r => new Promise((ok, falha) => { r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error); });

export async function listarDocs(){
  const lista = await tx(["docs"], "readonly", d => pedido(d.getAll()));
  return lista.sort((a, b) => b.alterado - a.alterado);
}
export async function salvarDoc(doc){
  doc.alterado = Date.now();
  const copia = { ...doc, paginas: doc.paginas.map(p => ({ pid: p.pid, cantos: p.cantos, filtro: p.filtro, rot: p.rot, mini: p.mini })) };
  return tx(["docs"], "readwrite", d => pedido(d.put(copia)));
}
export async function excluirDoc(doc){
  return tx(["docs", "fotos", "prontas"], "readwrite", (d, f, p) => {
    d.delete(doc.id);
    for (const pg of doc.paginas){ f.delete(pg.pid); p.delete(pg.pid); }
  });
}
export const guardarFoto = (pid, blob) => tx(["fotos"], "readwrite", f => pedido(f.put(blob, pid)));
export const lerFoto = pid => tx(["fotos"], "readonly", f => pedido(f.get(pid)));
export const apagarFoto = pid => tx(["fotos", "prontas"], "readwrite", (f, p) => { f.delete(pid); p.delete(pid); });
export const guardarPronta = (pid, chave, blob) => tx(["prontas"], "readwrite", p => pedido(p.put({ chave, blob }, pid)));
export const lerPronta = pid => tx(["prontas"], "readonly", p => pedido(p.get(pid)));

// pede ao celular para não apagar os dados do app quando faltar espaço
export async function pedirPersistencia(){
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch {}
}
