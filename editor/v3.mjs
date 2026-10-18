import {resolveLeadSheet,createLeadSheetVariant,selectPlaylistLeadSheet,addSongToPlaylist,syncDefaultLeadSheet} from "../core/lead-sheet-variants.mjs";
import {migrateCatalog,recordCatalogChanges,versionLabel,searchCatalog,versionUsage,duplicateCatalogRepertoire,archiveCatalogVersion,restoreCatalogHistory,setRepertoireNote} from "../core/catalog-v1.mjs";
import {replaceLibrary} from "../core/library-storage.mjs";
import {normalizeLibrary,validateLibrary} from "../core/engine-v1.mjs?v=20261018-leadsheets1";
import {MODULE_COLORS,MODULE_ICONS,normalizeSlot,resolveModuleVisual} from "../core/module-visuals.mjs";
import {prepareLeadSheetText,formatLeadSheetText} from "./lead-sheet-text.mjs?v=20261018-leadsheets1";
import {parseSongCatalog,mergeSongCatalog} from "./catalog-import.mjs?v=20261018-leadsheets1";
import {installCloudSync} from "../core/sync-ui.mjs?v=20261018-persistent1";
import {
 newSong,newRepertoire,renameRepertoire,deleteSong,deleteRepertoire,moveSong,
 newState,duplicateState,deleteState,moveState,deleteBinding,bindingFor,setBindingActions,
 chocolateMatrix,actionDescription,diagnostics
} from "./editor-model.mjs?v=20261018-leadsheets1";

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
const STORAGE="hudLibraryV1",BACKUP="hudLibraryV1Backup",SOURCE="../config/midi-hud-data-v2.json";
const SECTIONS=["song","states","sheet","midi"];
const LABELS={song:"Canción",states:"Estados",sheet:"Lead sheet",midi:"MIDI"};
let committed=null,working=null,activeRep=null,activeSong=null,activeState=null;
let activeModule=0,activeTab="song",hasDraft=false,cc=20,value=127;
let leadSource="",leadParse=null,catalogMode=false,masterSheetId=null;
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
function currentSheet(){
 const song=currentSong();
 if(catalogMode)return song?.leadSheets?.find(sheet=>sheet.id===masterSheetId)||resolveLeadSheet(song);
 return resolveLeadSheet(song,currentRep());
}
function currentState(){return working.states.find(x=>x.id===activeState);}
function currentSlot(i=activeModule){return currentSong().displaySlots?.[i]||{};}
function linkedState(i=activeModule){
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
  if(btn)btn.disabled=!currentSong()||!(hasDraft&&tab===activeTab);
 }
}
function dirty(){
 hasDraft=true;syncStatus();
 $("editorNotice").textContent="Cambios pendientes. Pulsa «Guardar» en "+LABELS[activeTab]+".";
}
function selected(){
 if(!working.repertoires.some(x=>x.id===activeRep))activeRep=working.repertoires[0].id;
 if(catalogMode&&!working.songs.some(s=>s.id===activeSong))catalogMode=false;
 if(!catalogMode&&!currentRep().songIds.includes(activeSong))activeSong=currentRep().songIds[0]??null;
 if(!currentSong()?.stateIds.includes(activeState))activeState=currentSong()?.stateIds[0]??null;
 if(!Number.isInteger(activeModule)||activeModule<0||activeModule>8)activeModule=0;
}
function discard(){
 working=copy(committed);hasDraft=false;
 selected();
 leadSource=formatLeadSheetText(currentSheet()?.leadSheet);
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
 toggle.setAttribute("aria-expanded",String(open));
 toggle.textContent=open?"Cerrar biblioteca":"Biblioteca";
}
function useSong(id){
 if(!currentRep().songIds.includes(id)||!allowLeaving())return;
 catalogMode=false;activeSong=id;activeState=currentSong()?.stateIds[0]??null;
 activeModule=currentState()?.displayIndex??0;
 leadSource=formatLeadSheetText(currentSheet()?.leadSheet);toggleLibrary(false);render();
}
function useRepertoire(id){
 if(!working.repertoires.some(x=>x.id===id)||!allowLeaving())return;
 catalogMode=false;activeRep=id;activeSong=currentRep().songIds[0];
 activeState=currentSong()?.stateIds[0]??null;
 activeModule=currentState()?.displayIndex??0;
 leadSource=formatLeadSheetText(currentSheet()?.leadSheet);toggleLibrary(false);render();
}
function persistLibrary(next,message){
 validateLibrary(next);
 const written=migrateCatalog(next);
 recordCatalogChanges(committed,written);
 written.revision=(Number.isInteger(written.revision)?written.revision:0)+1;
 written.updatedAt=new Date().toISOString();
 const raw=localStorage.getItem(STORAGE);
 if(raw&&!JSON.parse(raw).catalogVersion&&!localStorage.getItem('midiHudCatalogMigrationV1'))
  localStorage.setItem('midiHudCatalogMigrationV1',raw);
 if(raw&&JSON.parse(raw).songs?.some(song=>!song.leadSheets)&&!localStorage.getItem('midiHudLeadSheetsMigrationV1'))
  localStorage.setItem('midiHudLeadSheetsMigrationV1',raw);
 replaceLibrary(localStorage,written,committed);
 committed=written;working=copy(written);hasDraft=false;selected();
 leadSource=formatLeadSheetText(currentSheet()?.leadSheet);
 render();notice(message);
 window.dispatchEvent(new Event("hud-library-saved"));
}
function save(){
 if(!hasDraft||!currentSong())return;
 try{
  if(activeTab==="sheet"){
   const draft=prepareLeadSheetText(currentSheet().leadSheet,leadSource);
   if(draft.errors.length)throw Error("Corrige los errores de las líneas indicadas antes de guardar.");
   if(!draft.leadSheet&&currentSheet().leadSheet&&!window.confirm("¿Eliminar la partitura de este lead sheet?"))return;
   currentSheet().leadSheet=draft.leadSheet;
  }
  syncDefaultLeadSheet(currentSong());
  persistLibrary(working,"Cambios guardados en «"+LABELS[activeTab]+"». Actualiza LIVE para verlos.");
 }catch(error){notice("No se guardó: "+error.message,true);}
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
  row.append(button(versionLabel(s),()=>useSong(id)));
  row.append(make("small",resolveLeadSheet(s,currentRep())?.tono||"—"));
  root.append(row);
 });
 $("songCounter").textContent=ids.length+" canción(es)";
 $("repRemove").disabled=working.repertoires.length<=1;
 $("songRemove").disabled=catalogMode||!currentSong();
 $("songCopy").disabled=!currentSong();
 const index=ids.indexOf(activeSong);
 $("songUp").disabled=catalogMode||index<=0;$("songDown").disabled=catalogMode||index<0||index===ids.length-1;
 $("repHeading").textContent=currentRep().name;
 if(!currentSong()){$("songHeading").textContent="Repertorio vacío";$("songSummary").textContent="Añade versiones desde el catálogo maestro.";return;}
 $("songHeading").textContent=versionLabel(currentSong());
 $("songSummary").textContent=[
  currentSong().author||"Autor pendiente",
  currentSheet()?.tono||"Tonalidad pendiente",
  currentSong().tempoBpm?currentSong().tempoBpm+" BPM":"BPM pendiente",
  currentSong().stateIds.length+" estados",
  currentSong().bank||"Banco pendiente"
 ].join(" · ");
}
function renderSong(){
 const s=currentSong();
 $("songTitle").value=s.title;
 $("songAuthor").value=s.author||"";

 $("songBpm").value=s.tempoBpm??"";
 $("songBank").value=s.bank??"";
 entries("songInitial",s.stateIds.map(id=>[id,working.states.find(st=>st.id===id)?.name||id]),s.initialStateId);
}
function selectState(id){
 if(!currentSong().stateIds.includes(id))return;
 activeState=id;
 if(currentState().displayIndex!=null)activeModule=currentState().displayIndex;
 renderStates();
}
function ensureSlots(){
 const s=currentSong();s.displaySlots??=[];
 while(s.displaySlots.length<9)s.displaySlots.push({name:"—",sub:"Sin asignar"});
}
function normalSlot(index){return normalizeSlot(currentSlot(index),index);}
function renderModules(){
 const area=$("moduleGrid");area.replaceChildren();
 for(let i=0;i<9;i++){
  const slot=normalSlot(i),visual=resolveModuleVisual(slot,i),connected=linkedState(i);
  const tile=button("",()=>{activeModule=i;if(connected)activeState=connected.id;renderStates();},
    "module-select-tile"+(i===activeModule?" is-selected":""));
  tile.style.background="linear-gradient(160deg,"+visual.color+","+visual.dark+")";
  tile.title="Editar módulo "+(i+1)+" · "+slot.name;
  tile.setAttribute("aria-pressed",String(i===activeModule));
  tile.append(make("span",i+1,"tile-num"));
  tile.append(make("span",visual.glyph||" ","tile-symbol"));
  tile.append(make("span",slot.name,"tile-name"));
  tile.append(make("span",connected?connected.name:"Sin estado","tile-hint"));
  area.append(tile);
 }
 $("selectedModuleLabel").textContent=String(activeModule+1);
 const slot=normalSlot(activeModule),visual=resolveModuleVisual(slot,activeModule);
 $("moduleName").value=slot.name;
 $("moduleSub").value=slot.sub;
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
 const tile=$("modulePreview");
 tile.style.setProperty("--module-light",visual.light);
 tile.style.setProperty("--module-dark",visual.dark);
 $("modulePreviewIcon").textContent=visual.glyph;
 $("modulePreviewName").textContent=slot.name;
 $("modulePreviewSub").textContent=slot.sub;
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
 const st=currentState(),index=states.indexOf(st.id);
 $("stateUp").disabled=index<=0;$("stateDown").disabled=index>=states.length-1;
 $("stateRemove").disabled=states.length<=1;
 $("stateName").value=st.name;
 entries("stateSlot",[["","Sin módulo"]].concat(
  Array.from({length:9},(_,i)=>[i,(i+1)+" · "+normalSlot(i).name])
 ),st.displayIndex??"");
 $("statePatch").value=st.gtPatch??"";
 entries("indicatorSlot",[["","Sin módulo"]].concat(
  Array.from({length:9},(_,i)=>[i,(i+1)+" · "+normalSlot(i).name])
 ),"");
 const list=$("indicatorList");list.replaceChildren();
 if(!st.indicators?.length)list.append(make("p","Sin indicadores.","help"));
 for(const indicator of st.indicators||[]){
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
 ensureSlots();
 const base=normalSlot(activeModule);
 currentSong().displaySlots[activeModule]={...base,[key]:value};
 dirty();
 const visual=resolveModuleVisual(currentSlot(),activeModule);
 $("modulePreview").style.setProperty("--module-light",visual.light);
 $("modulePreview").style.setProperty("--module-dark",visual.dark);
 $("modulePreviewIcon").textContent=visual.glyph;
 $("modulePreviewName").textContent=normalSlot(activeModule).name;
 $("modulePreviewSub").textContent=normalSlot(activeModule).sub;
 // Refrescar solo la matriz (sin borrar campos en curso).
 const tiles=$("moduleGrid").children;
 const tile=tiles[activeModule];
 if(tile){
  tile.style.background="linear-gradient(160deg,"+visual.color+","+visual.dark+")";
  tile.querySelector(".tile-symbol").textContent=visual.glyph||" ";
  tile.querySelector(".tile-name").textContent=normalSlot(activeModule).name;
 }
}
function linkState(id,index){
 const previous=working.states.find(s=>s.songId===activeSong&&s.displayIndex===index);
 if(previous&&previous.id!==id)previous.displayIndex=null;
 if(id){
  const target=working.states.find(st=>st.id===id);
  if(!target||target.songId!==activeSong)throw Error("Estado no pertenece a la canción.");
  target.displayIndex=index;
  activeState=id;
 }else if(previous)previous.displayIndex=null;
 dirty();renderStates();
}
function changeStateField(key,value){
 const st=currentState();
 const oldName=st.name;
 st[key]=value;
 if(key==="name"&&st.displayIndex!=null){
  const sl=normalSlot(st.displayIndex);
  if(sl.name===oldName){
   ensureSlots();
   currentSong().displaySlots[st.displayIndex]={...sl,name:value};
  }
 }
 dirty();
}
function renderLead(){
 $("leadText").value=leadSource;
 const area=$("leadText");
 area.scrollTop=0;paintLead();
}
function paintLead(){
 const textarea=$("leadText");
 leadParse=prepareLeadSheetText(currentSheet().leadSheet,leadSource);
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
  songId:activeSong,startCC:Number($("matrixStart").value),value:Number($("matrixValue").value)
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
 const found=bindingFor(working,cc,value,activeSong);
 if(!found)return;
 setBindingActions(working,cc,value,found.actions,activeSong);
 const current=bindingFor(working,cc,value,activeSong);
 action(current);
 if(!current.actions.length)deleteBinding(working,cc,value,activeSong);
 dirty();renderMidi();
}
function renderMidi(){
 $("midiCC").value=String(cc);$("midiValue").value=String(value);
 renderMidiMatrix();
 midiTarget();
 const b=bindingFor(working,cc,value,activeSong),root=$("midiActionList");
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
   deleteBinding(working,cc,value,activeSong);dirty();renderMidi();
  },"small danger"));
 }
 const table=$("bindingsTable");table.replaceChildren();
 const effective=new Map(working.bindings.map(b=>[b.cc+":"+b.value,b]));
 for(const b of currentSong().midiBindings||[])effective.set(b.cc+":"+b.value,b);
 const bindings=[...effective.values()].filter(b=>b.actions.length).sort((a,b)=>a.cc-b.cc||a.value-b.value);
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
 selected();sidebar();renderCatalog();
 const empty=!currentSong();
 $("emptyPlaylist").hidden=!empty;
 for(const node of document.querySelectorAll("[data-tab]"))node.disabled=empty;
 if(!empty){renderSong();renderStates();}
 if(!empty&&activeTab==="sheet"){renderLeadSheetFields();renderLead();}
 else if(!empty&&activeTab==="midi")renderMidi();
 for(const node of document.querySelectorAll("[data-tab]")){
  const on=node.dataset.tab===activeTab;
  node.classList.toggle("active",on);
  node.setAttribute("aria-selected",String(on));
 }
 for(const node of document.querySelectorAll("[data-panel]"))
  node.hidden=empty||node.dataset.panel!==activeTab;
 $("undo").disabled=!localStorage.getItem(BACKUP);
 syncStatus();
}
function register(){
 $("libraryToggle").onclick=()=>toggleLibrary();
 for(const node of document.querySelectorAll("[data-tab]"))
  node.onclick=()=>updateTab(node.dataset.tab);
 $("repSelect").onchange=e=>useRepertoire(e.target.value);
 // Formulario integrado: los cuadros window.prompt se bloquean en algunos navegadores.
 const repForm=$("repForm"),repInput=$("repNameInput");
 let repFormMode="create";
 const closeRepForm=()=>{
  repForm.hidden=true;
  repInput.value="";
  repInput.setCustomValidity("");
 };
 const openRepForm=mode=>{
  repFormMode=mode;
  $("repFormHeading").textContent=mode==="create"?"Crear repertorio":mode==="duplicate"?"Duplicar repertorio":"Renombrar repertorio";
  $("repFormSubmit").textContent=mode==="create"?"Crear":"Guardar nombre";
  repInput.value=mode==="create"?"":currentRep().name+(mode==="duplicate"?" (copia)":"");
  repInput.setCustomValidity("");
  repForm.hidden=false;
  toggleLibrary(true);
  repInput.focus();
  if(mode==="rename")repInput.select();
 };
 $("repAdd").onclick=()=>openRepForm("create");
 $("repDuplicate").onclick=()=>openRepForm("duplicate");
 $("repRename").onclick=()=>openRepForm("rename");
 $("repFormCancel").onclick=closeRepForm;
 repInput.addEventListener("input",()=>repInput.setCustomValidity(""));
 repForm.addEventListener("keydown",event=>{
  if(event.key==="Escape"){event.preventDefault();closeRepForm();}
 });
 repForm.addEventListener("submit",event=>{
  event.preventDefault();
  const name=repInput.value.trim();
  if(!name){
   repInput.setCustomValidity("Escribe un nombre para el repertorio.");
   repInput.reportValidity();
   return;
  }
  let saved;
  if(repFormMode==="create"){
   saved=immediate(db=>{
    catalogMode=false;
    const id=newRepertoire(db,name);
    activeRep=id;
    activeSong=db.repertoires.find(r=>r.id===id).songIds[0];
    activeState=db.songs.find(s=>s.id===activeSong)?.stateIds[0]??null;
    activeModule=0;
    activeTab="song";
    return true;
   },"Repertorio «"+name+"» creado.");
  }else if(repFormMode==="duplicate"){
   saved=immediate(db=>{catalogMode=false;activeRep=duplicateCatalogRepertoire(db,activeRep,name);activeSong=null;return true;},"Lista duplicada con referencias compartidas.");
  }else{
   const id=activeRep;
   saved=immediate(db=>{renameRepertoire(db,id,name);return true;},
    "Repertorio renombrado a «"+name+"».");
  }
  if(saved===true)closeRepForm();
 });
 $("repRemove").onclick=()=>{
  if(window.confirm("¿Eliminar esta lista? Las versiones del catálogo se conservan."))
   immediate(db=>deleteRepertoire(db,activeRep),"Repertorio eliminado.");
 };
 $("songAdd").onclick=immediate.bind(null,db=>{
  catalogMode=false;
  const id=newSong(db,activeRep);
  activeSong=id;activeState=db.songs.find(s=>s.id===id).stateIds[0];
  activeTab="song";
 },"Canción creada.");
 $("songCopy").onclick=()=>{updateTab("sheet");if(activeTab==="sheet")$("newVariantName").focus();};
 $("songRemove").onclick=()=>{
  if(window.confirm("¿Quitar esta versión de la lista? Se conserva en el catálogo maestro."))
   immediate(db=>deleteSong(db,activeRep,activeSong),"Canción eliminada.");
 };
 $("songUp").onclick=()=>immediate(db=>moveSong(db,activeRep,activeSong,-1),"Orden de canciones actualizado.");
 $("songDown").onclick=()=>immediate(db=>moveSong(db,activeRep,activeSong,1),"Orden de canciones actualizado.");
 for(const [id,key] of [
  ["songTitle","title"],["songAuthor","author"],["songBpm","tempoBpm"],["songBank","bank"]
 ]){
  $(id).addEventListener("input",()=>{
   const raw=$(id).value;
   currentSong()[key]=key==="tempoBpm"?(raw===""?null:Number(raw)):
    key==="title"?raw:key==="author"?raw.trim():raw.trim()||null;
   dirty();
  });
 }
 $("songInitial").onchange=()=>{
  currentSong().initialStateId=$("songInitial").value;dirty();
 };
 $("songSave").onclick=save;
 $("stateAdd").onclick=()=>{
  const id=newState(working,activeSong);
  activeState=id;
  const free=Array.from({length:9},(_,i)=>i).find(i=>!linkedState(i));
  if(free!==undefined){
   currentState().displayIndex=free;
   activeModule=free;ensureSlots();
   const old=normalSlot(free);
   if(old.name==="—")working.songs.find(s=>s.id===activeSong).displaySlots[free]={...old,name:"Nuevo estado"};
  }
  dirty();renderStates();renderSong();
 };
 $("stateCopy").onclick=()=>{
  activeState=duplicateState(working,activeState);
  dirty();renderStates();renderSong();
 };
 $("stateRemove").onclick=()=>{
  if(!window.confirm("¿Eliminar este estado y las asociaciones MIDI que lo usen?"))return;
  deleteState(working,activeState);activeState=currentSong()?.stateIds[0]??null;
  dirty();renderStates();renderSong();
 };
 $("stateUp").onclick=()=>{moveState(working,activeState,-1);dirty();renderStates();renderSong();};
 $("stateDown").onclick=()=>{moveState(working,activeState,1);dirty();renderStates();renderSong();};
 $("stateName").oninput=()=>{
  changeStateField("name",$("stateName").value);
  const pill=$("stateList").querySelector("[aria-pressed=true]");
  if(pill)pill.textContent=$("stateName").value;
 };
 $("statePatch").oninput=()=>changeStateField("gtPatch",
  $("statePatch").value===""?null:Number($("statePatch").value));
 $("stateSlot").onchange=()=>{
  const idx=$("stateSlot").value;
  const previous=currentState().displayIndex;
  if(idx==="")currentState().displayIndex=null;
  else{
   const next=Number(idx);
   const occupant=linkedState(next);
   if(occupant&&occupant.id!==activeState)occupant.displayIndex=null;
   currentState().displayIndex=next;activeModule=next;
  }
  if(previous!==currentState().displayIndex){dirty();renderStates();}
 };
 $("moduleName").oninput=()=>setSlotProperty("name",$("moduleName").value);
 $("moduleSub").oninput=()=>setSlotProperty("sub",$("moduleSub").value);
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
  const found=bindingFor(working,pair.cc,pair.value,activeSong);
  if(found)setBindingActions(working,pair.cc,pair.value,[...found.actions,action],activeSong);
  else setBindingActions(working,pair.cc,pair.value,[action],activeSong);
  cc=pair.cc;value=pair.value;
  dirty();renderMidi();
 };
 $("midiSave").onclick=save;
 // Importación aditiva del catálogo: jamás reemplaza estados, lead sheets ni asignaciones MIDI.
 async function importCatalogText(text){
  try{
   if(!allowLeaving())return;
   const entries=parseSongCatalog(text);
   const {library,stats}=mergeSongCatalog(committed,activeRep,entries);
   const changed=stats.added+stats.linked+stats.authorsCompleted;
   if(!changed){
    $("catalogNotice").textContent=stats.read+" canciones revisadas: todas estaban registradas.";
    return;
   }
   const target=currentRep().name;
   const confirmation="Importar "+stats.read+" canciones a «"+target+"»?"+
    "\nNuevas: "+stats.added+" · Vinculadas: "+stats.linked+
    " · Autores completados: "+stats.authorsCompleted+
    "\nSe conservarán todos los estados, configuraciones MIDI y lead sheets actuales.";
   if(!window.confirm(confirmation))return;
   persistLibrary(library,"Catálogo importado: "+stats.added+" nuevas, "+stats.linked+
     " vinculadas y "+stats.authorsCompleted+" autores completados.");
   $("catalogNotice").textContent="Correcto: "+stats.read+" entradas leídas · "+
     stats.added+" añadidas · "+stats.linked+" vinculadas · "+
     stats.authorsCompleted+" autores actualizados. No se eliminaron canciones.";
  }catch(error){
   $("catalogNotice").textContent="No se importó: "+error.message;
   notice("Importación de catálogo: "+error.message,true);
  }
 }
 $("catalogImport").onclick=()=>importCatalogText($("catalogPaste").value);
 $("catalogClipboard").onclick=async()=>{
  try{
   if(!navigator.clipboard?.readText)throw Error("Acceso al portapapeles no disponible.");
   const content=await navigator.clipboard.readText();
   if(!content.trim())throw Error("El portapapeles está vacío.");
   $("catalogPaste").value=content;
   $("catalogNotice").textContent="Tabla pegada. Pulsa «Importar al repertorio activo» para revisarla.";
  }catch(error){
   $("catalogPaste").focus();
   $("catalogNotice").textContent="Pega con Ctrl+V (o pulsación larga en iPhone) y después pulsa Importar. "+error.message;
  }
 };
 $("catalogFileBtn").onclick=()=>$("catalogFile").click();
 $("catalogFile").onchange=async event=>{
  const file=event.target.files?.[0];event.target.value="";
  if(!file)return;
  if(file.size>2000000){
   $("catalogNotice").textContent="CSV demasiado grande (máximo 2 MB).";return;
  }
  try{
   const content=await file.text();
   $("catalogPaste").value=content;
   await importCatalogText(content);
  }catch(error){$("catalogNotice").textContent="Error leyendo CSV: "+error.message;}
 };
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
   persistLibrary(incoming,"Biblioteca importada.");
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
   committed=migrateCatalog(last);working=copy(committed);hasDraft=false;selected();leadSource=formatLeadSheetText(currentSheet()?.leadSheet);
   render();notice("Se ha recuperado el guardado anterior.");
  }catch(e){notice("Error al deshacer: "+e.message,true);}
 };
 window.addEventListener("beforeunload",event=>{
  if(hasDraft){event.preventDefault();event.returnValue="";}
 });
}

