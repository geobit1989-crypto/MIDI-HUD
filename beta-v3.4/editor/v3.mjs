import {scanNotation} from "./chord-notation.mjs";
import {prepareLeadSheetSave,convertLeadSheetDraft} from "./sheet-save.mjs";
import {LIBRARY_KEY,BACKUP_KEY,readLibrarySource,saveLibrary} from "../core/library-storage.mjs?v=20261016-patch1";
import {normalizeLibrary,validateLibrary} from "../core/engine-v1.mjs?v=20261016-patch1";
import {MODULE_COLORS,MODULE_ICONS,normalizeSlot,resolveModuleVisual} from "../core/module-visuals.mjs";
import {parseLeadSheetText,formatLeadSheetText} from "./lead-sheet-text.mjs";
import {findRecoverable,mergeRecoveredRepertoire} from "./recovery-v1.mjs?v=20261016-patch1";
import {
 newSong,newRepertoire,renameRepertoire,copySong,deleteSong,deleteRepertoire,moveSong,
 newState,duplicateState,deleteState,moveState,deleteBinding,bindingFor,setBindingActions,
 chocolateMatrix,actionDescription,diagnostics,addModule,moveModule,removeModule,
 newStateWithModule,duplicateStateWithModule,assignStateModule
} from "./editor-model.mjs?v=20261016-patch1";

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
 return st?('Editando estado: '+st.name+(st.displayIndex==null?' · Sin módulo asociado':' · Módulo '+(st.displayIndex+1))):'Este módulo no tiene estado asociado. Puedes usar + Estado o elegir uno en «Estado asociado a esta casilla».';
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
 if(activeState!==null&&!currentSong().stateIds.includes(activeState))activeState=currentSong().stateIds[0];
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
 activeSong=id;activeState=currentSong().stateIds[0];
 activeModule=currentState().displayIndex??0;
 leadSource=formatLeadSheetText(currentSong().leadSheet);toggleLibrary(false);render();
}
function useRepertoire(id){
 if(!working.repertoires.some(x=>x.id===id)||!allowLeaving())return;
 activeRep=id;activeSong=currentRep().songIds[0];
 activeState=currentSong().stateIds[0];
 activeModule=currentState().displayIndex??0;
 leadSource=formatLeadSheetText(currentSong().leadSheet);toggleLibrary(false);render();
}
function persistLibrary(next,message){
 const written=saveLibrary(localStorage,next,committed);
 committed=written;working=copy(written);hasDraft=false;selected();
 leadSource=formatLeadSheetText(currentSong().leadSheet);
 render();notice(message);
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
 }catch(error){notice("No se guardó: "+error.message,true);}
 finally{saving=false;syncStatus();}
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
 for(const id of ['moduleName','moduleSub','moduleDeviceTag','moduleKind','moduleHidden','moduleColor','moduleColorPreset','moduleIcon','moduleLinkedState','moduleRowBreak'])$(id).disabled=!hasModule;
 const area=$("moduleGrid");area.replaceChildren();
 if(!hasModule)area.append(make('p','Sin módulos. Pulsa + Módulo para añadir uno.','help'));
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
 $("moduleName").value=slot.name;
 $("moduleSub").value=slot.sub;
 $("moduleDeviceTag").value=slot.deviceTag;
 $("moduleKind").value=currentSlot().kind||"control";
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
 entries("moduleLinkedState",[["","Sin estado asociado"]].concat(
  currentSong().stateIds.map(id=>[id,working.states.find(x=>x.id===id)?.name||id])
 ),linkedState()?.id||"");

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
 for(const id of ['stateCopy','stateName','stateSlot','statePatch','indicatorId','indicatorLabel','indicatorSlot','indicatorActive','indicatorAdd'])$(id).disabled=!st;
 $("stateSelectionNote").textContent=stateSelectionText(st);
 $("stateName").value=st?.name||'';
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
 const visual=resolveModuleVisual(currentSlot(),activeModule);
 // Refrescar solo la matriz (sin borrar campos en curso).
 const tiles=$("moduleGrid").children;
 const tile=tiles[activeModule];
 if(tile){
  tile.style.background="linear-gradient(160deg,"+visual.color+","+visual.dark+")";
  tile.querySelector(".tile-symbol").textContent=visual.glyph||" ";
  tile.querySelector(".tile-name").textContent=normalSlot(activeModule).name;
  tile.querySelector(".tile-sub").textContent=normalSlot(activeModule).sub;
  tile.querySelector(".tile-device").textContent=normalSlot(activeModule).deviceTag;
  tile.querySelector(".tile-device").hidden=!normalSlot(activeModule).deviceTag;
  tile.style.opacity=currentSlot().hidden?".35":"1";
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
 if(!occupant||occupant.id===stateId)return true;
 const target=working.states.find(st=>st.id===stateId);
 return window.confirm('El módulo '+(index+1)+' está asociado a «'+occupant.name+'». Si lo reasignas a «'+target.name+'», «'+occupant.name+'» quedará sin módulo. ¿Continuar?');
}
function changeStateField(key,value){
 const st=currentState();
 if(!st)return;
 const oldName=st.name;
 st[key]=value;
 if(key==="name"&&st.displayIndex!=null){
  const sl=normalSlot(st.displayIndex);
  if(sl.name===oldName||sl.name==='—'){
   ensureSlots();
   currentSong().displaySlots[st.displayIndex]={...currentSlot(st.displayIndex),...sl,name:value};
  }
 }
 if(key==='name'){
  $("stateSelectionNote").textContent=stateSelectionText(st);
  for(const option of $("moduleLinkedState").options)if(option.value===st.id)option.textContent=value;
  if(st.displayIndex!=null){
   const slot=normalSlot(st.displayIndex),tile=$("moduleGrid").children[st.displayIndex];
   if(tile)tile.querySelector('.tile-name').textContent=slot.name;
   if(activeModule===st.displayIndex)$("moduleName").value=slot.name;
   for(const option of $("stateSlot").options)if(option.value===String(st.displayIndex))option.textContent=(st.displayIndex+1)+' · '+slot.name;
  }
 }
 dirty();
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
function pair(){return {cc:Number($("midiCC").value),value:Number($("midiValue").value)};}
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
  startCC:Number($("matrixStart").value),value:Number($("matrixValue").value)
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
  currentSong().initialStateId=$("songInitial").value;dirty();
 };
 $("songSave").onclick=save;
 $("moduleAdd").onclick=()=>{
  try{activeModule=addModule(working,activeSong);activeState=null;dirty();renderStates();}
  catch(error){notice(error.message,true);}
 };
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
 $("stateName").oninput=()=>{
  changeStateField("name",$("stateName").value);
  const pill=$("stateList").querySelector("[aria-pressed=true]");
  if(pill)pill.textContent=$("stateName").value+(activeState===currentSong().initialStateId?' · Inicial':'');
 };
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
 $("moduleName").oninput=()=>setSlotProperty("name",$("moduleName").value);
 $("moduleSub").oninput=()=>setSlotProperty("sub",$("moduleSub").value);
 $("moduleDeviceTag").oninput=()=>setSlotProperty("deviceTag",$("moduleDeviceTag").value);
 $("moduleKind").onchange=()=>setSlotProperty("kind",$("moduleKind").value);
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
 $("moduleLinkedState").onchange=()=>linkState($("moduleLinkedState").value,activeModule);
 $("indicatorAdd").onclick=()=>{
  if(!currentState())return;
  const id=$("indicatorId").value.trim(),label=$("indicatorLabel").value.trim();
  if(!/^[A-Za-z][A-Za-z0-9_-]{0,49}$/.test(id)||!label){
   notice("Escribe un identificador válido y descripción del indicador.",true);return;
  }
  if(currentState().indicators.some(x=>x.id===id)){
   notice("Ese indicador ya existe en este estado.",true);return;
  }
  currentState().indicators.push({id,label,active:$("indicatorActive").checked,
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
  const action=type==="ACTIVATE_STATE"?{type,stateId:target}:
   type==="SELECT_SONG"?{type,songId:target}:
   {type,indicatorId:target,active:$("actionActive").value==="true"};
  const found=bindingFor(working,pair.cc,pair.value);
  if(found)found.actions.push(action);
  else setBindingActions(working,pair.cc,pair.value,[action]);
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
   committed=incoming;
   // Respaldar antes de reemplazar, sin mutar si falla el almacenamiento.
   localStorage.setItem(BACKUP,localStorage.getItem(STORAGE)||JSON.stringify(working));
   localStorage.setItem(STORAGE,JSON.stringify(incoming));
   working=copy(incoming);activeRep=working.repertoires[0].id;
   activeSong=currentRep().songIds[0];activeState=currentSong().stateIds[0];
   activeModule=currentState().displayIndex??0;
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
 $("undo").onclick=()=>{
  const backup=localStorage.getItem(BACKUP);if(!backup||!allowLeaving())return;
  if(!window.confirm("¿Recuperar la biblioteca guardada antes del último cambio?"))return;
  try{
   const last=normalizeLibrary(JSON.parse(backup));validateLibrary(last);
   const current=JSON.stringify(committed);
   localStorage.setItem(STORAGE,JSON.stringify(last));
   localStorage.setItem(BACKUP,current);
   committed=last;working=copy(last);hasDraft=false;selected();leadSource=formatLeadSheetText(currentSong().leadSheet);
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
 activeRep=working.repertoires[0].id;activeSong=currentRep().songIds[0];
 activeState=currentSong().stateIds[0];activeModule=currentState().displayIndex??0;
 leadSource=formatLeadSheetText(currentSong().leadSheet);
 render();notice(saved?"Biblioteca local cargada. Pulsa Guardar tras editar una sección.":"Editor listo con datos de ejemplo. Busca guardados anteriores desde Biblioteca.");
}
boot().catch(e=>notice("Error iniciando Editor: "+e.message,true));
