import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,normalizeLibrary} from "../core/engine.mjs";
import {receiveMidiBytes} from "../core/midi-input.mjs";
import {createMidiConnectionSession} from "../core/midi-connection-session.mjs";

// Pruebas exclusivamente Chocolate Plus -> MIDI HUD. Sin GT ni Morph.
function setup(){
 const db=normalizeLibrary(JSON.parse(readFileSync(new URL("./fixtures/connection-v04.json",import.meta.url),"utf8")));
 db.midi.channel=2;
 db.songs[0].midiAddress={cc0:0,pc:0};
 return createEngine(db);
}
const cc=(e,n,v,ch=2)=>receiveMidiBytes(e,[0xB0+ch-1,n,v],0);
const pc=(e,n,ch=2)=>receiveMidiBytes(e,[0xC0+ch-1,n],0);

test("1000 órdenes de estado alternadas se procesan a la primera y sin eco",()=>{
 const e=setup(), states=e.getViewModel().states;
 assert.ok(states.length>=2);
 let notifications=0;
 e.subscribe(()=>notifications++);
 for(let i=0;i<1000;i++){
  const target=states[i%2];
  assert.equal(cc(e,80,target.ccValue),true);
  assert.equal(e.getViewModel().preset.id,target.id);
 }
 assert.equal(notifications,999);
});

test("canal ajeno, mensajes incompletos y CC desconocidos no cambian LIVE",()=>{
 const e=setup(), before=e.getState();
 assert.equal(cc(e,80,1,1),true);
 assert.equal(pc(e,1,1),true);
 assert.equal(receiveMidiBytes(e,[0xB1,80],0),false);
 assert.equal(receiveMidiBytes(e,[0xC1],0),false);
 assert.equal(cc(e,119,99),true);
 assert.deepEqual(e.getState(),before);
});

test("CC81 recibido alterna efecto y avisa una sola vez por pulsación",()=>{
 const e=setup(), effect=e.getViewModel().effects[0];
 assert.ok(effect);
 let updates=0;let emitted=0;
 e.subscribe((_,intents)=>{updates++;emitted+=intents.length;});
 for(let i=0;i<100;i++){
  cc(e,81,effect.ccValue);
  assert.equal(e.getViewModel().effects[0].active,i%2===0);
 }
 assert.equal(updates,100);
 assert.equal(emitted,0);
});

test("CC0 + PC de canción actual no reinicia el estado activo",()=>{
 const e=setup(), addr=e.getViewModel().song.midiAddress;
 cc(e,80,e.getViewModel().states[1].ccValue);
 const before=e.getState();
 for(let i=0;i<100;i++){cc(e,0,addr.cc0);pc(e,addr.pc);}
 assert.deepEqual(e.getState(),before);
});

test("reconexión MIDI preserva canción, estado y efectos y recibe nuevas órdenes",async()=>{
 const e=setup(), effect=e.getViewModel().effects[0];
 cc(e,80,e.getViewModel().states[1].ccValue);
 cc(e,81,effect.ccValue);
 const before=e.getState();
 const storage={getItem:()=> "chocolate",setItem:()=>{}};
 const session=createMidiConnectionSession({storage,adapter:{
  discover:async()=>[{id:"chocolate"}],
  connect:async()=>({disconnect:async()=>{}})
 }});
 assert.equal(await session.start(),true);
 session.lost();
 assert.equal(session.status,"disconnected");
 assert.deepEqual(e.getState(),before);
 assert.equal(await session.retry(),true);
 assert.equal(session.status,"connected");
 assert.deepEqual(e.getState(),before);
 cc(e,80,e.getViewModel().states[0].ccValue);
 assert.equal(e.getViewModel().preset.id,e.getViewModel().states[0].id);
});
