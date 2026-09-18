import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {database,fixture,migrate,asUser,ids,assert} from './database.mjs';
const setup=async()=>{const db=await database();await fixture(db);await migrate(db);return db;};
const workspace=(db,user,org=ids.org,query='',filter='all',offset=0)=>asUser(db,user,async()=>(await db.query('select public.supplier_workspace($1,$2,$3,$4) d',[org,query,filter,offset])).rows[0].d);
const adjust=(db,user,{product=ids.product,org=ids.org,operation='delta',amount=-1,revision=1,key=randomUUID()}={})=>asUser(db,user,async()=>(await db.query('select public.adjust_inventory($1,$2,$3,$4,$5,$6) d',[org,product,operation,amount,revision,key])).rows[0].d);

test('supplier workspace scopes data, keeps unknown counts distinct and never projects prices',async()=>{const db=await setup();try{
 const w=await workspace(db,'owner');assert.equal(w.products.length,2);assert.equal(w.summary.unknown,1);assert.equal(w.summary.available,1);
 assert(!JSON.stringify(w).includes('"price"'));assert(!w.products.some(p=>p.product_id===ids.product2));
 assert.equal((await workspace(db,'owner',ids.org,'C')).products[0].product_id,ids.product3);
 assert.equal((await workspace(db,'owner',ids.org,'','unknown')).total,1);
 assert.equal((await workspace(db,'other',ids.org2)).products.length,1);
 for(const user of ['other','seller','shop','partner','pending'])await assert.rejects(workspace(db,user),/No autorizado/);
 await db.query("update public.organizations set status='suspended' where id=$1",[ids.org]);await assert.rejects(workspace(db,'owner'),/No autorizado|Organización/);
 }finally{await db.close()}});

test('stock adjustments are atomic, idempotent, audited and protect reservations and tenants',async()=>{const db=await setup();try{
 const key=randomUUID();const a=await adjust(db,'owner',{key});assert.equal(a.quantity,99);assert.equal(a.revision,2);
 assert.deepEqual(await adjust(db,'owner',{key}),a);
 await assert.rejects(adjust(db,'owner',{key,amount:2}),/otro ajuste/);
 await assert.rejects(adjust(db,'owner',{amount:1}),/existencias cambiaron/);
 await assert.rejects(adjust(db,'other'),/No autorizado/);
 await assert.rejects(adjust(db,'owner',{product:ids.product2}),/Referencia no encontrada/);
 await assert.rejects(adjust(db,'owner',{product:ids.product3}),/Confirma las existencias/);
 const initialized=await adjust(db,'owner',{product:ids.product3,operation:'set',amount:0});assert.equal(initialized.quantity,0);
 await db.query('update public.inventory set reserved=99 where product_id=$1',[ids.product]);
 const w=await workspace(db,'owner');const item=w.products.find(p=>p.product_id===ids.product);
 await assert.rejects(adjust(db,'owner',{revision:item.revision}),/comprometido/);
 assert(w.movements.some(m=>m.before_quantity===100&&m.after_quantity===99));
 await asUser(db,'other',async()=>assert.equal((await db.query('select count(*) n from public.inventory_movements where organization_id=$1',[ids.org])).rows[0].n,0));
 await asUser(db,'seller',async()=>assert.equal((await db.query('select count(*) n from public.inventory_commands')).rows[0].n,0));
 await asUser(db,'owner',()=>assert.rejects(db.query('delete from public.inventory_movements'),/permission denied/));
 }finally{await db.close()}});

test('order preparation and dispatch update the same supplier inventory and audit trail automatically',async()=>{const db=await setup();try{
 const act=async(user,op,payload={})=>asUser(db,user,async()=>{
  const d=(await db.query('select public.order_workspace($1) d',[ids.order])).rows[0].d;
  return db.query('select public.act_on_order($1,$2,$3,$4)',[ids.order,d.order.revision,op,JSON.stringify(payload)]);
 });
 await act('admin','authorize');await act('owner','confirm_availability',{items:[{productId:ids.product,stock:100}]});
 await act('owner','prepare');let w=await workspace(db,'owner');assert.equal(w.summary.reserved,1);assert.equal(w.orderSummary.preparing,1);
 await act('owner','ship');w=await workspace(db,'owner');const p=w.products.find(p=>p.product_id===ids.product);assert.equal(p.quantity,99);assert.equal(p.reserved,0);
 assert(w.movements.some(m=>m.before_reserved===1&&m.after_reserved===0&&m.before_quantity===100&&m.after_quantity===99));
 }finally{await db.close()}});
