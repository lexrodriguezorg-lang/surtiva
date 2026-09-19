import test from 'node:test';
import {database,fixture,migrate,asUser,ids,assert} from './database.mjs';
import {commercialShell,commercialRoute} from '../src/commercial-shell.js';
import {orderRolePreview} from '../src/order-ui.js';
import {catalogMarkup} from '../src/workspace-ui.js';

test('commercial roles enter their catalogue without ERP navigation or a preview banner',()=>{
 for(const role of ['seller','merchant']){
  assert.equal(commercialRoute(role,'inicio'),'catalogo');
  assert.equal(commercialRoute(role,'proveedores'),'catalogo');
  const html=commercialShell('<h1>Catálogo</h1>',{role,page:'catalogo',avatar:'foto',name:'Duke'});
  for(const route of ['proveedores','vendedores','inventario','ventas','invitaciones'])assert(!html.includes('href="#'+route+'"'));
  assert(!html.includes('review-banner'));assert(!html.includes('sidebar'));
  assert(html.includes('data-action="account"'));assert(html.includes('href="#pedidos"'));
  assert.equal(html.includes('href="#clientes"'),role==='seller');
 }
 const card=catalogMarkup([{id:ids.product,title:'Producto sin conteo',sku:'A',category:'Hogar',organization_id:ids.org,price:100,active:true}],{canOrder:true});
 assert(card.includes('data-action="add-product"'));
});

test('unknown stock allows requesting an order, never assumes inventory or permits premature preparation',async()=>{
 const db=await database();try{await fixture(db);await migrate(db);
  await db.query('update public.inventory set quantity=null where product_id=$1',[ids.product]);
  for(const user of ['seller','shop']){
   const id=await asUser(db,user,async()=>(await db.query('select public.create_order($1,$2,$3,gen_random_uuid()) id',[ids.org,ids.customer,JSON.stringify([{productId:ids.product,quantity:3}])])).rows[0].id);
   assert(id);
   await asUser(db,'other',()=>assert.rejects(db.query('select public.order_workspace($1)',[id]),/no autorizado/));
   await asUser(db,'owner',()=>assert.rejects(db.query('select public.transition_order($1,$2,$3)',[ids.org,id,'preparando']),/Faltan autorización/));
  }
  const stock=(await db.query('select quantity,reserved from public.inventory where product_id=$1',[ids.product])).rows[0];
  assert.equal(stock.quantity,null);assert.equal(stock.reserved,0);
 }finally{await db.close();}
});

test('role preview exposes the same order actions as each real role, never master approval',async()=>{
 const db=await database();try{await fixture(db);await migrate(db);
  for(const status of ['recibido','preparando','despachado','entregado']){
   await db.query("update public.orders set status=$2,approval_status='approved',availability_status='confirmed' where id=$1",[ids.order,status]);
   const master=await asUser(db,'admin',async()=>(await db.query('select public.order_workspace($1) d',[ids.order])).rows[0].d);
   for(const [user,role] of [['owner','distributor_admin'],['seller','seller'],['shop','merchant'],['partner','fulfillment_partner']]){
    const real=await asUser(db,user,async()=>(await db.query('select public.order_workspace($1) d',[ids.order])).rows[0].d);
    const preview=orderRolePreview(master,role);
    assert.deepEqual(preview.actions.sort(),real.actions.sort());
    assert(!preview.actions.includes('authorize'));
    if(role!=='distributor_admin')assert(preview.items.every(i=>i.stock===null&&i.reserved===null));
   }
  }
 }finally{await db.close();}
});
