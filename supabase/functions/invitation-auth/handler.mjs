// Administrative credentials exist only in the Edge runtime. Never return or log them.
export function invitationHandler({url,serviceKey,publicKey,fetcher=fetch,site='https://surtiva.com.co'}){
 async function call(path,body,key=serviceKey,bearer=key){
  const response=await fetcher(url+path,{method:body===undefined?'GET':'POST',headers:{apikey:key,Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const e=Error('No se pudo completar la invitación.');e.status=response.status;e.code=data.error_code||data.code;throw e;}return data;
 }
 const rpc=(name,body,key=serviceKey,bearer=key)=>call('/rest/v1/rpc/'+name,body,key,bearer);
 return async request=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
  const reply=(data,status=200)=>Response.json(data,{status,headers});
  try{
   if(request.method!=='POST')return reply({error:'Método no permitido.'},405);
   const raw=await request.text();if(raw.length>4096)return reply({error:'Solicitud demasiado grande.'},413);
   const body=JSON.parse(raw);let secret=body.token;
   if(body.action==='create'){
    const bearer=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if(!bearer)return reply({error:'Ingresa para invitar.'},401);
    const user=await call('/auth/v1/user',undefined,publicKey,bearer);
    if(!user.email_confirmed_at)return reply({error:'Verifica tu correo.'},403);
    // Caller JWT + database permission checks select the tenant and role.
    const invitation=await rpc('create_invitation',{org:body.organizationId,recipient_email:body.email,recipient_name:body.name,requested_role:body.role},publicKey,bearer);
    secret=invitation.token;
    const details=await rpc('invitation_details',{secret});let created=false;
    try{
     const newUser=await call('/auth/v1/admin/users',{email:details.email,email_confirm:false,user_metadata:{name:details.name,organization_name:details.name,requested_role:details.role,invitation_token:secret}});
     await rpc('service_invitation',{operation:'bind',secret,payload:{userId:newUser.id}});created=true;
    }catch(error){if(!['email_exists','email_address_exists','user_already_exists'].includes(error.code))throw error;}
    const redirect=site+'/?invite='+encodeURIComponent(secret)+'#unirme';let delivery='accepted',deliveryReason=null;
    try{
     if(created)await call('/auth/v1/invite?redirect_to='+encodeURIComponent(redirect),{email:details.email});
     else await call('/auth/v1/otp?redirect_to='+encodeURIComponent(redirect),{email:details.email,create_user:false},publicKey);
    }catch(error){delivery='failed';deliveryReason=typeof error.code==='string'&&/^[a-z_]+$/.test(error.code)?error.code:'email_transport_error';}
    await rpc('service_invitation',{operation:'delivery',secret,payload:{status:delivery}});
    return reply({...invitation,delivery,deliveryReason,directAccess:created});
   }
   if(typeof secret!=='string'||!/^[a-f0-9-]{72}$/.test(secret))return reply({error:'Este enlace no está disponible.'},403);
   const details=await rpc('invitation_details',{secret});
   if(body.action==='info')return reply(details);
   if(body.action==='exchange'){
    // A manager cannot use an invitation to sign into a pre-existing account.
    if(details.requiresSignIn)return reply({requiresSignIn:true});
    const claim=await rpc('service_invitation',{operation:'claim',secret});
    try{
     const link=await call('/auth/v1/admin/generate_link',{type:'magiclink',email:claim.email});
     if(link.id!==claim.userId||!['magiclink','invite','signup'].includes(link.verification_type))throw Error('Identity mismatch');
     const session=await call('/auth/v1/verify',{token_hash:link.hashed_token,type:link.verification_type},publicKey);
     if(session.user?.id!==claim.userId||!session.access_token||!session.refresh_token)throw Error('Invalid session');
     return reply({session:{access_token:session.access_token,refresh_token:session.refresh_token}});
    }catch(error){await rpc('service_invitation',{operation:'release',secret,payload:{userId:claim.userId}}).catch(()=>{});throw error;}
   }
   return reply({error:'Operación no permitida.'},400);
  }catch(error){return reply({error:error.status===429?'Espera un momento antes de volver a intentar.':'No pudimos completar este enlace. Si ya tienes cuenta, ingresa para aceptar la invitación.'},error.status===429?429:400);}
 };
}
