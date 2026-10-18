import {catalogId,createCatalogVariant,createCatalogRepertoire} from "../core/catalog-v1.mjs";
/**
 * MIDI HUD / Editor visual - operaciones puras sobre la biblioteca v2.
 * No altera hardware ni mezcla la configuracion de canal global con canciones.
 */
import {normalizeLibrary,validateLibrary} from "../core/engine-v1.mjs?v=20261018-catalog2";

const copy=x=>JSON.parse(JSON.stringify(x));
function requireThat(ok,message){if(!ok)throw Error("Editor MIDI HUD: "+message);}
function locate(items,id,label){
 const item=items.find(x=>x.id===id);
 requireThat(item,label+" desconocido: "+id);
 return item;
}
function nextId(db,prefix){
 if(db.catalogVersion===1)return catalogId(prefix);
 const used=new Set([...db.repertoires,...db.songs,...db.states].map(x=>x.id));
 let i=1;while(used.has(prefix+"-"+i))i++;
 return prefix+"-"+i;
}
function songIds(db,songId){return db.repertoires.filter(r=>r.songIds.includes(songId));}
export const CONTROL_BUTTONS=["A","B","C","D"];

/** Valida cada operacion como transaccion; el origen no se modifica si falla. */
export function editLibrary(original,fn){
 const db=normalizeLibrary(original);
 requireThat(typeof fn==="function","se esperaba una operacion");
 fn(db);
 validateLibrary(db);
 return db;
}
export function newSong(db,repertoireId,title="Nueva canción"){
 const rep=repertoireId==null&&db.catalogVersion===1?null:locate(db.repertoires,repertoireId,"repertorio");
 const id=nextId(db,"song");
 const sid=nextId(db,"state");
 db.songs.push({
   id,title,author:"",tono:null,tempoBpm:null,bank:null,leadSheet:null,
   displaySlots:Array.from({length:9},()=>({name:"—",sub:"Sin asignar"})),
   stateIds:[sid],initialStateId:sid
 });
 db.states.push({id:sid,songId:id,name:"Clean",gtPatch:null,displayIndex:0,indicators:[]});
 if(db.catalogVersion===1){const song=db.songs.find(s=>s.id===id);song.catalog={familyId:id,variant:"",archived:false,history:[]};song.midiBindings=[];}
 if(rep)rep.songIds.push(id);
 return id;
}
export function newRepertoire(db,name="Nuevo repertorio"){
 if(db.catalogVersion===1)return createCatalogRepertoire(db,name);
 const id=nextId(db,"repertoire");
 db.repertoires.push({id,name,songIds:[]});
 newSong(db,id);
 return id;
}
export function renameRepertoire(db,id,name){
 const rep=locate(db.repertoires,id,"repertorio");
 requireThat(typeof name==="string"&&name.trim(),"nombre vacío");
 rep.name=name.trim();
}
export function copySong(db,repertoireId,songId){
 if(db.catalogVersion===1){const id=createCatalogVariant(db,songId,{variant:(db.songs.find(s=>s.id===songId).catalog?.variant||"Versión")+" (copia)"});locate(db.repertoires,repertoireId,"repertorio").songIds.push(id);return id;}
 const rep=locate(db.repertoires,repertoireId,"repertorio");
 const original=locate(db.songs,songId,"canción");
 requireThat(rep.songIds.includes(songId),"la canción no pertenece a este repertorio");
 const id=nextId(db,"song");
 const newSongData=copy(original);
 newSongData.id=id;
 newSongData.title=original.title+" (copia)";
 newSongData.stateIds=[];
 for(const oldId of original.stateIds){
   const old=locate(db.states,oldId,"estado");
   const candidate=copy(old);
   candidate.id=nextId(db,"state");
   candidate.songId=id;
   db.states.push(candidate);
   newSongData.stateIds.push(candidate.id);
   if(oldId===original.initialStateId)newSongData.initialStateId=candidate.id;
 }
 db.songs.push(newSongData);
 rep.songIds.splice(rep.songIds.indexOf(songId)+1,0,id);
 return id;
}
function removeOrphanSong(db,songId){
 if(songIds(db,songId).length)return;
 const song=locate(db.songs,songId,"canción");
 const dead=new Set(song.stateIds);
 db.states=db.states.filter(s=>!dead.has(s.id));
 db.songs=db.songs.filter(s=>s.id!==songId);
 pruneActions(db,a=>(a.type==="ACTIVATE_STATE"&&dead.has(a.stateId))||
   (a.type==="SELECT_SONG"&&a.songId===songId));
 pruneOrphanIndicators(db);
}
function pruneActions(db,pred){
 for(const b of [...db.bindings,...db.songs.flatMap(s=>s.midiBindings||[])])b.actions=b.actions.filter(a=>!pred(a));
 db.bindings=db.bindings.filter(b=>b.actions.length);
}
function pruneOrphanIndicators(db){
 const known=new Set(db.states.flatMap(st=>(st.indicators||[]).map(x=>x.id)));
 pruneActions(db,a=>a.type==="SET_INDICATOR"&&!known.has(a.indicatorId));
}
export function deleteSong(db,repertoireId,songId){
 const rep=locate(db.repertoires,repertoireId,"repertorio");
 requireThat(rep.songIds.includes(songId),"canción no pertenece al repertorio");
 requireThat(rep.songIds.length>1||db.catalogVersion===1,"cada repertorio necesita al menos una canción");
 rep.songIds=rep.songIds.filter(id=>id!==songId);
 if(db.catalogVersion!==1)removeOrphanSong(db,songId);
 if(rep.entryNotes)delete rep.entryNotes[songId];
}
export function deleteRepertoire(db,repertoireId){
 requireThat(db.repertoires.length>1,"debe existir al menos un repertorio");
 const rep=locate(db.repertoires,repertoireId,"repertorio");
 db.repertoires=db.repertoires.filter(r=>r.id!==repertoireId);
 if(db.catalogVersion!==1)for(const id of rep.songIds)removeOrphanSong(db,id);
}
export function moveSong(db,repertoireId,songId,delta){
 const rep=locate(db.repertoires,repertoireId,"repertorio");
 const i=rep.songIds.indexOf(songId),j=i+delta;
 requireThat(i>=0,"canción no pertenece al repertorio");
 if(j<0||j>=rep.songIds.length)return false;
 [rep.songIds[i],rep.songIds[j]]=[rep.songIds[j],rep.songIds[i]];
 return true;
}
export function newState(db,songId,name="Nuevo estado"){
 const song=locate(db.songs,songId,"canción"),id=nextId(db,"state");
 db.states.push({id,songId,name,gtPatch:null,displayIndex:null,indicators:[]});
 song.stateIds.push(id);
 return id;
}
export function duplicateState(db,stateId){
 const st=locate(db.states,stateId,"estado"),song=locate(db.songs,st.songId,"canción");
 const candidate=copy(st),id=nextId(db,"state");
 candidate.id=id;candidate.name=st.name+" (copia)";
 // Las copias no ocupan automaticamente el mismo modulo visual.
 candidate.displayIndex=null;
 db.states.push(candidate);
 song.stateIds.splice(song.stateIds.indexOf(st.id)+1,0,id);
 return id;
}
export function deleteState(db,stateId){
 const st=locate(db.states,stateId,"estado"),song=locate(db.songs,st.songId,"canción");
 requireThat(song.stateIds.length>1,"la canción necesita al menos un estado");
 song.stateIds=song.stateIds.filter(id=>id!==stateId);
 if(song.initialStateId===stateId)song.initialStateId=song.stateIds[0];
 db.states=db.states.filter(s=>s.id!==stateId);
 pruneActions(db,a=>a.type==="ACTIVATE_STATE"&&a.stateId===stateId);
 pruneOrphanIndicators(db);
}
export function moveState(db,stateId,delta){
 const st=locate(db.states,stateId,"estado"),song=locate(db.songs,st.songId,"canción");
 const i=song.stateIds.indexOf(stateId),j=i+delta;
 if(j<0||j>=song.stateIds.length)return false;
 [song.stateIds[i],song.stateIds[j]]=[song.stateIds[j],song.stateIds[i]];
 return true;
}
export function setSlot(db,songId,position,name,sub){
 const song=locate(db.songs,songId,"canción");
 requireThat(Number.isInteger(position)&&position>=0&&position<9,"posición visual fuera de 1–9");
 requireThat(typeof name==="string"&&typeof sub==="string","etiquetas inválidas");
 song.displaySlots??=[];
 while(song.displaySlots.length<=position)song.displaySlots.push({name:"—",sub:"Sin asignar"});
 song.displaySlots[position]={name:name.trim()||"—",sub:sub.trim()||"Sin asignar"};
}
function lead(db,songId){
 const song=locate(db.songs,songId,"canción");
 if(!song.leadSheet)song.leadSheet={sections:[{letter:"A",label:"INTRO",bars:[["","","",""]]}]};
 return song.leadSheet;
}
export function addSection(db,songId){
 const sections=lead(db,songId).sections;
 requireThat(sections.length<4,"LIVE v0.3 admite hasta cuatro secciones");
 const letter="ABCD"[sections.length];
 sections.push({letter,label:"SECCIÓN",bars:[["","","",""]]});
 return sections.length-1;
}
export function removeSection(db,songId,index){
 const sections=lead(db,songId).sections;
 requireThat(sections.length>1,"debe existir al menos una sección");
 requireThat(index>=0&&index<sections.length,"sección inexistente");
 sections.splice(index,1);
 // Etiquetas independientes del nombre y letra de sección.
}
export function addBar(db,songId,index){
 const sections=lead(db,songId).sections,section=sections[index];
 requireThat(section,"sección inexistente");
 requireThat(section.bars.length<32,"máximo 32 compases por sección");
 section.bars.push(["","","",""]);
}
export function removeBar(db,songId,index,barIndex){
 const section=lead(db,songId).sections[index];
 requireThat(section,"sección inexistente");
 requireThat(section.bars.length>1,"la sección necesita al menos un compás");
 requireThat(barIndex>=0&&barIndex<section.bars.length,"compás desconocido");
 section.bars.splice(barIndex,1);
}
export function setBeat(db,songId,sectionIndex,barIndex,beatIndex,value){
 const section=lead(db,songId).sections[sectionIndex];
 requireThat(section&&section.bars[barIndex],"compás inexistente");
 requireThat(Number.isInteger(beatIndex)&&beatIndex>=0&&beatIndex<4,"pulso fuera de rango");
 requireThat(typeof value==="string"&&value.length<=30,"acorde demasiado largo");
 section.bars[barIndex][beatIndex]=value.trim();
}
export function setRepeatBar(db,songId,sectionIndex,barIndex,repeat){
 const section=lead(db,songId).sections[sectionIndex];
 requireThat(section&&section.bars[barIndex],"compás inexistente");
 section.bars[barIndex]=repeat?["/","","",""]:["","","",""];
}
function bindingList(db,songId){return songId&&db.songs.find(song=>song.id===songId)?.catalog?(db.songs.find(song=>song.id===songId).midiBindings??=[]):db.bindings;}
export function newBinding(db,cc,value,songId=null){
 requireThat(Number.isInteger(cc)&&cc>=0&&cc<128&&Number.isInteger(value)&&value>=0&&value<128,"CC y valor deben estar entre 0 y 127");
 const list=bindingList(db,songId),current=list.find(b=>b.cc===cc&&b.value===value);
 if(current)return current;
 const b={cc,value,actions:[]};
 list.push(b);
 return b;
}
export function setBindingActions(db,cc,value,actions,songId=null){
 requireThat(Array.isArray(actions)&&actions.length>0,"asignación sin acciones");
 const b=newBinding(db,cc,value,songId);
 b.actions=copy(actions);
}
export function deleteBinding(db,cc,value,songId=null){
 if(songId&&db.songs.find(song=>song.id===songId)?.catalog){newBinding(db,cc,value,songId).actions=[];return;}
 db.bindings=db.bindings.filter(b=>!(b.cc===cc&&b.value===value));
}
export function bindingFor(db,cc,value,songId=null){
 const scoped=songId?bindingList(db,songId).find(b=>b.cc===cc&&b.value===value):null;
 if(scoped)return scoped.actions.length?scoped:null;
 return db.bindings.find(b=>b.cc===cc&&b.value===value)||null;
}
export function chocolateMatrix(db,{startCC=20,value=127,songId=null}={}){
 requireThat(Number.isInteger(startCC)&&startCC>=0&&startCC<=96,"CC inicial no válido");
 requireThat(Number.isInteger(value)&&value>=0&&value<=127,"valor fuera de rango");
 return Array.from({length:8},(_,bank)=>Array.from({length:4},(_,button)=>{
  const cc=startCC+bank*4+button;
  return {bank:bank+1,button:CONTROL_BUTTONS[button],cc,value,binding:bindingFor(db,cc,value,songId)};
 }));
}
export function actionDescription(db,a){
 if(a.type==="ACTIVATE_STATE"){
  const st=db.states.find(s=>s.id===a.stateId);
  const so=db.songs.find(s=>s.id===st?.songId);
  return st&&so ? so.title+" · "+st.name : "Estado desconocido";
 }
 if(a.type==="SELECT_SONG")return "Canción: "+(db.songs.find(s=>s.id===a.songId)?.title||"desconocida");
 if(a.type==="SET_INDICATOR")return (a.active?"Encender ":"Apagar ")+a.indicatorId;
 return "Acción desconocida";
}
/** Avisos no bloqueantes del EDITOR: nunca reemplazan la ejecución determinista del motor. */
export function diagnostics(db){
 const issues=[];
 for(const b of db.bindings){
  const activated=b.actions.filter(a=>a.type==="ACTIVATE_STATE");
  if(activated.length>1)issues.push({kind:"warning",key:b.cc+":"+b.value,
    message:"CC "+b.cc+" · "+b.value+" selecciona "+activated.length+" estados; el último prevalecerá."});
  if(b.actions.some(a=>a.type==="SELECT_SONG")&&activated.length)
   issues.push({kind:"warning",key:b.cc+":"+b.value,message:"Este mensaje combina seleccionar canción con activar estado; revisa su orden."});
  for(const a of b.actions.filter(a=>a.type==="SET_INDICATOR")){
   if(!db.states.some(s=>s.indicators?.some(x=>x.id===a.indicatorId)))
    issues.push({kind:"warning",key:b.cc+":"+b.value,message:"Indicador "+a.indicatorId+" no existe en ningún estado."});
  }
 }
 for(const s of db.songs){
  const occupied=new Map();
  for(const id of s.stateIds){
   const st=db.states.find(x=>x.id===id);
   if(st?.displayIndex == null)continue;
   const before=occupied.get(st.displayIndex);
   if(before)issues.push({kind:"warning",message:s.title+": "+before+" y "+st.name+" usan el mismo módulo visual."});
   occupied.set(st.displayIndex,st.name);
  }
 }
 return issues;
}
