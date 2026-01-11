
// Parse hex to {r,g,b}
export const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
};

// Standard Additive RGB Interpolation
export const lerpColor = (c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }, t: number) => {
  return {
    r: Math.round(c1.r + (c2.r - c1.r) * t),
    g: Math.round(c1.g + (c2.g - c1.g) * t),
    b: Math.round(c1.b + (c2.b - c1.b) * t),
  };
};

// --- SUBTRACTIVE COLOR MIXING (PIGMENT SIMULATION) ---
// Converts RGB to CMYK, mixes in CMYK space, converts back.
// This ensures Cyan/Blue + Yellow = Green, rather than Grey.

const rgbToCmyk = (r: number, g: number, b: number) => {
  let c = 1 - (r / 255);
  let m = 1 - (g / 255);
  let y = 1 - (b / 255);
  let k = Math.min(c, Math.min(m, y));

  if (k === 1) return { c: 0, m: 0, y: 0, k: 1 };
  
  return {
    c: (c - k) / (1 - k),
    m: (m - k) / (1 - k),
    y: (y - k) / (1 - k),
    k: k
  };
};

const cmykToRgb = (c: number, m: number, y: number, k: number) => {
  const r = 255 * (1 - c) * (1 - k);
  const g = 255 * (1 - m) * (1 - k);
  const b = 255 * (1 - y) * (1 - k);
  return { r, g, b };
};

export const mixPigments = (c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }, t: number) => {
    const color1 = rgbToCmyk(c1.r, c1.g, c1.b);
    const color2 = rgbToCmyk(c2.r, c2.g, c2.b);

    // Interpolate CMYK values
    const c = color1.c + (color2.c - color1.c) * t;
    const m = color1.m + (color2.m - color1.m) * t;
    const y = color1.y + (color2.y - color1.y) * t;
    const k = color1.k + (color2.k - color1.k) * t;

    const result = cmykToRgb(c, m, y, k);
    return {
        r: Math.round(result.r),
        g: Math.round(result.g),
        b: Math.round(result.b)
    };
};

// Float version for the engine loop (avoiding round calls)
export const mixPigmentsFloat = (c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }, t: number) => {
    const color1 = rgbToCmyk(c1.r, c1.g, c1.b);
    const color2 = rgbToCmyk(c2.r, c2.g, c2.b);

    const c = color1.c + (color2.c - color1.c) * t;
    const m = color1.m + (color2.m - color1.m) * t;
    const y = color1.y + (color2.y - color1.y) * t;
    const k = color1.k + (color2.k - color1.k) * t;

    const result = cmykToRgb(c, m, y, k);
    return {
        r: result.r,
        g: result.g,
        b: result.b
    };
};

/**
 * HIGH PERFORMANCE ZERO-ALLOCATION MIXER (CMYK)
 * Mutates 'target' directly.
 */
export const mixPigmentsFloatInPlace = (target: { r: number; g: number; b: number }, source: { r: number; g: number; b: number }, t: number) => {
    // 1. Convert Target to CMYK
    let c1 = 1 - (target.r / 255);
    let m1 = 1 - (target.g / 255);
    let y1 = 1 - (target.b / 255);
    let k1 = Math.min(c1, Math.min(m1, y1));
    if (k1 < 1) {
        c1 = (c1 - k1) / (1 - k1);
        m1 = (m1 - k1) / (1 - k1);
        y1 = (y1 - k1) / (1 - k1);
    } else {
        c1=0; m1=0; y1=0;
    }

    // 2. Convert Source to CMYK
    let c2 = 1 - (source.r / 255);
    let m2 = 1 - (source.g / 255);
    let y2 = 1 - (source.b / 255);
    let k2 = Math.min(c2, Math.min(m2, y2));
    if (k2 < 1) {
        c2 = (c2 - k2) / (1 - k2);
        m2 = (m2 - k2) / (1 - k2);
        y2 = (y2 - k2) / (1 - k2);
    } else {
        c2=0; m2=0; y2=0;
    }

    // 3. Interpolate
    const c = c1 + (c2 - c1) * t;
    const m = m1 + (m2 - m1) * t;
    const y = y1 + (y2 - y1) * t;
    const k = k1 + (k2 - k1) * t;

    // 4. Convert back to RGB and mutate target
    target.r = 255 * (1 - c) * (1 - k);
    target.g = 255 * (1 - m) * (1 - k);
    target.b = 255 * (1 - y) * (1 - k);
};

// --- OKLAB MIXING (TRUE PERCEPTUAL COLOR) ---

const srgbToLinear = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const linearToSrgb = (v: number) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, c * 255));
};

