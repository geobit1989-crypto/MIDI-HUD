import {migrateCatalog} from '../core/catalog-v1.mjs';
import {deleteRepertoire,newRepertoire} from '../editor/editor-model.mjs';
import {mergeSongCatalog} from '../editor/catalog-import.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {prepareLiveLibrary,resolveLiveSelection,LIVE_SELECTION_KEY} from "../core/live-selection-v34.mjs";
import {normalizeLibrary,createEngine,validateLibrary,REPERTOIRE_CONTEXT_ID} from "../core/engine-v1.mjs";
const fixture=()=>normalizeLibrary(JSON.parse(readFileSync(new URL("../config/midi-hud-data-v2.json",import.meta.url),"utf8")));
test("LIVE exposes precisely the real repertoires and never changes the source",()=>{
 const db=fixture();db.repertoires.push({id:"second-real",name:"Segundo",songIds:[db.songs[0].id]});
 const before=structuredClone(db);const live=prepareLiveLibrary(db);
 assert.deepEqual(live,before);assert.deepEqual(db,before);assert.notEqual(live,db);
 assert.equal(live.repertoires.some(r=>r.id==="hud-full-repertoire"),false);
 assert.deepEqual(createEngine(live).getLibrary().repertoires,before.repertoires);
});
test("a previous selection of the removed virtual repertoire falls back to a real repertoire",()=>{
 const db=fixture();const store={getItem:key=>key===LIVE_SELECTION_KEY?JSON.stringify({repertoireId:"hud-full-repertoire",songId:db.songs[0].id}):null};
 const selected=resolveLiveSelection(prepareLiveLibrary(db),store);
 assert.equal(selected.repertoireId,db.repertoires[0].id);
 assert.equal(selected.songId,db.repertoires[0].songIds[0]);
});
test("a genuine user-created repertoire named Repertorio completo is preserved",()=>{
 const db=fixture();db.repertoires[0].name="Repertorio completo";assert.deepEqual(prepareLiveLibrary(db).repertoires,db.repertoires);
});

test("Repertorio directo y cero listas sin persistir un repertorio artificial",()=>{
 const db=migrateCatalog(fixture()),before=structuredClone(db);
 const first=db.songs[0],second=db.songs[1];first.midiAddress={cc0:0,pc:0};second.midiAddress={cc0:7,pc:12};
 const engine=createEngine(db,{repertoireId:REPERTOIRE_CONTEXT_ID,midiChannel:2});
 assert.equal(engine.getViewModel().repertoire.name,"Repertorio");
 assert.equal(engine.getViewModel().song.total,db.songs.length);
 engine.dispatch({type:"MIDI_CC",channel:2,cc:0,value:7});
 engine.dispatch({type:"MIDI_PC",channel:2,program:12});
 assert.equal(engine.getViewModel().song.id,second.id);
 assert.equal(engine.getViewModel().active.repertoireId,REPERTOIRE_CONTEXT_ID);
 assert.deepEqual(engine.getLibrary(),db);
 for(const rep of [...db.repertoires])deleteRepertoire(db,rep.id);
 assert.deepEqual(db.repertoires,[]);assert.equal(validateLibrary(db),true);
 assert.deepEqual(db.states,before.states);assert.deepEqual(db.bindings,before.bindings);
 const selection=resolveLiveSelection(db,null);
 assert.equal(selection.repertoireId,REPERTOIRE_CONTEXT_ID);
 assert.equal(createEngine(db,selection).getViewModel().song.total,db.songs.length);
 assert.equal(mergeSongCatalog(db,null,[{title:"Nueva prueba",author:"Autor"}]).library.repertoires.length,0);
 const id=newRepertoire(db,"Domingo");assert.equal(db.repertoires.find(r=>r.id===id).songIds.length,0);
});
test("eliminar lista activa en una actualización conserva canción, estado y canal",()=>{
 const db=migrateCatalog(fixture()),e=createEngine(db,{midiChannel:2}),before=e.getState();
 const next=structuredClone(db);for(const rep of [...next.repertoires])deleteRepertoire(next,rep.id);
 e.updateLibrary(next);
 const after=e.getState();
 assert.equal(after.activeRepertoireId,REPERTOIRE_CONTEXT_ID);
 assert.equal(after.activeSongId,before.activeSongId);assert.equal(after.activeStateId,before.activeStateId);assert.equal(after.midiChannel,2);
 assert.deepEqual(e.getLibrary().repertoires,[]);
});
