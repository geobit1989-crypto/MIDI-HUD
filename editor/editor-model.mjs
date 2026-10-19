import {catalogId,createCatalogVariant,createCatalogRepertoire} from "../core/catalog-v1.mjs";
import {migrateLeadSheets} from '../core/lead-sheet-variants.mjs';
/**
 * MIDI HUD / Editor visual - operaciones puras sobre la biblioteca v2.
 * No altera hardware ni mezcla la configuracion de canal global con canciones.
 */
import {normalizeLibrary,validateLibrary} from "../core/engine-v1.mjs?v=20261016-patch2";
import {normalizeSlot} from "../core/module-visuals.mjs?v=20261016-overlays1";

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
export function newSong(db,repertoireId,title="Nueva canción",template="generic"){
 const rep=repertoireId==null&&db.catalogVersion===1?null:locate(db.repertoires,repertoireId,"repertorio");
 requireThat(["generic","sig"].includes(template),"plantilla desconocida");
 const id=nextId(db,"song");
 const named=template==="sig"?["Clean","Ambient","Drive","Solo"]:null;
 const sidList=[];
 const slots=Array.from({length:4},(_,i)=>({
   name:named?named[i]:"—",sub:named?"Sin configurar":"Sin asignar",kind:"control",stateMode:"auto",
   deviceTag:named?"GT":""}));
 for(let i=0;i<(named?4:1);i++){
  const stateId=nextId(db,"state");
  db.states.push({id:stateId,songId:id,name:named?named[i]:"Estado inicial",gtPatch:null,
   displayIndex:i,indicators:[]});
  sidList.push(stateId);
 }
 db.songs.push({
   id,title,tono:null,tempoBpm:null,bank:null,leadSheet:null,chordNotation:named?"americano":null,
   displaySlots:slots,stateIds:sidList,initialStateId:sidList[0]
 });
 if(db.catalogVersion===1){const song=db.songs.find(s=>s.id===id);song.catalog={familyId:id,variant:"",archived:false,history:[]};song.midiBindings=[];migrateLeadSheets(db);}
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
 if(rep.leadSheetIds)delete rep.leadSheetIds[songId];
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
 inheritModuleIndicators(db,song,id);
 return id;
}
export function setInitialState(db,songId,stateId){
 const song=locate(db.songs,songId,'canción'),state=locate(db.states,stateId,'estado');
 requireThat(state.songId===songId&&song.stateIds.includes(stateId),'el estado inicial no pertenece a la canción');
 song.initialStateId=stateId;
 return stateId;
}
/** Acción explícita: reutiliza el estado del módulo o crea uno sin mover módulos. */
export function ensureModuleState(db,songId,index){
 const song=locate(db.songs,songId,'canción'),slots=song.displaySlots||[];
 requireThat(Number.isInteger(index)&&index>=0&&index<slots.length,'selecciona un módulo de control');
 const existing=db.states.find(st=>st.songId===songId&&st.displayIndex===index);
 if(existing)return existing.id;
 requireThat(modulePurpose(db,songId,index)==='control','selecciona un estado musical o un módulo de control');
 const label=slots[index].name.trim(),name=label&&label!=='—'?label:'Estado inicial';
 const initial=db.states.find(st=>st.id===song.initialStateId);
 const reusable=initial&&song.stateIds.length===1&&initial.name==='Estado inicial'&&initial.displayIndex==null&&
  initial.gtPatch==null&&(initial.indicators||[]).every(ind=>!ind.active&&
   slots.some((slot,i)=>slot.indicatorId===ind.id&&ind.displayIndex===i))&&
  !db.bindings.some(b=>b.actions.some(a=>a.type==='ACTIVATE_STATE'&&a.stateId===initial.id));
 const id=reusable?initial.id:newState(db,songId,name);
 const state=db.states.find(st=>st.id===id);state.name=name;state.displayIndex=index;
 return id;
}
export function useModuleAsInitialState(db,songId,index){
 return setInitialState(db,songId,ensureModuleState(db,songId,index));
}
export function modulePurpose(db,songId,index){
 const slot=locate(db.songs,songId,'canción').displaySlots?.[index];
 if(slot?.kind==='expression')return 'expression';
 if(slot?.stateMode==='effect')return 'effect';
 if(slot?.stateMode==='manual')return 'utility';
 const states=db.states.filter(st=>st.songId===songId);
 if(slot?.stateMode!=='auto'&&!states.some(st=>st.displayIndex===index)&&
  states.some(st=>(st.indicators||[]).some(ind=>ind.displayIndex===index)))return 'utility';
 return 'control';
}
/** Efectos y expresiones comparten encendido por estado; no representan posición del pedal. */
export function moduleActivation(db,songId,index){
 const song=locate(db.songs,songId,'canción'),slot=song.displaySlots?.[index];
 if(!slot||!['effect','expression'].includes(modulePurpose(db,songId,index)))return null;
 const ids=new Set(slot.indicatorId?[slot.indicatorId]:[]);
 const rows=song.stateIds.map(stateId=>{
  const state=locate(db.states,stateId,'estado');
  const indicators=(state.indicators||[]).filter(ind=>ind.displayIndex===index);
  for(const ind of indicators)ids.add(ind.id);
  return {stateId,name:state.name,active:indicators.some(ind=>ind.active)};
 });
 return {ids:[...ids],rows};
}
function inheritModuleIndicators(db,song,stateId){
 const state=locate(db.states,stateId,'estado');
 (song.displaySlots||[]).forEach((slot,index)=>{
  if(!slot.indicatorId||!['effect','expression'].includes(modulePurpose(db,song.id,index)))return;
  state.indicators.push({id:slot.indicatorId,label:slot.name,active:false,displayIndex:index});
 });
}
export function ensureModuleActivation(db,songId,index){
 const config=moduleActivation(db,songId,index);
 requireThat(config,'selecciona un efecto o una expresión');
 const song=locate(db.songs,songId,'canción'),slot=song.displaySlots[index];
 if(!slot.indicatorId){
  const used=new Set(db.states.flatMap(st=>(st.indicators||[]).map(ind=>ind.id)));
  for(const other of db.songs)for(const item of other.displaySlots||[])if(item.indicatorId)used.add(item.indicatorId);
  for(const binding of db.bindings)for(const action of binding.actions)if(action.type==='SET_INDICATOR')used.add(action.indicatorId);
  let n=1;while(used.has('module-fx-'+n))n++;
  slot.indicatorId=config.ids[0]||'module-fx-'+n;
 }
 for(const stateId of song.stateIds){
  const state=locate(db.states,stateId,'estado');state.indicators??=[];
  if(state.indicators.some(ind=>ind.displayIndex===index))continue;
  const detached=state.indicators.find(ind=>ind.id===slot.indicatorId&&ind.displayIndex==null);
  if(detached)detached.displayIndex=index;
  else state.indicators.push({id:slot.indicatorId,label:slot.name,active:false,displayIndex:index});
 }
 return moduleActivation(db,songId,index);
}
export function setModuleActiveOnEntry(db,songId,index,stateId,active){
 const song=locate(db.songs,songId,'canción');
 requireThat(song.stateIds.includes(stateId),'el estado no pertenece a la canción');
 requireThat(typeof active==='boolean','encendido inválido');
 ensureModuleActivation(db,songId,index);
 for(const ind of locate(db.states,stateId,'estado').indicators)if(ind.displayIndex===index)ind.active=active;
}
export function moduleActivationActions(db,songId,index,active){
 requireThat(typeof active==='boolean','encendido inválido');
 return ensureModuleActivation(db,songId,index).ids.map(indicatorId=>({type:'SET_INDICATOR',indicatorId,active}));
}
/** Una sola creación para el módulo y su estado, con IDs estables para MIDI. */
export function addConfiguredModule(db,songId,purpose='control'){
 requireThat(['control','effect','expression','utility'].includes(purpose),'tipo de módulo inválido');
 const index=addModule(db,songId),song=locate(db.songs,songId,'canción'),slot=song.displaySlots[index];
 slot.kind=purpose==='expression'?'expression':'control';
 slot.stateMode=purpose==='control'?'auto':purpose==='effect'?'effect':'manual';
 slot.name=purpose==='control'?'Nuevo estado':purpose==='expression'?'Nueva expresión':purpose==='effect'?'Nuevo efecto':'Nuevo control';
 const stateId=purpose==='control'?ensureModuleState(db,songId,index):null;
 if(purpose==='effect'||purpose==='expression')ensureModuleActivation(db,songId,index);
 return {index,stateId};
}
export function renameModule(db,songId,index,name){
 const song=locate(db.songs,songId,'canción'),slot=song.displaySlots?.[index];
 requireThat(slot&&typeof name==='string'&&name.length<=80,'nombre de módulo inválido');
 const automatic=modulePurpose(db,songId,index)==='control';
 slot.name=name;
 const id=automatic?ensureModuleState(db,songId,index):db.states.find(st=>st.songId===songId&&st.displayIndex===index)?.id??null;
 if(id)db.states.find(st=>st.id===id).name=name;
 if(['effect','expression'].includes(modulePurpose(db,songId,index)))
  for(const state of db.states.filter(st=>st.songId===songId))
   for(const ind of state.indicators||[])if(ind.displayIndex===index)ind.label=name;
 return id;
}
export function setModulePurpose(db,songId,index,purpose){
 requireThat(['control','effect','expression','utility'].includes(purpose),'tipo de módulo inválido');
 const song=locate(db.songs,songId,'canción'),slot=song.displaySlots?.[index];
 requireThat(slot,'módulo inexistente');
 const previous=modulePurpose(db,songId,index);
 slot.kind=purpose==='expression'?'expression':'control';slot.stateMode=purpose==='control'?'auto':purpose==='effect'?'effect':'manual';
 const state=db.states.find(st=>st.songId===songId&&st.displayIndex===index);
 if(purpose==='control'){
  if(previous!=='control')
   for(const st of db.states.filter(st=>st.songId===songId))
    for(const ind of st.indicators||[])if(ind.displayIndex===index)ind.displayIndex=null;
  return ensureModuleState(db,songId,index);
 }
 const used=state&&(state.gtPatch!=null||(state.indicators||[]).some(ind=>ind.active||
  !song.displaySlots.some((item,i)=>item.indicatorId===ind.id&&ind.displayIndex===i))||
  db.bindings.some(b=>b.actions.some(a=>a.type==='ACTIVATE_STATE'&&a.stateId===state.id)));
 // Conservar los estados ya configurados o usados por MIDI. Solo retirar
 // el estado vacío creado automáticamente al cambiar el tipo del módulo.
 if(state&&!used){
  if(song.stateIds.length>1)deleteState(db,state.id);
  else{state.displayIndex=null;state.name='Estado inicial';}
 }
 if(!used&&(purpose==='effect'||purpose==='expression'))ensureModuleActivation(db,songId,index);
 return used?state.id:null;
}
function freeControlModule(db,song,preferred=null,blankOnly=false){
 const used=new Set(db.states.filter(st=>st.songId===song.id).flatMap(st=>[st.displayIndex,...(st.indicators||[]).map(ind=>ind.displayIndex)]).filter(Number.isInteger));
 const available=i=>Number.isInteger(i)&&i>=0&&i<(song.displaySlots||[]).length&&!used.has(i)&&
  modulePurpose(db,song.id,i)==='control'&&!song.displaySlots[i].hidden&&
  (!blankOnly||song.displaySlots[i].name==='—');
 if(available(preferred))return preferred;
 return (song.displaySlots||[]).findIndex((_,i)=>available(i));
}
export function newStateWithModule(db,songId,preferred=null){
 const song=locate(db.songs,songId,'canción');
 let index=freeControlModule(db,song,preferred);
 if(index<0)index=addModule(db,songId);
 const slot=normalizeSlot(song.displaySlots[index],index);
 const name=slot.name==='—'?'Nuevo estado':slot.name;
 const id=newState(db,songId,name);
 db.states.find(st=>st.id===id).displayIndex=index;
 song.displaySlots[index]={...song.displaySlots[index],...slot,name,stateMode:'auto'};
 return id;
}
export function duplicateStateWithModule(db,stateId){
 const source=locate(db.states,stateId,'estado'),song=locate(db.songs,source.songId,'canción');
 const appearance=source.displayIndex==null?null:song.displaySlots?.[source.displayIndex];
 let index=freeControlModule(db,song,null,true);
 if(index<0)index=addModule(db,song.id);
 const id=duplicateState(db,stateId),state=locate(db.states,id,'estado');
 state.displayIndex=index;
 song.displaySlots[index]={...normalizeSlot(appearance||song.displaySlots[index],source.displayIndex??index),name:state.name,kind:'control',stateMode:'auto',rowBreakBefore:false};
 return id;
}
export function assignStateModule(db,songId,stateId,index,{replace=false}={}){
 const song=locate(db.songs,songId,'canción'),state=locate(db.states,stateId,'estado');
 requireThat(state.songId===songId,'el estado no pertenece a la canción');
 requireThat(index===null||(Number.isInteger(index)&&index>=0&&index<(song.displaySlots||[]).length),'módulo inexistente');
 const occupant=index===null?null:db.states.find(st=>st.songId===songId&&st.displayIndex===index&&st.id!==stateId);
 requireThat(!occupant||replace,'el módulo ya tiene un estado asociado');
 if(occupant)occupant.displayIndex=null;
 state.displayIndex=index;
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
 requireThat(Number.isInteger(position)&&position>=0&&position<256,"posición visual fuera de rango");
 requireThat(typeof name==="string"&&typeof sub==="string","etiquetas inválidas");
 song.displaySlots??=[];
 while(song.displaySlots.length<=position)song.displaySlots.push({name:"—",sub:"Sin asignar"});
 song.displaySlots[position]={...song.displaySlots[position],name:name.trim()||"—",sub:sub.trim()||"Sin asignar"};
}
export function addModule(db,songId){
 const song=locate(db.songs,songId,'canción');
 song.displaySlots??=[];
 requireThat(song.displaySlots.length<256,'límite técnico de 256 módulos alcanzado');
 song.displaySlots.push({name:'—',sub:'Sin asignar',kind:'control'});
 return song.displaySlots.length-1;
}
function remapModuleReferences(db,songId,remap){
 for(const st of db.states.filter(st=>st.songId===songId)){
  if(st.displayIndex!=null)st.displayIndex=remap(st.displayIndex);
  for(const indicator of st.indicators||[]){
   if(indicator.displayIndex!=null)indicator.displayIndex=remap(indicator.displayIndex);
  }
 }
}
export function moveModule(db,songId,from,delta){
 const song=locate(db.songs,songId,'canción'),slots=song.displaySlots||[];
 requireThat(Number.isInteger(from)&&from>=0&&from<slots.length,'módulo inexistente');
 requireThat(delta===-1||delta===1,'dirección inválida');
 const to=from+delta;
 if(to<0||to>=slots.length)return from;
 for(let i=0;i<slots.length;i++)slots[i]={...slots[i],...normalizeSlot(slots[i],i)};
 [slots[from],slots[to]]=[slots[to],slots[from]];
 remapModuleReferences(db,songId,i=>i===from?to:i===to?from:i);
 return to;
}
export function removeModule(db,songId,index){
 const slots=locate(db.songs,songId,'canción').displaySlots||[];
 requireThat(Number.isInteger(index)&&index>=0&&index<slots.length,'módulo inexistente');
 for(let i=0;i<slots.length;i++)slots[i]={...slots[i],...normalizeSlot(slots[i],i)};
 slots.splice(index,1);
 remapModuleReferences(db,songId,i=>i===index?null:i>index?i-1:i);
 return Math.max(0,Math.min(index,slots.length-1));
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
 if(a.type==="SET_INDICATOR"){
  const indicator=db.states.flatMap(st=>st.indicators||[]).find(ind=>ind.id===a.indicatorId);
  return (a.active?"Encender ":"Apagar ")+(indicator?.label||a.indicatorId);
 }
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
