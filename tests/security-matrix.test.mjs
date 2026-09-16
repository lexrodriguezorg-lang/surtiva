import test from 'node:test';
import {database,fixture,asUser,ids,assert} from './database.mjs';
test('every commercial table denies anonymous and pending users and prevents cross-tenant reads',async()=>{
 const db=await database();try{await fixture(db);
 const s2='20000000-0000-4000-8000-000000000003',c2='30000000-0000-4000-8000-000000000003',p2='40000000-0000-4000-8000-000000000003',o2='60000000-0000-4000-8000-000000000003';
 await db.exec(`insert into public.sellers(id,organization_id,name) values('${s2}','${ids.org2}','Other seller');
 insert into public.customers(id,organization_id,name,seller_id) values('${c2}','${ids.org2}','Other customer','${s2}');
 insert into public.fulfillment_points(id,organization_id,name) values('${p2}','${ids.org2}','Other point');
 insert into public.orders(id,organization_id,number,customer_id,seller_id,fulfillment_point_id,total) values('${o2}','${ids.org2}','OTHER','${c2}','${s2}','${p2}',200);`);
 for(const [org,seller,customer,point,order,product] of [[ids.org,ids.seller1,ids.customer,ids.point,ids.order,ids.product],[ids.org2,s2,c2,p2,o2,ids.product2]]){
  await db.exec(`insert into public.suppliers(organization_id,name) values('${org}','Supplier');
  insert into public.product_suppliers select '${org}','${product}',id from public.suppliers where organization_id='${org}';
  insert into public.inventory(organization_id,product_id,quantity) values('${org}','${product}',20) on conflict do nothing;
  insert into public.catalog_access(organization_id,product_id,seller_id) values('${org}','${product}','${seller}') on conflict do nothing;
  insert into public.order_events(organization_id,order_id,description) values('${org}','${order}','Event');
  insert into public.commissions(organization_id,order_id,seller_id,amount) values('${org}','${order}','${seller}',8);
  insert into public.followups(organization_id,customer_id,seller_id,note) values('${org}','${customer}','${seller}','Note');
  insert into public.receivables(organization_id,order_id,customer_id,number,total) values('${org}','${order}','${customer}','Invoice',100);
  insert into public.retail_inventory(organization_id,customer_id,product_id,quantity,price) values('${org}','${customer}','${product}',10,100);
  insert into public.local_sales(organization_id,customer_id,total,lines) values('${org}','${customer}',100,'[]');
  insert into public.fulfillment_records(organization_id,order_id,fulfillment_point_id) values('${org}','${order}','${point}');`);
 }
 const tables=['sellers','customers','fulfillment_points','suppliers','products','product_suppliers','catalog_access','inventory','orders','order_lines','order_events','commissions','followups','receivables','retail_inventory','local_sales','fulfillment_records'];
 for(const table of tables){
  await db.exec('set role anon');await assert.rejects(db.exec(`select * from public.${table}`),/permission denied/);await db.exec('reset role');
  await asUser(db,'pending',async()=>assert.equal((await db.query(`select * from public.${table}`)).rows.length,0,table+' pending'));
  for(const [user,org] of [['owner',ids.org],['other',ids.org2],['seller',ids.org],['shop',ids.org],['partner',ids.org]]){
   await asUser(db,user,async()=>{const rows=(await db.query(`select * from public.${table}`)).rows;assert.ok(rows.every(r=>r.organization_id===org),user+' '+table);});
  }
 }
 for(const table of ['suppliers','inventory','commissions','followups','receivables','retail_inventory','local_sales'])await asUser(db,'partner',async()=>assert.equal((await db.query(`select * from public.${table}`)).rows.length,0,'partner '+table));
 for(const table of ['suppliers','inventory','commissions','followups'])await asUser(db,'shop',async()=>assert.equal((await db.query(`select * from public.${table}`)).rows.length,0,'shop '+table));
 await asUser(db,'seller',async()=>{for(const table of ['receivables','retail_inventory','local_sales','fulfillment_records'])assert.equal((await db.query(`select * from public.${table}`)).rows.length,0,'seller '+table);});
 }finally{await db.close();}
});
