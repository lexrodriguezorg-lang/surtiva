// Original artwork, unchanged. CSS only frames the transparent canvas.
export const brand='<span class="brand-original"><img src="/brand/wordmark-original.png" alt="SURTIVA" width="2400" height="1600"></span>';
export function animateBrand({force=false}={}){
 if(document.querySelector('.brand-film'))return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,connection=navigator.connection;
 if(!force&&(reduced||connection?.saveData||/2g/.test(connection?.effectiveType||'')))return;
 try{if(!force&&sessionStorage.getItem('surtiva.film.seen.v1'))return;}catch{}
 if(!force&&location.hash&&location.hash!=='#portada'&&!location.pathname.startsWith('/c'))return;
 const overlay=document.createElement('div');overlay.className='brand-film';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','Bienvenido a SURTIVA');overlay.setAttribute('aria-modal','true');
 overlay.innerHTML='<video muted playsinline preload="auto" aria-label="Animación original de la marca SURTIVA"><source src="/brand/intro-original.mp4" type="video/mp4"></video><button type="button" class="brand-film-skip">Entrar <span aria-hidden="true">↗</span></button>';
 const previousFocus=document.activeElement,video=overlay.querySelector('video'),button=overlay.querySelector('button');
 document.body.append(overlay);document.documentElement.classList.add('brand-film-open');
 let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(loadTimeout);clearTimeout(hardTimeout);video.pause();overlay.classList.add('leaving');document.documentElement.classList.remove('brand-film-open');window.removeEventListener('hashchange',finish);document.removeEventListener('keydown',keys);setTimeout(()=>overlay.remove(),350);if(force&&previousFocus?.isConnected)previousFocus.focus();};
 const keys=e=>{if(e.key==='Escape'){e.preventDefault();finish();}if(e.key==='Tab'){e.preventDefault();button.focus();}};
 const loadTimeout=setTimeout(finish,3000),hardTimeout=setTimeout(finish,10000);
 video.muted=true;video.addEventListener('playing',()=>{clearTimeout(loadTimeout);try{sessionStorage.setItem('surtiva.film.seen.v1','1');}catch{}},{once:true});video.addEventListener('ended',finish,{once:true});video.addEventListener('error',finish,{once:true});
 button.addEventListener('click',finish);window.addEventListener('hashchange',finish,{once:true});document.addEventListener('keydown',keys);button.focus({preventScroll:true});
 video.play().catch(finish);
}
