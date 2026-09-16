import test from 'node:test';
import {database,fixture,migrate,asUser,ids,assert,count} from './database.mjs';

test('owner CRM stays private; profile review uses member RLS and restores owner identity',async()=>{
 const db=await database();try{
  await fixture(db);await migrate(db);
  await asUser(db,'admin',async()=>{
   await db.query("insert into public.commercial_agents(name,kind) values('Equipo territorial','human')");
   await db.query("insert into public.prospects(name,channel) values('Comercio por visitar','visita')");
   const member=(await db.query("select id from public.memberships where user_id=$1",[ids.seller])).rows[0].id;
   const result=(await db.query("select public.review_workspace($1,'clients',0,'customers.read') data",[member])).rows[0].data;
   assert.equal(result.length,1);assert.equal(result[0].id,ids.customer);
   assert.equal((await db.query('select auth.uid() id')).rows[0].id,ids.admin);
   assert.equal((await db.query('select private.is_admin() yes')).rows[0].yes,true);
   await assert.rejects(db.query("select public.review_workspace($1,'not_a_table',0,'customers.read')",[member]));
   assert.equal((await db.query('select auth.uid() id')).rows[0].id,ids.admin);
  });
  for(const user of ['owner','seller','shop','partner','other','pending'])await asUser(db,user,async()=>{
   assert.equal(await count(db,'prospects'),0);assert.equal(await count(db,'commercial_agents'),0);
   await assert.rejects(db.query("insert into public.prospects(name,channel) values('Escalation','web')"));
   await assert.rejects(db.query("select public.review_workspace($1,'clients',0,'customers.read')",[ids.org]));
  });
 }finally{await db.close();}
});
