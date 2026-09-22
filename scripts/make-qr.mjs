// Writes a QR code for the live app, to open it on a phone or hand to a friend.
// Run with: npm run qr
import QRCode from "qrcode";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const URL_TO_ENCODE = process.argv[2] || "https://sat-quiz-app-tau.vercel.app";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const out = join(ROOT, "qr-sat-vocab.png");

await QRCode.toFile(out, URL_TO_ENCODE, {
  width: 720,
  margin: 2,
  color: { dark: "#0f0f1a", light: "#ffffff" },
});

// Also print it straight to the terminal, so it can be scanned without
// opening the file at all.
console.log(await QRCode.toString(URL_TO_ENCODE, { type: "terminal", small: true }));
console.log(`${URL_TO_ENCODE}\nsaved: ${out}`);
