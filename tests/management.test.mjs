import test from 'node:test';
import {database,fixture,asUser,ids,count,assert} from './database.mjs';
test('organization management, catalog grants and fulfillment reject unauthorized assignments',async()=>{
 const db=await database();try{await fixture(db);
 const create=()=>db.query('select public.create_entity($1,$2,$3) id',[ids.org,'supplier',JSON.stringify({name:'Proveedor propio'})]);
 await asUser(db,'seller',async()=>await assert.rejects(create(),/No autorizado/));
 await asUser(db,'other',async()=>await assert.rejects(create(),/No autorizado/));
 await asUser(db,'owner',create);
 await asUser(db,'owner',async()=>{
  await assert.rejects(db.query('select public.set_catalog_access($1,$2,$3,$4,$5)',[ids.org,ids.product2,'vendedor',ids.seller1,true]),/foreign key/);
  await db.query('select public.set_catalog_access($1,$2,$3,$4,$5)',[ids.org,ids.product3,'vendedor',ids.seller1,true]);
 });
 await asUser(db,'seller',async()=>assert.equal(await count(db,'products'),2));
 await asUser(db,'owner',()=>db.query('select public.set_catalog_access($1,$2,$3,$4,$5)',[ids.org,ids.product3,'vendedor',ids.seller1,false]));
 await asUser(db,'seller',async()=>assert.equal(await count(db,'products'),1));
 await asUser(db,'owner',()=>db.query('select public.assign_fulfillment($1,$2,$3)',[ids.org,ids.order2,ids.point]));
 await asUser(db,'partner',async()=>assert.equal(await count(db,'orders'),2));
 await asUser(db,'partner',async()=>await assert.rejects(db.query('select public.assign_fulfillment($1,$2,$3)',[ids.org,ids.order2,ids.point]),/No autorizado/));
 }finally{await db.close();}
});
test('local sales use own stock and price, are atomic and idempotent',async()=>{
 const db=await database();try{await fixture(db);
 await db.exec(`insert into public.retail_inventory(organization_id,customer_id,product_id,quantity,price) values('${ids.org}','${ids.customer}','${ids.product}',5,900)`);
 const key='80000000-0000-4000-8000-000000000001';
 const sale=(customer=ids.customer,qty=2,k=key)=>db.query('select public.record_local_sale($1,$2,$3,$4) id',[ids.org,customer,JSON.stringify([{productId:ids.product,quantity:qty,unitPrice:1}]),k]);
 await asUser(db,'seller',async()=>await assert.rejects(sale(),/no autorizado/));
 await asUser(db,'shop',async()=>{
  await assert.rejects(sale(ids.customer2),/no autorizado/);
  const id=(await sale()).rows[0].id;assert.equal((await sale()).rows[0].id,id);
  assert.equal(Number((await db.query('select total from public.local_sales where id=$1',[id])).rows[0].total),1800);
  await assert.rejects(sale(ids.customer,4,'80000000-0000-4000-8000-000000000002'),/insuficiente/);
 });
 assert.equal((await db.query('select quantity from public.retail_inventory')).rows[0].quantity,3);
 assert.equal(await count(db,'local_sales'),1);
 }finally{await db.close();}
});
