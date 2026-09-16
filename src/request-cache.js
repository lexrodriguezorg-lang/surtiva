// Per-tab, short-lived reads only. The API and RLS still authorize every network request.
export function createReadCache({ttl=30000,now=Date.now,max=80}={}) {
 const entries=new Map();let generation=0;
 return {
  clear(){generation++;entries.clear();},
  async read(key,load){
   let entry=entries.get(key);
   if(!entry||entry.until<=now()){
    const epoch=generation;
    entry={until:Infinity,promise:null};
    entry.promise=Promise.resolve().then(load).then(value=>{
     if(epoch===generation)entry.until=now()+ttl;
     return value;
    }).catch(error=>{if(entries.get(key)===entry)entries.delete(key);throw error;});
    if(entries.size>=max)entries.delete(entries.keys().next().value);
    entries.set(key,entry);
   }
   return structuredClone(await entry.promise);
  }
 };
}
