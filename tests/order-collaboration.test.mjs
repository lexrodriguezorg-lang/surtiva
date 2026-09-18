import test from 'node:test';
import {database,fixture,migrate,asUser,ids,assert} from './database.mjs';
const setup=async()=>{const db=await database();await fixture(db);await migrate(db);return db;};
const detail=(db,user,id=ids.order)=>asUser(db,user,async()=>(await db.query('select public.order_workspace($1) d',[id])).rows[0].d);
async function act(db,user,operation,payload={},id=ids.order,revision){const d=await detail(db,user,id);return asUser(db,user,async()=>(await db.query('select public.act_on_order($1,$2,$3,$4) d',[id,revision??d.order.revision,operation,JSON.stringify(payload)])).rows[0].d);}

test('master approval and distributor stock are separate, guarded and reflected in all workspaces',async()=>{const db=await setup();try{
 let d=await detail(db,'admin');assert.equal(d.order.approval_status,'pending');assert(d.actions.includes('authorize'));assert(!d.actions.includes('prepare'));
 await asUser(db,'owner',()=>assert.rejects(db.query('select public.transition_order($1,$2,$3)',[ids.org,ids.order,'preparando']),/Faltan autorización/));
 await assert.rejects(act(db,'owner','authorize'),/no autorizada/);
 d=await act(db,'admin','request_availability');assert.equal(d.order.approval_status,'pending');assert.equal(d.order.availability_status,'requested');
 d=await act(db,'owner','confirm_availability',{items:[{productId:ids.product,stock:100}]});assert.equal(d.order.availability_status,'confirmed');assert(!d.actions.includes('prepare'));
 d=await act(db,'admin','authorize');assert.equal(d.order.approval_status,'approved');assert(d.actions.includes('prepare'));
 assert.equal((await detail(db,'shop')).order.revision,d.order.revision);
 d=await act(db,'owner','prepare');assert.equal(d.order.status,'preparando');assert.equal((await db.query('select reserved from public.inventory where product_id=$1',[ids.product])).rows[0].reserved,1);
 assert(!(await detail(db,'seller')).actions.includes('edit'));
 d=await act(db,'owner','ship');assert.equal(d.order.status,'despachado');
 d=await act(db,'shop','deliver');assert.equal(d.order.status,'entregado');
 assert.equal((await db.query('select count(*) n from public.invoices where order_id=$1',[ids.order])).rows[0].n,1);
 await assert.rejects(act(db,'shop','deliver'),/no autorizada/);
 }finally{await db.close()}});

test('edits recalculate volume prices and commissions, reset approvals, preserve history and reject stale edits',async()=>{const db=await setup();try{
 await db.query('update public.organizations set commission_rate=0.1 where id=$1',[ids.org]);
 const id=await asUser(db,'seller',async()=>(await db.query('select public.create_order($1,$2,$3,gen_random_uuid()) id',[ids.org,ids.customer,JSON.stringify([{productId:ids.product,quantity:1}])])).rows[0].id);
 await act(db,'admin','authorize',{},id);await act(db,'owner','confirm_availability',{items:[{productId:ids.product,stock:100}]},id);
 const stale=(await detail(db,'seller',id)).order.revision;
 const d=await act(db,'seller','edit',{note:'El cliente necesita una docena',items:[{productId:ids.product,quantity:12}]},id);
 assert.equal(d.order.total,1296);assert.equal(d.order.approval_status,'pending');assert.equal(d.order.availability_status,'not_requested');assert.equal(d.order.authorized_by,null);
 assert.equal((await db.query('select amount from public.commissions where order_id=$1',[id])).rows[0].amount,'129.60');
 assert(d.events.some(e=>e.details.before?.[0].quantity===1&&e.details.after?.[0].quantity===12));
 await assert.rejects(act(db,'admin','authorize',{},id,stale),/pedido cambió/);
 await assert.rejects(act(db,'seller','edit',{note:'Intento otra organización',items:[{productId:ids.product2,quantity:1}]},id),/Producto no disponible/);
 assert.equal((await detail(db,'admin',id)).order.total,1296);
 }finally{await db.close()}});

