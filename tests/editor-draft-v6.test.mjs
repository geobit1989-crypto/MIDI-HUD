import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Execute only the Editor controller (no boot or external service).
// This is an isolated regression harness; physical browser, Drive and MIDI acceptance remain separate.
const editorSource=readFileSync(new URL('../editor/v3.mjs',import.meta.url),'utf8')
 .replace(/^import\s+[\s\S]*?\s+from\s+["'][^"']+["'];\s*/gm,'')
 .replace(/boot\(\)\.catch\([\s\S]*$/,'');
function makeStorage(){
 const data=new Map();
 return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
}
function fixture(){
 return {libraryId:'test-v6',revision:1,updatedAt:'2026-10-24T10:00:00.000Z',
  repertoires:[{id:'rep',songIds:['song1','song2']}],
  songs:[
   {id:'song1',title:'Clean',leadSheets:[{id:'sheet1',name:'Principal',notation:'americano',leadSheet:'| C |'}]},
   {id:'song2',title:'Ambient',leadSheets:[{id:'sheet2',name:'Principal',notation:'americano',leadSheet:'| D |'}]}
  ],states:[],bindings:[]};
}
function session(storage,committedLibrary=fixture()){
 const elements=new Map();
 const document={getElementById(id){
  if(!elements.has(id))elements.set(id,{textContent:'',style:{},disabled:false,classList:{toggle(){}}});
  return elements.get(id);
 }};
 const window={dispatchEvent(){}};
 const sandbox={
  document,window,localStorage:storage,
  LIBRARY_KEY:'hudLibraryV34',BACKUP_KEY:'hudLibraryV34Backup',
  readLibrarySource:()=>storage.getItem('hudLibraryV34'),
  replaceLibrary:(s,next)=>{s.setItem('hudLibraryV34',JSON.stringify(next));return next;},
  migrateCatalog:x=>x,validateLibrary:()=>{},recordCatalogChanges:()=>{},
  syncDefaultLeadSheet:()=>{},
  formatLeadSheetText:x=>x||'',
  prepareLeadSheetSave:async source=>({leadSheet:source,chordNotation:'americano'}),
  prepareLeadSheetText:(_old,source)=>({leadSheet:source,errors:[]})
 };
 const script=editorSource+`
 render=()=>{};selected=()=>{};
 currentSheet=()=>working.songs.find(s=>s.id===activeSong)?.leadSheets[0]??null;
 committed=copy(library);working=copy(committed);activeRep="rep";activeSong="song1";
 return {
  editTitle:v=>{working.songs[0].title=v;dirty();},
  stageLead:(id,source)=>{leadDrafts.set(id,source);dirty();},
  switchTab:updateTab,restore:restoreDraft,confirm:save,
  snapshot:()=>({hasDraft,working:copy(working),committed:copy(committed),activeTab,draftStoreError}),
  ui:()=>({status:document.getElementById('saveStatus').textContent,
    confirmedAt:document.getElementById('lastConfirmedSave').textContent})
 };
 `;
 const api=runInNewContext('(function(library){'+script+'})',sandbox)(committedLibrary);
 return {api,elements};
}
test('pestañas conservan borrador sin modificar la biblioteca de LIVE',()=>{
 const store=makeStorage(),{api}=session(store);
 api.editTitle('Fuzz');
 api.switchTab('states');api.switchTab('midi');api.switchTab('song');
 assert.equal(api.snapshot().working.songs[0].title,'Fuzz');
 assert.equal(api.snapshot().committed.songs[0].title,'Clean');
 assert.equal(api.snapshot().hasDraft,true);
 assert.ok(store.getItem('midiHudEditorDraftV6'));
 assert.equal(store.getItem('hudLibraryV34'),null);
});
test('recupera el borrador del almacenamiento sin publicarlo',()=>{
 const store=makeStorage();
 session(store).api.editTitle('Fuzz');
 const restored=session(store);
 assert.equal(restored.api.restore(),true);
 assert.equal(restored.api.snapshot().working.songs[0].title,'Fuzz');
 assert.equal(restored.api.snapshot().committed.songs[0].title,'Clean');
});
test('un Guardar global confirma varias partituras y renueva la fecha',async()=>{
 const store=makeStorage(),{api}=session(store);
 api.editTitle('Fuzz');
 api.stageLead('sheet1','| G |');
 api.stageLead('sheet2','| Am |');
 await api.confirm();
 const snapshot=api.snapshot();
 assert.equal(snapshot.hasDraft,false);
 assert.equal(snapshot.committed.songs[0].title,'Fuzz');
 assert.equal(snapshot.committed.songs[0].leadSheets[0].leadSheet,'| G |');
 assert.equal(snapshot.committed.songs[1].leadSheets[0].leadSheet,'| Am |');
 assert.equal(store.getItem('midiHudEditorDraftV6'),null);
 assert.ok(snapshot.committed.updatedAt);
 assert.match(api.ui().confirmedAt,/Último guardado:/);
});
test('sin poder guardar el borrador, LIVE sigue intacto y aparece alerta de almacenamiento',()=>{
 const store=makeStorage();
 store.setItem=(key,value)=>{
  if(key==='midiHudEditorDraftV6')throw Error('Cuota');
  store.data.set(key,value);
 };
 const {api}=session(store);api.editTitle('Fuzz');
 assert.equal(api.snapshot().draftStoreError,true);
 assert.equal(api.snapshot().committed.songs[0].title,'Clean');
 assert.equal(api.ui().status,'Revisar borrador');
});
test('UI incorpora un único Guardar global y oculta acciones por sección',()=>{
 const html=readFileSync(new URL('../editor/v3.html',import.meta.url),'utf8');
 assert.match(html,/id="saveAll"/);
 assert.match(html,/id="lastConfirmedSave"/);
 assert.match(html,/#songSave,#statesSave,#sheetSave,#midiSave,#versionSave\{display:none\}/);
});
