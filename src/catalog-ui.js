import {esc,safeImage,categoryStyle} from './commerce-ui.js';

export function categoryGallery(categories,selected='',mode='shop'){
 const action=mode==='workspace'?'data-action="category"':'data-shop="category"';
 return `<section class="category-browser ${selected?'compact':''}" aria-label="Comprar por categoría"><div class="category-browser-title"><h2>Compra por categoría</h2><span>${categories.length} mundos por descubrir</span></div><div class="category-gallery">${categories.map(c=>`<button class="category-photo ${categoryStyle(c.name)}" ${action} data-category="${esc(c.name)}" aria-pressed="${selected===c.name}"><span class="category-image"><img src="${safeImage(c.image)}" alt="" width="180" height="180" loading="lazy" decoding="async" data-product-image></span><span class="category-caption"><b>${esc(c.name)}</b><small>${Number(c.count)||0} productos <span aria-hidden="true">↗</span></small></span></button>`).join('')}</div></section>`;
}

// Missing photographs never remain as an endless blank or broken-image icon.
export function installImageRecovery(){
 document.addEventListener('error',event=>{
  const img=event.target;if(!(img instanceof HTMLImageElement)||!img.hasAttribute('data-product-image'))return;
  img.hidden=true;const note=document.createElement('span');note.className='photo-unavailable';note.textContent='Fotografía no disponible';img.after(note);
 },true);
}
