import test from "node:test";
import assert from "node:assert/strict";
import {parseLeadSheetText,compileLeadSheetText,formatLeadSheetText} from "../editor/lead-sheet-text.mjs";
import {validateLibrary,createEngine} from "../core/engine-v1.mjs";
import {readFileSync} from "node:fs";

const sample=[
 "A - Intro","| C | F |","",
 "B - Verso","| C | / | F Am | G |","| Am | / | G C | / |","| F | / | Am G | / |","",
 "C - Coro","|: C | G | Am G |","| F :|","",
 "D - Ponte","|: F | G | Am | G :|"
].join("\n");

test("el texto aprobado crea 4 secciones y 2/12/4/4 compases",()=>{
 const r=parseLeadSheetText(sample);
 assert.deepEqual(r.errors,[]);
 assert.deepEqual(r.sections.map(s=>s.bars.length),[2,12,4,4]);
 assert.equal(r.totalBars,22);
 assert.equal(r.sections[1].bars[1][0],"/");
 assert.deepEqual(r.sections[1].bars[2],["F","","Am",""]);
 assert.deepEqual(r.sections[2].repeatStartBars,[0]);
 assert.deepEqual(r.sections[2].repeatEndBars,[3]);
 assert.deepEqual(r.sections[3].repeatStartBars,[0]);
 assert.deepEqual(r.sections[3].repeatEndBars,[3]);
});
test("los acordes se conservan en una celda y 4 pulsos para el motor",()=>{
 const r=compileLeadSheetText("A - Intro\n| C | F Am | / |");
 assert.equal(r.valid,true);
 assert.deepEqual(r.leadSheet.sections[0].bars[1],["F","","Am",""]);
 assert.deepEqual(r.leadSheet.sections[0].bars[2],["/","","",""]);
});
test("reconoce sostenidos, bemoles y acordes menores",()=>{
 const valid="A - Intro\n| Bb | F#m | B♭ | Ebm |\n| C#m | F♯m |";
 assert.equal(compileLeadSheetText(valid).valid,true);
});
test("rechaza acordes fuera de versión 0.4 con línea y compás",()=>{
 for(const chord of ["H","C7","Amin","C/E","Am7","F##","c"]){
  const result=compileLeadSheetText("A - Intro\n| C | "+chord+" |");
  assert.equal(result.valid,false,chord);
  assert.equal(result.errors[0].line,2,chord);
  assert.equal(result.errors[0].bar,2,chord);
 }
});
test("rechaza demasiados acordes, repeticiones sin antecedente y líneas sin cerrar",()=>{
 const a=compileLeadSheetText("A - Intro\n| C D E |");
 assert.equal(a.valid,false);
 assert.match(a.errors[0].message,/Máximo dos/);
 assert.equal(compileLeadSheetText("A - Intro\n| / | C |").valid,false);
 assert.equal(compileLeadSheetText("A - Intro\n| C | D").valid,false);
});
test("se detecta sección duplicada y máximo cuatro secciones",()=>{
 assert.equal(compileLeadSheetText("A - Intro\n| C |\nA - Coro\n| F |").valid,false);
 assert.equal(compileLeadSheetText("A - Intro\n| C |\nB - Verso\n| C |\nC - Coro\n| C |\nD - Puente\n| C |\nE - Extra\n| C |").valid,false);
});
test("el texto fuente se mantiene íntegro y los marcadores sobreviven al formato",()=>{
 const a=compileLeadSheetText(sample);
 assert.equal(formatLeadSheetText(a.leadSheet),sample);
 const legacy={sections:a.leadSheet.sections};
 const emitted=formatLeadSheetText(legacy);
 const b=compileLeadSheetText(emitted);
 assert.equal(b.valid,true,JSON.stringify(b.errors));
 assert.deepEqual(b.leadSheet.sections.map(x=>x.bars),a.leadSheet.sections.map(x=>x.bars));
 assert.deepEqual(b.leadSheet.sections[2].repeatStartBars,[0]);
 assert.deepEqual(b.leadSheet.sections[2].repeatEndBars,[3]);
});
test("biblioteca actual con texto compilado alimenta LIVE sin inferir tono o BPM",()=>{
 const library=JSON.parse(readFileSync(new URL("../config/midi-hud-data-v2.json",import.meta.url),"utf8"));
 const lead=compileLeadSheetText(sample).leadSheet;
 library.songs[1].leadSheet=lead;
 assert.equal(validateLibrary(library),true);
 const vm=createEngine(library).dispatch({type:"PREVIEW_SONG",songId:library.songs[1].id}).view;
 assert.equal(vm.song.leadSheet.sections.length,4);
 assert.equal(vm.song.leadSheet.sections[2].repeatEndBars[0],3);
 assert.equal(vm.song.tono,library.songs[1].tono);
});
