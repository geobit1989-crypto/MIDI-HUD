import {normalizeLibrary,validateLibrary} from './engine-v1.mjs';
import {migrateCatalog} from './catalog-v1.mjs';

export const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
export function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
export function libraryContent(library){
 if(!library)return null;
 const next=clone(library);delete next.revision;delete next.updatedAt;return next;
}
export const sameLibrary=(a,b)=>canonical(libraryContent(a))===canonical(libraryContent(b));
export function checkedLibrary(value){const result=normalizeLibrary(value);validateLibrary(result);return result;}

// Un estado, sus indicadores y los módulos de su canción se fusionan como una
// unidad. Nunca se emparejan por posición, nombre ni fecha del dispositivo.
function units(library){
 const result=new Map();if(!library)return result;
 const db=checkedLibrary(library),{repertoires,songs,states,bindings,revision,updatedAt,...metadata}=db;
 result.set('metadata',metadata);result.set('bindings',bindings);
 result.set('repertoireOrder',repertoires.map(r=>r.id));
 result.set('songOrder',songs.map(s=>s.id));
 for(const rep of repertoires)result.set('repertoire:'+rep.id,rep);
 for(const song of songs){
  const item=clone(song);
  for(const entry of item.catalog?.history||[])result.set('history:'+JSON.stringify([song.id,entry.id]),{songId:song.id,entry});
  if(item.catalog)item.catalog.history=[];
  result.set('song:'+song.id,{song:item,states:states.filter(state=>state.songId===song.id)});
 }
 return result;
}
const equal=(a,b)=>canonical(a)===canonical(b);
function compose(values,local,remote){
 const db=clone(values.get('metadata'));
 const ordered=(prefix,orderKey)=>{
  const items=[...values].filter(([key,value])=>key.startsWith(prefix)&&value!==undefined);
  const order=values.get(orderKey)||[];
  items.sort(([a],[b])=>{
   const ia=order.indexOf(a.slice(prefix.length)),ib=order.indexOf(b.slice(prefix.length));
   return (ia<0?Infinity:ia)-(ib<0?Infinity:ib)||a.localeCompare(b);
  });return items.map(([,value])=>clone(value));
 };
 db.repertoires=ordered('repertoire:','repertoireOrder');
 const bundles=ordered('song:','songOrder');db.songs=bundles.map(x=>x.song);db.states=bundles.flatMap(x=>x.states);
 for(const song of db.songs)if(song.catalog)song.catalog.history=[...values].filter(([key,value])=>key.startsWith('history:')&&value?.songId===song.id).map(([,value])=>clone(value.entry));
 db.bindings=clone(values.get('bindings')||[]);
 db.revision=Math.max(local?.revision||0,remote?.revision||0)+1;db.updatedAt=new Date().toISOString();
 return checkedLibrary(db);
}
/** Conservador: canciones distintas se unen; una canción editada en ambos lados
 * requiere elección explícita. Si la mezcla rompe referencias, se conservan las
 * bibliotecas completas para que el usuario decida, sin reparar MIDI por inferencia. */
function preserveHistory(target,sources){
 if(!target)return target;
 for(const song of target.songs)if(song.catalog){
  const entries=new Map(song.catalog.history.map(entry=>[entry.id,entry]));
  for(const source of sources)for(const entry of source?.songs.find(item=>item.id===song.id)?.catalog?.history||[])if(!entries.has(entry.id))entries.set(entry.id,clone(entry));
  song.catalog.history=[...entries.values()];
 }
 return target;
}
export function mergeLibraries(base,local,remote,choice=null){
 if([base,local,remote].some(item=>item?.catalogVersion===1)){
  base=base?migrateCatalog(base):null;local=local?migrateCatalog(local):null;remote=remote?migrateCatalog(remote):null;
 }
 const finish=library=>preserveHistory(checkedLibrary(library),[base,local,remote]);
 if(!local)return {library:finish(remote),conflicts:[]};
 if(!remote)return {library:finish(local),conflicts:[]};
 if(sameLibrary(local,remote))return {library:finish(local),conflicts:[]};
 if(base&&sameLibrary(local,base))return {library:finish(remote),conflicts:[]};
 if(base&&sameLibrary(remote,base))return {library:finish(local),conflicts:[]};
 const b=units(base),l=units(local),r=units(remote),values=new Map(),conflicts=[];
 for(const key of new Set([...b.keys(),...l.keys(),...r.keys()])){
  const bv=b.get(key),lv=l.get(key),rv=r.get(key);
  if(key.startsWith('history:')&&(!lv||!rv))values.set(key,lv||rv||bv);
  else if(equal(lv,rv))values.set(key,lv);
  else if(equal(lv,bv))values.set(key,rv);
  else if(equal(rv,bv))values.set(key,lv);
  // El orden de listas puede completarse sin cambiar el orden ya elegido.
  else if(key.endsWith('Order'))values.set(key,[...new Set([...(lv||[]),...(rv||[])])]);
  else{
   const label=key.startsWith('song:')?(lv?.song.title||rv?.song.title):key.startsWith('repertoire:')?(lv?.name||rv?.name):key==='bindings'?'Asignaciones MIDI':'Datos de la biblioteca';
   conflicts.push({key,label});values.set(key,choice==='remote'?rv:lv);
  }
 }
 let library;
 try{library=compose(values,local,remote);}
 catch(error){
  return {library:choice?finish(choice==='remote'?remote:local):null,
   conflicts:[{key:'library',label:'Biblioteca y referencias entre canciones',reason:error.message}]};
 }
 return {library:conflicts.length&&!choice?null:library,conflicts};
}
