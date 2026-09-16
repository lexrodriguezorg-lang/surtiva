export class HttpError extends Error {
 constructor(status,message) { super(message); this.status=status; }
}
export function config(env=process.env) {
 const url=env.SUPABASE_URL, key=env.SUPABASE_PUBLISHABLE_KEY;
 if(!url || !key) throw new HttpError(503,'El acceso está temporalmente en configuración. Intenta más tarde.');
 if(!url.startsWith('https://') && env.NODE_ENV!=='test') throw new HttpError(503,'Configuración de acceso inválida.');
 if(key.startsWith('sb_secret_')) throw new HttpError(503,'Se requiere una clave pública de Supabase.');
 if(key.split('.').length===3) {
  try { if(JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role!=='anon') throw Error(); }
  catch { throw new HttpError(503,'Se requiere una clave pública de Supabase.'); }
 }
 return {url:url.replace(/\/$/,''),key};
}
export function backend({env=process.env,fetcher=fetch}={}) {
 const {url,key}=config(env);
 async function request(path,{token,method='GET',body,headers={}}={}) {
  const response=await fetcher(url+path,{method,headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok) {
   const status=response.status===429?429:response.status===401?401:response.status>=500?503:400;
   throw new HttpError(status,status===429?'Demasiados intentos. Intenta más tarde.':status===401?'Tu sesión no es válida. Ingresa nuevamente.':status===503?'El servicio no está disponible temporalmente.':'No se pudo completar la operación. Verifica los datos y tus permisos.');
  }
  return data;
 }
 return {request,db:(table,options={})=>request('/rest/v1/'+table,options),auth:(path,options={})=>request('/auth/v1/'+path,options)};
}
