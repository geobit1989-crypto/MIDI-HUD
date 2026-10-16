import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openBrowserMidi} from '../core/midi-browser.mjs';

function navigatorFor(t,requestMIDIAccess){
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{requestMIDIAccess}});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;});
}
test('el adaptador coincide byte por byte con la integración MIDI publicada esta noche',()=>{
 assert.equal(readFileSync(new URL('../core/midi-browser.mjs',import.meta.url),'utf8'),readFileSync(new URL('../../core/midi-browser.mjs',import.meta.url),'utf8'));
});
test('Web MIDI estándar: detecta puertos, recibe CC por canal y retira listeners',async t=>{
 const listeners=new Map(),input={name:'FootCtrlPlus',type:'input',addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:(k,f)=>{if(listeners.get(k)===f)listeners.delete(k);}};
 const access={inputs:new Map([['one',input]]),onstatechange:null};
 navigatorFor(t,async options=>{assert.deepEqual(options,{sysex:false});return access;});
 const received=[],ports=[];const link=await openBrowserMidi(e=>received.push(e),names=>ports.push(names));
 assert.equal(link.supported,true);assert.equal(link.inputCount,1);assert.deepEqual(link.inputNames,['FootCtrlPlus']);
 listeners.get('midimessage')({data:new Uint8Array([0xB1,20,127])});
 listeners.get('midimessage')({data:new Uint8Array([0xC0,9])});
 assert.deepEqual(received,[{type:'MIDI_CC',channel:2,cc:20,value:127}]);assert.deepEqual(ports,[['FootCtrlPlus']]);
 link.close();assert.equal(listeners.size,0);assert.equal(access.onstatechange,null);
});
test('puente iOS: inputs no iterables y onmidimessage sin EventTarget',async t=>{
 const previous=()=>{},input={name:'BLE Chocolate',onmidimessage:previous,addEventListener(){throw Error('no implementado');}};
 navigatorFor(t,async()=>({inputs:{values:()=>({port:input})}}));
 const received=[];const link=await openBrowserMidi(e=>received.push(e));
 assert.equal(link.inputCount,1);input.onmidimessage([0xB0,20,0]);
 assert.deepEqual(received,[{type:'MIDI_CC',channel:1,cc:20,value:0}]);
 link.close();assert.equal(input.onmidimessage,previous);
});
test('puente con iterador next y cambios de puertos conserva conexión activa',async t=>{
 const first={id:'first'},second={id:'second'};
 const access={inputs:{values:()=>{let i=0;return {next:()=>i++?{done:true}:{done:false,value:['first',first]}};}},onstatechange:null};
 navigatorFor(t,async()=>access);const names=[];
 const link=await openBrowserMidi(()=>{},ports=>names.push(ports));
 assert.equal(typeof first.onmidimessage,'function');
 access.inputs={forEach:cb=>cb(second)};access.onstatechange();
 assert.equal(first.onmidimessage,null);assert.equal(typeof second.onmidimessage,'function');
 assert.deepEqual(link.inputNames,['second']);assert.deepEqual(names,[['first'],['second']]);link.close();
 assert.equal(second.onmidimessage,null);
});
test('sin API o sin objeto de acceso devuelve diagnóstico; rechazos se propagan',async t=>{
 navigatorFor(t,undefined);assert.equal((await openBrowserMidi(()=>{})).supported,false);
 navigator.requestMIDIAccess=async()=>null;assert.equal((await openBrowserMidi(()=>{})).inputCount,0);
 navigator.requestMIDIAccess=async()=>{throw Error('Permiso denegado');};
 await assert.rejects(openBrowserMidi(()=>{}),/Permiso denegado/);
});
