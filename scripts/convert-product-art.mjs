/**
 * One-off build tool: converts the web shop's SVG placeholder illustrations into
 * PNGs the app can load.
 *
 * Why this exists
 * ---------------
 * `imageUrl` is null on every product, and the web app's illustrations are
 * web-local assets in its own `public/` directory. A phone cannot load those.
 * React Native's `Image` also cannot render SVG without an SVG renderer, and
 * adding one would mean a native module and a new build, which this pass
 * explicitly rules out.
 *
 * So the art is rasterised here, at build-tool time, and the PNGs are committed.
 * The app ships plain PNGs and needs no renderer at runtime.
 *
 * This script is NOT an app dependency. `@resvg/resvg-js` is installed only to run
 * it:
 *
 *   npm install --no-save @resvg/resvg-js
 *   node scripts/convert-product-art.mjs
 *
 * Re-run it whenever the source SVGs change or a product is added, then commit
 * the regenerated PNGs.
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const sourceDir = join(root, 'assets', 'product-art-svg');
const outputDir = join(root, 'assets', 'product-art');

/** Square output size. Larger than any rendered card so it stays sharp. */
const SIZE = 480;

/**
 * The generic fallback, for a product with no illustration of its own.
 *
 * Drawn in the same idiom as the shop's art: a warm cream ground, a soft
 * highlight, and a single neutral motif. It deliberately carries no brown, so it
 * sits quietly in the grid instead of reading as a broken image.
 */
const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 470 470" width="470" height="470" role="img">
  <defs>
    <linearGradient id="gfb" x1="0" y1="0" x2="0.65" y2="1">
      <stop offset="0%" stop-color="#fff4e4"/>
      <stop offset="100%" stop-color="#ffe6c6"/>
    </linearGradient>
  </defs>
  <rect width="470" height="470" fill="url(#gfb)"/>
  <circle cx="398" cy="66" r="130" fill="#ffffff" opacity="0.34"/>
  <circle cx="54" cy="418" r="160" fill="#f7a03c" opacity="0.07"/>
  <g fill="none" stroke="#f7a03c" stroke-opacity="0.5" stroke-width="12" stroke-linecap="round">
    <circle cx="235" cy="235" r="74"/>
    <path d="M196 238q22 22 44 0M252 238q22 22 44 0" stroke-opacity="0.38"/>
  </g>
</svg>`;

const { Resvg } = await import('@resvg/resvg-js');

/** Rasterises SVG source at the app's tile size. */
function render(svg) {
  return new Resvg(svg, {
    // The source SVGs are square with their own gradient ground, so the art fills
    // the tile and needs no letterboxing.
    fitTo: { mode: 'width', value: SIZE },
    background: 'white',
  })
    .render()
    .asPng();
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const entries = (await readdir(sourceDir)).filter((name) => name.endsWith('.svg')).sort();

  for (const entry of entries) {
    const slug = basename(entry, '.svg');
    const png = render(await readFile(join(sourceDir, entry), 'utf8'));
    await writeFile(join(outputDir, `${slug}.png`), png);

    console.log(`${slug}.png  ${(png.length / 1024).toFixed(1)} kB`);
  }

  // Kept outside the slug directory so it can never be mistaken for a product.
  const fallback = render(FALLBACK_SVG);
  await writeFile(join(root, 'assets', 'product-art-fallback.png'), fallback);
  console.log(`\nproduct-art-fallback.png  ${(fallback.length / 1024).toFixed(1)} kB`);
  console.log(`${entries.length} illustrations written to assets/product-art/`);
}

await main();
