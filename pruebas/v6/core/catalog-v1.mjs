import {normalizeLibrary,validateLibrary} from './engine-v1.mjs';
import {migrateLeadSheets} from './lead-sheet-variants.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
const insist=(ok,message)=>{if(!ok)throw Error('Catálogo MIDI HUD: '+message);};
const key=value=>Array.isArray(value)?'['+value.map(key).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+key(value[k])).join(',')+'}':JSON.stringify(value);
export const catalogId=prefix=>prefix+'-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2));
const version=(db,id)=>{const song=db.songs.find(s=>s.id===id);insist(song,'versión desconocida');return song;};
const repertoire=(db,id)=>{const rep=db.repertoires.find(r=>r.id===id);insist(rep,'repertorio desconocido');return rep;};
function ownedBindings(db,song){
 const states=new Set(song.stateIds),indicators=new Set(db.states.filter(st=>st.songId===song.id).flatMap(st=>(st.indicators||[]).map(ind=>ind.id)));
 return copy(db.bindings.filter(binding=>binding.actions.some(action=>action.type==='ACTIVATE_STATE'&&states.has(action.stateId)||action.type==='SELECT_SONG'&&action.songId===song.id||action.type==='SET_INDICATOR'&&indicators.has(action.indicatorId))));
}
/** Migración idempotente, sin escrituras ni inferencias musicales. Conserva todos
 * los campos desconocidos, IDs, referencias, mensajes globales y estados. */
export function migrateCatalog(raw){
 const db=normalizeLibrary(raw);validateLibrary(db);
 insist(db.catalogVersion==null||db.catalogVersion===1,'versión de catálogo desconocida');
 db.catalogVersion=1;
 for(const song of db.songs){
  song.catalog??={familyId:song.id,variant:'',archived:false,history:[]};
  song.catalog.history??=[];
  song.midiBindings??=ownedBindings(db,song);
 }
 migrateLeadSheets(db);validateLibrary(db);return db;
}
export function versionLabel(song){return song.title+(song.catalog?.variant?' — '+song.catalog.variant:'');}
export function versionUsage(db,id){return db.repertoires.filter(rep=>rep.songIds.includes(id)).map(rep=>({id:rep.id,name:rep.name}));}
export function searchCatalog(db,query='',{includeArchived=false}={}){
 const term=String(query).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 return db.songs.filter(song=>(includeArchived||!song.catalog?.archived)&&[versionLabel(song),...(song.leadSheets||[]).flatMap(sheet=>[sheet.name,sheet.tono||''])].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(term)).map(song=>({id:song.id,label:versionLabel(song),archived:!!song.catalog?.archived,usage:versionUsage(db,song.id)}));
}
export function addCatalogVersion(db,repertoireId,versionId){
 const rep=repertoire(db,repertoireId),song=version(db,versionId);
 insist(!song.catalog?.archived,'restaura la versión archivada antes de añadirla');
 if(rep.songIds.includes(versionId))return false;
 rep.songIds.push(versionId);return true;
}
export function removeCatalogVersion(db,repertoireId,versionId){
 const rep=repertoire(db,repertoireId);insist(rep.songIds.includes(versionId),'esta versión no pertenece al repertorio');
 rep.songIds=rep.songIds.filter(id=>id!==versionId);
 if(rep.entryNotes)delete rep.entryNotes[versionId];
 if(rep.leadSheetIds)delete rep.leadSheetIds[versionId];
}
export function createCatalogRepertoire(db,name){
 insist(typeof name==='string'&&name.trim(),'escribe un nombre');
 const id=catalogId('repertoire');db.repertoires.push({id,name:name.trim(),songIds:[]});return id;
}
export function duplicateCatalogRepertoire(db,id,name){
 const original=repertoire(db,id);insist(typeof name==='string'&&name.trim(),'escribe un nombre');
 const next=copy(original);next.id=catalogId('repertoire');next.name=name.trim();
 db.repertoires.push(next);return next.id;
}
export function setRepertoireNote(db,repertoireId,versionId,note){
 const rep=repertoire(db,repertoireId);insist(rep.songIds.includes(versionId),'versión ajena al repertorio');insist(typeof note==='string'&&note.length<=4000,'nota demasiado larga');
 rep.entryNotes??={};if(note.trim())rep.entryNotes[versionId]=note;else delete rep.entryNotes[versionId];
}
function snapshot(db,id){
 const song=copy(version(db,id));song.midiBindings??=ownedBindings(db,song);if(song.catalog)song.catalog.history=[];
 return {song,states:copy(db.states.filter(st=>st.songId===id))};
}
function content(value){const result=copy(value);if(result.song.catalog)result.song.catalog.history=[];return key(result);}
/** Una entrada por guardado con cambios reales, dentro del bundle de la versión.
 * El historial previo siempre se conserva; los IDs permiten unirlo en Drive. */
