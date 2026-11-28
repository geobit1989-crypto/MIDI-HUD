import {LIBRARY_ICONS} from "../core/library-icons.mjs?v=20261128-editor6";
import {appStorage as localStorage,appSessionStorage as sessionStorage} from "../core/environment.mjs?v=20261127-drive7";
import {scanNotation} from "./chord-notation.mjs";
import {prepareLeadSheetSave,convertLeadSheetDraft} from "./sheet-save.mjs";
import {LIBRARY_KEY,BACKUP_KEY,readLibrarySource,saveLibrary,replaceLibrary} from "../core/library-storage.mjs?v=20261127-drive7";
import {normalizeLibrary,validateLibrary,REPERTOIRE_CONTEXT_ID,repertoireContext} from "../core/engine-v1.mjs?v=20261128-library2";
import {resolveLiveSelection} from "../core/live-selection-v34.mjs?v=20261128-library2";
import {installCloudSync} from "../core/sync-ui.mjs?v=20261127-drive7";
import {MODULE_COLORS,MODULE_ICONS,normalizeSlot,resolveModuleVisual} from "../core/module-visuals.mjs?v=20261128-editor6";
import {parseLeadSheetText,formatLeadSheetText} from "./lead-sheet-text.mjs";
import {findRecoverable,mergeRecoveredRepertoire} from "./recovery-v1.mjs?v=20261127-drive7";
import {resolveLeadSheet,createLeadSheetVariant,selectPlaylistLeadSheet,addSongToPlaylist,syncDefaultLeadSheet} from "../core/lead-sheet-variants.mjs";
import {migrateCatalog,recordCatalogChanges,versionLabel,searchCatalog,versionUsage,duplicateCatalogRepertoire,archiveCatalogVersion,restoreCatalogHistory,setRepertoireNote} from "../core/catalog-v1.mjs";
import {prepareLeadSheetText} from "./lead-sheet-text.mjs";
import {parseSongCatalog,mergeSongCatalog} from "./catalog-import.mjs?v=20261128-library2";
import {
 newSong,newRepertoire,renameRepertoire,deleteSong,deleteCatalogSong,deleteRepertoire,moveSong,
 newState,duplicateState,deleteState,moveState,deleteBinding,bindingFor,setBindingActions,
 chocolateMatrix,actionDescription,diagnostics,addModule,moveModule,removeModule,
 newStateWithModule,duplicateStateWithModule,assignStateModule,setInitialState,useModuleAsInitialState,ensureModuleState,
 addConfiguredModule,renameModule,setModulePurpose,modulePurpose,deleteSelectedModule,
 moduleActivation,setModuleActiveOnEntry,moduleActivationActions
} from "./editor-model.mjs?v=20261128-editor6";

/**
 * Editor MIDI HUD v3
 * - Ficha musical editable y tres secciones: Estados, Lead sheet y MIDI.
 * - Borrador local recuperable, separado de la biblioteca confirmada.
 * - Un único "Guardar" global valida y confirma la copia completa.
 * - Color e icono se configuran en Estados junto al módulo asociado.
 * - Compatibilidad con la misma clave y biblioteca del editor v2.
 */
