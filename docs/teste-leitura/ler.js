// Yuh — entende o texto lido de um documento (RG/CIN, CNH, certidão) e monta a ficha.
// Recebe o texto do Google Vision (linhas separadas por \n) e, opcionalmente,
// a confiança de cada palavra. Não sabe nada de rede: dá para testar com texto puro.
// Este arquivo vai ser reaproveitado na Yuh Extension.

const sem = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const so = s => s.replace(/\s+/g, " ").trim();

// ---------- conferências ----------
export function cpfValido(c){
  const d = c.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  for (const n of [9, 10]){
    let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i);
    const dv = (s * 10) % 11 % 10; if (dv !== +d[n]) return false;
  }
  return true;
}
export function dataValida(t){
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t); if (!m) return false;
  const [, d, mm, a] = m.map(Number), x = new Date(a, mm - 1, d);
  return x.getFullYear() === a && x.getMonth() === mm - 1 && x.getDate() === d && a > 1880 && a < 2100;
}
const fmtCpf = d => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;

// ---------- tipo do documento ----------
export function tipoDoc(texto){
  const t = sem(texto);
  if (/HABILITACAO|PERMISSAO PARA DIRIGIR|DRIVER LICENSE|CAT\.?\s*HAB/.test(t)) return "CNH";
  if (/CERTIDAO DE (NASCIMENTO|CASAMENTO|OBITO)|REGISTRO CIVIL DAS PESSOAS/.test(t)) return "Certidão";
  if (/IDENTIDADE|REGISTRO GERAL|IDENTITY CARD/.test(t)) return "RG";
  return "Desconhecido";
}

// ---------- rótulos ----------
// Cada rótulo é testado no começo da linha (sem acento, maiúsculo). Números na frente
// (CNH nova: "1 NOME", "4D CPF") são ignorados.
const ROT = {
  nome: /^(NOME( E SOBRENOME| CIVIL| SOCIAL)?|NOME DO REGISTRADO|NOME DO\(?A\)? REGISTRADO\(?A\)?)\b/,
  filiacao: /^FILIACAO\b/,
  pai: /^PAI\b/,
  mae: /^MAE\b/,
  nascimento: /^(DATA,? (DE |E LOCAL DE |LOCAL E UF DE )?NASCIMENTO|NASCIMENTO|DATA NASC)\b/,
  naturalidade: /^(NATURALIDADE|LOCAL DE NASCIMENTO|MUNICIPIO DE NASCIMENTO)\b/,
  cpf: /^(REGISTRO GERAL\s*-?\s*CPF|CPF|N[OU°º]? ?CPF)\b/,
  registroGeral: /^(REGISTRO GERAL|R\.?G\.?|N[OU°º]? DO RG|REGISTRO)\b/,
  expedicao: /^(DATA (DE )?(EXPEDICAO|EMISSAO)|EXPEDICAO|EMISSAO)\b/,
  orgao: /^(ORGAO (EMISSOR|EXPEDIDOR)|ORG\.? EMISSOR)\b/,
  docIdentidade: /^DOC\.? ?IDENTIDADE\b/,
  registroCnh: /^(N[OU°º]? ?(DE )?REGISTRO|NO REGISTRO|N REGISTRO)\b/,
  validade: /^VALIDADE\b/,
  primeiraHab: /^(1[AªO]? ?HABILITACAO|PRIMEIRA HABILITACAO)\b/,
  categoria: /^(CAT\.? ?HAB\.?|CATEGORIA)\b/,
  matricula: /^MATRICULA\b/,
  registroData: /^(DATA DO REGISTRO|REGISTRADO EM)\b/,
  sexo: /^SEXO\b/,
  nacionalidade: /^NACIONALIDADE\b/,
  local: /^LOCAL\b/,
};
const tiraNumero = s => s.replace(/^\s*(\d{1,2}[A-D]?|[A-D])[\s.)-]+(?=\D)/, "");
function qualRotulo(linhaSem){
  const l = tiraNumero(linhaSem);
  for (const [k, re] of Object.entries(ROT)){ const m = re.exec(l); if (m) return { k, rot: m[0], resto: so(l.slice(m[0].length).replace(/^[\s:./-]+/, "")) }; }
  return null;
}