function renderCatalog(){
 const root=$("masterResults");root.replaceChildren();
 for(const item of searchCatalog(working,$("masterSearch").value,{includeArchived:$("masterArchived").checked})){
  const row=make("div",undefined,"group");
  row.append(button(item.label+(item.archived?" · Archivada":""),()=>{
   if(!allowLeaving())return;catalogMode=true;masterSheetId=null;activeSong=item.id;activeState=currentSong().initialStateId;
   activeModule=currentState().displayIndex??0;leadSource=formatLeadSheetText(currentSheet()?.leadSheet);render();
  },"small"));
  const song=working.songs.find(s=>s.id===item.id),included=currentRep().songIds.includes(item.id);
  const choice=make("select");choice.setAttribute("aria-label","Lead sheet de "+song.title);
  entries(choice,song.leadSheets.map(sheet=>[sheet.id,sheet.name+" · "+(sheet.tono||"Sin tonalidad")]),resolveLeadSheet(song,currentRep()).id);
  row.append(choice);
  if(included)row.append(make("small","Ya incluida en esta playlist"));
  const add=button(included?"Aplicar lead sheet":"+ Añadir a playlist",()=>immediate(db=>{
   addSongToPlaylist(db,activeRep,item.id,choice.value);catalogMode=false;activeSong=item.id;
  },included?"Lead sheet actualizado en esta playlist.":"Canción vinculada con el lead sheet elegido."),"small");
  add.disabled=item.archived;row.append(add);root.append(row);
 }
 const song=currentSong();$("sharedControls").hidden=!song;if(!song)return;
 const usage=versionUsage(working,song.id);
 $("sharedWarning").textContent="Canción maestra compartida por "+usage.length+" playlist(s): "+usage.map(r=>r.name).join(", ")+". Los estados, controles y expresiones son comunes; cada playlist conserva su elección de lead sheet y tonalidad.";
 $("versionSave").textContent=activeTab==="sheet"?"Guardar este lead sheet":"Guardar cambios compartidos";
 $("versionArchive").textContent=song.catalog.archived?"Restaurar versión archivada":"Archivar versión";
 entries("versionHistory",song.catalog.history.map(h=>[h.id,h.createdAt+" · "+h.reason]),$("versionHistory").value);
 $("versionRestore").disabled=!song.catalog.history.length;
 $("occasionNoteWrap").hidden=catalogMode;$("occasionSave").hidden=catalogMode;
 $("occasionNote").value=currentRep().entryNotes?.[song.id]||"";
}
function renderLeadSheetFields(){
 const sheet=currentSheet();if(!sheet)return;
 entries("leadSheetSelect",currentSong().leadSheets.map(s=>[s.id,s.name+" · "+(s.tono||"Sin tonalidad")]),sheet.id);
 $("leadSheetName").value=sheet.name;$("songTone").value=sheet.tono||"";$("leadNotation").value=sheet.notation;
 $("leadSheetScope").textContent=catalogMode?"Editas un lead sheet del maestro. Las playlists que lo usan reciben sus correcciones.":"Esta elección pertenece solo a «"+currentRep().name+"». Guardar el contenido o la tonalidad actualiza las playlists que usan este mismo lead sheet.";
}
function registerCatalog(){
 $("masterSearch").oninput=renderCatalog;$("masterArchived").onchange=renderCatalog;
 $("versionSave").onclick=save;
 $("masterNew").onclick=()=>immediate(db=>{
  activeSong=newSong(db,null);catalogMode=true;activeState=db.songs.find(s=>s.id===activeSong).initialStateId;
 },"Canción creada en el maestro. Puedes prepararla y añadirla a una playlist después.");
 $("leadSheetSelect").onchange=()=>{
  const id=$("leadSheetSelect").value;
  if(!allowLeaving()){renderLeadSheetFields();return;}
  if(catalogMode){masterSheetId=id;leadSource=formatLeadSheetText(currentSheet()?.leadSheet);render();}
  else immediate(db=>selectPlaylistLeadSheet(db,activeRep,activeSong,id),"Lead sheet seleccionado solo para esta playlist.");
 };
 for(const [id,key] of [["leadSheetName","name"],["songTone","tono"],["leadNotation","notation"]]){
  const change=()=>{currentSheet()[key]=$(id).value.trim()||(key==="tono"?null:"");dirty();};
  $(id).addEventListener(id==="leadNotation"?"change":"input",change);
 }
 $("versionNew").onclick=()=>{
  const previousMaster=masterSheetId;
  try{
   const parsed=prepareLeadSheetText(currentSheet().leadSheet,leadSource);
   if(leadSource.trim()&&parsed.errors.length)throw Error("Corrige la partitura antes de crear la variante.");
   const next=copy(committed),song=next.songs.find(s=>s.id===activeSong),draft=currentSheet();
   const id=createLeadSheetVariant(song,{name:$("newVariantName").value,sourceId:draft.id,
    leadSheet:parsed.leadSheet,tono:draft.tono,notation:draft.notation});
   if(catalogMode)masterSheetId=id;else selectPlaylistLeadSheet(next,activeRep,activeSong,id);
   persistLibrary(next,"Nueva variante de lead sheet creada. La anterior y los controles se conservan.");
   $("newVariantName").value="";
  }catch(error){masterSheetId=previousMaster;notice("No se creó el lead sheet: "+error.message,true);}
 };
 $("versionArchive").onclick=()=>immediate(db=>archiveCatalogVersion(db,activeSong,!currentSong().catalog.archived),"Estado de archivo actualizado. Las referencias se conservan.");
 $("versionRestore").onclick=()=>{
  const id=$("versionHistory").value;if(!id)return;
  if(!window.confirm("¿Recuperar este guardado en todas las listas que usan esta versión? El estado actual quedará en el historial."))return;
  immediate(db=>restoreCatalogHistory(db,activeSong,id),"Guardado recuperado en la versión compartida.");
 };
 $("occasionSave").onclick=()=>{
  const note=$("occasionNote").value;
  immediate(db=>setRepertoireNote(db,activeRep,activeSong,note),"Nota guardada solo en esta lista.");
 };
}

