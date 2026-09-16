import test from 'node:test';
import {database,fixture,migrate,asUser,ids,assert,count} from './database.mjs';
import {pilotSeed} from '../scripts/migrate-pilot.mjs';

test('master email correction activates an existing verified account without confirming other users',async()=>{
 const db=await database(14);try{
 await db.query('insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now())',[ids.admin,'lexrodriguezorg@gmail.com',JSON.stringify({name:'Propietario',organization_name:'Surtiva',requested_role:'distributor_admin'})]);
 await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[ids.pending,'pending@example.test',JSON.stringify({name:'Pending'})]);
 assert.equal(await count(db,'memberships'),0);
 await migrate(db,14);
 const member=(await db.query('select user_id,role_id from public.memberships')).rows;
 assert.deepEqual(member,[{user_id:ids.admin,role_id:'surtiva_admin'}]);
 assert.equal((await db.query('select email_confirmed_at from auth.users where id=$1',[ids.pending])).rows[0].email_confirmed_at,null);
 assert.equal((await db.query('select status from public.access_requests where user_id=$1',[ids.admin])).rows[0].status,'active');
 }finally{await db.close();}
});

test('pilot import contains catalog only and bootstrap grants global access only after email verification',async()=>{
 const db=await database(999);try{
 const {sql}=await pilotSeed();await db.exec(sql);await db.exec(sql);
 assert.equal(await count(db,'products'),1072);assert.equal(await count(db,'distributor_products'),1072);
 assert.equal(await count(db,'orders'),0);assert.equal(await count(db,'clients'),0);assert.equal(await count(db,'sellers'),0);
 assert.equal((await db.query('select count(*) n from public.inventory where quantity is not null or reserved<>0')).rows[0].n,0);
 await db.query('insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now())',[ids.pending,'lexrodriguezorg@mail.com',JSON.stringify({name:'Old address'})]);
 assert.equal(await count(db,'memberships'),0);
 await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[ids.admin,'lexrodriguezorg@gmail.com',JSON.stringify({name:'Administrador maestro'})]);
 assert.equal(await count(db,'memberships'),0);
 assert.equal(await count(db,'access_requests'),0);
 await db.query('update auth.users set email_confirmed_at=now() where id=$1',[ids.admin]);
 assert.equal((await db.query('select role_id from public.memberships')).rows[0].role_id,'surtiva_admin');
 await db.query('update auth.users set email_confirmed_at=now() where id=$1',[ids.admin]);assert.equal(await count(db,'memberships'),1);
 assert.equal((await db.query('select count(*) n from private.owner_bootstrap')).rows[0].n,0);
 await db.query('insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now())',[ids.other,'another@example.test',JSON.stringify({name:'Another owner',isAdmin:true,role:'surtiva_admin'})]);
 assert.equal(await count(db,'memberships'),1);
 await asUser(db,'admin',async()=>{assert.equal(await count(db,'products'),1072);assert.equal((await db.query('select private.is_admin() yes')).rows[0].yes,true);});
 }finally{await db.close();}
});

test('only the master administrator can create fulfillment partnerships',async()=>{
 const db=await database();try{
 await fixture(db);await migrate(db);
 await asUser(db,'owner',()=>assert.rejects(db.query("select public.create_invitation($1,'partner@example.test','Aliado','fulfillment_partner')",[ids.org]),/administrador maestro/));
 await assert.rejects(db.query("insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'uninvited@example.test','{\"name\":\"Uninvited\",\"organization_name\":\"Aliado\",\"requested_role\":\"fulfillment_partner\"}')"),/invitación del administrador maestro/);
 const invitation=await asUser(db,'admin',async()=>(await db.query("select public.create_invitation($1,'invited-partner@example.test','Aliado','fulfillment_partner') value",[ids.org])).rows[0].value);
 const user='90000000-0000-4000-8000-000000000017';
 await db.query('insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now())',[user,'invited-partner@example.test',JSON.stringify({name:'Aliado',organization_name:'Aliado',requested_role:'fulfillment_partner',invitation_token:invitation.token})]);
 assert.equal((await db.query('select count(*) n from public.memberships where user_id=$1',[user])).rows[0].n,0);
 const request=(await db.query('select id from public.access_requests where user_id=$1',[user])).rows[0].id;
 await asUser(db,'admin',()=>db.query("select public.review_access($1,'aprobar')",[request]));
 await asUser(db,user,async()=>{assert.equal(await count(db,'organizations'),1);assert.equal(await count(db,'fulfillment_nodes'),1);});
 }finally{await db.close();}
});

