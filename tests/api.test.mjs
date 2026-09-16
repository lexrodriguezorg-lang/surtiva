import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../server/api.mjs';
import { ids } from './database.mjs';
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_ORIGIN:'https://surtiva.test',NODE_ENV:'production'};
function req(path,method='GET',body,headers={}) {return {url:'/api/'+path,method,body,headers:{...(method!=='GET'?{origin:env.APP_ORIGIN,'content-type':'application/json'}:{}),...headers}};}
async function call(handler,request) {const headers={};let body;const res={setHeader:(k,v)=>headers[k]=v,end:v=>body=JSON.parse(v)};await handler(request,res);return {status:res.statusCode,headers,body};}
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});

test('custom domain migration permits only explicit origins, including the existing domain',async()=>{
 const handler=createHandler({env:{...env,APP_ORIGIN:'https://surtiva.com.co',APP_ADDITIONAL_ORIGINS:'https://www.surtiva.com.co, https://surtiva-o3hj.vercel.app'}});
 for(const origin of ['https://surtiva.com.co','https://www.surtiva.com.co','https://surtiva-o3hj.vercel.app'])assert.equal((await call(handler,req('auth/logout','POST',{}, {origin}))).status,200);
 for(const origin of ['https://surtiva.com.co.evil.test','http://surtiva.com.co','https://evil.test'])assert.equal((await call(handler,req('auth/logout','POST',{}, {origin}))).status,403);
});
test('API denies unauthenticated access, missing config and cross-origin requests without leaking data',async()=>{
 let called=0;const handler=createHandler({env:{},fetcher:async()=>{called++;throw Error();}});
 const missing=await call(handler,req('data/products?organization='+ids.org));assert.equal(missing.status,401);assert.equal(called,0);assert.match(missing.headers['Cache-Control'],/no-store/);
 const login=await call(handler,req('auth/login','POST',{email:'a@example.test',password:'passwordpassword'},{origin:'http://localhost:3000'}));assert.equal(login.status,503);
 const csrf=await call(createHandler({env}),req('auth/logout','POST',{}, {origin:'https://evil.test'}));assert.equal(csrf.status,403);
});
test('auth cookies are HttpOnly Secure; responses never expose tokens',async()=>{
 const handler=createHandler({env,fetcher:async()=>response({access_token:'access-secret',refresh_token:'refresh-secret',expires_in:3600})});
 const result=await call(handler,req('auth/login','POST',{email:'a@example.test',password:'long-password'}));
 assert.equal(result.status,200);assert.deepEqual(result.body,{ok:true});
 for(const cookie of result.headers['Set-Cookie']){assert.match(cookie,/^__Host-surtiva-/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);}
});

test('a revoked Supabase session asks for login instead of showing a data error',async()=>{
 const handler=createHandler({env,fetcher:async()=>new Response(JSON.stringify({code:'session_not_found'}),{status:403})});
 const result=await call(handler,req('session','GET',undefined,{authorization:'Bearer revoked-session'}));
 assert.equal(result.status,401);assert.match(result.body.error,/sesión/);
});
test('verified session cannot query another tenant or arbitrary table',async()=>{
 const calls=[];const handler=createHandler({env,fetcher:async url=>{
  calls.push(url);if(url.endsWith('/auth/v1/user'))return response({id:ids.owner,email:'owner@example.test',email_confirmed_at:'2026-01-01'});
  if(url.includes('/memberships?'))return response([{organization_id:ids.org,role_id:'distributor_admin',status:'active'}]);
  if(url.includes('/organizations?'))return response([{id:ids.org,status:'active',kind:'distribuidor'}]);
  if(url.includes('/role_permissions?'))return response([{role_id:'distributor_admin',permission_id:'catalog.read'}]);
  return response([]);
 }});
 const headers={cookie:'__Host-surtiva-access=valid'};
 assert.equal((await call(handler,req('data/products?organization='+ids.org2,'GET',undefined,headers))).status,403);
 assert.equal((await call(handler,req('data/platform_admins?organization='+ids.org,'GET',undefined,headers))).status,403);
 assert.equal(calls.some(u=>u.includes('/rest/v1/products?')),false);
});
test('a distributor cannot query the owner catalogue, CRM, or profile review endpoints',async()=>{
 const queried=[];
 const handler=createHandler({env,fetcher:async url=>{
  queried.push(url);
  if(url.endsWith('/auth/v1/user'))return response({id:ids.owner,email:'owner@example.test',email_confirmed_at:'2026-01-01'});
  if(url.includes('/memberships?'))return response([{organization_id:ids.org,role_id:'distributor_admin',status:'active'}]);
  if(url.includes('/organizations?'))return response([{id:ids.org,status:'active',kind:'distribuidor'}]);
  return response([]);
 }});
 for(const path of ['admin/data/products','admin/data/prospects','admin/review-data?resource=clients&membership='+ids.seller])assert.equal((await call(handler,req(path,'GET',undefined,{authorization:'Bearer distributor'}))).status,403);
 assert.equal((await call(handler,req('admin/prospects','POST',{name:'Attempt'},{authorization:'Bearer distributor'}))).status,403);
 assert.equal(queried.some(url=>url.includes('/rest/v1/prospects')||url.includes('/rpc/review_workspace')),false);
});
test('public registration rejects platform roles and never sets an authenticated cookie',async()=>{
 const bodies=[];const handler=createHandler({env,fetcher:async(url,options)=>{bodies.push(JSON.parse(options.body));return response({user:{id:ids.pending}});}});
 const form={name:'A',email:'a@example.test',password:'long-password',organization:'Company',role:'admin'};
 assert.equal((await call(handler,req('auth/register','POST',form))).status,400);
 const ok=await call(handler,req('auth/register','POST',{...form,role:'merchant',isAdmin:true}));assert.equal(ok.status,202);assert.equal(ok.headers['Set-Cookie'],undefined);assert.equal(bodies[0].data.isAdmin,undefined);
});
test('Vercel rewrite preserves nested API routes and tenant query parameters',async()=>{
 const handler=createHandler({env,fetcher:async()=>response({access_token:'access',refresh_token:'refresh',expires_in:3600})});
 const login=req('auth/login','POST',{email:'a@example.test',password:'long-password'});login.url='/api?_route=auth%2Flogin';
 assert.equal((await call(handler,login)).status,200);
 const read=req('data/orders?organization='+ids.org);read.url='/api?_route=data%2Forders&organization='+ids.org;
 assert.equal((await call(handler,read)).status,401);
});
