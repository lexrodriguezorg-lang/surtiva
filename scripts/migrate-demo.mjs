import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

// Deterministic IDs and insert-only seed: rerunning never resets operational edits.
export function stableId(key){const hex=createHash('sha256').update('surtiva-example-v1:'+key).digest('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;}
export const dukesId=stableId('organization:dukes');
const sql=value=>value==null?'null':typeof value==='number'?String(value):typeof value==='boolean'?String(value):"'"+String(typeof value==='object'?JSON.stringify(value):value).replaceAll("'","''")+"'";
export async function generateSeed(){
 const catalog=JSON.parse(await readFile('src/datos/catalogo.json','utf8'));
 const source=await readFile('src/operacion.js','utf8');
 const sandbox=vm.createContext({window:{CATALOG:catalog},Intl,Date,console});
 const legacy=vm.runInContext(source.slice(0,source.indexOf('let db;'))+'\nseed();',sandbox,{timeout:3000});
 const records={organizations:[],sellers:[],fulfillment_points:[],customers:[],suppliers:[],products:[],inventory:[],catalog_access:[],orders:[],order_lines:[],order_events:[],commissions:[],receivables:[],retail_inventory:[],followups:[],fulfillment_records:[]};
 const add=(table,value)=>records[table].push(value);
 const id=(kind,value)=>stableId(kind+':'+value);
 add('organizations',{id:dukesId,name:'Dukes',slug:'dukes',kind:'distribuidor',is_example:true,commission_rate:0.08});
 add('sellers',{id:id('seller','jesus'),organization_id:dukesId,name:'Jesús Hipinto',territory:'Magdalena Medio',legacy_id:'jesus'});
 add('fulfillment_points',{id:id('point','alex'),organization_id:dukesId,name:'Alex Rodríguez · punto de ejemplo',city:'Magdalena Medio',legacy_id:'alex'});
 for(const c of legacy.customers)add('customers',{id:id('customer',c.id),organization_id:dukesId,name:c.name,city:c.city,seller_id:id('seller',c.seller),credit_limit:c.credit,legacy_id:c.id});
 // Daniela is the example distributor operator, not a separate supplier or platform administrator.
 for(const p of catalog){
  const productId=id('product',p.code),change=legacy.changes[p.code];
  add('products',{id:productId,organization_id:dukesId,sku:p.code,title:p.title,category:p.category,price:p.base,image:p.image||null,active:p.active!==false,pack_size:p.paca,dimensions:p.dims||null,source:{file:p.sourceFile,page:p.sourcePage,origin:'catalogo_historico',example:true}});
  const reserved=legacy.orders.filter(o=>o.status==='preparando').reduce((sum,o)=>sum+o.lines.filter(l=>l.code===p.code).reduce((s,l)=>s+l.qty,0),0);
  add('inventory',{organization_id:dukesId,product_id:productId,quantity:change?.stock??null,reserved,origin:change?'simulado':'por_confirmar'});
  add('catalog_access',{id:id('catalog-seller',p.code),organization_id:dukesId,product_id:productId,seller_id:id('seller','jesus')});
  for(const c of legacy.customers)add('catalog_access',{id:id('catalog-'+c.id,p.code),organization_id:dukesId,product_id:productId,customer_id:id('customer',c.id)});
 }
 for(const o of legacy.orders){
  const orderId=id('order',o.id);
  add('orders',{id:orderId,organization_id:dukesId,number:o.id,customer_id:id('customer',o.client),seller_id:id('seller',o.seller),fulfillment_point_id:id('point',o.partner),status:o.status,total:o.total,discount:o.discount,is_example:true,created_at:o.createdAt});
  o.lines.forEach((l,i)=>add('order_lines',{id:id('line',o.id+':'+i),organization_id:dukesId,order_id:orderId,product_id:id('product',l.code),title:l.title,quantity:l.qty,unit_price:l.unit}));
  o.history.forEach((h,i)=>add('order_events',{id:id('event',o.id+':'+i),organization_id:dukesId,order_id:orderId,description:h.actor+' · '+h.text,created_at:h.time}));
  add('commissions',{id:id('commission',o.id),organization_id:dukesId,order_id:orderId,seller_id:id('seller',o.seller),amount:o.commission,status:'proyectada'});
  add('fulfillment_records',{id:id('fulfillment',o.id),organization_id:dukesId,order_id:orderId,fulfillment_point_id:id('point',o.partner),committed_stock:o.status==='preparando'?o.lines.map(l=>({sku:l.code,quantity:l.qty})):[],dispatch_reference:['despachado','entregado'].includes(o.status)?'Despacho de ejemplo '+o.id:null,payment_status:'sin_registro',reconciliation_status:'pendiente'});
 }
 for(const i of legacy.invoices)add('receivables',{id:id('receivable',i.id),organization_id:dukesId,order_id:id('order',i.order),customer_id:id('customer',i.client),number:i.id,total:i.total,paid:i.paid,due_date:i.due.slice(0,10)});
 for(const [client,inventory] of Object.entries(legacy.retail))for(const [code,item] of Object.entries(inventory))add('retail_inventory',{organization_id:dukesId,customer_id:id('customer',client),product_id:id('product',code),quantity:item.qty,price:item.price,published:item.published});
 for(const n of legacy.notes)add('followups',{id:id('followup',n.id),organization_id:dukesId,customer_id:id('customer',n.client),seller_id:id('seller','jesus'),note:n.text,next_date:n.next,created_at:n.date});
 let output='-- Generated from the existing SURTIVA catalog and seed. No Auth users or passwords.\nbegin;\n';
 for(const [table,list] of Object.entries(records))for(let start=0;start<list.length;start+=100){const batch=list.slice(start,start+100),columns=[...new Set(batch.flatMap(row=>Object.keys(row)))];output+=`insert into public.${table}(${columns.join(',')}) values\n`+batch.map(row=>'('+columns.map(c=>sql(row[c])).join(',')+')').join(',\n')+'\non conflict do nothing;\n';}
 output+='commit;\n';return {output,records,summary:Object.fromEntries(Object.entries(records).map(([k,v])=>[k,v.length]))};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/migrate-demo.mjs')){
 const {output,summary}=await generateSeed();await mkdir('supabase/seed',{recursive:true});await writeFile('supabase/seed/dukes.sql',output);await writeFile('docs/MIGRACION-DUKES.json',JSON.stringify({organizationId:dukesId,source:'src/datos/catalogo.json + seed() original',...summary},null,2)+'\n');console.log(summary);
}
