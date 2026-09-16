import { createClient } from '@supabase/supabase-js';

let clientPromise;
export function supabase() {
 clientPromise ||= fetch('/api/config',{cache:'no-store'}).then(async response=>{
  const config=await response.json();
  if(!response.ok)throw new Error(config.error||'El acceso está en configuración.');
  if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url)||!config.publishableKey?.startsWith('sb_publishable_'))throw new Error('Configuración de acceso inválida.');
  return createClient(config.url,config.publishableKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 }).catch(error=>{clientPromise=null;throw error;});
 return clientPromise;
}
function authError(error){
 if(!error)return;
 const messages={invalid_credentials:'Revisa tu correo y contraseña.',email_not_confirmed:'Verifica tu correo antes de ingresar.',over_email_send_rate_limit:'Espera unos minutos antes de solicitar otro correo.',over_request_rate_limit:'Demasiados intentos. Intenta en unos minutos.',weak_password:'Usa una contraseña de al menos 12 caracteres.',same_password:'Elige una contraseña diferente.',signup_disabled:'El registro no está disponible en este momento.'};
 throw new Error(messages[error.code]||'No se pudo completar el acceso. Revisa los datos e intenta nuevamente.');
}
export async function authenticate(action,fields={}) {
 const client=await supabase();
 if(action==='login'){const {error}=await client.auth.signInWithPassword({email:fields.email,password:fields.password});authError(error);return {ok:true};}
 if(action==='register'){
  if(!['distributor_admin','seller','merchant','fulfillment_partner'].includes(fields.role))throw Error('Selecciona un perfil válido.');
  const {error}=await client.auth.signUp({email:fields.email,password:fields.password,options:{emailRedirectTo:location.origin+'/?auth=confirmed#ingresar',data:{name:fields.name,organization_name:fields.organization,requested_role:fields.role,...(fields.invitationToken?{invitation_token:fields.invitationToken}:{})}}});
  authError(error);await client.auth.signOut({scope:'local'});
  return {message:'Revisa tu correo para verificar la cuenta. Tu solicitud quedará pendiente de aprobación; registrarte aún no concede acceso.'};
 }
 if(action==='logout'){const {error}=await client.auth.signOut();authError(error);return {ok:true};}
 if(action==='refresh'){const {error}=await client.auth.refreshSession();authError(error);return {ok:true};}
 if(action==='recover'){const {error}=await client.auth.resetPasswordForEmail(fields.email,{redirectTo:location.origin+'/?auth=recovery#nueva-clave'});authError(error);return {message:'Si la cuenta existe, recibirás un enlace para cambiar tu contraseña.'};}
 if(action==='password'){if(fields.password.length<12)throw Error('Usa al menos 12 caracteres.');const {error}=await client.auth.updateUser({password:fields.password});authError(error);return {ok:true};}
 throw Error('Acción no disponible.');
}
export async function accessToken(){const client=await supabase();const {data,error}=await client.auth.getSession();authError(error);return data.session?.access_token;}
