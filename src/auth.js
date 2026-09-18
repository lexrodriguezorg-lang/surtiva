import { createClient } from '@supabase/supabase-js';
import {authMessage} from './auth-return.js';

let clientPromise;
export function supabase() {
 clientPromise ||= fetch('/api/config',{cache:'no-store'}).then(async response=>{
  const config=await response.json();
  if(!response.ok)throw new Error(config.error||'El acceso está en configuración.');
  if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url)||!config.publishableKey?.startsWith('sb_publishable_'))throw new Error('Configuración de acceso inválida.');
  // Admin invitations arrive with an implicit session, unlike our PKCE signup.
  // Validate that session with Auth before removing the callback credentials.
  const fragment=new URLSearchParams((location.hash||'').slice(1));
  const invitedSession=!!new URLSearchParams(location.search||'').get('invite')&&fragment.has('access_token')&&fragment.has('refresh_token');
  const client=createClient(config.url,config.publishableKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:!invitedSession}});
  if(invitedSession){const {error}=await client.auth.setSession({access_token:fragment.get('access_token'),refresh_token:fragment.get('refresh_token')});authError(error);}
  return client;
 }).catch(error=>{clientPromise=null;throw error;});
 return clientPromise;
}
function authError(error){
 if(!error)return;
 throw new Error(authMessage(error));
}
export async function authenticate(action,fields={}) {
 const client=await supabase();
 if(action==='login'){const {error}=await client.auth.signInWithPassword({email:fields.email,password:fields.password});authError(error);return {ok:true};}
 if(action==='register-owner'){
  await client.auth.signOut({scope:'local'});
  const {data,error}=await client.auth.signUp({email:fields.email,password:fields.password,options:{emailRedirectTo:location.origin+'/?auth=confirmed#ingresar',data:{name:fields.name}}});
  authError(error);if(data.session)await client.auth.signOut({scope:'local'});
  return {message:'Verifica tu correo para activar la administración maestra de Surtiva. Este acceso está reservado a la cuenta del propietario; no crea una cuenta de distribuidor.'};
 }
 if(action==='register'){
  if(!['distributor_admin','seller','merchant','fulfillment_partner'].includes(fields.role))throw Error('Selecciona un perfil válido.');
  await client.auth.signOut({scope:'local'});
  const {data,error}=await client.auth.signUp({email:fields.email,password:fields.password,options:{emailRedirectTo:location.origin+'/?auth=confirmed#ingresar',data:{name:fields.name,organization_name:fields.organization,requested_role:fields.role,...(fields.invitationToken?{invitation_token:fields.invitationToken}:{})}}});
  authError(error);if(data.session)await client.auth.signOut({scope:'local'});
  return {message:'Revisa tu correo para verificar la cuenta. Tu solicitud quedará pendiente de aprobación; registrarte aún no concede acceso.'};
 }
 if(action==='logout'){const {error}=await client.auth.signOut();authError(error);return {ok:true};}
 if(action==='refresh'){const {error}=await client.auth.refreshSession();authError(error);return {ok:true};}
 if(action==='resend'){
  const {error}=await client.auth.resend({type:'signup',email:fields.email,options:{emailRedirectTo:location.origin+'/?auth=confirmed#ingresar'}});authError(error);
  return {message:'Si tu cuenta aún necesita verificación, recibirás un nuevo correo. Abre el más reciente en este mismo navegador. Si ya confirmaste tu correo, ingresa con tu contraseña.'};
 }
 if(action==='recover'){const {error}=await client.auth.resetPasswordForEmail(fields.email.trim(),{redirectTo:location.origin+'/?auth=recovery#nueva-clave'});authError(error);return {message:'Si la cuenta existe, recibirás un correo de recuperación. Si contiene un código, introdúcelo aquí; si contiene un enlace, puedes abrirlo en este navegador.'};}
 if(action==='verify-recovery'){
  const token=String(fields.token||'').trim();
  if(!/^\d{6,10}$/.test(token))throw Error('Introduce el código numérico que recibiste por correo.');
  const {data,error}=await client.auth.verifyOtp({email:fields.email.trim(),token,type:'recovery'});
  if(error?.code==='otp_expired')throw Error('El código venció, ya se usó o no coincide. Solicita otro correo y utiliza únicamente el código más reciente.');
  authError(error);
  if(!data.session)throw Error('No se pudo verificar la recuperación. Solicita un nuevo código.');
  return {ok:true};
 }
 if(action==='password'){if(fields.password.length<12)throw Error('Usa al menos 12 caracteres.');const {error}=await client.auth.updateUser({password:fields.password});authError(error);return {ok:true};}
 throw Error('Acción no disponible.');
}
export async function accessToken(){const client=await supabase();const {data,error}=await client.auth.getSession();authError(error);return data.session?.access_token;}
