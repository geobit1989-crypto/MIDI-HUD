import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {chooseSheetColumns,sheetRowCounts,occupiedBeatSpans,installAdaptiveLeadSheet} from "../live/sheet-fit-v1.mjs";

const css=readFileSync(new URL("../live/sheet-adaptive-v1.css",import.meta.url),"utf8");
const html=readFileSync(new URL("../v03.html",import.meta.url),"utf8");
const sample=JSON.parse(readFileSync(new URL("../config/midi-hud-data-v2.json",import.meta.url),"utf8"));

test("secciones pequeñas usan más anchura; canciones largas permanecen en cuatro compases por línea",()=>{
 assert.equal(chooseSheetColumns([{bars:[["C","","",""]]}]),1);
 assert.equal(chooseSheetColumns([{bars:[["C","","",""],["F","","",""]]}]),2);
 assert.equal(chooseSheetColumns([{bars:[["C"],["F"],["G"]]}]),3);
 assert.equal(chooseSheetColumns(sample.songs[0].leadSheet.sections),4);
 const denseSections=[{bars:Array(2).fill(["C"])},{bars:Array(12).fill(["G"])},{bars:Array(4).fill(["Am"])},{bars:Array(4).fill(["F"])}];
 assert.deepEqual(sheetRowCounts(denseSections,4),[1,3,1,1]);
 assert.deepEqual(sheetRowCounts([{bars:[["C"]]},{bars:[["C"],["G"]]}],2),[1,1]);
});

test("un acorde ocupa los pulsos disponibles hasta el siguiente, sin desplazar sus posiciones",()=>{
 assert.deepEqual(occupiedBeatSpans(["F","","Am",""]),[
  {text:"F",start:1,span:2},{text:"Am",start:3,span:2}]);
 assert.deepEqual(occupiedBeatSpans(["C","","",""]),[{text:"C",start:1,span:4}]);
 assert.deepEqual(occupiedBeatSpans(["","G","",""]),[{text:"G",start:2,span:3}]);
 assert.deepEqual(occupiedBeatSpans(["F","A","C","G"]),[
  {text:"F",start:1,span:1},{text:"A",start:2,span:1},
  {text:"C",start:3,span:1},{text:"G",start:4,span:1}
 ]);
 assert.deepEqual(occupiedBeatSpans(["","","",""]),[]);
});

test("el CSS transfiere cinco puntos porcentuales de alto de la partitura a controles",()=>{
 assert.match(css,/calc\(clamp\(162px,30dvh,258px\) \+ 5dvh\)/);
 assert.match(css,/calc\(clamp\(141px,27dvh,185px\) \+ 5dvh\)/);
 assert.match(css,/calc\(clamp\(190px,38dvh,410px\) - 5dvh\)/);
 assert.match(css,/calc\(clamp\(155px,28dvh,245px\) - 5dvh\)/);
 assert.match(css,/max\(135px,29dvh\)/);
});
test("el símbolo de repetición se alinea arriba con los acordes, nunca a media altura",()=>{
 const block=css.slice(css.indexOf(".lead-sheet .bar.repeat-measure .repeat-glyph"));
 assert.match(block,/top:var\(--sheet-bar-inset\)/);
 assert.match(block,/bottom:auto/);
 assert.match(block,/transform:translateX\(-50%\)/);
 assert.doesNotMatch(block,/translateY\(/);
 assert.doesNotMatch(block,/top:50%/);
});
test("LIVE usa ajuste real de fuentes según anchura y filas y lo recalcula en redimensionados",()=>{
 assert.match(html,/from "\.\/live\/sheet-fit-v1\.mjs(?:\?v=[^"]+)?"/);
 assert.match(html,/adaptiveSheet=installAdaptiveLeadSheet/);
 assert.match(html,/adaptiveSheet\.schedule\(\)/);
 assert.match(html,/sheetRowCounts\(sections,columns\)/);
 assert.match(html,/occupiedBeatSpans\(beats\)/);
 assert.match(html,/const rowBars=Math\.max\(1,Math\.min\(columns,bars\.length-row\*columns\)\)/);
 assert.match(css,/--sheet-chord-size/);
});
test("el algoritmo elige letra mayor en un lead sheet sencillo que en uno denso",()=>{
 const old={
  window:globalThis.window,document:globalThis.document,
  getComputedStyle:globalThis.getComputedStyle,
  requestAnimationFrame:globalThis.requestAnimationFrame
 };
 let fontsize=0;
 globalThis.window={addEventListener(){},removeEventListener(){}};
 globalThis.requestAnimationFrame=fn=>{fn();};
 globalThis.getComputedStyle=()=>({paddingLeft:"1",paddingRight:"1"});
 globalThis.document={
  createRange(){
   let target;
   return {
    selectNodeContents(beat){target=beat;},
    getBoundingClientRect(){return {width:target.textContent.length*fontsize*.61};}
   };
  }
 };
 function fakeRoot({rowHeight,width,text}){
  const bar={getBoundingClientRect(){return {width,height:rowHeight,bottom:rowHeight};}};
  const beat={
   textContent:text,
   parentElement:bar,
   getBoundingClientRect(){return {width,height:fontsize*1.08+2,bottom:fontsize*1.08+2};}
  };
  return {
   isConnected:true,
   style:{setProperty(name,value){if(name==="--sheet-chord-size")fontsize=parseFloat(value);}},
   dataset:{},classList:{toggle(){}},
   getBoundingClientRect(){return {width:390,height:380};},
   querySelector(selector){return selector===".chord-line"?{}:null;},
   querySelectorAll(selector){
    if(selector===".chord-line")return [{getBoundingClientRect(){return {height:rowHeight};}}];
    if(selector===".bar .beat")return [beat];
    return [];
   }
  };
 }
 try{
  const simple=installAdaptiveLeadSheet(fakeRoot({rowHeight:100,width:145,text:"C"})).fit();
  const dense=installAdaptiveLeadSheet(fakeRoot({rowHeight:31,width:40,text:"F#m"})).fit();
  assert.ok(simple>dense+12,{simple,dense});
  assert.ok(simple<=72 && dense>=8);
 }finally{
  for(const [name,value] of Object.entries(old)){
   if(value===undefined)delete globalThis[name];else globalThis[name]=value;
  }
 }
});

test("los nombres de secciones tienen límite lateral y no invaden compases",()=>{
 assert.match(css,/\.lead-sheet \.sheet-section\{\s*grid-template-columns:minmax\(0,17\.6%\) minmax\(0,82\.4%\)/);
 assert.match(css,/\.lead-sheet \.section-label\{\s*width:100%;\s*max-width:100%;\s*min-width:0/);
 assert.match(css,/\.lead-sheet \.section-label > span:last-child\{\s*flex:1 1 0;\s*max-width:100%/);
 assert.match(css,/\.lead-sheet \.chord-lines\{\s*min-width:0;\s*overflow:hidden/);
 assert.match(css,/flex-direction:column/);
});
test("el ajuste tipográfico mide palabras completas para conservar nombres legibles",()=>{
 const source=readFileSync(new URL("../live/sheet-fit-v1.mjs",import.meta.url),"utf8");
 assert.match(source,/const words=\(label\.textContent\|\|""\)\.split\(\/\\s\+\/\)/);
 assert.match(source,/ctx\.measureText\(word\)\.width>available-2/);
});
