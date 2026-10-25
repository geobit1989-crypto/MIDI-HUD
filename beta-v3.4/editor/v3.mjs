import {scanNotation} from "./chord-notation.mjs";
import {prepareLeadSheetSave,convertLeadSheetDraft} from "./sheet-save.mjs";
import {LIBRARY_KEY,BACKUP_KEY,readLibrarySource,saveLibrary,replaceLibrary} from "../core/library-storage.mjs?v=20261016-editor-audit1";
import {normalizeLibrary,validateLibrary} from "../core/engine-v1.mjs?v=20261016-patch2";
import {resolveLiveSelection} from "../core/live-selection-v34.mjs?v=20261016-repertoires1";
import {createLibraryTransferUrl} from "../core/library-transfer-v34.mjs?v=20261016-transfer1";
import {installCloudSync} from "../core/sync-ui.mjs?v=20261016-native1";
import {MODULE_COLORS,MODULE_ICONS,normalizeSlot,resolveModuleVisual} from "../core/module-visuals.mjs?v=20261016-overlays1";
import {parseLeadSheetText,formatLeadSheetText} from "./lead-sheet-text.mjs";
import {findRecoverable,mergeRecoveredRepertoire} from "./recovery-v1.mjs?v=20261016-patch2";
import {resolveLeadSheet,createLeadSheetVariant,selectPlaylistLeadSheet,addSongToPlaylist,syncDefaultLeadSheet} from "../core/lead-sheet-variants.mjs";
import {migrateCatalog,recordCatalogChanges,versionLabel,searchCatalog,versionUsage,duplicateCatalogRepertoire,archiveCatalogVersion,restoreCatalogHistory,setRepertoireNote} from "../core/catalog-v1.mjs";
import {prepareLeadSheetText} from "./lead-sheet-text.mjs";
import {parseSongCatalog,mergeSongCatalog} from "./catalog-import.mjs";
import {
 newSong,newRepertoire,renameRepertoire,deleteSong,deleteRepertoire,moveSong,
 newState,duplicateState,deleteState,moveState,deleteBinding,bindingFor,setBindingActions,
 chocolateMatrix,actionDescription,diagnostics,addModule,moveModule,removeModule,
 newStateWithModule,duplicateStateWithModule,assignStateModule,setInitialState,useModuleAsInitialState,ensureModuleState,
 addConfiguredModule,renameModule,setModulePurpose,modulePurpose,
 moduleActivation,setModuleActiveOnEntry,moduleActivationActions
} from "./editor-model.mjs?v=20261016-overlays1";

