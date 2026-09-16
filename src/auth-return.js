export function readAuthReturn(href) {
 const url=new URL(href),fragment=new URLSearchParams(url.hash.slice(1));
 const error=url.searchParams.get('error_code')||fragment.get('error_code')||url.searchParams.get('error')||fragment.get('error');
 const action=url.searchParams.get('auth');
 if(!error&&!url.searchParams.has('code')&&!['confirmed','recovery'].includes(action))return null;
 return {error, recovery:action==='recovery'};
}

export function authMessage(error) {
 const code=typeof error==='string'?error:error?.code;
 const messages={
  invalid_credentials:'Revisa tu correo y contraseña.',
  email_not_confirmed:'Verifica tu correo antes de ingresar. Puedes solicitar un nuevo enlace de confirmación.',
  otp_expired:'Este enlace ya no es válido. Si ya verificaste tu correo, ingresa con tu contraseña. Si no, solicita un nuevo enlace y abre el correo más reciente.',
  flow_state_expired:'El enlace venció. Solicita uno nuevo y ábrelo en el mismo navegador.',
  flow_state_not_found:'No se pudo completar este enlace. Si ya confirmaste tu correo, ingresa con tu contraseña; de lo contrario solicita otro enlace.',
  pkce_code_verifier_not_found:'Abre el enlace en el navegador donde lo solicitaste. Si ya confirmaste tu correo, puedes ingresar con tu contraseña.',
  bad_code_verifier:'Abre el enlace en el navegador donde lo solicitaste o solicita uno nuevo.',
  over_email_send_rate_limit:'Espera unos minutos antes de solicitar otro correo.',
  over_request_rate_limit:'Demasiados intentos. Intenta en unos minutos.',
  weak_password:'Usa una contraseña de al menos 12 caracteres.',
  same_password:'Elige una contraseña diferente.',
  signup_disabled:'El registro no está disponible en este momento.',
  email_address_not_authorized:'El servicio de correo aún no admite esta dirección. Contacta a la administración de Surtiva.',
 };
 return messages[code]||'No se pudo completar el acceso. Revisa los datos e intenta nuevamente.';
}

export function cleanAuthReturn(href,page) {
 const url=new URL(href);
 for(const key of ['auth','code','error','error_code','error_description','sb_flow_id'])url.searchParams.delete(key);
 url.hash=page;
 return url.pathname+url.search+url.hash;
}
