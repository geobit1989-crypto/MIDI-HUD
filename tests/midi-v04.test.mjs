import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,validateLibrary,normalizeLibrary,MIDI_CC,ENGINE_VERSION} from "../core/engine.mjs";
import {receiveMidiBytes} from "../core/midi-input.mjs";

const fixture=()=>normalizeLibrary(JSON.parse(readFileSync(
  new URL("../config/midi-hud-data-v1.json",import.meta.url),"utf8"
)));
test("mapa aprobado y migración sin destruir canciones",()=>{
  const db=fixture();
  assert.equal(ENGINE_VERSION,"0.4.0");
  assert.deepEqual(db.midi.cc,MIDI_CC);
  assert.equal(validateLibrary(db),true);
  assert.deepEqual(db.presets.map(p=>p.controlValue),[0,1,2]);
  assert.deepEqual(db.songs[0].effects.map(x=>x.ccValue),[0,1]);
});
test("CC80 selecciona un estado exclusivo, CC81 conmuta overlay independiente",()=>{
  const engine=createEngine(fixture());
  engine.dispatch({type:"RECEIVE_CC",channel:1,controller:80,value:2});
  assert.equal(engine.getViewModel().preset.name,"Worship Solo");
  engine.dispatch({type:"RECEIVE_CC",channel:1,controller:81,value:0});
  assert.equal(engine.getViewModel().effects[0].active,true);
  engine.dispatch({type:"RECEIVE_CC",channel:1,controller:81,value:0});
  assert.equal(engine.getViewModel().effects[0].active,false);
  engine.dispatch({type:"RECEIVE_CC",channel:2,controller:80,value:0});
  assert.equal(engine.getViewModel().preset.ccValue,2);
});
test("CC7/CC91/CC11 convierten 0..127 a porcentajes, sin eco MIDI",()=>{
  const engine=createEngine(fixture());
  for(const [cc,value] of [[7,64],[91,127],[11,64]]){
    const result=engine.dispatch({type:"RECEIVE_CC",channel:1,controller:cc,value});
    assert.deepEqual(result.intents,[]);
  }
  const vm=engine.getViewModel();
  assert.equal(vm.volumePercent,50);
  assert.equal(vm.morph.value,127);
  assert.equal(vm.wahPercent,50);
  assert.equal(vm.expressionMode,"wah");
});
test("F8 no usa canal y distingue BPM inicial de TAP estable",()=>{
  const engine=createEngine(fixture());
  let ts=0;
  for(let i=0;i<25;i++){
    receiveMidiBytes(engine,[0xF8],ts);
    ts += 60000/(120*24);
  }
  assert.equal(engine.getViewModel().tempo.label,"BPM");
  assert.equal(engine.getViewModel().tempo.clockStatus,"receiving");
  for(let i=0;i<48;i++){
    receiveMidiBytes(engine,[0xF8],ts);
    ts += 60000/(125*24);
  }
  assert.equal(engine.getViewModel().tempo.label,"TAP");
  assert.ok(Math.abs(engine.getViewModel().tempo.receivedBpm-125)<0.6);
  assert.equal(engine.getViewModel().tempo.savedBpm,120);
  engine.dispatch({type:"CLOCK_TIMEOUT",timestampMs:ts+1100});
  assert.equal(engine.getViewModel().tempo.label,"BPM");
  assert.equal(engine.getViewModel().tempo.clockStatus,"lost");
});
test("F8 ignorado no: PC/CC sí respetan el canal RX",()=>{
  const db=fixture();
  db.midi.channel=5;
  db.midi.gtChannel=2;
  const engine=createEngine(db);
  receiveMidiBytes(engine,[0xB0,80,1],0);
  assert.equal(engine.getViewModel().preset.ccValue,0);
  receiveMidiBytes(engine,[0xB4,80,1],0);
  assert.equal(engine.getViewModel().preset.ccValue,1);
  receiveMidiBytes(engine,[0xF8],10);
  assert.equal(engine.getViewModel().tempo.clockStatus,"receiving");
});
