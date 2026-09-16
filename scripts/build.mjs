import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
await fs.copyFile(path.join(root, 'index.html'), path.join(out, 'index.html'));

await fs.mkdir(path.join(out, 'src'), { recursive: true });
for (const file of ['operacion.css', 'tienda.css', 'plataforma.css', 'plataforma.js']) {
  await fs.copyFile(path.join(root, 'src', file), path.join(out, 'src', file));
}
await fs.cp(path.join(root, 'public'), out, { recursive: true });

const packs = ['productos-1.json.gz', 'productos-2.json.gz'];
let restored = 0;
for (const pack of packs) {
  const zipped = await fs.readFile(path.join(root, 'assets-packs', pack));
  const assetMap = JSON.parse(gunzipSync(zipped).toString('utf8'));
  for (const [rel, b64] of Object.entries(assetMap)) {
    const dest = path.join(out, rel);
    if (!dest.startsWith(out + path.sep) || !/^assets\/productos\/[a-zA-Z0-9_.-]+$/.test(rel)) throw Error('Ruta de imagen inválida');
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, Buffer.from(b64, 'base64'));
    restored++;
  }
}

await fs.writeFile(path.join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log(`Surtiva: build completo. Portada y cliente autenticado; ${restored} imágenes restauradas. Sin datos comerciales públicos.`);
