import {normalizeLibrary,validateLibrary,SCHEMA_VERSION} from "../core/engine-v1.mjs";
import {createLeadSheetEditor} from "./lead-sheet-ui.mjs";
import {
 editLibrary,newSong,newRepertoire,renameRepertoire,copySong,deleteSong,deleteRepertoire,moveSong,
 newState,duplicateState,deleteState,moveState,setSlot,addSection,removeSection,addBar,removeBar,
 setBeat,setRepeatBar,setBindingActions,deleteBinding,bindingFor,chocolateMatrix,
 actionDescription,diagnostics
} from "./editor-model.mjs";

const $=id=>document.getElementById(id),clone=x=>JSON.parse(JSON.stringify(x));
const KEY="hudLibraryV1",BACKUP="hudLibraryV1Backup",SOURCE="../config/midi-hud-data-v2.json";
let db=null,repId=null,songId=null,stateId=null,sectionIndex=0,tab="song";
let selectedCC=20,selectedValue=127;
const pendingEdits=new Map();
let saveTimer=null;
function queueAuto(change){
 const key=change.type+":"+change.id+(change.index==null?"":":"+change.index);
 pendingEdits.set(key,change);
 clearTimeout(saveTimer);
 $("saveStatus").textContent="Guardando…";
 $("saveStatus").style.color="#ffe8b6";
 saveTimer=setTimeout(()=>flushPendingEdits(),580);
}
function flushPendingEdits(){
 clearTimeout(saveTimer);saveTimer=null;
 if(!pendingEdits.size)return true;
 const edits=[...pendingEdits.values()];
 const ok=transact(data=>{
  for(const edit of edits){
   if(edit.type==="song"){
    const song=data.songs.find(s=>s.id===edit.id);
    if(!song)continue;
    Object.assign(song,edit.values);
   }else if(edit.type==="state"){
    const state=data.states.find(s=>s.id===edit.id);
    if(!state)continue;
    Object.assign(state,edit.values);
   }else if(edit.type==="module"){
    setSlot(data,edit.id,edit.index,edit.name,edit.sub);
   }
  }
 },"Cambios guardados automáticamente.",{quiet:true,autoFlush:true});
 if(ok)pendingEdits.clear();
 return !!ok;
}
function queueSongAuto(){
 const song=getSong();if(!song)return;
 const bpm=$("songBpm").value.trim();
 queueAuto({type:"song",id:song.id,values:{
  title:$("songTitle").value.trim(),
  tono:$("songTone").value.trim()||null,
  tempoBpm:bpm===""?null:Number(bpm),
  bank:$("songBank").value.trim()||null,
  initialStateId:$("songInitial").value
 }});
}
function queueStateAuto(){
 const state=getState();if(!state)return;
 queueAuto({type:"state",id:state.id,values:{
  name:$("stateName").value.trim(),
  displayIndex:$("stateSlot").value===""?null:Number($("stateSlot").value),
  gtPatch:$("statePatch").value===""?null:Number($("statePatch").value)
 }});
}

