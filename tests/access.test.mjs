import test from 'node:test';
import {database,fixture,asUser,ids,count,assert} from './database.mjs';
test('signup stays pending; only platform admin approves verified users atomically',async()=>{
 const db=await database();try {await fixture(db);
 assert.equal(await count(db,'access_requests'),7);
 const req=(await db.query('select id from public.access_requests where user_id=$1',[ids.pending])).rows[0].id;
 const approve=()=>db.query('select public.review_access($1,$2,$3,$4)',[req,'aprobar',ids.org2,'distribuidor']);
 await asUser(db,'owner',async()=>await assert.rejects(approve(),/No autorizado/));
 await db.query('update auth.users set email_confirmed_at=null where id=$1',[ids.pending]);
 await asUser(db,'admin',async()=>await assert.rejects(approve(),/verificado/));
 assert.equal((await db.query('select status from public.access_requests where id=$1',[req])).rows[0].status,'pendiente');
 await db.query('update auth.users set email_confirmed_at=now() where id=$1',[ids.pending]);
 await asUser(db,'admin',approve);
 await asUser(db,'pending',async()=>assert.equal(await count(db,'products'),1));
 await asUser(db,'admin',async()=>await assert.rejects(approve(),/revisada/));
 await asUser(db,'pending',async()=>await assert.rejects(db.exec(`update public.access_requests set requested_role='distribuidor'`),/permission denied/));
 await assert.rejects(db.query(`insert into auth.users(id,raw_user_meta_data) values(gen_random_uuid(),$1)`,[JSON.stringify({name:'Intruder',organization_name:'Bad',requested_role:'admin'})]),/inválido/);
 }finally{await db.close();}
});
test('server pricing, assignment checks, idempotency and atomic stock transitions',async()=>{
 const db=await database();try{await fixture(db);
 const items=[{productId:ids.product,quantity:12,price:1}];const key='70000000-0000-4000-8000-000000000001';
 const create=(customer=ids.customer,lines=items)=>db.query('select public.create_order($1,$2,$3,$4) id',[ids.org,customer,JSON.stringify(lines),key]);
 let order;
 await asUser(db,'seller',async()=>{
  await assert.rejects(create(ids.customer2),/Cliente no autorizado/);
  await assert.rejects(create(ids.customer,[{productId:ids.product2,quantity:1}]),/Producto no autorizado/);
  order=(await create()).rows[0].id;
  assert.equal((await create()).rows[0].id,order);
  assert.equal(Number((await db.query('select total from public.orders where id=$1',[order])).rows[0].total),1296);
  await assert.rejects(db.query('select public.transition_order($1,$2,$3)',[ids.org,order,'preparando']),/permitida/);
 });
 await asUser(db,'shop',()=>db.query('select public.transition_order($1,$2,$3)',[ids.org,order,'recibido']));
 await asUser(db,'owner',()=>db.query('select public.transition_order($1,$2,$3)',[ids.org,order,'preparando']));
 assert.equal((await db.query('select reserved from public.inventory where product_id=$1',[ids.product])).rows[0].reserved,12);
 await asUser(db,'partner',async()=>await assert.rejects(db.query('select public.transition_order($1,$2,$3)',[ids.org,order,'despachado']),/no autorizado/));
 await asUser(db,'owner',()=>db.query('select public.transition_order($1,$2,$3)',[ids.org,order,'despachado']));
 assert.equal((await db.query('select quantity from public.inventory where product_id=$1',[ids.product])).rows[0].quantity,88);
 await asUser(db,'shop',()=>db.query('select public.transition_order($1,$2,$3)',[ids.org,order,'entregado']));
 await asUser(db,'shop',async()=>await assert.rejects(db.query('select public.transition_order($1,$2,$3)',[ids.org,order,'entregado']),/permitida/));
 assert.equal(await count(db,'receivables'),1);
 }finally{await db.close();}
});
