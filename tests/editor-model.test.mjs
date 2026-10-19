import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateLibrary,createEngine} from "../core/engine-v1.mjs";
import {
 editLibrary,newRepertoire,renameRepertoire,deleteRepertoire,newSong,copySong,deleteSong,moveSong,
 newState,duplicateState,deleteState,moveState,setSlot,addSection,removeSection,addBar,removeBar,
 setBeat,setRepeatBar,setBindingActions,deleteBinding,chocolateMatrix,diagnostics
} from "../editor/editor-model.mjs";

const fixture=JSON.parse(readFileSync(new URL("../config/midi-hud-data-v2.json",import.meta.url),"utf8"));
const copy=x=>JSON.parse(JSON.stringify(x));
const edit=(base,fn)=>editLibrary(base,fn);

test("crear canción genera estado inicial, cuatro módulos flexibles y referencia de repertorio",()=>{
 let id;
 const db=edit(fixture,d=>{id=newSong(d,"worship");});
 assert.equal(db.songs.length,fixture.songs.length+1);
 const song=db.songs.find(x=>x.id===id);
 assert.equal(song.displaySlots.length,4);
 assert.equal(db.states.find(s=>s.id===song.initialStateId)?.songId,id);
 assert.ok(db.repertoires[0].songIds.includes(id));
 assert.equal(validateLibrary(db),true);
});
test("crear y renombrar repertorio con canción válida",()=>{
 let rep;
 const db=edit(fixture,d=>{rep=newRepertoire(d,"Rock");renameRepertoire(d,rep,"Rock clásico");});
 assert.equal(db.repertoires.find(x=>x.id===rep).name,"Rock clásico");
 assert.equal(db.repertoires.find(x=>x.id===rep).songIds.length,1);
});
test("duplicar canción duplica estados sin copiar asociaciones MIDI",()=>{
 let duplicated;
 const db=edit(fixture,d=>{duplicated=copySong(d,"worship","quao-grande");});
 const s=db.songs.find(x=>x.id===duplicated);
 assert.equal(s.stateIds.length,4);
 assert.notEqual(s.initialStateId,"q-clean");
 assert.deepEqual(db.bindings,fixture.bindings);
 assert.equal(db.states.find(st=>st.id===s.initialStateId).songId,duplicated);
});
test("cambiar orden de canciones preserva estados y acciones",()=>{
 const db=edit(fixture,d=>moveSong(d,"worship","uma-vez",-1));
 assert.deepEqual(db.repertoires[0].songIds,["uma-vez","quao-grande"]);
 assert.deepEqual(db.bindings,fixture.bindings);
});
test("borrar canción elimina estados y acciones huérfanos y protege última canción",()=>{
 const db=edit(fixture,d=>deleteSong(d,"worship","uma-vez"));
 assert.equal(db.songs.length,1);
 assert.ok(!db.states.some(s=>s.songId==="uma-vez"));
 assert.ok(db.bindings.every(b=>b.actions.every(a=>!["u-clean","u-solo"].includes(a.stateId))));
 assert.throws(()=>edit(db,d=>deleteSong(d,"worship","quao-grande")) ,/al menos una canción/);
});
test("borrar repertorio mantiene canciones compartidas",()=>{
 const db=edit(fixture,d=>{
  const id=newRepertoire(d,"Ensayo");
  d.repertoires.find(r=>r.id===id).songIds.push("quao-grande");
  deleteRepertoire(d,"worship");
 });
 assert.ok(db.songs.some(x=>x.id==="quao-grande"));
 assert.ok(!db.songs.some(x=>x.id==="uma-vez"));
});
test("crear, duplicar, reordenar, eliminar estado y corregir inicial",()=>{
 let state;
 const db=edit(fixture,d=>{
  state=newState(d,"uma-vez","Ambient");
  const s=d.songs.find(x=>x.id==="uma-vez");
  s.initialStateId=state;
  const copied=duplicateState(d,state);
  moveState(d,copied,-1);
  deleteState(d,state);
 });
 const s=db.songs.find(x=>x.id==="uma-vez");
 assert.equal(s.stateIds.length,3);
 assert.equal(s.initialStateId,s.stateIds[0]);
 assert.ok(!db.states.some(x=>x.id===state));
});
test("eliminar estado quita solamente las acciones que dependían de él",()=>{
 const db=edit(fixture,d=>deleteState(d,"u-solo"));
 assert.ok(!db.bindings.some(b=>b.cc===25&&b.value===127));
 assert.ok(db.bindings.some(b=>b.cc===25&&b.value===0));
});
test("módulos visuales se editan por canción, sin cambiar estructura LIVE",()=>{
 const db=edit(fixture,d=>setSlot(d,"uma-vez",8,"DIST","GT"));
 assert.equal(db.songs.find(x=>x.id==="uma-vez").displaySlots[8].name,"DIST");
 assert.equal(db.songs.find(x=>x.id==="quao-grande").displaySlots[8].name,"DIST");
 assert.throws(()=>edit(db,d=>setSlot(d,"uma-vez",256,"Otro","X")),/posición/);
});
test("lead sheet: sección y acordes en cuatro pulsos, con repetición de compás",()=>{
 const db=edit(fixture,d=>{
  const s=d.songs.find(x=>x.id==="uma-vez");
  s.leadSheet={sections:[{letter:"A",label:"INTRO",bars:[["C","","",""]]}]};
  addBar(d,"uma-vez",0);
  setBeat(d,"uma-vez",0,1,2,"G/B");
  setRepeatBar(d,"uma-vez",0,1,true);
  addSection(d,"uma-vez");
  removeBar(d,"uma-vez",0,0);
  removeSection(d,"uma-vez",1);
 });
 const s=db.songs.find(x=>x.id==="uma-vez");
 assert.deepEqual(s.leadSheet.sections[0].bars[0],["/","","",""]);
 assert.equal(s.leadSheet.sections.length,1);
 assert.throws(()=>edit(db,d=>setBeat(d,"uma-vez",0,0,4,"F")),/pulso/);
});
test("matriz 8x4 tiene coordenadas únicas; existen comandos MIDI fuera de la matriz",()=>{
 const db=edit(fixture,d=>setBindingActions(d,110,17,[{type:"ACTIVATE_STATE",stateId:"q-clean"}]));
 const cells=chocolateMatrix(db).flat();
 assert.equal(cells.length,32);
 assert.equal(cells[0].cc,20);assert.equal(cells[0].button,"A");
 assert.equal(cells.at(-1).cc,51);assert.equal(cells.at(-1).button,"D");
 assert.equal(new Set(cells.map(c=>c.cc)).size,32);
 assert.ok(!cells.some(c=>c.cc===110));
 const motor=createEngine(db);
 assert.equal(motor.dispatch({type:"MIDI_CC",channel:1,cc:110,value:17}).matched,true);
});
test("un CC puede ejecutar acciones múltiples y el editor avisa de conflicto",()=>{
 const db=edit(fixture,d=>setBindingActions(d,80,127,[
   {type:"ACTIVATE_STATE",stateId:"q-clean"},
   {type:"ACTIVATE_STATE",stateId:"q-solo"}]));
 assert.equal(diagnostics(db).filter(x=>x.key==="80:127").length,1);
 assert.equal(createEngine(db).dispatch({type:"MIDI_CC",channel:1,cc:80,value:127}).view.state.id,"q-solo");
});
test("comandos CC con valores 0 y 127 son distintos",()=>{
 const db=edit(fixture,d=>{
  setBindingActions(d,105,0,[{type:"ACTIVATE_STATE",stateId:"u-clean"}]);
  setBindingActions(d,105,127,[{type:"ACTIVATE_STATE",stateId:"u-solo"}]);
 });
 assert.equal(db.bindings.filter(b=>b.cc===105).length,2);
});
test("el editor rechaza una biblioteca inválida sin modificar el original",()=>{
 const first=JSON.stringify(fixture);
 assert.throws(()=>edit(fixture,d=>{d.songs[0].initialStateId="desconocido";}),/estado inicial/);
 assert.equal(JSON.stringify(fixture),first);
});
test("eliminar un comando no afecta al resto",()=>{
 const db=edit(fixture,d=>deleteBinding(d,25,0));
 assert.ok(!db.bindings.some(b=>b.cc===25&&b.value===0));
 assert.ok(db.bindings.some(b=>b.cc===25&&b.value===127));
});


