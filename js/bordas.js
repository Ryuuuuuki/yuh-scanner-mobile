// Yuh Scanner Mobile — acha a folha na foto (os 4 cantos).
// Ideia: a folha costuma ser a maior área clara e lisa da foto. Separa claro/escuro
// (limiar de Otsu), pega a maior mancha clara, faz o contorno convexo e reduz a 4 cantos.
// Se não achar uma folha convincente, devolve null (o app usa os cantos padrão).

const LADO = 320; // a análise é feita numa cópia pequena: rápido até no vídeo ao vivo

export function acharFolha(fonte){
  const fw = fonte.videoWidth || fonte.width, fh = fonte.videoHeight || fonte.height;
  if (!fw || !fh) return null;
  const s = LADO / Math.max(fw, fh), w = Math.max(8, Math.round(fw * s)), h = Math.max(8, Math.round(fh * s));
  const c = acharFolha.c || (acharFolha.c = document.createElement("canvas"));
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(fonte, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, n = w * h;

  // cinza com "brancura": papel é claro E pouco colorido (separa de mesa clara amarelada)
  const cinza = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4){
    const r = d[j], gg = d[j + 1], b = d[j + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    cinza[i] = .299 * r + .587 * gg + .114 * b - (mx - mn) * .6;
  }
  const liso = borrar(borrar(cinza, w, h), w, h);

  // limiar de Otsu
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[Math.max(0, Math.min(255, liso[i] | 0))]++;
  let soma = 0; for (let t = 0; t < 256; t++) soma += t * hist[t];
  let sB = 0, wB = 0, melhor = 0, limiar = 128;
  for (let t = 0; t < 256; t++){
    wB += hist[t]; if (!wB) continue;
    const wF = n - wB; if (!wF) break;
    sB += t * hist[t];
    const mB = sB / wB, mF = (soma - sB) / wF, v = wB * wF * (mB - mF) ** 2;
    if (v > melhor){ melhor = v; limiar = t; }
  }
  const claro = new Uint8Array(n);
  for (let i = 0; i < n; i++) claro[i] = liso[i] > limiar ? 1 : 0;

  // maior mancha clara (preferindo a do meio da foto)
  const rot = new Int32Array(n).fill(-1), fila = new Int32Array(n);
  let maior = null;
  for (let i = 0; i < n; i++){
    if (!claro[i] || rot[i] >= 0) continue;
    let ini = 0, fim = 0, area = 0, sx = 0, sy = 0; fila[fim++] = i; rot[i] = i;
    while (ini < fim){
      const p = fila[ini++], x = p % w, y = (p / w) | 0; area++; sx += x; sy += y;
      if (x > 0 && claro[p - 1] && rot[p - 1] < 0){ rot[p - 1] = i; fila[fim++] = p - 1; }
      if (x < w - 1 && claro[p + 1] && rot[p + 1] < 0){ rot[p + 1] = i; fila[fim++] = p + 1; }
      if (y > 0 && claro[p - w] && rot[p - w] < 0){ rot[p - w] = i; fila[fim++] = p - w; }
      if (y < h - 1 && claro[p + w] && rot[p + w] < 0){ rot[p + w] = i; fila[fim++] = p + w; }
    }
    const cx = sx / area / w - .5, cy = sy / area / h - .5, nota = area * (1 - Math.min(.5, Math.hypot(cx, cy)));
    if (!maior || nota > maior.nota) maior = { id: i, area, nota };
  }
  if (!maior || maior.area < n * .12 || maior.area > n * .97) return null;

  // pontos da borda da mancha
  const pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const p = y * w + x; if (rot[p] !== maior.id) continue;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || rot[p - 1] !== maior.id || rot[p + 1] !== maior.id || rot[p - w] !== maior.id || rot[p + w] !== maior.id) pts.push({ x, y });
  }
  const casca = contornoConvexo(pts);
  if (casca.length < 4) return null;
  const quad = quatroCantos(casca);
  if (!quad) return null;
  // a mancha tem que preencher bem o quadrilátero (folha = retângulo, não uma forma qualquer)
  const aq = areaPoligono(quad);
  if (aq < n * .12 || maior.area / aq < .82) return null;
  if (!convexo(quad)) return null;
  // volta para o tamanho da foto, puxando meio pixel para dentro
  const k = 1 / s, cx = quad.reduce((a, p) => a + p.x, 0) / 4, cy = quad.reduce((a, p) => a + p.y, 0) / 4;
  return quad.map(p => ({ x: Math.max(0, Math.min(fw, (p.x + Math.sign(cx - p.x) * .5) * k)), y: Math.max(0, Math.min(fh, (p.y + Math.sign(cy - p.y) * .5) * k)) }));
}

