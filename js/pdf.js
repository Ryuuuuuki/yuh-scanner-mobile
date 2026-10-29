// Yuh Scanner Mobile — monta o PDF (uma imagem JPEG por página) sem bibliotecas.
// Página com largura A4 (595 pt) e altura proporcional à folha.

export async function montarPdf(nome, jpegs){ // jpegs: [{ blob, w, h }]
  const enc = new TextEncoder(), partes = [], offs = [];
  let tam = 0;
  const add = x => { const u = typeof x === "string" ? enc.encode(x) : x; partes.push(u); tam += u.length; };
  const obj = (n, corpo) => { offs[n] = tam; add(`${n} 0 obj\n`); corpo(); add("\nendobj\n"); };
  add("%PDF-1.4\n%âãÏÓ\n");
  const n = jpegs.length, kids = [];
  for (let i = 0; i < n; i++) kids.push(3 + i * 3);
  obj(1, () => add(`<< /Type /Catalog /Pages 2 0 R >>`));
  obj(2, () => add(`<< /Type /Pages /Count ${n} /Kids [${kids.map(k => k + " 0 R").join(" ")}] >>`));
  for (let i = 0; i < n; i++){
    const { blob, w, h } = jpegs[i], jpg = new Uint8Array(await blob.arrayBuffer());
    const W = 595.28, H = +(W * h / w).toFixed(2);
    const pg = 3 + i * 3, im = pg + 1, ct = pg + 2, conteudo = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(pg, () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`));
    obj(im, () => { add(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); add(jpg); add("\nendstream"); });
    obj(ct, () => add(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`));
  }
  const total = 3 + n * 3, xref = tam;
  add(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let k = 1; k < total; k++) add(String(offs[k]).padStart(10, "0") + " 00000 n \n");
  add(`trailer\n<< /Size ${total} /Root 1 0 R /Info << /Producer (Yuh Scanner Mobile) >> >>\nstartxref\n${xref}\n%%EOF`);
  return new File(partes, `${nome}.pdf`, { type: "application/pdf" });
}
