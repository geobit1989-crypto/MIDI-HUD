import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEngine} from '../core/engine-v1.mjs';
import {migrateCatalog} from '../core/catalog-v1.mjs';
import {scopeStorage,isTestEnvironment} from '../core/environment.mjs';
import {createBrowserMidiSession} from '../core/midi-session-browser.mjs';
const fixture=()=>migrateCatalog(JSON.parse(readFileSync(new URL('./fixtures/main-v04.json',import.meta.url))));
const cc=(cc,value,channel=2)=>({type:'MIDI_CC',cc,value,channel});
function memory(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i]??null,get length(){return map.size;}};}
test('test environment separates libraries, auth, preferences, recovery and draft keys from stable',()=>{
 const base=memory(),staging=scopeStorage(base);
 for(const key of ['hudLibraryV34','hudLibraryV1','hudMidiPreferredDevice','midiHudTrustedDeviceSessionV1','hudRecoverySnapshot:1','draft']){
  base.setItem(key,'stable');assert.equal(staging.getItem(key),null);staging.setItem(key,'test');assert.equal(base.getItem(key),'stable');
 }
 assert.equal(staging.length,6);staging.clear();assert.equal(base.length,6);
 assert.equal(isTestEnvironment('/MIDI-HUD/pruebas/v6/editor/v3.html'),true);assert.equal(isTestEnvironment('/MIDI-HUD/v03.html'),false);
});
test('unified engine accepts channel 2, preserves overlays on duplicate state, and never emits MIDI',()=>{
 const e=createEngine(fixture(),{midiChannel:2});const initial=e.getState();e.dispatch(cc(80,2,1));assert.deepEqual(e.getState(),initial);
 e.dispatch(cc(80,2));e.dispatch(cc(81,0));e.dispatch(cc(91,88));const before=e.getState();
 assert.deepEqual(e.dispatch(cc(80,2)).intents,[]);assert.deepEqual(e.getState(),before);
 const db=fixture();for(let i=0;i<1000;i++){assert.deepEqual(e.dispatch(cc(80,i%3)).intents,[]);assert.equal(e.getViewModel().state.id,db.states[i%3].id);}
});
test('explicit library update preserves full operational session and clock; incompatible edits are rejected atomically',()=>{
 const e=createEngine(fixture(),{midiChannel:2});e.dispatch(cc(80,2));e.dispatch(cc(81,0));e.dispatch(cc(91,75));
 for(let i=0;i<60;i++)e.dispatch({type:'MIDI_CLOCK',timestampMs:i*20});const before=e.getState();
 const edited=e.getLibrary();edited.songs[0].title='Título guardado';e.updateLibrary(edited);
 assert.deepEqual(e.getState(),before);assert.equal(e.getViewModel().song.title,'Título guardado');
 const broken=e.getLibrary(),song=broken.songs.find(s=>s.id===before.activeSongId);song.stateIds=song.stateIds.filter(id=>id!==before.activeStateId);broken.states=broken.states.filter(s=>s.id!==before.activeStateId);
 assert.throws(()=>e.updateLibrary(broken));assert.deepEqual(e.getState(),before);assert.equal(e.getViewModel().song.title,'Título guardado');
});
test('selected port alone feeds the parser; hot-unplug/reconnect and stale listeners preserve state',async t=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');t.after(()=>original?Object.defineProperty(globalThis,'navigator',original):delete globalThis.navigator);
 const a={id:'a',name:'Chocolate',state:'connected',open:async()=>{},onmidimessage:null},b={id:'b',name:'Other',state:'connected',open:async()=>{},onmidimessage:null};
 const access={inputs:new Map([['a',a],['b',b]]),onstatechange:null};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{requestMIDIAccess:async()=>access}});
 const storage=memory();storage.setItem('hudMidiPreferredDevice','a');const e=createEngine(fixture(),{midiChannel:2});const session=createBrowserMidiSession({storage,onMessage:event=>e.dispatch(event)});
 assert.equal(await session.start(),true);assert.equal(b.onmidimessage,null);
 a.onmidimessage({data:[0xb1,80],timeStamp:0});a.onmidimessage({data:[2],timeStamp:1});assert.equal(e.getState().activeStateId,'preset-solo');
 const stale=a.onmidimessage,before=e.getState();access.inputs.delete('a');a.state='disconnected';access.onstatechange();assert.equal(session.status,'disconnected');stale({data:[0xb1,80,0]});assert.deepEqual(e.getState(),before);
 a.state='connected';access.inputs.set('a',a);access.onstatechange();await new Promise(r=>setImmediate(r));assert.equal(session.status,'connected');assert.deepEqual(e.getState(),before);
 await session.select('b');assert.equal(a.onmidimessage,null);assert.equal(storage.getItem('hudMidiPreferredDevice'),'b');await session.close();assert.equal(b.onmidimessage,null);
});
