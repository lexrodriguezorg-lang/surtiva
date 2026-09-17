import test from 'node:test';
import {database,fixture,migrate,asUser,ids,assert,count} from './database.mjs';
test('all approved profiles see published products, while private business data remains isolated',async()=>{
 const db=await database();try{
  await fixture(db);await migrate(db);
  await db.query('insert into public.catalog_publications(organization_id,product_id) values($1,$2)',[ids.org,ids.product3]);
  for(const user of ['seller','shop','partner','other'])await asUser(db,user,async()=>{
   const list=(await db.query('select public.commercial_catalog(0,true) data')).rows[0].data;
   assert.deepEqual(list.map(p=>p.id),[ids.product3]);
   assert.equal('source' in list[0],false);assert.equal('quantity' in list[0],false);
   assert.equal((await db.query('select * from public.clients where organization_id=$1',[ids.org2])).rows.length,0);
   await assert.rejects(db.query('insert into public.catalog_publications(organization_id,product_id) values($1,$2)',[ids.org2,ids.product2]));
  });
  await asUser(db,'other',async()=>{assert.equal((await db.query('select * from public.products where organization_id=$1',[ids.org])).rows.length,0);assert.equal(await count(db,'orders'),0);});
  await asUser(db,'seller',async()=>{assert.equal((await db.query('select private.can_product($1,$2) ok',[ids.org,ids.product3])).rows[0].ok,true);assert.equal(await count(db,'clients'),1);});
  await asUser(db,'pending',async()=>{await assert.rejects(db.query('select public.commercial_catalog()'));});
  await db.exec('set role anon');await assert.rejects(db.query('select public.commercial_catalog()'));await db.exec('reset role');
  await db.query("update public.memberships set status='suspended' where user_id=$1",[ids.seller]);
  await asUser(db,'seller',async()=>{await assert.rejects(db.query('select public.commercial_catalog()'));});
  await db.query("update public.organizations set status='suspended' where id=$1",[ids.org]);
  await asUser(db,'other',async()=>{assert.deepEqual((await db.query('select public.commercial_catalog(0,true) data')).rows[0].data,[]);});
 }finally{await db.close();}
});
