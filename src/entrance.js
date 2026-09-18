import {photoAttributes} from './product-photos.js';
import {brand,animateBrand} from './brand.js';
const collections=[
 {name:'Juguetería',image:'j-6628.webp',alt:'Carro a control remoto con giro de 360 grados',color:'toys',next:'h-dk-4143.webp'},
 {name:'Belleza',image:'bcm-dk-3585.webp',alt:'Organizador de maquillaje',color:'beauty',next:'j-6628.webp'},
 {name:'Hogar',image:'h-dk-4143.webp',alt:'Set de lonchera estampada con accesorios',color:'home',next:'bcm-dk-3585.webp'}
];
const profiles={
 merchant:{text:'Encuentra surtido para tu tienda. Arma tu pedido y sigue vendiendo.',cta:'Solicitar acceso'},
 seller:{text:'Lleva el catálogo contigo. Conecta con cada comercio y convierte la visita en un pedido.',cta:'Quiero vender con SURTIVA'},
 distributor_admin:{text:'Haz que tu catálogo llegue a más negocios. Tu equipo, tus productos, nuevas oportunidades.',cta:'Quiero sumar mi catálogo'}
};
const arrow='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg>';
export function entranceMarkup(){return `<div class="surtiva-entrance">
 <header class="entrance-header"><a class="entrance-logo" href="#portada" aria-label="SURTIVA, inicio">${brand}</a><a class="entrance-login" href="#ingresar">Ingresar ${arrow}</a></header>
 <main id="contenido" class="entrance-main">
  <section class="entrance-copy" aria-labelledby="entrance-title">
   <span class="entrance-kicker"><i></i> HAGAMOS CRECER TU NEGOCIO</span>
   <h1 id="entrance-title">Más surtido.<br><em>Más negocio.</em></h1>
   <div class="entrance-audience" aria-label="Encuentra tu lugar en SURTIVA">${[['merchant','Tengo un comercio'],['seller','Soy vendedor'],['distributor_admin','Soy distribuidor']].map(([role,label])=>`<button type="button" data-audience="${role}" aria-pressed="${role==='merchant'}">${label}</button>`).join('')}</div>
   <p class="entrance-invitation" aria-live="polite">${profiles.merchant.text}</p>
   <a class="entrance-action" href="?profile=merchant#solicitar"><span>Solicitar acceso</span>${arrow}</a>
  </section>
  <section class="entrance-showcase toys" aria-label="Una mirada al surtido de SURTIVA">
   <div class="showcase-orbit" aria-hidden="true"></div><span class="showcase-note">ENCUENTRA TU PRÓXIMO ÉXITO</span>
   <figure class="showcase-main"><img src="/assets/productos/${collections[0].image}" ${photoAttributes("assets/productos/"+collections[0].image,"(max-width: 680px) 85vw, 600px")} alt="${collections[0].alt}" fetchpriority="high" width="384" height="384"><figcaption><span>Juguetería</span><b>01 / 03</b></figcaption></figure>
   <figure class="showcase-detail" aria-hidden="true"><img src="/assets/productos/${collections[0].next}" alt="" width="384" height="384"><span>Y mucho más ↗</span></figure>
   <svg class="showcase-wave" viewBox="0 0 700 180" preserveAspectRatio="none" aria-hidden="true"><path d="M-30 158C170-30 300 240 730 30" fill="none" stroke="currentColor" stroke-width="42"/></svg>
   <div class="showcase-switches" aria-label="Explorar categorías">${collections.map((c,i)=>`<button data-collection="${i}" aria-pressed="${i===0}">${c.name}<span>${arrow}</span></button>`).join('')}</div>
  </section>
 </main>
 <footer class="entrance-footer"><span>Comercios · Vendedores · Distribuidores</span><button data-replay-brand aria-label="Volver a ver la animación de SURTIVA"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m9 6 9 6-9 6Z"/></svg>Conoce nuestra marca</button></footer>
</div>`;}
document.addEventListener('click',event=>{
 const profile=event.target.closest('[data-audience]');
 if(profile){const selected=profiles[profile.dataset.audience];document.querySelectorAll('[data-audience]').forEach(b=>b.setAttribute('aria-pressed',String(b===profile)));document.querySelector('.entrance-invitation').textContent=selected.text;const link=document.querySelector('.entrance-action');link.href='?profile='+profile.dataset.audience+'#solicitar';link.querySelector('span').textContent=selected.cta;}
 const collection=event.target.closest('[data-collection]');
 if(collection){const i=Number(collection.dataset.collection),c=collections[i],stage=document.querySelector('.entrance-showcase');stage.className='entrance-showcase '+c.color;const picture=stage.querySelector('.showcase-main img');picture.src='/assets/productos/'+c.image;picture.alt=c.alt;picture.removeAttribute('srcset');const attrs=photoAttributes('assets/productos/'+c.image,'(max-width: 680px) 85vw, 600px');if(attrs){const holder=document.createElement('div');holder.innerHTML='<img '+attrs+'>';picture.srcset=holder.firstChild.srcset;picture.sizes=holder.firstChild.sizes;}stage.querySelector('figcaption span').textContent=c.name;stage.querySelector('figcaption b').textContent=`0${i+1} / 03`;stage.querySelector('.showcase-detail img').src='/assets/productos/'+c.next;document.querySelectorAll('[data-collection]').forEach(b=>b.setAttribute('aria-pressed',String(b===collection)));}
 if(event.target.closest('[data-replay-brand]'))animateBrand({force:true});
});

setInterval(()=>{if(document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const stage=document.querySelector('.entrance-showcase');if(!stage||stage.matches(':hover,:focus-within'))return;const buttons=[...stage.querySelectorAll('[data-collection]')],current=buttons.findIndex(b=>b.getAttribute('aria-pressed')==='true');buttons[(current+1)%buttons.length]?.click();},7000);