const $=id=>document.getElementById(id);
const copy=x=>JSON.parse(JSON.stringify(x));
const STORAGE=LIBRARY_KEY,BACKUP=BACKUP_KEY,SOURCE="../config/midi-hud-data-v2.json";
const SECTIONS=["states","sheet","midi"];
const LABELS={states:"Estados",sheet:"Lead sheet",midi:"MIDI"};
let committed=null,working=null,activeRep=null,activeSong=null,activeState=null;
let activeModule=0,activeTab="states",hasDraft=false,cc=20,value=127;
let leadSource="",leadParse=null,catalogMode=false,masterSheetId=null;
let libraryView="lists",pickerIds=[],pickerTarget=null,dragSong=null,deleteTarget=null;
let modulePage=0,modulePageSong=null;
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
  notice("No se pudo proteger el borrador en disco: "+error.message,true);
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
 activeTab=SECTIONS.includes(data.activeTab)?data.activeTab:"states";
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
 $("editorNotice").hidden=!error;
 $("editorNotice").style.background=error?"#3e1b26":"var(--accent-bg)";
 $("editorNotice").style.borderColor=error?"#a86167":"var(--accent)";
 syncStatus(error);
}
function syncStatus(error=false){
 const failed=error||draftStoreError;
 $("saveStatus").textContent=failed?"Revisar borrador":hasDraft?"Borrador pendiente":"Confirmado";
 $("saveStatus").style.color=failed?"#ffb2ad":hasDraft?"#ffd38c":"#9fe6cc";
 $("lastConfirmedSave").textContent=confirmationTime();
 $("saveAll").disabled=saving||!hasDraft;
 const saveLabel=failed?"Error de guardado":saving?"Guardando…":hasDraft?"Guardar cambios":"Sin cambios pendientes";
 $("saveAll").setAttribute("aria-label",saveLabel);$("saveAll").setAttribute("title",saveLabel);
 $("saveAll").setAttribute("data-state",failed?"error":saving?"saving":hasDraft?"pending":"confirmed");
 for(const tab of SECTIONS){
  const label=$(tab+"Dirty"),btn=$(tab+"Save");
  if(label){label.textContent=hasDraft?"Borrador protegido; guardar al finalizar":"Sin cambios pendientes";label.classList.toggle("pending",hasDraft);}
  if(btn)btn.disabled=saving||!hasDraft;
 }
}
function dirty(){
 editSequence++;hasDraft=true;persistDraft();syncStatus();renderIdentification();
 if(!draftStoreError)$("editorNotice").hidden=true;
}
function selected(){
 if(!working.repertoires.some(x=>x.id===activeRep))activeRep=working.repertoires[0]?.id??null;
 if(activeRep===null){catalogMode=true;if(!working.songs.some(s=>s.id===activeSong))activeSong=repertoireContext(working).songIds[0]??null;}
 else{
  if(catalogMode&&!working.songs.some(s=>s.id===activeSong))catalogMode=false;
  if(!catalogMode&&!currentRep().songIds.includes(activeSong))activeSong=currentRep().songIds[0]??null;
 }
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
 toggle.setAttribute("aria-label",open?"Cerrar biblioteca":"Biblioteca");
 toggle.title=open?"Cerrar biblioteca":"Biblioteca";
 if(open){showLibraryView(catalogMode?"master":"lists");$("libraryClose").focus();}
 else if(libraryView==="picker"){pickerIds=[];pickerTarget=null;showLibraryView("lists");}
 else if(sidebar.contains(document.activeElement))toggle.focus();
}
function useSong(id){
 if(!currentRep()?.songIds.includes(id))return;
 catalogMode=false;activeSong=id;activeState=currentSong()?.stateIds[0]??null;
 activeModule=currentState()?.displayIndex??0;
 refreshLeadSource();toggleLibrary(false);render();
}
function useRepertoire(id){
 if(!working.repertoires.some(x=>x.id===id)){$("repSelect").value=activeRep;return;}
 catalogMode=false;activeRep=id;activeSong=currentRep().songIds[0];
 activeState=currentSong()?.stateIds[0]??null;
 activeModule=currentState()?.displayIndex??0;
 refreshLeadSource();showLibraryView("lists");render();
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
  if(typeof requestAnimationFrame==="function")await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
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
function showLibraryView(view){
 libraryView=view;
 $("libraryNavigation").hidden=view==="picker"||view==="maintenance";
 $("libraryMaster").hidden=view!=="master";$("libraryListView").hidden=view!=="lists";
 $("librarySelection").hidden=view!=="picker";$("libraryMaintenance").hidden=view!=="maintenance";
 $("libraryRepertoire").setAttribute("aria-pressed",String(view==="master"));$("libraryLists").setAttribute("aria-pressed",String(view==="lists"));
 $("libraryTools").open=false;
}
/* Lucide 0.456.0 — pencil, history, archive, archive-restore, trash-2.
 * https://github.com/lucide-icons/lucide/tree/0.456.0/icons
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
const CATALOG_MENU_ICONS=Object.freeze({
 "pencil": "<svg aria-hidden=\"true\" focusable=\"false\"\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\" />\n  <path d=\"m15 5 4 4\" />\n</svg>",
 "history": "<svg aria-hidden=\"true\" focusable=\"false\"\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\" />\n  <path d=\"M3 3v5h5\" />\n  <path d=\"M12 7v5l4 2\" />\n</svg>",
 "archive": "<svg aria-hidden=\"true\" focusable=\"false\"\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <rect width=\"20\" height=\"5\" x=\"2\" y=\"3\" rx=\"1\" />\n  <path d=\"M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8\" />\n  <path d=\"M10 12h4\" />\n</svg>",
 "archive-restore": "<svg aria-hidden=\"true\" focusable=\"false\"\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <rect width=\"20\" height=\"5\" x=\"2\" y=\"3\" rx=\"1\" />\n  <path d=\"M4 8v11a2 2 0 0 0 2 2h2\" />\n  <path d=\"M20 8v11a2 2 0 0 1-2 2h-2\" />\n  <path d=\"m9 15 3-3 3 3\" />\n  <path d=\"M12 12v9\" />\n</svg>",
 "trash-2": "<svg aria-hidden=\"true\" focusable=\"false\"\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M3 6h18\" />\n  <path d=\"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6\" />\n  <path d=\"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2\" />\n  <line x1=\"10\" x2=\"10\" y1=\"11\" y2=\"17\" />\n  <line x1=\"14\" x2=\"14\" y1=\"11\" y2=\"17\" />\n</svg>"
});
function libraryMenu(label,actions){
 const d=make("details",undefined,"lib-menu"),summary=make("summary","⋯"),items=make("div",undefined,"lib-options");
 summary.setAttribute("aria-label",label);
 for(const action of actions){const btn=button(action[0],()=>{d.open=false;action[1]();},action[2]||"");btn.disabled=!!action[3];if(action[4]){const icon=make("span",undefined,"catalog-action-icon");icon.innerHTML=CATALOG_MENU_ICONS[action[4]];btn.className+=(btn.className?" ":"")+"catalog-action";btn.setAttribute("aria-label",action[0]);btn.replaceChildren(icon,make("span",action[0]));}items.append(btn);}
 d.append(summary,items);return d;
}
function openMasterSong(id){
 catalogMode=true;masterSheetId=null;activeSong=id;activeState=currentSong().initialStateId;activeModule=currentState().displayIndex??0;activeTab="states";
 refreshLeadSource();toggleLibrary(false);render();
}
function beginAddSongs(){
 if(!currentRep())return;
 pickerIds=[];pickerTarget=activeRep;$("pickerSearch").value="";$("pickerNotice").hidden=true;showLibraryView("picker");renderPicker();$("pickerSearch").focus();
}
function renderPicker(){
 const root=$("pickerResults");root.replaceChildren();const rep=working.repertoires.find(r=>r.id===pickerTarget);
 const items=searchCatalog(working,$("pickerSearch").value).sort((a,b)=>a.label.localeCompare(b.label,"es",{sensitivity:"base"}));
 for(const item of items){
  const included=rep?.songIds.includes(item.id),index=pickerIds.indexOf(item.id);
  const row=button("",()=>{pickerIds=pickerIds.includes(item.id)?pickerIds.filter(id=>id!==item.id):[...pickerIds,item.id];renderPicker();},"lib-picker-row");
  row.setAttribute("aria-pressed",String(index>=0));row.disabled=!!included;
  row.append(make("span",item.label),make("span",included?"En lista":index>=0?index+1:"○","lib-number"));root.append(row);
 }
 if(!items.length)root.append(make("p","No hay resultados.","muted"));
 $("confirmAddSongs").textContent="Añadir ("+pickerIds.length+")";$("confirmAddSongs").disabled=!pickerIds.length||!rep;
}
function confirmAddSongs(){
 const ids=[...pickerIds],target=pickerTarget;if(!ids.length)return;
 const result=immediate(db=>{
  const rep=db.repertoires.find(r=>r.id===target);if(!rep||target!==activeRep)throw Error("La lista de destino cambió.");
  const before=rep.songIds.length;for(const id of ids)if(!addSongToPlaylist(db,target,id))throw Error("Una canción ya está incluida.");
  if(rep.songIds.length!==before+ids.length||ids.some((id,i)=>rep.songIds[before+i]!==id))throw Error("No se incorporaron todas las canciones.");
  validateLibrary(db);catalogMode=false;activeSong=ids[0];activeState=null;activeModule=null;return true;
 },ids.length+" canciones añadidas.");
 if(result===true){pickerIds=[];pickerTarget=null;showLibraryView("lists");}
 else{$("pickerNotice").textContent=$("editorNotice").textContent;$("pickerNotice").hidden=false;renderPicker();}
}
function createMasterSong(template){
 immediate(db=>{activeSong=newSong(db,null,template==="sig"?"Nueva canción SIG":"Nueva canción",template);catalogMode=true;masterSheetId=null;activeState=currentSong().initialStateId;activeModule=0;activeTab="states";},"Canción creada en el Repertorio.");
 toggleLibrary(false);
}
function requestCatalogDelete(id){
 const song=working.songs.find(s=>s.id===id);if(!song)return;
 deleteTarget=id;
 const usage=versionUsage(working,id);
 $("deleteSongName").textContent=versionLabel(song);
 $("deleteSongUsage").textContent=usage.length?"Se quitará de "+usage.length+" lista(s): "+usage.map(r=>r.name).join(", ")+".":"No pertenece a ninguna lista.";
 $("deleteSongError").hidden=true;
 $("deleteSongRestriction").hidden=working.songs.length>1;
 $("deleteSongConfirm").disabled=working.songs.length<=1;
 $("deleteSongDialog").showModal();
}
function confirmCatalogDelete(){
 const id=deleteTarget,song=working.songs.find(s=>s.id===id);
 if(!song)return;
 const sheetIds=(song.leadSheets||[]).map(sheet=>sheet.id);
 const result=immediate(db=>{
  deleteCatalogSong(db,id);
  for(const sheetId of sheetIds)leadDrafts.delete(sheetId);
  if(activeSong===id){
   catalogMode=true;masterSheetId=null;
   activeSong=repertoireContext(db).songIds[0]??db.songs[0]?.id??null;
   activeState=currentSong()?.initialStateId??null;activeModule=currentState()?.displayIndex??null;
  }
  return true;
 },"Canción eliminada del borrador del Repertorio.");
 if(result===true){deleteTarget=null;$("deleteSongDialog").close();toggleLibrary(false);}
 else{$("deleteSongError").textContent=$("editorNotice").textContent;$("deleteSongError").hidden=false;}
}
function removeListSong(id){
 if(window.confirm("¿Quitar esta canción de la lista? Se conserva en el Repertorio."))immediate(db=>deleteSong(db,activeRep,id),"Canción quitada de la lista.");
}
function dropListSong(id,target){
 if(!id||id===target)return;
 immediate(db=>{const ids=db.repertoires.find(r=>r.id===activeRep).songIds,from=ids.indexOf(id),to=ids.indexOf(target);if(from<0||to<0)throw Error("La lista cambió.");ids.splice(from,1);ids.splice(to,0,id);},"Orden actualizado.");
}
function sidebar(){
 entries("repSelect",working.repertoires.map(x=>[x.id,x.name]),activeRep);
 const root=$("songList");root.replaceChildren();
 const ids=currentRep()?.songIds||[];
 ids.forEach((id,index)=>{
  const song=working.songs.find(x=>x.id===id),row=make("div",undefined,"song-row"+(!catalogMode&&id===activeSong?" current":""));
  row.setAttribute("role","listitem");row.append(make("span",index+1,"song-num"),button(versionLabel(song),()=>useSong(id)));
  row.append(libraryMenu("Opciones de "+song.title,[
   ["Editar",()=>useSong(id)],["Elegir Lead Sheet",()=>{useSong(id);updateTab("sheet");}],
   ["Notas",()=>{useSong(id);showSongTools("notes");}],
   ["Subir",()=>immediate(db=>moveSong(db,activeRep,id,-1),"Orden actualizado."),"",index===0],
   ["Bajar",()=>immediate(db=>moveSong(db,activeRep,id,1),"Orden actualizado."),"",index===ids.length-1],
   ["Quitar de lista",()=>removeListSong(id),"danger"]
  ]));
  const grip=make("span","⋮⋮","lib-grip");grip.draggable=true;grip.setAttribute("aria-label","Arrastrar para ordenar");
  grip.ondragstart=e=>{dragSong=id;e.dataTransfer.setData("text/plain",id);e.dataTransfer.effectAllowed="move";};grip.ondragend=()=>{dragSong=null;};
  row.ondragover=e=>{if(dragSong){e.preventDefault();e.dataTransfer.dropEffect="move";}};
  row.ondrop=e=>{if(dragSong){e.preventDefault();const source=dragSong;dragSong=null;dropListSong(source,id);}};
  row.append(grip);root.append(row);
 });
 $("songCounter").textContent=ids.length+(ids.length===1?" canción":" canciones");
 const noList=!currentRep();
 $("repSelect").disabled=noList;$("repOptions").hidden=noList;$("startAddSongs").disabled=noList;
 $("repRemove").disabled=noList;$("repRename").disabled=noList;$("repDuplicate").disabled=noList;
 if(noList)$("songCounter").textContent="No hay listas";
 renderIdentification();
}
function renderIdentification(){
 const song=currentSong(),rep=currentRep();
 $("repHeading").textContent=catalogMode||!rep?"Repertorio":rep.name;
 $("songHeading").textContent=song?versionLabel(song):"Lista vacía";
 $("songSummary").hidden=!song;
 $("songAuthorSummary").textContent=song?.author||"Añadir autor";
 for(const id of ["songHeading","songAuthorSummary","songToneSummaryEdit","songBpmSummaryEdit","songBankSummaryEdit"])$(id).disabled=!song;
 $("songAuthorSummary").hidden=!song||$("songAuthor").hidden===false;
 $("songToneSummary").textContent=song?(currentSheet()?.tono||"—"):"—";
 $("songBpmSummary").textContent=song?.tempoBpm?song.tempoBpm+" BPM":"— BPM";
 $("songBankSummary").textContent=song?.bank||"—";
}
function showSongTools(kind){
 const song=currentSong();if(!song)return;
 $("songToolsTitle").textContent=kind==="notes"?"Notas":"Historial";
 $("songToolsName").textContent=versionLabel(song);
 $("historyFields").hidden=kind!=="history";
 $("noteFields").hidden=kind!=="notes";
 $("sharedWarning").hidden=kind!=="history"||versionUsage(working,song.id).length<2;
 $("sharedControls").showModal();
}
function renderSong(){
 const s=currentSong();
 $("liveLink").href='../v03.html?v=20261128-editor6&repertoire='+encodeURIComponent(catalogMode?REPERTOIRE_CONTEXT_ID:activeRep)+'&song='+encodeURIComponent(activeSong);
 $("songTitle").value=s.title;
 $("songAuthor").value=s.author||"";
 $("songCC0").value=s.midiAddress?.cc0??"";$("songPC").value=s.midiAddress?.pc??"";

 $("songBpm").value=s.tempoBpm??"";
 $("songBank").value=s.bank??"";
 $("songTone").value=currentSheet()?.tono||"";
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
 $("moduleDeleteSelected").hidden=!hasModule;
 const lastState=hasModule&&modulePurpose(working,activeSong,activeModule)==='control'&&linkedState()&&currentSong().stateIds.length===1;
 $("moduleDeleteSelected").disabled=!!lastState;
 $("moduleDeleteSelected").title=lastState?"La canción necesita al menos un estado musical":"Eliminar módulo seleccionado";
 $("moduleEditOpen").hidden=!hasModule&&!currentState();
 $("moduleAddOpen").disabled=slots.length>=256;
 $("moduleUp").disabled=!hasModule||activeModule===0;
 $("moduleDown").disabled=!hasModule||activeModule===slots.length-1;
 $("moduleAdd").disabled=slots.length>=256;
 for(const id of ['moduleEffectAdd','moduleExpressionAdd','moduleUtilityAdd'])$(id).disabled=slots.length>=256;
 for(const id of ['moduleName','moduleSub','moduleDeviceTag','moduleKind','moduleHidden','moduleColor','moduleColorPreset','moduleIcon','moduleLinkedState','moduleRowBreak'])$(id).disabled=!hasModule;
 const area=$("moduleGrid");area.replaceChildren();
 if(!slots.length)area.append(make('p','Sin módulos. Añade un estado musical, efecto o expresión.','help'));
 for(let i=0;i<slots.length;i++){
  const slot=normalSlot(i),connected=linkedState(i);
  const tile=button("",()=>{activeModule=i;activeState=connected?.id??null;renderStates();},
    "module-select-tile"+(i===activeModule?" is-selected":""));
  tile.dataset.moduleIndex=String(i);
  const initial=make("span","☆","tile-initial");initial.setAttribute("aria-label","Estado inicial");
  initial.hidden=connected?.id!==currentSong().initialStateId;
  const content=make("span",undefined,"tile-content");
  content.append(make("span",slot.name,"tile-name"),make("span",slot.sub,"tile-sub"));
  const device=make("span",slot.deviceTag,"tile-device");device.hidden=!slot.deviceTag;
  tile.append(initial,content,device);paintEditorTile(tile,i);area.append(tile);
 }
 layoutModuleGrid(true);
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
function paintEditorTile(tile,index){
 const slot=normalSlot(index),visual=resolveModuleVisual(slot,index),on=index===activeModule;
 const activity=on?visual.active:visual.inactive;
 tile.style.setProperty("--tile-bg",activity.background);
 tile.style.setProperty("--tile-fg",activity.foreground);
 tile.style.background=activity.background;tile.style.color=activity.foreground;
 tile.dataset.activity=on?"active":"inactive";
 tile.dataset.moduleHidden=String(slot.hidden);
 tile.title="Editar módulo "+(index+1)+" · "+slot.name;
 tile.setAttribute("aria-label",slot.name+(slot.deviceTag?" · "+slot.deviceTag:"")+(slot.hidden?" · Oculto en LIVE":""));
 tile.setAttribute("aria-pressed",String(on));
}
function layoutModuleGrid(reveal=false){
 const area=$("moduleGrid"),song=currentSong();if(!song)return;
 const slots=song.displaySlots||[],tiles=Array.from(area.children);
 if(modulePageSong!==song.id){modulePage=0;modulePageSong=song.id;}
 const width=area.clientWidth||0,height=area.clientHeight||0;
 if(!width||!height){$("modulePaging").hidden=true;$("modulePageBar").hidden=true;return;}
 const cols=Math.max(1,Math.min(6,Math.floor(width/132))),rowCapacity=Math.max(1,Math.floor((height+7)/91));
 const pages=[],rows=[];
 if(song.moduleLayout==="manual"){
  let row=[];
  for(let i=0;i<slots.length;i++){
   if(row.length&&(slots[i].rowBreakBefore||row.length>=cols)){rows.push(row);row=[];}
   row.push(i);
  }
  if(row.length)rows.push(row);
  for(let i=0;i<rows.length;i+=rowCapacity)pages.push(rows.slice(i,i+rowCapacity));
 }else{
  const capacity=cols*rowCapacity;
  for(let offset=0;offset<slots.length;offset+=capacity){
   const count=Math.min(capacity,slots.length-offset),columnCount=Math.min(cols,Math.max(1,Math.ceil(Math.sqrt(count*width/Math.max(height,1)))));
   const rowCount=Math.min(rowCapacity,Math.ceil(count/columnCount));
   const base=Math.floor(count/rowCount),extra=count%rowCount;
   let p=offset;pages.push(Array.from({length:rowCount},(_,r)=>Array.from({length:base+(r<extra?1:0)},()=>p++)));
  }
 }
 if(reveal&&Number.isInteger(activeModule)){const n=pages.findIndex(rows=>rows.some(row=>row.includes(activeModule)));if(n>=0)modulePage=n;}
 modulePage=Math.max(0,Math.min(modulePage,pages.length-1));
 const page=pages[modulePage]||[];
 for(const tile of tiles)tile.hidden=slots.length>0;
 area.style.gridTemplateRows="repeat("+Math.max(1,page.length)+",minmax(0,1fr))";
 for(const [r,row] of page.entries())for(const [c,i] of row.entries()){
  const tile=tiles[i],span=60/row.length;
  tile.hidden=false;tile.style.gridRow=String(r+1);tile.style.gridColumn=(Math.round(c*span)+1)+" / "+(Math.round((c+1)*span)+1);
 }
 $("modulePaging").hidden=pages.length<=1;
 $("modulePageBar").hidden=pages.length<=1;
 $("modulePageLabel").textContent=(modulePage+1)+" / "+Math.max(1,pages.length);
 $("modulePagePrev").disabled=modulePage===0;$("modulePageNext").disabled=modulePage>=pages.length-1;
}
function changeModulePage(delta){activeModule=null;activeState=null;modulePage+=delta;renderStates();layoutModuleGrid();}
function openModuleSettings(){
 if(!Number.isInteger(activeModule)&&!currentState())return;
 if(!$("moduleSettingsDialog").open)$("moduleSettingsDialog").showModal();
}
function requestModuleDeletion(){
 if($("moduleDeleteSelected").disabled||!Number.isInteger(activeModule))return;
 const musical=modulePurpose(working,activeSong,activeModule)==="control"&&linkedState();
 $("moduleDeleteMessage").textContent="¿Eliminar «"+normalSlot(activeModule).name+"»"+(musical?" y su estado musical con las asignaciones MIDI que lo usan?":" y sus asociaciones de activación?");
 $("moduleDeleteDialog").showModal();
}
function confirmModuleDeletion(){
 if(!Number.isInteger(activeModule))return;
 try{
  deleteSelectedModule(working,activeSong,activeModule);activeState=null;activeModule=null;
  $("moduleDeleteDialog").close();dirty();renderStates();renderSong();
 }catch(error){$("moduleDeleteDialog").close();notice(error.message,true);}
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
 const slot=normalSlot(index),tile=$("moduleGrid").children[index];
 if(tile){paintEditorTile(tile,index);tile.querySelector(".tile-name").textContent=slot.name;
  tile.querySelector(".tile-sub").textContent=slot.sub;tile.querySelector(".tile-device").textContent=slot.deviceTag;
  tile.querySelector(".tile-device").hidden=!slot.deviceTag;}
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
  if($("moduleAddDialog").open)$("moduleAddDialog").close();
  openModuleSettings();$("moduleName").focus();$("moduleName").select?.();
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
 selected();sidebar();renderCatalog();if(libraryView==="picker")renderPicker();
 const empty=!currentSong();
 document.body?.classList?.toggle("state-edit-mode",!empty&&activeTab==="states");
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
 if(!empty&&activeTab==="states")layoutModuleGrid(true);
 if(empty)$("liveLink").href="../v03.html?v=20261128-editor6";
 syncStatus();
}
function registerIdentity(){
 for(const [triggerId,inputId] of [["songHeading","songTitle"],["songAuthorSummary","songAuthor"],["songToneSummaryEdit","songTone"],["songBpmSummaryEdit","songBpm"],["songBankSummaryEdit","songBank"]]){
  const trigger=$(triggerId),input=$(inputId);
  const finish=()=>{input.hidden=true;trigger.hidden=false;renderIdentification();};
  trigger.onclick=()=>{if(!currentSong())return;trigger.hidden=true;input.hidden=false;input.focus();if(input.type!=="number")input.select();};
  input.addEventListener("blur",finish);
  input.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();input.blur();}});
 }
}
function register(){
 registerIdentity();
 for(const field of ['songCC0','songPC'])$(field).addEventListener('input',()=>{
  const cc0=$('songCC0').value,pc=$('songPC').value;
  currentSong().midiAddress=cc0===''&&pc===''?null:{cc0:cc0===''?null:Number(cc0),pc:pc===''?null:Number(pc)};dirty();
 });
 $('moduleMidiValue').addEventListener('input',()=>{setSlotProperty('midiValue',$('moduleMidiValue').value===''?null:Number($('moduleMidiValue').value));});
 $('moduleExpressionCC').addEventListener('change',()=>{setSlotProperty('expressionCC',$('moduleExpressionCC').value===''?null:Number($('moduleExpressionCC').value));});

 $("libraryToggle").onclick=()=>toggleLibrary();
 $("editorHistoryOpen").onclick=()=>{$("editorMenu").open=false;$("editorHistory").showModal();};
 $("editorHistoryClose").onclick=()=>$("editorHistory").close();
 $("songToolsClose").onclick=()=>$("sharedControls").close();
 $("deleteSongCancel").onclick=()=>{deleteTarget=null;$("deleteSongDialog").close();};
 $("deleteSongConfirm").onclick=confirmCatalogDelete;
 $("deleteSongDialog").addEventListener("close",()=>{deleteTarget=null;});
 $("liveLink").addEventListener("click",()=>{$("editorMenu").open=false;});
 $("settingsLink").addEventListener("click",()=>{$("editorMenu").open=false;});
 $("libraryClose").onclick=()=>toggleLibrary(false);
 $("libraryBackdrop").onclick=()=>toggleLibrary(false);
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("editorSidebar").classList.contains("is-open"))toggleLibrary(false);});
 $("scanOld").onclick=scanOldLibraries;
 $("libraryRepertoire").onclick=()=>showLibraryView("master");$("libraryLists").onclick=()=>showLibraryView("lists");
 $("startAddSongs").onclick=beginAddSongs;$("cancelAddSongs").onclick=()=>{pickerIds=[];pickerTarget=null;showLibraryView("lists");};
 $("pickerSearch").oninput=renderPicker;$("confirmAddSongs").onclick=confirmAddSongs;
 $("showCatalogImport").onclick=()=>{showLibraryView("maintenance");$("importPanel").hidden=false;$("recoveryPanel").hidden=true;$("catalogDetails").open=true;};
 $("showRecovery").onclick=()=>{showLibraryView("maintenance");$("importPanel").hidden=true;$("recoveryPanel").hidden=false;};
 $("backLibrary").onclick=()=>showLibraryView("lists");
 for(const node of document.querySelectorAll("[data-tab]"))
  node.onclick=()=>updateTab(node.dataset.tab);
 $("repSelect").onchange=e=>useRepertoire(e.target.value);
 const repForm=$('repForm'),repInput=$('repNameInput');let repFormMode='create';
 const closeRepForm=()=>{repForm.hidden=true;};
 const openRepForm=mode=>{
  repFormMode=mode;
  $("repOptions").open=false;
  $("repFormHeading").textContent=mode==="create"?"Crear lista":mode==="duplicate"?"Duplicar lista":"Renombrar lista";
  $("repFormSubmit").textContent=mode==="create"?"Crear":"Guardar nombre";
  repInput.value=mode==="create"?"":currentRep().name+(mode==="duplicate"?" (copia)":"");
  repInput.setCustomValidity("");
  repForm.hidden=false;
  toggleLibrary(true);showLibraryView("lists");
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
   repInput.setCustomValidity("Escribe un nombre para la lista.");
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
    activeTab="states";
    return true;
   },"Lista «"+name+"» creada.");
  }else if(repFormMode==="duplicate"){
   saved=immediate(db=>{catalogMode=false;activeRep=duplicateCatalogRepertoire(db,activeRep,name);activeSong=null;return true;},"Lista duplicada con referencias compartidas.");
  }else{
   const id=activeRep;
   saved=immediate(db=>{renameRepertoire(db,id,name);return true;},
    "Lista renombrada a «"+name+"».");
  }
  if(saved===true)closeRepForm();
 });
 $("repRemove").onclick=()=>{
  if(window.confirm("¿Eliminar esta lista? Las canciones se conservan en el Repertorio."))
   immediate(db=>{deleteRepertoire(db,activeRep);if(!db.repertoires.length){activeRep=null;catalogMode=true;masterSheetId=null;}},"Lista eliminada.");
 };
 $("songAddSig").onclick=()=>createMasterSong("sig");
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
 $("moduleAddOpen").onclick=()=>$("moduleAddDialog").showModal();
 $("moduleAddClose").onclick=()=>$("moduleAddDialog").close();
 $("moduleLayoutOpen").onclick=()=>$("moduleLayoutDialog").showModal();
 $("moduleLayoutClose").onclick=()=>$("moduleLayoutDialog").close();
 $("moduleEditOpen").innerHTML=CATALOG_MENU_ICONS.pencil;
 $("moduleEditOpen").onclick=openModuleSettings;
 $("moduleSettingsClose").onclick=()=>$("moduleSettingsDialog").close();
 $("moduleDeleteSelected").onclick=requestModuleDeletion;
 $("moduleDeleteCancel").onclick=()=>$("moduleDeleteDialog").close();
 $("moduleDeleteConfirm").onclick=confirmModuleDeletion;
 $("modulePagePrev").onclick=()=>changeModulePage(-1);
 $("modulePageNext").onclick=()=>changeModulePage(1);
 $("moduleGrid").onclick=event=>{if(event.target===$("moduleGrid")){activeModule=null;activeState=null;renderStates();}};
 if(typeof ResizeObserver!=="undefined")new ResizeObserver(()=>{if(working&&activeTab==="states"&&currentSong())layoutModuleGrid(true);}).observe($("moduleGrid"));
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
  if(pair.cc===0){notice("CC0 está reservado al banco de canciones; configura CC0 y PC en MIDI.",true);return;}
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
   const target=currentRep()?.name||"Repertorio";
   const confirmation="Importar "+stats.read+" canciones a «"+target+"»?"+
    "\nNuevas: "+stats.added+" · Vinculadas: "+stats.linked+
    " · Autores completados: "+stats.authorsCompleted+
    "\nSe conservarán todos los estados, configuraciones MIDI y lead sheets actuales.";
   if(!window.confirm(confirmation))return;
   working=library;selected();refreshLeadSource();dirty();render();
   notice("Canciones incorporadas al borrador: "+stats.added+" nuevas y "+stats.linked+" vinculadas. Confirma con Guardar.");
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
   $("catalogNotice").textContent="Tabla pegada. Pulsa «Importar a la lista activa» para revisarla.";
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
   committed=written;working=copy(written);clearDrafts();activeRep=working.repertoires[0]?.id??null;catalogMode=activeRep===null;masterSheetId=null;activeSong=(currentRep()?.songIds||repertoireContext(working).songIds)[0]??null;
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
 const items=searchCatalog(working,$("masterSearch").value,{includeArchived:$("masterArchived").checked}).sort((a,b)=>a.label.localeCompare(b.label,"es",{sensitivity:"base"}));
 $("masterCounter").textContent=items.length+(items.length===1?" canción":" canciones");
 for(const item of items){
  const row=make("div",undefined,"song-row"+(catalogMode&&item.id===activeSong?" current":""));
  row.setAttribute("role","listitem");row.append(button(item.label+(item.archived?" · Archivada":""),()=>openMasterSong(item.id)));
  row.append(libraryMenu("Opciones de "+item.label,[["Editar",()=>openMasterSong(item.id),"",false,"pencil"],["Historial",()=>{openMasterSong(item.id);showSongTools("history");},"",false,"history"],[item.archived?"Restaurar":"Archivar",()=>{if(window.confirm(item.archived?"¿Restaurar esta canción?":"¿Archivar esta canción? Las referencias se conservan."))immediate(db=>archiveCatalogVersion(db,item.id,!item.archived),"Estado de archivo actualizado.");},"",false,item.archived?"archive-restore":"archive"],["Eliminar",()=>requestCatalogDelete(item.id),"danger",false,"trash-2"]]));root.append(row);
 }
 const song=currentSong();$("sharedControls").hidden=!song;if(!song)return;
 const usage=versionUsage(working,song.id);
 $("sharedWarning").textContent="Canción compartida por "+usage.length+" lista(s): "+usage.map(r=>r.name).join(", ")+". Los estados, controles y expresiones son comunes; cada lista conserva su elección de lead sheet y tonalidad.";
 $("versionSave").textContent=activeTab==="sheet"?"Guardar este lead sheet":"Guardar cambios compartidos";
 $("versionArchive").textContent=song.catalog.archived?"Restaurar versión archivada":"Archivar versión";
 entries("versionHistory",song.catalog.history.map(h=>[h.id,h.createdAt+" · "+h.reason]),$("versionHistory").value);
 $("versionRestore").disabled=!song.catalog.history.length;
 $("occasionNoteWrap").hidden=catalogMode;$("occasionSave").hidden=catalogMode;
 $("occasionNote").value=currentRep()?.entryNotes?.[song.id]||"";
}
function renderLeadSheetFields(){
 const sheet=currentSheet();if(!sheet)return;
 entries("leadSheetSelect",currentSong().leadSheets.map(s=>[s.id,s.name+" · "+(s.tono||"Sin tonalidad")]),sheet.id);
 $("leadSheetName").value=sheet.name;$("songTone").value=sheet.tono||"";$("leadNotation").value=sheet.notation;
 $("leadSheetScope").textContent=catalogMode?"Editas un lead sheet del Repertorio. Las listas que lo usan reciben sus correcciones.":"Esta elección pertenece solo a «"+currentRep().name+"». Guardar el contenido o la tonalidad actualiza las listas que usan este mismo lead sheet.";
}
function registerCatalog(){
 $("masterSearch").oninput=renderCatalog;$("masterArchived").onchange=renderCatalog;
 $("versionSave").onclick=save;
 $("masterNew").onclick=()=>createMasterSong("generic");
 $("leadSheetSelect").onchange=()=>{
  const id=$("leadSheetSelect").value;
  if(catalogMode){masterSheetId=id;refreshLeadSource();render();}
  else immediate(db=>selectPlaylistLeadSheet(db,activeRep,activeSong,id),"Lead sheet seleccionado solo para esta lista.");
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
 $("repertoireIcon").innerHTML=LIBRARY_ICONS.repertoire;$("listsIcon").innerHTML=LIBRARY_ICONS.lists;
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
 activeRep=working.repertoires[0]?.id??null;catalogMode=activeRep===null;activeSong=(currentRep()?.songIds||repertoireContext(working).songIds)[0]??null;
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
