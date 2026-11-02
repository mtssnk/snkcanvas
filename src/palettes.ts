/** Colours are `#rrggbb` strings. */
export interface Palette {
  /** Chalky tone added to the glowing core of each tube. */
  pale: string;
  /** Tone of the shadow between tubes. Also the fallback background. */
  deep: string;
  /** Three tones looped across the tubes. */
  neon: [string, string, string];
}

/** Cycled in order by default. Tuned up from the reference images. */
export const defaultPalettes: Palette[] = [
  { pale: '#e2e6e2', deep: '#0c1484', neon: ['#1c2cff', '#37f08a', '#6a2cf0'] },
  { pale: '#e8edf0', deep: '#0f3a6b', neon: ['#ff5a14', '#1f7fd0', '#ffa050'] },
  { pale: '#ffd8cc', deep: '#7a1030', neon: ['#ff3a1e', '#35d6ff', '#e0228a'] },
  { pale: '#fbf4e6', deep: '#8a5a18', neon: ['#ffb52e', '#2f9dff', '#ff8a1e'] },
];

const toRgb = (hex: string): number[] => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`snkcanvas: expected a #rrggbb colour, got "${hex}"`);
  }
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
};

/** Flattens a palette into the order the shader reads: pale, deep, neon a, b, c. */
export const toUniform = ({ pale, deep, neon }: Palette): Float32Array =>
  new Float32Array([pale, deep, ...neon].flatMap(toRgb));
