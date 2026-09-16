import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import handler from '../server/api.mjs';
const root=resolve('dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.txt':'text/plain'};
const server=createServer(async(req,res)=>{
 if(req.url.startsWith('/api/'))return handler(req,res);
 try {
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const target=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!target.startsWith(root+sep))throw Error('Forbidden');
  const content=await readFile(target);res.setHeader('Content-Type',types[extname(target)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(content);
 }catch{res.statusCode=404;res.end('Not found');}
});
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Surtiva: http://localhost:'+Number(process.env.PORT||3000)));
