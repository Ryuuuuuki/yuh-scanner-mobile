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
  cpf: /^(CPF|N[OU°º]? ?CPF)\b/,
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
};
const tiraNumero = s => s.replace(/^\s*(\d{1,2}[A-D]?|[A-D])[\s.)-]+(?=\D)/, "");
function qualRotulo(linhaSem){
  const l = tiraNumero(linhaSem);
  for (const [k, re] of Object.entries(ROT)){ const m = re.exec(l); if (m) return { k, resto: so(l.slice(m[0].length).replace(/^[\s:./-]+/, "")) }; }
  return null;
}

// valor de um rótulo: o resto da linha, ou as próximas linhas que não são rótulos
function depoisDe(linhas, i, quantas = 1){
  const rS = qualRotulo(sem(linhas[i]));
  const original = linhas[i], corte = original.length - (rS ? rS.resto.length : 0);
  const resto = rS && rS.resto ? so(original.slice(corte)) : "";
  const vals = resto ? [resto] : [];
  for (let j = i + 1; j < linhas.length && vals.length < quantas; j++){
    if (qualRotulo(sem(linhas[j]))) break;
    if (linhas[j].trim()) vals.push(so(linhas[j]));
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

// Dois rótulos lado a lado ("NATURALIDADE DATA DE NASCIMENTO" / "CAMPINAS-SP 02/07/1988"):
// separa em duas colunas, usando a data para saber onde cortar.
const DE_DATA = new Set(["nascimento", "expedicao", "validade", "primeiraHab", "registroData"]);
function separarColunas(linhas){
  const out = [];
  for (let i = 0; i < linhas.length; i++){
    const a = qualRotulo(sem(linhas[i])), b = a && a.resto ? qualRotulo(a.resto) : null;
    const prox = linhas[i + 1];
    if (a && b && !b.resto && prox && !qualRotulo(sem(prox))){
      const d = DATA.exec(prox);
      if (d && (DE_DATA.has(a.k) !== DE_DATA.has(b.k))){
        const outro = so(prox.replace(d[0], ""));
        const rotA = so(sem(linhas[i]).slice(0, sem(linhas[i]).length - a.resto.length));
        if (DE_DATA.has(b.k)) out.push(rotA, outro, a.resto, d[0]); else out.push(rotA, d[0], a.resto, outro);
        i++; continue;
      }
    }
    out.push(linhas[i]);
  }
  return out;
}

export function lerDocumento(texto, conf){
  const linhas = separarColunas(texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean));
  const tipo = tipoDoc(texto);
  const v = {}, motivo = {};
  const poe = (k, val, porque) => { if (val && !v[k]){ v[k] = val; if (porque) motivo[k] = porque; } };

  linhas.forEach((l, i) => {
    const r = qualRotulo(sem(l)); if (!r) return;
    const [a, b] = depoisDe(linhas, i, 2);
    switch (r.k){
      case "nome": poe("nome", a && !/\d{3}/.test(a) ? a : ""); break;
      case "filiacao": if (a) poe("pai", a); if (b) poe("mae", b); break;
      case "pai": poe("pai", a); break;
      case "mae": poe("mae", a); break;
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
      case "sexo": { const m = /\b(MASCULINO|FEMININO)\b/.exec(sem([a, b].join(" "))); poe("sexo", m ? m[1][0] + m[1].slice(1).toLowerCase() : ""); break; }
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
  // datas sem rótulo: a mais antiga costuma ser o nascimento
  if (!v.nascimento){
    const ds = [...texto.matchAll(new RegExp(DATA, "g"))].map(m => `${m[1]}/${m[2]}/${m[3]}`).filter(dataValida);
    if (ds.length){ ds.sort((x, y) => x.split("/").reverse().join("").localeCompare(y.split("/").reverse().join(""))); v.nascimento = ds[0]; motivo.nascimento = "achei a data, mas sem o rótulo do lado"; }
  }

  // ficha final com situação de cada campo: ok (verde), duvida (amarelo), falta (cinza)
  const ficha = (CAMPOS[tipo] || CAMPOS.Desconhecido).map(k => {
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
