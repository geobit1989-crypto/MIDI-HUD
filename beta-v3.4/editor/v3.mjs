import {scanNotation} from "./chord-notation.mjs";
import {prepareLeadSheetSave,convertLeadSheetDraft} from "./sheet-save.mjs";
import {LIBRARY_KEY,BACKUP_KEY,readLibrarySource,saveLibrary,replaceLibrary} from "../core/library-storage.mjs?v=20261016-editor-audit1";
import {normalizeLibrary,validateLibrary} from "../core/engine-v1.mjs?v=20261016-patch2";
import {resolveLiveSelection} from "../core/live-selection-v34.mjs?v=20261016-repertoires1";
import {createLibraryTransferUrl} from "../core/library-transfer-v34.mjs?v=20261016-transfer1";
import {MODULE_COLORS,MODULE_ICONS,normalizeSlot,resolveModuleVisual} from "../core/module-visuals.mjs?v=20261016-overlays1";
import {parseLeadSheetText,formatLeadSheetText} from "./lead-sheet-text.mjs";
import {findRecoverable,mergeRecoveredRepertoire} from "./recovery-v1.mjs?v=20261016-patch2";
import {
 newSong,newRepertoire,renameRepertoire,copySong,deleteSong,deleteRepertoire,moveSong,
 newState,duplicateState,deleteState,moveState,deleteBinding,bindingFor,setBindingActions,
 chocolateMatrix,actionDescription,diagnostics,addModule,moveModule,removeModule,
 newStateWithModule,duplicateStateWithModule,assignStateModule,setInitialState,useModuleAsInitialState,ensureModuleState,
 addConfiguredModule,renameModule,setModulePurpose,modulePurpose,
 moduleActivation,setModuleActiveOnEntry,moduleActivationActions
} from "./editor-model.mjs?v=20261016-overlays1";

/**
 * Editor MIDI HUD v3
 * - Cuatro secciones: Canción, Estados, Lead sheet y MIDI.
 * - Una copia de trabajo local en memoria. Nada escrito por tecleo.
 * - Un botón "Guardar" por sección valida y persiste la copia completa.
 * - Color e icono se configuran en Estados junto al módulo asociado.
 * - Compatibilidad con la misma clave y biblioteca del editor v2.
 */
