// Rasterizes the hand-drawn SVG sources into the PNG sizes the manifest and
// index.html reference. Run with `npm run icons` after `npm install`.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(scriptsDir, "..", "public");
const outDir = join(publicDir, "icons");

async function main() {
  await mkdir(outDir, { recursive: true });

  const plain = join(publicDir, "icon-source.svg");
  const maskable = join(publicDir, "icon-maskable-source.svg");

  await sharp(plain).resize(192, 192).png().toFile(join(outDir, "icon-192.png"));
  await sharp(plain).resize(512, 512).png().toFile(join(outDir, "icon-512.png"));
  await sharp(maskable).resize(512, 512).png().toFile(join(outDir, "icon-maskable.png"));

  console.log("Wrote icons/icon-192.png, icon-512.png, icon-maskable.png");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
