import originals from './product-photos.json' with {type:'json'};
export function originalPhoto(path){return originals[path]?.path?'/'+originals[path].path:null;}
export function photoAttributes(path,sizes='(max-width: 680px) 94vw, (max-width: 1100px) 45vw, 380px'){
 const p=originals[path];return p?`srcset="/${path} 384w, /${p.path} ${p.width}w" sizes="${sizes}"`:'';
}
