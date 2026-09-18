import test from 'node:test';
import {database,fixture,migrate,asUser,ids,assert} from './database.mjs';
test('one-use invitation binds only a new identity and preserves approval, tenant and existing-account boundaries',async()=>{
 const db=await database();try{
  await fixture(db);await migrate(db);
  let invitation;await asUser(db,'owner',async()=>{invitation=(await db.query("select public.create_invitation($1,'new@example.test','Invitada','seller') data",[ids.org])).rows[0].data;});
  const secret=invitation.token,user='90000000-0000-4000-8000-000000000099';
  const metadata={name:'Invitada',requested_role:'seller',organization_name:'Dukes',invitation_token:secret};
  await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[user,'new@example.test',JSON.stringify(metadata)]);
  const service=async(operation,payload={})=>{await db.exec('set role service_role');try{return (await db.query('select public.service_invitation($1,$2,$3) data',[operation,secret,JSON.stringify(payload)])).rows[0].data;}finally{await db.exec('reset role');}};
  await asUser(db,'owner',async()=>assert.rejects(db.query("select public.service_invitation('bind',$1,$2)",[secret,JSON.stringify({userId:user})])));
  await service('bind',{userId:user});
  await db.exec('set role anon');const info=(await db.query('select public.invitation_details($1) data',[secret])).rows[0].data;assert.equal(info.requiresSignIn,false);await assert.rejects(db.query('select * from private.invitation_delivery'));await db.exec('reset role');
  const claim=await service('claim');assert.equal(claim.userId,user);await assert.rejects(service('claim'));
  await service('release',{userId:user});assert.equal((await service('claim')).userId,user);
  await db.query('update auth.users set email_confirmed_at=now() where id=$1',[user]);await service('release',{userId:user});await assert.rejects(service('claim'));
  await db.query('insert into public.catalog_publications(organization_id,product_id) values($1,$2),($3,$4)',[ids.org,ids.product,ids.org2,ids.product2]);
  await asUser(db,user,async()=>{
   await db.query('select public.complete_invitation($1,$2)',[secret,JSON.stringify({name:'Nombre completo'})]);
   const catalog=(await db.query('select public.browse_catalog() data')).rows[0].data;
   assert.deepEqual(catalog.products.map(p=>p.id),[ids.product]);
   assert.equal((await db.query('select * from public.orders')).rows.length,0);
   assert.equal((await db.query('select * from public.clients')).rows.length,0);
   assert.equal((await db.query('select * from public.memberships')).rows.length,0);
   await assert.rejects(db.query('select public.create_order($1,$2,$3)',[ids.org,ids.customer,JSON.stringify([{productId:ids.product,quantity:1}])]));
  });
  assert.equal((await db.query('select status from public.access_requests where user_id=$1',[user])).rows[0].status,'pending');
  await db.query("update public.invitations set status='suspended' where id=$1",[invitation.id]);
  await assert.rejects(db.query('select public.invitation_details($1)',[secret]));
  await asUser(db,user,async()=>assert.rejects(db.query('select public.browse_catalog()')));
  // Existing owner accounts are never eligible for capability-based sign-in.
  let existing;await asUser(db,'owner',async()=>{existing=(await db.query("select public.create_invitation($1,'owner@example.test','Owner','seller') data",[ids.org])).rows[0].data;});
  assert.equal((await db.query('select public.invitation_details($1) data',[existing.token])).rows[0].data.requiresSignIn,true);
 }finally{await db.close();}
});