test("los indicadores vinculados a módulos aparecen en la vista y responden al CC",()=>{
 const db=edit(fixture,d=>setBindingActions(d,100,0,[
   {type:"ACTIVATE_STATE",stateId:"q-solo"},
   {type:"SET_INDICATOR",indicatorId:"boost",active:false}
 ]));
 const motor=createEngine(db);
 const initial=motor.dispatch({type:"MIDI_CC",channel:1,cc:23,value:127});
 assert.equal(initial.view.state.indicators.find(x=>x.id==="boost").displayIndex,5);
 assert.equal(initial.view.state.indicators.find(x=>x.id==="boost").active,true);
 const changed=motor.dispatch({type:"MIDI_CC",channel:1,cc:100,value:0});
 assert.equal(changed.view.state.indicators.find(x=>x.id==="boost").active,false);
});
test("al borrar un estado se limpian también acciones dirigidas a sus indicadores huérfanos",()=>{
 const db=edit(fixture,d=>{
  d.states.find(x=>x.id==="u-solo").indicators.push({
   id:"onlySolo",label:"Solo único",active:true,displayIndex:1
  });
  setBindingActions(d,109,127,[{type:"SET_INDICATOR",indicatorId:"onlySolo",active:false}]);
  deleteState(d,"u-solo");
 });
 assert.ok(!db.bindings.some(x=>x.cc===109));
});
