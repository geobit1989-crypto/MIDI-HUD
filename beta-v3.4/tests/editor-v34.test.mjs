import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareLeadSheetSave,convertLeadSheetDraft} from '../editor/sheet-save.mjs';
import {convertChord,convertSheet} from '../editor/chord-notation.mjs';
import {newSong,addModule,moveModule,removeModule,setBindingActions} from '../editor/editor-model.mjs';
import {validateLibrary,createEngine} from '../core/engine-v1.mjs';
import {LIBRARY_KEY,LEGACY_KEY,BACKUP_KEY,readLibrarySource,saveLibrary} from '../core/library-storage.mjs';
import {moduleRows} from '../core/layout-v3.4.mjs';
const fixture=()=>JSON.parse(readFileSync(new URL('../config/midi-hud-data-v2.json',import.meta.url)));
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),data};};

test('guardar mezcla convierte solo tras la elección y conserva raíces, calidad, alteraciones y bajo',async()=>{
 const source='A - Solo de Ana\n| Do | G | Lam | Re♭maj7/La♭ |';
 let calls=0;
 const result=await prepareLeadSheetSave(source,{chooseNotation:async()=>{calls++;return 'americano';}});
 assert.equal(calls,1);assert.equal(result.chordNotation,'americano');
 assert.equal(result.leadSheet.sourceText,'A - Solo de Ana\n| C | G | Am | D♭maj7/A♭ |');
 assert.equal((await prepareLeadSheetSave(source,{chooseNotation:async()=> 'latino'})).leadSheet.sourceText,'A - Solo de Ana\n| Do | Sol | Lam | Re♭maj7/La♭ |');
});
test('cerrar la elección no guarda ni modifica el borrador original',async()=>{
 const source='A - Intro\n| Do | G |';
 assert.equal(await prepareLeadSheetSave(source,{chooseNotation:async()=>null}),null);
 assert.equal(source,'A - Intro\n| Do | G |');
});
test('sin mezcla no hay popup, aunque la preferencia guardada sea la otra',async()=>{
 const result=await prepareLeadSheetSave('A - Intro\n| Do | Sol/Si | Lam7 |',{preferredNotation:'americano',chooseNotation:async()=>assert.fail('popup inesperado')});
 assert.equal(result.chordNotation,'latino');assert.equal(result.leadSheet.sections[0].bars[1][0],'Sol/Si');
});
test('una raíz y un bajo en sistemas distintos también requieren elección',async()=>{
 const result=await prepareLeadSheetSave('A - Intro\n| C/Mi |',{chooseNotation:async()=> 'latino'});
 assert.equal(result.leadSheet.sourceText,'A - Intro\n| Do/Mi |');
});
test('errores de símbolo y estructura se detectan antes de preguntar o convertir',async()=>{
 for(const source of ['A - Intro\n| Do | Q |','A - Intro\n| Do | G','Letra sin compases\n| Do | G |']){
  await assert.rejects(prepareLeadSheetSave(source,{chooseNotation:async()=>assert.fail('no preguntar con errores')}),/Línea/);
  assert.throws(()=>convertLeadSheetDraft(source,'latino'),/Línea/);
 }
 assert.throws(()=>convertChord('C','otro'),/desconocido/);
 assert.throws(()=>convertSheet('A - Intro\n| C |','otro'),/desconocido/);
});
test('mover y quitar preserva el destino musical de MIDI y las referencias de indicadores',()=>{
 const db=fixture(),songId=newSong(db,'worship','Prueba','sig');
 const song=db.songs.find(s=>s.id===songId),stateId=song.stateIds[0];
 db.bindings=[];setBindingActions(db,20,127,[{type:'ACTIVATE_STATE',stateId}]);
 const state=db.states.find(s=>s.id===stateId);state.indicators=[{id:'fx',label:'FX',active:true,displayIndex:0}];
 const before=JSON.stringify(db.bindings);
 assert.equal(moveModule(db,songId,0,1),1);
 assert.equal(state.displayIndex,1);assert.equal(state.indicators[0].displayIndex,1);
 let vm=createEngine(db).dispatch({type:'MIDI_CC',channel:1,cc:20,value:127}).view;
 assert.equal(vm.state.id,stateId);assert.equal(vm.song.displaySlots[vm.state.displayIndex].name,'Clean');
 removeModule(db,songId,0);
 assert.equal(state.displayIndex,0);assert.equal(state.indicators[0].displayIndex,0);
 removeModule(db,songId,0);
 assert.equal(state.displayIndex,null);assert.equal(state.indicators[0].displayIndex,null);
 assert.equal(JSON.stringify(db.bindings),before);assert.equal(validateLibrary(db),true);
 vm=createEngine(db).dispatch({type:'MIDI_CC',channel:1,cc:20,value:127}).view;
 assert.equal(vm.state.id,stateId);
});
test('se pueden quitar todos los módulos y volver a añadir uno sin recrear cuatro',()=>{
 const db=fixture(),id=newSong(db,'worship');const song=db.songs.find(s=>s.id===id);
 while(song.displaySlots.length)removeModule(db,id,0);
 assert.equal(validateLibrary(db),true);assert.equal(addModule(db,id),0);
 assert.equal(song.displaySlots.length,1);assert.equal(validateLibrary(db),true);
 assert.equal(song.chordNotation,null);
});
test('filas mixtas, fila exclusiva opcional y módulos ocultos conservan sus índices',()=>{
 const slots=Array.from({length:5},(_,i)=>({name:'M'+i,kind:i===4?'expression':'control'}));
 assert.deepEqual(moduleRows(slots).map(row=>row.map(x=>x.index)),[[0,1,2],[3,4]]);
 assert.deepEqual(moduleRows(slots.slice(1),{manual:true}).map(row=>row.length),[4]);
 slots[4].rowBreakBefore=true;
 assert.deepEqual(moduleRows(slots).map(row=>row.map(x=>x.index)),[[0,1,2,3],[4]]);
 slots[1].hidden=true;
 assert.deepEqual(moduleRows(slots).map(row=>row.map(x=>x.index)),[[0,2,3],[4]]);
 assert.deepEqual(moduleRows(slots.map(x=>({...x,hidden:true}))),[]);
});
test('la beta parte de canciones anteriores y guarda sin sobrescribirlas',()=>{
 const store=storage(),old=fixture();store.setItem(LEGACY_KEY,JSON.stringify(old));
 const snapshot=store.getItem(LEGACY_KEY),loaded=JSON.parse(readLibrarySource(store));
 loaded.songs[0].title='Solo beta';const written=saveLibrary(store,loaded,old);
 assert.equal(store.getItem(LEGACY_KEY),snapshot);
 assert.equal(JSON.parse(store.getItem(LIBRARY_KEY)).songs[0].title,'Solo beta');
 assert.equal(store.getItem(BACKUP_KEY),snapshot);
 assert.equal(JSON.parse(readLibrarySource(store)).revision,written.revision);
 assert.equal(old.songs[0].title,JSON.parse(snapshot).songs[0].title);
});
test('error de validación o almacenamiento conserva la última versión guardada',()=>{
 const store=storage(),old=fixture();saveLibrary(store,old,old);
 const last=store.getItem(LIBRARY_KEY),candidate=fixture();candidate.songs[0].title='';
 assert.throws(()=>saveLibrary(store,candidate,old));assert.equal(store.getItem(LIBRARY_KEY),last);
 candidate.songs[0].title='Cambio';const baseSet=store.setItem;
 store.setItem=(key,val)=>{if(key===LIBRARY_KEY)throw Error('Sin espacio');baseSet(key,val);};
 assert.throws(()=>saveLibrary(store,candidate,old),/Sin espacio/);
 assert.equal(store.getItem(LIBRARY_KEY),last);
});