const rgbToOklab = (r: number, g: number, b: number) => {
    const lr = srgbToLinear(r);
    const lg = srgbToLinear(g);
    const lb = srgbToLinear(b);

    const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
    const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
    const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

    const l_ = Math.cbrt(l);
    const m_ = Math.cbrt(m);
    const s_ = Math.cbrt(s);

    return {
        L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    };
};

const oklabToRgb = (L: number, a: number, b: number) => {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;

    return {
        r: linearToSrgb(4.07660 * l - 3.3077 * m + 0.2309 * s),
        g: linearToSrgb(-1.2684 * l + 2.6097 * m - 0.3413 * s),
        b: linearToSrgb(-0.0041 * l - 0.7034 * m + 1.7076 * s)
    };
};

/**
 * OKLAB MIXER
 * True perceptual color mixing. 
 * Replaces muddy grey transitions with clean spectral blends.
 */
export const mixOklabFloatInPlace = (target: { r: number; g: number; b: number }, source: { r: number; g: number; b: number }, t: number) => {
    const lab1 = rgbToOklab(target.r, target.g, target.b);
    const lab2 = rgbToOklab(source.r, source.g, source.b);

    const L = lab1.L + (lab2.L - lab1.L) * t;
    const a = lab1.a + (lab2.a - lab1.a) * t;
    const b = lab1.b + (lab2.b - lab1.b) * t;

    const res = oklabToRgb(L, a, b);
    target.r = res.r;
    target.g = res.g;
    target.b = res.b;
};

// -----------------------------------------------------

export const rgbToHex = (r: number, g: number, b: number) => {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

export const rgbToString = (c: { r: number; g: number; b: number }) => {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
};

export const shiftHslRgb = (color: { r: number; g: number; b: number }, hDeg: number, sPct: number, lPct: number) => {
  const rNorm = color.r / 255, gNorm = color.g / 255, bNorm = color.b / 255;
  const max = Math.max(rNorm, gNorm, bNorm), min = Math.min(rNorm, gNorm, bNorm);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm: h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break;
      case gNorm: h = (bNorm - rNorm) / d + 2; break;
      case bNorm: h = (rNorm - gNorm) / d + 4; break;
    }
    h /= 6;
  }

  h = (h + hDeg / 360) % 1;
  if (h < 0) h += 1;
  s = Math.max(0, Math.min(1, s + sPct));
  l = Math.max(0, Math.min(1, l + lPct));

  let r1, g1, b1;
  if (s === 0) {
    r1 = g1 = b1 = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r1 = hue2rgb(p, q, h + 1/3);
    g1 = hue2rgb(p, q, h);
    b1 = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.round(r1 * 255),
    g: Math.round(g1 * 255),
    b: Math.round(b1 * 255)
  };
};

export const shiftHsl = (hex: string, hDeg: number, sPct: number, lPct: number) => {
  const rgb = hexToRgb(hex);
  const shifted = shiftHslRgb(rgb, hDeg, sPct, lPct);
  return rgbToHex(shifted.r, shifted.g, shifted.b);
};

export const rgbToHsv = (r: number, g: number, b: number) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s, v = max;
  const d = max - min;
  s = max === 0 ? 0 : d / max;
  if (max === min) h = 0;
  else {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s, v };
};

// HSV conversions for the Color Picker
export const hexToHsv = (hex: string) => {
  let { r, g, b } = hexToRgb(hex);
  return rgbToHsv(r, g, b);
};

export const hsvToHex = (h: number, s: number, v: number) => {
  let r = 0, g = 0, b = 0;
  const i = Math.floor(h / 60);
  const f = h / 60 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return rgbToHex(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
};

// Export OKLAB helpers for UI
export const oklabToHex = (L: number, a: number, b: number) => {
    const rgb = oklabToRgb(L, a, b);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
};

export const hexToOklab = (hex: string) => {
    const { r, g, b } = hexToRgb(hex);
    return rgbToOklab(r, g, b);
};

// --- OKLCH Helpers ---
export const rgbToOklch = (r: number, g: number, b: number) => {
    const lab = rgbToOklab(r, g, b);
    const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
    let h = Math.atan2(lab.b, lab.a) * (180 / Math.PI);
    if (h < 0) h += 360;
    return { L: lab.L, C, h };
};

export const oklchToRgb = (L: number, C: number, h: number) => {
    const rad = h * (Math.PI / 180);
    const a = C * Math.cos(rad);
    const b = C * Math.sin(rad);
    return oklabToRgb(L, a, b);
};

export const hexToOklch = (hex: string) => {
    const { r, g, b } = hexToRgb(hex);
    return rgbToOklch(r, g, b);
};

export const oklchToHex = (L: number, C: number, h: number) => {
    const rgb = oklchToRgb(L, C, h);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
};