const bordas = v => so(v.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu, ""));

// valor de um rótulo: o resto da linha, ou as próximas linhas que não são rótulos
function depoisDe(linhas, i, quantas = 1){
  const rS = qualRotulo(sem(linhas[i]));
  const original = linhas[i], corte = original.length - (rS ? rS.resto.length : 0);
  const resto = rS && rS.resto ? bordas(original.slice(corte)) : "";
  const vals = resto ? [resto] : [];
  for (let j = i + 1; j < linhas.length && vals.length < quantas; j++){
    if (qualRotulo(sem(linhas[j]))) break;
    const v = bordas(linhas[j]); if (v) vals.push(v);
  }
  return vals;
}

// ---------- confiança ----------
// conf: Map palavra(sem acento) -> menor confiança vista (0..1). Valor sem palavras conhecidas = 1.
function confDe(valor, conf){
  if (!conf || !valor) return 1;
  let m = 1;
  for (const p of sem(valor).split(/[^A-Z0-9]+/)) if (p && conf.has(p)) m = Math.min(m, conf.get(p));
  return m;
}

// ---------- estado (UF) escrito por extenso ----------
const UFS = { ACRE: "AC", ALAGOAS: "AL", AMAPA: "AP", AMAZONAS: "AM", BAHIA: "BA", CEARA: "CE", "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", GOIAS: "GO", MARANHAO: "MA", "MATO GROSSO DO SUL": "MS", "MATO GROSSO": "MT", "MINAS GERAIS": "MG", PARA: "PA", PARAIBA: "PB", PARANA: "PR", PERNAMBUCO: "PE", PIAUI: "PI", "RIO DE JANEIRO": "RJ", "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS", RONDONIA: "RO", RORAIMA: "RR", "SANTA CATARINA": "SC", "SAO PAULO": "SP", SERGIPE: "SE", TOCANTINS: "TO" };
function ufDoTexto(texto){
  const m = /ESTADO D[OAE] ([A-Z ]+)/.exec(sem(texto)); if (!m) return "";
  const nome = Object.keys(UFS).sort((a, b) => b.length - a.length).find(n => m[1].startsWith(n));
  return nome ? UFS[nome] : "";
}

// ---------- montar a ficha ----------
const CAMPOS = {
  RG: ["nome", "cpf", "registroGeral", "orgao", "expedicao", "nascimento", "naturalidade", "pai", "mae"],
  CNH: ["nome", "cpf", "registroCnh", "categoria", "validade", "primeiraHab", "nascimento", "naturalidade", "docIdentidade", "pai", "mae"],
  "Certidão": ["nome", "matricula", "nascimento", "naturalidade", "sexo", "pai", "mae", "registroData"],
  Desconhecido: ["nome", "cpf", "nascimento", "pai", "mae"],
};
export const NOMES = {
  nome: "Nome", cpf: "CPF", registroGeral: "RG (número)", orgao: "Órgão emissor", expedicao: "Data de expedição",
  nascimento: "Data de nascimento", naturalidade: "Naturalidade", pai: "Pai", mae: "Mãe", registroCnh: "Nº de registro da CNH",
  categoria: "Categoria", validade: "Validade", primeiraHab: "1ª habilitação", docIdentidade: "Doc. de identidade / órgão / UF",
  matricula: "Matrícula", sexo: "Sexo", registroData: "Data do registro",
};
const DATA = /\b(\d{2})[\/.-](\d{2})[\/.-](\d{4})\b/;
const pegaData = s => { const m = DATA.exec(s || ""); return m ? `${m[1]}/${m[2]}/${m[3]}` : ""; };

