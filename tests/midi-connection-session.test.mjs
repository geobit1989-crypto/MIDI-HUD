import test from "node:test";
import assert from "node:assert/strict";
import {createMidiConnectionSession} from "../core/midi-connection-session.mjs";

test("reconnects to stored device without changing HUD musical state", async()=>{
  const values=new Map([["hudMidiPreferredDevice","bridge-123"]]);
  const calls=[];
  const session=createMidiConnectionSession({
    storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},
    adapter:{discover:async()=>[],connect:async id=>{calls.push(id);return {disconnect:async()=>{}};}}
  });
  assert.equal(await session.start(),true);
  assert.equal(session.status,"connected");
  assert.deepEqual(calls,["bridge-123"]);
  session.lost();
  assert.equal(session.status,"disconnected");
  assert.equal(await session.retry(),true);
  assert.deepEqual(calls,["bridge-123","bridge-123"]);
});
test("first use stays disconnected until a device is selected",async()=>{
  const values=new Map();
  const session=createMidiConnectionSession({
    storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},
    adapter:{discover:async()=>[{id:"bridge-A"}],connect:async()=>({disconnect:async()=>{}})}
  });
  assert.equal(await session.start(),false);
  assert.equal(session.status,"disconnected");
  assert.deepEqual(await session.discover(),[{id:"bridge-A"}]);
  assert.equal(await session.select("bridge-A"),true);
  assert.equal(values.get("hudMidiPreferredDevice"),"bridge-A");
});
test("connection failure remains disconnected",async()=>{
  const session=createMidiConnectionSession({
    storage:{getItem:()=> "unavailable",setItem:()=>{}},
    adapter:{discover:async()=>[],connect:async()=>{throw Error("offline");}}
  });
  assert.equal(await session.start(),false);
  assert.equal(session.status,"disconnected");
});
