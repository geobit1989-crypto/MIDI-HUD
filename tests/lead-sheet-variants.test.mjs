import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {migrateCatalog,createCatalogRepertoire,duplicateCatalogRepertoire,recordCatalogChanges,restoreCatalogHistory} from '../core/catalog-v1.mjs';
import {resolveLeadSheet,createLeadSheetVariant,addSongToPlaylist,selectPlaylistLeadSheet} from '../core/lead-sheet-variants.mjs';
import {createEngine,validateLibrary} from '../core/engine-v1.mjs';
import {deleteSong} from '../editor/editor-model.mjs';
import {mergeLibraries} from '../core/sync-merge.mjs';
import {prepareLeadSheetText,formatLeadSheetText} from '../editor/lead-sheet-text.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
const raw=()=>JSON.parse(readFileSync(new URL('../config/midi-hud-data-v2.json',import.meta.url)));
const fixture=()=>migrateCatalog(raw());
const music=text=>({sourceText:'A - Intro\n| '+text+' |',sections:[{letter:'A',label:'Intro',bars:[[text,'','','']]}]});

test('duplicar o cambiar tonalidad no recompila partituras existentes con compases vacíos y metadatos',()=>{
 const existing=music('F');existing.sections[0].bars.push(['','','','']);existing.custom={cue:'Solo'};delete existing.sourceText;
 const before=copy(existing),draft=prepareLeadSheetText(existing,formatLeadSheetText(existing));
 assert.deepEqual(draft.errors,[]);assert.deepEqual(draft.leadSheet,before);assert.notEqual(draft.leadSheet,existing);
 assert(prepareLeadSheetText(existing,'A - Intro\n| NO-ES-ACORDE |').errors.length);
});

test('migración conserva partitura/tonalidad original, identidad y toda la capa de control',()=>{
 const before=raw(),original=copy(before),db=migrateCatalog(before);
 assert.deepEqual(before,original);assert.deepEqual(db.states,before.states);assert.deepEqual(db.bindings,before.bindings);
 for(const song of before.songs){const migrated=db.songs.find(s=>s.id===song.id),sheet=resolveLeadSheet(migrated);
  assert.deepEqual(sheet.leadSheet,song.leadSheet);assert.equal(sheet.tono,song.tono);assert.equal(migrated.id,song.id);
 }
 assert.deepEqual(migrateCatalog(db),db);
});

test('crear tres lead sheets no duplica canción, estados, indicadores ni MIDI',()=>{
 const db=fixture(),song=db.songs[0],before=copy(db),original=copy(resolveLeadSheet(song));
 const a=createLeadSheetVariant(song,{name:'Grados — Sol',leadSheet:music('I'),tono:'Sol mayor',notation:'grados'});
 const b=createLeadSheetVariant(song,{name:'Acordes — La',leadSheet:music('A'),tono:'La mayor',notation:'acordes'});
 assert.notEqual(a,b);assert.equal(db.songs.length,before.songs.length);assert.equal(song.leadSheets.length,3);
 assert.deepEqual(resolveLeadSheet(song),original);assert.deepEqual(db.states,before.states);assert.deepEqual(db.bindings,before.bindings);
 assert.deepEqual(song.midiBindings,before.songs[0].midiBindings);assert.deepEqual(song.displaySlots,before.songs[0].displaySlots);
 assert(validateLibrary(db));
});

test('cada playlist selecciona lead sheet y tonalidad para la misma canción',()=>{
 const db=fixture(),song=db.songs[0],first=db.repertoires[0],second=createCatalogRepertoire(db,'Miércoles');
 const sheet=createLeadSheetVariant(song,{name:'Grados — La',tono:'La mayor',notation:'grados',leadSheet:music('I')});
 addSongToPlaylist(db,second,song.id,sheet);const original=resolveLeadSheet(song,first);
 assert.equal(resolveLeadSheet(song,db.repertoires.find(r=>r.id===second)).id,sheet);
 assert.equal(resolveLeadSheet(song,first).id,original.id);
 const a=createEngine(db,{repertoireId:first.id}),b=createEngine(db,{repertoireId:second});
 assert.equal(a.getViewModel().song.tono,original.tono);assert.equal(b.getViewModel().song.tono,'La mayor');
 assert.equal(a.getViewModel().song.id,b.getViewModel().song.id);assert.equal(a.getViewModel().state.id,b.getViewModel().state.id);
 assert.equal(b.getViewModel().song.leadSheet.sections[0].bars[0][0],'I');
});

test('cambiar solo la vista conserva estado activo y expresiones del mismo control compartido',()=>{
 const db=fixture(),song=db.songs[0],state=db.states.find(s=>s.id===song.initialStateId);
 state.indicators=[{id:'test-expression',label:'Morph',active:false,displayIndex:1}];
 song.midiBindings=[{cc:99,value:127,actions:[{type:'SET_INDICATOR',indicatorId:'test-expression',active:true}]}];
 const sheet=createLeadSheetVariant(song,{name:'Grados — La',tono:'La',notation:'grados'}),other=createCatalogRepertoire(db,'Otra vista');
 addSongToPlaylist(db,other,song.id,sheet);const engine=createEngine(db);
 engine.dispatch({type:'MIDI_CC',channel:1,cc:99,value:127});const before=engine.getState();
 engine.dispatch({type:'SELECT_REPERTOIRE',repertoireId:other});const after=engine.getState();
 assert.equal(after.activeSongId,before.activeSongId);assert.equal(after.activeStateId,before.activeStateId);
 assert.deepEqual(after.indicatorOverrides,before.indicatorOverrides);assert.equal(engine.getViewModel().song.tono,'La');
});

