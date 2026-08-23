/* ══════════════════════════════════════════════════════════════════════
   CÓDIGO QR  ·  generador propio, sin librerías ni servicios

   POR QUÉ NO UN SERVICIO EN LÍNEA:
   Los generadores de QR reciben el texto como parámetro de la URL. En un QR
   de WhatsApp ese texto LLEVA EL NÚMERO DE TELÉFONO dentro. Usarlos sería
   mandarle a un tercero el teléfono de cada médico para dibujar cuadritos.

   POR QUÉ NO UNA LIBRERÍA:
   El proyecto no tiene compilación ni package.json a propósito.

   ALCANCE, limitado a propósito:
   Modo byte, corrección nivel M, versiones 1 a 6 (hasta 108 bytes). Una URL
   de WhatsApp mide ~30 caracteres y una del sitio ~70, así que sobra.
   Quedarse en la 6 evita codificar el bloque de versión, que solo existe de
   la 7 en adelante.
   ══════════════════════════════════════════════════════════════════════ */

// Por versión (1..6) en nivel M: [total, ecPorBloque, bloques, datosPorBloque]
const TABLA = {
  1: [26,  10, 1, 16],
  2: [44,  16, 1, 28],
  3: [70,  26, 1, 44],
  4: [100, 18, 2, 32],
  5: [134, 24, 2, 43],
  6: [172, 16, 4, 27],
};

// Centro del patrón de alineación. La versión 1 no tiene.
const ALINEACION = { 1: null, 2: 18, 3: 22, 4: 26, 5: 30, 6: 34 };

/* ── aritmética en GF(256), la que usa Reed-Solomon ──────────────────── */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(function tablas() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

function polinomioGenerador(grado) {
  let p = [1];
  for (let i = 0; i < grado; i++) {
    const q = [...p, 0];
    for (let j = 0; j < p.length; j++) q[j + 1] ^= mul(p[j], EXP[i]);
    p = q;
  }
  return p;
}

function correccion(datos, cuantos) {
  const gen = polinomioGenerador(cuantos);
  const resto = new Uint8Array(cuantos);
  for (const byte of datos) {
    const factor = byte ^ resto[0];
    resto.copyWithin(0, 1); resto[cuantos - 1] = 0;
    if (factor !== 0) for (let i = 0; i < cuantos; i++) resto[i] ^= mul(gen[i + 1], factor);
  }
  return resto;
}

/* ── la trama de bytes ───────────────────────────────────────────────── */
function bytesDe(texto, version) {
  const bytes = new TextEncoder().encode(texto);
  const [total, ec, bloques, porBloque] = TABLA[version];
  const capacidad = bloques * porBloque;

  const bits = [];
  const meter = (valor, cuantos) => {
    for (let i = cuantos - 1; i >= 0; i--) bits.push((valor >> i) & 1);
  };

  meter(0b0100, 4);        // modo byte
  meter(bytes.length, 8);  // cuenta de caracteres (versiones 1..9)
  for (const b of bytes) meter(b, 8);

  for (let i = 0; i < 4 && bits.length < capacidad * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);

  const cuerpo = [];
  for (let i = 0; i < bits.length; i += 8) {
    cuerpo.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  }
  const RELLENO = [0xec, 0x11];
  for (let i = 0; cuerpo.length < capacidad; i++) cuerpo.push(RELLENO[i % 2]);

  // Se parte en bloques y se entrelaza: así una raya en el papel daña un
  // poco de cada bloque en vez de destruir uno entero.
  const datosB = [], ecB = [];
  for (let i = 0; i < bloques; i++) {
    const trozo = cuerpo.slice(i * porBloque, (i + 1) * porBloque);
    datosB.push(trozo); ecB.push(correccion(trozo, ec));
  }

  const salida = [];
  for (let i = 0; i < porBloque; i++) for (const b of datosB) salida.push(b[i]);
  for (let i = 0; i < ec; i++)        for (const b of ecB)    salida.push(b[i]);
  if (salida.length !== total) throw new Error('QR: tamaño inesperado');
  return salida;
}

/* ── la matriz ───────────────────────────────────────────────────────── */
function ponerFijos(celda, lado, version) {
  const L = lado;
  const buscador = (fx, fy) => {
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
      const px = fx + x, py = fy + y;
      if (px < 0 || py < 0 || px >= L || py >= L) continue;
      const borde = (x >= 0 && x <= 6 && (y === 0 || y === 6)) ||
                    (y >= 0 && y <= 6 && (x === 0 || x === 6));
      const centro = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      celda[py][px] = (borde || centro) ? 1 : 0;
    }
  };
  buscador(0, 0); buscador(L - 7, 0); buscador(0, L - 7);

  for (let i = 8; i < L - 8; i++) {
    celda[6][i] = celda[i][6] = (i % 2 === 0) ? 1 : 0;
  }

  const a = ALINEACION[version];
  if (a != null) {
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
      celda[a + y][a + x] = (Math.max(Math.abs(x), Math.abs(y)) !== 1) ? 1 : 0;
    }
  }
  celda[L - 8][8] = 1;   // módulo oscuro, siempre
}