async function boot(){
 register();registerCatalog();
 let library=null;
 const saved=localStorage.getItem(STORAGE);
 if(saved){
  try{library=normalizeLibrary(JSON.parse(saved));validateLibrary(library);}
  catch(error){console.warn("Editor v3: biblioteca local inválida (sin reemplazar)",error);}
 }
 if(!library){
  const response=await fetch(SOURCE,{cache:"no-store"});
  if(!response.ok)throw Error("No es posible cargar la biblioteca de ejemplo.");
  library=normalizeLibrary(await response.json());validateLibrary(library);
 }
 committed=migrateCatalog(library);working=copy(committed);
 activeRep=working.repertoires[0].id;activeSong=currentRep().songIds[0];
 activeState=currentSong()?.stateIds[0]??null;activeModule=currentState()?.displayIndex??0;
 leadSource=formatLeadSheetText(currentSheet()?.leadSheet);
 render();notice(saved?"Biblioteca local cargada. Pulsa Guardar tras editar una sección.":"Editor listo con datos de ejemplo.");
 installCloudSync({
  host:$("cloudSync"),storage:localStorage,mode:"editor",
  // Nunca publicar el repertorio de demostración como si fuera una biblioteca guardada.
  getLocal:()=>{
   const saved=localStorage.getItem(STORAGE);
   return saved?normalizeLibrary(JSON.parse(saved)):null;
  },
  canApply:()=>!hasDraft,
  onApplied:next=>{
   // No persistir de nuevo: el controlador ya guardó y respaldó la versión recibida.
   committed=migrateCatalog(next);validateLibrary(committed);
   working=copy(committed);hasDraft=false;
   selected();leadSource=formatLeadSheetText(currentSheet()?.leadSheet);
   render();notice("Repertorios y configuraciones recibidos desde Google Drive.");
  }
 });
}
boot().catch(e=>notice("Error iniciando Editor: "+e.message,true));
