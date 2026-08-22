// ════════════════════════════════════════════════════════════════════════
//  Cifrado de los datos de las empresas
//
//  QUÉ PROTEGE Y QUÉ NO — conviene tenerlo claro antes de confiarse:
//
//  ✅ Protege contra: que alguien se lleve un respaldo de la base, que se
//     filtre por una mala configuración, o que una consulta mal hecha escupa
//     datos de otra empresa. En todos esos casos lo que sale es ilegible.
//
//  ❌ NO protege contra: alguien que tenga la llave maestra. Si CHATBOT_CLAVE
//     se filtra, el cifrado no sirvió de nada. La llave vive SOLO como
//     variable de entorno en Netlify: nunca en la base, nunca en el repo,
//     nunca en el navegador.
//
//  POR QUÉ NO SE USA pgcrypto, que ya está instalado:
//     Con pgcrypto la llave viaja DENTRO de la consulta SQL. Termina en los
//     registros de la base, en el historial del editor y en las métricas —
//     o sea, guardada justo al lado de lo que protege. Es dejar la llave
//     pegada en la chapa. Cifrando aquí, la base nunca ve la llave ni el
//     texto claro; solo guarda bultos ilegibles.
//
//  LLAVE POR EMPRESA:
//     De la llave maestra se deriva una distinta para cada empresa (HKDF,
//     con su id como sal). Si una llave derivada se filtrara, solo quema a
//     esa empresa. La maestra nunca se usa directo.
//
//  Se usa Web Crypto y no node:crypto porque el mismo código corre en
//  Netlify y en el navegador. Eso permitió PROBARLO, en vez de suponer.
// ════════════════════════════════════════════════════════════════════════

const cripto = globalThis.crypto;
if (!cripto?.subtle) {
  throw new Error('Este entorno no trae Web Crypto. Hace falta Node 18+ o un navegador moderno.');
}

const texto   = new TextEncoder();
const detexto = new TextDecoder();

// ── base64 sin Buffer (que no existe en el navegador) ───────────────────
function aBase64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function deBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ── la llave de cada empresa ────────────────────────────────────────────
//  El caché guarda las llaves ya derivadas para no rehacer HKDF en cada
//  mensaje. OJO con la trampa que ya nos mordió en la prueba: si se guarda
//  usando SOLO el id de la empresa, el caché ignora la llave maestra. El día
//  que rotes CHATBOT_CLAVE, la función seguiría cifrando con la llave vieja
//  sin decir nada, y descifraría datos que ya no debería. Por eso se recuerda
//  con qué maestra se llenó y se tira entero si cambia.
const _cache = new Map();
let _maestraDelCache = null;

async function llaveDeEmpresa(maestraB64, empresaId) {
  // La validación va ANTES del caché: si no, una llave inválida pasaría
  // desapercibida en cuanto hubiera un acierto de caché.
  const maestra = deBase64(maestraB64);
  if (maestra.length < 32) {
    throw new Error('La llave maestra debe ser de 32 bytes o más, en base64');
  }

  if (_maestraDelCache !== maestraB64) {
    _cache.clear();
    _maestraDelCache = maestraB64;
  }
  if (_cache.has(empresaId)) return _cache.get(empresaId);

  const base = await cripto.subtle.importKey('raw', maestra, 'HKDF', false, ['deriveKey']);
  const llave = await cripto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: texto.encode('empresa:' + empresaId),
      // 'info' lleva la versión: si algún día hay que cambiar el esquema de
      // cifrado, se sube a v2 y lo viejo se sigue leyendo con v1.
      info: texto.encode('chatbot-multimarca-v1'),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  _cache.set(empresaId, llave);
  return llave;
}

/**
 * Cifra cualquier cosa serializable a JSON → 'v1.<iv>.<datos>' en base64.
 *
 * AES-GCM y no CBC porque GCM además AUTENTICA: si alguien con acceso a la
 * base altera un solo byte, el descifrado FALLA en vez de devolver datos
 * manipulados en silencio.
 */
export async function cifrar(maestraB64, empresaId, valor) {
  const llave = await llaveDeEmpresa(maestraB64, empresaId);

  // IV nuevo en CADA cifrado. Reutilizar el IV con GCM rompe el cifrado por
  // completo: no es un detalle, es EL error clásico de AES-GCM.
  const iv = cripto.getRandomValues(new Uint8Array(12));

  const cifrado = new Uint8Array(
    await cripto.subtle.encrypt({ name: 'AES-GCM', iv }, llave, texto.encode(JSON.stringify(valor)))
  );
  return 'v1.' + aBase64(iv) + '.' + aBase64(cifrado);
}

/** Descifra lo de cifrar(). Si fue alterado o la llave no es la correcta, lanza. */
export async function descifrar(maestraB64, empresaId, paquete) {
  if (paquete == null || paquete === '') return null;

  const partes = String(paquete).split('.');
  if (partes.length !== 3 || partes[0] !== 'v1') throw new Error('Formato de cifrado desconocido');

  const llave = await llaveDeEmpresa(maestraB64, empresaId);
  try {
    const claro = await cripto.subtle.decrypt(
      { name: 'AES-GCM', iv: deBase64(partes[1]) }, llave, deBase64(partes[2])
    );
    return JSON.parse(detexto.decode(claro));
  } catch (e) {
    // Llave equivocada y datos alterados dan el mismo mensaje a propósito:
    // hacia afuera ambos significan lo mismo — no confíes en esto.
    throw new Error('No se pudo descifrar: llave incorrecta o datos alterados');
  }
}

/**
 * Genera una llave maestra. Se corre UNA vez y el resultado se pega en
 * Netlify como CHATBOT_CLAVE. Si se pierde, los datos cifrados se pierden
 * con ella: no hay puerta trasera, y ese es justamente el punto.
 */
export function generarLlaveMaestra() {
  return aBase64(cripto.getRandomValues(new Uint8Array(32)));
}

export function _limpiarCache() { _cache.clear(); _maestraDelCache = null; }
