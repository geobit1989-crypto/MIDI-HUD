import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,validateLibrary,normalizeLibrary,decodeMidiCC} from "../core/engine-v1.mjs";
import {readSettings,saveSettings} from "../core/settings-v1.mjs";

const fixture=JSON.parse(readFileSync(new URL("../config/midi-hud-data-v2.json",import.meta.url),"utf8"));
const clone=x=>JSON.parse(JSON.stringify(x));
const midi=(cc,value=127,channel=1)=>({type:"MIDI_CC",cc,value,channel});

test("repertorio v2 valido; tono, BPM, estados y lead sheet corresponden a cancion",()=>{
 assert.equal(validateLibrary(fixture),true);
 const e=createEngine(fixture);
 const v=e.getViewModel();
 assert.equal(v.song.tono,"F");
 assert.equal(v.song.tempoBpm,75);
 assert.equal(v.song.title,"Quão Grande É o Meu Deus");
 assert.equal(v.state.id,"q-clean");
 assert.equal(v.song.leadSheet.sections.length,4);
 assert.equal(v.midiChannel,1);
});
test("mensaje CC + valor activa su estado sin emitir MIDI de vuelta",()=>{
 const e=createEngine(fixture);
 const r=e.dispatch(midi(23));
 assert.equal(r.matched,true);
 assert.equal(r.changed,true);
 assert.equal(r.view.state.id,"q-solo");
 assert.deepEqual(r.intents,[]);
 assert.equal(r.view.state.indicators.find(x=>x.id==="boost").active,true);
});
test("el canal se configura globalmente, filtra y cambia sin reinicio",()=>{
 const e=createEngine(fixture,{midiChannel:10});
 assert.equal(e.dispatch(midi(23,127,1)).matched,false);
 assert.equal(e.getViewModel().state.id,"q-clean");
 e.dispatch({type:"SET_CHANNEL",channel:1});
 assert.equal(e.getViewModel().midiChannel,1);
 assert.equal(e.dispatch(midi(23)).matched,true);
 assert.equal(e.getViewModel().state.id,"q-solo");
 assert.throws(()=>e.dispatch({type:"SET_CHANNEL",channel:17}),/canal/);
});
test("valores 0 y 127 son identificadores distintos",()=>{
 const e=createEngine(fixture);
 e.dispatch(midi(25,127));
 assert.equal(e.getViewModel().state.id,"u-solo");
 e.dispatch(midi(25,0));
 assert.equal(e.getViewModel().state.id,"u-clean");
});
test("mensajes desconocidos y silencio no alteran el estado",()=>{
 const e=createEngine(fixture);
 e.dispatch(midi(23));
 const before=e.getState();
 assert.equal(e.dispatch(midi(23,0)).matched,false);
 assert.equal(e.dispatch(midi(127,99)).matched,false);
 assert.deepEqual(e.getState(),before);
});
test("consultar otra cancion no cambia la activa, un CC reconocido devuelve LIVE al activo",()=>{
 const e=createEngine(fixture);
 e.dispatch(midi(23));
 e.dispatch({type:"PREVIEW_SONG",songId:"uma-vez"});
 const v=e.getViewModel();
 assert.equal(v.isPreview,true);
 assert.equal(v.song.id,"uma-vez");
 assert.equal(v.active.songId,"quao-grande");
 assert.equal(v.active.stateId,"q-solo");
 e.dispatch(midi(127,44));
 assert.equal(e.getViewModel().isPreview,true);
 e.dispatch(midi(21));
 assert.equal(e.getViewModel().isPreview,false);
 assert.equal(e.getViewModel().state.id,"q-ambient");
});
test("memoria de estados por cancion y reinicio entre sesiones",()=>{
 const db=clone(fixture);
 db.bindings.push({cc:27,value:127,actions:[{type:"SELECT_SONG",songId:"quao-grande"}]});
 const e=createEngine(db);
 e.dispatch(midi(23));e.dispatch(midi(25));
 e.dispatch(midi(27));
 assert.equal(e.getViewModel().state.id,"q-solo");
 assert.equal(createEngine(db).getViewModel().state.id,"q-clean");
});
test("varias acciones en un mismo CC se ejecutan conforme a la configuracion",()=>{
 const db=clone(fixture);
 db.bindings.push({cc:35,value:127,actions:[
   {type:"ACTIVATE_STATE",stateId:"q-ambient"},
   {type:"ACTIVATE_STATE",stateId:"q-solo"},
   {type:"SET_INDICATOR",indicatorId:"boost",active:false}
 ]});
 const e=createEngine(db);
 const result=e.dispatch(midi(35));
 assert.equal(result.actions.length,3);
 assert.equal(result.view.state.id,"q-solo");
 assert.equal(result.view.state.indicators.find(x=>x.id==="boost").active,false);
});
test("biblioteca con colisiones CC+valor o referencias invalidas se rechaza",()=>{
 const a=clone(fixture);a.bindings.push(clone(a.bindings[0]));
 assert.throws(()=>validateLibrary(a),/duplicada/);
 const b=clone(fixture);b.songs[0].initialStateId="inventado";
 assert.throws(()=>validateLibrary(b),/estado inicial/);
});
test("mensajes MIDI 1.0 distintos de CC se ignoran",()=>{
 assert.deepEqual(decodeMidiCC([0xB0,23,127]),midi(23));
 assert.deepEqual(decodeMidiCC([0xB9,23,127]),midi(23,127,10));
 assert.equal(decodeMidiCC([0x90,60,127]),null);
 assert.equal(decodeMidiCC([0xB0,23]),null);
});
test("migracion de esquema antiguo: estados, sin intents ni reenvios fisicos",()=>{
 const old={format:"midi-hud-repertoire",schemaVersion:"1.0.0",libraryId:"old",
 repertoires:[{id:"r",name:"R",songIds:["s"]}],
 songs:[{id:"s",title:"Old",tempoBpm:80,presetIds:["p"]}],
 presets:[{id:"p",songId:"s",name:"Clean",programChange:7}]};
 const db=normalizeLibrary(old);
 assert.equal(db.schemaVersion,"2.0.0");
 assert.equal(db.songs[0].initialStateId,"p");
 assert.equal(db.states[0].gtPatch,7);
 assert.equal(db.bindings.length,0);
 assert.deepEqual(createEngine(db).dispatch({type:"PREVIEW_SONG",songId:"s"}).intents,[]);
});
test("referencias de patch alfanuméricas conservan guion, ceros y números anteriores",()=>{
 for(const patch of [null,0,7,127,"U01-1","P50-5","001","128","abc-123","FX-2A","Solo-A3","Ñá-2","A\u0301-3","α-4"]){
  const db=clone(fixture);db.states.find(st=>st.id==="q-clean").gtPatch=patch;
  assert.equal(validateLibrary(db),true);
  const e=createEngine(db);
  assert.equal(e.getViewModel().state.gtPatch,patch);
  assert.deepEqual(e.dispatch({type:"PREVIEW_STATE",stateId:"q-clean"}).intents,[]);
 }
 for(const patch of ["U01/1","U01 1","U01_1","",-1,128,{},[],true]){
  const db=clone(fixture);db.states[0].gtPatch=patch;
  assert.throws(()=>validateLibrary(db),/referencia de patch invalida/);
 }
});
test("persistencia global del canal MIDI, fuera del repertorio",()=>{
 const memory=new Map();
 const store={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};
 assert.equal(readSettings(store).midiChannel,1);
 saveSettings(store,{midiChannel:12});
 assert.equal(readSettings(store).midiChannel,12);
 assert.throws(()=>saveSettings(store,{midiChannel:0}),/Canal MIDI/);
 assert.equal(fixture.midi,undefined);
});
