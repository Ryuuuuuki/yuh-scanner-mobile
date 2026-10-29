// Yuh Scanner Mobile — tratamento da imagem: endireitar a folha, filtros, girar.
// Tudo roda no próprio celular; nenhuma foto sai do aparelho.

export const LADO_FOTO = 3000;   // maior lado guardado da foto original
export const LADO_PAGINA = 2200; // maior lado da página pronta (~190 dpi numa A4)

// O iPhone tem um limite baixo de memória para imagens (canvas) e só devolve a memória
// tarde; zerar o tamanho libera na hora. Use quando a imagem não for mais necessária.
export function liberar(...cs){ for (const c of cs) if (c instanceof HTMLCanvasElement){ c.width = 0; c.height = 0; } }

export function novoCanvas(w, h){
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

/* ---------- endireitar (homografia) ---------- */
// matriz que leva os 4 pontos "de" nos 4 pontos "para"
export function homografia(de, para){
  const A = [], b = [];
  for (let i = 0; i < 4; i++){
    const { x, y } = de[i], { x: u, y: v } = para[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++){
    let m = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
    [A[c], A[m]] = [A[m], A[c]]; [b[c], b[m]] = [b[m], b[c]];
    if (Math.abs(A[c][c]) < 1e-12) continue;
    for (let r = c + 1; r < 8; r++){ const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const h = new Array(8);
  for (let r = 7; r >= 0; r--){ let s = b[r]; for (let k = r + 1; k < 8; k++) s -= A[r][k] * h[k]; h[r] = s / (A[r][r] || 1e-12); }
  return [...h, 1];
}

// pinta em dst (dentro do quadrilátero dstQuad) a parte de src limitada por srcQuad
export function deformar(src, srcQuad, dst, dstQuad, sd){
  const H = homografia(dstQuad, srcQuad);
  const sw = src.width, sh = src.height;
  sd = sd || src.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
  const dctx = dst.getContext("2d"), dw = dst.width, dh = dst.height;
  const xs = dstQuad.map(p => p.x), ys = dstQuad.map(p => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(dw, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(dh, Math.ceil(Math.max(...ys)));
  if (x1 <= x0 || y1 <= y0) return;
  const ow = x1 - x0, out = dctx.getImageData(x0, y0, ow, y1 - y0), od = out.data;
  const retangulo = dstQuad.every(p => (p.x === 0 || p.x === dw) && (p.y === 0 || p.y === dh));
  const dentro = (px, py) => {
    let s = 0;
    for (let i = 0; i < 4; i++){
      const a = dstQuad[i], c = dstQuad[(i + 1) % 4];
      const cr = (c.x - a.x) * (py - a.y) - (c.y - a.y) * (px - a.x);
      if (cr !== 0){ if (s === 0) s = Math.sign(cr); else if (Math.sign(cr) !== s) return false; }
    }
    return true;
  };
  for (let y = y0; y < y1; y++){
    for (let x = x0; x < x1; x++){
      if (!retangulo && !dentro(x + .5, y + .5)) continue;
      const w = H[6] * x + H[7] * y + 1;
      let u = (H[0] * x + H[1] * y + H[2]) / w, v = (H[3] * x + H[4] * y + H[5]) / w;
      if (u < -1 || v < -1 || u > sw || v > sh) continue;
      u = Math.min(sw - 1.001, Math.max(0, u)); v = Math.min(sh - 1.001, Math.max(0, v));
      const ux = u | 0, vy = v | 0, fx = u - ux, fy = v - vy;
      const i00 = (vy * sw + ux) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const o = ((y - y0) * ow + (x - x0)) * 4;
      for (let k = 0; k < 3; k++){
        const t = sd[i00 + k] + (sd[i10 + k] - sd[i00 + k]) * fx, bt = sd[i01 + k] + (sd[i11 + k] - sd[i01 + k]) * fx;
        od[o + k] = t + (bt - t) * fy;
      }
      od[o + 3] = 255;
    }
  }
  dctx.putImageData(out, x0, y0);
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function endireitar(foto, c){
  let w = (dist(c[0], c[1]) + dist(c[3], c[2])) / 2, h = (dist(c[0], c[3]) + dist(c[1], c[2])) / 2;
  const s = Math.min(1, LADO_PAGINA / Math.max(w, h));
  w = Math.round(w * s); h = Math.round(h * s);
  const out = novoCanvas(w, h);
  deformar(foto, c, out, [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]);
  return out;
}

/* ---------- filtros (cara de digitalizado) ---------- */
// fundo da página: reduz muito, "apaga" o texto pegando o mais claro dos vizinhos e amplia de novo
function fundoEstimado(c){
  const p = novoCanvas(Math.max(8, c.width / 24), Math.max(8, c.height / 24));
  const g = p.getContext("2d", { willReadFrequently: true }); g.imageSmoothingQuality = "high"; g.drawImage(c, 0, 0, p.width, p.height);
  const d = g.getImageData(0, 0, p.width, p.height), o = new Uint8ClampedArray(d.data), pw = p.width, ph = p.height;
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++){
    for (let k = 0; k < 3; k++){
      let m = 0;
      for (let dy = -2; dy <= 2; dy++){
        const yy = Math.min(ph - 1, Math.max(0, y + dy));
        for (let dx = -2; dx <= 2; dx++){
          const xx = Math.min(pw - 1, Math.max(0, x + dx)), v = d.data[(yy * pw + xx) * 4 + k];
          if (v > m) m = v;
        }
      }
      o[(y * pw + x) * 4 + k] = m;
    }
  }
  d.data.set(o); g.putImageData(d, 0, 0);
  const f = novoCanvas(c.width, c.height), fg = f.getContext("2d", { willReadFrequently: true });
  fg.imageSmoothingQuality = "high"; fg.drawImage(p, 0, 0, c.width, c.height);
  const dados = fg.getImageData(0, 0, c.width, c.height).data;
  liberar(p, f);
  return dados;
}
export function aplicarFiltro(src, filtro){
  const c = novoCanvas(src.width, src.height), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0);
  if (filtro === "original") return c;
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  if (filtro === "cinza"){
    for (let i = 0; i < d.length; i += 4){ const l = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = l; }
  } else {
    const f = fundoEstimado(c), pb = filtro === "pb";
    for (let i = 0; i < d.length; i += 4){
      for (let k = 0; k < 3; k++){
        let v = d[i + k] / Math.max(1, f[i + k]) * 255;  // tira sombra e luz desigual
        d[i + k] = (v - 40) * 1.342;                        // contraste: papel branco, tinta escura
      }
      if (pb){ const l = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = l < 170 ? 0 : 255; }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
export function girar(src, q){
  q = ((q % 4) + 4) % 4; if (!q) return src;
  const c = q % 2 ? novoCanvas(src.height, src.width) : novoCanvas(src.width, src.height);
  const g = c.getContext("2d"); g.translate(c.width / 2, c.height / 2); g.rotate(q * Math.PI / 2); g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}
export function reduzir(src, lado){
  const s = Math.min(1, lado / Math.max(src.width, src.height));
  if (s === 1 && src instanceof HTMLCanvasElement) return src;
  const c = novoCanvas((src.width || src.videoWidth) * s, (src.height || src.videoHeight) * s), g = c.getContext("2d");
  g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
export function miniatura(c, larg = 240){
  const m = novoCanvas(larg, c.height * larg / c.width), g = m.getContext("2d");
  g.imageSmoothingQuality = "high"; g.drawImage(c, 0, 0, m.width, m.height);
  return m.toDataURL("image/jpeg", .8);
}
export const paraJpeg = (c, q = .88) => new Promise((ok, falha) => c.toBlob(b => b ? ok(b) : falha(new Error("Não consegui gerar a imagem")), "image/jpeg", q));
export async function carregarImagem(blob){
  const url = URL.createObjectURL(blob);
  try {
    const im = new Image(); im.decoding = "async"; im.src = url; await im.decode();
    const c = novoCanvas(im.naturalWidth, im.naturalHeight); c.getContext("2d").drawImage(im, 0, 0);
    return c;
  } finally { URL.revokeObjectURL(url); }
}
