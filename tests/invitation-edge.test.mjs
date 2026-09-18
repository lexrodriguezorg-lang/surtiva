import test from 'node:test';
import assert from 'node:assert/strict';
import {invitationHandler} from '../supabase/functions/invitation-auth/handler.mjs';
const secret='a'.repeat(72),userId='90000000-0000-4000-8000-000000000001';
function setup({existing=false,mailFails=false,denied=false}={}){
 const calls=[];let claimed=false;
 const handler=invitationHandler({url:'https://edge.test',serviceKey:'server-only-secret',publicKey:'public-key',fetcher:async(url,options)=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;calls.push({path,body,headers:options.headers});
  if(path==='/auth/v1/user')return Response.json({id:'manager',email_confirmed_at:'2026-01-01'});
  if(path.endsWith('create_invitation'))return denied?Response.json({code:'42501'},{status:403}):Response.json({id:'invitation',token:secret});
  if(path.endsWith('invitation_details'))return Response.json({name:'Invitado',email:'test@example.test',organization:'Test',role:'seller',requiresSignIn:existing||claimed});
  if(path==='/auth/v1/admin/users')return existing?Response.json({code:'email_exists'},{status:422}):Response.json({id:userId});
  if(path.endsWith('service_invitation')){if(body.operation==='claim'){claimed=true;return Response.json({userId,email:'test@example.test'});}return Response.json({ok:true});}
  if(['/auth/v1/invite','/auth/v1/otp'].includes(path))return mailFails?Response.json({code:'over_email_send_rate_limit'},{status:429}):Response.json({id:userId});
  if(path.endsWith('generate_link'))return Response.json({id:userId,hashed_token:'one-use-otp',verification_type:'signup'});
  if(path==='/auth/v1/verify')return Response.json({user:{id:userId},access_token:'user-access-token',refresh_token:'user-refresh-token'});
  throw Error('Unexpected endpoint '+path);
 }});
 const invoke=(body,authorized=true)=>handler(new Request('https://edge.test/functions/v1/invitation-auth',{method:'POST',headers:authorized?{Authorization:'Bearer manager-jwt'}:{},body:JSON.stringify(body)}));
 return {invoke,calls};
}
test('invitation creation uses caller RLS, really attempts email and reports transport failures honestly',async()=>{
 const {invoke,calls}=setup({mailFails:true});const response=await invoke({action:'create',organizationId:'tenant',name:'Invitado',email:'test@example.test',role:'seller'});const data=await response.json();
 assert.equal(response.status,200);assert.equal(data.delivery,'failed');assert.equal(data.directAccess,true);
 assert.equal(calls.find(c=>c.path.endsWith('create_invitation')).headers.Authorization,'Bearer manager-jwt');
 assert.ok(calls.some(c=>c.path==='/auth/v1/invite'));assert.equal(JSON.stringify(data).includes('server-only-secret'),false);
 const denied=setup({denied:true});assert.equal((await denied.invoke({action:'create'})).status,400);assert.equal(denied.calls.some(c=>c.path.startsWith('/auth/v1/admin')),false);
 assert.equal((await invoke({action:'create'},false)).status,401);
});
test('new invitation exchanges once into a real Auth session; existing accounts never get capability login',async()=>{
 const {invoke,calls}=setup();const data=await (await invoke({action:'exchange',token:secret},false)).json();
 assert.equal(data.session.access_token,'user-access-token');assert.equal(calls.find(c=>c.path.endsWith('/verify')).body.type,'signup');
 assert.deepEqual(await (await invoke({action:'exchange',token:secret},false)).json(),{requiresSignIn:true});
 const existing=setup({existing:true});assert.deepEqual(await (await existing.invoke({action:'exchange',token:secret},false)).json(),{requiresSignIn:true});
 assert.equal(existing.calls.some(c=>c.path.includes('/auth/v1/')),false);
 const created=await (await existing.invoke({action:'create'})).json();assert.equal(created.directAccess,false);assert.ok(existing.calls.some(c=>c.path==='/auth/v1/otp'));
 assert.equal((await invoke({action:'exchange',token:'invalid'},false)).status,403);
});
