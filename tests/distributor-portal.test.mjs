import test from 'node:test';
import assert from 'node:assert/strict';
import {commercialRoute,commercialShell} from '../src/commercial-shell.js';
import {createDistributorPreferences,distributorToolsMarkup,distributorHome} from '../src/distributor-portal.js';

test('distributor has a real home and optional tools within existing permissions; other roles stay focused',()=>{
 assert.equal(commercialRoute('distributor_admin','inicio'),'inicio');
 assert.equal(commercialRoute('distributor_admin','vendedores'),'vendedores');
 assert.equal(commercialRoute('distributor_admin','vendedores',p=>p!=='team.read'),'inicio');
 for(const route of ['red','usuarios','solicitudes','organizaciones'])assert.equal(commercialRoute('distributor_admin',route),'inicio');
 assert.equal(commercialRoute('merchant','vendedores'),'catalogo');
 assert.equal(commercialRoute('seller','herramientas'),'catalogo');
 const base=commercialShell('contenido',{role:'distributor_admin',page:'inicio',avatar:'',name:'Duke'});
 assert(base.includes('href="#herramientas"'));assert(base.includes('href="#inventario"'));
 assert(!base.includes('href="#vendedores"'));assert(!base.includes('review-banner'));
 const pinned=commercialShell('contenido',{role:'distributor_admin',page:'vendedores',avatar:'',pins:['vendedores'],canRead:p=>p!=='team.read'});
 assert(!pinned.includes('href="#vendedores"'));
 const tools=distributorToolsMarkup({canRead:p=>p!=='team.read'});
 assert(!tools.includes('data-id="vendedores"'));assert(!tools.includes('data-id="invitaciones"'));
 assert(tools.includes('href="#clientes"'));assert(!/bloqueado|desbloquear|Pagar/i.test(tools));
});

test('menu choices are isolated by user, organization and preview, and never enable permissions',()=>{
 const saved=new Map(),store={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
 const prefs=createDistributorPreferences(store);
 assert.deepEqual(prefs.toggle('a','duke','vendedores'),['vendedores']);
 assert.deepEqual(prefs.read('a','other'),[]);assert.deepEqual(prefs.read('b','duke'),[]);
 assert.deepEqual(prefs.read('a','duke',true),[]);
 prefs.toggle('a','duke','clientes',true);
 assert.deepEqual(prefs.read('a','duke'),['vendedores']);assert.equal(saved.size,1);
 assert.deepEqual(createDistributorPreferences(store).read('a','duke'),['vendedores']);
 prefs.toggle('a','duke','solicitudes');assert.deepEqual(prefs.read('a','duke'),['vendedores']);
 prefs.toggle('a','duke','vendedores');assert.deepEqual(prefs.read('a','duke'),[]);
 const blocked=createDistributorPreferences({getItem(){throw Error('disabled')},setItem(){throw Error('disabled')}});
 assert.deepEqual(blocked.toggle('a','duke','clientes'),['clientes']);assert.deepEqual(blocked.read('a','duke'),['clientes']);
});

test('home uses supplied catalog and order data and preserves the distinction between unknown and zero inventory',()=>{
 const html=distributorHome({summary:{products:17,available:0,unknown:17},orderSummary:{availability:2,preparing:1,shipped:0},orders:[{id:'test',number:'Pedido real',status:'recibido',approval_status:'pending',availability_status:'requested'}]}, {catalogTotal:17,categories:[{name:'Hogar',count:17,image:'assets/productos/real.webp'}]},{name:'Duke'});
 assert(html.includes('Pedido real'));assert(html.includes('Confirmar disponibilidad'));assert(html.includes('17</b>por confirmar'));
 assert(html.includes('data-category="Hogar"'));assert(!html.includes('ventas generadas'));
 const empty=distributorHome({summary:{products:0},orderSummary:{},orders:[]},{categories:[]});
 assert(empty.includes('Listo para tu próximo pedido'));assert(empty.includes('Agrega tu primer producto'));
});