function getRep(){return db?.repertoires.find(r=>r.id===repId)||null;}
function getSong(){return db?.songs.find(s=>s.id===songId)||null;}
function getState(){return db?.states.find(s=>s.id===stateId)||null;}
function getCurrentBinding(){return bindingFor(db,selectedCC,selectedValue);}
function notice(message,error=false){
 const el=$("editorNotice");el.textContent=message;
 el.style.borderColor=error?"#ac6268":"#37667b";
 el.style.background=error?"#3c1d26":"#0f3446";
 $("saveStatus").textContent=error?"Revisar cambios":"Guardado local";
 $("saveStatus").style.color=error?"#ffd0cd":"#9fe6cc";
}
function confirmation(message){return window.confirm(message);}
function promptName(label,current){
 const value=window.prompt(label,current||"");
 return value===null?null:value.trim();
}
function selectRep(id){
 if(!flushPendingEdits())return;
 if(typeof leadComposer!=="undefined")leadComposer.saveNow();
 if(!db?.repertoires.some(r=>r.id===id))return;
 repId=id;const rep=getRep();
 if(!rep.songIds.includes(songId))songId=rep.songIds[0];
 stateId=getSong().stateIds[0];sectionIndex=0;render();
}
function selectSong(id){
 if(!flushPendingEdits())return;
 leadComposer.saveNow();
 if(!getRep().songIds.includes(id))return;
 songId=id;stateId=getSong().stateIds[0];sectionIndex=0;render();
}
function selectState(id){
 if(!flushPendingEdits())return;
 if(!getSong().stateIds.includes(id))return;
 stateId=id;render();
}
function reconcileSelection(){
 if(!db?.repertoires.some(r=>r.id===repId))repId=db.repertoires[0].id;
 if(!getRep().songIds.includes(songId))songId=getRep().songIds[0];
 if(!getSong().stateIds.includes(stateId))stateId=getSong().stateIds[0];
 if(sectionIndex<0)sectionIndex=0;
}
function transact(fn,success,{quiet=false,autoFlush=false}={}){
 if(!autoFlush&&!flushPendingEdits())return false;
 if(!db)return;
 const previous=clone(db),oldSelection=[repId,songId,stateId,sectionIndex];
 try{
  let result;
  const updated=editLibrary(db,draft=>{result=fn(draft);});
  updated.revision=(Number.isInteger(updated.revision)?updated.revision:0)+1;
  updated.updatedAt=new Date().toISOString();
  // Primero escribir el nuevo archivo; solo después el respaldo anterior.
  const serialized=JSON.stringify(updated);
  localStorage.setItem(KEY,serialized);
  localStorage.setItem(BACKUP,JSON.stringify(previous));
  db=updated;reconcileSelection();
  if(!quiet)render();else renderSidebar();
  notice(success||"Cambio guardado.");
  return true;
 }catch(err){
  [repId,songId,stateId,sectionIndex]=oldSelection;
  if(!quiet)render();
  notice("No se pudo guardar: "+err.message,true);
  return false;
 }
}
function replaceDb(next,msg){
 try{
  if(!flushPendingEdits())return;
  leadComposer.saveNow();
  const fixed=normalizeLibrary(next);validateLibrary(fixed);
  const previous=db?JSON.stringify(db):null;
  localStorage.setItem(KEY,JSON.stringify(fixed));
  if(previous)localStorage.setItem(BACKUP,previous);
  // Una importación explícita sustituye también posibles borradores viejos
  // de canciones que coincidan por ID. El respaldo conserva la biblioteca previa.
  for(const song of fixed.songs)localStorage.removeItem("hudLeadSheetDraft:"+song.id);
  leadComposer.reset();
  db=fixed;repId=db.repertoires[0].id;songId=getRep().songIds[0];
  stateId=getSong().stateIds[0];sectionIndex=0;
  render();notice(msg);
 }catch(e){notice("No se pudo importar: "+e.message,true);}
}
function el(name,text,cls){
 const node=document.createElement(name);
 if(text!==undefined)node.textContent=String(text);
 if(cls)node.className=cls;
 return node;
}
function button(text,cb,cls="",title=""){
 const b=el("button",text,cls);b.type="button";
 if(title)b.title=title;
 b.addEventListener("click",cb);return b;
}
function options(id,entries,selected){
 const field=$(id);
 field.replaceChildren(...entries.map(([value,label])=>new Option(label,String(value))));
 if(entries.some(([key])=>String(key)===String(selected)))field.value=String(selected);
}
function renderSidebar(){
 const rep=getRep(),song=getSong();
 options("repSelect",db.repertoires.map(r=>[r.id,r.name]),rep.id);
 $("songCounter").textContent=rep.songIds.length+" canción(es)";
 $("songList").replaceChildren();
 for(const [index,id] of rep.songIds.entries()){
  const s=db.songs.find(x=>x.id===id);
  const row=el("div",undefined,"song-row"+(id===song.id?" current":""));
  row.setAttribute("role","listitem");
  row.append(el("span",index+1,"song-num"));
  const selection=button(s.title,()=>selectSong(id));
  selection.setAttribute("aria-current",String(id===song.id));
  row.append(selection);
  const tone=el("small",s.tono||"—");
  tone.title="Tonalidad de la canción";
  row.append(tone);$("songList").append(row);
 }
 $("repRemove").disabled=db.repertoires.length<=1;
 $("songRemove").disabled=rep.songIds.length<=1;
 const index=rep.songIds.indexOf(song.id);
 $("songUp").disabled=index<=0;$("songDown").disabled=index>=rep.songIds.length-1;
 $("repHeading").textContent=rep.name;
 $("songHeading").textContent=song.title;
 $("songSummary").textContent=(song.tono||"Tonalidad pendiente")+" · "+
  (song.tempoBpm?String(song.tempoBpm)+" BPM":"BPM pendiente")+" · "+
  String(song.stateIds.length)+" estado(s) · "+(song.bank||"Banco pendiente");
}
function renderSong(){
 const s=getSong();
 $("songTitle").value=s.title;
 $("songTone").value=s.tono??"";
 $("songBpm").value=s.tempoBpm??"";
 $("songBank").value=s.bank??"";
 options("songInitial",s.stateIds.map(id=>[id,db.states.find(st=>st.id===id)?.name||id]),s.initialStateId);
}
function renderStates(){
 const s=getSong(),st=getState();
 $("stateList").replaceChildren();
 for(const id of s.stateIds){
  const item=db.states.find(x=>x.id===id);
  const b=button(item.name,()=>selectState(id),id===st.id?"active":"");
  b.setAttribute("aria-pressed",String(id===st.id));
  if(s.initialStateId===id)b.title="Estado inicial de la canción";
  $("stateList").append(b);
 }
 const index=s.stateIds.indexOf(st.id);
 $("stateUp").disabled=index===0;$("stateDown").disabled=index===s.stateIds.length-1;
 $("stateRemove").disabled=s.stateIds.length<=1;
 $("stateName").value=st.name;
 options("stateSlot",[["","Sin módulo"]].concat(Array.from({length:9},(_,i)=>[i,String(i+1)+" · "+(s.displaySlots?.[i]?.name||"—")])),
  st.displayIndex==null?"":st.displayIndex);
 $("statePatch").value=st.gtPatch??"";
 options("indicatorSlot",[["","Sin módulo"]].concat(Array.from({length:9},(_,i)=>[i,
   String(i+1)+" · "+(s.displaySlots?.[i]?.name||"—")])),"");
 const list=$("indicatorList");
 list.replaceChildren();
 if(!st.indicators?.length)list.append(el("p","Este estado no tiene indicadores definidos.","help"));
 for(const indicator of st.indicators||[]){
  const row=el("div",undefined,"action-row");
  row.append(el("span",(indicator.active?"● ":"○ ")+indicator.label+" ("+indicator.id+")"+
   (indicator.displayIndex==null?"":" · Módulo "+(indicator.displayIndex+1)),"name"));
  const remove=button("Eliminar",()=>{
   if(!confirmation("¿Eliminar el indicador? Las asignaciones que lo utilicen deberán revisarse."))return;
   transact(data=>{
    const record=data.states.find(x=>x.id===st.id);
    record.indicators=record.indicators.filter(x=>x.id!==indicator.id);
    // Suprime acciones SET_INDICATOR si ya no existe ningun indicador con ese id.
    if(!data.states.some(x=>x.indicators?.some(z=>z.id===indicator.id))){
     for(const b of data.bindings)b.actions=b.actions.filter(a=>
      !(a.type==="SET_INDICATOR"&&a.indicatorId===indicator.id));
     data.bindings=data.bindings.filter(b=>b.actions.length);
    }
   },"Indicador eliminado.");
  },"small danger");
  row.append(remove);list.append(row);
 }
}
function renderModules(){
 const s=getSong();const grid=$("moduleGrid");grid.replaceChildren();
 for(let i=0;i<9;i++){
  const slot=s.displaySlots?.[i]||{name:"—",sub:"Sin asignar"};
  const occupied=s.stateIds.map(id=>db.states.find(x=>x.id===id))
   .filter(st=>st?.displayIndex===i);
  const card=el("div",undefined,"module"+(occupied.length?" selected":""));
  card.append(el("div","MÓDULO "+(i+1)+(occupied.length?" · "+occupied.map(x=>x.name).join(", "):""),"module-index"));
  const nameLabel=el("label","Nombre");
  const nameInput=el("input");nameInput.value=slot.name;nameInput.maxLength=45;
  const subLabel=el("label","Descripción");
  const subInput=el("input");subInput.value=slot.sub;subInput.maxLength=75;
  nameLabel.append(nameInput);subLabel.append(subInput);
  card.append(nameLabel,subLabel);
  nameInput.addEventListener("input",()=>queueAuto({
   type:"module",id:s.id,index:i,name:nameInput.value,sub:subInput.value
  }));
  subInput.addEventListener("input",()=>queueAuto({
   type:"module",id:s.id,index:i,name:nameInput.value,sub:subInput.value
  }));
  grid.append(card);
 }
}
const leadComposer=createLeadSheetEditor({
 getSong:()=>getSong(),
 commit:(id,leadSheet)=>transact(data=>{
  const song=data.songs.find(s=>s.id===id);
  if(!song)throw Error("La canción ya no existe.");
  song.leadSheet=leadSheet;
 },"Lead sheet guardado automáticamente.",{quiet:true,autoFlush:true})
});
function renderSheet(){leadComposer.load(getSong());}
function currentCC(){
 const cc=Number($("midiCC").value),value=Number($("midiValue").value);
 if(!Number.isInteger(cc)||cc<0||cc>127||!Number.isInteger(value)||value<0||value>127)
  throw Error("El CC y su valor deben ser enteros entre 0 y 127.");
 return {cc,value};
}
function renderMatrix(){
 const grid=$("midiMatrix");grid.replaceChildren();
 const start=Number($("matrixStart").value),value=Number($("matrixValue").value);
 let rows;
 try{rows=chocolateMatrix(db,{startCC:start,value});}
 catch(e){grid.append(el("p",e.message,"warning"));return;}
 grid.append(el("span","","axis"));
 for(const c of ["A","B","C","D"])grid.append(el("span",c,"axis"));
 for(const cells of rows){
  grid.append(el("span",cells[0].bank,"axis"));
  for(const cell of cells){
   const selected=selectedCC===cell.cc&&selectedValue===cell.value;
   const css="cell"+(cell.binding?" assigned":"")+(selected?" picked":"");
   const b=button("",()=>{
    selectedCC=cell.cc;selectedValue=cell.value;
    $("midiCC").value=String(selectedCC);$("midiValue").value=String(selectedValue);
    renderMIDI();
   },css,"Banco "+cell.bank+" botón "+cell.button+" · CC "+cell.cc+" valor "+cell.value);
   b.append(el("strong",cell.bank+cell.button),el("span","CC "+cell.cc+(cell.binding?" · ●":"")));
   b.setAttribute("aria-pressed",String(selected));grid.append(b);
  }
 }
}
function actionTargetOptions(){
 const type=$("actionType").value;
 let opts=[];
 if(type==="ACTIVATE_STATE")
  opts=db.states.map(st=>[st.id,(db.songs.find(s=>s.id===st.songId)?.title||"")+
   " · "+st.name]);
 else if(type==="SELECT_SONG")
  opts=db.songs.map(song=>[song.id,song.title]);
 else{
  const ids=new Map();
  for(const st of db.states)for(const indicator of st.indicators||[]){
   if(!ids.has(indicator.id))ids.set(indicator.id,indicator.label);
  }
  opts=[...ids].map(([id,label])=>[id,label+" ("+id+")"]);
 }
 const old=$("actionTarget").value;
 options("actionTarget",opts,opts.some(([id])=>id===old)?old:opts[0]?.[0]);
 $("actionTargetWrap").hidden=!opts.length;
 $("actionActiveWrap").hidden=type!=="SET_INDICATOR";
 $("actionAdd").disabled=!opts.length;
}
function renderMIDI(){
 $("midiCC").value=String(selectedCC);$("midiValue").value=String(selectedValue);
 renderMatrix();
 actionTargetOptions();
 const b=getCurrentBinding(),root=$("midiActionList");root.replaceChildren();
 if(!b)root.append(el("p","Este mensaje no tiene acciones configuradas.","help"));
 else{
  b.actions.forEach((a,i)=>{
   const row=el("div",undefined,"action-row");
   row.append(el("span",(i+1)+". "+actionDescription(db,a),"name"));
   const controls=el("div",undefined,"action-actions");
   const up=button("↑",()=>moveAction(i,-1),"small");up.disabled=i===0;
   const down=button("↓",()=>moveAction(i,1),"small");down.disabled=i===b.actions.length-1;
   const del=button("Eliminar",()=>removeAction(i),"small danger");
   controls.append(up,down,del);row.append(controls);root.append(row);
  });
  const reset=button("Eliminar este mensaje completo",()=>{
   if(!confirmation("¿Eliminar CC "+b.cc+", valor "+b.value+" y todas sus acciones?"))return;
   transact(data=>deleteBinding(data,b.cc,b.value),"Mensaje MIDI eliminado.");
  },"small danger");
  root.append(reset);
 }
 const table=$("bindingsTable");table.replaceChildren();
 const bindings=[...db.bindings].sort((a,b)=>a.cc-b.cc||a.value-b.value);
 $("bindingCount").textContent=bindings.length+" mensaje(s)";
 if(!bindings.length){
  const tr=el("tr");const cell=el("td","Sin comandos configurados");
  cell.colSpan=3;tr.append(cell);table.append(tr);
 }
 for(const b of bindings){
  const tr=el("tr");
  const cc=el("td","CC "+b.cc+" / "+b.value);
  const labels=el("td",b.actions.map(a=>actionDescription(db,a)).join(" · "));
  const action=el("td");
  action.append(button("Editar",()=>{
   selectedCC=b.cc;selectedValue=b.value;renderMIDI();
   $("midiCC").focus();
  },"small"));
  tr.append(cc,labels,action);table.append(tr);
 }
 const area=$("midiWarnings");area.replaceChildren();
 const warns=diagnostics(db);
 if(!warns.length)area.append(el("p","No se han detectado conflictos en las asignaciones.","help"));
 else for(const warning of warns)area.append(el("div",warning.message,"warning"));
}
function moveAction(index,diff){
 const {cc,value}=currentCC();
 transact(data=>{
  const b=bindingFor(data,cc,value);
  if(!b)return;
  const j=index+diff;if(j<0||j>=b.actions.length)return;
  [b.actions[index],b.actions[j]]=[b.actions[j],b.actions[index]];
 },"Orden de ejecución actualizado.");
}
function removeAction(index){
 const {cc,value}=currentCC();
 transact(data=>{
  const b=bindingFor(data,cc,value);
  if(!b)return;
  b.actions.splice(index,1);
  if(!b.actions.length)deleteBinding(data,cc,value);
 },"Acción eliminada.");
}
function render(){
 if(!db)return;
 reconcileSelection();
 renderSidebar();renderSong();renderStates();renderModules();renderSheet();renderMIDI();
 for(const b of document.querySelectorAll("[data-tab]")){
  const current=b.dataset.tab===tab;
  b.classList.toggle("active",current);
  b.setAttribute("aria-selected",String(current));
 }
 for(const panel of document.querySelectorAll("[data-panel]"))panel.hidden=panel.dataset.panel!==tab;
 $("undo").disabled=!localStorage.getItem(BACKUP);
}
function setTab(id){
 if(!flushPendingEdits())return;
 leadComposer.saveNow();
 tab=id;render();
}
function register(){
 document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
 $("repSelect").onchange=e=>selectRep(e.target.value);
 $("repAdd").onclick=()=>{
  const name=promptName("Nombre del nuevo repertorio","Nuevo repertorio");
  if(name===null)return;if(!name){notice("El nombre no puede estar vacío.",true);return;}
  transact(data=>{repId=newRepertoire(data,name);songId=data.repertoires.find(r=>r.id===repId).songIds[0];stateId=data.songs.find(s=>s.id===songId).stateIds[0];},
   "Repertorio creado.");
 };
 $("repRename").onclick=()=>{
  const name=promptName("Renombrar repertorio",getRep().name);
  if(name===null)return;
  transact(data=>renameRepertoire(data,repId,name),"Repertorio renombrado.");
 };
 $("repRemove").onclick=()=>{
  if(!confirmation("¿Eliminar el repertorio y las canciones que no pertenezcan a otros repertorios?"))return;
  transact(data=>deleteRepertoire(data,repId),"Repertorio eliminado.");
 };
 $("songAdd").onclick=()=>transact(data=>{
  songId=newSong(data,repId);
  stateId=data.songs.find(s=>s.id===songId).stateIds[0];
  tab="song";sectionIndex=0;
 },"Canción creada.");
 $("songCopy").onclick=()=>transact(data=>{
  songId=copySong(data,repId,songId);
  stateId=data.songs.find(s=>s.id===songId).stateIds[0];
  tab="song";sectionIndex=0;
 },"Canción duplicada sin copiar sus mensajes MIDI.");
 $("songRemove").onclick=()=>{
  if(!confirmation("¿Eliminar esta canción del repertorio? También se eliminarán estados y asociaciones si no aparece en otro repertorio."))return;
  transact(data=>deleteSong(data,repId,songId),"Canción eliminada.");
 };
 $("songUp").onclick=()=>transact(data=>moveSong(data,repId,songId,-1),"Orden actualizado.");
 $("songDown").onclick=()=>transact(data=>moveSong(data,repId,songId,1),"Orden actualizado.");
 for(const id of ["songTitle","songTone","songBpm","songBank"])
   $(id).addEventListener("input",queueSongAuto);
 $("songInitial").addEventListener("change",queueSongAuto);
 for(const id of ["songTitle","songTone","songBpm","songBank"])
   $(id).addEventListener("blur",()=>flushPendingEdits());
 $("stateAdd").onclick=()=>transact(data=>{stateId=newState(data,songId);},"Estado creado.");
 $("stateCopy").onclick=()=>transact(data=>{stateId=duplicateState(data,stateId);},"Estado duplicado.");
 $("stateRemove").onclick=()=>{
  if(!confirmation("¿Eliminar este estado y sus asociaciones MIDI?"))return;
  transact(data=>deleteState(data,stateId),"Estado eliminado.");
 };
 $("stateUp").onclick=()=>transact(data=>moveState(data,stateId,-1),"Orden de estados actualizado.");
 $("stateDown").onclick=()=>transact(data=>moveState(data,stateId,1),"Orden de estados actualizado.");
 for(const id of ["stateName","statePatch"])
   $(id).addEventListener("input",queueStateAuto);
 $("stateSlot").addEventListener("change",queueStateAuto);
 for(const id of ["stateName","statePatch"])
   $(id).addEventListener("blur",()=>flushPendingEdits());
 $("indicatorAdd").onclick=()=>{
  const id=$("indicatorId").value.trim(),label=$("indicatorLabel").value.trim();
  if(!id||!label){notice("Escribe identificador y descripción del indicador.",true);return;}
  if(!/^[a-zA-Z][\w-]{0,49}$/.test(id)){notice("El identificador debe comenzar por una letra y contener solo letras, números, _ o -.",true);return;}
  transact(data=>{
   const st=data.states.find(x=>x.id===stateId);
   if(st.indicators.some(x=>x.id===id))throw Error("Identificador repetido dentro del estado.");
   st.indicators.push({id,label,active:$("indicatorActive").checked,
    displayIndex:$("indicatorSlot").value===""?null:Number($("indicatorSlot").value)});
  },"Indicador añadido.");
  $("indicatorId").value="";$("indicatorLabel").value="";
  $("indicatorActive").checked=false;$("indicatorSlot").value="";
 };
 $("matrixStart").onchange=()=>{renderMIDI();};
 $("matrixValue").onchange=()=>{renderMIDI();};
 $("midiCC").onchange=()=>{
  try{const {cc,value}=currentCC();selectedCC=cc;selectedValue=value;renderMIDI();}
  catch(e){notice(e.message,true);renderMIDI();}
 };
 $("midiValue").onchange=$("midiCC").onchange;
 $("actionType").onchange=actionTargetOptions;
 $("actionAdd").onclick=()=>{
  let pair;try{pair=currentCC();}catch(e){notice(e.message,true);return;}
  const kind=$("actionType").value,target=$("actionTarget").value;
  if(!target){notice("Selecciona un destino para esta acción.",true);return;}
  const a=kind==="ACTIVATE_STATE"?{type:kind,stateId:target}:
   kind==="SELECT_SONG"?{type:kind,songId:target}:
   {type:kind,indicatorId:target,active:$("actionActive").value==="true"};
  selectedCC=pair.cc;selectedValue=pair.value;
  transact(data=>{
   const b=bindingFor(data,pair.cc,pair.value);
   if(!b)setBindingActions(data,pair.cc,pair.value,[a]);
   else b.actions.push(a);
  },"Acción MIDI añadida.");
 };
 $("importBtn").onclick=()=>$("importFile").click();
 $("importFile").onchange=async event=>{
  const file=event.target.files?.[0];event.target.value="";
  if(!file)return;
  try{
   if(file.size>500000)throw Error("El archivo supera el máximo de 500 KB.");
   const candidate=normalizeLibrary(JSON.parse(await file.text()));
   validateLibrary(candidate);
   if(!confirmation("¿Reemplazar la biblioteca actual? Se conservará un respaldo local."))return;
   replaceDb(candidate,"Archivo importado correctamente.");
  }catch(err){notice("Importación rechazada: "+err.message,true);}
 };
 $("exportBtn").onclick=()=>{
  if(!db)return;
  const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),link=el("a");
  link.href=url;link.download="MIDI-HUD-editor-v2.json";
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  notice("Biblioteca exportada. Guarda el archivo como respaldo.");
 };
 $("undo").onclick=()=>{
  if(!flushPendingEdits())return;
  const raw=localStorage.getItem(BACKUP);if(!raw)return;
  if(!confirmation("¿Recuperar la versión anterior de la biblioteca?"))return;
  try{
   const previous=normalizeLibrary(JSON.parse(raw));validateLibrary(previous);
   const current=JSON.stringify(db);
   localStorage.setItem(KEY,JSON.stringify(previous));
   localStorage.setItem(BACKUP,current);
   localStorage.removeItem("hudLeadSheetDraft:"+songId);
   leadComposer.reset();
   db=previous;reconcileSelection();render();notice("Se restauró la biblioteca anterior.");
  }catch(e){notice("No se pudo restaurar: "+e.message,true);}
 };
}
async function initialize(){
 register();
 window.addEventListener("beforeunload",()=>{
  flushPendingEdits();
  leadComposer.saveNow();
 });
 let loaded=null,invalid=false;
 const saved=localStorage.getItem(KEY);
 if(saved)try{loaded=normalizeLibrary(JSON.parse(saved));validateLibrary(loaded);}
 catch(error){invalid=true;console.warn("Editor MIDI HUD: copia local inválida",error);}
 if(!loaded){
  const result=await fetch(SOURCE,{cache:"no-store"});
  if(!result.ok)throw Error("No se puede cargar el archivo de ejemplo.");
  loaded=normalizeLibrary(await result.json());
  validateLibrary(loaded);
 }
 db=loaded;repId=db.repertoires[0].id;songId=getRep().songIds[0];
 stateId=getSong().stateIds[0];
 render();
 notice(invalid?"Se cargó el ejemplo; tu copia local anterior es inválida y NO fue sobrescrita.":
  "Editor visual listo · Esquema "+SCHEMA_VERSION+(saved?" · Biblioteca local":" · Datos de ensayo"),invalid);
}
initialize().catch(error=>notice("No se pudo iniciar el editor: "+error.message,true));
