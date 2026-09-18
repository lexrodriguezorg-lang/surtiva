import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
await fs.copyFile(path.join(root, 'index.html'), path.join(out, 'index.html'));
await fs.copyFile(path.join(root, 'commerce.html'), path.join(out, 'commerce.html'));

await fs.mkdir(path.join(out, 'src'), { recursive: true });
for (const file of ['operacion.css', 'tienda.css', 'plataforma.css', 'brand.css', 'brand-tokens.css','entrance.css','commerce.css','visits.css','catalog.css','supplier.css']) {
  await fs.copyFile(path.join(root, 'src', file), path.join(out, 'src', file));
}
await build({entryPoints:[path.join(root,'src/plataforma.js')],outfile:path.join(out,'src/plataforma.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
await build({entryPoints:[path.join(root,'src/commerce.js')],outfile:path.join(out,'src/commerce.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
await fs.cp(path.join(root, 'public'), out, { recursive: true });

// Change the HTML ETag when assets or response policies change. A 304 for
// unchanged HTML can otherwise keep the previous CSP in an open browser.
const deploymentPolicy = await fs.readFile(path.join(root, 'vercel.json'));
for (const page of ['index.html', 'commerce.html']) {
  const file = path.join(out, page);
  let html = await fs.readFile(file, 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="(\/src\/[^"?]+\.(?:js|css))"/g)].map(match => match[1]);
  for (const asset of new Set(assets)) {
    const version = createHash('sha256').update(await fs.readFile(path.join(out, asset.slice(1)))).update(deploymentPolicy).digest('hex').slice(0, 12);
    html = html.replaceAll('"' + asset + '"', '"' + asset + '?v=' + version + '"');
  }
  await fs.writeFile(file, html);
}

const packs = (await fs.readdir(path.join(root,'assets-packs'))).filter(f=>/^(productos|originals)-[0-9]+\.json\.gz$/.test(f)).sort();
let restored = 0;
for (const pack of packs) {
  const zipped = await fs.readFile(path.join(root, 'assets-packs', pack));
  const assetMap = JSON.parse(gunzipSync(zipped).toString('utf8'));
  for (const [rel, b64] of Object.entries(assetMap)) {
    const dest = path.join(out, rel);
    if (!dest.startsWith(out + path.sep) || !/^assets\/productos(?:-hd)?\/[a-zA-Z0-9_.-]+$/.test(rel)) throw Error('Ruta de imagen inválida');
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, Buffer.from(b64, 'base64'));
    restored++;
  }
}

await fs.writeFile(path.join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log(`Surtiva: build completo. Portada y cliente autenticado; ${restored} imágenes restauradas. Sin datos comerciales públicos.`);

