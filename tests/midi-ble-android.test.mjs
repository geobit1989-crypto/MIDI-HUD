import test from "node:test";
import assert from "node:assert/strict";
import {createBleMidiDecoder,connectBleMidi,BLE_MIDI_SERVICE,BLE_MIDI_CHARACTERISTIC} from "../core/midi-ble-android.mjs";

test("BLE-MIDI packet decodes CC on HUD channel 2",()=>{
 const decode=createBleMidiDecoder();
 assert.deepEqual(decode([0x80,0x80,0xb1,80,127],123),[
   {type:"MIDI_CC",channel:2,cc:80,value:127}
 ]);
});
test("BLE-MIDI PC and clock are accepted",()=>{
 const decode=createBleMidiDecoder();
 assert.deepEqual(decode([0x80,0x80,0xc1,7],20),[
   {type:"MIDI_PC",channel:2,program:7}
 ]);
 assert.deepEqual(decode([0x80,0x80,0xf8],21),[
   {type:"MIDI_CLOCK",timestampMs:21}
 ]);
});
test("invalid BLE notification is ignored",()=>{
 const decode=createBleMidiDecoder();
 assert.deepEqual(decode([0xb1,80,127]),[]);
});
test("connection registers notification and disconnect removes listeners",async()=>{
 const listeners=new Map(),deviceListeners=new Map(),received=[];
 const characteristic={
   addEventListener:(name,fn)=>listeners.set(name,fn),
   removeEventListener:name=>listeners.delete(name),
   startNotifications:async()=>{}
 };
 const device={
   name:"FOOTCTRLPLUS",
   gatt:{connected:true,connect:async()=>({getPrimaryService:async()=>({
     getCharacteristic:async uuid=>{assert.equal(uuid,BLE_MIDI_CHARACTERISTIC);return characteristic;}
   })}),disconnect(){this.connected=false;}},
   addEventListener:(name,fn)=>deviceListeners.set(name,fn),
   removeEventListener:name=>deviceListeners.delete(name)
 };
 const bluetooth={requestDevice:async opts=>{
   assert.ok(opts.filters.some(filter=>filter.namePrefix==='FootCtrl'));
   assert.ok(opts.optionalServices.includes(BLE_MIDI_SERVICE));
   return device;
 }};
 const connection=await connectBleMidi(event=>received.push(event),{bluetooth,now:()=>123});
 const payload=Uint8Array.from([0x80,0x80,0xb1,80,127]);
 listeners.get("characteristicvaluechanged")({target:{value:new DataView(payload.buffer)}});
 assert.deepEqual(received,[{type:"MIDI_CC",channel:2,cc:80,value:127}]);
 connection.disconnect();
 assert.equal(device.gatt.connected,false);
 assert.equal(listeners.size,0);
 assert.equal(deviceListeners.size,0);
});
