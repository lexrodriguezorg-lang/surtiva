import test from 'node:test';
import {database,fixture,migrate,asUser,ids,assert} from './database.mjs';
test('catalogue discovery paginates deterministically, searches all products and keeps tenant metadata private',async()=>{
 const db=await database();try{
  await fixture(db);await migrate(db);
  await db.query(`insert into public.products(organization_id,sku,title,category,price,image)
   select $1,'PAGE-'||n,'Muñeca '||n,case when n%2=0 then 'Juguetes' else 'Belleza' end,n,'assets/productos/test.webp' from generate_series(1,80) n`,[ids.org]);
  await asUser(db,'owner',async()=>{
   const browse=async options=>(await db.query('select public.browse_catalog($1) data',[JSON.stringify(options)])).rows[0].data;
   const first=await browse({}),next=await browse({offset:24});
   assert.equal(first.total,82);assert.equal(first.products.length,24);assert.equal(first.hasMore,true);
   assert.equal(new Set([...first.products,...next.products].map(p=>p.id)).size,48);
   assert.deepEqual((await browse({})).products,first.products);
   assert.equal(first.suppliers.length,1);assert.equal(first.suppliers[0].id,ids.org);
   assert.equal(first.categories.find(c=>c.name==='Belleza').count,40);
   assert.equal((await browse({query:'muneca',category:'Belleza'})).total,40);
   assert.equal((await browse({offset:72})).hasMore,false);
   assert.equal((await browse({supplier:ids.org2})).products.length,0);
   assert.equal((await browse({limit:100000})).products.length,48);
   assert.equal('discovery_rank' in first.products[0],false);
  });
  await asUser(db,'other',async()=>{const data=(await db.query('select public.browse_catalog() data')).rows[0].data;assert.equal(data.total,1);assert.deepEqual(data.suppliers.map(s=>s.id),[ids.org2]);});
  await asUser(db,'pending',async()=>assert.rejects(db.query('select public.browse_catalog()')));
  await db.exec('set role anon');await assert.rejects(db.query('select public.browse_catalog()'));await db.exec('reset role');
 }finally{await db.close();}
});
