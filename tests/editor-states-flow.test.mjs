import * as imports from '../editor/catalog-import.mjs';
import * as sheets from '../core/lead-sheet-variants.mjs';
import * as catalog from '../core/catalog-v1.mjs';
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
import * as selection from '../core/live-selection-v34.mjs';
import * as transfer from '../core/library-transfer-v34.mjs';

// Ejecuta los handlers reales del Editor con un DOM de prueba, sin simular layout.
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.className='';this.attributes={};this.style={setProperty(k,v){this[k]=v;}};this.value='';this.checked=false;this.disabled=false;this.dataset={};this.listeners={};this.classList={toggle(){},contains(){return false;}};}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[...items];}
 add(item){this.append(item);}
 get options(){return this.children;}
 setAttribute(k,v){this.attributes[k]=String(v);}
 addEventListener(k,f){this.listeners[k]=f;}
 toggleAttribute(k,value){if(value)this.setAttribute(k,'');else delete this.attributes[k];}
 contains(target){return target===this||this.children.some(x=>x instanceof Element&&x.contains(target));}
 focus(){}
 select(){}
 setCustomValidity(){}
 reportValidity(){}
 click(){this.onclick?.();}
 remove(){}
 showModal(){this.open=true;}
 close(){this.open=false;this.listeners.close?.();}
 querySelectorAll(selector){
  const matches=x=>selector.startsWith('.')?x.className.split(' ').includes(selector.slice(1)):selector==='[aria-pressed=true]'?x.attributes['aria-pressed']==='true':false;
  return this.children.flatMap(x=>x instanceof Element?[...(matches(x)?[x]:[]),...x.querySelectorAll(selector)]:[]);
 }
 querySelector(s){return this.querySelectorAll(s)[0]??null;}
}
function setup({prepare=()=>{},tab='states'}={}){
 const html=readFileSync(new URL('../editor/v3.html',import.meta.url),'utf8'),elements=new Map();
 for(const m of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi))elements.set(m[2],new Element(m[1]));
 for(const m of html.matchAll(/<input\b[^>]*\bid="([^"]+)"[^>]*>/gi)){
  const value=m[0].match(/\bvalue="([^"]*)"/);if(value)elements.get(m[1]).value=value[1];
 }
 for(const m of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)){
  const first=m[2].match(/<option\b[^>]*\bvalue="([^"]*)"/);if(first)elements.get(m[1]).value=first[1];
 }
 const data=new Map(),writes=[];
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);writes.push(k);},removeItem:k=>data.delete(k)};
 const fixture=JSON.parse(readFileSync(new URL('../config/midi-hud-data-v2.json',import.meta.url)));
 const songId=model.newSong(fixture,'worship','Prueba');
 const song=fixture.songs.find(s=>s.id===songId),initial=fixture.states.find(st=>st.id===song.initialStateId);
 initial.name='Intro';initial.displayIndex=0;song.displaySlots[0].name='Intro';
 prepare(fixture,song,initial);
 data.set(storageAPI.LIBRARY_KEY,JSON.stringify(fixture));
 const downloads=[],copiedLinks=[];
 const context=vm.createContext({...notation,...sheetSave,...catalog,...sheets,...imports,...selection,...transfer,...recovery,...model,...engine,...visuals,...notation,...parser,...sheetSave,...storageAPI,...recovery,...selection,...transfer,
  document:{body:new Element('body'),getElementById:id=>elements.get(id),createElement:tag=>new Element(tag),querySelectorAll:()=>[],addEventListener(){}},
  Option:class extends Element{constructor(label,value){super('option');this.textContent=label;this.value=String(value);}},
  localStorage:storage,navigator:{clipboard:{writeText:async value=>copiedLinks.push(value)}},window:{location:{href:'https://geobit1989-crypto.github.io/MIDI-HUD/beta-v3.4/editor/v3.html',search:''},confirm:()=>context.confirmResult,prompt:()=>context.promptResult,addEventListener(){}},confirmResult:true,promptResult:null,
  confirm:()=>context.confirmResult,Blob,URL:{createObjectURL(blob){downloads.push(blob);return 'blob:test';},revokeObjectURL(){}},
  console,setTimeout(){},clearTimeout(){},seed:fixture,testSongId:songId,testTab:tab
 });
 let source=readFileSync(new URL('../editor/v3.mjs',import.meta.url),'utf8');
 source=source.replace(/^import\b[\s\S]*?;\s*/gm,'').replace(/^boot\(\)\.catch.*$/m,'');
 vm.runInContext(source,context);
 vm.runInContext(`committed=migrateCatalog(seed);working=copy(committed);activeRep='worship';activeSong=testSongId;activeState=currentSong().initialStateId;activeModule=currentState().displayIndex??null;activeTab=testTab;leadSource=formatLeadSheetText(currentSong().leadSheet);register();registerCatalog();render();globalThis.api={selectState,save,render,updateTab,useSong,useRepertoire,snapshot:()=>JSON.parse(JSON.stringify({working,committed,activeState,activeModule,activeRep,activeSong,activeTab,hasDraft,leadSource}))};`,context);
 const snapshot=()=>JSON.parse(JSON.stringify(context.api.snapshot()));
 const currentSong=()=>snapshot().working.songs.find(s=>s.id===songId);
 return {context,elements,storage,writes,snapshot,currentSong,songId,downloads,copiedLinks};
}
test('se pueden construir todos los estados y guardarlos una sola vez al final',async()=>{
 const t=setup(),ids=[t.snapshot().activeState];
 for(const name of ['Verso','Coro','Solo']){
  t.elements.get('stateAdd').onclick();ids.push(t.snapshot().activeState);
  t.elements.get('moduleName').value=name;t.elements.get('moduleName').oninput();
  assert.equal(t.elements.get('moduleGrid').children[t.snapshot().activeModule].querySelector('.tile-name').textContent,name);
  t.elements.get('moduleSub').value='Sonido '+name;t.elements.get('moduleSub').oninput();
 }
 // Visitar estados pendientes no descarta ni escribe los demás.
 t.context.api.selectState(ids[0]);t.context.api.selectState(ids[2]);
 assert.equal(t.writes.length,0);assert.equal(t.snapshot().hasDraft,true);
 await t.context.api.save();
 assert.deepEqual(t.writes.filter(k=>!k.startsWith("midiHud")),[storageAPI.BACKUP_KEY,storageAPI.LIBRARY_KEY]);
 const saved=JSON.parse(t.storage.getItem(storageAPI.LIBRARY_KEY));
 const states=ids.map(id=>saved.states.find(st=>st.id===id));
 assert.deepEqual(states.map(st=>st.name),['Intro','Verso','Coro','Solo']);
 assert.deepEqual(states.map(st=>st.displayIndex),[0,1,2,3]);
 assert.deepEqual(saved.songs.find(s=>s.id===t.songId).displaySlots.map(s=>s.name),['Intro','Verso','Coro','Solo']);
 assert.equal(t.snapshot().hasDraft,false);assert.equal(engine.validateLibrary(saved),true);
});
test('referencias U01-1 y P50-5 se guardan y se recuperan como texto por estado',async()=>{
 const t=setup(),ids=[],patches=['U01-1','P50-5','001'];
 const html=readFileSync(new URL('../editor/v3.html',import.meta.url),'utf8');
 assert.match(html,/<input\b[^>]*id="statePatch"[^>]*type="text"/);
 for(const [i,patch] of patches.entries()){
  if(i)t.elements.get('stateAdd').onclick();
  ids.push(t.snapshot().activeState);
  t.elements.get('statePatch').value=patch;t.elements.get('statePatch').oninput();
 }
 assert.equal(t.writes.length,0);
 await t.context.api.save();
 const saved=JSON.parse(t.storage.getItem(storageAPI.LIBRARY_KEY));
 assert.deepEqual(ids.map(id=>saved.states.find(st=>st.id===id).gtPatch),patches);
 vm.runInContext('working=JSON.parse(readLibrarySource(localStorage));committed=copy(working);hasDraft=false;',t.context);
 for(const [i,id] of ids.entries()){
  t.context.api.selectState(id);
  assert.equal(t.elements.get('statePatch').value,patches[i]);
  const live=engine.createEngine(saved).dispatch({type:'PREVIEW_STATE',stateId:id});
  assert.equal(live.view.state.gtPatch,patches[i]);assert.deepEqual(live.intents,[]);
 }
 t.elements.get('statePatch').value='';t.elements.get('statePatch').oninput();
 await t.context.api.save();
 const cleared=JSON.parse(t.storage.getItem(storageAPI.LIBRARY_KEY));
 assert.equal(cleared.states.find(st=>st.id===ids[2]).gtPatch,null);
 assert.deepEqual(ids.slice(0,2).map(id=>cleared.states.find(st=>st.id===id).gtPatch),patches.slice(0,2));
});
test('nombrar un módulo vacío crea su estado y conserva el estado anterior',()=>{
 const t=setup(),initial=t.snapshot().activeState;
 t.elements.get('moduleGrid').children[1].onclick();
 assert.equal(t.snapshot().activeState,null);assert.equal(t.snapshot().activeModule,1);
 assert.equal(t.elements.get('moduleName').disabled,false);
 t.elements.get('moduleName').value='Verso';t.elements.get('moduleName').oninput();
 assert.equal(t.snapshot().working.states.find(st=>st.id===initial).name,'Intro');
 const state=t.snapshot().working.states.find(st=>st.id===t.snapshot().activeState);
 assert.equal(state.name,'Verso');assert.equal(state.displayIndex,1);
 assert.equal(t.snapshot().hasDraft,true);assert.equal(t.writes.length,0);
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

test('un módulo Intro sin estado puede convertirse en inicial sin sustituir Morph',async()=>{
 const t=setup({prepare(db,song,initial){
  initial.name='Morph';initial.displayIndex=4;
  song.displaySlots[4]={name:'Morph',sub:'+delay+reverb',kind:'expression'};
  song.moduleLayout='manual';song.displaySlots[2].rowBreakBefore=true;
 }});
 const morph=t.snapshot().activeState,before=t.snapshot().working;
 t.elements.get('moduleGrid').children[0].onclick();
 assert.equal(t.snapshot().activeState,null);
 t.elements.get('stateMakeInitial').onclick();
 const intro=t.snapshot().activeState;
 assert.notEqual(intro,morph);assert.equal(t.currentSong().initialStateId,intro);
 assert.equal(t.snapshot().working.states.find(st=>st.id===intro).name,'Intro');
 assert.equal(t.snapshot().working.states.find(st=>st.id===intro).displayIndex,0);
 assert.deepEqual(t.snapshot().working.states.find(st=>st.id===morph),before.states.find(st=>st.id===morph));
 assert.deepEqual(t.currentSong().displaySlots,before.songs.find(s=>s.id===t.songId).displaySlots);
 assert.deepEqual(t.snapshot().working.bindings,before.bindings);
 assert.equal(t.writes.length,0);assert.equal(t.snapshot().hasDraft,true);
 assert.equal(t.elements.get('songInitial').value,intro);
 assert.ok(t.elements.get('stateList').children.find(p=>p.textContent==='Intro · Inicial'));
 await t.context.api.save();
 const saved=JSON.parse(t.storage.getItem(storageAPI.LIBRARY_KEY));
 const live=engine.createEngine(saved).dispatch({type:'PREVIEW_SONG',songId:t.songId});
 assert.equal(live.view.state.id,intro);assert.deepEqual(live.intents,[]);
 t.elements.get('stateMakeInitial').onclick();
 assert.equal(t.currentSong().stateIds.length,2);
});
test('cambiar el inicial existente no cambia módulos ni asignaciones MIDI',async()=>{
 const t=setup({tab:'song'}),intro=t.snapshot().activeState;
 t.elements.get('stateAdd').onclick();const second=t.snapshot().activeState;
 const before=t.snapshot().working;
 t.elements.get('songInitial').value=second;t.elements.get('songInitial').onchange();
 assert.equal(t.currentSong().initialStateId,second);
 assert.equal(t.elements.get('stateList').children.find(p=>p.attributes['aria-pressed']==='true').textContent,'Nuevo estado · Inicial');
 assert.deepEqual(t.currentSong().displaySlots,before.songs.find(s=>s.id===t.songId).displaySlots);
 assert.deepEqual(t.snapshot().working.bindings,before.bindings);
 await t.context.api.save();
 t.context.api.selectState(intro);t.elements.get('stateMakeInitial').onclick();
 assert.equal(t.currentSong().initialStateId,intro);assert.equal(t.currentSong().stateIds.length,2);
});
test('cancelar un cambio de repertorio devuelve el selector al repertorio actual',()=>{
 let other;
 const t=setup({prepare(db){other=model.newRepertoire(db,'Otro');}});
 t.elements.get('moduleName').value='Intro pendiente';t.elements.get('moduleName').oninput();
 t.context.confirmResult=false;
 t.elements.get('repSelect').value=other;t.elements.get('repSelect').onchange({target:t.elements.get('repSelect')});
 assert.equal(t.snapshot().activeRep,'worship');
 assert.equal(t.elements.get('repSelect').value,'worship');
 assert.equal(t.snapshot().working.states.find(st=>st.id===t.snapshot().activeState).name,'Intro pendiente');
 assert.equal(t.writes.length,0);
});
test('CC y valor vacíos no se convierten en cero ni crean asignaciones',()=>{
 for(const field of ['midiCC','midiValue']){
  const t=setup({tab:'midi'}),before=t.snapshot().working.bindings;
  t.elements.get(field).value='';t.elements.get('actionAdd').onclick();
  assert.deepEqual(t.snapshot().working.bindings,before);
  assert.equal(t.snapshot().hasDraft,false);assert.equal(t.writes.length,0);
  assert.match(t.elements.get('editorNotice').textContent,/CC y valor/);
 }
});
test('fallar al almacenar una importación mantiene la biblioteca activa y guardada',async()=>{
 const t=setup(),before=t.snapshot(),stored=t.storage.getItem(storageAPI.LIBRARY_KEY);
 const incoming=structuredClone(before.committed);incoming.songs[0].title='IMPORTADA';
 const baseSet=t.storage.setItem;
 t.storage.setItem=(key,value)=>{if(key===storageAPI.LIBRARY_KEY)throw Error('Sin espacio');baseSet(key,value);};
 const file={size:1000,text:async()=>JSON.stringify(incoming)};
 await t.elements.get('importFile').onchange({target:{files:[file],value:'test.json'}});
 assert.deepEqual(t.snapshot().committed,before.committed);
 assert.deepEqual(t.snapshot().working,before.working);
 assert.equal(t.storage.getItem(storageAPI.LIBRARY_KEY),stored);
 assert.match(t.elements.get('editorNotice').textContent,/No se pudo importar/);
});
test('fallar al escribir el backup durante Deshacer conserva el guardado actual',()=>{
 const t=setup(),before=t.snapshot(),stored=t.storage.getItem(storageAPI.LIBRARY_KEY);
 const previous=structuredClone(before.committed);previous.songs[0].title='ANTES';
 t.storage.setItem(storageAPI.BACKUP_KEY,JSON.stringify(previous));
 const baseSet=t.storage.setItem;
 t.storage.setItem=(key,value)=>{if(key===storageAPI.BACKUP_KEY)throw Error('Sin espacio');baseSet(key,value);};
 t.elements.get('undo').onclick();
 assert.equal(t.storage.getItem(storageAPI.LIBRARY_KEY),stored);
 assert.deepEqual(t.snapshot().committed,before.committed);
 assert.match(t.elements.get('editorNotice').textContent,/Error al deshacer/);
});
test('bibliotecas sin array opcional de indicadores permiten añadir el primero',()=>{
 const t=setup({prepare(db,song,initial){delete initial.indicators;}});
 t.elements.get('indicatorId').value='boost';t.elements.get('indicatorLabel').value='Boost';
 t.elements.get('indicatorAdd').onclick();
 const indicators=t.snapshot().working.states.find(st=>st.id===t.snapshot().activeState).indicators;
 assert.deepEqual(indicators,[{id:'boost',label:'Boost',active:false,displayIndex:null}]);
});
test('guardar datos inválidos conserva el último guardado y mantiene el aviso hasta corregirlos',async()=>{
 const t=setup(),before=t.storage.getItem(storageAPI.LIBRARY_KEY);
 t.elements.get('statePatch').value='U01/1';t.elements.get('statePatch').oninput();
 await t.context.api.save();
 assert.equal(t.storage.getItem(storageAPI.LIBRARY_KEY),before);
 assert.equal(t.snapshot().hasDraft,true);assert.equal(t.writes.length,0);
 assert.equal(t.elements.get('saveStatus').textContent,'Revisar datos');
 assert.match(t.elements.get('editorNotice').textContent,/No se guardó/);
 t.elements.get('statePatch').value='U01-1';t.elements.get('statePatch').oninput();
 await t.context.api.save();
 assert.equal(t.snapshot().hasDraft,false);assert.equal(t.elements.get('saveStatus').textContent,'Guardado');
});
test('recorrido completo: Canción, Estados, Lead sheet y MIDI conservan los guardados anteriores',async()=>{
 const t=setup({tab:'song'});
 t.elements.get('songTitle').value='Canción de prueba';t.elements.get('songTitle').listeners.input();
 t.elements.get('songTone').value='Dm';t.elements.get('songTone').listeners.input();
 t.elements.get('songBpm').value='70';t.elements.get('songBpm').listeners.input();
 t.elements.get('songBank').value='C1';t.elements.get('songBank').listeners.input();
 await t.elements.get('songSave').onclick();
 t.context.api.updateTab('states');
 t.elements.get('stateAdd').onclick();const verse=t.snapshot().activeState;
 t.elements.get('moduleName').value='Verso';t.elements.get('moduleName').oninput();
 t.elements.get('statePatch').value='U01-2';t.elements.get('statePatch').oninput();
 t.elements.get('stateMakeInitial').onclick();
 await t.elements.get('statesSave').onclick();
 t.context.api.updateTab('sheet');
 t.elements.get('leadText').value='A - Intro\n| Do | Sol |';t.elements.get('leadText').oninput();
 await t.elements.get('sheetSave').onclick();
 t.context.api.updateTab('midi');
 const selectMessage=(cc,value)=>{
  t.elements.get('midiCC').value=String(cc);t.elements.get('midiCC').onchange();
  t.elements.get('midiValue').value=String(value);t.elements.get('midiValue').onchange();
 };
 selectMessage(100,64);t.elements.get('actionTarget').value=verse;t.elements.get('actionAdd').onclick();
 selectMessage(101,0);t.elements.get('actionType').value='SELECT_SONG';t.elements.get('actionType').onchange();
 t.elements.get('actionTarget').value=t.songId;t.elements.get('actionAdd').onclick();
 assert.equal(t.writes.filter(k=>!k.startsWith("midiHud")).length,6);
 await t.elements.get('midiSave').onclick();
 const saved=JSON.parse(t.storage.getItem(storageAPI.LIBRARY_KEY)),song=saved.songs.find(s=>s.id===t.songId);
 assert.equal(song.title,'Canción de prueba');assert.equal(song.tono,'Dm');assert.equal(song.tempoBpm,70);assert.equal(song.bank,'C1');
 assert.equal(song.initialStateId,verse);assert.equal(saved.states.find(st=>st.id===verse).gtPatch,'U01-2');
 assert.equal(song.chordNotation,'latino');assert.equal(song.leadSheet.sourceText,'A - Intro\n| Do | Sol |');
 assert.equal(song.midiBindings.find(b=>b.cc===100&&b.value===64).actions[0].stateId,verse);
 assert.equal(song.midiBindings.find(b=>b.cc===101&&b.value===0).actions[0].songId,t.songId);
 assert.equal(engine.createEngine(saved,{songId:t.songId,repertoireId:'worship'}).dispatch({type:'MIDI_CC',cc:100,value:64,channel:1}).view.state.id,verse);
 assert.equal(t.writes.filter(k=>!k.startsWith("midiHud")).length,8);assert.equal(t.snapshot().hasDraft,false);
});
test('cancelar la salida de una pestaña conserva el borrador; confirmar solo descarta lo pendiente',async()=>{
 const t=setup();
 t.elements.get('statePatch').value='P50-5';t.elements.get('statePatch').oninput();
 await t.context.api.save();
 t.elements.get('moduleName').value='Pendiente';t.elements.get('moduleName').oninput();
 t.context.confirmResult=false;t.context.api.updateTab('sheet');
 assert.equal(t.snapshot().activeTab,'states');assert.equal(t.snapshot().hasDraft,true);
 assert.equal(t.snapshot().working.states.find(st=>st.id===t.snapshot().activeState).name,'Pendiente');
 t.context.confirmResult=true;t.context.api.updateTab('sheet');
 assert.equal(t.snapshot().activeTab,'sheet');assert.equal(t.snapshot().hasDraft,false);
 const state=t.snapshot().working.states.find(st=>st.id===t.snapshot().activeState);
 assert.equal(state.name,'Intro');assert.equal(state.gtPatch,'P50-5');assert.equal(t.writes.filter(k=>!k.startsWith("midiHud")).length,2);
});
test('un Lead Sheet inválido no reemplaza al anterior; convertir y guardar conserva el cifrado elegido',async()=>{
 const t=setup({tab:'sheet'}),stored=t.storage.getItem(storageAPI.LIBRARY_KEY);
 t.elements.get('leadText').value='A - Intro\n| Q | G |';t.elements.get('leadText').oninput();
 await t.elements.get('sheetSave').onclick();
 assert.equal(t.storage.getItem(storageAPI.LIBRARY_KEY),stored);
 assert.equal(t.snapshot().hasDraft,true);assert.equal(t.elements.get('saveStatus').textContent,'Revisar datos');
 t.elements.get('leadText').value='A - Intro\n| Do | Sol/Si | Lam7 |';t.elements.get('leadText').oninput();
 t.elements.get('sheetNotation').value='americano';t.elements.get('sheetConvert').onclick();
 assert.equal(t.elements.get('leadText').value,'A - Intro\n| C | G/B | Am7 |');
 assert.equal(t.writes.length,0);
 await t.elements.get('sheetSave').onclick();
 const song=JSON.parse(t.storage.getItem(storageAPI.LIBRARY_KEY)).songs.find(s=>s.id===t.songId);
 assert.equal(song.leadSheet.sourceText,'A - Intro\n| C | G/B | Am7 |');assert.equal(song.chordNotation,'americano');
});
test('CC0 está reservado y los campos vacíos de la matriz muestran error',async()=>{
 const t=setup({tab:'midi'});
 t.elements.get('midiCC').value='0';t.elements.get('midiValue').value='0';t.elements.get('actionAdd').onclick();
 await t.elements.get('midiSave').onclick();
 assert.ok(!t.snapshot().working.songs.find(s=>s.id===t.songId).midiBindings.some(b=>b.cc===0&&b.value===0));
 t.elements.get('matrixStart').value='';t.elements.get('matrixStart').onchange();
 assert.equal(t.elements.get('midiMatrix').children.length,1);
 assert.match(t.elements.get('midiMatrix').children[0].textContent,/CC inicial/);
 t.elements.get('matrixStart').value='20';t.elements.get('matrixValue').value='';t.elements.get('matrixValue').onchange();
 assert.match(t.elements.get('midiMatrix').children[0].textContent,/valor fuera de rango/);
});
test('importación, exportación y Deshacer conservan las bibliotecas completas y sus iniciales',async()=>{
 const t=setup(),original=t.snapshot().committed,incoming=structuredClone(original);
 incoming.songs[0].title='Importada';incoming.songs[0].initialStateId='q-solo';incoming.states[3].gtPatch='P50-5';
 const file={size:1000,text:async()=>JSON.stringify(incoming)};
 await t.elements.get('importFile').onchange({target:{files:[file],value:'test.json'}});
 assert.deepEqual(t.snapshot().committed,incoming);assert.equal(t.snapshot().activeState,'q-solo');
 assert.deepEqual(JSON.parse(t.storage.getItem(storageAPI.BACKUP_KEY)),original);
 t.elements.get('exportBtn').onclick();
 assert.deepEqual(JSON.parse(await t.downloads[0].text()),incoming);
 t.elements.get('undo').onclick();
 assert.deepEqual(t.snapshot().committed,original);
 assert.deepEqual(JSON.parse(t.storage.getItem(storageAPI.LIBRARY_KEY)),original);
 t.elements.get('undo').onclick();
 assert.deepEqual(t.snapshot().committed,incoming);
});
test('rechazar importar y cancelar exportación con borradores no escribe ni descarga',async()=>{
 const t=setup(),before=t.snapshot().committed;
 t.context.confirmResult=false;
 const file={size:1000,text:async()=>JSON.stringify(before)};
 await t.elements.get('importFile').onchange({target:{files:[file],value:'test.json'}});
 assert.equal(t.writes.length,0);assert.deepEqual(t.snapshot().committed,before);
 t.elements.get('moduleName').value='Solo borrador';t.elements.get('moduleName').oninput();
 t.elements.get('exportBtn').onclick();assert.equal(t.downloads.length,0);
 t.context.confirmResult=true;t.elements.get('exportBtn').onclick();
 assert.deepEqual(JSON.parse(await t.downloads[0].text()),before);
});
test('crear, duplicar y quitar canciones y repertorios conserva una selección válida',()=>{
 const t=setup({tab:'song'});
 t.elements.get('repAdd').onclick();t.elements.get('repNameInput').value='Ensayo';t.elements.get('repForm').listeners.submit({preventDefault(){}});const rep=t.snapshot().activeRep;
 assert.equal(t.snapshot().working.repertoires.find(r=>r.id===rep).name,'Ensayo');
 t.elements.get('songAddSig').onclick();const sig=t.snapshot().activeSong;
 assert.equal(t.snapshot().working.songs.find(s=>s.id===sig).stateIds.length,4);
 t.elements.get('songCopy').onclick();assert.equal(t.snapshot().activeSong,sig);t.elements.get('songRemove').onclick();
 assert.equal(t.snapshot().working.songs.some(s=>s.id===sig),true);
 t.elements.get('repRemove').onclick();
 assert.equal(t.snapshot().working.repertoires.some(r=>r.id===rep),false);
 assert.equal(t.snapshot().activeRep,'worship');assert.equal(engine.validateLibrary(t.snapshot().working),true);
});
test('un estado sin módulo no desplaza los botones de la matriz ni anuncia que no hay módulos',()=>{
 const t=setup();
 t.elements.get('stateSlot').value='';t.elements.get('stateSlot').onchange();
 assert.equal(t.snapshot().activeModule,null);
 assert.equal(t.elements.get('moduleGrid').children.length,t.currentSong().displaySlots.length);
 assert.ok(t.elements.get('moduleGrid').children.every(tile=>tile.className.includes('module-select-tile')));
});
test('un módulo de expresión sin estado no crea un inicial por accidente',()=>{
 const t=setup();t.elements.get('moduleAdd').onclick();
 t.elements.get('moduleKind').value='expression';t.elements.get('moduleKind').onchange();
 t.context.api.render();const before=t.snapshot().working;
 assert.equal(t.elements.get('stateMakeInitial').disabled,true);
 t.elements.get('stateMakeInitial').onclick();
 assert.deepEqual(t.snapshot().working,before);
});
test('el menú de asociación permite crear Intro conservando Morph y su estado inicial',()=>{
 const t=setup({prepare(db,song,initial){
  initial.name='Morph';initial.displayIndex=4;
  song.displaySlots[4]={name:'Morph',sub:'Expresión',kind:'expression'};
 }});
 const morph=t.snapshot().activeState,before=t.snapshot().working;
 t.elements.get('moduleGrid').children[0].onclick();
 const select=t.elements.get('moduleLinkedState');
 assert.ok(select.options.some(o=>o.textContent.includes('Crear estado para este módulo')));
 select.value=select.dataset.createValue;select.onchange();
 const intro=t.snapshot().activeState;
 assert.notEqual(intro,morph);assert.equal(t.currentSong().initialStateId,morph);
 assert.equal(t.snapshot().working.states.find(st=>st.id===intro).name,'Intro');
 assert.equal(t.snapshot().working.states.find(st=>st.id===intro).displayIndex,0);
 assert.deepEqual(t.snapshot().working.states.find(st=>st.id===morph),before.states.find(st=>st.id===morph));
 assert.deepEqual(t.currentSong().displaySlots,before.songs.find(s=>s.id===t.songId).displaySlots);
 assert.deepEqual(t.snapshot().working.bindings,before.bindings);assert.equal(t.writes.length,0);
 t.elements.get('stateMakeInitial').onclick();assert.equal(t.currentSong().initialStateId,intro);
});
test('cancelar mover un estado a un módulo libre mantiene su asociación original',()=>{
 const t=setup(),intro=t.snapshot().activeState,before=t.snapshot().working;
 t.elements.get('moduleGrid').children[1].onclick();t.context.confirmResult=false;
 const select=t.elements.get('moduleLinkedState');select.value=intro;select.onchange();
 assert.deepEqual(t.snapshot().working,before);
 assert.equal(t.snapshot().activeState,null);assert.equal(t.snapshot().activeModule,1);
 assert.equal(select.value,'');assert.equal(t.snapshot().hasDraft,false);
});
test('añadir módulo, escribir un nombre y guardar crea el estado y su asociación automáticamente',async()=>{
 const t=setup(),before=t.snapshot().working;
 t.elements.get('moduleAdd').onclick();
 const id=t.snapshot().activeState,index=t.snapshot().activeModule;
 assert.ok(id);assert.equal(index,before.songs.find(s=>s.id===t.songId).displaySlots.length);
 for(const name of ['C','Co','Cor','Coro']){
  t.elements.get('moduleName').value=name;t.elements.get('moduleName').oninput();
  assert.equal(t.snapshot().activeState,id);
 }
 assert.equal(t.writes.length,0);
 await t.elements.get('statesSave').onclick();
 const saved=JSON.parse(t.storage.getItem(storageAPI.LIBRARY_KEY)),state=saved.states.find(st=>st.id===id),song=saved.songs.find(s=>s.id===t.songId);
 assert.equal(state.name,'Coro');assert.equal(state.displayIndex,index);assert.equal(song.displaySlots[index].name,'Coro');
 assert.equal(song.stateIds.length,2);assert.deepEqual(saved.bindings,before.bindings);
});
test('los cuatro módulos vacíos de una canción se nombran sin crear ni asociar estados a mano',async()=>{
 const t=setup({prepare(db,song,initial){initial.name='Estado inicial';song.displaySlots[0].name='—';}});
 const names=['Intro','Verso','Coro','Solo'],initial=t.currentSong().initialStateId;
 for(const [i,name] of names.entries()){
  t.elements.get('moduleGrid').children[i].onclick();
  t.elements.get('moduleName').value=name;t.elements.get('moduleName').oninput();
 }
 await t.elements.get('statesSave').onclick();
 const saved=JSON.parse(t.storage.getItem(storageAPI.LIBRARY_KEY)),song=saved.songs.find(s=>s.id===t.songId);
 assert.equal(song.stateIds.length,4);assert.equal(song.initialStateId,initial);
 assert.deepEqual(song.stateIds.map(id=>saved.states.find(st=>st.id===id).name),names);
 assert.deepEqual(song.stateIds.map(id=>saved.states.find(st=>st.id===id).displayIndex),[0,1,2,3]);
 assert.deepEqual(song.displaySlots.map(slot=>slot.name),names);
});
test('renombrar una sola vez conserva el ID y la asignación MIDI del estado',async()=>{
 let id;
 const t=setup({prepare(db,song,initial){id=initial.id;model.setBindingActions(db,100,127,[{type:'ACTIVATE_STATE',stateId:id}]);}});
 const bindings=t.snapshot().working.bindings;
 t.elements.get('moduleName').value='Coro';t.elements.get('moduleName').oninput();
 await t.elements.get('statesSave').onclick();
 const saved=JSON.parse(t.storage.getItem(storageAPI.LIBRARY_KEY));
 assert.deepEqual(saved.bindings,bindings);assert.equal(t.snapshot().activeState,id);
 const result=engine.createEngine(saved,{songId:t.songId,repertoireId:'worship'}).dispatch({type:'MIDI_CC',cc:100,value:127,channel:1});
 assert.equal(result.view.state.id,id);assert.equal(result.view.state.name,'Coro');
 assert.equal(result.view.song.displaySlots[result.view.state.displayIndex].name,'Coro');
});
test('añadir y nombrar Morph como expresión no crea un estado ni cambia el inicial',async()=>{
 const t=setup(),before=t.snapshot().working,initial=t.currentSong().initialStateId;
 t.elements.get('moduleExpressionAdd').onclick();const index=t.snapshot().activeModule;
 t.elements.get('moduleName').value='Morph';t.elements.get('moduleName').oninput();
 t.elements.get('moduleSub').value='+delay+reverb';t.elements.get('moduleSub').oninput();
 await t.elements.get('statesSave').onclick();
 const saved=JSON.parse(t.storage.getItem(storageAPI.LIBRARY_KEY)),song=saved.songs.find(s=>s.id===t.songId);
 assert.equal(song.displaySlots[index].kind,'expression');assert.equal(song.displaySlots[index].name,'Morph');
 assert.deepEqual(song.stateIds,before.songs.find(s=>s.id===t.songId).stateIds);
 assert.equal(song.initialStateId,initial);assert.deepEqual(saved.bindings,before.bindings);
 assert.equal(t.snapshot().activeState,null);
});
test('los controles auxiliares no crean estados y conservan ese comportamiento tras guardar y mover',async()=>{
 const t=setup(),initial=t.currentSong().initialStateId;
 t.elements.get('moduleUtilityAdd').onclick();
 t.elements.get('moduleName').value='Tap tempo';t.elements.get('moduleName').oninput();
 t.elements.get('moduleUp').onclick();
 t.elements.get('moduleName').value='Tap';t.elements.get('moduleName').oninput();
 await t.elements.get('statesSave').onclick();
 const saved=JSON.parse(t.storage.getItem(storageAPI.LIBRARY_KEY)),song=saved.songs.find(s=>s.id===t.songId);
 assert.deepEqual(song.stateIds,[initial]);assert.equal(t.snapshot().activeState,null);
 assert.equal(song.displaySlots[t.snapshot().activeModule].stateMode,'manual');
});
test('convertir un módulo recién añadido en expresión retira solo el estado automático sin uso',()=>{
 const t=setup(),before=t.currentSong().stateIds;
 t.elements.get('moduleAdd').onclick();t.elements.get('moduleName').value='Morph';t.elements.get('moduleName').oninput();
 t.elements.get('moduleKind').value='expression';t.elements.get('moduleKind').onchange();
 assert.deepEqual(t.currentSong().stateIds,before);assert.equal(t.snapshot().activeState,null);
 assert.equal(t.currentSong().displaySlots[t.snapshot().activeModule].name,'Morph');
});
test('cambiar el tipo conserva estados con patch, indicadores o referencias MIDI existentes',()=>{
 let stateId;
 const t=setup({prepare(db,song,initial){stateId=initial.id;initial.gtPatch='U01-1';model.setBindingActions(db,100,127,[{type:'ACTIVATE_STATE',stateId}]);}});
 const before=t.snapshot().working;
 t.elements.get('moduleKind').value='expression';t.elements.get('moduleKind').onchange();
 assert.deepEqual(t.snapshot().working.bindings,before.bindings);
 assert.deepEqual(t.snapshot().working.states.find(st=>st.id===stateId),before.states.find(st=>st.id===stateId));
});
test('el formulario tiene un solo nombre y las asociaciones manuales están cerradas por defecto',()=>{
 const html=readFileSync(new URL('../editor/v3.html',import.meta.url),'utf8');
 assert.equal((html.match(/id="moduleName"/g)||[]).length,1);
 assert.doesNotMatch(html,/id="stateName"|Título visible|Nombre del estado/);
 const details=html.match(/<details\b[^>]*id="stateAdvanced"[^>]*>[\s\S]*?<\/details>/)?.[0];
 assert.ok(details);assert.doesNotMatch(details.split('>')[0],/\bopen\b/);
 assert.match(details,/id="stateSlot"/);assert.match(details,/id="moduleLinkedState"/);
});
test('escribir el nombre conserva las casillas y los campos de indicadores pendientes',()=>{
 const t=setup(),tiles=[...t.elements.get('moduleGrid').children];
 t.elements.get('indicatorSlot').value='2';
 t.elements.get('indicatorLabel').value='Boost pendiente';
 for(const name of ['C','Co','Cor','Coro']){
  t.elements.get('moduleName').value=name;t.elements.get('moduleName').oninput();
  assert.ok(t.elements.get('moduleGrid').children.every((tile,i)=>tile===tiles[i]));
 }
 assert.equal(t.elements.get('indicatorSlot').value,'2');
 assert.equal(t.elements.get('indicatorLabel').value,'Boost pendiente');
});
test('Morph, Wah y Whammy se configuran una vez y responden encima de Intro sin sustituirlo',async()=>{
 const t=setup({prepare(db,song){
  song.displaySlots=[song.displaySlots[0],{name:'Coro',sub:'Dist',kind:'control',stateMode:'auto'}];
  model.ensureModuleState(db,song.id,1);
 }});
 const [intro,coro]=t.currentSong().stateIds,expressions=[];
 for(const name of ['Morph','Wah','Whammy']){
  t.elements.get('moduleExpressionAdd').onclick();
  const index=t.snapshot().activeModule;
  t.elements.get('moduleName').value=name;t.elements.get('moduleName').oninput();
  assert.equal(t.snapshot().activeState,null);assert.equal(t.elements.get('moduleActivation').hidden,false);
  assert.equal(t.elements.get('expressionActivationNote').hidden,false);
  assert.equal(t.elements.get('moduleActivationRows').children.length,2);
  if(name==='Morph'){
   const select=t.elements.get('moduleActivationRows').children[1].children[1];
   select.value='true';select.onchange();
  }
  expressions.push({name,index,id:t.currentSong().displaySlots[index].indicatorId});
 }
 assert.deepEqual(t.currentSong().stateIds,[intro,coro]);assert.equal(t.currentSong().initialStateId,intro);
 assert.equal(t.writes.length,0);await t.elements.get('statesSave').onclick();
 t.context.api.updateTab('midi');
 const assign=(cc,value,type,target)=>{
  t.elements.get('midiCC').value=String(cc);t.elements.get('midiCC').onchange();
  t.elements.get('midiValue').value=String(value);t.elements.get('midiValue').onchange();
  t.elements.get('actionType').value=type;t.elements.get('actionType').onchange();
  t.elements.get('actionTarget').value=target;t.elements.get('actionAdd').onclick();
 };
 assign(100,127,'ACTIVATE_STATE',intro);assign(101,127,'ACTIVATE_STATE',coro);
 for(const [i,item] of expressions.entries()){
  const target=JSON.stringify([t.songId,item.index]);
  assign(110+i,127,'MODULE_ON',target);assign(110+i,0,'MODULE_OFF',target);
  assert.ok(t.elements.get('actionTarget').options.some(option=>option.textContent==='Prueba · '+item.name));
 }
 await t.elements.get('midiSave').onclick();
 const saved=JSON.parse(t.storage.getItem(storageAPI.LIBRARY_KEY)),hud=engine.createEngine(saved,{repertoireId:"worship",songId:t.songId});
 const send=(cc,value=127)=>hud.dispatch({type:'MIDI_CC',channel:1,cc,value});
 send(100);
 assert.ok(hud.getViewModel().state.indicators.every(ind=>!ind.active));
 for(let i=0;i<expressions.length;i++){
  const result=send(110+i);
  assert.equal(result.view.state.id,intro);assert.deepEqual(result.intents,[]);
 }
 assert.deepEqual(hud.getViewModel().state.indicators.filter(ind=>ind.active).map(ind=>ind.label),['Morph','Wah','Whammy']);
 send(111,0);
 assert.equal(hud.getViewModel().state.id,intro);
 assert.deepEqual(hud.getViewModel().state.indicators.filter(ind=>ind.active).map(ind=>ind.label),['Morph','Whammy']);
 send(101);
 assert.equal(hud.getViewModel().state.id,coro);
 assert.deepEqual(hud.getViewModel().state.indicators.filter(ind=>ind.active).map(ind=>ind.label),['Morph']);
 send(110,0);assert.ok(hud.getViewModel().state.indicators.every(ind=>!ind.active));
 send(100);assert.ok(hud.getViewModel().state.indicators.every(ind=>!ind.active));
 assert.equal(t.snapshot().hasDraft,false);assert.equal(engine.validateLibrary(saved),true);
});
test('crear Delay como efecto configura su encendido sin crear un estado musical',async()=>{
 const t=setup(),initial=t.currentSong().initialStateId;
 t.elements.get('moduleEffectAdd').onclick();
 t.elements.get('moduleName').value='Delay';t.elements.get('moduleName').oninput();
 const select=t.elements.get('moduleActivationRows').children[0].children[1];
 select.value='true';select.onchange();
 assert.equal(t.elements.get('expressionActivationNote').hidden,true);
 assert.equal(t.elements.get('stateMakeInitial').disabled,true);
 await t.elements.get('statesSave').onclick();
 const song=t.currentSong(),state=t.snapshot().working.states.find(st=>st.id===initial);
 assert.deepEqual(song.stateIds,[initial]);assert.equal(song.initialStateId,initial);
 assert.equal(state.indicators.find(ind=>ind.displayIndex===t.snapshot().activeModule).active,true);
 t.elements.get('moduleGrid').children[0].onclick();
 assert.equal(t.elements.get('moduleActivation').hidden,true);
});
test('el enlace MIDI guarda el borrador y traslada prueba 1 sin descargar archivos JSON',async()=>{
 const t=setup({prepare(db,song){db.repertoires.push({id:'prueba-1',name:'prueba 1',songIds:[song.id]});}});
 t.context.api.useRepertoire('prueba-1');t.context.api.updateTab('states');
 t.elements.get('moduleName').value='Intro nueva';t.elements.get('moduleName').oninput();
 await t.elements.get('midiLinkBtn').onclick();
 assert.equal(t.snapshot().hasDraft,false);assert.equal(t.elements.get('midiLinkBtn').disabled,false);
 assert.equal(t.downloads.length,0);
 const dialog=t.context.document.body.children.at(-1);assert.equal(dialog.open,true);
 await dialog.children.at(-1).children[0].onclick();
 const url=new URL(t.copiedLinks[0]),packet=await transfer.decodeLibraryTransfer(url.hash);
 assert.equal(url.searchParams.get('repertoire'),'prueba-1');assert.equal(packet.repertoireId,'prueba-1');
 assert.deepEqual(packet.library,JSON.parse(t.storage.getItem(storageAPI.LIBRARY_KEY)));
 assert.equal(packet.library.states.find(st=>st.id===t.snapshot().activeState).name,'Intro nueva');
 assert.equal(new URL(t.elements.get('liveLink').href,t.context.window.location.href).searchParams.get('repertoire'),'prueba-1');
});
