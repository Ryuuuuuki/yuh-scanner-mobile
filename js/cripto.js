// Yuh — tranca dos pacotes entre o celular e a Yuh Extension (mesmo arquivo nos dois lados).
// Cada lado tem um par de chaves ECDH (P-256). Na conexão (QR Code) eles trocam a parte pública
// e cada um calcula sozinho a MESMA chave secreta (AES-GCM 256). O carteiro na internet só vê
// pacotes trancados. O código de 4 números é tirado das duas chaves públicas: se alguém trocasse
// uma delas no caminho, os códigos não bateriam.

const b64 = {
  de: u8 => { let t = ""; for (let i = 0; i < u8.length; i += 0x8000) t += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); },
  para: s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0)),
};
export const base64 = b64;
const ECDH = { name: "ECDH", namedCurve: "P-256" };

export function aleatorio(bytes = 16){ return b64.de(crypto.getRandomValues(new Uint8Array(bytes))); }

// par de chaves novo; devolve { privJwk, pub } (pub = base64url da chave pública "raw")
export async function novoPar(){
  const k = await crypto.subtle.generateKey(ECDH, true, ["deriveBits"]);
  const pub = b64.de(new Uint8Array(await crypto.subtle.exportKey("raw", k.publicKey)));
  const privJwk = await crypto.subtle.exportKey("jwk", k.privateKey);
  return { privJwk, pub };
}

// chave secreta compartilhada (base64url de 32 bytes, para guardar)
export async function segredo(privJwk, pubOutro){
  const priv = await crypto.subtle.importKey("jwk", privJwk, ECDH, false, ["deriveBits"]);
  const pub = await crypto.subtle.importKey("raw", b64.para(pubOutro), ECDH, false, []);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256));
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array([...new TextEncoder().encode("yuh-v1"), ...bits])));
  return b64.de(h);
}

// código de 4 números que os dois lados mostram
export async function codigo(pubA, pubB){
  const [x, y] = [pubA, pubB].sort();
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x + "." + y)));
  return String(((h[0] << 16) | (h[1] << 8) | h[2]) % 10000).padStart(4, "0");
}

const chaveAes = s => crypto.subtle.importKey("raw", b64.para(s), "AES-GCM", false, ["encrypt", "decrypt"]);

// tranca um objeto → { iv, dados }
export async function trancar(segredoB64, obj){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chaveAes(segredoB64), new TextEncoder().encode(JSON.stringify(obj))));
  return { iv: b64.de(iv), dados: b64.de(dados) };
}
// abre (lança erro se a chave não for a certa ou se mexeram no pacote)
export async function abrir(segredoB64, { iv, dados }){
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64.para(iv) }, await chaveAes(segredoB64), b64.para(dados));
  return JSON.parse(new TextDecoder().decode(claro));
}
