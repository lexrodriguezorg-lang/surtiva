import test from 'node:test';
import {database,count,assert} from './database.mjs';
import {generateSeed,dukesId} from '../scripts/migrate-demo.mjs';
test('Dukes migration preserves source quantities and is idempotent without creating users',async()=>{
 const db=await database();try{
 const {output,summary}=await generateSeed();await db.exec(output);await db.exec(output);
 assert.equal(await count(db,'products'),1072);assert.equal(await count(db,'orders'),6);assert.equal(await count(db,'customers'),3);
 assert.equal(await count(db,'memberships'),0);assert.equal(await count(db,'platform_admins'),0);
 assert.equal(await count(db,'profiles'),0);assert.equal(await count(db,'catalog_access'),4288);
 assert.equal((await db.query('select count(*) n from public.products where organization_id<>$1',[dukesId])).rows[0].n,0);
 assert.equal((await db.query('select is_example from public.organizations where id=$1',[dukesId])).rows[0].is_example,true);
 assert.equal(await count(db,'order_lines'),summary.order_lines);
 await db.exec('update public.inventory set quantity=999 where quantity is not null');await db.exec(output);
 assert.equal((await db.query('select min(quantity) n from public.inventory where quantity is not null')).rows[0].n,999);
 }finally{await db.close();}
});
