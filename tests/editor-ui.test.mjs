import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const page=readFileSync(new URL("../editor/v2.html",import.meta.url),"utf8");
const script=readFileSync(new URL("../editor/v2.mjs",import.meta.url),"utf8");
const engineUI=readFileSync(new URL("../v03.html",import.meta.url),"utf8");
const ids=new Set([...page.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));

test("todos los controles del editor tienen un identificador real en la interfaz",()=>{
 const accessed=[...script.matchAll(/\$\("([^"]+)"\)/g)].map(m=>m[1]);
 const missing=[...new Set(accessed)].filter(id=>!ids.has(id));
 assert.deepEqual(missing,[]);
});
test("las cinco áreas del editor están presentes y funcionan como pestañas",()=>{
 for(const id of ["song","states","modules","sheet","midi"]){
  assert.match(page,new RegExp('data-tab="'+id+'"'));
  assert.match(page,new RegExp('data-panel="'+id+'"'));
 }
});
test("el editor contiene los campos musicales aprobados sin canal por canción",()=>{
 for(const id of ["songTitle","songTone","songBpm","songBank","songInitial"]){
  assert.ok(ids.has(id),id);
 }
 assert.doesNotMatch(page,/id="songMidiChannel"/);
 assert.match(page,/Tonalidad/);
 assert.match(engineUI,/key\.textContent=vm\.song\.tono/);
});
test("módulos y MIDI disponen de controles de entrada sin editar JSON directamente",()=>{
 for(const id of ["moduleGrid","leadText","leadPreview","leadGutter","midiMatrix","actionType","actionTarget","bindingsTable"]){
  assert.ok(ids.has(id),id);
 }
 assert.doesNotMatch(page,/textarea[^>]+id="actions"/);
});
test("se preserva la versión anterior del editor para recuperación",()=>{
 const backup=readFileSync(new URL("../editor/legacy.html",import.meta.url),"utf8");
 const index=readFileSync(new URL("../editor/index.html",import.meta.url),"utf8");
 assert.match(backup,/Configura|Configuración/);
 assert.match(index,/v2\.html/);
});

test("texto y preview reemplazan los botones de guardar manualmente",()=>{
 for(const id of ["songSave","stateSave","sectionSave","barAdd","sheetCreate"])
  assert.ok(!ids.has(id),"Debe desaparecer "+id);
 assert.match(script,/createLeadSheetEditor/);
 assert.match(script,/flushPendingEdits/);
 assert.match(script,/setTimeout\(\(\)=>flushPendingEdits\(\),580\)/);
 assert.match(page,/Guardado automático/);
});
test("LIVE contiene acceso directo al Editor y menú de herramientas rediseñado",()=>{
 assert.match(engineUI,/class="hud-editor-shortcut"/);
 assert.match(engineUI,/href="\.\/editor\/"/);
 assert.match(engineUI,/dialog\.className="hud-config-panel"/);
 assert.match(engineUI,/href="\.\/lab\/"/);
 assert.match(engineUI,/href="\.\/"/);
 assert.match(engineUI,/config-menu-v2\.css/);
});
test("la vista previa admite los marcadores de repetición compilados",()=>{
 assert.match(engineUI,/section\.repeatStartBars\?\.includes\(index\)/);
 assert.match(engineUI,/section\.repeatEndBars\?\.includes\(index\)/);
});