// ---------- arrumar as linhas antes de ler ----------
// • CIN (identidade nova): rótulos em português e inglês ("Nome / Name") → tira o inglês.
// • Sujeira da foto no começo da linha ("“ES Nome", "| q. Data de…") → pula até 2 pedacinhos.
// • Vários rótulos na mesma linha ("NATURALIDADE VALIDADE" / "GUARULHOS, SP 03/11/2035")
//   → separa os valores pelo formato (data, CPF, sexo, país) e o que sobra vai para o rótulo de texto.
const DE_DATA = new Set(["nascimento", "expedicao", "validade", "primeiraHab", "registroData"]);
const INGLES = /\s*\/\s*(SOCIAL NAME|GIVEN NAMES|SURNAME|NAME|PERSONAL NUMBER|DATE OF BIRTH|PLACE OF BIRTH|NATIONALITY|EXPIRY|SEX|FILIATION|CARD ISSUER SIGNATURE|CARD ISSUER|ISSUE|PLACE)\b/g;
const CPF_RE = /(?<!\d)\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s.]?\d{2}(?!\d)/;
const FORMATO = { cpf: CPF_RE, sexo: /\b(MASCULINO|FEMININO|M|F)\b(?!.*\b(M|F)\b)/, nacionalidade: /\b[A-Z]{3}\b(?!.*\b[A-Z]{3}\b)/, categoria: /\b(ACC|AB|AC|AD|AE|A|B|C|D|E)\b/ };
function achaRotulos(linha){
  let s = so(sem(linha).replace(INGLES, " ").replace(/[^A-Z0-9\/.,:ªº° -]/g, " "));
  for (let pulos = 0; pulos <= 2; pulos++){
    let r = qualRotulo(s);
    if (r){
      const lista = [r];
      while (r.resto){ const n = qualRotulo(r.resto.replace(/^[-\s]+/, "")); if (!n) break; lista.push(n); r = n; }
      return { lista, resto: r.resto };
    }
    const m = /^\S{1,2}\s+/.exec(s); if (!m) break; s = s.slice(m[0].length);
  }
  return null;
}
function normalizarLinhas(linhas){
  const out = [];
  for (let i = 0; i < linhas.length; i++){
    const a = achaRotulos(linhas[i]);
    if (!a){ out.push(linhas[i]); continue; }
    if (a.lista.length === 1){
      out.push(a.lista[0].rot);
      if (a.resto && (a.resto.match(/[A-Z0-9]/g) || []).length >= 3){ const pal = so(linhas[i]).split(" "); out.push(bordas(pal.slice(-a.resto.split(" ").length).join(" "))); }
      continue;
    }
    // vários rótulos: separa o valor da linha de baixo
    const prox = linhas[i + 1], ehRot = prox && achaRotulos(prox);
    if (a.resto || !prox || ehRot){ for (const r of a.lista) out.push(r.rot); continue; }
    let v = bordas(prox), vS = sem(v); const vals = {}, texto = [];
    for (const r of a.lista){
      const re = DE_DATA.has(r.k) ? DATA : FORMATO[r.k];
      if (!re){ texto.push(r); continue; }
      const m = re.exec(vS); if (!m) continue;
      vals[r.k] = v.substr(m.index, m[0].length); vS = vS.slice(0, m.index) + " ".repeat(m[0].length) + vS.slice(m.index + m[0].length);
    }
    if (texto.length === 1) vals[texto[0].k] = bordas(v.split("").map((c, k) => vS[k] === " " && c !== " " ? " " : c).join(""));
    if (texto.length > 1){ for (const r of a.lista) out.push(r.rot); continue; }
    for (const r of a.lista){ out.push(r.rot); if (vals[r.k]) out.push(vals[r.k]); }
    i++;
  }
  return out;
}
// nome no meio de sujeira: "= ASSNENHES — ENILTON NEVES DE MOURA ido A" → "ENILTON NEVES DE MOURA"
function limparNome(v){
  if (!v) return v;
  const partes = v.split(/\s*[—–=|_]+\s*|\s-\s/).filter(Boolean);
  let t = partes.sort((x, y) => (y.match(/\p{Lu}/gu) || []).length - (x.match(/\p{Lu}/gu) || []).length)[0].split(/\s+/);
  const ruim = w => w.length <= 2 || !/^[\p{Lu}'.]+$/u.test(w);
  while (t.length && ruim(t[0])) t.shift();
  while (t.length && ruim(t[t.length - 1])) t.pop();
  return t.length >= 2 ? t.join(" ") : "";
}

export function lerDocumento(texto, conf){
  const linhas = normalizarLinhas(texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean));
  const tipo = tipoDoc(texto);
  const v = {}, motivo = {};
  const poe = (k, val, porque) => { if (val && !v[k]){ v[k] = val; if (porque) motivo[k] = porque; } };

  linhas.forEach((l, i) => {
    const r = qualRotulo(sem(l)); if (!r) return;
    const [a, b] = depoisDe(linhas, i, 2);
    switch (r.k){
      case "nome": poe("nome", a && !/\d{3}/.test(a) ? limparNome(a) : ""); break;
      case "filiacao": { const x = limparNome(a), y = limparNome(b); if (x) poe("pai", x, "confira: a ordem pai/mãe não vem escrita"); if (y) poe("mae", y, "confira: a ordem pai/mãe não vem escrita"); break; }
      case "pai": poe("pai", limparNome(a)); break;
      case "mae": poe("mae", limparNome(a)); break;
      case "nascimento": {
        const d = pegaData(a) || pegaData(b); poe("nascimento", d);
        // CNH nova: "3 DATA, LOCAL E UF DE NASCIMENTO" → "01/02/1980, SÃO PAULO, SP"
        const loc = a && d ? so(a.replace(DATA, "").replace(/^[\s,;-]+/, "")) : "";
        if (loc && /\p{L}{3}/u.test(loc)) poe("naturalidade", loc);
        break;
      }
      case "naturalidade": poe("naturalidade", a); break;
      case "expedicao": poe("expedicao", pegaData(a) || pegaData(b)); break;
      case "validade": poe("validade", pegaData(a) || pegaData(b)); break;
      case "primeiraHab": poe("primeiraHab", pegaData(a) || pegaData(b)); break;
      case "registroData": poe("registroData", pegaData(a) || pegaData(b)); break;
      case "orgao": poe("orgao", a); break;
      case "docIdentidade": poe("docIdentidade", a); break;
      case "categoria": { const m = /\b(ACC|A|B|C|D|E|AB|AC|AD|AE)\b/.exec(sem(a || "")); poe("categoria", m ? m[1] : ""); break; }
      case "sexo": { const m = /\b(MASCULINO|FEMININO|M|F)\b/.exec(sem(a || "")) || /\b(MASCULINO|FEMININO)\b/.exec(sem(b || "")); poe("sexo", m ? (m[1][0] === "M" ? "Masculino" : "Feminino") : ""); break; }
      case "registroCnh": { const m = /\b(\d{9,11})\b/.exec((a || "") + " " + (b || "")); if (tipo === "CNH") poe("registroCnh", m ? m[1] : ""); break; }
      case "registroGeral": {
        if (tipo === "CNH") break;
        const m = /\b(\d{1,2}\.?\d{3}\.?\d{3}-?[\dX]?)\b/i.exec((a || "") + " " + (b || "")); poe("registroGeral", m ? m[1] : ""); break;
      }
      case "matricula": {
        const d = [a, b].join(" ").replace(/[^\d]/g, "");
        poe("matricula", d.length >= 30 ? d.slice(0, 32).replace(/^(\d{6})(\d{2})(\d{2})(\d{4})(\d)(\d{5})(\d{3})(\d{7})(\d{2})$/, "$1 $2 $3 $4 $5 $6 $7 $8 $9") : "");
        break;
      }
      case "cpf": break; // tratado abaixo
    }
  });

  // CPF: qualquer número no formato, preferindo um que confere
  const cpfs = [...texto.matchAll(/(?<!\d)(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s.]?\d{2})(?!\d)/g)].map(m => m[1].replace(/\D/g, ""));
  const bom = cpfs.find(cpfValido);
  if (bom) v.cpf = fmtCpf(bom);
  else if (cpfs.length && (tipo !== "Certidão")) { v.cpf = fmtCpf(cpfs[0]); motivo.cpf = "os números não conferem (dígito verificador)"; }

  // órgão emissor no RG costuma vir como "SSP/SP" solto
  if (tipo === "RG" && !v.orgao){ const m = /\b(SSP|SDS|SESP|PC|IIRGD|DETRAN|SJS|IGP|SEJUSP|SSPDS)\s*[\/-]?\s*([A-Z]{2})\b/.exec(sem(texto)); if (m) v.orgao = `${m[1]}/${m[2]}`; }
  if (tipo === "RG" && !v.orgao && /SECRETARIA (DA|DE) (ESTADO DA )?SEGURANCA PUBLICA/.test(sem(texto))){
    const uf = ufDoTexto(texto); if (uf){ v.orgao = `SSP/${uf}`; motivo.orgao = "deduzido de “Secretaria da Segurança Pública”"; }
  }
  // "… Emissão / Issue …" no meio da linha (verso da CIN): a data vem nela ou na de baixo
  if (!v.expedicao) linhas.forEach((l, i) => { if (!v.expedicao && /EMISSAO|EXPEDICAO/.test(sem(l))){ const d = pegaData(l) || pegaData(linhas[i + 1]); if (d){ v.expedicao = d; motivo.expedicao = "achei perto de “Emissão”"; } } });
  // datas sem rótulo: a mais antiga (que não seja de outro campo) costuma ser o nascimento
  if (!v.nascimento){
    const usadas = new Set([v.expedicao, v.validade, v.primeiraHab, v.registroData].filter(Boolean));
    const ds = [...texto.matchAll(new RegExp(DATA, "g"))].map(m => `${m[1]}/${m[2]}/${m[3]}`).filter(d => dataValida(d) && !usadas.has(d));
    if (ds.length){ ds.sort((x, y) => x.split("/").reverse().join("").localeCompare(y.split("/").reverse().join(""))); v.nascimento = ds[0]; motivo.nascimento = "achei a data, mas sem o rótulo do lado"; }
  }

  // ficha final com situação de cada campo: ok (verde), duvida (amarelo), falta (cinza)
  const lista = (CAMPOS[tipo] || CAMPOS.Desconhecido).slice();
  if (/REGISTRO GERAL\s*-?\s*CPF/.test(sem(texto)) && !v.registroGeral) lista.splice(lista.indexOf("registroGeral"), 1); // CIN: o número é o CPF
  for (const k of ["validade", "sexo"]) if (v[k] && !lista.includes(k)) lista.splice(lista.indexOf("pai") < 0 ? lista.length : lista.indexOf("pai"), 0, k);
  const ficha = lista.map(k => {
    const val = v[k] || "";
    let sit = val ? "ok" : "falta", porque = motivo[k] || "";
    if (val){
      const c = confDe(val, conf);
      if (/^(nascimento|expedicao|validade|primeiraHab|registroData)$/.test(k) && !dataValida(val)){ sit = "duvida"; porque = porque || "data estranha"; }
      if (porque) sit = "duvida";
      else if (c < 0.9){ sit = "duvida"; porque = `leitura incerta (${Math.round(c * 100)}%)`; }
    }
    return { campo: k, rotulo: NOMES[k], valor: val, situacao: sit, porque };
  });
  return { tipo, ficha };
}

// Confiança por palavra a partir da resposta do Vision (fullTextAnnotation)
export function confiancas(fta){
  const m = new Map();
  for (const pg of fta?.pages || []) for (const b of pg.blocks || []) for (const p of b.paragraphs || []) for (const w of p.words || []){
    const t = sem((w.symbols || []).map(s => s.text).join("")).replace(/[^A-Z0-9]/g, "");
    if (t && typeof w.confidence === "number") m.set(t, Math.min(m.get(t) ?? 1, w.confidence));
  }
  return m;
}
