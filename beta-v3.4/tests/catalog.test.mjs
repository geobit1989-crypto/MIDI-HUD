import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {migrateCatalog,versionLabel,versionUsage,searchCatalog,addCatalogVersion,removeCatalogVersion,createCatalogRepertoire,duplicateCatalogRepertoire,setRepertoireNote,createCatalogVariant,archiveCatalogVersion,restoreCatalogHistory,recordCatalogChanges} from '../core/catalog-v1.mjs';
import {validateLibrary,createEngine} from '../core/engine-v1.mjs';
import {newRepertoire,newSong,deleteSong,deleteRepertoire,moveSong,setBindingActions,deleteBinding} from '../editor/editor-model.mjs';
import {LIBRARY_KEY,BACKUP_KEY,CATALOG_MIGRATION_KEY,saveLibrary,readLibrarySource} from '../core/library-storage.mjs';
import {mergeLibraries,sameLibrary} from '../core/sync-merge.mjs';
import {prepareLeadSheetSave,convertLeadSheetDraft} from '../editor/sheet-save.mjs';
import {resolveLiveSelection,saveLiveSelection} from '../core/live-selection-v34.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
const raw=()=>JSON.parse(readFileSync(new URL('../config/midi-hud-data-v2.json',import.meta.url)));
const fixture=()=>migrateCatalog(raw());
function store(initial=null){const data=new Map(initial?[[LIBRARY_KEY,JSON.stringify(initial)]]:[]);return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),data};}
test('migración del catálogo conserva IDs, transcripción, parámetros, MIDI y campos desconocidos',()=>{
 const old=raw();old.songs[0].customRig={routes:['A','B'],gain:12};const original=copy(old),db=migrateCatalog(old);
 assert.deepEqual(old,original);assert.deepEqual(db.bindings,old.bindings);assert.deepEqual(db.states,old.states);assert.deepEqual(db.repertoires,old.repertoires);
 for(const song of old.songs){const next=db.songs.find(item=>item.id===song.id);for(const key of Object.keys(song))assert.deepEqual(next[key],song[key],key);}
 assert.deepEqual(migrateCatalog(db),db);assert(validateLibrary(db));
 const legacy=JSON.parse(readFileSync(new URL('../config/midi-hud-data-v1.json',import.meta.url)));assert(validateLibrary(migrateCatalog(legacy)));
});
test('una edición compartida propaga a todos sus repertorios sin copiar canciones',()=>{
 const db=fixture(),id=db.songs[0].id,list=createCatalogRepertoire(db,'Miércoles');addCatalogVersion(db,list,id);
 const before=db.songs.length;db.songs[0].title='Título compartido nuevo';db.songs[0].tempoBpm=132;
 assert.equal(db.songs.length,before);assert.equal(versionUsage(db,id).length,2);
 for(const rep of db.repertoires.filter(rep=>rep.songIds.includes(id))){const vm=createEngine(db,{repertoireId:rep.id,songId:id}).getViewModel();assert.equal(vm.song.title,'Título compartido nuevo');assert.equal(vm.song.tempoBpm,132);}
});
test('variantes copian la configuración completa y aíslan estados, indicadores y referencias MIDI',()=>{
 const db=fixture(),source=db.songs[0],state=db.states.find(st=>st.id===source.initialStateId);
 source.extraParameters={path:['delay','reverb'],level:0.8};state.indicators=[{id:'fx-source',label:'Morph',active:true,displayIndex:0}];source.displaySlots[0].indicatorId='fx-source';
 source.midiBindings.push({cc:120,value:127,actions:[{type:'ACTIVATE_STATE',stateId:state.id},{type:'SET_INDICATOR',indicatorId:'fx-source',active:true}]});
 const original=copy(source),bindings=copy(db.bindings),id=createCatalogVariant(db,source.id,{variant:'Grados'}),variant=db.songs.find(song=>song.id===id);
 assert.equal(versionLabel(variant),source.title+' — Grados');assert.notEqual(id,source.id);assert.equal(variant.catalog.familyId,source.catalog.familyId);
 assert.deepEqual(variant.extraParameters,source.extraParameters);assert.deepEqual(variant.leadSheet,source.leadSheet);assert.equal(variant.bank,source.bank);assert.equal(variant.tempoBpm,source.tempoBpm);
 assert.deepEqual(source,original);assert.deepEqual(db.bindings,bindings);assert(!variant.stateIds.some(key=>source.stateIds.includes(key)));
 assert.notEqual(variant.displaySlots[0].indicatorId,'fx-source');assert.equal(db.states.find(st=>st.id===variant.initialStateId).indicators[0].id,variant.displaySlots[0].indicatorId);
 addCatalogVersion(db,db.repertoires[0].id,id);const engine=createEngine(db,{repertoireId:db.repertoires[0].id,songId:id});
 const result=engine.dispatch({type:'MIDI_CC',channel:1,cc:120,value:127});assert.equal(result.view.song.id,id);assert.equal(result.view.state.id,variant.initialStateId);assert(result.view.state.indicators[0].active);assert.deepEqual(result.intents,[]);
 variant.extraParameters.path.push('wah');assert.deepEqual(source.extraParameters.path,['delay','reverb']);
});
test('guardar un borrador como variante no modifica la versión compartida original',()=>{
 const db=fixture(),sourceId=db.songs[0].id,before=copy(db.songs[0]),draft=copy(db);draft.songs[0].title='Borrador';draft.songs[0].tempoBpm=150;draft.states[0].gtPatch='U01-1';
 const id=createCatalogVariant(db,sourceId,{variant:'Sol mayor',sourceLibrary:draft});assert.deepEqual(db.songs[0],before);
 const created=db.songs.find(song=>song.id===id);assert.equal(created.title,'Borrador');assert.equal(created.tempoBpm,150);assert.equal(db.states.find(st=>st.id===created.initialStateId).gtPatch,'U01-1');
});
test('editar y quitar MIDI de una variante no cambia otras ni reactiva la asociación heredada',()=>{
 const db=fixture(),source=db.songs[0],id=createCatalogVariant(db,source.id,{variant:'Sol mayor'});addCatalogVersion(db,db.repertoires[0].id,id);
 const scoped=db.songs.find(song=>song.id===id),binding=scoped.midiBindings.find(binding=>binding.actions.some(action=>action.type==='ACTIVATE_STATE'));
 assert(binding);const before=copy(source.midiBindings),globals=copy(db.bindings);
 deleteBinding(db,binding.cc,binding.value,id);
 let engine=createEngine(db,{songId:id,repertoireId:db.repertoires[0].id});const result=engine.dispatch({type:'MIDI_CC',channel:1,cc:binding.cc,value:binding.value});assert.equal(result.matched,false);assert.equal(result.view.song.id,id);
 setBindingActions(db,binding.cc,binding.value,[{type:'ACTIVATE_STATE',stateId:scoped.stateIds.at(-1)}],id);engine=createEngine(db,{songId:id,repertoireId:db.repertoires[0].id});assert.equal(engine.dispatch({type:'MIDI_CC',channel:1,cc:binding.cc,value:binding.value}).view.state.id,scoped.stateIds.at(-1));
 assert.deepEqual(source.midiBindings,before);assert.deepEqual(db.bindings,globals);
});
test('duplicar repertorio conserva referencias y permite orden, membresía y notas independientes',()=>{
 const db=fixture(),original=db.repertoires[0],id=duplicateCatalogRepertoire(db,original.id,'Miércoles'),duplicated=db.repertoires.find(rep=>rep.id===id);
 assert.deepEqual(duplicated.songIds,original.songIds);assert.notEqual(duplicated.songIds,original.songIds);
 const before=copy(original.songIds);moveSong(db,id,duplicated.songIds[1],-1);assert.deepEqual(original.songIds,before);assert.notDeepEqual(duplicated.songIds,before);
 setRepertoireNote(db,id,duplicated.songIds[0],'Acortar la intro');assert.equal(original.entryNotes,undefined);assert.equal(db.songs[0].entryNotes,undefined);
 removeCatalogVersion(db,id,duplicated.songIds[0]);assert.deepEqual(original.songIds,before);assert.equal(duplicated.songIds.length,before.length-1);assert.equal(db.songs.length,raw().songs.length);assert(validateLibrary(db));
});
test('quitar la última referencia y eliminar una lista conserva el catálogo completo y todas sus asociaciones',()=>{
 const db=fixture(),before=copy({songs:db.songs,states:db.states,bindings:db.bindings}),rep=db.repertoires[0];
 for(const id of [...rep.songIds])deleteSong(db,rep.id,id);
 assert.equal(rep.songIds.length,0);assert.deepEqual({songs:db.songs,states:db.states,bindings:db.bindings},before);
 const other=newRepertoire(db,'Lista vacía');deleteRepertoire(db,rep.id);assert.equal(db.repertoires[0].id,other);assert.deepEqual({songs:db.songs,states:db.states,bindings:db.bindings},before);assert(validateLibrary(db));
});
test('crear y abrir un repertorio vacío funciona en motor y preferencias sin canciones ficticias',()=>{
 const db=fixture(),count=db.songs.length,id=newRepertoire(db,'Ensayo');assert.equal(db.songs.length,count);
 const engine=createEngine(db,{repertoireId:id});assert.equal(engine.getViewModel().empty,true);
 engine.dispatch({type:'SELECT_REPERTOIRE',repertoireId:db.repertoires[0].id});assert.equal(engine.getViewModel().song.id,db.repertoires[0].songIds[0]);
 engine.dispatch({type:'SELECT_REPERTOIRE',repertoireId:id});assert.equal(engine.getViewModel().active.songId,null);
 const storage=store();saveLiveSelection(storage,{repertoireId:id,songId:null});assert.equal(resolveLiveSelection(db,storage).repertoireId,id);assert.equal(resolveLiveSelection(db,storage).songId,null);
});
test('buscador encuentra título y variante, evita duplicados y archiva sin romper versiones en uso',()=>{
 const db=fixture(),source=db.songs[0],id=createCatalogVariant(db,source.id,{variant:'Sol mayor'}),rep=db.repertoires[0];
 assert(searchCatalog(db,'sol mayor').some(item=>item.id===id));assert.equal(addCatalogVersion(db,rep.id,id),true);assert.equal(addCatalogVersion(db,rep.id,id),false);assert.equal(rep.songIds.filter(key=>key===id).length,1);
 archiveCatalogVersion(db,id);assert(!searchCatalog(db,'sol mayor').some(item=>item.id===id));assert(searchCatalog(db,'sol mayor',{includeArchived:true}).some(item=>item.id===id));assert(rep.songIds.includes(id));
 assert.equal(createEngine(db,{repertoireId:rep.id,songId:id}).getViewModel().song.id,id);assert(validateLibrary(db));
 archiveCatalogVersion(db,id,false);assert(searchCatalog(db,'sol mayor').some(item=>item.id===id));
});
test('renombrar una versión conserva identidad, referencias de repertorio y destinos MIDI',()=>{
 const db=fixture(),song=db.songs[0],id=song.id,refs=copy(db.repertoires),states=copy(db.states),bindings=copy(db.bindings);
 song.title='Nuevo título';song.catalog.variant='Original revisada';assert.equal(song.id,id);assert.deepEqual(db.repertoires,refs);assert.deepEqual(db.states,states);assert.deepEqual(db.bindings,bindings);assert(validateLibrary(db));
});
test('historial persiste guardados reales, recupera configuración completa y permite deshacer la recuperación',()=>{
 const initial=fixture(),id=initial.songs[0].id,storage=store(initial),next=copy(initial);next.songs[0].title='Cambio 1';next.states[0].gtPatch='P50-5';
 const saved=saveLibrary(storage,next,initial);assert.equal(saved.songs[0].catalog.history.length,1);assert.equal(JSON.parse(storage.getItem(BACKUP_KEY)).songs[0].title,initial.songs[0].title);
 const restored=copy(saved);restoreCatalogHistory(restored,id,saved.songs[0].catalog.history[0].id);const written=saveLibrary(storage,restored,saved);
 assert.equal(written.songs[0].title,initial.songs[0].title);assert.equal(written.states.find(state=>state.id===initial.states[0].id).gtPatch,initial.states[0].gtPatch);assert.equal(written.songs[0].catalog.history.length,2);
 const undo=copy(written);restoreCatalogHistory(undo,id,written.songs[0].catalog.history.at(-1).id);assert.equal(undo.songs[0].title,'Cambio 1');assert.equal(undo.states.find(state=>state.id===initial.states[0].id).gtPatch,'P50-5');
 assert.equal(JSON.parse(readLibrarySource(storage)).catalogVersion,1);assert(validateLibrary(undo));
});
test('reordenar una lista no crea revisiones musicales ni altera el historial de las canciones',()=>{
 const before=fixture(),after=copy(before);moveSong(after,after.repertoires[0].id,after.repertoires[0].songIds[1],-1);recordCatalogChanges(before,after);assert(after.songs.every(song=>song.catalog.history.length===0));
});
test('una recuperación histórica inválida no modifica la biblioteca',()=>{
 const db=fixture(),before=copy(db);assert.throws(()=>restoreCatalogHistory(db,db.songs[0].id,'no-existe'));assert.deepEqual(db,before);
});
test('Drive une modificaciones en versiones y listas distintas y conserva todo el historial',()=>{
 const base=fixture(),local=copy(base),remote=copy(base);
 const variant=createCatalogVariant(local,base.songs[0].id,{variant:'Grados'});local.songs[1].title='Edición local';recordCatalogChanges(base,local);
 const list=duplicateCatalogRepertoire(remote,base.repertoires[0].id,'Miércoles');remote.repertoires.find(rep=>rep.id===list).songIds.reverse();remote.songs[0].tempoBpm=133;recordCatalogChanges(base,remote);
 const result=mergeLibraries(base,local,remote);assert.equal(result.conflicts.length,0);assert(result.library.songs.some(song=>song.id===variant));assert(result.library.repertoires.some(rep=>rep.id===list));assert.equal(result.library.songs.find(song=>song.id===base.songs[0].id).tempoBpm,133);assert.equal(result.library.songs.find(song=>song.id===base.songs[1].id).title,'Edición local');
 assert.equal(result.library.songs.find(song=>song.id===base.songs[0].id).catalog.history.length,1);assert.equal(result.library.songs.find(song=>song.id===base.songs[1].id).catalog.history.length,1);assert(validateLibrary(result.library));
});
test('Drive presenta conflicto en la misma versión y conserva los guardados de ambos lados al elegir',()=>{
 const base=fixture(),local=copy(base),remote=copy(base);local.songs[0].tempoBpm=150;remote.songs[0].tempoBpm=160;recordCatalogChanges(base,local);recordCatalogChanges(base,remote);
 const conflict=mergeLibraries(base,local,remote);assert.equal(conflict.library,null);assert(conflict.conflicts.some(item=>item.key==='song:'+base.songs[0].id));
 const resolved=mergeLibraries(base,local,remote,'remote');assert.equal(resolved.library.songs[0].tempoBpm,160);assert.equal(resolved.library.songs[0].catalog.history.length,2);
});
test('grados manuales se guardan tal como se escriben y no se convierten ni transportan',async()=>{
 const source='A - Intro\n| I | IV | V | vi | bVII | 1 | 4 | 5 |',saved=await prepareLeadSheetSave(source);
 assert.equal(saved.chordNotation,'grados');assert.equal(saved.leadSheet.sourceText,source);
 assert.throws(()=>convertLeadSheetDraft(source,'americano'),/manualmente|automáticamente/);
 await assert.rejects(prepareLeadSheetSave('A - Intro\n| I | C |'),/No mezcles grados/);
 const db=fixture();db.songs[0].leadSheet=saved.leadSheet;db.songs[0].chordNotation=saved.chordNotation;assert(validateLibrary(db));
 const id=createCatalogVariant(db,db.songs[0].id,{variant:'Sol mayor'});assert.deepEqual(db.songs.find(song=>song.id===id).leadSheet,saved.leadSheet);
});

test('el primer guardado conserva el JSON anterior a la migración y no toca ajustes del dispositivo',()=>{
 const initial=raw(),storage=store(initial),original=storage.getItem(LIBRARY_KEY);storage.setItem('midiHudSettingsV1','{"midiChannel":6}');
 saveLibrary(storage,migrateCatalog(initial),initial);assert.equal(storage.getItem(CATALOG_MIGRATION_KEY),original);assert.equal(storage.getItem('midiHudSettingsV1'),'{"midiChannel":6}');
 const next=JSON.parse(storage.getItem(LIBRARY_KEY));saveLibrary(storage,next,next);assert.equal(storage.getItem(CATALOG_MIGRATION_KEY),original);
});
