import {createMidiParser} from '../core/midi-stream.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {decodeMidiCC} from '../core/engine-v1.mjs';

function setup(existing){
 const events=[],calls=[],listeners={};
 const context=vm.createContext({navigator:existing?{requestMIDIAccess:existing}:{},
  performance,Uint8Array,Map,Set,Promise,Object,Event,DOMException,decodeMidiCC,createMidiParser,
  document:{addEventListener(type,callback){listeners[type]=callback;},getElementById(){return null;}},
  webkit:{messageHandlers:{hud:{postMessage:async body=>{calls.push(body);return {ports:[{id:'123',name:'Chocolate Plus'}],selected:''};}}}},
  window:{dispatchEvent:event=>events.push(event.type)},console});
 vm.runInContext(readFileSync(new URL('../core/native-bridge.js',import.meta.url),'utf8'),context);
 const adapter=readFileSync(new URL('../core/midi-browser.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export async function','async function');vm.runInContext(adapter,context);
 return {context,events,calls,listeners};
}
test('el puente Core MIDI alimenta el adaptador existente sin modificarlo',async()=>{
 const t=setup(),messages=[],ports=[];t.context.onCC=event=>messages.push(event);t.context.onPorts=names=>ports.push([...names]);
 const session=await vm.runInContext('openBrowserMidi(onCC,onPorts)',t.context);assert.equal(session.supported,true);assert.equal(session.inputNames[0],'Chocolate Plus');assert.equal(t.calls[0].command,'midi.open');
 vm.runInContext("MidiHudNative.receive({type:'midi.message',portId:'123',data:[0xB2,20,127]})",t.context);
 assert.deepEqual(messages,[{type:'MIDI_CC',channel:3,cc:20,value:127}]);
 session.close();vm.runInContext("MidiHudNative.receive({type:'midi.message',portId:'123',data:[0xB2,20,0]})",t.context);assert.equal(messages.length,1);
});
test('desconectar, seleccionar y volver a conectar una entrada actualiza listeners y nombres',async()=>{
 const t=setup();t.context.onCC=()=>{};t.context.onPorts=()=>{};
 const session=await vm.runInContext('openBrowserMidi(onCC,onPorts)',t.context);
 vm.runInContext("MidiHudNative.receive({type:'midi.ports',ports:[{id:'123',name:'Chocolate Plus'},{id:'456',name:'GT'}],selected:'456'})",t.context);assert.equal(session.inputCount,1);assert.equal(session.inputNames[0],'GT');
 vm.runInContext("MidiHudNative.receive({type:'midi.ports',ports:[],selected:'456'})",t.context);assert.equal(session.inputCount,0);
 vm.runInContext("MidiHudNative.receive({type:'midi.ports',ports:[{id:'456',name:'GT USB'}],selected:'456'})",t.context);assert.equal(session.inputNames[0],'GT USB');session.close();
});
test('el puente no reemplaza una implementación Web MIDI ya disponible',()=>{
 const existing=()=>{};const t=setup(existing);assert.equal(t.context.navigator.requestMIDIAccess,existing);
});
test('el puente rechaza SysEx y solo se instala dentro de la app',async()=>{
 const t=setup();await assert.rejects(vm.runInContext('navigator.requestMIDIAccess({sysex:true})',t.context),{name:'NotSupportedError'});
 const context=vm.createContext({navigator:{}});vm.runInContext(readFileSync(new URL('../core/native-bridge.js',import.meta.url),'utf8'),context);assert.equal(context.navigator.requestMIDIAccess,undefined);assert.equal(context.MidiHudNative,undefined);
});
test('enumerar MIDI y recibir Clock no cuentan como pulsaciones CC o PC',async()=>{
 const {context,events}=setup();
 await vm.runInContext('navigator.requestMIDIAccess()',context);
 vm.runInContext("MidiHudNative.receive({type:'midi.message',portId:'123',data:[0xF8]}); MidiHudNative.receive({type:'midi.message',portId:'other',data:[0xB1,80,2]})",context);
 assert.equal(vm.runInContext('MidiHudNative.lastReceived',context),null);
 vm.runInContext("MidiHudNative.receive({type:'midi.message',portId:'123',data:[0xB1,80,2]}); MidiHudNative.receive({type:'midi.message',portId:'123',data:[0xC1,4]})",context);
 assert.equal(events.filter(type=>type==='hud-native-midi-received').length,2);
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(MidiHudNative.lastReceived)',context)),{count:2,source:'Chocolate Plus',type:'PC',channel:2,number:4});
});
