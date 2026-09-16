import test from 'node:test';
import {database,fixture,asUser,ids,count,assert} from './database.mjs';

test('RLS isolates tenants, assignments and catalog; grants deny escalation', async()=>{
 const db=await database();
 try {
 await fixture(db);
 for(const [user,expected] of [['admin',3],['owner',2],['other',1],['seller',1],['shop',1],['partner',0],['pending',0]]) {
  await asUser(db,user,async()=>assert.equal(await count(db,'products'),expected,user+' catalog'));
 }
 for(const [user,expected] of [['admin',2],['owner',2],['seller',1],['shop',1],['partner',1],['other',0],['pending',0]]) {
  await asUser(db,user,async()=>{assert.equal(await count(db,'orders'),expected,user+' orders'); assert.equal(await count(db,'order_lines'),expected,user+' lines');});
 }
 await asUser(db,'seller',async()=>{assert.equal(await count(db,'customers'),1);assert.equal(await count(db,'inventory'),0);});
 await asUser(db,'partner',async()=>{assert.equal(await count(db,'customers'),0);assert.equal(await count(db,'sellers'),0);});
 await asUser(db,'owner',async()=>{
  assert.equal((await db.query(`update public.products set price=1 where id=$1 returning id`,[ids.product2])).rows.length,0);
  await assert.rejects(db.exec(`update public.products set organization_id='${ids.org2}' where id='${ids.product}'`),/permission denied/);
  await assert.rejects(db.exec(`insert into public.memberships(organization_id,user_id,role_id) values('${ids.org2}','${ids.owner}','distribuidor')`),/permission denied/);
  await assert.rejects(db.exec(`insert into public.platform_admins values('${ids.owner}',true)`),/permission denied/);
 });
 await db.exec('set role anon');
 await assert.rejects(db.exec('select * from public.products'),/permission denied/);
 await db.exec('reset role');
 await assert.rejects(db.exec(`insert into public.order_lines(organization_id,order_id,product_id,title,quantity,unit_price) values('${ids.org}','${ids.order}','${ids.product2}','Cross tenant',1,1)`),/foreign key/);
 await db.exec(`update public.memberships set active=false where user_id='${ids.seller}'`);
 await asUser(db,'seller',async()=>assert.equal(await count(db,'orders'),0));
 await db.exec(`update public.organizations set active=false where id='${ids.org}'`);
 await asUser(db,'owner',async()=>assert.equal(await count(db,'products'),0));
 } finally { await db.close(); }
});
