import {supabase} from './auth.js';
import {brand} from './brand.js';
import {esc} from './commerce-ui.js';
const labels={seller:'Vendedor',merchant:'Comercio',fulfillment_partner:'Aliado de cumplimiento'};
export function invitationFlow({api,root,token,onComplete}){
 let details;
 const page=(content)=>{root.innerHTML=`<header class="public-header auth-header"><a href="#portada" aria-label="SURTIVA, inicio">${brand}</a></header><main class="invitation-page"><section class="invitation-welcome"><span class="mk-eyebrow">TU LUGAR EN SURTIVA</span><h1>Ya estás invitado.</h1><p>${details?esc(details.organization)+' te invita como '+esc(labels[details.role])+'.':'Abriendo tu invitación…'}</p><div class="invite-product-mosaic"><img src="/assets/productos/j-6688-1a.webp" alt="Bloques didácticos"><img src="/assets/productos/bbr-dk-3565.webp" alt="Surtido de belleza"></div></section><section class="panel invitation-form">${content}<div class="form-feedback" role="status"></div></section></main>`;};
 const message=e=>{const box=root.querySelector('.form-feedback');if(box)box.textContent=e.message;};
 function completeForm(){page(`<h2>Hazlo tuyo, ${esc(details.name.split(' ')[0])}.</h2><p>${esc(details.email)}</p><form id="complete-invitation"><label>Tu nombre<input name="name" value="${esc(details.name)}" maxlength="100" autocomplete="name" required></label>${details.role==='merchant'?`<label>Nombre de tu negocio<input name="business" value="${esc(details.name)}" maxlength="120" autocomplete="organization" required></label>`:''}<details><summary>Crear una contraseña ahora (opcional)</summary><label>Contraseña<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128"></label><small>Puedes hacerlo después desde tu cuenta.</small></details><p class="scope-note">Puedes explorar el catálogo mientras Surtiva valida tu acceso para operar.</p><button class="btn primary">Guardar y ver catálogo ↗</button></form>`);}
 async function render(){
  page('');
  try{
   details=await api('invitation/open',{method:'POST',body:{action:'info',token:token()}});
   const client=await supabase();const {data}=await client.auth.getSession();
   if(data.session){
    const {data:verified,error}=await client.auth.getUser();if(error)throw error;
    if(verified.user.email.toLowerCase()===details.email.toLowerCase()){completeForm();return;}
    page(`<h2>Esta invitación es para ${esc(details.email)}</h2><p>Tienes otra cuenta abierta. Cierra esa sesión para continuar con la persona invitada.</p><button class="btn primary" data-invitation="switch">Cerrar mi sesión y continuar</button>`);return;
   }
   page(`<h2>Hola, ${esc(details.name)}.</h2><p>${details.requiresSignIn?'Tu correo ya tiene una cuenta. Entra para completar esta invitación.':'Completa tus datos y empieza a conocer el surtido.'}</p><p class="invitation-email">${esc(details.email)}</p><button class="btn primary" data-invitation="${details.requiresSignIn?'email':'enter'}">${details.requiresSignIn?'Enviarme un enlace para entrar':'Abrir mi invitación'} ↗</button>${details.requiresSignIn?'<a class="secondary-link" href="#ingresar">Entrar con mi contraseña</a>':'<small>Tu acceso para operar se habilita después de la revisión de Surtiva.</small>'}`);
  }catch(error){page('<h2>No pudimos abrir la invitación</h2><p>El enlace puede haber vencido o haberse utilizado. Ingresa con tu cuenta o pide una nueva invitación.</p><a class="btn primary" href="#ingresar">Ingresar</a>');message(error);}
 }
 async function click(button){
  const client=await supabase();button.disabled=true;
  try{
   if(button.dataset.invitation==='switch'){await client.auth.signOut({scope:'local'});await render();}
   if(button.dataset.invitation==='email'){
    const {error}=await client.auth.signInWithOtp({email:details.email,options:{shouldCreateUser:false,emailRedirectTo:location.origin+'/?invite='+encodeURIComponent(token())+'#unirme'}});if(error)throw Error('No pudimos enviar el correo. Intenta entrar con tu contraseña o solicita otro enlace a Surtiva.');
    page('<h2>Revisa tu correo</h2><p>Abre el enlace más reciente para volver aquí y completar tus datos.</p><a class="secondary-link" href="#ingresar">También puedes usar tu contraseña</a>');
   }
   if(button.dataset.invitation==='enter'){
    const result=await api('invitation/open',{method:'POST',body:{action:'exchange',token:token()}});
    if(result.requiresSignIn){await render();return;}
    const {error}=await client.auth.setSession(result.session);if(error)throw Error('No se pudo iniciar la sesión. Abre tu correo de invitación.');completeForm();
   }
  }catch(error){message(error);}finally{button.disabled=false;}
 }
 async function submit(form){
  const fields=Object.fromEntries(new FormData(form)),button=form.querySelector('button');button.disabled=true;
  try{
   if(fields.password&&fields.password.length<12)throw Error('Usa al menos 12 caracteres para la contraseña.');
   const client=await supabase();const {error}=await client.auth.updateUser({data:{name:fields.name},...(fields.password?{password:fields.password}:{})});if(error)throw Error('No pudimos guardar tus datos. Revisa la contraseña e intenta nuevamente.');
   await api('invitation/complete',{method:'POST',body:{token:token(),name:fields.name,business:fields.business}});
   await onComplete();
  }catch(error){message(error);}finally{button.disabled=false;}
 }
 return {render,click,submit};
}
