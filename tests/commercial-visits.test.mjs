import test from 'node:test';
import {database,fixture,migrate,asUser,ids,assert} from './database.mjs';
const call=async(db,token,op='catalog',payload={})=>(await db.query('select public.commercial_portal($1,$2,$3) data',[token,op,JSON.stringify(payload)])).rows[0].data;
const visitor=async(db,fn)=>{await db.exec("set role anon; select set_config('request.jwt.claim.sub','',false)");try{return await fn();}finally{await db.exec('reset role');}};
test('visit → access → quote → order preserves attribution, price snapshot and capability isolation',async()=>{
 const db=await database();try{
  await fixture(db);await migrate(db);
  await db.exec(`insert into public.catalog_publications(organization_id,product_id) values('${ids.org}','${ids.product}'),('${ids.org2}','${ids.product2}');`);
  const payload={name:'Tienda A',contact:'Andrea',phone:'3001234567',city:'Bogotá'};
  const a=await asUser(db,'seller',async()=>(await db.query('select public.preregister_merchant($1,$2) data',[ids.org,JSON.stringify({...payload,sellerId:ids.seller2})])).rows[0].data);
  const b=await asUser(db,'other',async()=>(await db.query('select public.preregister_merchant($1,$2) data',[ids.org2,JSON.stringify({...payload,name:'Tienda B'})])).rows[0].data);
  assert.match(a.token,/^[a-f0-9]{96}$/);assert.notEqual(a.token,b.token);
  const client=(await db.query('select * from public.clients where id=$1',[a.clientId])).rows[0];assert.equal(client.seller_id,ids.seller1);
  assert.equal((await db.query('select status from public.organizations where id=$1',[client.merchant_organization_id])).rows[0].status,'pending');
  assert.equal((await db.query('select count(*) n from public.memberships where organization_id=$1',[client.merchant_organization_id])).rows[0].n,0);
  assert.notEqual((await db.query('select token_hash from public.commercial_accesses where id=$1',[a.id])).rows[0].token_hash,a.token);
  await visitor(db,async()=>{
   const ca=await call(db,a.token),cb=await call(db,b.token);assert.equal(ca.name,'Tienda A');assert.equal(cb.name,'Tienda B');
   assert.deepEqual(ca.products.map(p=>p.id),[ids.product]);assert.deepEqual(cb.products.map(p=>p.id),[ids.product2]);assert.equal(ca.products[0].price,127);
   for(const field of ['source','organization_id','pack_size','commission_rate','seller_id','token_hash'])assert.equal(field in ca.products[0],false);
   for(const table of ['clients','commercial_accesses','commercial_quotes','orders','products'])await assert.rejects(db.query('select * from public.'+table));
   await assert.rejects(call(db,'a'.repeat(96)));await assert.rejects(call(db,a.token,'quote',{items:[{productId:ids.product2,quantity:1}]}));
   const q=await call(db,a.token,'quote',{items:[{productId:ids.product,quantity:3,price:1}]});assert.equal(q.total,354);
   await assert.rejects(call(db,b.token,'order',{quoteId:q.id,requestKey:ids.order}));
   const o=await call(db,a.token,'order',{quoteId:q.id,requestKey:ids.order,organization:ids.org2,seller:ids.seller2});
   assert.equal(o.total,354);assert.equal(o.status,'recibido');
   assert.equal((await call(db,a.token,'order',{quoteId:q.id,requestKey:ids.order})).id,o.id);
   assert.equal((await call(db,a.token,'order',{quoteId:q.id,requestKey:ids.order2})).id,o.id);
   assert.equal((await call(db,b.token,'orders')).orders.length,0);assert.equal((await call(db,a.token,'orders')).orders.length,1);
  });
  const order=(await db.query('select * from public.orders where commercial_access_id=$1',[a.id])).rows[0];assert.equal(order.organization_id,ids.org);assert.equal(order.customer_id,a.clientId);assert.equal(order.seller_id,ids.seller1);assert.equal(order.origin,'commercial_portal');
  assert.equal((await db.query('select count(*) n from public.commissions where order_id=$1',[order.id])).rows[0].n,1);
  await asUser(db,'seller',async()=>{assert.equal((await db.query('select id from public.orders where id=$1',[order.id])).rows.length,1);await assert.rejects(db.query('select public.create_commercial_access($1,$2)',[ids.org2,b.clientId]));await assert.rejects(db.query('select token_hash from public.commercial_accesses'));});
  await asUser(db,'seller',()=>db.query('select public.revoke_commercial_access($1)',[a.id]));
  await visitor(db,async()=>{for(const op of ['catalog','orders','quote','order','preferences'])await assert.rejects(call(db,a.token,op));});
 }finally{await db.close();}
});
test('shared selections, expirations, suspended issuers, stock and snapshot changes fail closed',async()=>{
 const db=await database();try{
  await fixture(db);await migrate(db);await db.exec(`insert into public.catalog_publications(organization_id,product_id) values('${ids.org}','${ids.product}'),('${ids.org}','${ids.product3}');`);
  const a=await asUser(db,'seller',async()=>(await db.query('select public.create_commercial_access($1,$2,$3) d',[ids.org,ids.customer,JSON.stringify({products:[ids.product]})])).rows[0].d);
  await visitor(db,async()=>{assert.deepEqual((await call(db,a.token)).products.map(p=>p.id),[ids.product]);await assert.rejects(call(db,a.token,'quote',{items:[{productId:ids.product3,quantity:1}]}));await assert.rejects(call(db,a.token,'quote',{items:[{productId:ids.product,quantity:101}]}));});
  await visitor(db,async()=>{await call(db,a.token,'preferences',{interests:['Hogar','No autorizada']});assert.deepEqual((await call(db,a.token)).interests,['Hogar']);});
  const q=await visitor(db,()=>call(db,a.token,'quote',{items:[{productId:ids.product,quantity:1}]}));
  const sameTenant=await asUser(db,'owner',async()=>(await db.query('select public.create_commercial_access($1,$2,$3) d',[ids.org,ids.customer2,JSON.stringify({products:[ids.product3]})])).rows[0].d);
  await visitor(db,async()=>{assert.deepEqual((await call(db,sameTenant.token)).products.map(p=>p.id),[ids.product3]);await assert.rejects(call(db,sameTenant.token,'order',{quoteId:q.id,requestKey:ids.order}));});
  await db.query('update public.products set price=900 where id=$1',[ids.product]);
  const o=await visitor(db,()=>call(db,a.token,'order',{quoteId:q.id,requestKey:ids.order}));assert.equal(o.total,127);
  const q2=await visitor(db,()=>call(db,a.token,'quote',{items:[{productId:ids.product,quantity:1}]}));await db.query("update public.commercial_quotes set expires_at=now()-interval '1 second' where id=$1",[q2.id]);
  await visitor(db,()=>assert.rejects(call(db,a.token,'order',{quoteId:q2.id,requestKey:ids.order2})));
  await db.query("update public.memberships set status='suspended' where user_id=$1",[ids.seller]);await visitor(db,()=>assert.rejects(call(db,a.token)));
  await db.query("update public.memberships set status='active' where user_id=$1",[ids.seller]);
  await db.query("update public.commercial_accesses set expires_at=now()-interval '1 second' where id=$1",[a.id]);await visitor(db,()=>assert.rejects(call(db,a.token)));
  await db.query("update public.commercial_accesses set expires_at=now()+interval '1 day' where id=$1",[a.id]);
  await db.query("update public.organizations set status='suspended' where id=$1",[ids.org]);await visitor(db,()=>assert.rejects(call(db,a.token)));
 }finally{await db.close();}
});
