import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,radarRows,catalogMarkup} from '../src/workspace-ui.js';
test('commercial metrics count real amounts; the radar prioritizes due contacts and inactive clients',()=>{
 const now=new Date('2026-09-16T12:00:00Z');
 const clients=[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}];
 const orders=[{customer_id:'a',status:'entregado',total:120,created_at:'2026-09-02'},{customer_id:'b',status:'entregado',total:300,created_at:'2026-07-01'},{status:'recibido',total:60,created_at:'2026-09-03'},{status:'cancelado',total:99}];
 const followups=[{customer_id:'a',next_date:'2026-09-15',created_at:'2026-09-14'}];
 const metrics=summarize({orders,clients,followups,invoices:[{total:100,paid:20}]},now);
 assert.equal(metrics.revenue,120);assert.equal(metrics.openValue,60);assert.equal(metrics.receivable,80);
 const radar=radarRows(clients,orders,followups,now);assert.equal(radar[0].id,'a');assert.equal(radar.find(c=>c.id==='c').days,null);
 assert.equal(summarize({}).products,0);
});
test('catalog filters the entire result set, escapes supplier content and does not invent stock',()=>{
 const products=[{id:'a',organization_id:'one',sku:'REF-1',title:'Muñeca',category:'Juguetes',price:200,image:'assets/productos/test.jpg',active:true},{id:'b',organization_id:'two',sku:'REF-2',title:'Vaso',category:'Hogar',price:100,active:true}];
 const html=catalogMarkup(products,{query:'muneca',orgName:()=>'<unsafe>'});
 assert.match(html,/Muñeca/);assert.doesNotMatch(html,/Vaso/);assert.match(html,/&lt;unsafe&gt;/);assert.doesNotMatch(html,/data-action="add-product"/);
 assert.doesNotMatch(catalogMarkup(products,{canOrder:true,readonly:true}),/data-action="add-product"/);
});
