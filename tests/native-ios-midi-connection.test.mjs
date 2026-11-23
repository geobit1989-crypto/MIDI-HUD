import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createMidiConnectionSession} from '../core/midi-connection-session.mjs';
import {createMidiParser} from '../core/midi-stream.mjs';

const code=readFileSync(new URL('../core/midi-session-browser.mjs',import.meta.url),'utf8')
 .replace(/^import .*;\r?\n/gm,'').replace('export function createBrowserMidiSession','function createBrowserMidiSession')
 + '\nglobalThis.createBrowserMidiSession=createBrowserMidiSession;';

function setup(initial=[],preferred=''){
 const listeners=new Set(),messages=[],stored=new Map(preferred?[['hudMidiPreferredDevice',preferred]]:[]);
 const inputs=new Map(initial.map(item=>[item.id,item]));
 const access={inputs,addEventListener(type,handler){if(type==='statechange')listeners.add(handler);},
  removeEventListener(type,handler){if(type==='statechange')listeners.delete(handler);}};
 const context=vm.createContext({createMidiConnectionSession,createMidiParser,performance,Map,Set,Promise,console,
  MidiHudNative:{},navigator:{requestMIDIAccess:async()=>access}});
 vm.runInContext(code,context);
 const session=context.createBrowserMidiSession({storage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},onMessage:event=>messages.push(event)});
 return {session,inputs,messages,stored,changed(){for(const listener of listeners)listener();}};
}
function input(id){
 const handlers=new Set();
 return {id,name:'FootCtrlPlus',type:'input',state:'connected',
  addEventListener(type,handler){if(type==='midimessage')handlers.add(handler);},
  removeEventListener(type,handler){if(type==='midimessage')handlers.delete(handler);},
  open:async()=>{},
  emit(data){for(const handler of handlers)handler({data:new Uint8Array(data),timeStamp:performance.now()});}};
}
test('iOS abre automáticamente la única entrada Core MIDI disponible',async()=>{
 const foot=input('ble-1'),t=setup([foot]);
 assert.equal(await t.session.start(),true);assert.equal(t.session.status,'connected');
 assert.equal(t.stored.get('hudMidiPreferredDevice'),'ble-1');
 foot.emit([0xB1,20,127]);
 assert.deepEqual(t.messages,[{type:'MIDI_CC',channel:2,cc:20,value:127}]);
 await t.session.close();
});
test('iOS reconecta si la entrada BLE aparece después de abrir LIVE',async()=>{
 const t=setup();assert.equal(await t.session.start(),false);
 const foot=input('ble-2');t.inputs.set(foot.id,foot);t.changed();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(t.session.status,'connected');
 foot.emit([0xB1,21,127]);assert.equal(t.messages.length,1);
 await t.session.close();
});
test('iOS reemplaza identificador MIDI antiguo con una sola entrada',async()=>{
 const t=setup([input('ble-new')],'ble-old');
 assert.equal(await t.session.start(),true);
 assert.equal(t.stored.get('hudMidiPreferredDevice'),'ble-new');
 await t.session.close();
});
test('iOS no autoselecciona dispositivos ambiguos',async()=>{
 const t=setup([input('a'),input('b')]);
 assert.equal(await t.session.start(),false);
 assert.equal(t.session.status,'disconnected');
 await t.session.close();
});
