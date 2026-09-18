import {backend,HttpError,config} from './backend.mjs';

const resources={products:'catalog.read',inventory:'inventory.manage',clients:'customers.read',sellers:'team.read',suppliers:'suppliers.read',orders:'orders.read',order_items:'orders.read',order_events:'orders.read',commissions:'commissions.read',followups:'followups.manage',invoices:'receivables.read',retail_inventory:'retail.manage',local_sales:'retail.manage',fulfillment_nodes:'fulfillment.read',fulfillment_records:'fulfillment.read',memberships:'team.read',catalog_access:'catalog.read',distributor_products:'catalog.read',invitations:'team.read',organization_relationships:'team.read'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validId(value) { if(!uuid.test(value||'')) throw new HttpError(400,'Identificador inválido.'); return value; }
const text=(value,min,max)=>{ if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw new HttpError(400,'Revisa los campos del formulario.');return value.trim(); };
function cookies(req) { return Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split(/=(.*)/s).slice(0,2)).filter(p=>p.length===2)); }
function setSession(res,session,secure) {
 const prefix=secure?'__Host-surtiva-':'surtiva-';
 const flags=`Path=/; HttpOnly; SameSite=Strict${secure?'; Secure':''}`;
 res.setHeader('Set-Cookie',[
 `${prefix}access=${session?.access_token||''}; ${flags}; Max-Age=${session?Math.min(session.expires_in||3600,3600):0}`,
 `${prefix}refresh=${session?.refresh_token||''}; ${flags}; Max-Age=${session?604800:0}`
 ]);
}
function secureRequest(env) {return env.NODE_ENV==='production'||!!env.VERCEL;}
function originCheck(req,env) {
 const expected=env.APP_ORIGIN||(env.VERCEL_URL?'https://'+env.VERCEL_URL:'http://localhost:3000');
 const allowed=[expected,...(env.APP_ADDITIONAL_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean),...[env.VERCEL_URL,env.VERCEL_BRANCH_URL].filter(Boolean).map(host=>'https://'+host)];
 if(!allowed.includes(req.headers.origin))throw new HttpError(403,'Origen de solicitud no permitido.');
 if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError(415,'Se requiere JSON.');
}
async function readBody(req) {
 if(req.body!==undefined) {
  const serialized=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  if(Buffer.byteLength(serialized)>32768)throw new HttpError(413,'Solicitud demasiado grande.');
  try { return JSON.parse(serialized); } catch {throw new HttpError(400,'JSON inválido.');}
 }
 let data='';for await(const chunk of req) {data+=chunk;if(Buffer.byteLength(data)>32768)throw new HttpError(413,'Solicitud demasiado grande.');}
 try{return JSON.parse(data||'{}');}catch{throw new HttpError(400,'JSON inválido.');}
}
async function identity(service,token) {
 if(!token)throw new HttpError(401,'Ingresa para continuar.');
 const user=await service.auth('user',{token});
 if(!user?.id||!user.email_confirmed_at)throw new HttpError(401,'Verifica tu correo e ingresa nuevamente.');
 return user;
}
async function context(service,token,user) {
 const [memberships,organizations,requests,permissions]=await Promise.all([
  service.db('memberships?select=*&user_id=eq.'+user.id,{token}),
  service.db('organizations?select=*&order=name',{token}),
  service.db('access_requests?select=*&user_id=eq.'+user.id,{token}),
  service.db('role_permissions?select=*',{token})
 ]);
 const accountStates=memberships.map(m=>m.status!=='active'?m.status:organizations.find(o=>o.id===m.organization_id)?.status||'suspended');
 const accountStatus=['active','suspended','rejected','pending'].find(status=>accountStates.includes(status))||requests[0]?.status||'pending';
 return {user:{id:user.id,email:user.email,name:user.user_metadata?.name||user.email,avatarUrl:typeof user.user_metadata?.avatar_url==='string'&&user.user_metadata.avatar_url.length<60000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(user.user_metadata.avatar_url)?user.user_metadata.avatar_url:null},isAdmin:memberships.some(m=>m.role_id==='surtiva_admin'&&m.status==='active'&&organizations.some(o=>o.id===m.organization_id&&o.kind==='plataforma'&&o.status==='active')),accountStatus,memberships:memberships.filter(m=>m.status==='active'&&organizations.some(o=>o.id===m.organization_id&&o.status==='active')),organizations,request:requests[0]||null,permissions};
}
export function createHandler({env=process.env,fetcher=fetch}={}) {
 return async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Vary','Authorization, Cookie');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
  try {
   const url=new URL(req.url,'http://localhost');
   const path=['/api','/api/','/api/index'].includes(url.pathname)?(url.searchParams.get('_route')||''):url.pathname.replace(/^\/api\/?/,'');
   if(!['GET','POST','PATCH'].includes(req.method))throw new HttpError(405,'Método no permitido.');
   let body={}; if(req.method!=='GET'){originCheck(req,env);body=await readBody(req);if(!body||Array.isArray(body)||typeof body!=='object')throw new HttpError(400,'Solicitud inválida.');}
   const secure=secureRequest(env), prefix=secure?'__Host-surtiva-':'surtiva-';
   const jar=cookies(req),token=req.headers.authorization?.match(/^Bearer ([^\s]+)$/)?.[1]||jar[prefix+'access'];
   if(path==='auth/logout'&&req.method==='POST') {
    setSession(res,null,secure);
    if(token)await backend({env,fetcher}).auth('logout',{token,method:'POST'}).catch(()=>{});
    return reply(200,{ok:true});
   }
   if(path==='health'&&req.method==='GET') {return reply(200,{configured:!!(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY),version:'0.9.0'});}
   if(path==='config'&&req.method==='GET') {const {url,key}=config(env);return reply(200,{url,publishableKey:key});}
   if(path==='commercial/portal'&&req.method==='POST') {
    const secret=text(body.token,96,96);if(!/^[a-f0-9]{96}$/.test(secret))throw new HttpError(403,'Este enlace no está disponible. Solicita uno nuevo a tu vendedor.');
    if(!['catalog','preferences','orders','quote','order'].includes(body.operation))throw new HttpError(400,'Operación inválida.');
    res.setHeader('Referrer-Policy','no-referrer');
    return reply(200,await backend({env,fetcher}).db('rpc/commercial_portal',{method:'POST',body:{secret,operation:body.operation,payload:body.payload||{}}}));
   }
   // Reject private requests before contacting an unavailable backend.
   if(!path.startsWith('auth/')&&!token)throw new HttpError(401,'Ingresa para continuar.');
   const service=backend({env,fetcher});
   if(['auth/login','auth/register'].includes(path)&&req.method==='POST') {
    const email=text(body.email,3,254).toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new HttpError(400,'Correo inválido.');
    const password=body.password;if(typeof password!=='string'||password.length<(path==='auth/register'?12:1)||password.length>128)throw new HttpError(400,'La contraseña debe tener entre 12 y 128 caracteres.');
    if(path==='auth/register') {
     if(!['distributor_admin','seller','merchant','fulfillment_partner'].includes(body.role))throw new HttpError(400,'Selecciona un perfil válido.');
     await service.auth('signup',{method:'POST',body:{email,password,data:{name:text(body.name,1,100),organization_name:text(body.organization,1,120),requested_role:body.role},...(body.captchaToken?{gotrue_meta_security:{captcha_token:text(body.captchaToken,1,4096)}}:{})}});
     return reply(202,{message:'Si el correo puede registrarse, recibirás un mensaje de verificación. Tu solicitud quedará pendiente de aprobación.'});
    }
    const session=await service.auth('token?grant_type=password',{method:'POST',body:{email,password}});
    if(!session.access_token)throw new HttpError(401,'Revisa tu correo y contraseña.');
    setSession(res,session,secure);return reply(200,{ok:true});
   }
   if(path==='auth/refresh'&&req.method==='POST') {
    const refresh=jar[prefix+'refresh'];if(!refresh)throw new HttpError(401,'Ingresa nuevamente.');
    try {const session=await service.auth('token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refresh}});setSession(res,session,secure);return reply(200,{ok:true});}
    catch(error){setSession(res,null,secure);throw error;}
   }
   const user=await identity(service,token);const ctx=await context(service,token,user);
   if(path==='session'&&req.method==='GET')return reply(200,ctx);
   if(path==='catalog'&&req.method==='GET') {
    return reply(200,await service.db('rpc/commercial_catalog',{token,method:'POST',body:{page_offset:Math.floor(Math.max(0,Math.min(Number(url.searchParams.get('offset'))||0,100000))),published_only:url.searchParams.get('published')==='true'}}));
   }
   if(path.startsWith('admin/data/')&&req.method==='GET') {
    if(!ctx.isAdmin)throw new HttpError(403,'No autorizado.');
    const resource=path.slice('admin/data/'.length);
    if(!['products','inventory','orders','order_items','order_events','clients','sellers','suppliers','invoices','commissions','followups','memberships','commercial_agents','prospects'].includes(resource))throw new HttpError(403,'Recurso no disponible.');
    const offset=Math.floor(Math.max(0,Math.min(Number(url.searchParams.get('offset'))||0,100000)));
    const orgs=ctx.organizations.filter(o=>!o.is_test).map(o=>validId(o.id));
    const global=['commercial_agents','prospects'].includes(resource);
    if(!global&&!orgs.length)return reply(200,[]);
    const order=resource==='inventory'?'product_id':resource==='products'?'sku,id':'id';
    const limit=url.searchParams.get('limit')==='500'?500:100;
    return reply(200,await service.db(resource+'?select='+(resource==='memberships'?'*,profiles(name)':'*')+'&limit='+limit+'&offset='+offset+'&order='+order+(global?'':'&organization_id=in.('+orgs.join(',')+')')+(url.searchParams.has('order')&&['order_items','order_events'].includes(resource)?'&order_id=eq.'+validId(url.searchParams.get('order')):''),{token}));
   }
   if(path==='admin/review-data'&&req.method==='GET') {
    if(!ctx.isAdmin)throw new HttpError(403,'No autorizado.');
    const resource=url.searchParams.get('resource'),member=url.searchParams.get('membership');
    if(!resources[resource])throw new HttpError(403,'Recurso no disponible.');
    return reply(200,await service.db('rpc/review_workspace',{token,method:'POST',body:{membership_key:validId(member),resource,page_offset:Math.floor(Math.max(0,Math.min(Number(url.searchParams.get('offset'))||0,100000))),required_permission:resources[resource],order_filter:url.searchParams.has('order')?validId(url.searchParams.get('order')):null}}));
   }
   if(path==='admin/prospects'&&['POST','PATCH'].includes(req.method)) {
    if(!ctx.isAdmin)throw new HttpError(403,'No autorizado.');
    const payload={name:text(body.name,1,150),city:text(body.city||'Sin ciudad',1,120),contact:text(body.contact||'Sin contacto',1,200),channel:body.channel,status:body.status,notes:text(body.notes||'Sin notas',1,2000),next_date:body.nextDate||null,agent_id:body.agentId?validId(body.agentId):null,estimated_value:Number(body.estimatedValue)||0};
    const result=await service.db('prospects'+(req.method==='PATCH'?'?id=eq.'+validId(body.id):''),{token,method:req.method,headers:{Prefer:'return=representation'},body:payload});return reply(200,result);
   }
   if(path==='admin/agents'&&req.method==='POST') {
    if(!ctx.isAdmin)throw new HttpError(403,'No autorizado.');
    return reply(201,await service.db('commercial_agents',{token,method:'POST',headers:{Prefer:'return=representation'},body:{name:text(body.name,1,150),kind:body.kind,instructions:text(body.instructions||'Sin instrucciones',1,2000)}}));
   }
   if(path==='admin/requests'&&req.method==='GET') {
    if(!ctx.isAdmin)throw new HttpError(403,'No autorizado.');
    return reply(200,await service.db('access_requests?select=*,profiles!access_requests_user_id_fkey(name)&order=created_at.desc',{token}));
   }
   if(path==='admin/review'&&req.method==='POST') {
    if(!ctx.isAdmin)throw new HttpError(403,'No autorizado.');
    const org=await service.db('rpc/review_access',{token,method:'POST',body:{request_id:validId(body.requestId),decision:body.decision,target_org:body.organizationId?validId(body.organizationId):null,assigned_role:body.role||null,entity_id:body.entityId?validId(body.entityId):null,new_org_name:body.organizationName||null}});
    return reply(200,{organizationId:org});
   }
   if(path==='admin/membership'&&req.method==='POST') {
    if(!ctx.isAdmin||typeof body.enabled!=='boolean')throw new HttpError(403,'No autorizado.');
    await service.db('rpc/set_membership_active',{token,method:'POST',body:{membership_id:validId(body.id),enabled:body.enabled}});return reply(200,{ok:true});
   }
   if(path==='admin/status'&&req.method==='POST') {
    if(!ctx.isAdmin)throw new HttpError(403,'No autorizado.');
    await service.db('rpc/set_account_status',{token,method:'POST',body:{entity_kind:body.kind,entity_key:validId(body.id),new_status:body.status}});return reply(200,{ok:true});
   }
   if(path==='admin/plan'&&req.method==='POST') {
    if(!ctx.isAdmin)throw new HttpError(403,'No autorizado.');
    await service.db('rpc/set_organization_plan',{token,method:'POST',body:{org:validId(body.id),plan:body.plan}});return reply(200,{ok:true});
   }
   if(path==='invitation/accept'&&req.method==='POST') {
    const id=await service.db('rpc/accept_invitation',{token,method:'POST',body:{invitation_token:text(body.token,60,100)}});return reply(200,{id});
   }
   const org=validId(url.searchParams.get('organization'));
   const membership=ctx.memberships.find(m=>m.organization_id===org);
   if(!ctx.organizations.some(o=>o.id===org)||(!ctx.isAdmin&&!membership))throw new HttpError(403,'No tienes acceso a esta organización.');
   const can=permission=>ctx.isAdmin||ctx.permissions.some(p=>p.role_id===membership.role_id&&p.permission_id===permission);
   if(path.startsWith('commercial/')&&!ctx.isAdmin&&!['distributor_admin','seller'].includes(membership?.role_id))throw new HttpError(403,'No autorizado.');
   if(path==='commercial/preregister'&&req.method==='POST') {
    return reply(201,await service.db('rpc/preregister_merchant',{token,method:'POST',body:{org,payload:{name:text(body.name,1,120),contact:text(body.contact,1,100),phone:text(body.phone,7,24),city:text(body.city,1,100),sellerId:body.sellerId?validId(body.sellerId):null}}}));
   }
   if(path==='commercial/access'&&req.method==='POST') {
    return reply(201,await service.db('rpc/create_commercial_access',{token,method:'POST',body:{org,client_key:validId(body.clientId),options:body.options||{}}}));
   }
   if(path==='commercial/accesses'&&req.method==='GET') {
    return reply(200,await service.db('commercial_accesses?select=id,client_id,status,created_at,expires_at,last_access_at,access_count,categories,product_ids&organization_id=eq.'+org+'&client_id=eq.'+validId(url.searchParams.get('client'))+'&order=created_at.desc&limit=30',{token}));
   }
   if(path==='commercial/revoke'&&req.method==='POST') {
    await service.db('rpc/revoke_commercial_access',{token,method:'POST',body:{access_key:validId(body.id)}});return reply(200,{ok:true});
   }
   if(path==='products'&&req.method==='PATCH') {
    if(!ctx.isAdmin&&membership.role_id!=='distributor_admin')throw new HttpError(403,'No autorizado.');
    if(!Number.isFinite(body.price)||body.price<0||typeof body.active!=='boolean')throw new HttpError(400,'Precio o estado inválido.');
    const changed=await service.db('products?organization_id=eq.'+org+'&id=eq.'+validId(body.id),{token,method:'PATCH',headers:{Prefer:'return=representation'},body:{title:text(body.title,1,200),category:text(body.category,1,120),price:body.price,active:body.active}});
    if(!changed.length)throw new HttpError(404,'Producto no encontrado.');return reply(200,{ok:true});
   }
   if(path==='clients/assign'&&req.method==='POST') {
    if(!ctx.isAdmin&&membership.role_id!=='distributor_admin')throw new HttpError(403,'No autorizado.');
    await service.db('rpc/assign_client_seller',{token,method:'POST',body:{org,client_key:validId(body.id),seller_key:body.sellerId?validId(body.sellerId):null}});return reply(200,{ok:true});
   }
   if(path==='invitations'&&req.method==='POST') {
    if(!ctx.isAdmin&&membership.role_id!=='distributor_admin')throw new HttpError(403,'No autorizado.');
    const result=await service.db('rpc/create_invitation',{token,method:'POST',body:{org,recipient_email:text(body.email,3,254),recipient_name:text(body.name,1,100),requested_role:body.role}});return reply(201,result);
   }
   if(path==='entities'&&req.method==='POST') {
    if(!ctx.isAdmin&&membership.role_id!=='distributor_admin')throw new HttpError(403,'No autorizado.');
    const id=await service.db('rpc/create_entity',{token,method:'POST',body:{org,kind:body.kind,payload:body.payload}});return reply(201,{id});
   }
   if(path==='catalog/access'&&req.method==='POST') {
    if((!ctx.isAdmin&&membership.role_id!=='distributor_admin')||typeof body.enabled!=='boolean')throw new HttpError(403,'No autorizado.');
    await service.db('rpc/set_catalog_access',{token,method:'POST',body:{org,product_key:validId(body.productId),entity_kind:body.entityKind,entity_key:validId(body.entityId),enabled:body.enabled}});return reply(200,{ok:true});
   }
   if(path==='orders/assign'&&req.method==='POST') {
    if(!ctx.isAdmin&&membership.role_id!=='distributor_admin')throw new HttpError(403,'No autorizado.');
    await service.db('rpc/assign_fulfillment',{token,method:'POST',body:{org,order_key:validId(body.id),point_key:validId(body.pointId)}});return reply(200,{ok:true});
   }
   if(path==='retail'&&req.method==='PATCH') {
    if(!can('retail.manage')||!Number.isInteger(body.quantity)||body.quantity<0||!Number.isFinite(body.price)||body.price<=0)throw new HttpError(400,'Datos o permiso inválido.');
    const customerId=validId(membership?.customer_id||body.customerId);
    const changed=await service.db('retail_inventory?organization_id=eq.'+org+'&customer_id=eq.'+customerId+'&product_id=eq.'+validId(body.productId),{token,method:'PATCH',headers:{Prefer:'return=representation'},body:{quantity:body.quantity,price:body.price}});
    if(!changed.length)throw new HttpError(404,'Producto no encontrado.');return reply(200,{ok:true});
   }
   if(path==='retail/sale'&&req.method==='POST') {
    if(!can('retail.manage'))throw new HttpError(403,'No autorizado.');
    const id=await service.db('rpc/record_local_sale',{token,method:'POST',body:{org,customer_key:validId(membership?.customer_id||body.customerId),items:body.items,sale_key:validId(body.requestKey)}});return reply(201,{id});
   }
   if(path.startsWith('data/')&&req.method==='GET') {
    const table=path.slice(5),permission=resources[table];
    if(!permission||!can(permission))throw new HttpError(403,'No tienes permiso para consultar esta sección.');
    const offset=Math.max(0,Math.min(Number(url.searchParams.get('offset'))||0,100000));
    return reply(200,await service.db('rpc/workspace_data',{token,method:'POST',body:{org,resource:table,page_offset:Math.floor(offset),order_filter:url.searchParams.has('order')?validId(url.searchParams.get('order')):null}}));
   }
   if(path==='orders'&&req.method==='POST') {
    if(!can('orders.create'))throw new HttpError(403,'No puedes crear pedidos.');
    const tradeOrg=await service.db('rpc/resolve_trade_organization',{token,method:'POST',body:{workspace:org,client_key:validId(body.customerId),order_key:null}});
    const result=await service.db('rpc/create_order',{token,method:'POST',body:{org:tradeOrg,customer_key:validId(body.customerId),items:body.items,request_key:validId(body.requestKey)}});return reply(201,{id:result});
   }
   if(path==='orders/status'&&req.method==='POST') {
    const tradeOrg=await service.db('rpc/resolve_trade_organization',{token,method:'POST',body:{workspace:org,client_key:null,order_key:validId(body.id)}});
    const result=await service.db('rpc/transition_order',{token,method:'POST',body:{org:tradeOrg,order_key:validId(body.id),next_status:body.status}});return reply(200,{status:result});
   }
   if(path==='followups'&&req.method==='POST') {
    if(!can('followups.manage'))throw new HttpError(403,'No autorizado.');
    await service.db('followups',{token,method:'POST',body:{organization_id:org,customer_id:validId(body.customerId),seller_id:validId(membership?.seller_id||body.sellerId),note:text(body.note,1,2000),next_date:body.nextDate||null}});return reply(201,{ok:true});
   }
   if(path==='inventory'&&req.method==='PATCH') {
    if(!can('inventory.manage')||!Number.isInteger(body.quantity)||body.quantity<0)throw new HttpError(400,'Cantidad o permiso inválido.');
    const changed=await service.db('inventory?organization_id=eq.'+org+'&product_id=eq.'+validId(body.productId),{token,method:'PATCH',headers:{Prefer:'return=representation'},body:{quantity:body.quantity}});
    if(!changed.length)throw new HttpError(404,'Referencia no encontrada.');return reply(200,{ok:true});
   }
   throw new HttpError(404,'Ruta no encontrada.');
  } catch(error) { if(!error.status)console.error('SURTIVA API error:',error.name);reply(error.status||503,{error:error.status?error.message:'Servicio temporalmente no disponible.'}); }
 };
}
export default createHandler();

