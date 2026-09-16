import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {stableId,dukesId} from './migrate-demo.mjs';
const literal=value=>value==null?'null':typeof value==='number'?String(value):typeof value==='boolean'?String(value):"'"+String(typeof value==='object'?JSON.stringify(value):value).replaceAll("'","''")+"'";
export async function pilotSeed(){
 const catalog=JSON.parse(await readFile('src/datos/catalogo.json','utf8'));
 const statements=["-- Production pilot: source catalog only; no simulated commercial activity.","begin;",`insert into public.organizations(id,name,slug,kind,status,plan_code,is_example) values('${dukesId}','Dukes','dukes','distribuidor','active','pilot',false) on conflict do nothing;`];
 for(let start=0;start<catalog.length;start+=100){
  const batch=catalog.slice(start,start+100);
  statements.push('insert into public.products(id,organization_id,sku,title,category,price,image,active,pack_size,dimensions,source) values\n'+batch.map(p=>'('+[stableId('product:'+p.code),dukesId,p.code,p.title,p.category,p.base,p.image,p.active!==false,p.paca,p.dims,{file:p.sourceFile,page:p.sourcePage,origin:'catalogo_historico',priceReviewRequired:true}].map(literal).join(',')+')').join(',\n')+' on conflict do nothing;');
 }
 statements.push(`insert into public.inventory(organization_id,product_id,quantity,reserved,origin) select organization_id,id,null,0,'por_confirmar' from public.products where organization_id='${dukesId}' on conflict do nothing;`,'commit;');
 return {sql:statements.join('\n'),counts:{organizations:1,products:catalog.length,distributor_products:catalog.length,inventory:catalog.length,orders:0,clients:0,sellers:0}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const {sql,counts}=await pilotSeed();await writeFile('supabase/seed/dukes-pilot.sql',sql);console.log(JSON.stringify(counts));}
