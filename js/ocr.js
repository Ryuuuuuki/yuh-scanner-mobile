// Yuh Scanner Mobile — lê o texto da página para sugerir nomes de arquivo.
// Usa o Tesseract (o mesmo leitor do Yuh Scanner para Windows), carregado só quando
// alguém pede a primeira sugestão (~5 MB, depois fica guardado no celular).
// Roda no próprio aparelho: a imagem não sai do celular.

let worker = null, carregando = null;
const url = p => new URL("../ocr/" + p, import.meta.url).href;

function obterWorker(){
  if (worker) return Promise.resolve(worker);
  if (carregando) return carregando;
  carregando = (async () => {
    if (!window.Tesseract){
      await new Promise((ok, falha) => {
        const s = document.createElement("script");
        s.src = url("tesseract.min.js"); s.onload = ok; s.onerror = () => falha(new Error("o leitor de texto não carregou (sem internet?)"));
        document.head.append(s);
      });
    }
    worker = await window.Tesseract.createWorker("por", 1, {
      workerPath: url("worker.min.js"),
      corePath: url("core"),
      langPath: url("lang"),
      gzip: true,
      cacheMethod: "none",
      workerBlobURL: false,
    });
    return worker;
  })();
  carregando.catch(() => { carregando = null; });
  return carregando;
}

// palavras de formulário que não servem de nome
const ROTULOS = new Set(["assinatura", "data", "nome", "local", "local e data", "testemunha", "testemunhas", "visto", "carimbo", "observações", "obs"]);
const limpar = x => x.replace(/\s+/g, " ").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu, "").replace(/\s*[·•|]\s*/g, " - ").trim();

// devolve até 6 trechos que servem de nome: "Nome: MARIA DE SOUZA" vira "MARIA DE SOUZA"
export async function sugestoesDeNome(canvas){
  const w = await obterWorker();
  const { data } = await w.recognize(canvas, {}, { blocks: true });
  const vistos = new Set(), lista = [];
  for (const b of data.blocks || []) for (const par of b.paragraphs || []) for (const l of par.lines || []){
    const palavras = (l.words || []).filter(x => x.text.trim());
    if (!palavras.length) continue;
    const conf = palavras.reduce((s, x) => s + x.confidence, 0) / palavras.length;
    if (conf < 45) continue; // rabisco / assinatura
    let t = limpar(l.text);
    // "Nome: MARIA DE SOUZA" → "MARIA DE SOUZA" (também quando sobra lixo antes dos dois-pontos)
    const m = t.match(/^[^:]{0,25}:\s*(.+)$/);
    if (m && /\p{L}{2}/u.test(m[1])) t = limpar(m[1]);
    if (t.length < 3 || t.length > 60 || !/\p{L}{2}/u.test(t) || ROTULOS.has(t.toLowerCase()) || vistos.has(t.toLowerCase())) continue;
    vistos.add(t.toLowerCase()); lista.push(t);
    if (lista.length >= 6) break;
  }
  return lista;
}
