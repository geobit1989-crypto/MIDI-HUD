import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {newRepertoire,renameRepertoire} from '../editor/editor-model.mjs';
import {createEngine} from '../core/engine-v1.mjs';
import {LIBRARY_KEY,BACKUP_KEY} from '../core/library-storage.mjs';
import {createLibraryTransferUrl,decodeLibraryTransfer,receiveLibraryTransfer} from '../core/library-transfer-v34.mjs';
import {resolveLiveSelection,LIVE_SELECTION_KEY} from '../core/live-selection-v34.mjs';
import {installLibraryPicker} from '../live/library-picker-v34.mjs';
const editorUrl='https://geobit1989-crypto.github.io/MIDI-HUD/beta-v3.4/editor/v3.html';
function fixture(){
 const library=JSON.parse(readFileSync(new URL('../config/midi-hud-data-v2.json',import.meta.url)));
 const repertoireId=newRepertoire(library,'prueba 1'),rep=library.repertoires.find(r=>r.id===repertoireId);
 return {library,repertoireId,songId:rep.songIds[0]};
}
function storage(){const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};}
test('un enlace transporta toda la biblioteca entre dos navegadores y abre el repertorio seleccionado',async()=>{
 const source=fixture(),original=structuredClone(source.library),url=new URL(await createLibraryTransferUrl(source.library,source,editorUrl));
 const browser=storage(),received=await receiveLibraryTransfer(browser,url.hash);
 assert.equal(url.pathname,'/MIDI-HUD/beta-v3.4/v03.html');assert.equal(url.searchParams.has('library'),false);
 assert.deepEqual(source.library,original);assert.deepEqual(received.library,original);
 const start=resolveLiveSelection(received.library,browser,url.search),hud=createEngine(received.library,start);
 assert.equal(hud.getViewModel().repertoire.name,'prueba 1');assert.equal(hud.getViewModel().song.id,source.songId);
 assert.deepEqual(JSON.parse(browser.getItem(LIBRARY_KEY)),original);
 assert.ok(url.href.length<10000);
 const packet=await decodeLibraryTransfer(url.hash);
 const raw='#midi-hud=v1.raw.'+Buffer.from(JSON.stringify(packet)).toString('base64url');
 assert.deepEqual((await receiveLibraryTransfer(storage(),raw)).library,original);
});
test('otra biblioteca en destino se conserva al cancelar y se respalda al aceptar el enlace',async()=>{
 const source=fixture(),target=storage(),old=structuredClone(source.library);old.songs[0].title='Anterior';
 target.setItem(LIBRARY_KEY,JSON.stringify(old));target.setItem(BACKUP_KEY,'backup previo');
 const hash=new URL(await createLibraryTransferUrl(source.library,source,editorUrl)).hash;
 const before=[...target.data];let questions=0;
 const cancelled=await receiveLibraryTransfer(target,hash,{confirmReplace:()=>{questions++;return false;}});
 assert.equal(cancelled.applied,false);assert.equal(questions,1);assert.deepEqual([...target.data],before);
 await receiveLibraryTransfer(target,hash,{confirmReplace:()=>true});
 assert.deepEqual(JSON.parse(target.getItem(BACKUP_KEY)),old);
 assert.deepEqual(JSON.parse(target.getItem(LIBRARY_KEY)),source.library);
 await receiveLibraryTransfer(target,hash,{confirmReplace:()=>assert.fail('biblioteca idéntica')});
 assert.deepEqual(JSON.parse(target.getItem(BACKUP_KEY)),old);
});
test('enlaces incompletos, referencias ajenas y contenido excesivo no escriben en destino',async()=>{
 const {library,repertoireId,songId}=fixture(),target=storage();
 await assert.rejects(createLibraryTransferUrl(library,{repertoireId,songId:'ajena'},editorUrl));
 for(const hash of ['#midi-hud=v2.raw.ABC','#midi-hud=v1.raw.A','#midi-hud=v1.raw.e30'])
  await assert.rejects(receiveLibraryTransfer(target,hash));
 const huge=gzipSync(Buffer.from(' '.repeat(500001))).toString('base64url');
 await assert.rejects(receiveLibraryTransfer(target,'#midi-hud=v1.gzip.'+huge),/demasiado grande/);
 assert.equal(target.data.size,0);assert.equal(await decodeLibraryTransfer('#otra-cosa'),null);
});
test('fallar al almacenar un enlace conserva la biblioteca y la copia anterior',async()=>{
 const source=fixture(),target=storage(),previous=structuredClone(source.library);previous.songs[0].title='Previo';
 target.setItem(LIBRARY_KEY,JSON.stringify(previous));target.setItem(BACKUP_KEY,'backup previo');
 const before=[...target.data],set=target.setItem;
 target.setItem=(key,value)=>{if(key===LIBRARY_KEY)throw Error('Sin espacio');set(key,value);};
 const hash=new URL(await createLibraryTransferUrl(source.library,source,editorUrl)).hash;
 await assert.rejects(receiveLibraryTransfer(target,hash),/Sin espacio/);assert.deepEqual([...target.data].filter(([key])=>!key.startsWith('midiHudOriginal20261019:')),before);assert.equal(target.getItem('midiHudOriginal20261019:'+LIBRARY_KEY),JSON.stringify(previous));
});
test('el motor usa prueba 1, conserva repertorios compartidos y permite cambiar por MIDI',()=>{
 const source=fixture(),{library,repertoireId,songId}=source;
 const rep=library.repertoires.find(r=>r.id===repertoireId),shared=library.songs[0].id;
 rep.songIds.push(shared);
 const hud=createEngine(library,{repertoireId,songId:shared,midiChannel:2});
 assert.equal(hud.getViewModel().repertoire.id,repertoireId);assert.equal(hud.getViewModel().song.position,2);
 assert.equal(hud.getViewModel().song.total,2);
 assert.deepEqual(hud.dispatch({type:'MIDI_CC',cc:23,value:127,channel:2}).intents,[]);
 assert.equal(hud.getViewModel().repertoire.id,repertoireId);
 hud.dispatch({type:'SELECT_REPERTOIRE',repertoireId:'worship'});
 assert.equal(hud.getViewModel().repertoire.id,'worship');
 hud.dispatch({type:'SELECT_REPERTOIRE',repertoireId});assert.equal(hud.getViewModel().song.id,songId);
 assert.throws(()=>hud.dispatch({type:'SELECT_REPERTOIRE',repertoireId:'ajeno'}),/repertorio/);
 assert.equal(JSON.stringify(hud.getLibrary()),JSON.stringify(library));
});
test('una selección recordada o del editor respeta el canal y cae a datos válidos si ya no existe',()=>{
 const source=fixture(),store=storage();store.setItem('midiHudSettingsV1','{"midiChannel":12}');
 store.setItem(LIVE_SELECTION_KEY,JSON.stringify({repertoireId:source.repertoireId,songId:source.songId}));
 assert.equal(resolveLiveSelection(source.library,store).repertoireId,source.repertoireId);
 const requested=resolveLiveSelection(source.library,store,'?repertoire=worship&song=uma-vez');
 assert.equal(requested.songId,'uma-vez');assert.equal(requested.repertoireId,'worship');
 const missing=resolveLiveSelection(source.library,store,'?repertoire=perdido&song=ajena');
 assert.equal(missing.missingRequestedRepertoire,true);assert.equal(missing.repertoireId,'worship');
 assert.equal(store.getItem('midiHudSettingsV1'),'{"midiChannel":12}');
});
test('el selector de LIVE carga y recuerda prueba 1 sin reemplazar el motor ni tocar MIDI',()=>{
 const source=fixture(),engine=createEngine(source.library),store=storage(),elements=new Map();
 const doc={createElement(){return {ownerDocument:doc};}};
 for(const id of ['#hud-repertoire','#hud-preview','#hud-library-status'])
  elements.set(id,{ownerDocument:doc,replaceChildren(...items){this.children=items;}});
 let used=0;
 const picker=installLibraryPicker({root:{querySelector:id=>elements.get(id)},engine,library:source.library,storage:store,usingSavedLibrary:true,onUse:()=>used++});
 const select=elements.get('#hud-repertoire');assert.ok(select.children.some(item=>item.textContent==='prueba 1'));
 select.value=source.repertoireId;select.onchange();
 assert.equal(engine.getViewModel().repertoire.id,source.repertoireId);assert.equal(used,1);
 assert.equal(elements.get('#hud-preview').children.length,1);
 assert.equal(resolveLiveSelection(source.library,store).repertoireId,source.repertoireId);
 engine.dispatch({type:'MIDI_CC',channel:1,cc:23,value:127});
 assert.equal(engine.getViewModel().state.id,'q-solo');assert.equal(select.value,'worship');
 assert.equal(store.getItem('midiHudSettingsV1'),null);picker.destroy();
});
