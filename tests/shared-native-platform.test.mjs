import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {isAndroidTestEnvironment,scopeStorage} from '../core/environment.mjs';
import {createMidiParser} from '../core/midi-stream.mjs';

const source=readFileSync(new URL('../core/native-bridge.js',import.meta.url),'utf8');
function setup(){
 const calls=[],events=[],timers=new Map();let nextTimer=0;
 const host={postMessage(text){calls.push(JSON.parse(text));}};
 const context=vm.createContext({navigator:{},MidiHudAndroidHost:host,performance,Uint8Array,Event,DOMException,
  setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
  document:{addEventListener(){},getElementById(){return null;}},window:{dispatchEvent(e){events.push(e.type);}}});
 vm.runInContext(source,context);
 const send=data=>host.onmessage({data:JSON.stringify(data)});
 const reply=(request,result)=>send({kind:'reply',id:request.id,result});
 const event=value=>send({kind:'event',event:value});
 return {context,calls,events,timers,send,reply,event};
}
test('Android bridge implements the same input contract and sends CC, PC and Clock to the shared parser',async()=>{
 const t=setup(),opening=vm.runInContext('navigator.requestMIDIAccess()',t.context);
 assert.equal(t.context.MidiHudNative.platform,'android');
 assert.equal(t.calls[0].command,'midi.open');
 t.reply(t.calls[0],{ports:[{id:'foot',name:'FootCtrlPlus',connected:true}],selected:'foot'});
 const access=await opening,port=access.inputs.get('foot'),parse=createMidiParser(),messages=[];
 assert.equal(port.manufacturer,'Android MIDI');assert.equal(access.outputs.size,0);
 port.addEventListener('midimessage',e=>messages.push(...parse(e.data,e.timeStamp)));
 t.event({type:'midi.message',portId:'foot',data:[0xB1,80,2]});
 t.event({type:'midi.message',portId:'foot',data:[0xC1,4]});
 t.event({type:'midi.message',portId:'foot',data:[0xF8]});
 assert.deepEqual(messages.slice(0,2),[{type:'MIDI_CC',channel:2,cc:80,value:2},{type:'MIDI_PC',channel:2,program:4}]);
 assert.equal(messages.length,3);assert.equal(t.context.MidiHudNative.lastReceived.count,2);
 t.event({type:'midi.message',portId:'other',data:[0xB1,80,3]});
 t.event({type:'midi.message',portId:'foot',data:[256]});
 t.event({type:'midi.ports',ports:[],selected:'foot'});
 assert.equal(access.inputs.size,0);assert.equal(port.state,'disconnected');assert.equal(messages.length,3);
});
test('Android replies correlate concurrent cloud and MIDI calls; late or unknown replies are ignored',async()=>{
 const t=setup(),native=t.context.MidiHudNative;
 const first=native.call('cloud.restore'),second=native.call('midi.list');
 t.reply(t.calls[1],{ports:[],selected:''});t.reply(t.calls[0],null);
 assert.equal(await first,null);assert.equal((await second).ports.length,0);
 t.reply(t.calls[0],true);assert.equal(t.timers.size,0);
 const fail=native.call('cloud.connect');
 t.send({kind:'reply',id:t.calls[2].id,error:'Cancelado'});
 await assert.rejects(fail,/Cancelado/);
 const timeout=native.call('midi.list');[...t.timers.values()][0]();
 await assert.rejects(timeout,/Tiempo de espera/);
 await assert.rejects(native.call('midi.send'),/Acción no disponible/);
 await assert.rejects(vm.runInContext('navigator.requestMIDIAccess({sysex:true})',t.context),{name:'NotSupportedError'});
});
test('Android QA is isolated from normal web and production data',()=>{
 assert.equal(isAndroidTestEnvironment(new URL('https://appassets.androidplatform.net/android-qa/v03.html')),true);
 assert.equal(isAndroidTestEnvironment(new URL('https://appassets.androidplatform.net/android/v03.html')),false);
 assert.equal(isAndroidTestEnvironment(new URL('https://example.com/android-qa/v03.html')),false);
 const data=new Map([['hudLibrary','production']]);
 const raw={get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const qa=scopeStorage(raw);qa.setItem('hudLibrary','test');qa.clear();
 assert.equal(raw.getItem('hudLibrary'),'production');assert.equal(qa.getItem('hudLibrary'),null);
});
