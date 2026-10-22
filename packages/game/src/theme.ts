/** Shared palette for UI chrome. Level art palettes live with the levels. */
export const theme = {
  night: 0x140b2e,
  dusk: 0x2a1650,
  panel: 0x0f0824,
  glow: 0xf6d97a,
  mist: 0xc9b8ff,
  track: 0x8f7bd8,
  text: "#f5efff",
  textDim: "#b9a9e6",
  font: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
} as const;

export const hexToNumber = (hex: string): number => parseInt(hex.slice(1), 16);

/** Relative luminance (0..1) of a #rrggbb color, for picking readable text on it. */
export function luminance(hex: string): number {
  const n = hexToNumber(hex);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two relative luminances. */
export function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Dark ink for symbols and numbers drawn on colored shapes. */
export const DARK_INK = "#1a0f33";

/** The ink (dark or white) with the higher contrast on `hex`. */
export function inkFor(hex: string): "#1a0f33" | "#ffffff" {
  const l = luminance(hex);
  return contrast(l, luminance(DARK_INK)) >= contrast(l, 1) ? DARK_INK : "#ffffff";
}