function reservarFormato(celda, lado) {
  for (let i = 0; i < 9; i++) {
    if (celda[8][i] === -1) celda[8][i] = 0;
    if (celda[i][8] === -1) celda[i][8] = 0;
  }
  for (let i = lado - 8; i < lado; i++) {
    if (celda[8][i] === -1) celda[8][i] = 0;
    if (celda[i][8] === -1) celda[i][8] = 0;
  }
}

function ponerDatos(celda, lado, bytes) {
  let bit = 0;
  const siguiente = () => {
    const i = bit >> 3;
    const b = (i < bytes.length) ? (bytes[i] >> (7 - (bit & 7))) & 1 : 0;
    bit++; return b;
  };

  let arriba = true;
  for (let col = lado - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let n = 0; n < lado; n++) {
      const fila = arriba ? lado - 1 - n : n;
      for (const dx of [0, 1]) {
        const x = col - dx;
        if (celda[fila][x] === -1) celda[fila][x] = siguiente();
      }
    }
    arriba = !arriba;
  }
}

const MASCARAS = [
  (f, c) => (f + c) % 2 === 0,
  (f) => f % 2 === 0,
  (f, c) => c % 3 === 0,
  (f, c) => (f + c) % 3 === 0,
  (f, c) => (Math.floor(f / 2) + Math.floor(c / 3)) % 2 === 0,
  (f, c) => ((f * c) % 2) + ((f * c) % 3) === 0,
  (f, c) => (((f * c) % 2) + ((f * c) % 3)) % 2 === 0,
  (f, c) => (((f + c) % 2) + ((f * c) % 3)) % 2 === 0,
];

/** Formato: nivel M (0b00) + máscara, con su BCH y el XOR que manda la norma. */
function bitsDeFormato(mascara) {
  const datos = (0b00 << 3) | mascara;
  let v = datos << 10;
  for (let i = 4; i >= 0; i--) if (v & (1 << (i + 10))) v ^= 0b10100110111 << i;
  return ((datos << 10) | v) ^ 0b101010000010010;
}

/**
 * Los quince bits del formato, en sus dos copias.
 *
 * OJO CON EL ORDEN: la norma describe estas posiciones como (columna, fila),
 * y aquí la matriz se indexa [fila][columna]. Escribirlas al derecho produce
 * un QR que se ve perfecto —patrones, temporizadores, todo— y que ningún
 * lector puede abrir, porque el formato dice otra cosa. Además pisaba el
 * módulo que siempre debe ir oscuro.
 */
function ponerFormato(celda, lado, mascara) {
  const bits = bitsDeFormato(mascara);
  const b = i => (bits >> i) & 1;

  // Copia 1: baja por la columna 8 y sigue por la fila 8.
  for (let i = 0; i <= 5; i++) celda[i][8] = b(i);
  celda[7][8] = b(6);
  celda[8][8] = b(7);
  celda[8][7] = b(8);
  for (let i = 9; i <= 14; i++) celda[8][14 - i] = b(i);

  // Copia 2: por la fila 8 desde la derecha, y por la columna 8 desde abajo.
  for (let i = 0; i <= 7; i++) celda[8][lado - 1 - i] = b(i);
  for (let i = 8; i <= 14; i++) celda[lado - 15 + i][8] = b(i);

  celda[lado - 8][8] = 1;   // el módulo que siempre va oscuro
}

