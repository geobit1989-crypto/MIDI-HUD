import * as recovery from '../editor/recovery-v1.mjs';
import * as transfer from '../core/library-transfer-v34.mjs';
import * as selection from '../core/live-selection-v34.mjs';
import * as sheetSave from '../editor/sheet-save.mjs';
import * as notation from '../editor/chord-notation.mjs';
import * as sheets from "../core/lead-sheet-variants.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as catalog from '../core/catalog-v1.mjs';
import * as model from '../editor/editor-model.mjs';
import * as engine from '../core/engine-v1.mjs';
import * as visuals from '../core/module-visuals.mjs';
import * as imports from '../editor/catalog-import.mjs';
import * as parser from '../editor/lead-sheet-text.mjs';
import * as storageAPI from '../core/library-storage.mjs';

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
 const context=vm.createContext({...notation,...sheetSave,...catalog,...sheets,...imports,...selection,...transfer,...recovery,...model,...engine,...visuals,...parser,...storageAPI,...catalog,...sheets,...imports,installCloudSync:()=>{},Event:class{},
  document:{body:new Element('body'),getElementById:id=>elements.get(id),createElement:tag=>new Element(tag),querySelectorAll:()=>[],addEventListener(){},dispatchEvent(){}},
  Option:class extends Element{constructor(label,value){super('option');this.textContent=label;this.value=String(value);}},
  localStorage:storage,navigator:{clipboard:{writeText:async value=>copiedLinks.push(value)}},window:{location:{href:'https://geobit1989-crypto.github.io/MIDI-HUD/beta-v3.4/editor/v3.html',search:''},confirm:()=>context.confirmResult,prompt:()=>context.promptResult,addEventListener(){},dispatchEvent(){}},confirmResult:true,promptResult:null,
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

test('crear, reabrir y llenar una lista vacía ejecuta handlers reales sin borrar catálogo',()=>{
 const t=setup({tab:'song'}),count=t.snapshot().committed.songs.length;
 t.elements.get('repAdd').onclick();t.elements.get('repNameInput').value='Miércoles';
 t.elements.get('repForm').listeners.submit({preventDefault(){}});
 let saved=t.snapshot();assert.equal(saved.committed.songs.length,count);
 const id=saved.activeRep;assert.deepEqual(saved.working.repertoires.find(r=>r.id===id).songIds,[]);
 assert.equal(t.elements.get('emptyPlaylist').hidden,false);
 t.context.api.useRepertoire('worship');t.context.api.useRepertoire(id);
 const row=t.elements.get('masterResults').children[0];row.children.at(-1).onclick();
 saved=t.snapshot();assert.equal(saved.committed.songs.length,count);
 assert.equal(saved.working.repertoires.find(r=>r.id===id).songIds.length,1);
 t.elements.get('songRemove').onclick();saved=t.snapshot();
 assert.equal(saved.committed.songs.length,count);assert.equal(saved.activeSong,null);
});

test('editar una maestra sin lista, guardar, archivar y recuperar historial usa controles reales',()=>{
 const t=setup({tab:'song'});t.elements.get('masterNew').onclick();
 const id=t.snapshot().activeSong;
 assert(!t.snapshot().committed.repertoires.some(r=>r.songIds.includes(id)));
 t.elements.get('songTitle').value='Maestra preparada';t.elements.get('songTitle').listeners.input();
 t.elements.get('versionSave').onclick();
 let song=t.snapshot().committed.songs.find(s=>s.id===id);
 assert.equal(song.title,'Maestra preparada');assert.equal(song.catalog.history.length,1);
 t.elements.get('versionArchive').onclick();
 song=t.snapshot().committed.songs.find(s=>s.id===id);assert.equal(song.catalog.archived,true);
 t.elements.get('versionHistory').value=song.catalog.history[0].id;t.elements.get('versionRestore').onclick();
 song=t.snapshot().committed.songs.find(s=>s.id===id);assert.equal(song.title,'Nueva canción');
 assert.equal(song.catalog.history.length,3);
});

test('duplicar lista y guardar nota no cambia versiones musicales ni otras listas',()=>{
 const t=setup({tab:'song'}),before=t.snapshot();
 t.elements.get('repDuplicate').onclick();t.elements.get('repNameInput').value='Copia';
 t.elements.get('repForm').listeners.submit({preventDefault(){}});
 const after=t.snapshot();assert.equal(after.committed.repertoires.length,before.committed.repertoires.length+1);
 assert.deepEqual(after.committed.songs,before.committed.songs);
 t.elements.get('occasionNote').value='Intro corta';t.elements.get('occasionSave').onclick();
 const written=t.snapshot().committed;
 assert.equal(written.repertoires.find(r=>r.name==='Copia').entryNotes[after.activeSong],'Intro corta');
 assert.equal(written.repertoires.find(r=>r.id==='worship').entryNotes,undefined);
 assert.deepEqual(written.songs,before.committed.songs);
});

test('primer guardado conserva JSON original de migración y fallo de cuota no cambia biblioteca',()=>{
 const t=setup({tab:'song'}),original=t.storage.getItem(storageAPI.LIBRARY_KEY);
 t.elements.get('songTitle').value='Guardado';t.elements.get('songTitle').listeners.input();t.elements.get('versionSave').onclick();
 assert.equal(t.storage.getItem('midiHudCatalogMigrationV1'),original);
 const saved=t.storage.getItem(storageAPI.LIBRARY_KEY),backup=t.storage.getItem(storageAPI.BACKUP_KEY),set=t.storage.setItem;
 t.storage.setItem=(k,v)=>{if(k===storageAPI.LIBRARY_KEY)throw Error('Sin espacio');set(k,v);};
 t.elements.get('songTitle').value='No guardar';t.elements.get('songTitle').listeners.input();t.elements.get('versionSave').onclick();
 assert.equal(t.storage.getItem(storageAPI.LIBRARY_KEY),saved);assert.equal(t.storage.getItem(storageAPI.BACKUP_KEY),backup);
 assert.equal(t.storage.getItem('midiHudCatalogMigrationV1'),original);
 assert.match(t.elements.get('editorNotice').textContent,/No se guardó/);
});

test('variante de grados guarda partitura literal y no realiza conversión automática',()=>{
 const t=setup({tab:'sheet'});
 t.elements.get('leadText').value='A - INTRO\n| I | IV | V | vi |';t.elements.get('leadText').oninput();
 t.elements.get('newVariantName').value='Grados';t.elements.get('versionNew').onclick();
 const saved=t.snapshot(),song=saved.committed.songs.find(s=>s.id===saved.activeSong);
 const selected=sheets.resolveLeadSheet(song,saved.committed.repertoires.find(r=>r.id===saved.activeRep));assert.equal(selected.name,'Grados');assert.equal(selected.leadSheet.sourceText,'A - INTRO\n| I | IV | V | vi |');
});

test('crear lead sheet desde borrador conserva canción, controles y variante anterior',()=>{
 const t=setup({tab:'sheet'}),before=t.snapshot(),source=before.committed.songs.find(s=>s.id===before.activeSong);
 t.elements.get('leadText').value='A - Intro\n| I | IV |';t.elements.get('leadText').oninput();
 t.elements.get('songTone').value='La mayor';t.elements.get('songTone').listeners.input();
 t.elements.get('leadNotation').value='grados';t.elements.get('leadNotation').listeners.change();
 t.elements.get('newVariantName').value='Grados — La';t.elements.get('versionNew').onclick();
 const after=t.snapshot(),song=after.committed.songs.find(s=>s.id===after.activeSong),rep=after.committed.repertoires.find(r=>r.id===after.activeRep),sheet=sheets.resolveLeadSheet(song,rep);
 assert.equal(after.activeSong,before.activeSong);assert.equal(after.committed.songs.length,before.committed.songs.length);
 assert.deepEqual(after.committed.states,before.committed.states);assert.deepEqual(song.midiBindings,source.midiBindings);
 assert.deepEqual(song.leadSheets[0],source.leadSheets[0]);assert.equal(sheet.name,'Grados — La');assert.equal(sheet.tono,'La mayor');
 assert.equal(sheet.notation,'grados');assert.equal(sheet.leadSheet.sections[0].bars[0][0],'I');
});

test('puente añade la canción y el lead sheet elegido a una playlist ya creada',()=>{
 const t=setup({tab:'sheet'});
 t.elements.get('newVariantName').value='Alternativa';t.elements.get('versionNew').onclick();
 const songId=t.snapshot().activeSong,source=t.snapshot().committed.songs.find(s=>s.id===songId),sheetId=source.leadSheets.at(-1).id;
 t.elements.get('repAdd').onclick();t.elements.get('repNameInput').value='Nueva lista';t.elements.get('repForm').listeners.submit({preventDefault(){}});
 const row=t.elements.get('masterResults').children.find(row=>row.children[0].textContent===source.title);
 row.children[1].value=sheetId;row.children.at(-1).onclick();
 const after=t.snapshot(),rep=after.committed.repertoires.find(r=>r.id===after.activeRep);
 assert.deepEqual(rep.songIds,[songId]);assert.equal(rep.leadSheetIds[songId],sheetId);
 assert.equal(after.committed.songs.length,t.snapshot().working.songs.length);
});

test('tonalidad aparece en lead sheets y conserva su ubicación en LIVE',()=>{
 const page=readFileSync(new URL('../editor/v3.html',import.meta.url),'utf8');
 const tone=page.indexOf('id="songTone"');assert(tone>page.indexOf('data-panel="sheet"'));assert(tone<page.indexOf('data-panel="midi"'));
 const live=readFileSync(new URL('../v03.html',import.meta.url),'utf8');assert.match(live,/key\.textContent=vm\.song\.tono/);
});

test('guardar solo tonalidad conserva una partitura previa con compases vacíos y su configuración',()=>{
 const t=setup({tab:'sheet',prepare(db,song){song.leadSheet={custom:{cue:'Puente'},sections:[{letter:'A',label:'Intro',bars:[['F','','',''],['','','','']]}]};}});
 const before=t.snapshot(),songId=before.activeSong,score=copyScore(before.committed.songs.find(s=>s.id===songId).leadSheets[0].leadSheet);
 t.elements.get('songTone').value='Sol mayor';t.elements.get('songTone').listeners.input();t.elements.get('sheetSave').onclick();
 const after=t.snapshot(),song=after.committed.songs.find(s=>s.id===songId);
 assert.deepEqual(song.leadSheets[0].leadSheet,score);assert.equal(song.leadSheets[0].tono,'Sol mayor');
 assert.deepEqual(after.committed.states,before.committed.states);assert.equal(after.hasDraft,false);
 assert.doesNotMatch(t.elements.get('editorNotice').textContent,/No se guardó/);
});
const copyScore=value=>JSON.parse(JSON.stringify(value));

test('fallo al guardar nueva variante conserva selección, borrador y versión compartida',()=>{
 const t=setup({tab:'song'}),before=t.snapshot(),original=t.storage.getItem(storageAPI.LIBRARY_KEY);
 t.elements.get('songTitle').value='Borrador pendiente';t.elements.get('songTitle').listeners.input();
 const set=t.storage.setItem;t.storage.setItem=(k,v)=>{if(k===storageAPI.LIBRARY_KEY)throw Error('Sin espacio');set(k,v);};
 t.elements.get('newVariantName').value='Sol mayor';t.elements.get('versionNew').onclick();
 assert.equal(t.storage.getItem(storageAPI.LIBRARY_KEY),original);
 assert.equal(t.snapshot().activeSong,before.activeSong);assert.equal(t.currentSong().title,'Borrador pendiente');
 assert.equal(t.snapshot().hasDraft,true);assert.match(t.elements.get('editorNotice').textContent,/No se creó/);
});
