import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

const sourceSvg = path.join(rootDir, "icon.svg");
const outDir = path.join(rootDir, "build", "icons");

const pngSizes = [16, 24, 32, 48, 64, 72, 96, 128, 256, 512, 1024];

async function ensureSourceExists() {
  try {
    await fs.access(sourceSvg);
  } catch {
    throw new Error(`Missing icon source: ${sourceSvg}`);
  }
}

async function renderPngs() {
  const svgBuffer = await fs.readFile(sourceSvg);
  const pngPaths = [];

  for (const size of pngSizes) {
    const outputPath = path.join(outDir, `icon-${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outputPath);
    pngPaths.push(outputPath);
  }

  await fs.copyFile(path.join(outDir, "icon-512.png"), path.join(outDir, "icon.png"));
  await fs.copyFile(path.join(outDir, "icon-1024.png"), path.join(outDir, "icon-mac.png"));

  return pngPaths;
}

async function buildIco() {
  const icoBuffer = await pngToIco([
    path.join(outDir, "icon-16.png"),
    path.join(outDir, "icon-24.png"),
    path.join(outDir, "icon-32.png"),
    path.join(outDir, "icon-48.png"),
    path.join(outDir, "icon-64.png"),
    path.join(outDir, "icon-128.png"),
    path.join(outDir, "icon-256.png"),
  ]);

  await fs.writeFile(path.join(outDir, "icon.ico"), icoBuffer);
}

async function main() {
  await ensureSourceExists();
  await fs.mkdir(outDir, { recursive: true });
  await renderPngs();
  await buildIco();
  console.log(`Generated desktop icons in ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
