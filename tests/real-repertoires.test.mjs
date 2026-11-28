import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {prepareLiveLibrary,resolveLiveSelection,LIVE_SELECTION_KEY} from "../core/live-selection-v34.mjs";
import {normalizeLibrary,createEngine} from "../core/engine-v1.mjs";
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
