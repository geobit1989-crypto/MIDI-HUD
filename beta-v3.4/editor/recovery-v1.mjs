/** Recuperación conservadora de repertorios guardados en orígenes compatibles. */
import {normalizeLibrary,validateLibrary} from "../core/engine-v1.mjs";
const clone=x=>JSON.parse(JSON.stringify(x));
function newId(used,prefix){let n=1;while(used.has(`${prefix}-${n}`))n++;const id=`${prefix}-${n}`;used.add(id);return id;}
export const LEGACY_KEYS=["hudLibrary", "hudEditorLibrary", "hudLibraryV1Backup", "hudLibraryBackup", "hudEditorLibraryBackup"];
export function findRecoverable(storage,current){
 const keys=[...LEGACY_KEYS];
 try{for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key&&/^(hudLibrary|hudEditorLibrary)/i.test(key)&&!keys.includes(key)&&key!=="hudLibraryV1")keys.push(key);}}catch{}
 const found=[],seen=new Set();
 for(const key of keys){
  let raw;try{raw=storage.getItem(key);}catch{continue;}
  if(!raw)continue;
  let db;try{db=normalizeLibrary(JSON.parse(raw));validateLibrary(db);}catch{continue;}
  for(const rep of db.repertoires){
   const titles=rep.songIds.map(id=>db.songs.find(s=>s.id===id)?.title).filter(Boolean);
   const signature=JSON.stringify([rep.name,titles]);
   if(seen.has(signature))continue;
   seen.add(signature);
   // Ocultar únicamente los repertorios que ya son idénticos por nombre y canciones.
   const already=current.repertoires.some(x=>x.name===rep.name&&JSON.stringify(x.songIds.map(id=>current.songs.find(s=>s.id===id)?.title))===JSON.stringify(titles));
   if(!already)found.push({key,repertoire:clone(rep),library:db,titles,raw});
  }
 }
 return found;
}
export function mergeRecoveredRepertoire(current,source,sourceRepertoireId){
 const output=normalizeLibrary(current),original=normalizeLibrary(source);
 validateLibrary(output);validateLibrary(original);
 const rep=original.repertoires.find(r=>r.id===sourceRepertoireId);
 if(!rep)throw Error("No se encontró el repertorio anterior.");
 const used=new Set([...output.repertoires,...output.songs,...output.states].map(x=>x.id));
 const newRep=clone(rep);newRep.id=newId(used,"recovered-repertoire");
 if(output.repertoires.some(r=>r.name===newRep.name))newRep.name+=" (recuperado)";
 newRep.songIds=[];
 for(const songId of rep.songIds){
  const sourceSong=original.songs.find(x=>x.id===songId);
  if(!sourceSong)throw Error("Canción perdida en los datos anteriores.");
  const song=clone(sourceSong),originalStates=[...song.stateIds];
  song.id=newId(used,"recovered-song");song.stateIds=[];
  for(const stateId of originalStates){
   const src=original.states.find(x=>x.id===stateId);
   if(!src)throw Error("Estado musical no encontrado.");
   const st=clone(src);st.id=newId(used,"recovered-state");st.songId=song.id;
   song.stateIds.push(st.id);output.states.push(st);
   if(stateId===sourceSong.initialStateId)song.initialStateId=st.id;
  }
  output.songs.push(song);newRep.songIds.push(song.id);
 }
 output.repertoires.push(newRep);
 // No importar asignaciones MIDI globales: podrían pisar CC existentes.
 validateLibrary(output);
 return {library:output,repertoireId:newRep.id};
}
