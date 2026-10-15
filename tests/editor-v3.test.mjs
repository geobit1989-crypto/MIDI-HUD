import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,validateLibrary} from "../core/engine-v1.mjs";
import {
 MODULE_COLORS,MODULE_ICONS,moduleDefaults,normalizeSlot,resolveModuleVisual,
 validModuleColor,validModuleIcon
} from "../core/module-visuals.mjs";

const fixture=JSON.parse(readFileSync(new URL("../config/midi-hud-data-v2.json",import.meta.url),"utf8"));
const doc=readFileSync(new URL("../editor/v3.html",import.meta.url),"utf8");
const source=readFileSync(new URL("../editor/v3.mjs",import.meta.url),"utf8");
const live=readFileSync(new URL("../v03.html",import.meta.url),"utf8");
const entry=readFileSync(new URL("../editor/index.html",import.meta.url),"utf8");

test("la pestaña se llama Estados y no hay sección Módulos separada",()=>{
 assert.match(doc,/data-tab="states"[^>]*>Estados<\/button>/);
 assert.doesNotMatch(doc,/data-tab="modules"/);
 assert.deepEqual([...doc.matchAll(/data-tab="([^"]+)"/g)].map(x=>x[1]),["song","states","sheet","midi"]);
});
test("las cuatro secciones tienen exactamente un botón Guardar",()=>{
 const tags=[...doc.matchAll(/<button\b[^>]*\bid="([^"]+Save)"[^>]*>([^<]+)<\/button>/g)];
 assert.deepEqual(tags.map(x=>x[1]).sort(),["midiSave","sheetSave","songSave","statesSave"].sort());
 assert.ok(tags.every(x=>x[2]==="Guardar"));
 assert.doesNotMatch(doc,/Guardar sección|Guardado automático/);
});
test("color, icono, descripción, estado y módulo se configuran juntos",()=>{
 for(const name of ["moduleGrid","stateList","moduleName","moduleSub","moduleIcon",
  "moduleColor","moduleColorPreset","moduleLinkedState","modulePreview"]){
   assert.match(doc,new RegExp('id="'+name+'"'));
 }
 assert.match(doc,/input id="moduleColor" type="color"/);
 assert.match(doc,/icono/i);
});
test("catálogo de iconos y nueve colores por defecto mantienen el LIVE previo",()=>{
 assert.equal(MODULE_COLORS.length,9);
 assert.ok(MODULE_ICONS.length>=12);
 assert.equal(moduleDefaults(0).icon,"sparkle");
 assert.equal(moduleDefaults(8).icon,"ctl1");
 assert.equal(resolveModuleVisual({},0).glyph,"✦");
 assert.equal(resolveModuleVisual({},8).glyph,"CTL1");
 assert.equal(resolveModuleVisual({icon:"music",color:"#123456"},0).glyph,"♫");
 assert.equal(resolveModuleVisual({icon:"music",color:"#123456"},0).dark,"#091929");
 assert.equal(validModuleColor("#1024FE"),true);
 assert.equal(validModuleColor("#ggg000"),false);
 assert.equal(validModuleIcon("heart"),true);
 assert.equal(validModuleIcon("not-registered"),false);
});
test("biblioteca v2 sin campo de color ni icono sigue siendo válida",()=>{
 assert.equal(validateLibrary(fixture),true);
 assert.equal(createEngine(fixture).getViewModel().song.displaySlots.length,9);
 const updated=structuredClone(fixture);
 updated.songs[0].displaySlots[0]=normalizeSlot({
   name:"CLEAN",sub:"Twin Clean",color:"#293b8a",icon:"heart"
 },0);
 assert.equal(validateLibrary(updated),true);
 assert.deepEqual(createEngine(updated).getViewModel().song.displaySlots[0],
  {name:"CLEAN",sub:"Twin Clean",color:"#293b8a",icon:"heart"});
});
test("el motor rechaza valores de apariencia no permitidos",()=>{
 const updated=structuredClone(fixture);
 updated.songs[0].displaySlots[0].icon="fake";
 assert.throws(()=>validateLibrary(updated),/matriz visual invalida/);
 updated.songs[0].displaySlots[0].icon="music";
 updated.songs[0].displaySlots[0].color="#xyz";
 assert.throws(()=>validateLibrary(updated),/matriz visual invalida/);
});
test("los formularios preparan un borrador; solamente Guardar publica en storage",()=>{
 assert.match(source,/let committed=null,working=null/);
 assert.match(source,/function dirty\(\)/);
 assert.match(source,/function save\(\)/);
 assert.match(source,/localStorage\.setItem\(STORAGE,JSON\.stringify\(written\)\)/);
 assert.match(source,/\$\("statesSave"\)\.onclick=save/);
 assert.match(source,/\$\("sheetSave"\)\.onclick=save/);
 assert.match(source,/\$\("midiSave"\)\.onclick=save/);
 assert.match(source,/\$\("songSave"\)\.onclick=save/);
 assert.doesNotMatch(source,/queueAuto|flushPendingEdits/);
 assert.match(source,/beforeunload/);
});
test("navegación evita perder cambios no guardados y exporta solo confirmados",()=>{
 assert.match(source,/function allowLeaving\(\)/);
 assert.match(source,/window\.confirm\("Hay cambios sin guardar/);
 assert.match(source,/JSON\.stringify\(committed,null,2\)/);
 assert.match(source,/localStorage\.setItem\(BACKUP,previous\)/);
});
test("LIVE aplica el icono y el gradiente configurados, sin salida MIDI",()=>{
 assert.match(live,/import \{resolveModuleVisual\}/);
 assert.match(live,/const visual=resolveModuleVisual\(cfg,i\)/);
 assert.match(live,/tile\.style\.setProperty\("--light",visual\.light\)/);
 assert.match(live,/symbol\.textContent=visual\.glyph/);
 assert.doesNotMatch(source,/requestMIDIAccess|sendMIDI|MIDI_OUT/);
});
test("entrada predeterminada apunta a v3 y v2 sigue disponible",()=>{
 assert.match(entry,/v3\.html/);
 assert.match(doc,/src="\.\/v3\.mjs"/);
});

test("en pantallas de iPhone la biblioteca se despliega únicamente si se necesita",()=>{
 assert.match(doc,/id="libraryToggle"/);
 assert.match(doc,/id="editorSidebar"/);
 assert.match(doc,/\.workspace>\.side\{display:none\}/);
 assert.match(doc,/\.workspace>\.side\.is-open\{display:block\}/);
 assert.match(source,/function toggleLibrary\(force\)/);
 assert.match(source,/\$\("libraryToggle"\)\.onclick=\(\)=>toggleLibrary\(\)/);
});
