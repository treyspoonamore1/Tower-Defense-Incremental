const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export type Notation = 'letters' | 'scientific';

/** Formats a number for display: full below 1e6, then suffixes, then scientific. */
export function fmt(n: number, notation: Notation = 'letters'): string {
  if (!isFinite(n)) return n > 0 ? '∞' : '-∞';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a < 1000) {
    if (a < 10 && a !== Math.floor(a)) return sign + a.toFixed(1);
    return sign + Math.floor(a).toString();
  }
  if (a < 1e6) return sign + Math.floor(a).toLocaleString('en-US');
  const exp = Math.floor(Math.log10(a));
  if (notation === 'scientific' || exp >= SUFFIXES.length * 3) {
    const m = a / Math.pow(10, exp);
    return `${sign}${m.toFixed(2)}e${exp}`;
  }
  const group = Math.floor(exp / 3);
  const m = a / Math.pow(10, group * 3);
  const digits = m >= 100 ? 1 : 2;
  return `${sign}${m.toFixed(digits)}${SUFFIXES[group]}`;
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
export function roman(n: number): string {
  return ROMAN[n - 1] ?? String(n);
}