test('production migration preserves records, separates five roles and denies cross-tenant access',async()=>{
 const db=await database();try {
 await fixture(db);await migrate(db);
 const member=async u=>(await db.query('select * from public.memberships where user_id=$1',[ids[u]])).rows[0];
 assert.equal((await member('owner')).organization_id,ids.org);
 assert.equal((await member('owner')).role_id,'distributor_admin');
 assert.equal((await member('shop')).organization_id,ids.customer);
 assert.equal((await member('partner')).organization_id,ids.point);
 assert.equal((await member('admin')).role_id,'surtiva_admin');
 const tables=['organizations','memberships','clients','products','distributor_products','inventory','orders','order_items','invoices','commissions','suppliers','sellers','fulfillment_nodes','local_sales','retail_inventory','organization_relationships','invitations'];
 for(const u of ['owner','other'])await asUser(db,u,async()=>{
  const forbidden=u==='owner'?ids.org2:ids.org;
  for(const table of tables.filter(t=>t!=='organizations'))assert.equal((await db.query(`select count(*) n from public.${table} where organization_id=$1`,[forbidden])).rows[0].n,0,`${u} must not see ${table} of other tenant`);
  assert.equal((await db.query('select count(*) n from public.organizations where id=$1',[forbidden])).rows[0].n,0);
  assert.equal((await db.query('select private.is_admin() v')).rows[0].v,false);
  await assert.rejects(db.query("select public.workspace_data($1,'orders')",[forbidden]),/acceso/);
  await assert.rejects(db.query("select public.set_account_status('organization',$1,'suspended')",[forbidden]),/autorizado/);
  await assert.rejects(db.query("select public.create_invitation($1,'foreign@example.test','Intruso','seller')",[forbidden]),/autorizado/);
  await assert.rejects(db.query("select public.create_entity($1,'supplier','{\"name\":\"Intruso\"}')",[forbidden]),/autorizado/);
 });
 await asUser(db,'seller',async()=>{
  assert.equal(await count(db,'clients'),1);assert.equal(await count(db,'orders'),1);assert.equal(await count(db,'products'),1);
  assert.equal(await count(db,'inventory'),0);assert.equal(await count(db,'memberships'),1);
 });
 await asUser(db,'shop',async()=>{
  assert.equal(await count(db,'organizations'),1);assert.equal(await count(db,'orders'),1);assert.equal(await count(db,'clients'),1);
  assert.equal(await count(db,'inventory'),0);assert.equal(await count(db,'commissions'),0);
  const data=(await db.query("select public.workspace_data($1,'orders') data",[ids.customer])).rows[0].data;assert.equal(data.length,1);
 });
 await asUser(db,'partner',async()=>{
  assert.equal(await count(db,'organizations'),1);assert.equal(await count(db,'orders'),1);assert.equal(await count(db,'products'),0);
  assert.equal(await count(db,'clients'),0);assert.equal(await count(db,'inventory'),0);assert.equal(await count(db,'fulfillment_nodes'),1);
 });
 await asUser(db,'pending',async()=>{assert.equal(await count(db,'organizations'),0);assert.equal(await count(db,'orders'),0);assert.equal(await count(db,'memberships'),0);});
 const withoutRls=await db.query("select relname from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' and not relrowsecurity");assert.deepEqual(withoutRls.rows,[]);
 await db.exec('set role anon');for(const table of tables)await assert.rejects(db.query(`select * from public.${table}`));await db.exec('reset role');
 await asUser(db,'admin',async()=>{await db.query("select public.set_account_status('organization',$1,'suspended')",[ids.org]);});
 await asUser(db,'owner',async()=>{assert.equal(await count(db,'orders'),0);assert.equal(await count(db,'inventory'),0);});
 await asUser(db,'shop',async()=>{assert.equal(await count(db,'orders'),0);});
 }finally{await db.close();}
});