/**
 * Editor MIDI HUD v3
 * - Cuatro secciones: Canción, Estados, Lead sheet y MIDI.
 * - Borrador local recuperable, separado de la biblioteca confirmada.
 * - Un único "Guardar" global valida y confirma la copia completa.
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
let leadSource="",leadParse=null,catalogMode=false,masterSheetId=null;
let saving=false,leadDrafts=new Map(),isLeaving=false,draftStoreError=false,editSequence=0;
const DRAFT_KEY="midiHudEditorDraftV6";
function draftBase(){return [committed.libraryId??null,committed.revision??0,committed.updatedAt??null];}
function clearDrafts(){
 leadDrafts.clear();draftStoreError=false;
 // La confirmación ya escrita sigue siendo válida si falla la limpieza.
 // Su nueva revisión impide recuperar el borrador anterior.
 try{localStorage.removeItem(DRAFT_KEY);}catch{draftStoreError=true;}
}
function persistDraft(){
 if(!committed||!working)return;
 try{
  const record={version:1,base:draftBase(),working,leadDrafts:[...leadDrafts],activeRep,activeSong,activeState,activeModule,activeTab,catalogMode,masterSheetId};
  const raw=JSON.stringify(record);localStorage.setItem(DRAFT_KEY,raw);
  if(localStorage.getItem(DRAFT_KEY)!==raw)throw Error("No se pudo verificar la copia del borrador.");
  draftStoreError=false;
 }catch(error){
  draftStoreError=true;
  $("editorNotice").textContent="No se pudo proteger el borrador en disco: "+error.message;
  $("editorNotice").style.background="#3e1b26";
 }
}
function refreshLeadSource(){const sheet=currentSheet();leadSource=sheet?(leadDrafts.get(sheet.id)??formatLeadSheetText(sheet.leadSheet)):"";}
function restoreDraft(){
 let raw;try{raw=localStorage.getItem(DRAFT_KEY);}catch{draftStoreError=true;return false;}
 if(!raw)return false;
 let data;try{data=JSON.parse(raw);}catch{return false;}
 if(data.version!==1||JSON.stringify(data.base)!==JSON.stringify(draftBase())||!data.working||!Array.isArray(data.leadDrafts))return false;
 working=data.working;leadDrafts=new Map(data.leadDrafts);
 activeRep=data.activeRep;activeSong=data.activeSong;activeState=data.activeState;activeModule=data.activeModule;
 activeTab=SECTIONS.includes(data.activeTab)?data.activeTab:"song";
 catalogMode=!!data.catalogMode;masterSheetId=data.masterSheetId;
 hasDraft=true;return true;
}
function confirmationTime(){
 const date=new Date(committed?.updatedAt);
 return !committed?.updatedAt||Number.isNaN(date.getTime())?"Último guardado: no disponible":
  "Último guardado: "+new Intl.DateTimeFormat("es-ES",{dateStyle:"short",timeStyle:"short"}).format(date);
}
function confirmEditorExit(href){
 if(!hasDraft){window.location.assign(href);return;}
 const dialog=make("dialog");
 dialog.style.cssText="width:min(520px,calc(100vw - 24px));background:#122535;color:white;border:1px solid #7290a7;border-radius:12px;padding:20px";
 const actions=make("div");actions.style.cssText="display:flex;gap:10px;flex-wrap:wrap";
 const leave=()=>{isLeaving=true;window.location.assign(href);};
 actions.append(button("Guardar y salir",async()=>{await save();if(!hasDraft){dialog.close();leave();}},"primary"),
  button("Seguir editando",()=>dialog.close()),
  button("Salir sin confirmar",()=>{dialog.close();leave();}));
 dialog.append(make("h2","Cambios sin confirmar"),make("p","Tu borrador queda protegido, pero LIVE solo utiliza la última biblioteca confirmada."),actions);
 document.body.append(dialog);dialog.addEventListener("close",()=>dialog.remove(),{once:true});dialog.showModal();
}
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
  notice('«'+currentState().name+'» será el estado inicial. Confirma con Guardar al finalizar.');
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
 const failed=error||draftStoreError;
 $("saveStatus").textContent=failed?"Revisar borrador":hasDraft?"Borrador pendiente":"Confirmado";
 $("saveStatus").style.color=failed?"#ffb2ad":hasDraft?"#ffd38c":"#9fe6cc";
 $("lastConfirmedSave").textContent=confirmationTime();
 $("saveAll").disabled=saving||!hasDraft;
 for(const tab of SECTIONS){
  const label=$(tab+"Dirty"),btn=$(tab+"Save");
  if(label){label.textContent=hasDraft?"Borrador protegido; guardar al finalizar":"Sin cambios pendientes";label.classList.toggle("pending",hasDraft);}
  if(btn)btn.disabled=saving||!hasDraft;
 }
}
function dirty(){
 editSequence++;hasDraft=true;persistDraft();syncStatus();
 if(!draftStoreError)$("editorNotice").textContent="Borrador protegido. Cambia de pestaña libremente; pulsa «Guardar» al finalizar.";
}
function selected(){
 if(!working.repertoires.some(x=>x.id===activeRep))activeRep=working.repertoires[0].id;
 if(catalogMode&&!working.songs.some(s=>s.id===activeSong))catalogMode=false;
 if(!catalogMode&&!currentRep().songIds.includes(activeSong))activeSong=currentRep().songIds[0]??null;
 if(activeState!==null&&!currentSong()?.stateIds.includes(activeState))activeState=currentSong()?.stateIds[0]??null;
 if(currentState())activeModule=currentState().displayIndex??null;
 else if(activeModule!==null&&(!Number.isInteger(activeModule)||activeModule<0||activeModule>=(currentSong()?.displaySlots?.length||0)))activeModule=null;
}
function discard(){
 working=copy(committed);hasDraft=false;clearDrafts();selected();refreshLeadSource();
}
function allowLeaving(){
 if(!hasDraft)return true;
 if(!window.confirm("Esta acción reemplazará tu borrador. ¿Descartar cambios sin confirmar?"))return false;
 discard();return true;
}
function updateTab(tab){if(tab!==activeTab){activeTab=tab;render();}}
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
 if(!currentRep().songIds.includes(id))return;
 catalogMode=false;activeSong=id;activeState=currentSong()?.stateIds[0]??null;
 activeModule=currentState()?.displayIndex??0;
 refreshLeadSource();toggleLibrary(false);render();
}
function useRepertoire(id){
 if(!working.repertoires.some(x=>x.id===id)){$("repSelect").value=activeRep;return;}
 catalogMode=false;activeRep=id;activeSong=currentRep().songIds[0];
 activeState=currentSong()?.stateIds[0]??null;
 activeModule=currentState()?.displayIndex??0;
 refreshLeadSource();toggleLibrary(false);render();
}
function persistLibrary(next,message){
 const current=readLibrarySource(localStorage);
 if(current&&JSON.stringify(migrateCatalog(JSON.parse(current)))!==JSON.stringify(committed))
  throw Error("La biblioteca confirmada cambió en otra sesión. Conserva el borrador y revisa los cambios antes de reemplazarla.");
 validateLibrary(next);
 const written=migrateCatalog(next);
 recordCatalogChanges(committed,written);
 written.revision=(Number.isInteger(written.revision)?written.revision:0)+1;
 written.updatedAt=new Date().toISOString();
 const raw=readLibrarySource(localStorage);
 if(raw&&!JSON.parse(raw).catalogVersion&&!localStorage.getItem('midiHudCatalogMigrationV1'))
  localStorage.setItem('midiHudCatalogMigrationV1',raw);
 if(raw&&JSON.parse(raw).songs?.some(song=>!song.leadSheets)&&!localStorage.getItem('midiHudLeadSheetsMigrationV1'))
  localStorage.setItem('midiHudLeadSheetsMigrationV1',raw);
 replaceLibrary(localStorage,written,committed);
 committed=written;working=copy(written);hasDraft=false;clearDrafts();selected();
 refreshLeadSource();
 render();notice(message);
 window.dispatchEvent?.(new Event('hud-library-saved'));
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
 let failed=false;saving=true;syncStatus();
 const startingEdit=editSequence;
 try{
  const next=copy(working);
  for(const [sheetId,source] of leadDrafts){
   const song=next.songs.find(s=>s.leadSheets?.some(x=>x.id===sheetId));
   if(!song)continue;
   const sheet=song.leadSheets.find(x=>x.id===sheetId);
   if(source===formatLeadSheetText(sheet.leadSheet))continue;
   if(!source.trim()&&sheet.leadSheet&&!window.confirm("¿Eliminar la partitura «"+sheet.name+"»?"))return;
   if(sheet.notation==="grados"){
    const prepared=prepareLeadSheetText(sheet.leadSheet,source);
    if(prepared.errors.length)throw Error("Corrige los errores del lead sheet «"+sheet.name+"».");
    sheet.leadSheet=prepared.leadSheet;
   }else{
    const prepared=await prepareLeadSheetSave(source,{preferredNotation:sheet.chordNotation||song.chordNotation,chooseNotation:awaitNotationChoice});
    if(!prepared)return;
    Object.assign(sheet,prepared);
    if(sheet.id===song.defaultLeadSheetId)song.chordNotation=prepared.chordNotation;
   }
  }
  for(const song of next.songs)syncDefaultLeadSheet(song);
  if(startingEdit!==editSequence)throw Error("El borrador cambió durante la confirmación. Revisa y pulsa Guardar de nuevo.");
  persistLibrary(next,"Cambios confirmados. LIVE se actualiza solo con «Actualizar repertorios».");
 }catch(error){failed=true;notice("No se guardó: "+error.message,true);}
 finally{saving=false;syncStatus(failed);}
}
function immediate(action,message){
 const old=copy(working);
 try{
  const result=action(working);
  selected();refreshLeadSource();dirty();render();
  notice(message+" Quedó en borrador; confirmar con «Guardar».");
  return result;
 }catch(e){working=old;selected();refreshLeadSource();render();notice("No se completó: "+e.message,true);}
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
 $("liveLink").href='../v03.html?v=20261016-repertoires1&repertoire='+encodeURIComponent(activeRep)+'&song='+encodeURIComponent(activeSong);
 $("songTitle").value=s.title;
 $("songAuthor").value=s.author||"";
 $("songCC0").value=s.midiAddress?.cc0??"";$("songPC").value=s.midiAddress?.pc??"";

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
 const slot=currentSlot();
 $('moduleMidiValue').value=slot.midiValue??'';
 $('moduleExpressionCC').value=slot.expressionCC??'';
 $('moduleMidiValue').disabled=!Number.isInteger(activeModule)||slot.kind==='expression';
 $('moduleExpressionCC').disabled=slot.kind!=='expression';

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
  songId:activeSong,startCC:midiNumber("matrixStart"),value:midiNumber("matrixValue")
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
 if(!empty){ensureSlots();renderSong();renderStates();}
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
 for(const field of ['songCC0','songPC'])$(field).addEventListener('input',()=>{
  const cc0=$('songCC0').value,pc=$('songPC').value;
  currentSong().midiAddress=cc0===''&&pc===''?null:{cc0:cc0===''?null:Number(cc0),pc:pc===''?null:Number(pc)};dirty();
 });
 $('moduleMidiValue').addEventListener('input',()=>{setSlotProperty('midiValue',$('moduleMidiValue').value===''?null:Number($('moduleMidiValue').value));});
 $('moduleExpressionCC').addEventListener('change',()=>{setSlotProperty('expressionCC',$('moduleExpressionCC').value===''?null:Number($('moduleExpressionCC').value));});

 $("libraryToggle").onclick=()=>toggleLibrary();
 $("libraryClose").onclick=()=>toggleLibrary(false);
 $("libraryBackdrop").onclick=()=>toggleLibrary(false);
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("editorSidebar").classList.contains("is-open"))toggleLibrary(false);});
 $("scanOld").onclick=scanOldLibraries;
 for(const node of document.querySelectorAll("[data-tab]"))
  node.onclick=()=>updateTab(node.dataset.tab);
 $("repSelect").onchange=e=>useRepertoire(e.target.value);
 const repForm=$('repForm'),repInput=$('repNameInput');let repFormMode='create';
 const closeRepForm=()=>{repForm.hidden=true;};
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
 $("songAddSig").onclick=()=>immediate(db=>{
  const id=newSong(db,activeRep,"Nueva canción SIG","sig");
  activeSong=id;activeState=db.songs.find(s=>s.id===id).stateIds[0];activeModule=0;
  activeTab="song";
 },"Canción SIG creada con cuatro estados y módulos.");
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
  leadSource=$("leadText").value;leadDrafts.set(currentSheet().id,leadSource);dirty();paintLead();
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
   currentSheet().chordNotation=target;
   $("leadText").value=leadSource;leadDrafts.set(currentSheet().id,leadSource);dirty();paintLead();
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
  if(pair.cc===0){notice("CC0 está reservado al banco de canciones; configura CC0 y PC en Canción.",true);return;}
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
  const found=bindingFor(working,pair.cc,pair.value,activeSong);
  if(found)setBindingActions(working,pair.cc,pair.value,[...found.actions,...actions],activeSong);
  else setBindingActions(working,pair.cc,pair.value,actions,activeSong);
  cc=pair.cc;value=pair.value;
  dirty();renderMidi();
 };
 $("midiSave").onclick=save;
 // Importación aditiva del catálogo: jamás reemplaza estados, lead sheets ni asignaciones MIDI.
 async function importCatalogText(text){
  try{
   const entries=parseSongCatalog(text);
   const {library,stats}=mergeSongCatalog(working,activeRep,entries);
   const changed=JSON.stringify(library)!==JSON.stringify(working);
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
   working=library;selected();refreshLeadSource();dirty();render();
   notice("Catálogo incorporado al borrador: "+stats.added+" nuevas y "+stats.linked+" vinculadas. Confirma con Guardar.");
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
   const written=migrateCatalog(incoming);replaceLibrary(localStorage,written,committed);
   committed=written;working=copy(written);clearDrafts();activeRep=working.repertoires[0].id;activeSong=currentRep().songIds[0]??null;
   activeState=currentSong()?.initialStateId??null;activeModule=currentState()?.displayIndex??null;
   hasDraft=false;refreshLeadSource();render();notice('Biblioteca importada.');window.dispatchEvent?.(new Event('hud-library-saved'));

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
   if(hasDraft){
    if(!window.confirm("Hay un borrador sin confirmar. ¿Guardar toda la configuración antes de generar el enlace?"))return;
    await save();if(hasDraft)return;
   }
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
   committed=migrateCatalog(written);working=copy(committed);hasDraft=false;clearDrafts();selected();refreshLeadSource();
   render();notice("Se ha recuperado el guardado anterior.");window.dispatchEvent?.(new Event('hud-library-saved'));
  }catch(e){notice("Error al deshacer: "+e.message,true);}
 };
 $("saveAll").onclick=save;
 document.addEventListener("click",event=>{
  const anchor=event.target.closest?.("a[href]");
  if(!anchor||!hasDraft||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||anchor.hasAttribute("download"))return;
  if(anchor.target&&anchor.target!=="_self")return;
  event.preventDefault();confirmEditorExit(anchor.href);
 });
 window.addEventListener("beforeunload",event=>{
  if(hasDraft&&!isLeaving){event.preventDefault();event.returnValue="";}
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
   if(!window.confirm("¿Añadir «"+found.repertoire.name+"» sin borrar repertorios actuales? Las asignaciones MIDI globales no se fusionarán."))return;
   try{
    const result=mergeRecoveredRepertoire(working,found.library,found.repertoire.id);
    // Conservar copia original independiente del backup de deshacer.
    const archiveKey="hudRecoverySnapshot:"+Date.now();
    localStorage.setItem(archiveKey,found.raw);
    activeRep=result.repertoireId;
    activeSong=result.library.repertoires.find(r=>r.id===activeRep).songIds[0];
    activeState=result.library.songs.find(x=>x.id===activeSong).initialStateId;
    working=result.library;selected();refreshLeadSource();dirty();render();
    notice("Repertorio recuperado en el borrador. El original se conservó; confirma con Guardar.");
    toggleLibrary(false);
   }catch(e){notice("No se pudo recuperar: "+e.message,true);}
  },"small primary"));
  root.append(item);
 }
}

function renderCatalog(){
 const root=$("masterResults");root.replaceChildren();
 for(const item of searchCatalog(working,$("masterSearch").value,{includeArchived:$("masterArchived").checked})){
  const row=make("div",undefined,"group");
  row.append(button(item.label+(item.archived?" · Archivada":""),()=>{
   catalogMode=true;masterSheetId=null;activeSong=item.id;activeState=currentSong().initialStateId;
   activeModule=currentState().displayIndex??0;refreshLeadSource();render();
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
  if(catalogMode){masterSheetId=id;refreshLeadSource();render();}
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
   const next=copy(working),song=next.songs.find(s=>s.id===activeSong),draft=currentSheet();
   const id=createLeadSheetVariant(song,{name:$("newVariantName").value,sourceId:draft.id,
    leadSheet:parsed.leadSheet,tono:draft.tono,notation:draft.notation});
   // Crear desde borrador bifurca las ediciones hacia la nueva variante.
   // El guardado global no debe aplicarlas también al original confirmado.
   const original=committed.songs.find(s=>s.id===song.id)?.leadSheets?.find(s=>s.id===draft.id);
   if(original)song.leadSheets=song.leadSheets.map(s=>s.id===draft.id?copy(original):s);
   leadDrafts.delete(draft.id);
   if(catalogMode)masterSheetId=id;else selectPlaylistLeadSheet(next,activeRep,activeSong,id);
   working=next;refreshLeadSource();dirty();render();notice("Nueva variante preparada como borrador. La anterior se conserva.");
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
 committed=migrateCatalog(library);working=copy(committed);
 activeRep=working.repertoires[0].id;activeSong=currentRep().songIds[0];
 activeState=currentSong()?.stateIds[0]??null;activeModule=currentState()?.displayIndex??0;
 const recovered=restoreDraft();selected();refreshLeadSource();
 render();notice(recovered?"Borrador recuperado. LIVE mantiene la última versión confirmada.":saved?"Biblioteca confirmada. Cambios libres entre pestañas; Guardar al finalizar.":"Editor listo con datos de ejemplo.");
 installCloudSync({
  host:$("cloudSync"),storage:localStorage,mode:"editor",
  // Nunca publicar el repertorio de demostración como si fuera una biblioteca guardada.
  getLocal:()=>{
   const saved=readLibrarySource(localStorage);
   return saved?normalizeLibrary(JSON.parse(saved)):null;
  },
  canApply:()=>!hasDraft&&!saving,
  onApplied:next=>{
   // No persistir de nuevo: el controlador ya guardó y respaldó la versión recibida.
   committed=migrateCatalog(next);validateLibrary(committed);
   working=copy(committed);hasDraft=false;clearDrafts();
   selected();refreshLeadSource();
   render();notice("Repertorios y configuraciones recibidos desde Google Drive.");
  }
 });

 window.MIDIHUD_EDITOR=Object.freeze({hasDraft:()=>hasDraft,getLibrary:()=>copy(committed)});
}
boot().catch(e=>notice("Error iniciando Editor: "+e.message,true));
