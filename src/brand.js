// Original artwork, unchanged. CSS only frames the transparent canvas.
export const brand='<span class="brand-original"><img src="/brand/wordmark-original.png" alt="SURTIVA" width="2400" height="1600"></span>';
export function animateBrand(){
 try {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,connection=navigator.connection;
  const auth=Object.keys(localStorage).some(k=>/^sb-.*-auth-token$/.test(k));
  if(reduced||connection?.saveData||/2g/.test(connection?.effectiveType||'')||auth||Date.now()-Number(localStorage.getItem('surtiva.brand.seen')||0)<86400000)return;
  localStorage.setItem('surtiva.brand.seen',String(Date.now()));
  const intro=document.createElement('div');intro.className='brand-welcome';intro.setAttribute('aria-hidden','true');intro.innerHTML=brand;
  document.body.append(intro);setTimeout(()=>intro.remove(),1700);
 }catch{/* Storage restrictions never block entry. */}
}