test('approval and invitations grant access only after verified identity and create independent tenants',async()=>{
 const db=await database();try{
 await fixture(db);await migrate(db);
 const initialOrgs=await count(db,'organizations');
 const newUser='90000000-0000-4000-8000-000000000001';
 const invitation=await asUser(db,'owner',async()=> (await db.query("select public.create_invitation($1,'invited@example.test','Comercio nuevo','merchant') data",[ids.org])).rows[0].data);
 await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[newUser,'invited@example.test',JSON.stringify({name:'Invitada',organization_name:'Comercio nuevo',requested_role:'merchant',invitation_token:invitation.token})]);
 assert.equal(await count(db,'organizations'),initialOrgs);
 assert.equal((await db.query('select count(*) n from public.memberships where user_id=$1',[newUser])).rows[0].n,0);
 const request=(await db.query('select id,status from public.access_requests where user_id=$1',[newUser])).rows[0];assert.equal(request.status,'pending');
 await asUser(db,'owner',()=>assert.rejects(db.query("select public.review_access($1,'aprobar')",[request.id]),/autorizado/));
 await asUser(db,'admin',()=>assert.rejects(db.query("select public.review_access($1,'aprobar')",[request.id]),/verificado/));
 await db.query('update auth.users set email_confirmed_at=now() where id=$1',[newUser]);
 const org=await asUser(db,'admin',async()=> (await db.query("select public.review_access($1,'aprobar') org",[request.id])).rows[0].org);
 assert.notEqual(org,ids.org);assert.equal(await count(db,'organizations'),initialOrgs+1);
 await asUser(db,newUser,async()=>{assert.equal(await count(db,'organizations'),1);assert.equal(await count(db,'clients'),1);assert.equal(await count(db,'orders'),0);assert.equal(await count(db,'products'),0);});
 await asUser(db,'admin',()=>assert.rejects(db.query("select public.review_access($1,'aprobar')",[request.id]),/revisada/));
 // A requested platform role and a membership with the wrong organization kind both fail.
 await assert.rejects(db.query("insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'escalate@example.test','{\"requested_role\":\"surtiva_admin\",\"name\":\"x\",\"organization_name\":\"x\"}')"),/inválido/);
 await assert.rejects(db.query("insert into public.memberships(organization_id,user_id,role_id,status) values($1,$2,'surtiva_admin','active')",[ids.org,newUser]),/corresponde/);
 // The token is returned once; even the inviting administrator cannot select its hash.
 await asUser(db,'owner',()=>assert.rejects(db.query('select token_hash from public.invitations')));
 }finally{await db.close();}
});

test('orders shared with assigned organizations keep merchant inventory and sales private',async()=>{
 const db=await database();try{
 await fixture(db);await migrate(db);
 const key='90000000-0000-4000-8000-000000000099';
 const order=await asUser(db,'shop',async()=>(await db.query('select public.create_order($1,$2,$3,$4) id',[ids.org,ids.customer,JSON.stringify([{productId:ids.product,quantity:2}]),key])).rows[0].id);
 await asUser(db,'owner',async()=>{
  await db.query('select public.assign_fulfillment($1,$2,$3)',[ids.org,order,ids.point]);
  await db.query("select public.transition_order($1,$2,'preparando')",[ids.org,order]);
 });
 await asUser(db,'partner',()=>db.query("select public.transition_order($1,$2,'despachado')",[ids.org,order]));
 await asUser(db,'shop',()=>db.query("select public.transition_order($1,$2,'entregado')",[ids.org,order]));
 const inventory=(await db.query('select * from public.retail_inventory')).rows[0];assert.equal(inventory.organization_id,ids.customer);assert.equal(inventory.distributor_organization_id,ids.org);
 await asUser(db,'shop',async()=>{
  assert.equal(await count(db,'retail_inventory'),1);assert.equal(await count(db,'invoices'),1);
  await db.query('select public.record_local_sale($1,$2,$3,$4)',[ids.customer,ids.customer,JSON.stringify([{productId:ids.product,quantity:1}]),key]);
  assert.equal(await count(db,'local_sales'),1);
 });
 await asUser(db,'owner',async()=>{
  assert.equal(await count(db,'retail_inventory'),0);assert.equal(await count(db,'local_sales'),0);
  await assert.rejects(db.query('select public.record_local_sale($1,$2,$3,$4)',[ids.customer,ids.customer,JSON.stringify([{productId:ids.product,quantity:1}]),key]),/autorizado/);
 });
 }finally{await db.close();}
});
