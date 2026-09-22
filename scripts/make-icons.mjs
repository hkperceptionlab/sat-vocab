// Generates the PWA icon set from a single definition.
// Run with: npm run icons
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// fileURLToPath, not URL.pathname: the project path contains non-ASCII
// characters, which pathname leaves percent-encoded.
const OUT = fileURLToPath(new URL("../public/", import.meta.url));

// The wordmark: white "SAT" on the app's indigo -> pink gradient.
// `rounded` is for the regular icon; the square version is used where the
// platform applies its own mask (Android maskable, iOS home screen).
function svg({ rounded }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="0.55" stop-color="#a855f7"/>
      <stop offset="1" stop-color="#ec4899"/>
    </linearGradient>
    <radialGradient id="hl" cx="0.28" cy="0.18" r="0.85">
      <stop offset="0" stop-color="#fff" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${rounded ? 114 : 0}" fill="url(#g)"/>
  <rect width="512" height="512" rx="${rounded ? 114 : 0}" fill="url(#hl)"/>
  <!-- dx offsets the trailing letter-space that text-anchor="middle" counts in. -->
  <text x="256" y="317" dx="4" fill="#fff" text-anchor="middle" letter-spacing="7"
        font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="168" font-weight="700">SAT</text>
</svg>`;
}

const round = Buffer.from(svg({ rounded: true }));
const square = Buffer.from(svg({ rounded: false }));

const png = (src, size, name) =>
  sharp(src).resize(size, size).png().toFile(join(OUT, name));

await writeFile(join(OUT, "icon.svg"), svg({ rounded: true }));
await png(round, 192, "icon-192.png");
await png(round, 512, "icon-512.png");
await png(square, 512, "icon-maskable-512.png");
// iOS rounds the corners itself, so it gets the square, full-bleed version.
await png(square, 180, "apple-touch-icon.png");

console.log("icons written to public/");
