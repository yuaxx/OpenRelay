import { expect, test } from "bun:test";

const css = await Bun.file(new URL("../src/styles/openrelay-theme.css", import.meta.url)).text();
const baseCss = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();

function token(name: string, scheme: number): number[] {
  const values = css.match(new RegExp(`--${name}: light-dark\\(#([\\da-f]{6}), #([\\da-f]{6})\\)`));
  if (!values) throw new Error(`Missing hex color pair: ${name}`);
  return values[scheme + 1].match(/../g)!.map(v => parseInt(v, 16) / 255);
}
function luminance(rgb: number[]): number {
  const linear = rgb.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}
function contrast(a: number[], b: number[]): number {
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (light + .05) / (dark + .05);
}

for (const [scheme, label] of ["light", "dark"].entries()) {
  test(`${label}: text, statuses and primary actions meet WCAG AA contrast`, () => {
    for (const foreground of ["text", "muted", "faint", "green", "amber", "red", "accent"]) {
      for (const background of ["bg", "surface", "rail", "raised"]) {
        expect(contrast(token(foreground, scheme), token(background, scheme)), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(token("accent-ink", scheme), token("accent", scheme))).toBeGreaterThanOrEqual(4.5);
  });
  test(`${label}: input and secondary-button boundaries have non-text contrast`, () => {
    expect(contrast(token("or-control-border", scheme), token("surface", scheme))).toBeGreaterThanOrEqual(3);
  });
  test(`${label}: focus remains visible on surfaces and primary actions`, () => {
    for (const background of ["bg", "rail", "surface", "raised", "accent-ink"]) {
      expect(contrast(token("accent-ring", scheme), token(background, scheme))).toBeGreaterThanOrEqual(3);
    }
    expect(baseCss).toMatch(/:focus-visible\s*\{\s*outline: 2px solid var\(--accent-ring\); outline-offset: 2px/);
  });
}

test("dark: neutral surfaces preserve the card/canvas hierarchy", () => {
  for (const name of ["bg", "rail", "surface", "raised", "raised-hover", "text", "muted", "faint", "accent", "accent-hover", "accent-ink", "accent-ring", "or-control-border", "toggle-off-bg"]) {
    const [r, g, b] = token(name, 1);
    expect(r, name).toBe(g);
    expect(g, name).toBe(b);
  }
  expect(luminance(token("surface", 1))).toBeGreaterThan(luminance(token("rail", 1)));
  expect(luminance(token("rail", 1))).toBeGreaterThan(luminance(token("bg", 1)));
  expect(luminance(token("raised", 1))).toBeGreaterThan(luminance(token("surface", 1)));
  expect(css).toContain("rgba(255, 255, 255, .08)");
});
