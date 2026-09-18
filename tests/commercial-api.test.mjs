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
test('preview preregistration can write only to explicitly marked test organizations',async()=>{
 let isTest=false,writes=0;const org='10000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000001';
 const handler=createHandler({env:{...env,VERCEL_ENV:'preview'},fetcher:async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:user,email_confirmed_at:'2026-01-01'});
  if(url.includes('/memberships?'))return Response.json([{user_id:user,organization_id:org,role_id:'distributor_admin',status:'active'}]);
  if(url.includes('/organizations?'))return Response.json([{id:org,kind:'distribuidor',status:'active',is_test:isTest}]);
  if(url.includes('/rpc/')){writes++;return Response.json({id:'test'});}return Response.json([]);
 }});
 const request={url:'/api/commercial/preregister?organization='+org,method:'POST',headers:{origin:env.APP_ORIGIN,'content-type':'application/json',authorization:'Bearer test'},body:{name:'Test',contact:'Test',phone:'3000000000',city:'Bogotá'}};
 let result;const res={setHeader(){},end:value=>result=JSON.parse(value)};
 await handler(request,res);assert.equal(res.statusCode,403);assert.equal(writes,0);
 isTest=true;await handler(request,res);assert.equal(res.statusCode,201);assert.equal(writes,1);
});
