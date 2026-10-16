import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as model from '../editor/editor-model.mjs';
import * as engine from '../core/engine-v1.mjs';
import * as visuals from '../core/module-visuals.mjs';
import * as notation from '../editor/chord-notation.mjs';
import * as parser from '../editor/lead-sheet-text.mjs';
import * as sheetSave from '../editor/sheet-save.mjs';
import * as storageAPI from '../core/library-storage.mjs';
import * as recovery from '../editor/recovery-v1.mjs';

// Ejecuta los handlers reales del Editor con un DOM de prueba, sin simular layout.
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.className='';this.attributes={};this.style={setProperty(k,v){this[k]=v;}};this.value='';this.checked=false;this.disabled=false;this.dataset={};this.listeners={};this.classList={toggle(){},contains(){return false;}};}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[...items];}
 add(item){this.append(item);}
 get options(){return this.children;}
 setAttribute(k,v){this.attributes[k]=String(v);}
 addEventListener(k,f){this.listeners[k]=f;}
 querySelectorAll(selector){
  const matches=x=>selector.startsWith('.')?x.className.split(' ').includes(selector.slice(1)):selector==='[aria-pressed=true]'?x.attributes['aria-pressed']==='true':false;
  return this.children.flatMap(x=>x instanceof Element?[...(matches(x)?[x]:[]),...x.querySelectorAll(selector)]:[]);
 }
 querySelector(s){return this.querySelectorAll(s)[0]??null;}
}
function setup(){
 const html=readFileSync(new URL('../editor/v3.html',import.meta.url),'utf8'),elements=new Map();
 for(const m of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi))elements.set(m[2],new Element(m[1]));
 const data=new Map(),writes=[];
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);writes.push(k);}};
 const fixture=JSON.parse(readFileSync(new URL('../config/midi-hud-data-v2.json',import.meta.url)));
 const songId=model.newSong(fixture,'worship','Prueba');
 const song=fixture.songs.find(s=>s.id===songId),initial=fixture.states.find(st=>st.id===song.initialStateId);
 initial.name='Intro';initial.displayIndex=0;song.displaySlots[0].name='Intro';
 const context=vm.createContext({...model,...engine,...visuals,...notation,...parser,...sheetSave,...storageAPI,...recovery,
  document:{getElementById:id=>elements.get(id),createElement:tag=>new Element(tag),querySelectorAll:()=>[],addEventListener(){}},
  Option:class extends Element{constructor(label,value){super('option');this.textContent=label;this.value=String(value);}},
  localStorage:storage,window:{confirm:()=>context.confirmResult,addEventListener(){}},confirmResult:true,
  console,setTimeout(){},clearTimeout(){},seed:fixture,testSongId:songId
 });
 let source=readFileSync(new URL('../editor/v3.mjs',import.meta.url),'utf8');
 source=source.replace(/^import\b[\s\S]*?;\s*/gm,'').replace(/^boot\(\)\.catch.*$/m,'');
 vm.runInContext(source,context);
 vm.runInContext(`committed=copy(seed);working=copy(seed);activeRep='worship';activeSong=testSongId;activeState=currentSong().initialStateId;activeModule=0;activeTab='states';register();renderStates();globalThis.api={selectState,save,snapshot:()=>JSON.parse(JSON.stringify({working,committed,activeState,activeModule,hasDraft}))};`,context);
 const snapshot=()=>JSON.parse(JSON.stringify(context.api.snapshot()));
 const currentSong=()=>snapshot().working.songs.find(s=>s.id===songId);
 return {context,elements,storage,writes,snapshot,currentSong,songId};
}
test('se pueden construir todos los estados y guardarlos una sola vez al final',async()=>{
 const t=setup(),ids=[t.snapshot().activeState];
 for(const name of ['Verso','Coro','Solo']){
  t.elements.get('stateAdd').onclick();ids.push(t.snapshot().activeState);
  t.elements.get('stateName').value=name;t.elements.get('stateName').oninput();
  assert.equal(t.elements.get('moduleName').value,name);
  assert.ok(t.elements.get('stateSelectionNote').textContent.includes(name));
  t.elements.get('moduleSub').value='Sonido '+name;t.elements.get('moduleSub').oninput();
 }
 // Visitar estados pendientes no descarta ni escribe los demás.
 t.context.api.selectState(ids[0]);t.context.api.selectState(ids[2]);
 assert.equal(t.writes.length,0);assert.equal(t.snapshot().hasDraft,true);
 await t.context.api.save();
 assert.deepEqual(t.writes,[storageAPI.BACKUP_KEY,storageAPI.LIBRARY_KEY]);
 const saved=JSON.parse(t.storage.getItem(storageAPI.LIBRARY_KEY));
 const states=ids.map(id=>saved.states.find(st=>st.id===id));
 assert.deepEqual(states.map(st=>st.name),['Intro','Verso','Coro','Solo']);
 assert.deepEqual(states.map(st=>st.displayIndex),[0,1,2,3]);
 assert.deepEqual(saved.songs.find(s=>s.id===t.songId).displaySlots.map(s=>s.name),['Intro','Verso','Coro','Solo']);
 assert.equal(t.snapshot().hasDraft,false);assert.equal(engine.validateLibrary(saved),true);
});
test('elegir un módulo sin estado no permite editar por accidente el estado anterior',()=>{
 const t=setup(),initial=t.snapshot().activeState;
 t.elements.get('moduleGrid').children[1].onclick();
 assert.equal(t.snapshot().activeState,null);assert.equal(t.snapshot().activeModule,1);
 assert.equal(t.elements.get('stateName').disabled,true);
 t.elements.get('stateName').value='No debe sustituir Intro';t.elements.get('stateName').oninput();
 assert.equal(t.snapshot().working.states.find(st=>st.id===initial).name,'Intro');
 assert.equal(t.snapshot().hasDraft,false);assert.equal(t.writes.length,0);
});
test('crear más estados no usa Morph ni vuelve a editar el módulo anterior',()=>{
 const t=setup();for(let i=0;i<3;i++)t.elements.get('stateAdd').onclick();
 t.elements.get('moduleAdd').onclick();
 t.elements.get('moduleName').value='Morph';t.elements.get('moduleName').oninput();
 t.elements.get('moduleKind').value='expression';t.elements.get('moduleKind').onchange();
 const before=t.currentSong().stateIds.map(id=>t.snapshot().working.states.find(st=>st.id===id).displayIndex);
 t.elements.get('stateAdd').onclick();
 assert.equal(t.snapshot().activeModule,5);
 assert.equal(t.currentSong().displaySlots[4].name,'Morph');
 assert.deepEqual(t.currentSong().stateIds.slice(0,4).map(id=>t.snapshot().working.states.find(st=>st.id===id).displayIndex),before);
 assert.equal(t.writes.length,0);
});
test('cancelar una reasignación a un módulo ocupado conserva las dos asociaciones',()=>{
 const t=setup(),intro=t.snapshot().activeState;
 t.elements.get('stateAdd').onclick();const other=t.snapshot().activeState;
 t.context.api.selectState(intro);t.context.confirmResult=false;
 t.elements.get('stateSlot').value='1';t.elements.get('stateSlot').onchange();
 const states=t.snapshot().working.states;
 assert.equal(states.find(st=>st.id===intro).displayIndex,0);
 assert.equal(states.find(st=>st.id===other).displayIndex,1);
 assert.equal(t.elements.get('stateSlot').value,'0');
});
test('duplicar crea una asociación independiente y conserva el original',()=>{
 const t=setup(),intro=t.snapshot().activeState;
 t.elements.get('stateCopy').onclick();const copy=t.snapshot().activeState;
 assert.notEqual(copy,intro);const states=t.snapshot().working.states;
 assert.equal(states.find(st=>st.id===intro).displayIndex,0);
 assert.equal(states.find(st=>st.id===copy).displayIndex,1);
 assert.equal(t.snapshot().activeModule,1);assert.equal(t.writes.length,0);
});
test('un nuevo estado respeta los módulos ya usados por indicadores',()=>{
 const t=setup();
 vm.runInContext("currentState().indicators=[{id:'boost',label:'Boost',active:false,displayIndex:1}];",t.context);
 t.elements.get('stateAdd').onclick();
 assert.equal(t.snapshot().activeModule,2);
});
