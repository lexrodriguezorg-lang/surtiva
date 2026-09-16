import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture=JSON.parse(await readFile('.work/hosted-fixture.json','utf8'));
const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
assert.equal(base,`https://${fixture.projectRef}.supabase.co`);assert.ok(key?.startsWith('sb_publishable_'));
const checks=[];
async function request(path,token,{method='GET',body,headers={}}={}){
 const response=await fetch(base+path,{method,headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 return {status:response.status,data:await response.json().catch(()=>null)};
}
for(const a of fixture.accounts){
 const other=fixture.accounts.find(b=>b!==a);
 const login=await request('/auth/v1/token?grant_type=password',null,{method:'POST',body:{email:a.email,password:a.password}});
 assert.equal(login.status,200,'real Supabase Auth login must succeed');const token=login.data.access_token;assert.ok(token);
 for(const table of ['products','distributor_products','inventory','sellers','suppliers','memberships']){
  const mine=await request(`/rest/v1/${table}?organization_id=eq.${a.organizationId}&select=*`,token);assert.equal(mine.status,200);assert.equal(mine.data.length,1,table+' own data');
  const foreign=await request(`/rest/v1/${table}?organization_id=eq.${other.organizationId}&select=*`,token);assert.equal(foreign.status,200);assert.deepEqual(foreign.data,[]);
  checks.push({user:a.label,resource:table,ownRows:mine.data.length,foreignRows:foreign.data.length});
 }
 const organizations=await request('/rest/v1/organizations?select=id',token);assert.deepEqual(organizations.data,[{id:a.organizationId}]);
 const profiles=await request(`/rest/v1/profiles?id=eq.${other.userId}&select=id`,token);assert.deepEqual(profiles.data,[]);
 const global=await request('/rest/v1/audit_events?select=id',token);assert.deepEqual(global.data,[]);
 const edit=await request(`/rest/v1/products?id=eq.${other.productId}`,token,{method:'PATCH',body:{title:'Forbidden mutation'},headers:{Prefer:'return=representation'}});assert.equal(edit.status,200);assert.deepEqual(edit.data,[]);
 const readBack=await request(`/rest/v1/products?id=eq.${a.productId}&select=title`,token);assert.equal(readBack.data[0].title,'Referencia privada '+a.label);
 const escalate=await request('/rest/v1/rpc/review_access',token,{method:'POST',body:{request_id:crypto.randomUUID(),decision:'aprobar'}});assert.equal(escalate.status,403);
 const rpc=await request('/rest/v1/rpc/workspace_data',token,{method:'POST',body:{org:other.organizationId,resource:'products'}});assert.equal(rpc.status,403);
 checks.push({user:a.label,organizationRows:organizations.data.length,foreignProfiles:profiles.data.length,globalAuditRows:global.data.length,foreignMutationRows:edit.data.length,approvalStatus:escalate.status,foreignWorkspaceStatus:rpc.status});
 if(process.env.APP_TEST_URL){
  const api=await fetch(process.env.APP_TEST_URL+'/api/session',{headers:{Authorization:'Bearer '+token}});const session=await api.json();assert.equal(api.status,200);assert.equal(session.isAdmin,false);assert.equal(session.organizations.length,1);
  const denied=await fetch(process.env.APP_TEST_URL+'/api/data/products?organization='+other.organizationId,{headers:{Authorization:'Bearer '+token}});assert.equal(denied.status,403);
  checks.push({user:a.label,apiSessionStatus:api.status,apiCrossTenantStatus:denied.status});
 }
 await request('/auth/v1/logout?scope=local',token,{method:'POST',body:{}});
}
const anon=await request('/rest/v1/products?select=id');assert.equal(anon.status,401);
const report={project:fixture.projectRef,date:new Date().toISOString(),appUrl:process.env.APP_TEST_URL||null,method:'Real Supabase Auth passwords + user JWT + PostgREST RLS; no service key',organizations:fixture.accounts.map(({label,organizationId})=>({label,id:organizationId})),checks,anonymousReadStatus:anon.status,passed:true};
await writeFile('docs/PRUEBA-AISLAMIENTO-REMOTA.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
