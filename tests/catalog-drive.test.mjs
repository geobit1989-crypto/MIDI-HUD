import {migrateCatalog,createCatalogVariant,createCatalogRepertoire,addCatalogVersion,removeCatalogVersion,recordCatalogChanges} from '../core/catalog-v1.mjs';
import {createLeadSheetVariant,addSongToPlaylist,resolveLeadSheet} from '../core/lead-sheet-variants.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DriveHistory,createSyncController,SYNC_KEY,COMMIT_KIND,commitMetadata,validateCommit,commonAncestor} from '../core/drive-sync.mjs';
import {mergeLibraries,clone,sameLibrary} from '../core/sync-merge.mjs';
import {LIBRARY_KEY,BACKUP_KEY} from '../core/library-storage.mjs';
import {GoogleDriveAuth,validateDriveRequest} from '../core/google-drive-auth.mjs';
import {validateLibrary} from '../core/engine-v1.mjs';

const fixture=()=>migrateCatalog(JSON.parse(readFileSync(new URL('../config/midi-hud-data-v2.json',import.meta.url))));
function storage(library=null){
 const map=new Map(library?[[LIBRARY_KEY,JSON.stringify(library)]]:[]),writes=[];
 return {map,writes,getItem:key=>map.get(key)??null,setItem(key,value){writes.push(key);map.set(key,String(value));},removeItem:key=>map.delete(key),get length(){return map.size;},key:i=>[...map.keys()][i]??null};
}
let sequence=0;const id=()=> 'test-hud-'+String(++sequence).padStart(8,'0');
class MemoryHistory{
 commits=new Map();offline=false;beforeList=null;beforeAppend=null;
 async list(){
  if(this.offline)throw Error('Sin conexión');
  const graph=new Map([...this.commits].map(([id,commit])=>[id,{id,fileId:id,parents:clone(commit.parents)}]));
  const used=new Set([...graph.values()].flatMap(item=>item.parents));
  const snapshot={graph,heads:[...graph.keys()].filter(id=>!used.has(id)).sort()};
  await this.beforeList?.();return snapshot;
 }
 async read(entry){return validateCommit(clone(this.commits.get(entry.id)),entry);}
 async append(commit){if(this.offline)throw Error('Sin conexión');await this.beforeAppend?.(commit);assert(!this.commits.has(commit.id));this.commits.set(commit.id,clone(commit));return {id:commit.id};}
}
function device(history,library=null,options={}){
 const store=storage(library),statuses=[],applied=[],conflicts=[];
 const controller=createSyncController({storage:store,history,id,onStatus:value=>statuses.push(value),onApplied:value=>applied.push(value),resolveConflict:async value=>{conflicts.push(value);return options.choice||null;},...options});
 controller.setAccount({id:'google-user-000001',email:'georges@example.test'});
 return {store,controller,statuses,applied,conflicts,get:()=>JSON.parse(store.getItem(LIBRARY_KEY)),save:library=>store.setItem(LIBRARY_KEY,JSON.stringify(library)),sync:opts=>controller.synchronize(opts)};
}
const change=(device,fn)=>{const db=device.get();fn(db);db.revision++;device.save(db);return db;};

test('dos dispositivos conservan una canción con dos lead sheets y elecciones/tonalidades por playlist',async()=>{
 const cloud=new MemoryHistory(),a=device(cloud,fixture()),b=device(cloud);await a.sync();await b.sync();
 const next=a.get(),song=next.songs[0],sheet=createLeadSheetVariant(song,{name:'Grados — La',tono:'La mayor',notation:'grados'});
 const list=createCatalogRepertoire(next,'Miércoles');addSongToPlaylist(next,list,song.id,sheet);a.save(next);
 await a.sync();await b.sync();assert(sameLibrary(a.get(),b.get()));
 const received=b.get(),receivedSong=received.songs.find(s=>s.id===song.id),rep=received.repertoires.find(r=>r.id===list);
 assert.equal(received.songs.length,fixture().songs.length);assert.equal(resolveLeadSheet(receivedSong,rep).tono,'La mayor');
 const edited=b.get();edited.states.find(s=>s.id===song.initialStateId).gtPatch=42;b.save(edited);
 await b.sync();await a.sync();assert.equal(a.get().states.find(s=>s.id===song.initialStateId).gtPatch,42);
 assert.equal(resolveLeadSheet(a.get().songs[0],a.get().repertoires.find(r=>r.id===list)).id,sheet);
});

test('Drive actual sincroniza catálogo, variantes, notas y lista vacía entre dos dispositivos',async()=>{
 const cloud=new MemoryHistory(),a=device(cloud,fixture()),b=device(cloud);
 await a.sync();await b.sync();
 const before=a.get(),next=clone(before),source=next.songs[0].id;
 const variant=createCatalogVariant(next,source,{variant:'Sol mayor'});
 const list=createCatalogRepertoire(next,'Miércoles');addCatalogVersion(next,list,variant);
 next.repertoires.find(r=>r.id===list).entryNotes={[variant]:'Intro corta'};
 next.songs.find(s=>s.id===source).tempoBpm=140;recordCatalogChanges(before,next);a.save(next);
 await a.sync();await b.sync();assert(sameLibrary(a.get(),b.get()));
 assert.equal(b.get().songs.find(s=>s.id===source).catalog.history.length,1);
 assert.equal(b.get().songs.find(s=>s.id===variant).tempoBpm,before.songs[0].tempoBpm);
 const edited=b.get();removeCatalogVersion(edited,list,variant);b.save(edited);
 await b.sync();await a.sync();assert(sameLibrary(a.get(),b.get()));
 assert.deepEqual(a.get().repertoires.find(r=>r.id===list).songIds,[]);
 assert(a.get().songs.some(s=>s.id===variant));assert(validateLibrary(a.get()));
});

test('conflicto de catálogo mantiene ambas bibliotecas e historiales en recuperación sin cambiar Drive',async()=>{
 const cloud=new MemoryHistory(),a=device(cloud,fixture()),b=device(cloud,null,{choice:'remote'});
 await a.sync();await b.sync();
 for(const [d,title] of [[a,'PC'],[b,'iPhone']]){
  const before=d.get(),next=clone(before);next.songs[0].title=title;recordCatalogChanges(before,next);d.save(next);
 }
 await a.sync();await b.sync();await a.sync();
 assert(sameLibrary(a.get(),b.get()));assert.equal(a.get().songs[0].title,'PC');
 const recovery=JSON.parse(b.store.getItem(b.conflicts[0].recoveryKey));
 assert.equal(recovery.local.songs[0].title,'iPhone');assert.equal(recovery.remote.songs[0].title,'PC');
 assert.equal(recovery.local.songs[0].catalog.history.length,1);assert.equal(recovery.remote.songs[0].catalog.history.length,1);
});
