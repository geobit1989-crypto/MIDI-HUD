import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installCloudSync} from '../core/sync-ui.mjs';
import {LIBRARY_KEY} from '../core/library-storage.mjs';
const fixture=()=>JSON.parse(readFileSync(new URL('../config/midi-hud-data-v2.json',import.meta.url)));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<150;i++){if(check())return;await wait(20);}assert.fail('Timed out waiting for sync');}
class Node{children=[];attrs={};append(...x){this.children.push(...x);}setAttribute(k,v){this.attrs[k]=v;}remove(){} }
const storage=db=>{const map=new Map(db?[[LIBRARY_KEY,JSON.stringify(db)]]:[]);return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),get length(){return map.size;},key:i=>[...map.keys()][i]};};
test('actual sync UI: offline startup restoration, automatic saves, queued transfer, LIVE snapshot, explicit refresh and no upload loop',async t=>{
 const originals=new Map(['document','window','MidiHudNative'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const listeners=new Map(),docListeners=new Map(),commits=new Map();let offline=true,appendGate=null,appends=0,active=0,maxActive=0;
 globalThis.document={visibilityState:'visible',getElementById:()=>null,createElement:()=>new Node(),head:new Node(),addEventListener:(k,f)=>docListeners.set(k,f),removeEventListener:k=>docListeners.delete(k)};
 globalThis.window={addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
 const auth={id:'account-test-00001',email:'a@example.test'};
 globalThis.MidiHudNative={async call(command,request){
  if(command==='cloud.config')return {configured:true};
  if(command==='cloud.restore'){if(offline)throw Error('Offline');return auth;}
  if(command==='cloud.request'){
   if(offline)throw Error('Offline');active++;maxActive=Math.max(maxActive,active);
   try{
    if(request.method==='POST'){
     const boundary=request.headers['Content-Type'].split('boundary=')[1];
     const part=request.body.split('--'+boundary)[2];const commit=JSON.parse(part.slice(part.indexOf('\r\n\r\n')+4).trim());
     appends++;if(appendGate)await appendGate;
     commits.set(commit.id,commit);return {id:commit.id};
    }
    if(request.query?.alt==='media')return structuredClone(commits.get(request.path.split('/').at(-1)));
    return {files:[...commits.values()].map(c=>({id:c.id,appProperties:{kind:c.format,commitId:c.id,...Object.fromEntries(c.parents.map((id,i)=>['parent'+i,id]))}}))};
   }finally{active--;}
  }
  throw Error(command);
 }};
 const store=storage(fixture()),host=new Node();let draft=false;
 let live;const ui=installCloudSync({host,storage:store,canApply:()=>!draft});
 t.after(()=>{ui.destroy();live?.destroy();for(const [key,desc] of originals){if(desc)Object.defineProperty(globalThis,key,desc);else delete globalThis[key];}});
 await ui.ready;assert.equal(commits.size,0);
 offline=false;await listeners.get('online')();assert.equal(commits.size,1,'restores session without opening Connect');
 const save=title=>{const db=JSON.parse(store.getItem(LIBRARY_KEY));db.songs[0].title=title;store.setItem(LIBRARY_KEY,JSON.stringify(db));listeners.get('hud-library-saved')();};
 let release;appendGate=new Promise(r=>release=r);save('First');await until(()=>appends===2);
 save('Second');await wait(400);appendGate=null;release();await until(()=>[...commits.values()].at(-1).library.songs[0].title==='Second');
 assert.equal(maxActive,1,'only one request in flight per device');assert.equal(commits.size,3);
 const count=commits.size;await listeners.get('focus')();await listeners.get('pageshow')();assert.equal(commits.size,count,'received identical library does not upload forever');
 offline=true;save('Offline edit');await wait(450);assert.equal(commits.size,count);
 offline=false;await listeners.get('online')();assert.equal([...commits.values()].at(-1).library.songs[0].title,'Offline edit');
 draft=true;save('Draft guard');await wait(400);assert.notEqual([...commits.values()].at(-1).library.songs[0].title,'Draft guard');
 draft=false;await listeners.get('hud-foreground')();assert.equal([...commits.values()].at(-1).library.songs[0].title,'Draft guard');
 ui.destroy();
 const liveStore=storage(),liveHost=new Node(),applied=[];
 live=installCloudSync({host:liveHost,storage:liveStore,mode:'live',onApplied:x=>applied.push(x)});
 await live.ready;assert.equal(JSON.parse(liveStore.getItem(LIBRARY_KEY)).songs[0].title,'Draft guard');assert.equal(applied.length,0,'download updates storage, not operational LIVE');
 await live.synchronize({explicit:true});assert.equal(applied.length,1,'explicit refresh invokes apply exactly once');
 const before=commits.size;await live.synchronize();assert.equal(commits.size,before);assert.equal(applied.length,1);
});
