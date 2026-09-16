import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readAuthReturn,authMessage,cleanAuthReturn} from '../src/auth-return.js';

test('expired links have a recoverable message and callback credentials are removed',()=>{
 const expired='https://surtiva.test/?auth=confirmed#error=access_denied&error_code=otp_expired&error_description=untrusted';
 assert.equal(readAuthReturn(expired).error,'otp_expired');
 assert.match(authMessage(readAuthReturn(expired).error),/nuevo enlace/);
 assert.equal(cleanAuthReturn(expired,'confirmar-correo'),'/#confirmar-correo');
 assert.equal(cleanAuthReturn('https://surtiva.test/?auth=recovery&code=private-code&sb_flow_id=flow#nueva-clave','nueva-clave'),'/#nueva-clave');
 assert.equal(readAuthReturn('https://surtiva.test/#ingresar'),null);
});

test('signup and resend preserve the PKCE verifier until code exchange with the real SDK',async()=>{
 const oldFetch=globalThis.fetch,oldLocation=globalThis.location;
 const requests=[];
 const user={id:'90000000-0000-4000-8000-000000000020',email:'pkce@example.test',aud:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
 globalThis.location={origin:'https://surtiva.test'};
 globalThis.fetch=async(input,options={})=>{
  if(input==='/api/config')return Response.json({url:'https://test.supabase.co',publishableKey:'sb_publishable_test'});
  const url=new URL(input),body=options.body?JSON.parse(options.body):null;requests.push({url,body});
  if(url.pathname.endsWith('/signup'))return Response.json(user);
  if(url.pathname.endsWith('/resend'))return Response.json({});
  if(url.pathname.endsWith('/token'))return Response.json({access_token:'test-token',refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user});
  if(url.pathname.endsWith('/logout'))return new Response(null,{status:204});
  throw Error('Unexpected request '+url.pathname);
 };
 let client;
 try{
  const {authenticate,supabase}=await import('../src/auth.js');
  for(const action of ['register-owner','register','resend']){
   await authenticate(action,{name:'Test',organization:'Test',role:'merchant',email:user.email,password:'only-used-in-mocked-test'});
   client=await supabase();
   const sent=requests.findLast(r=>r.url.pathname.endsWith(action==='resend'?'/resend':'/signup'));
   const redirect=new URL(sent.url.searchParams.get('redirect_to'));
   const flowId=redirect.searchParams.get('sb_flow_id');
   const result=await client.auth.exchangeCodeForSession('test-code',flowId?{flowId}:undefined);
   assert.equal(result.error,null,action+' must keep its verifier');
   const exchange=requests.findLast(r=>r.url.pathname.endsWith('/token'));
   assert.equal(createHash('sha256').update(exchange.body.code_verifier).digest('base64url'),sent.body.code_challenge);
   if(action==='register-owner')assert.deepEqual(sent.body.data,{name:'Test'});
   await client.auth.signOut({scope:'local'});
  }
 }finally{
  if(client)await client.auth.stopAutoRefresh();
  globalThis.fetch=oldFetch;
  if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;
 }
});
