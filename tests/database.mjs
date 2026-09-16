import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Legacy regressions exercise the preserved demo migration; production-model
// tests explicitly upgrade these fixtures through all subsequent migrations.
export async function database(through=5) {
 const db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
 await migrate(db,0,through);
 return db;
}
export async function migrate(db,after=5,through=999) {
 for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&Number(f.split('_')[0])>after&&Number(f.split('_')[0])<=through).sort()) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
}
export const ids = { admin:'00000000-0000-4000-8000-000000000001', owner:'00000000-0000-4000-8000-000000000002', seller:'00000000-0000-4000-8000-000000000003', shop:'00000000-0000-4000-8000-000000000004', partner:'00000000-0000-4000-8000-000000000005', pending:'00000000-0000-4000-8000-000000000006', other:'00000000-0000-4000-8000-000000000007', org:'10000000-0000-4000-8000-000000000001', org2:'10000000-0000-4000-8000-000000000002', seller1:'20000000-0000-4000-8000-000000000001', seller2:'20000000-0000-4000-8000-000000000002', customer:'30000000-0000-4000-8000-000000000001', customer2:'30000000-0000-4000-8000-000000000002', point:'40000000-0000-4000-8000-000000000001', product:'50000000-0000-4000-8000-000000000001', product2:'50000000-0000-4000-8000-000000000002', product3:'50000000-0000-4000-8000-000000000003', order:'60000000-0000-4000-8000-000000000001', order2:'60000000-0000-4000-8000-000000000002' };
export async function fixture(db) {
 for(const name of ['admin','owner','seller','shop','partner','pending','other']) {
  await db.query(`insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now())`,[ids[name],name+'@example.test',JSON.stringify({name,organization_name:'Example',requested_role:'distribuidor'})]);
  await db.query(`insert into public.profiles(id,name) values($1,$2) on conflict do nothing`,[ids[name],name]);
 }
 await db.exec(`insert into public.platform_admins values('${ids.admin}',true);
 insert into public.organizations(id,name,slug,kind) values('${ids.org}','Dukes','dukes-test','distribuidor'),('${ids.org2}','Other','other','distribuidor');
 insert into public.sellers(id,organization_id,name) values('${ids.seller1}','${ids.org}','Assigned seller'),('${ids.seller2}','${ids.org}','Other seller');
 insert into public.fulfillment_points(id,organization_id,name) values('${ids.point}','${ids.org}','Point');
 insert into public.customers(id,organization_id,name,seller_id) values('${ids.customer}','${ids.org}','My customer','${ids.seller1}'),('${ids.customer2}','${ids.org}','Other customer','${ids.seller2}');
 insert into public.memberships(organization_id,user_id,role_id,seller_id,customer_id,fulfillment_point_id) values
 ('${ids.org}','${ids.owner}','distribuidor',null,null,null),('${ids.org}','${ids.seller}','vendedor','${ids.seller1}',null,null),('${ids.org}','${ids.shop}','comercio',null,'${ids.customer}',null),('${ids.org}','${ids.partner}','aliado',null,null,'${ids.point}'),('${ids.org2}','${ids.other}','distribuidor',null,null,null);
 insert into public.products(id,organization_id,sku,title,category,price) values('${ids.product}','${ids.org}','A','Allowed','Hogar',100),('${ids.product2}','${ids.org2}','B','Other tenant','Hogar',200),('${ids.product3}','${ids.org}','C','Restricted catalog','Hogar',300);
 insert into public.catalog_access(organization_id,product_id,seller_id) values('${ids.org}','${ids.product}','${ids.seller1}');
 insert into public.catalog_access(organization_id,product_id,customer_id) values('${ids.org}','${ids.product}','${ids.customer}');
 insert into public.inventory values('${ids.org}','${ids.product}',100,0,'confirmado');
 insert into public.orders(id,organization_id,number,customer_id,seller_id,fulfillment_point_id,total) values('${ids.order}','${ids.org}','A','${ids.customer}','${ids.seller1}','${ids.point}',100),('${ids.order2}','${ids.org}','B','${ids.customer2}','${ids.seller2}',null,300);
 insert into public.order_lines(organization_id,order_id,product_id,title,quantity,unit_price) values('${ids.org}','${ids.order}','${ids.product}','Allowed',1,100),('${ids.org}','${ids.order2}','${ids.product3}','Restricted',1,300);`);
}
export async function asUser(db,user,fn) {
 await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${ids[user]||user}',false);`);
 try { return await fn(); } finally { await db.exec('reset role'); }
}
export async function count(db,table) { return Number((await db.query(`select count(*) n from public.${table}`)).rows[0].n); }
export { assert };
