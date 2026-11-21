/**
 * 外部通信不要・完全オフラインで動作する軽量QRコード生成モジュール (Byte mode, ECC Level L)
 * URL（例: http://192.168.1.15:3000）をQRコードの2次元boolean配列に変換します。
 */

const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  EXP_TABLE[255] = EXP_TABLE[0];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[a] + LOG_TABLE[b]) % 255];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = EXP_TABLE[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    for (let j = 0; j < ecLen; j++) {
      rem[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return rem;
}

// Versions 1 to 6 parameters for ECC Level L (single block)
const VERSION_PARAMS: Record<number, { totalData: number; ecLen: number; align: number[] }> = {
  1: { totalData: 19, ecLen: 7, align: [] },
  2: { totalData: 34, ecLen: 10, align: [6, 18] },
  3: { totalData: 55, ecLen: 15, align: [6, 22] },
  4: { totalData: 80, ecLen: 20, align: [6, 26] },
  5: { totalData: 108, ecLen: 26, align: [6, 30] },
  6: { totalData: 136, ecLen: 36, align: [6, 34] }, // Note: v6L uses 2 blocks in spec, v1-v5 are 1 block (up to 106 bytes)
};

export function generateQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  let version = 1;
  while (version <= 5 && bytes.length + 2 > VERSION_PARAMS[version].totalData) {
    version++;
  }
  if (version > 5) version = 5;

  const { totalData, ecLen, align } = VERSION_PARAMS[version];
  const size = version * 4 + 17;

  // Build data bits: 0100 (byte mode) + 8-bit length + bytes + terminator
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushBits(0b0100, 4);
  const payload = bytes.slice(0, totalData - 2);
  pushBits(payload.length, 8);
  for (const b of payload) pushBits(b, 8);

  const maxBits = totalData * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes = new Uint8Array(totalData);
  for (let i = 0; i < bits.length / 8; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    dataBytes[i] = b;
  }
  let padToggle = true;
  for (let i = bits.length / 8; i < totalData; i++) {
    dataBytes[i] = padToggle ? 0xec : 0x11;
    padToggle = !padToggle;
  }

  const ecBytes = rsEncode(dataBytes, ecLen);
  const allCodewords = new Uint8Array(totalData + ecLen);
  allCodewords.set(dataBytes, 0);
  allCodewords.set(ecBytes, totalData);

  const modules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunc: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setFunc = (r: number, c: number, val: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r][c] = val;
      isFunc[r][c] = true;
    }
  };

  const drawFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunc(r0 + dr, c0 + dc, inOuter && (onBorder || inInner));
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  // Alignment pattern (for v2..v5)
  if (align.length === 2) {
    const r0 = align[1];
    const c0 = align[1];
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        setFunc(r0 + dr, c0 + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
      }
    }
  }

  // Reserve format info areas
  for (let i = 0; i <= 8; i++) {
    if (!isFunc[8][i]) setFunc(8, i, false);
    if (!isFunc[i][8]) setFunc(i, 8, false);
    if (i < 8) {
      if (!isFunc[8][size - 1 - i]) setFunc(8, size - 1 - i, false);
      if (!isFunc[size - 1 - i][8]) setFunc(size - 1 - i, 8, false);
    }
  }
  setFunc(size - 8, 8, true); // Dark module

  // Place data bits in zigzag
  let bitIdx = 0;
  const totalCodewordBits = allCodewords.length * 8;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (!isFunc[r][c]) {
          let bit = false;
          if (bitIdx < totalCodewordBits) {
            bit = ((allCodewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx++;
          }
          // Mask 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) bit = !bit;
          modules[r][c] = bit;
        }
      }
    }
    upward = !upward;
  }

  // Format information for ECC Level L (01) and Mask 0 (000) -> precomputed BCH bits = 0x77c4
  const formatBits = 0x77c4;
  const getFmtBit = (i: number) => ((formatBits >> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) modules[8][i] = getFmtBit(14 - i);
  modules[8][7] = getFmtBit(8);
  modules[8][8] = getFmtBit(7);
  modules[7][8] = getFmtBit(6);
  for (let i = 0; i <= 5; i++) modules[5 - i][8] = getFmtBit(i);

  for (let i = 0; i <= 7; i++) modules[8][size - 1 - i] = getFmtBit(i);
  for (let i = 0; i <= 6; i++) modules[size - 7 + i][8] = getFmtBit(14 - i);

  return modules;
}