export function recordCatalogChanges(previous,next,reason='Guardar cambios compartidos'){
 for(const song of next.songs){
  const old=previous?.songs.find(item=>item.id===song.id);
  song.catalog??={familyId:song.id,variant:'',archived:false,history:[]};song.catalog.history??=[];
  if(!old)continue;
  const before=snapshot(previous,song.id),after=snapshot(next,song.id);
  const entries=new Map([...(old.catalog?.history||[]),...song.catalog.history].map(entry=>[entry.id,copy(entry)]));
  if(content(before)!==content(after)){
   const entry={id:catalogId('history'),createdAt:new Date().toISOString(),reason,snapshot:before};entries.set(entry.id,entry);
  }
  song.catalog.history=[...entries.values()];
 }
 return next;
}
function remapActions(bindings,sourceId,targetId,stateIds,indicatorIds){
 return bindings.map(binding=>({...copy(binding),actions:binding.actions.map(action=>{
  const next=copy(action);
  if(next.type==='ACTIVATE_STATE'&&stateIds.has(next.stateId))next.stateId=stateIds.get(next.stateId);
  if(next.type==='SELECT_SONG'&&next.songId===sourceId)next.songId=targetId;
  if(next.type==='SET_INDICATOR'&&indicatorIds.has(next.indicatorId))next.indicatorId=indicatorIds.get(next.indicatorId);
  return next;
 })}));
}
/** Parte de un borrador completo, pero añade solo la nueva identidad a db.
 * La versión original y su historial permanecen intactos. */
export function createCatalogVariant(db,sourceId,{variant,title=null,sourceLibrary=db}={}){
 insist(typeof variant==='string'&&variant.trim()&&variant.length<=120,'escribe un nombre reconocible para la nueva versión');
 validateLibrary(sourceLibrary);
 const original=version(sourceLibrary,sourceId),song=copy(original),id=catalogId('song');
 const stateIds=new Map(original.stateIds.map(old=>[old,catalogId('state')]));
 const indicatorIds=new Map();
 for(const state of sourceLibrary.states.filter(st=>st.songId===sourceId))for(const indicator of state.indicators||[])if(!indicatorIds.has(indicator.id))indicatorIds.set(indicator.id,catalogId('indicator'));
 for(const slot of song.displaySlots||[])if(slot.indicatorId&&!indicatorIds.has(slot.indicatorId))indicatorIds.set(slot.indicatorId,catalogId('indicator'));
 song.id=id;if(title!=null){insist(typeof title==='string'&&title.trim(),'título vacío');song.title=title.trim();}
 song.stateIds=original.stateIds.map(old=>stateIds.get(old));song.initialStateId=stateIds.get(original.initialStateId);
 song.catalog={...copy(original.catalog||{}),familyId:original.catalog?.familyId||sourceId,variant:variant.trim(),archived:false,history:[]};
 for(const slot of song.displaySlots||[])if(slot.indicatorId)slot.indicatorId=indicatorIds.get(slot.indicatorId);
 song.midiBindings=remapActions(original.midiBindings||ownedBindings(sourceLibrary,original),sourceId,id,stateIds,indicatorIds);
 const states=sourceLibrary.states.filter(state=>state.songId===sourceId).map(state=>{
  const next=copy(state);next.id=stateIds.get(state.id);next.songId=id;
  for(const indicator of next.indicators||[])indicator.id=indicatorIds.get(indicator.id);
  return next;
 });
 db.songs.push(song);db.states.push(...states);validateLibrary(db);return id;
}
export function archiveCatalogVersion(db,id,archived=true){
 const song=version(db,id);insist(song.catalog,'migra el catálogo antes de archivar');song.catalog.archived=!!archived;
 // Se oculta del buscador normal, pero las listas que ya la usan siguen válidas.
}
export function restoreCatalogHistory(db,id,historyId){
 const next=copy(db);restoreHistoryInPlace(next,id,historyId);Object.assign(db,next);return id;
}
function restoreHistoryInPlace(db,id,historyId){
 const current=version(db,id),entry=current.catalog?.history?.find(item=>item.id===historyId);
 insist(entry?.snapshot?.song?.id===id&&Array.isArray(entry.snapshot.states),'guardado histórico inválido');
 const nextSong=copy(entry.snapshot.song),states=copy(entry.snapshot.states),map=new Map();
 // Recovery must not orphan the sheets chosen by playlists after that snapshot.
 if(current.leadSheets){
  const sheets=new Map(current.leadSheets.map(sheet=>[sheet.id,copy(sheet)]));
  const prior=nextSong.leadSheets||[{...copy(current.leadSheets.find(sheet=>sheet.id===current.defaultLeadSheetId)),leadSheet:copy(nextSong.leadSheet??null),tono:nextSong.tono??null}];
  for(const sheet of prior)sheets.set(sheet.id,sheet);
  nextSong.leadSheets=[...sheets.values()];
  nextSong.defaultLeadSheetId??=current.defaultLeadSheetId;
 }
 for(const state of states){
  const collision=db.states.some(other=>other.id===state.id&&other.songId!==id);
  map.set(state.id,collision?catalogId('state'):state.id);
 }
 for(const state of states){state.id=map.get(state.id);state.songId=id;}
 nextSong.stateIds=nextSong.stateIds.map(stateId=>map.get(stateId));nextSong.initialStateId=map.get(nextSong.initialStateId);
 nextSong.midiBindings=remapActions(nextSong.midiBindings||[],id,id,map,new Map());
 nextSong.catalog={...copy(current.catalog),...nextSong.catalog,history:copy(current.catalog.history)};
 db.songs=db.songs.map(song=>song.id===id?nextSong:song);db.states=db.states.filter(state=>state.songId!==id).concat(states);
 const known=new Set(db.states.map(state=>state.id)),knownIndicators=new Set(db.states.flatMap(state=>(state.indicators||[]).map(ind=>ind.id)));
 for(const bindings of [db.bindings,...db.songs.map(song=>song.midiBindings||[])])for(const binding of bindings)binding.actions=binding.actions.filter(action=>(action.type!=='ACTIVATE_STATE'||known.has(action.stateId))&&(action.type!=='SET_INDICATOR'||knownIndicators.has(action.indicatorId)));
 db.bindings=db.bindings.filter(binding=>binding.actions.length);
 validateLibrary(db);return id;
}
