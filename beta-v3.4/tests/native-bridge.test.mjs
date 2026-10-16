import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {decodeMidiCC} from '../core/engine-v1.mjs';

function setup(existing){
 const events=[],calls=[],listeners={};
 const context=vm.createContext({navigator:existing?{requestMIDIAccess:existing}:{},
  performance,Uint8Array,Map,Set,Promise,Object,Event,DOMException,decodeMidiCC,
  document:{addEventListener(type,callback){listeners[type]=callback;},getElementById(){return null;}},
  webkit:{messageHandlers:{hud:{postMessage:async body=>{calls.push(body);return {ports:[{id:'123',name:'Chocolate Plus'}],selected:''};}}}},
  window:{dispatchEvent:event=>events.push(event.type)},console});
 vm.runInContext(readFileSync(new URL('../core/native-bridge.js',import.meta.url),'utf8'),context);
 const adapter=readFileSync(new URL('../core/midi-browser.mjs',import.meta.url),'utf8').replace(/^import .*;\n/m,'').replace('export async function','async function');vm.runInContext(adapter,context);
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
