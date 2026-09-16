// Creates only an ignored local payload. Execution against Supabase is explicit.
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
await mkdir('.work',{recursive:true});
let fixture;
try{fixture=JSON.parse(await readFile('.work/hosted-fixture.json','utf8'));}catch{
 fixture={projectRef:'yirefmallnkgbckrbvrw',createdAt:new Date().toISOString(),accounts:['A','B'].map(label=>({label,userId:randomUUID(),organizationId:randomUUID(),productId:randomUUID(),sellerId:randomUUID(),supplierId:randomUUID(),email:`surtiva-rls-${label.toLowerCase()}-${randomUUID()}@example.test`,password:randomBytes(32).toString('base64url')}))};
 await writeFile('.work/hosted-fixture.json',JSON.stringify(fixture,null,2));
}
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const sql=['begin;'];
for(const a of fixture.accounts){
 sql.push(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
 values(${q(a.userId)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${q(a.email)},extensions.crypt(${q(a.password)},extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}',${q(JSON.stringify({name:'Prueba de aislamiento '+a.label,test:true}))},now(),now(),'','','','') on conflict(id) do nothing;`);
 sql.push(`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) values(${q(a.userId)},${q(a.userId)},${q(JSON.stringify({sub:a.userId,email:a.email,email_verified:true}))},'email',now(),now()) on conflict(provider_id,provider) do nothing;`);
 sql.push(`insert into public.organizations(id,name,slug,kind,status,is_test) values(${q(a.organizationId)},'Prueba de aislamiento ${a.label}',${q('rls-'+a.organizationId)},'distribuidor','active',true) on conflict do nothing;`);
 sql.push(`insert into public.memberships(organization_id,user_id,role_id,status) values(${q(a.organizationId)},${q(a.userId)},'distributor_admin','active') on conflict do nothing;`);
 sql.push(`insert into public.products(id,organization_id,sku,title,category,price) values(${q(a.productId)},${q(a.organizationId)},'RLS-${a.label}','Referencia privada ${a.label}','Prueba de aislamiento',100) on conflict do nothing;`);
 sql.push(`insert into public.inventory(organization_id,product_id,quantity,origin) values(${q(a.organizationId)},${q(a.productId)},3,'prueba') on conflict do nothing;`);
 sql.push(`insert into public.sellers(id,organization_id,name) values(${q(a.sellerId)},${q(a.organizationId)},'Vendedor de prueba ${a.label}') on conflict do nothing;`);
 sql.push(`insert into public.suppliers(id,organization_id,name) values(${q(a.supplierId)},${q(a.organizationId)},'Proveedor de prueba ${a.label}') on conflict do nothing;`);
}
sql.push('commit;');
await writeFile('.work/create-hosted-fixture.json',JSON.stringify({tool:'execute_sql',arguments:{query:sql.join('\n')}}));
console.log('Prepared two isolated test organizations. Credentials remain in ignored .work files.');