test('tenant B cannot read or change tenant A orders, partners see only assigned orders and no warehouse counts',async()=>{const db=await setup();try{
 await assert.rejects(detail(db,'other'),/no autorizado/);
 await asUser(db,'other',()=>assert.rejects(db.query("select public.act_on_order($1,1,'authorize','{}')",[ids.order]),/no autorizada/));
 await asUser(db,'other',async()=>assert.equal((await db.query('select count(*) n from public.order_events where order_id=$1',[ids.order])).rows[0].n,0));
 const other=(await db.query('select id from public.memberships where user_id=$1',[ids.other])).rows[0].id;
 await assert.rejects(act(db,'admin','assign',{membershipId:other}),/Responsable no autorizado/);
 const owner=(await db.query('select id from public.memberships where user_id=$1',[ids.owner])).rows[0].id;
 const assigned=await act(db,'admin','assign',{membershipId:owner});assert.equal(assigned.responsible,'owner');
 const partner=await detail(db,'partner');assert.equal(partner.items[0].stock,null);assert.deepEqual(partner.assignees,[]);assert(!partner.actions.includes('edit'));
 await assert.rejects(detail(db,'partner',ids.order2),/no autorizado/);
 }finally{await db.close()}});

test('partial availability cannot prepare and reservations prevent overpromising stock',async()=>{const db=await setup();try{
 await act(db,'admin','authorize');let d=await act(db,'owner','confirm_availability',{items:[{productId:ids.product,stock:0}]});assert.equal(d.order.availability_status,'partial');assert(!d.actions.includes('prepare'));
 await assert.rejects(act(db,'owner','prepare'),/no autorizada/);
 await act(db,'owner','confirm_availability',{items:[{productId:ids.product,stock:1}]});
 await db.query('update public.inventory set reserved=1 where product_id=$1',[ids.product]);
 await assert.rejects(act(db,'owner','prepare'),/Existencias insuficientes/);
 assert.equal((await detail(db,'admin')).order.status,'recibido');
 await assert.rejects(act(db,'owner','confirm_availability',{items:[{productId:ids.product,stock:0}]}),/menores al stock comprometido/);
 }finally{await db.close()}});
test('commercial QR edits only its own order and shares the updated revision with the seller',async()=>{const db=await setup();try{
 const call=async(token,op,payload={})=>{await db.exec("set role anon;select set_config('request.jwt.claim.sub','',false)");try{return (await db.query('select public.commercial_portal($1,$2,$3) d',[token,op,JSON.stringify(payload)])).rows[0].d;}finally{await db.exec('reset role')}};
 const access=async(user,org,client)=>asUser(db,user,async()=>(await db.query("select public.create_commercial_access($1,$2,'{}') d",[org,client])).rows[0].d);
 const a=await access('seller',ids.org,ids.customer),b=await access('owner',ids.org,ids.customer2);
 const q=await call(a.token,'quote',{items:[{productId:ids.product,quantity:1}]});const o=await call(a.token,'order',{quoteId:q.id,requestKey:ids.order});
 await assert.rejects(call(b.token,'edit_order',{id:o.id,revision:1,note:'Cambio ajeno',items:[{productId:ids.product,quantity:12}]}),/no autorizado/);
 await call(a.token,'edit_order',{id:o.id,revision:1,note:'Necesito doce unidades',items:[{productId:ids.product,quantity:12}]});
 const shown=(await call(a.token,'orders')).orders.find(i=>i.id===o.id);assert.equal(shown.total,1296);assert.equal(shown.revision,2);assert.equal(shown.approval_status,'pending');
 assert.equal((await detail(db,'seller',o.id)).items[0].quantity,12);
 await assert.rejects(call(a.token,'edit_order',{id:o.id,revision:1,note:'Versión vieja',items:[{productId:ids.product,quantity:2}]}),/pedido cambió/);
 }finally{await db.close()}});