test('editar control se refleja en todas las vistas; corregir un lead sheet solo afecta a sus usuarios',()=>{
 const db=fixture(),song=db.songs[0],rep=db.repertoires[0],other=createCatalogRepertoire(db,'Otra');
 const id=createLeadSheetVariant(song,{name:'La',tono:'La',leadSheet:music('A')});addSongToPlaylist(db,other,song.id,id);
 const original=copy(resolveLeadSheet(song,rep));song.leadSheets.find(s=>s.id===id).tono='Si';
 db.states.find(s=>s.id===song.initialStateId).gtPatch=42;
 for(const repertoireId of [rep.id,other])assert.equal(createEngine(db,{repertoireId}).getViewModel().state.gtPatch,42);
 assert.deepEqual(resolveLeadSheet(song,rep),original);assert.equal(createEngine(db,{repertoireId:other}).getViewModel().song.tono,'Si');
});

test('duplicar/quitar playlist conserva variantes y separa selección y orden',()=>{
 const db=fixture(),song=db.songs[0],rep=db.repertoires[0],id=createLeadSheetVariant(song,{name:'La',tono:'La'});
 const other=duplicateCatalogRepertoire(db,rep.id,'Copia');selectPlaylistLeadSheet(db,other,song.id,id);
 assert.notEqual(resolveLeadSheet(song,rep).id,id);assert.equal(resolveLeadSheet(song,db.repertoires.at(-1)).id,id);
 deleteSong(db,other,song.id);assert(!db.repertoires.at(-1).leadSheetIds[song.id]);
 assert(song.leadSheets.some(sheet=>sheet.id===id));assert(validateLibrary(db));
});

test('historial recupera sin borrar variantes que ya están referenciadas por playlists',()=>{
 const before=fixture(),next=copy(before),song=next.songs[0],rep=next.repertoires[0];
 const id=createLeadSheetVariant(song,{name:'Grados',notation:'grados',tono:'Sol'});
 selectPlaylistLeadSheet(next,rep.id,song.id,id);recordCatalogChanges(before,next);
 const entry=song.catalog.history[0].id;restoreCatalogHistory(next,song.id,entry);
 assert(next.songs[0].leadSheets.some(s=>s.id===id));assert.equal(next.repertoires[0].leadSheetIds[song.id],id);
 assert(validateLibrary(next));
});

test('recuperar un historial anterior al modelo de lead sheets conserva vistas nuevas y recupera la original',()=>{
 const db=fixture(),song=db.songs[0],legacy=copy(song);delete legacy.leadSheets;delete legacy.defaultLeadSheetId;
 legacy.tono='La mayor';legacy.leadSheet=music('A');legacy.catalog.history=[];
 song.catalog.history.push({id:'legacy-history',createdAt:'2026-10-18T00:00:00Z',reason:'Antes de migrar',snapshot:{song:legacy,states:copy(db.states.filter(s=>s.songId===song.id))}});
 const sheet=createLeadSheetVariant(song,{name:'Grados',tono:'Sol',notation:'grados'});
 selectPlaylistLeadSheet(db,db.repertoires[0].id,song.id,sheet);
 restoreCatalogHistory(db,song.id,'legacy-history');
 const restored=db.songs.find(s=>s.id===song.id);
 assert.equal(resolveLeadSheet(restored).tono,'La mayor');assert.equal(resolveLeadSheet(restored).leadSheet.sections[0].bars[0][0],'A');
 assert.equal(resolveLeadSheet(restored,db.repertoires[0]).id,sheet);assert(validateLibrary(db));
});

test('rechaza selección de partitura ajena y tonalidad corrupta antes de guardar',()=>{
 const db=fixture(),before=copy(db);
 assert.throws(()=>selectPlaylistLeadSheet(db,db.repertoires[0].id,db.songs[0].id,db.songs[1].defaultLeadSheetId));
 assert.deepEqual(db,before);db.songs[0].leadSheets[0].tono=12;assert.throws(()=>validateLibrary(db),/tonalidad/);
});

test('Drive actual conserva elecciones independientes de playlist y variantes dentro de la canción',()=>{
 const base=fixture(),other=createCatalogRepertoire(base,'Otra');addSongToPlaylist(base,other,base.songs[0].id);
 const local=copy(base),remote=copy(base),sheet=createLeadSheetVariant(local.songs[0],{name:'Sol',tono:'Sol'});
 selectPlaylistLeadSheet(local,local.repertoires[0].id,local.songs[0].id,sheet);
 remote.repertoires.find(r=>r.id===other).name='Miércoles';
 const result=mergeLibraries(base,local,remote);assert.deepEqual(result.conflicts,[]);assert(validateLibrary(result.library));
 assert.equal(result.library.repertoires[0].leadSheetIds[base.songs[0].id],sheet);
 assert.equal(result.library.repertoires.find(r=>r.id===other).name,'Miércoles');
});
