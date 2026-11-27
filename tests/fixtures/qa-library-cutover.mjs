import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appStorage,QA_LIBRARY_ID,QA_LIBRARY_KIND,QA_LIBRARY_ROOT} from '../../core/environment.mjs';
import {COMMIT_KIND,DriveHistory,createSyncController} from '../../core/drive-sync.mjs';
import {readLibrarySource} from '../../core/library-storage.mjs';

const values=new Map();
globalThis.localStorage={get length(){return values.size;},key:index=>[...values.keys()][index]??null,
 getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
const prefix=location.hostname==='midihud.local'||location.hostname==='appassets.androidplatform.net'?'':'midiHudTest:';
const obsolete='{"libraryId":"old","songs":[]}';
localStorage.setItem(prefix+'hudLibraryV34',obsolete);
localStorage.setItem(prefix+'hudLibraryV34Backup',obsolete);
localStorage.setItem(prefix+'midiHudEditorDraftV6',obsolete);
localStorage.setItem(prefix+'midiHudSettingsV1','{"midiChannel":7}');
assert.equal(readLibrarySource(appStorage),null);
assert.equal(appStorage.getItem('hudLibraryV34Backup'),null);
assert.equal(appStorage.getItem('midiHudEditorDraftV6'),null);
assert.equal(appStorage.getItem('midiHudSettingsV1'),'{"midiChannel":7}');
assert.equal(COMMIT_KIND,QA_LIBRARY_KIND);

const old=JSON.parse(readFileSync(new URL('../../config/midi-hud-data-v2.json',import.meta.url),'utf8'));
const seed={...old,libraryId:QA_LIBRARY_ID};
const commit={format:QA_LIBRARY_KIND,version:1,id:QA_LIBRARY_ROOT,parents:[],
 library:seed,deviceId:'qa-fixture',createdAt:'2026-11-27T20:00:00.000Z'};
const entry={id:'qa-drive-file-1234',appProperties:{kind:QA_LIBRARY_KIND,commitId:QA_LIBRARY_ROOT}};
let files=[],uploads=0;
const history=new DriveHistory(async request=>{
 if(request.method==='POST'){uploads++;return {id:'qa-drive-file-5678'};}
 if(request.query?.alt==='media')return commit;
 assert.ok(request.query.q.includes(QA_LIBRARY_KIND));
 return {files};
});
const controller=createSyncController({storage:appStorage,history,authoritative:true,confirmSeed:async()=>true});
controller.setAccount({id:'account-qa-1234',email:'qa@example.test'});
assert.deepEqual(await controller.synchronize({explicit:true}),{deferred:true});
files=[{...entry,appProperties:{...entry.appProperties,commitId:'incorrect-root-1'}}];
await assert.rejects(history.list(),/revisión inicial/);
files=[entry];
const first=await controller.synchronize();
assert.equal(first.library.libraryId,QA_LIBRARY_ID);
assert.equal(first.uploaded,false);
assert.equal(JSON.parse(readLibrarySource(appStorage)).libraryId,QA_LIBRARY_ID);
assert.equal(localStorage.getItem(prefix+'hudLibraryV34'),obsolete);

appStorage.setItem('hudLibraryV34',JSON.stringify(old));
assert.equal((await controller.synchronize()).uploaded,false);
assert.equal(JSON.parse(readLibrarySource(appStorage)).libraryId,QA_LIBRARY_ID);
assert.equal(uploads,0);
console.log('QA library cutover verified');
