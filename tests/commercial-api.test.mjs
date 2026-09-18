import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../server/api.mjs';
const env={NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000',SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
async function call(handler,body,headers={}){let data;const h={};const res={setHeader:(k,v)=>h[k]=v,end:x=>data=JSON.parse(x)};await handler({url:'/api/commercial/portal',method:'POST',headers:{origin:env.APP_ORIGIN,'content-type':'application/json',...headers},body},res);return {status:res.statusCode,data,headers:h};}
test('capability API strips logged-in identity, requires exact token and explicit operation, denies cross-origin',async()=>{
 const requests=[];const handler=createHandler({env,fetcher:async(url,opts)=>{requests.push({url,...opts});return new Response('{"products":[]}',{status:200});}});
 assert.equal((await call(handler,{token:'short',operation:'catalog'})).status,400);
 assert.equal((await call(handler,{token:'a'.repeat(96),operation:'admin'})).status,400);
 assert.equal((await call(handler,{token:'a'.repeat(96),operation:'catalog'},{origin:'https://evil.test'})).status,403);
 assert.equal(requests.length,0);
 const result=await call(handler,{token:'a'.repeat(96),operation:'catalog',payload:{}},{authorization:'Bearer owner-secret',cookie:'surtiva-access=owner-secret'});
 assert.equal(result.status,200);assert.equal(requests[0].headers.Authorization,undefined);assert.ok(requests[0].url.endsWith('/rpc/commercial_portal'));assert.match(result.headers['Cache-Control'],/no-store/);assert.equal(result.headers['Referrer-Policy'],'no-referrer');
});