/** Penalización de la norma: gana la máscara que menos confunde al lector. */
function penalizacion(c, L) {
  let p = 0;
  const corridas = (leer) => {
    for (let a = 0; a < L; a++) {
      let color = -1, largo = 0;
      for (let b = 0; b < L; b++) {
        const v = leer(a, b);
        if (v === color) { largo++; if (largo === 5) p += 3; else if (largo > 5) p++; }
        else { color = v; largo = 1; }
      }
    }
  };
  corridas((f, c2) => c[f][c2]);
  corridas((c2, f) => c[f][c2]);

  for (let f = 0; f < L - 1; f++) for (let c2 = 0; c2 < L - 1; c2++) {
    const v = c[f][c2];
    if (v === c[f][c2 + 1] && v === c[f + 1][c2] && v === c[f + 1][c2 + 1]) p += 3;
  }

  const A = [1,0,1,1,1,0,1,0,0,0,0];
  const B = [0,0,0,0,1,0,1,1,1,0,1];
  const busca = (leer) => {
    for (let a = 0; a < L; a++) for (let b = 0; b <= L - 11; b++) {
      let ok1 = true, ok2 = true;
      for (let k = 0; k < 11; k++) {
        const v = leer(a, b + k);
        if (v !== A[k]) ok1 = false;
        if (v !== B[k]) ok2 = false;
      }
      if (ok1) p += 40;
      if (ok2) p += 40;
    }
  };
  busca((f, c2) => c[f][c2]);
  busca((c2, f) => c[f][c2]);

  let oscuros = 0;
  for (let f = 0; f < L; f++) for (let c2 = 0; c2 < L; c2++) oscuros += c[f][c2];
  p += Math.floor(Math.abs((oscuros * 100) / (L * L) - 50) / 5) * 10;
  return p;
}

/** La matriz del QR: arreglo de arreglos con 1 (oscuro) y 0 (claro). */
export function matrizQR(texto) {
  const bytes = new TextEncoder().encode(String(texto));
  let version = 0;
  for (let v = 1; v <= 6; v++) {
    const [, , bloques, porBloque] = TABLA[v];
    if (bytes.length + 2 <= bloques * porBloque) { version = v; break; }
  }
  if (!version) throw new Error('El texto es muy largo para este QR.');

  const datos = bytesDe(texto, version);
  const lado = 17 + 4 * version;

  let mejor = null, mejorPena = Infinity;
  for (let mascara = 0; mascara < 8; mascara++) {
    const celda = Array.from({ length: lado }, () => new Int8Array(lado).fill(-1));
    ponerFijos(celda, lado, version);
    reservarFormato(celda, lado);
    // Lo reservado se marca ANTES de acomodar los datos: la máscara no debe
    // tocar patrones fijos ni la zona del formato.
    const fijo = celda.map(f => Array.from(f, v => v !== -1));

    ponerDatos(celda, lado, datos);
    for (let f = 0; f < lado; f++) for (let c = 0; c < lado; c++) {
      if (!fijo[f][c] && MASCARAS[mascara](f, c)) celda[f][c] ^= 1;
    }
    ponerFormato(celda, lado, mascara);

    const pena = penalizacion(celda, lado);
    if (pena < mejorPena) { mejorPena = pena; mejor = celda; }
  }
  return mejor.map(f => Array.from(f));
}

/** El QR como SVG: se imprime nítido a cualquier tamaño. */
export function svgQR(texto, { margen = 4, tamano = 240, claro = '#ffffff', oscuro = '#000000' } = {}) {
  const m = matrizQR(texto);
  const lado = m.length, total = lado + margen * 2;
  let camino = '';
  for (let f = 0; f < lado; f++) for (let c = 0; c < lado; c++) {
    if (m[f][c]) camino += 'M' + (c + margen) + ' ' + (f + margen) + 'h1v1h-1z';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + tamano + '" height="' + tamano +
    '" viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges" role="img" ' +
    'aria-label="Código QR"><rect width="' + total + '" height="' + total + '" fill="' + claro +
    '"/><path d="' + camino + '" fill="' + oscuro + '"/></svg>';
}
