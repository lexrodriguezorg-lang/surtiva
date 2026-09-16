import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadCache} from '../src/request-cache.js';
test('navigation reads deduplicate, expire and isolate identities and organizations',async()=>{
 let now=0,calls=0;const cache=createReadCache({ttl:30,now:()=>now});
 const load=async()=>{calls++;return {rows:[calls]};};
 const [a,b]=await Promise.all([cache.read('user1/org1',load),cache.read('user1/org1',load)]);
 assert.equal(calls,1);a.rows.push(9);assert.deepEqual(b.rows,[1]);
 await cache.read('user2/org1',load);await cache.read('user1/org2',load);assert.equal(calls,3);
 now=31;await cache.read('user1/org1',load);assert.equal(calls,4);
 cache.clear();await cache.read('user1/org1',load);assert.equal(calls,5);
});
test('logout or mutation invalidation cannot be undone by an older in-flight read',async()=>{
 const cache=createReadCache();let finish;
 const pending=cache.read('key',()=>new Promise(resolve=>finish=resolve));await Promise.resolve();
 cache.clear();finish('old');await pending;
 assert.equal(await cache.read('key',async()=>'new'),'new');
 await assert.rejects(cache.read('failed',async()=>{throw Error('offline');}));
 assert.equal(await cache.read('failed',async()=>'recovered'),'recovered');
});