function borrar(v, w, h){
  const o = new Float32Array(v.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    let s = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++){ const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -1; dx <= 1; dx++){ const xx = x + dx; if (xx < 0 || xx >= w) continue; s += v[yy * w + xx]; c++; } }
    o[y * w + x] = s / c;
  }
  return o;
}
// Andrew (monotone chain)
function contornoConvexo(p){
  p = p.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cruz = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], hi = [];
  for (const q of p){ while (lo.length >= 2 && cruz(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--){ const q = p[i]; while (hi.length >= 2 && cruz(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  lo.pop(); hi.pop();
  return lo.concat(hi);
}
function areaPoligono(q){ let a = 0; for (let i = 0; i < q.length; i++){ const p = q[i], r = q[(i + 1) % q.length]; a += p.x * r.y - r.x * p.y; } return Math.abs(a) / 2; }
function convexo(q){
  let s = 0;
  for (let i = 0; i < 4; i++){
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-6) return false;
    if (!s) s = Math.sign(cr); else if (Math.sign(cr) !== s) return false;
  }
  return true;
}
// escolhe 4 vértices do contorno que formam o maior quadrilátero (busca com melhoria local)
function quatroCantos(casca){
  const m = casca.length;
  if (m === 4) return ordenar(casca);
  // começo: pontos extremos nas diagonais
  const ext = [
    casca.reduce((a, p) => p.x + p.y < a.x + a.y ? p : a),
    casca.reduce((a, p) => p.x - p.y > a.x - a.y ? p : a),
    casca.reduce((a, p) => p.x + p.y > a.x + a.y ? p : a),
    casca.reduce((a, p) => p.x - p.y < a.x - a.y ? p : a),
  ];
  let idx = ext.map(p => casca.indexOf(p));
  if (new Set(idx).size < 4) return null;
  let melhorA = areaPoligono(idx.map(i => casca[i])), mudou = true, voltas = 0;
  while (mudou && voltas++ < 50){
    mudou = false;
    for (let k = 0; k < 4; k++){
      for (let j = 0; j < m; j++){
        if (idx.includes(j)) continue;
        const t = idx.slice(); t[k] = j;
        const ord = t.slice().sort((a, b) => a - b), a = areaPoligono(ord.map(i => casca[i]));
        if (a > melhorA + 1e-6){ melhorA = a; idx = ord; mudou = true; }
      }
    }
  }
  return ordenar(idx.map(i => casca[i]));
}
// ordem: superior esquerdo, superior direito, inferior direito, inferior esquerdo
export function ordenar(q){
  const cx = q.reduce((a, p) => a + p.x, 0) / 4, cy = q.reduce((a, p) => a + p.y, 0) / 4;
  const s = q.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // começa pelo de menor x+y
  let i0 = 0; s.forEach((p, i) => { if (p.x + p.y < s[i0].x + s[i0].y) i0 = i; });
  return [0, 1, 2, 3].map(k => s[(i0 + k) % 4]);
}
export function cantosPadrao(w, h){
  const mx = w * .06, my = h * .06;
  return [{ x: mx, y: my }, { x: w - mx, y: my }, { x: w - mx, y: h - my }, { x: mx, y: h - my }];
}
// quanto a folha mexeu entre duas detecções (0 = parada), em fração do tamanho da imagem
export function movimento(a, b, w, h){
  if (!a || !b) return 1;
  let m = 0; for (let i = 0; i < 4; i++) m = Math.max(m, Math.hypot((a[i].x - b[i].x) / w, (a[i].y - b[i].y) / h));
  return m;
}
