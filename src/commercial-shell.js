import {brand} from './brand.js';
import {esc,icon} from './commerce-ui.js';
import {distributorShell,distributorRoute,distributorCore} from './distributor-portal.js';

// Each role has its own working surface; optional distributor tools stay discoverable.
export function commercialNav(role){
 if(role==='distributor_admin')return distributorCore.map(([id,label,shape])=>[id,label,shape]);
 if(role==='seller')return [['catalogo','Catálogo','grid'],['clientes','Comercios','person'],['pedidos','Pedidos','bag']];
 if(role==='fulfillment_partner')return [['pedidos','Pedidos','bag'],['catalogo','Catálogo','grid'],['cumplimiento','Despachos','box']];
 return [['catalogo','Catálogo','grid'],['pedidos','Mis pedidos','bag']];
}
export function commercialRoute(role,page,canRead=()=>true){
 if(role==='distributor_admin')return distributorRoute(page,canRead);
 const nav=commercialNav(role);
 if(page==='visitas'&&role==='seller')return 'clientes';
 return nav.some(([id])=>id===page)?page:nav[0][0];
}
export function commercialShell(content,{role,page,avatar,name='',canRead=()=>true,pins=[]}){
 if(role==='distributor_admin')return distributorShell(content,{page,avatar,name,canRead,pins});
 const nav=commercialNav(role).filter(([id])=>canRead(id==='catalogo'?'catalog.read':id==='clientes'?'customers.read':id==='cumplimiento'?'fulfillment.read':'orders.read'));
 const links=nav.map(([id,label,shape])=>`<a href="#${id}" ${page===id?'aria-current="page"':''}>${icon(shape)}<span>${esc(label)}</span></a>`).join('');
 return `<div class="shell commercial-shell"><header class="commercial-header"><a href="#${nav[0]?.[0]||'catalogo'}" class="commercial-brand" aria-label="SURTIVA, inicio">${brand}</a>${role==='distributor_admin'&&name?`<span class="commercial-name">${esc(name)}</span>`:''}<nav class="commercial-desktop-nav" aria-label="Tu espacio">${links}</nav><button class="account-avatar" data-action="account" aria-label="Abrir mi perfil">${avatar}</button></header><main class="main" id="contenido"><div class="content">${content}</div></main><nav class="commercial-bottom-nav" aria-label="Tu espacio móvil">${links}<button data-action="account">${icon('person')}<span>Cuenta</span></button></nav></div>`;
}
