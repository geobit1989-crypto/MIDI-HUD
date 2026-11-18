import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,normalizeLibrary} from "../core/engine.mjs";
import {receiveMidiBytes} from "../core/midi-input.mjs";
import {createMidiConnectionSession} from "../core/midi-connection-session.mjs";

function setup() {
  const db=normalizeLibrary(JSON.parse(readFileSync(new URL("../config/midi-hud-data-v1.json",import.meta.url),"utf8")));
  db.midi.channel=2;
  return createEngine(db);
}
const cc=(engine,n,v,ch=2)=>receiveMidiBytes(engine,[0xB0+(ch-1),n,v],0);
const pc=(engine,n,ch=2)=>receiveMidiBytes(engine,[0xC0+(ch-1),n],0);

test("canal 2 acepta estados; otros canales no cambian el HUD",()=>{
  const engine=setup();
  cc(engine,80,2,1);
  assert.equal(engine.getViewModel().preset.ccValue,0);
  cc(engine,80,2);
  assert.equal(engine.getViewModel().preset.ccValue,2);
  cc(engine,80,1,3);
  assert.equal(engine.getViewModel().preset.ccValue,2);
});
test("CC0 + PC repetidos no reinician el estado y CC80 recupera sincronía",()=>{
  const engine=setup();
  const address=engine.getViewModel().song.midiAddress;
  assert.ok(address,"la canción de prueba debe tener dirección MIDI");
  cc(engine,80,2);
  const before=engine.getState();
  cc(engine,0,address.cc0);
  pc(engine,address.pc);
  assert.equal(engine.getState().presetId,before.presetId);
  cc(engine,80,1);
  assert.equal(engine.getViewModel().preset.ccValue,1);
  cc(engine,0,address.cc0);
  pc(engine,address.pc);
  cc(engine,80,2);
  assert.equal(engine.getViewModel().preset.ccValue,2);
});
test("CC81 conmuta efectos en canal 2 sin eco",()=>{
  const engine=setup();
  const effect=engine.getViewModel().effects[0];
  assert.ok(effect);
  cc(engine,81,effect.ccValue,1);
  assert.equal(engine.getViewModel().effects[0].active,false);
  cc(engine,81,effect.ccValue);
  assert.equal(engine.getViewModel().effects[0].active,true);
});
test("pérdida y reintento de transporte no cambian canción ni estado",async()=>{
  const engine=setup();
  cc(engine,80,2);
  const before=engine.getState();
  const stored=new Map([["hudMidiPreferredDevice","usb-midi"]]);
  const session=createMidiConnectionSession({
    storage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},
    adapter:{discover:async()=>[{id:"usb-midi"}],connect:async()=>({disconnect:async()=>{}})}
  });
  assert.equal(await session.start(),true);
  session.lost();
  assert.equal(session.status,"disconnected");
  assert.equal(await session.retry(),true);
  assert.equal(session.status,"connected");
  assert.deepEqual(engine.getState(),before);
});
