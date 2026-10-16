import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateLibrary,createEngine} from '../core/engine-v1.mjs';
import {newSong,newState,addConfiguredModule,renameModule,setModulePurpose,moduleActivation,
 setModuleActiveOnEntry,moduleActivationActions,moveModule,removeModule,copySong,setBindingActions} from '../editor/editor-model.mjs';
function fixture(){
 const db=JSON.parse(readFileSync(new URL('../config/midi-hud-data-v2.json',import.meta.url)));
 const songId=newSong(db,'worship','Prueba','sig'),song=db.songs.find(s=>s.id===songId);
 return {db,songId,song};
}
test('un estado añadido después hereda los efectos y expresiones con encendido independiente',()=>{
 const {db,songId,song}=fixture();
 const effect=addConfiguredModule(db,songId,'effect'),morph=addConfiguredModule(db,songId,'expression');
 renameModule(db,songId,effect.index,'Delay');renameModule(db,songId,morph.index,'Morph');
 setModuleActiveOnEntry(db,songId,morph.index,song.initialStateId,true);
 const stateId=newState(db,songId,'Puente'),state=db.states.find(st=>st.id===stateId);
 assert.deepEqual(state.indicators.map(ind=>[ind.label,ind.active]),[['Delay',false],['Morph',false]]);
 assert.equal(moduleActivation(db,songId,morph.index).rows[0].active,true);
 assert.equal(moduleActivation(db,songId,morph.index).rows.at(-1).active,false);
 assert.equal(validateLibrary(db),true);
});
test('renombrar y mover una expresión conserva sus mensajes; quitarla solo retira el vínculo visual',()=>{
 const {db,songId,song}=fixture(),{index}=addConfiguredModule(db,songId,'expression');
 const actions=moduleActivationActions(db,songId,index,true);setBindingActions(db,100,127,actions);
 const bindings=structuredClone(db.bindings),id=song.displaySlots[index].indicatorId;
 const moved=moveModule(db,songId,index,-1);renameModule(db,songId,moved,'Whammy');
 assert.equal(song.displaySlots[moved].indicatorId,id);
 assert.ok(db.states.filter(st=>st.songId===songId).every(st=>st.indicators.some(ind=>ind.id===id&&ind.displayIndex===moved&&ind.label==='Whammy')));
 assert.deepEqual(db.bindings,bindings);
 removeModule(db,songId,moved);
 assert.ok(db.states.filter(st=>st.songId===songId).every(st=>st.indicators.some(ind=>ind.id===id&&ind.displayIndex===null)));
 assert.deepEqual(db.bindings,bindings);assert.equal(validateLibrary(db),true);
});
test('expresiones antiguas reutilizan sus indicadores y mensajes sin cambiar la biblioteca al consultarla',()=>{
 const {db,songId,song}=fixture(),index=song.displaySlots.length;
 song.displaySlots.push({name:'Wah',sub:'',kind:'expression'});
 const states=db.states.filter(st=>st.songId===songId);
 states[0].indicators=[{id:'old-wah-a',label:'Wah A',active:true,displayIndex:index}];
 states[1].indicators=[{id:'old-wah-b',label:'Wah B',active:false,displayIndex:index}];
 delete states[2].indicators;
 setBindingActions(db,99,127,[{type:'SET_INDICATOR',indicatorId:'old-wah-b',active:true}]);
 const before=JSON.stringify(db);assert.equal(moduleActivation(db,songId,index).rows[0].active,true);
 assert.equal(JSON.stringify(db),before);
 const actions=moduleActivationActions(db,songId,index,false);
 assert.deepEqual(actions.map(a=>a.indicatorId),['old-wah-a','old-wah-b']);
 assert.equal(states[0].indicators[0].active,true);assert.equal(states[0].indicators[0].label,'Wah A');
 assert.equal(db.bindings.find(b=>b.cc===99).actions[0].indicatorId,'old-wah-b');
 setModuleActiveOnEntry(db,songId,index,states[0].id,false);
 assert.equal(states[0].indicators[0].active,false);assert.equal(validateLibrary(db),true);
});
test('eliminar un estado vacío recién creado sigue funcionando aunque herede expresiones apagadas',()=>{
 const {db,songId,song}=fixture();addConfiguredModule(db,songId,'expression');
 const states=[...song.stateIds],fresh=addConfiguredModule(db,songId,'control');
 assert.equal(db.states.find(st=>st.id===fresh.stateId).indicators.length,1);
 setModulePurpose(db,songId,fresh.index,'expression');
 assert.deepEqual(song.stateIds,states);assert.equal(moduleActivation(db,songId,fresh.index).rows.length,4);
 assert.equal(validateLibrary(db),true);
});
test('duplicar una canción conserva configuración de expresiones sin compartir sus valores editables',()=>{
 const {db,songId,song}=fixture(),{index}=addConfiguredModule(db,songId,'expression');
 setModuleActiveOnEntry(db,songId,index,song.initialStateId,true);
 const copied=copySong(db,'worship',songId),clone=db.songs.find(s=>s.id===copied);
 assert.equal(clone.displaySlots[index].indicatorId,song.displaySlots[index].indicatorId);
 setModuleActiveOnEntry(db,copied,index,clone.initialStateId,false);
 assert.equal(moduleActivation(db,songId,index).rows[0].active,true);
 assert.equal(moduleActivation(db,copied,index).rows[0].active,false);
 assert.equal(validateLibrary(db),true);
});
test('convertir una expresión en estado musical conserva MIDI y evita una segunda selección por indicador',()=>{
 const {db,songId,song}=fixture(),{index}=addConfiguredModule(db,songId,'expression');
 const actions=moduleActivationActions(db,songId,index,true);setBindingActions(db,100,127,actions);
 const before=structuredClone(db.bindings),stateId=setModulePurpose(db,songId,index,'control');
 assert.ok(stateId);assert.equal(moduleActivation(db,songId,index),null);assert.deepEqual(db.bindings,before);
 const hud=createEngine(db),base=song.initialStateId;
 setBindingActions(db,101,127,[{type:'ACTIVATE_STATE',stateId:base}]);
 const checked=createEngine(db);checked.dispatch({type:'MIDI_CC',channel:1,cc:101,value:127});
 const view=checked.dispatch({type:'MIDI_CC',channel:1,cc:100,value:127}).view;
 assert.equal(view.state.id,base);assert.ok(view.state.indicators.every(ind=>ind.displayIndex===null));
 assert.equal(validateLibrary(db),true);assert.ok(hud);
});