const $=id=>document.getElementById(id);
const copy=x=>JSON.parse(JSON.stringify(x));
const STORAGE=LIBRARY_KEY,BACKUP=BACKUP_KEY,SOURCE="../config/midi-hud-data-v2.json";
const SECTIONS=["song","states","sheet","midi"];
const LABELS={song:"Canción",states:"Estados",sheet:"Lead sheet",midi:"MIDI"};
let committed=null,working=null,activeRep=null,activeSong=null,activeState=null;
let activeModule=0,activeTab="song",hasDraft=false,cc=20,value=127;
let leadSource="",leadParse=null;
let saving=false;
const make=(tag,text,klass)=>{
 const node=document.createElement(tag);
 if(text!==undefined)node.textContent=String(text);
 if(klass)node.className=klass;
 return node;
};
const button=(text,callback,klass="")=>{
 const btn=make("button",text,klass);
 btn.type="button";btn.onclick=callback;return btn;
};
function entries(id,options,current){
 const element=typeof id==="string"?$(id):id;
 element.replaceChildren(...options.map(([key,label])=>new Option(label,String(key))));
 if(options.some(([key])=>String(key)===String(current)))element.value=String(current);
}
function currentRep(){return working.repertoires.find(x=>x.id===activeRep);}
function currentSong(){return working.songs.find(x=>x.id===activeSong);}
function currentState(){return working.states.find(x=>x.id===activeState);}
function stateSelectionText(st=currentState()){
 if(Number.isInteger(activeModule)&&['effect','expression'].includes(modulePurpose(working,activeSong,activeModule)))
  return st?'Este módulo conserva una asociación musical anterior. Puedes revisarla en Asociaciones avanzadas.':'Este módulo se suma al estado musical activo. Configura abajo su encendido al entrar en cada estado.';
 if(st)return st.displayIndex==null?'Estado sin módulo visible. Puedes asignarle uno en las opciones avanzadas.':'El nombre se actualiza en el módulo y en su estado musical.';
 if(Number.isInteger(activeModule)&&currentSong().displaySlots?.[activeModule])
  return modulePurpose(working,activeSong,activeModule)==='control'?'Escribe el nombre; el estado se crea y se vincula automáticamente.':'Este módulo funciona sin crear un estado musical.';
 return 'Selecciona un estado musical o un módulo para editarlo.';
}
function renderInitialState(){
 const song=currentSong(),st=currentState(),initial=working.states.find(state=>state.id===song.initialStateId);
 $("statesInitialStatus").textContent='Estado inicial de la canción: '+initial.name;
 const action=$("stateMakeInitial"),slot=song.displaySlots?.[activeModule];
 const musical=!Number.isInteger(activeModule)||!slot||modulePurpose(working,activeSong,activeModule)==='control';
 action.disabled=!musical||(st?st.id===song.initialStateId:!slot);
 action.textContent=st?.id===song.initialStateId?'Ya es el estado inicial':'Usar como inicial';
}
function makeSelectionInitial(){
 if($('stateMakeInitial').disabled)return;
 const st=currentState();
 if(st?.id===currentSong().initialStateId)return;
 try{
  const next=copy(working);
  const id=st?setInitialState(next,activeSong,st.id):useModuleAsInitialState(next,activeSong,activeModule);
  working=next;activeState=id;activeModule=currentState().displayIndex??null;
  dirty();renderStates();renderSong();
  notice('«'+currentState().name+'» será el estado inicial. Pulsa Guardar en Estados.');
 }catch(error){notice(error.message,true);}
}
function createSelectedModuleState(){
 try{
  const next=copy(working),id=ensureModuleState(next,activeSong,activeModule);
  working=next;activeState=id;
  dirty();renderStates();renderSong();
 }catch(error){renderStates();notice(error.message,true);}
}
function currentSlot(i=activeModule){return currentSong().displaySlots?.[i]||{};}
function linkedState(i=activeModule){
 if(!Number.isInteger(i))return null;
 return working.states.find(x=>x.songId===activeSong&&x.displayIndex===i)||null;
}
function notice(message,error=false){
 $("editorNotice").textContent=message;
 $("editorNotice").style.background=error?"#3e1b26":"#0f3446";
 $("editorNotice").style.borderColor=error?"#a86167":"#37667b";
 syncStatus(error);
}
function syncStatus(error=false){
 $("saveStatus").textContent=error?"Revisar datos":hasDraft?"Sin guardar":"Guardado";
 $("saveStatus").style.color=error?"#ffb2ad":hasDraft?"#ffd38c":"#9fe6cc";
 for(const tab of SECTIONS){
  const label=$(tab+"Dirty"),btn=$(tab+"Save");
  if(label){
   label.textContent=hasDraft&&tab===activeTab?"Cambios pendientes":"Sin cambios pendientes";
   label.classList.toggle("pending",hasDraft&&tab===activeTab);
  }
  if(btn)btn.disabled=saving||!(hasDraft&&tab===activeTab);
 }
}
function dirty(){
 hasDraft=true;syncStatus();
 $("editorNotice").textContent="Cambios pendientes. Pulsa «Guardar» en "+LABELS[activeTab]+".";
}
function selected(){
 if(!working.repertoires.some(x=>x.id===activeRep))activeRep=working.repertoires[0].id;
 if(!currentRep().songIds.includes(activeSong))activeSong=currentRep().songIds[0];
 if(activeState!==null&&!currentSong().stateIds.includes(activeState))activeState=currentSong().initialStateId;
 if(currentState())activeModule=currentState().displayIndex??null;
 else if(activeModule!==null&&(!Number.isInteger(activeModule)||activeModule<0||activeModule>=(currentSong().displaySlots?.length||0)))activeModule=null;
}
function discard(){
 working=copy(committed);hasDraft=false;
 selected();
 leadSource=formatLeadSheetText(currentSong().leadSheet);
}
function allowLeaving(){
 if(!hasDraft)return true;
 if(!window.confirm("Hay cambios sin guardar en «"+LABELS[activeTab]+"». ¿Descartarlos y continuar?"))return false;
 discard();return true;
}
function updateTab(tab){
 if(tab===activeTab)return;
 if(!allowLeaving())return;
 activeTab=tab;render();
}
function toggleLibrary(force){
 const sidebar=$("editorSidebar"),toggle=$("libraryToggle");
 const open=force===undefined?!sidebar.classList.contains("is-open"):!!force;
 sidebar.classList.toggle("is-open",open);
 sidebar.toggleAttribute("inert",!open);
 sidebar.setAttribute("aria-hidden",String(!open));
 $("libraryBackdrop").hidden=!open;
 toggle.setAttribute("aria-expanded",String(open));
 toggle.textContent=open?"Cerrar biblioteca":"Biblioteca";
 if(open)$("libraryClose").focus();
 else if(sidebar.contains(document.activeElement))toggle.focus();
}
function useSong(id){
 if(!currentRep().songIds.includes(id)||!allowLeaving())return;
 activeSong=id;activeState=currentSong().initialStateId;
 activeModule=currentState().displayIndex??null;
 leadSource=formatLeadSheetText(currentSong().leadSheet);toggleLibrary(false);render();
}
function useRepertoire(id){
 if(!working.repertoires.some(x=>x.id===id)||!allowLeaving()){
  $("repSelect").value=activeRep;return;
 }
 activeRep=id;activeSong=currentRep().songIds[0];
 activeState=currentSong().initialStateId;
 activeModule=currentState().displayIndex??null;
 leadSource=formatLeadSheetText(currentSong().leadSheet);toggleLibrary(false);render();
}
function persistLibrary(next,message){
 const written=saveLibrary(localStorage,next,committed);
 committed=written;working=copy(written);hasDraft=false;selected();
 leadSource=formatLeadSheetText(currentSong().leadSheet);
 render();notice(message);
}
function showMidiLink(link){
 const dialog=make('dialog');
 dialog.style.cssText='width:min(620px,calc(100vw - 24px));background:#112638;color:#fff;border:1px solid #5b879d;border-radius:12px;padding:20px';
 const title=make('h2','Abrir en el navegador MIDI');
 const help=make('p','Copia este enlace y pégalo en la barra de direcciones del navegador MIDI. Se cargarán tus repertorios y asignaciones, sin gestionar archivos JSON.');
 const field=make('textarea');field.value=link;field.readOnly=true;field.setAttribute('aria-label','Enlace con una copia de la biblioteca');
 const status=make('p','El enlace lleva una copia de lo guardado ahora. Después puedes editar y usar LIVE dentro del navegador MIDI.','help');status.setAttribute('role','status');
 const actions=make('div',undefined,'ctrlrow');
 actions.append(button('Copiar enlace',async()=>{
  try{await navigator.clipboard.writeText(link);status.textContent='Enlace copiado. Pégalo en el navegador MIDI.';}
  catch{field.focus();field.select();status.textContent='Selecciona y copia el enlace del campo.';}
 },'primary'));
 if(typeof navigator.share==='function')actions.append(button('Compartir enlace',async()=>{
  try{await navigator.share({title:'MIDI HUD',url:link});}
  catch(error){if(error.name!=='AbortError')status.textContent='Puedes usar Copiar enlace.';}
 }));
 actions.append(button('Cerrar',()=>dialog.close()));
 dialog.append(title,help,field,status,actions);document.body.append(dialog);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
function awaitNotationChoice(){
 return new Promise(resolve=>{
  const dialog=document.createElement("dialog");
  dialog.setAttribute("aria-label","Seleccionar cifrado");
  dialog.style.cssText="background:#10283b;color:white;border:1px solid #6b91a6;border-radius:14px;padding:24px;max-width:90vw";
  const heading=make("h2","¿Qué sistema quieres usar?");
  const help=make("p","Se convertirán todos los acordes antes de guardar.");
  const actions=make("div");actions.style.cssText="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap";
  let finished=false;
  const finish=value=>{if(finished)return;finished=true;dialog.close();dialog.remove();resolve(value);};
  actions.append(button("Latino",()=>finish("latino")),button("Americano",()=>finish("americano")));
  dialog.append(heading,help,actions);document.body.append(dialog);
  dialog.addEventListener("cancel",event=>{event.preventDefault();finish(null);},{once:true});
  dialog.addEventListener("close",()=>finish(null),{once:true});
  dialog.addEventListener("click",event=>{
   if(event.target!==dialog)return;
   const r=dialog.getBoundingClientRect();
   if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)finish(null);
  });
  dialog.showModal();
 });
}
async function save(){
 if(!hasDraft||saving)return;
 let failed=false;
 saving=true;syncStatus();
 try{
  const next=copy(working),song=next.songs.find(s=>s.id===activeSong);
  if(activeTab==="sheet"){
   if(!leadSource.trim()&&song.leadSheet&&!window.confirm("¿Eliminar la partitura de esta canción?"))return;
   const prepared=await prepareLeadSheetSave(leadSource,{
    preferredNotation:song.chordNotation,chooseNotation:awaitNotationChoice
   });
   if(!prepared)return;
   Object.assign(song,prepared);
  }
  persistLibrary(next,"Cambios guardados en «"+LABELS[activeTab]+"». Actualiza LIVE para verlos.");
 }catch(error){failed=true;notice("No se guardó: "+error.message,true);}
 finally{saving=false;syncStatus(failed);}
}
function immediate(action,message){
 if(!allowLeaving())return;
 try{
  const next=copy(committed);
  const result=action(next);
  persistLibrary(next,message);
  return result;
 }catch(e){
  working=copy(committed);selected();render();
  notice("No se completó: "+e.message,true);
 }
}
function sidebar(){
 entries("repSelect",working.repertoires.map(x=>[x.id,x.name]),activeRep);
 const root=$("songList");root.replaceChildren();
 const ids=currentRep().songIds;
 ids.forEach((id,index)=>{
  const s=working.songs.find(x=>x.id===id);
  const row=make("div",undefined,"song-row"+(id===activeSong?" current":""));
  row.setAttribute("role","listitem");
  row.append(make("span",index+1,"song-num"));
  row.append(button(s.title,()=>useSong(id)));
  row.append(make("small",s.tono||"—"));
  root.append(row);
 });
 $("songCounter").textContent=ids.length+" canción(es)";
 $("repRemove").disabled=working.repertoires.length<=1;
 $("songRemove").disabled=ids.length<=1;
 const index=ids.indexOf(activeSong);
 $("songUp").disabled=index===0;$("songDown").disabled=index===ids.length-1;
 $("repHeading").textContent=currentRep().name;
 $("songHeading").textContent=currentSong().title;
 $("songSummary").textContent=[
  currentSong().tono||"Tonalidad pendiente",
  currentSong().tempoBpm?currentSong().tempoBpm+" BPM":"BPM pendiente",
  currentSong().stateIds.length+" estados",
  currentSong().bank||"Banco pendiente"
 ].join(" · ");
}
function renderSong(){
 const s=currentSong();
 $("liveLink").href='../v03.html?v=20261016-repertoires1&repertoire='+encodeURIComponent(activeRep)+'&song='+encodeURIComponent(activeSong);
 $("songTitle").value=s.title;
 $("songTone").value=s.tono??"";
 $("songBpm").value=s.tempoBpm??"";
 $("songBank").value=s.bank??"";
 entries("songInitial",s.stateIds.map(id=>[id,working.states.find(st=>st.id===id)?.name||id]),s.initialStateId);
}
function selectState(id){
 if(!currentSong().stateIds.includes(id))return;
 activeState=id;
 activeModule=currentState().displayIndex??null;
 renderStates();
}
function ensureSlots(){
 const s=currentSong();
 s.displaySlots??=Array.from({length:4},()=>({name:"—",sub:"Sin asignar",kind:"control"}));
}
function normalSlot(index){return normalizeSlot(currentSlot(index),index);}
function renderModules(){
 $("moduleLayout").value=currentSong().moduleLayout||"auto";
 const slots=currentSong().displaySlots||[];
 if(activeModule!==null&&activeModule>=slots.length)activeModule=null;
 const hasModule=Number.isInteger(activeModule)&&!!slots[activeModule];
 $("moduleRemove").disabled=!hasModule;
 $("moduleUp").disabled=!hasModule||activeModule===0;
 $("moduleDown").disabled=!hasModule||activeModule===slots.length-1;
 $("moduleAdd").disabled=slots.length>=256;
 for(const id of ['moduleEffectAdd','moduleExpressionAdd','moduleUtilityAdd'])$(id).disabled=slots.length>=256;
 for(const id of ['moduleName','moduleSub','moduleDeviceTag','moduleKind','moduleHidden','moduleColor','moduleColorPreset','moduleIcon','moduleLinkedState','moduleRowBreak'])$(id).disabled=!hasModule;
 const area=$("moduleGrid");area.replaceChildren();
 if(!slots.length)area.append(make('p','Sin módulos. Añade un estado musical, efecto o expresión.','help'));
 for(let i=0;i<slots.length;i++){
  const slot=normalSlot(i),visual=resolveModuleVisual(slot,i),connected=linkedState(i);
  const tile=button("",()=>{activeModule=i;activeState=connected?.id??null;renderStates();},
    "module-select-tile"+(i===activeModule?" is-selected":""));
  tile.style.background="linear-gradient(160deg,"+visual.color+","+visual.dark+")";
  tile.title="Editar módulo "+(i+1)+" · "+slot.name;
  tile.setAttribute("aria-pressed",String(i===activeModule));
  tile.append(make("span",i+1,"tile-num"));
  tile.append(make("span",visual.glyph||" ","tile-symbol"));
  tile.append(make("span",slot.name,"tile-name"));
  tile.append(make("span",slot.sub,"tile-sub"));
  const device=make("span",slot.deviceTag,"tile-device");
  device.hidden=!slot.deviceTag;tile.append(device);
  if(slot.hidden)tile.style.opacity=".35";
  area.append(tile);
 }
 $("selectedModuleLabel").textContent=hasModule?String(activeModule+1):'—';
 const slot=normalSlot(activeModule),visual=resolveModuleVisual(slot,activeModule);
 $("moduleName").disabled=!hasModule&&!currentState();
 $("moduleName").value=hasModule?(slot.name==='—'?'':slot.name):currentState()?.name||'';
 $("moduleSub").value=slot.sub;
 $("moduleDeviceTag").value=slot.deviceTag;
 $("moduleKind").value=hasModule?modulePurpose(working,activeSong,activeModule):'control';
 $("moduleHidden").checked=!!currentSlot().hidden;
 $("moduleRowBreak").checked=!!currentSlot().rowBreakBefore;
 $("moduleRowBreak").disabled=!hasModule||activeModule===0;
 $("moduleColor").value=visual.color;
 entries("moduleColorPreset",MODULE_COLORS.map(x=>[x.hex,x.label]),visual.color);
 // El color personalizado puede no pertenecer a la paleta.
 if(!MODULE_COLORS.some(x=>x.hex.toLowerCase()===visual.color.toLowerCase())){
  $("moduleColorPreset").add(new Option("Personalizado",visual.color));
  $("moduleColorPreset").value=visual.color;
 }
 entries("moduleIcon",MODULE_ICONS.map(x=>[x.id,(x.glyph?x.glyph+" · ":"")+x.label]),slot.icon);
 const stateChoices=[["","Sin estado asociado"]],stateSelect=$("moduleLinkedState");
 let createValue='__create_module_state__';
 while(currentSong().stateIds.includes(createValue))createValue+='_';
 stateSelect.dataset.createValue=hasModule&&!linkedState()&&modulePurpose(working,activeSong,activeModule)==='control'?createValue:'';
 if(stateSelect.dataset.createValue)stateChoices.push([createValue,'+ Crear estado para este módulo']);
 for(const id of currentSong().stateIds){
  const state=working.states.find(st=>st.id===id);
  stateChoices.push([id,state.name+(state.displayIndex==null?' · Sin módulo':' · Módulo '+(state.displayIndex+1))]);
 }
 entries(stateSelect,stateChoices,linkedState()?.id||'');
 renderModuleActivation();
}
function renderModuleActivation(){
 const config=Number.isInteger(activeModule)?moduleActivation(working,activeSong,activeModule):null;
 $('moduleActivation').hidden=!config;
 const area=$('moduleActivationRows');area.replaceChildren();
 $('expressionActivationNote').hidden=currentSlot().kind!=='expression';
 if(!config)return;
 const index=activeModule;
 for(const row of config.rows){
  const label=make('label',undefined,'field activation-row');
  const select=make('select');
  entries(select,[[false,'Apagado'],[true,'Encendido']],row.active);
  select.setAttribute('aria-label',normalSlot(index).name+' al entrar en '+row.name);
  select.onchange=()=>{
   try{setModuleActiveOnEntry(working,activeSong,index,row.stateId,select.value==='true');dirty();}
   catch(error){renderModuleActivation();notice(error.message,true);}
  };
  label.append(make('span',row.name),select);area.append(label);
 }
}
function renderStates(){
 const states=currentSong().stateIds;
 const pills=$("stateList");pills.replaceChildren();
 for(const id of states){
  const st=working.states.find(x=>x.id===id);
  const pill=button(st.name+(id===currentSong().initialStateId?" · Inicial":""),
   ()=>selectState(id),id===activeState?"active":"");
  pill.setAttribute("aria-pressed",String(id===activeState));
  pills.append(pill);
 }
 const st=currentState(),index=states.indexOf(st?.id);
 $("stateUp").disabled=!st||index<=0;$("stateDown").disabled=!st||index>=states.length-1;
 $("stateRemove").disabled=!st||states.length<=1;
 for(const id of ['stateCopy','stateSlot','statePatch','indicatorId','indicatorLabel','indicatorSlot','indicatorActive','indicatorAdd'])$(id).disabled=!st;
 $("stateSelectionNote").textContent=stateSelectionText(st);
 renderInitialState();
 entries("stateSlot",[["","Sin módulo"]].concat(
  Array.from({length:currentSong().displaySlots.length},(_,i)=>[i,(i+1)+" · "+normalSlot(i).name])
 ),st?.displayIndex??"");
 $("statePatch").value=st?.gtPatch??"";
 entries("indicatorSlot",[["","Sin módulo"]].concat(
  Array.from({length:currentSong().displaySlots.length},(_,i)=>[i,(i+1)+" · "+normalSlot(i).name])
 ),"");
 const list=$("indicatorList");list.replaceChildren();
 if(!st?.indicators?.length)list.append(make("p",st?"Sin indicadores.":"Selecciona un estado para editar sus indicadores.","help"));
 for(const indicator of st?.indicators||[]){
  const row=make("div",undefined,"action-row");
  row.append(make("span",(indicator.active?"● ":"○ ")+indicator.label+
   " ("+indicator.id+")"+(indicator.displayIndex==null?"":" · Módulo "+(indicator.displayIndex+1)),"name"));
  const managed=currentSong().displaySlots?.[indicator.displayIndex];
  if(managed?.indicatorId&&['effect','expression'].includes(modulePurpose(working,activeSong,indicator.displayIndex))){
   row.append(make('span','Editar desde su módulo','help'));list.append(row);continue;
  }
  row.append(button("Eliminar",()=>{
   if(!window.confirm("¿Quitar este indicador del estado?"))return;
   const target=currentState();
   target.indicators=target.indicators.filter(x=>x.id!==indicator.id);
   // Limpiar comandos que ya no tienen ningún indicador al que dirigirse.
   if(!working.states.some(st=>st.indicators?.some(x=>x.id===indicator.id))){
    for(const b of working.bindings)b.actions=b.actions.filter(a=>
     !(a.type==="SET_INDICATOR"&&a.indicatorId===indicator.id));
    working.bindings=working.bindings.filter(b=>b.actions.length);
   }
   dirty();renderStates();
  },"small danger"));
  list.append(row);
 }
 renderModules();
}
function setSlotProperty(key,value){
 if(!currentSong().displaySlots?.[activeModule])return;
 ensureSlots();
 const base=normalSlot(activeModule);
 currentSong().displaySlots[activeModule]={...currentSlot(),...base,[key]:value};
 dirty();
 refreshModuleTile(activeModule);
}
function refreshModuleTile(index){
 const slot=currentSlot(index),visual=resolveModuleVisual(slot,index);
 // Refrescar solo la matriz (sin borrar campos en curso).
 const tiles=$("moduleGrid").children;
 const tile=tiles[index];
 if(tile){
  tile.style.background="linear-gradient(160deg,"+visual.color+","+visual.dark+")";
  tile.title='Editar módulo '+(index+1)+' · '+slot.name;
  tile.querySelector(".tile-symbol").textContent=visual.glyph||" ";
  tile.querySelector(".tile-name").textContent=normalSlot(index).name;
  tile.querySelector(".tile-sub").textContent=normalSlot(index).sub;
  tile.querySelector(".tile-device").textContent=normalSlot(index).deviceTag;
  tile.querySelector(".tile-device").hidden=!normalSlot(index).deviceTag;
  tile.style.opacity=slot.hidden?".35":"1";
 }
}
function linkState(id,index){
 if(!Number.isInteger(index))return;
 const previous=linkedState(index);
 if(id){
  const target=working.states.find(st=>st.id===id);
  if(!target||target.songId!==activeSong)throw Error("Estado no pertenece a la canción.");
  if(!confirmModuleAssignment(id,index)){renderStates();return;}
  assignStateModule(working,activeSong,id,index,{replace:true});
  activeState=id;
 }else{if(previous)assignStateModule(working,activeSong,previous.id,null);activeState=null;}
 dirty();renderStates();
}
function confirmModuleAssignment(stateId,index){
 const occupant=linkedState(index);
 const target=working.states.find(st=>st.id===stateId);
 const changes=[];
 if(occupant&&occupant.id!==stateId)changes.push('«'+occupant.name+'» quedará sin módulo.');
 if(target.displayIndex!=null&&target.displayIndex!==index)
  changes.push('«'+target.name+'» pasará del módulo '+(target.displayIndex+1)+' al módulo '+(index+1)+'.');
 return !changes.length||window.confirm(changes.join(' ')+' ¿Continuar?');
}
function changeStateField(key,value){
 const st=currentState();
 if(!st)return;
 st[key]=value;
 dirty();
}
function renameSelection(){
 const field=$("moduleName"),name=field.value,start=field.selectionStart,end=field.selectionEnd;
 const previous=activeState;
 if(Number.isInteger(activeModule)&&currentSong().displaySlots?.[activeModule])
  activeState=renameModule(working,activeSong,activeModule,name);
 else if(currentState())currentState().name=name;
 else return;
 dirty();renderSong();
 if(previous!==activeState){
  renderStates();
  if(Number.isInteger(start))field.setSelectionRange(start,end);
  return;
 }
 if(Number.isInteger(activeModule)){
  refreshModuleTile(activeModule);
  for(const id of ['stateSlot','indicatorSlot'])for(const option of $(id).options)
   if(option.value===String(activeModule))option.textContent=(activeModule+1)+' · '+name;
 }
 const st=currentState(),pill=$("stateList").querySelector('[aria-pressed=true]');
 if(st&&pill)pill.textContent=st.name+(st.id===currentSong().initialStateId?' · Inicial':'');
 if(st)for(const option of $("moduleLinkedState").options)if(option.value===st.id)
  option.textContent=st.name+(st.displayIndex==null?' · Sin módulo':' · Módulo '+(st.displayIndex+1));
 $("stateSelectionNote").textContent=stateSelectionText(st);renderInitialState();renderModuleActivation();
}
function addEditorModule(purpose){
 try{
  const result=addConfiguredModule(working,activeSong,purpose);
  activeModule=result.index;activeState=result.stateId;dirty();renderStates();renderSong();
  $("moduleName").focus();$("moduleName").select?.();
 }catch(error){notice(error.message,true);}
}
function renderLead(){
 $("sheetNotation").value=currentSong().chordNotation||"americano";
 $("leadText").value=leadSource;
 const area=$("leadText");
 area.scrollTop=0;paintLead();
}
function paintLead(){
 const notation=scanNotation(leadSource);
 $("sheetNotationDetected").textContent=notation.invalid.length?
  "Cifrado: revisa los símbolos no reconocidos":notation.mixed?
  "Cifrado mezclado · Guardar pedirá elegir un sistema":notation.families.length?
  "Cifrado detectado: "+(notation.families[0]==="latino"?"Latino":"Americano"):
  "Cifrado: sin acordes todavía";
 if(notation.families.length===1&&!notation.invalid.length)$("sheetNotation").value=notation.families[0];
 const textarea=$("leadText");
 leadParse=leadSource.trim()?parseLeadSheetText(leadSource):{sections:[],errors:[],totalBars:0};
 const lines=leadSource.split("\n"),bad=new Set(leadParse.errors.map(x=>x.line));
 const gutter=$("leadGutter");gutter.replaceChildren();
 lines.forEach((_,i)=>{
  const row=make("div",i+1,"sheet-line"+(bad.has(i+1)?" invalid":""));
  gutter.append(row);
 });
 gutter.style.transform="translateY(-"+textarea.scrollTop+"px)";
 const chart=$("leadPreview");chart.replaceChildren();
 const errors=$("leadErrors");errors.replaceChildren();
 if(leadParse.errors.length){
  textarea.setAttribute("aria-invalid","true");
  leadParse.errors.forEach(e=>{
   errors.append(button("Línea "+e.line+": "+e.message,()=>{
    const parts=textarea.value.split("\n");
    const start=parts.slice(0,e.line-1).reduce((n,s)=>n+s.length+1,0);
    textarea.focus();textarea.setSelectionRange(start,start+(parts[e.line-1]||"").length);
    textarea.scrollTop=Math.max(0,(e.line-1)*24-50);
   },"sheet-error"));
  });
  $("leadStatus").textContent=leadParse.errors.length+" error(es) en la partitura.";
  $("leadDraftWarning").hidden=false;
 }else{
  $("leadDraftWarning").hidden=true;
  textarea.setAttribute("aria-invalid","false");
  $("leadStatus").textContent=leadParse.totalBars+" compases · "+leadParse.sections.length+" secciones";
 }
 for(const section of leadParse.sections){
  const item=make("section",undefined,"sheet-preview-section");
  const head=make("div",undefined,"sheet-preview-heading");
  head.append(make("span",section.letter,"sheet-preview-letter"),make("span",section.label));
  item.append(head);
  const measures=make("div",undefined,"sheet-preview-bars");
  section.bars.forEach((bar,i)=>{
   const repeat=bar[0]==="/"&&bar.slice(1).every(x=>!x);
   const klass="sheet-preview-measure"+(repeat?" repeat":"")+
    ((section.repeatStartBars||[]).includes(i)?" start":"")+
    ((section.repeatEndBars||[]).includes(i)?" end":"");
   const cell=make("div",undefined,klass);
   if(repeat)cell.append(make("span","/"));
   else for(const chord of bar.filter(Boolean))cell.append(make("span",chord));
   measures.append(cell);
  });
  item.append(measures);chart.append(item);
 }
 if(!leadParse.sections.length&&!leadParse.errors.length){
  chart.append(make("p","Escribe una sección y sus compases para generar la vista previa.","sheet-helper"));
 }
}
function midiNumber(id){const raw=$(id).value;return raw.trim()===''?NaN:Number(raw);}
function pair(){return {cc:midiNumber("midiCC"),value:midiNumber("midiValue")};}
function validatePair(){
 const v=pair();
 if(!Number.isInteger(v.cc)||v.cc<0||v.cc>127||
    !Number.isInteger(v.value)||v.value<0||v.value>127)
  throw Error("CC y valor deben estar entre 0 y 127.");
 return v;
}
function chooseMessage(nextCC,nextValue){cc=nextCC;value=nextValue;renderMidi();}
function midiTarget(){
 const type=$("actionType").value;
 let records=[];
 if(type==="ACTIVATE_STATE")
  records=working.states.map(st=>[st.id,(working.songs.find(s=>s.id===st.songId)?.title||"")+" · "+st.name]);
 else if(type==='MODULE_ON'||type==='MODULE_OFF'){
  for(const song of working.songs)for(const [index,slot] of (song.displaySlots||[]).entries())
   if(['effect','expression'].includes(modulePurpose(working,song.id,index)))
    records.push([JSON.stringify([song.id,index]),song.title+' · '+slot.name]);
 }
 else if(type==="SELECT_SONG")records=working.songs.map(s=>[s.id,s.title]);
 else{
  const ids=new Map();
  for(const st of working.states)for(const indicator of st.indicators||[]){
   if(!ids.has(indicator.id))ids.set(indicator.id,indicator.label);
  }
  records=[...ids].map(([id,title])=>[id,title+" ("+id+")"]);
 }
 const previous=$("actionTarget").value;
 entries("actionTarget",records,previous||records[0]?.[0]);
 $("actionTargetWrap").hidden=!records.length;
 $("actionActiveWrap").hidden=type!=="SET_INDICATOR";
 $("actionAdd").disabled=!records.length;
}
function renderMidiMatrix(){
 const area=$("midiMatrix");area.replaceChildren();
 let cells;
 try{cells=chocolateMatrix(working,{
  startCC:midiNumber("matrixStart"),value:midiNumber("matrixValue")
 });}
 catch(e){area.append(make("p",e.message,"warning"));return;}
 area.append(make("span","","axis"));
 for(const name of ["A","B","C","D"])area.append(make("span",name,"axis"));
 for(const bank of cells){
  area.append(make("span",bank[0].bank,"axis"));
  for(const position of bank){
   const chosen=cc===position.cc&&value===position.value;
   const tile=button("",()=>chooseMessage(position.cc,position.value),
    "cell"+(position.binding?" assigned":"")+(chosen?" picked":""));
   tile.title="Banco "+position.bank+", botón "+position.button+", CC "+position.cc;
   tile.setAttribute("aria-pressed",String(chosen));
   tile.append(make("strong",position.bank+position.button),
    make("span","CC "+position.cc+(position.binding?" · ●":"")));
   area.append(tile);
  }
 }
}
function changeActions(action){
 const current=bindingFor(working,cc,value);
 if(!current)return;
 action(current);
 if(!current.actions.length)deleteBinding(working,cc,value);
 dirty();renderMidi();
}
function renderMidi(){
 $("midiCC").value=String(cc);$("midiValue").value=String(value);
 renderMidiMatrix();
 midiTarget();
 const b=bindingFor(working,cc,value),root=$("midiActionList");
 root.replaceChildren();
 if(!b)root.append(make("p","Sin acciones asignadas a este mensaje.","help"));
 else{
  b.actions.forEach((a,i)=>{
   const row=make("div",undefined,"action-row");
   row.append(make("span",(i+1)+". "+actionDescription(working,a),"name"));
   const controls=make("div",undefined,"action-actions");
   const up=button("↑",()=>changeActions(b=>{
    [b.actions[i-1],b.actions[i]]=[b.actions[i],b.actions[i-1]];
   }),"small");up.disabled=i===0;
   const down=button("↓",()=>changeActions(b=>{
    [b.actions[i+1],b.actions[i]]=[b.actions[i],b.actions[i+1]];
   }),"small");down.disabled=i===b.actions.length-1;
   controls.append(up,down,button("Eliminar",()=>changeActions(b=>{
    b.actions.splice(i,1);
   }),"small danger"));
   row.append(controls);root.append(row);
  });
  root.append(button("Eliminar mensaje MIDI",()=>{
   if(!window.confirm("¿Eliminar CC "+cc+" / valor "+value+"?"))return;
   deleteBinding(working,cc,value);dirty();renderMidi();
  },"small danger"));
 }
 const table=$("bindingsTable");table.replaceChildren();
 const bindings=[...working.bindings].sort((a,b)=>a.cc-b.cc||a.value-b.value);
 $("bindingCount").textContent=bindings.length+" mensaje(s)";
 if(!bindings.length){
  const tr=make("tr");const td=make("td","Sin asignaciones.");
  td.colSpan=3;tr.append(td);table.append(tr);
 }
 for(const assigned of bindings){
  const tr=make("tr");
  const text=assigned.actions.map(a=>actionDescription(working,a)).join(" · ");
  const last=make("td");
  last.append(button("Editar",()=>chooseMessage(assigned.cc,assigned.value),"small"));
  tr.append(make("td","CC "+assigned.cc+" / "+assigned.value),make("td",text),last);
  table.append(tr);
 }
 const problems=$("midiWarnings");problems.replaceChildren();
 const warnings=diagnostics(working);
 if(!warnings.length)problems.append(make("p","No se detectan conflictos.","help"));
 else for(const w of warnings)problems.append(make("div",w.message,"warning"));
}
function render(){
 if(!working)return;
 selected();ensureSlots();sidebar();renderSong();renderStates();
 if(activeTab==="sheet")renderLead();
 else if(activeTab==="midi")renderMidi();
 for(const node of document.querySelectorAll("[data-tab]")){
  const on=node.dataset.tab===activeTab;
  node.classList.toggle("active",on);
  node.setAttribute("aria-selected",String(on));
 }
 for(const node of document.querySelectorAll("[data-panel]"))
  node.hidden=node.dataset.panel!==activeTab;
 $("undo").disabled=!localStorage.getItem(BACKUP);
 syncStatus();
}
function register(){
 $("libraryToggle").onclick=()=>toggleLibrary();
 $("libraryClose").onclick=()=>toggleLibrary(false);
 $("libraryBackdrop").onclick=()=>toggleLibrary(false);
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("editorSidebar").classList.contains("is-open"))toggleLibrary(false);});
 $("scanOld").onclick=scanOldLibraries;
 for(const node of document.querySelectorAll("[data-tab]"))
  node.onclick=()=>updateTab(node.dataset.tab);
 $("repSelect").onchange=e=>useRepertoire(e.target.value);
 $("repAdd").onclick=()=>{
  const name=window.prompt("Nombre del repertorio","Nuevo repertorio");
  if(name===null)return;
  immediate(db=>{
   const id=newRepertoire(db,name.trim()||"Nuevo repertorio");
   activeRep=id;activeSong=db.repertoires.find(r=>r.id===id).songIds[0];
   activeState=db.songs.find(s=>s.id===activeSong).stateIds[0];
  },"Repertorio creado.");
 };
 $("repRename").onclick=()=>{
  const name=window.prompt("Nombre del repertorio",currentRep().name);
  if(name!==null)immediate(db=>renameRepertoire(db,activeRep,name),"Repertorio renombrado.");
 };
 $("repRemove").onclick=()=>{
  if(window.confirm("¿Eliminar este repertorio y sus canciones no compartidas?"))
   immediate(db=>deleteRepertoire(db,activeRep),"Repertorio eliminado.");
 };
 $("songAdd").onclick=immediate.bind(null,db=>{
  const id=newSong(db,activeRep);
  activeSong=id;activeState=db.songs.find(s=>s.id===id).stateIds[0];
  activeTab="song";
 },"Canción creada.");
 $("songAddSig").onclick=()=>immediate(db=>{
  const id=newSong(db,activeRep,"Nueva canción SIG","sig");
  activeSong=id;activeState=db.songs.find(s=>s.id===id).stateIds[0];activeModule=0;
  activeTab="song";
 },"Canción SIG creada con cuatro estados y módulos.");
 $("songCopy").onclick=()=>immediate(db=>{
  const id=copySong(db,activeRep,activeSong);
  activeSong=id;activeState=db.songs.find(s=>s.id===id).stateIds[0];
  activeTab="song";
 },"Canción duplicada.");
 $("songRemove").onclick=()=>{
  if(window.confirm("¿Eliminar la canción de este repertorio?"))
   immediate(db=>deleteSong(db,activeRep,activeSong),"Canción eliminada.");
 };
 $("songUp").onclick=()=>immediate(db=>moveSong(db,activeRep,activeSong,-1),"Orden de canciones actualizado.");
 $("songDown").onclick=()=>immediate(db=>moveSong(db,activeRep,activeSong,1),"Orden de canciones actualizado.");
 for(const [id,key] of [
  ["songTitle","title"],["songTone","tono"],["songBpm","tempoBpm"],["songBank","bank"]
 ]){
  $(id).addEventListener("input",()=>{
   const raw=$(id).value;
   currentSong()[key]=key==="tempoBpm"?(raw===""?null:Number(raw)):
    key==="title"?raw:raw.trim()||null;
   dirty();
  });
 }
 $("songInitial").onchange=()=>{
  try{setInitialState(working,activeSong,$("songInitial").value);dirty();renderStates();}
  catch(error){renderSong();notice(error.message,true);}
 };
 $("stateMakeInitial").onclick=makeSelectionInitial;
 $("songSave").onclick=save;
 $("moduleAdd").onclick=()=>addEditorModule('control');
 $("moduleEffectAdd").onclick=()=>addEditorModule('effect');
 $("moduleExpressionAdd").onclick=()=>addEditorModule('expression');
 $("moduleUtilityAdd").onclick=()=>addEditorModule('utility');
 for(const [id,delta] of [["moduleUp",-1],["moduleDown",1]])$(id).onclick=()=>{
  activeModule=moveModule(working,activeSong,activeModule,delta);dirty();renderStates();
 };
 $("moduleRemove").onclick=()=>{
  if(!currentSong().displaySlots.length)return;
  const used=working.states.some(st=>st.songId===activeSong&&(st.displayIndex===activeModule||st.indicators?.some(ind=>ind.displayIndex===activeModule)));
  if(used&&!window.confirm("¿Quitar el módulo y su vinculación visual? Sus estados y asignaciones MIDI se conservarán."))return;
  activeModule=removeModule(working,activeSong,activeModule);activeState=linkedState()?.id??null;dirty();renderStates();
 };
 $("stateAdd").onclick=()=>{
  try{activeState=newStateWithModule(working,activeSong,activeModule);activeModule=currentState().displayIndex;dirty();renderStates();renderSong();}
  catch(error){notice(error.message,true);}
 };
 $("stateCopy").onclick=()=>{
  if(!currentState())return;
  try{activeState=duplicateStateWithModule(working,activeState);activeModule=currentState().displayIndex;dirty();renderStates();renderSong();}
  catch(error){notice(error.message,true);}
 };
 $("stateRemove").onclick=()=>{
  if(!currentState())return;
  if(!window.confirm("¿Eliminar este estado y las asociaciones MIDI que lo usen?"))return;
  deleteState(working,activeState);activeState=currentSong().stateIds[0];
  activeModule=currentState().displayIndex??null;
  dirty();renderStates();renderSong();
 };
 $("stateUp").onclick=()=>{moveState(working,activeState,-1);dirty();renderStates();renderSong();};
 $("stateDown").onclick=()=>{moveState(working,activeState,1);dirty();renderStates();renderSong();};
 $("statePatch").oninput=()=>changeStateField("gtPatch",
  $("statePatch").value.trim()||null);
 $("stateSlot").onchange=()=>{
  if(!currentState())return;
  const idx=$("stateSlot").value;
  const previous=currentState().displayIndex;
  const next=idx===''?null:Number(idx);
  if(next!==null&&!confirmModuleAssignment(activeState,next)){renderStates();return;}
  assignStateModule(working,activeSong,activeState,next,{replace:true});activeModule=next;
  if(previous!==currentState().displayIndex){dirty();renderStates();}
 };
 $("moduleName").oninput=renameSelection;
 $("moduleSub").oninput=()=>setSlotProperty("sub",$("moduleSub").value);
 $("moduleDeviceTag").oninput=()=>setSlotProperty("deviceTag",$("moduleDeviceTag").value);
 $("moduleKind").onchange=()=>{
  if(!Number.isInteger(activeModule))return;
  activeState=setModulePurpose(working,activeSong,activeModule,$("moduleKind").value);
  dirty();renderStates();renderSong();
 };
 $("moduleLayout").onchange=()=>{
  currentSong().moduleLayout=$("moduleLayout").value;
  if(currentSong().moduleLayout==='auto')for(const slot of currentSong().displaySlots)slot.rowBreakBefore=false;
  dirty();renderModules();
 };
 $("moduleRowBreak").onchange=()=>{
  currentSong().moduleLayout='manual';
  setSlotProperty("rowBreakBefore",$("moduleRowBreak").checked);renderModules();
 };
 $("moduleHidden").onchange=()=>{setSlotProperty("hidden",$("moduleHidden").checked);renderModules();};
 $("moduleColorPreset").onchange=()=>{
  const chosen=$("moduleColorPreset").value;
  $("moduleColor").value=chosen;
  setSlotProperty("color",chosen);renderModules();
 };
 $("moduleColor").oninput=()=>{
  setSlotProperty("color",$("moduleColor").value);
  const color=$("moduleColor").value;
  if(![...$("moduleColorPreset").options].some(x=>x.value===color))
   $("moduleColorPreset").add(new Option("Personalizado",color));
  $("moduleColorPreset").value=color;
 };
 $("moduleIcon").onchange=()=>setSlotProperty("icon",$("moduleIcon").value);
 $("moduleLinkedState").onchange=()=>{
  const select=$("moduleLinkedState");
  if(select.dataset.createValue&&select.value===select.dataset.createValue)createSelectedModuleState();
  else linkState(select.value,activeModule);
 };
 $("indicatorAdd").onclick=()=>{
  if(!currentState())return;
  const id=$("indicatorId").value.trim(),label=$("indicatorLabel").value.trim();
  if(!/^[A-Za-z][A-Za-z0-9_-]{0,49}$/.test(id)||!label){
   notice("Escribe un identificador válido y descripción del indicador.",true);return;
  }
  const indicators=currentState().indicators??=[];
  if(indicators.some(x=>x.id===id)){
   notice("Ese indicador ya existe en este estado.",true);return;
  }
  indicators.push({id,label,active:$("indicatorActive").checked,
   displayIndex:$("indicatorSlot").value===""?null:Number($("indicatorSlot").value)});
  $("indicatorId").value="";$("indicatorLabel").value="";$("indicatorActive").checked=false;
  dirty();renderStates();
 };
 $("statesSave").onclick=save;
 $("leadText").oninput=()=>{
  leadSource=$("leadText").value;dirty();paintLead();
 };
 $("leadText").onscroll=()=>{
  $("leadGutter").style.transform="translateY(-"+$("leadText").scrollTop+"px)";
 };
 $("sheetConvert").onclick=()=>{
  const target=$("sheetNotation").value;
  if(!["americano","latino"].includes(target))return;
  const scan=scanNotation(leadSource);
  if(scan.invalid.length){notice("No se convirtió: acorde inválido en línea "+scan.invalid[0].line+": "+scan.invalid[0].token,true);return;}
  if(leadSource.trim() && !confirm("¿Convertir todos los acordes de esta canción a cifrado "+target+"?"))return;
  try{
   leadSource=convertLeadSheetDraft(leadSource,target);
   currentSong().chordNotation=target;
   $("leadText").value=leadSource;dirty();paintLead();
   notice("Cifrado convertido a "+target+". Pulsa Guardar para publicarlo.");
  }catch(e){notice("No se convirtió: "+e.message,true);}
 };
 $("sheetSave").onclick=save;
 $("matrixStart").onchange=renderMidi;
 $("matrixValue").onchange=renderMidi;
 for(const name of ["midiCC","midiValue"]){
  $(name).onchange=()=>{
   try{
    const pair=validatePair();cc=pair.cc;value=pair.value;
    renderMidi();
   }catch(e){notice(e.message,true);}
  };
 }
 $("actionType").onchange=midiTarget;
 $("actionAdd").onclick=()=>{
  let pair;
  try{pair=validatePair();}catch(e){notice(e.message,true);return;}
  const type=$("actionType").value,target=$("actionTarget").value;
  if(!target)return;
  let actions;
  try{
   if(type==='MODULE_ON'||type==='MODULE_OFF'){
    const [songId,index]=JSON.parse(target);
    actions=moduleActivationActions(working,songId,index,type==='MODULE_ON');
   }else actions=[type==="ACTIVATE_STATE"?{type,stateId:target}:
    type==="SELECT_SONG"?{type,songId:target}:
    {type,indicatorId:target,active:$("actionActive").value==="true"}];
  }catch(error){notice(error.message,true);return;}
  const found=bindingFor(working,pair.cc,pair.value);
  if(found)found.actions.push(...actions);
  else setBindingActions(working,pair.cc,pair.value,actions);
  cc=pair.cc;value=pair.value;
  dirty();renderMidi();
 };
 $("midiSave").onclick=save;
 $("importBtn").onclick=()=>$("importFile").click();
 $("importFile").onchange=async event=>{
  const file=event.target.files?.[0];event.target.value="";
  if(!file)return;
  if(file.size>500000){notice("Archivo demasiado grande.",true);return;}
  if(!allowLeaving())return;
  try{
   const incoming=normalizeLibrary(JSON.parse(await file.text()));
   validateLibrary(incoming);
   if(!window.confirm("¿Importar y reemplazar la biblioteca actual? Se guarda una copia previa."))return;
   const written=replaceLibrary(localStorage,incoming,committed);
   committed=written;working=copy(written);activeRep=working.repertoires[0].id;
   activeSong=currentRep().songIds[0];activeState=currentSong().initialStateId;
   activeModule=currentState().displayIndex??null;
   leadSource=formatLeadSheetText(currentSong().leadSheet);
   activeTab="song";hasDraft=false;render();notice("Biblioteca importada.");
  }catch(e){notice("No se pudo importar: "+e.message,true);}
 };
 $("exportBtn").onclick=()=>{
  if(hasDraft&&!window.confirm("Los cambios sin guardar no aparecen en la exportación. ¿Continuar?"))return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(committed,null,2)],{type:"application/json"}));
  const link=make("a");link.href=url;link.download="MIDI-HUD-editor-v3.json";
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
 };
 $("midiLinkBtn").onclick=async()=>{
  const action=$('midiLinkBtn');action.disabled=true;
  try{
   if(hasDraft){await save();if(hasDraft)return;}
   const link=await createLibraryTransferUrl(committed,{repertoireId:activeRep,songId:activeSong},window.location.href);
   showMidiLink(link);
  }catch(error){notice('No se pudo preparar el enlace: '+error.message,true);}
  finally{action.disabled=false;}
 };
 $("undo").onclick=()=>{
  const backup=localStorage.getItem(BACKUP);if(!backup||!allowLeaving())return;
  if(!window.confirm("¿Recuperar la biblioteca guardada antes del último cambio?"))return;
  try{
   const last=normalizeLibrary(JSON.parse(backup));validateLibrary(last);
   const written=replaceLibrary(localStorage,last,committed);
   committed=written;working=copy(written);hasDraft=false;selected();leadSource=formatLeadSheetText(currentSong().leadSheet);
   render();notice("Se ha recuperado el guardado anterior.");
  }catch(e){notice("Error al deshacer: "+e.message,true);}
 };
 window.addEventListener("beforeunload",event=>{
  if(hasDraft){event.preventDefault();event.returnValue="";}
 });
}
function downloadRecovery(raw,name){
 const url=URL.createObjectURL(new Blob([raw],{type:"application/json"}));
 const link=make("a");link.href=url;link.download="MIDI-HUD-copia-anterior-"+name.replace(/[^a-zA-Z0-9_-]/g,"_")+".json";
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function scanOldLibraries(){
 const root=$("recoveryResults");root.replaceChildren();
 let candidates;
 try{candidates=findRecoverable(localStorage,committed);}catch(e){root.textContent="No se pudo leer el almacenamiento de Safari: "+e.message;return;}
 if(!candidates.length){
  root.textContent="No aparecen repertorios antiguos adicionales en este sitio. Si «Prueba 1» se creó con otra dirección web o perfil, Safari no permite leerlo desde aquí.";
  return;
 }
 root.append(make("p",candidates.length+" repertorio(s) anterior(es) disponible(s):"));
 for(const found of candidates){
  const item=make("div",undefined,"recovery-result");
  item.append(make("strong",found.repertoire.name));
  item.append(make("p",found.titles.length+" canción(es) · origen local: "+found.key));
  item.append(button("Guardar copia JSON",()=>downloadRecovery(found.raw,found.repertoire.name),"small"));
  item.append(document.createTextNode(" "));
  item.append(button("Recuperar",()=>{
   if(!allowLeaving())return;
   if(!window.confirm("¿Añadir «"+found.repertoire.name+"» sin borrar repertorios actuales? Las asignaciones MIDI globales no se fusionarán."))return;
   try{
    const result=mergeRecoveredRepertoire(committed,found.library,found.repertoire.id);
    // Conservar copia original independiente del backup de deshacer.
    const archiveKey="hudRecoverySnapshot:"+Date.now();
    localStorage.setItem(archiveKey,found.raw);
    activeRep=result.repertoireId;
    activeSong=result.library.repertoires.find(r=>r.id===activeRep).songIds[0];
    activeState=result.library.songs.find(x=>x.id===activeSong).initialStateId;
    persistLibrary(result.library,"Repertorio recuperado. El original se conservó en Safari; exporta un JSON de seguridad.");
    toggleLibrary(false);
   }catch(e){notice("No se pudo recuperar: "+e.message,true);}
  },"small primary"));
  root.append(item);
 }
}
async function boot(){
 register();
 let library=null;
 const saved=readLibrarySource(localStorage);
 if(saved){
  try{library=normalizeLibrary(JSON.parse(saved));validateLibrary(library);}
  catch(error){throw Error("La biblioteca guardada contiene errores y se ha conservado. "+error.message);}
 }
 if(!library){
  const response=await fetch(SOURCE,{cache:"no-store"});
  if(!response.ok)throw Error("No es posible cargar la biblioteca de ejemplo.");
  library=normalizeLibrary(await response.json());validateLibrary(library);
 }
 committed=library;working=copy(library);
 const start=resolveLiveSelection(working,localStorage,window.location?.search||'');
 activeRep=start.repertoireId;activeSong=start.songId;
 activeState=currentSong().initialStateId;activeModule=currentState().displayIndex??null;
 leadSource=formatLeadSheetText(currentSong().leadSheet);
 render();notice(saved?"Biblioteca local cargada. Pulsa Guardar tras editar una sección.":"Editor listo con datos de ejemplo. Busca guardados anteriores desde Biblioteca.");
}
boot().catch(e=>notice("Error iniciando Editor: "+e.message,true));
