import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for(const dir of ['src','server','api','scripts'])for(const file of await readdir(dir)){
 if(!/\.(js|mjs)$/.test(file))continue;
 const result=spawnSync(process.execPath,['--check',dir+'/'+file],{stdio:'inherit'});if(result.status)process.exit(result.status);
}
const html=await readFile('dist/index.html','utf8');
if(/catalogo\.js|operacion\.js|tienda\.js|arranque\.js/.test(html))throw Error('El build expone módulos de demo');
const published=await readdir('dist/src');
if(published.some(f=>/operacion\.js|tienda\.js|arranque\.js|datos/.test(f)))throw Error('El build expone datos históricos');
console.log('Sintaxis y límites del build verificados.');
