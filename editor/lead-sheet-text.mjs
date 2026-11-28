import {beatCount} from "../core/meter.mjs";
import {chordParts} from "./chord-notation.mjs?v=20261128-editor8b";
/**
 * Parser del mini-lenguaje aprobado en MIDI HUD Lead Sheet LAB v0.4.
 * Entrada humana: «A - Intro», «| C | F Am | / |», «|: C | G :|».
 * Salida compatible con el motor: arrays de cuatro posiciones por compás.
 * Sin dependencias de DOM, MIDI ni almacenamiento.
 */
const chordPattern = /^(?:[A-G](?:#|b|♯|♭)?m?|[b#♭♯]?(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i|[1-7])(?:[°ø+]|(?:m|maj|sus|add|dim|aug)?\d*)?)$/;
const uniqueInts = value => [...new Set(value || [])].filter(Number.isInteger);

function problem(errors,line,message,section=null,bar=null){
  errors.push({line,message,section,bar});
}
export function parseLeadSheetText(input,meter){
  const count=beatCount(meter);
  const sourceText=String(input ?? "").replace(/\r\n?/g,"\n");
  const sections=[],errors=[];
  let current=null;
  sourceText.split("\n").forEach((raw,index)=>{
    const line=raw.trim(),lineNo=index+1;
    if(!line)return;
    const heading=line.match(/^([A-Z])\s*[-–—]\s*(.+)$/i);
    if(heading){
      const letter=heading[1].toUpperCase(),label=heading[2].trim();
      if(sections.some(s=>s.letter===letter))
        problem(errors,lineNo,"La sección "+letter+" ya existe.",letter);
      current={letter,label,bars:[],repeatStartBars:[],repeatEndBars:[]};
      sections.push(current);
      if(sections.length>4)problem(errors,lineNo,"LIVE admite un máximo de cuatro secciones.",letter);
      return;
    }
    if(!current){problem(errors,lineNo,"Escribe primero una sección, por ejemplo «A - Intro».");return;}
    if(!line.startsWith("|")){
      problem(errors,lineNo,"Los compases deben comenzar con |.",current.letter);
      return;
    }
    const start=line.startsWith("|:"),end=line.endsWith(":|");
    let content=start?line.slice(2):line.slice(1);
    if(end)content=content.slice(0,-2);
    else if(content.endsWith("|"))content=content.slice(0,-1);
    else {
      problem(errors,lineNo,"Cierra la línea con | o :|.",current.letter);
      return;
    }
    const chunks=content.split("|").map(x=>x.trim());
    if(chunks.some(x=>!x)){
      problem(errors,lineNo,"Hay un compás vacío entre barras.",current.letter);
      return;
    }
    const initial=current.bars.length;
    for(let i=0;i<chunks.length;i++){
      const text=chunks[i],bar=initial+i+1,repeat=text==="/"||text==="%";
      if(bar>32)problem(errors,lineNo,"Se admiten hasta 32 compases por sección.",current.letter,bar);
      if(repeat&&bar===1)
        problem(errors,lineNo,"/ no puede ser el primer compás de una sección.",current.letter,bar);
      const chords=repeat?[]:text.split(/\s+/);
      const explicit=chords.includes(".")||chords.length===count;
      if(!repeat&&(explicit?chords.length!==count:chords.length>1&&!(chords.length===2&&count%2===0)))problem(errors,lineNo,"Usa "+count+" posiciones con puntos para indicar los cambios de acorde.",current.letter,bar);
      for(const chord of chords){
        if(chord!=="."&&!chordParts(chord)&&!chordPattern.test(chord))
          problem(errors,lineNo,"Acorde «"+chord+"» inválido. Usa A–G, #/b opcional y m opcional, o grados I–VII / 1–7 escritos manualmente.",current.letter,bar);
      }
      const beats=Array(count).fill("");
      if(repeat)beats[0]="/";
      else if(explicit)chords.slice(0,count).forEach((chord,i)=>beats[i]=chord==="."?"":chord);
      else {beats[0]=chords[0]||"";if(chords.length===2&&count%2===0)beats[count/2]=chords[1];}
      current.bars.push(beats);
    }
    if(start)current.repeatStartBars.push(initial);
    if(end)current.repeatEndBars.push(current.bars.length-1);
  });
  if(!sections.length)
    problem(errors,1,"Incluye una sección como «A - Intro» seguida de compases.");
  for(const section of sections){
    if(!section.bars.length)
      problem(errors,sourceText.split("\n").findIndex(x=>x.trim().startsWith(section.letter+" -"))+1||1,
        "La sección "+section.letter+" no tiene compases.",section.letter);
  }
  return {sections,errors,sourceText,
    totalBars:sections.reduce((n,s)=>n+s.bars.length,0)};
}
export function compileLeadSheetText(input,meter){
  const result=parseLeadSheetText(input,meter);
  if(result.errors.length)return {valid:false,errors:result.errors,leadSheet:null};
  return {valid:true,errors:[],leadSheet:{
    sourceText:result.sourceText,
    sections:result.sections
  }};
}
/** A name/key-only edit or a new view must not recompile an existing score.
 * Older scores may contain empty bars or metadata not represented by this editor.
 * Edited text still goes through the existing parser and its error reporting. */
export function prepareLeadSheetText(existing,input,meter){
 const count=beatCount(meter);
 const source=String(input??'');
 if(source===formatLeadSheetText(existing)&&(existing?.sections||[]).every(s=>s.bars.every(b=>b.length===count))){
  const leadSheet=existing==null?null:JSON.parse(JSON.stringify(existing));
  const sections=leadSheet?.sections||[];
  return {leadSheet,sections,errors:[],sourceText:source,totalBars:sections.reduce((n,s)=>n+s.bars.length,0)};
 }
 const result=source.trim()?parseLeadSheetText(source,meter):{sections:[],errors:[],totalBars:0,sourceText:source};
 return {...result,leadSheet:source.trim()?{...(existing||{}),sourceText:source,sections:result.sections}:null};
}
function compactBar(bar){
  if(!Array.isArray(bar))return "";
  if(bar[0]==="/"&&bar.slice(1).every(x=>!x))return "/";
  const occupied=bar.map((x,i)=>x?i:-1).filter(i=>i>=0);
  if(occupied.length===1&&occupied[0]===0)return bar[0];
  if(bar.length%2===0&&occupied.length===2&&occupied[0]===0&&occupied[1]===bar.length/2)return bar[0]+" "+bar[bar.length/2];
  return bar.map(x=>x||".").join(" ");
}
/** Reconstruye texto editable sin destruir partituras guardadas. */
export function formatLeadSheetText(leadSheet){
  if(!leadSheet)return "";
  if(typeof leadSheet.sourceText==="string")return leadSheet.sourceText;
  const output=[];
  for(const section of leadSheet.sections||[]){
    output.push((section.letter||"A")+" - "+(section.label||"SECCIÓN"));
    let line=[],opened=false,closing=false;
    const starts=uniqueInts(section.repeatStartBars);
    const ends=uniqueInts(section.repeatEndBars);
    const flush=()=>{
      if(!line.length)return;
      const prefix=opened?"|: ":"| ";
      output.push(prefix+line.join(" | ")+(closing?" :|":" |"));
      line=[];opened=false;closing=false;
    };
    (section.bars||[]).forEach((bar,i)=>{
      if(starts.includes(i)&&line.length)flush();
      if(!line.length)opened=starts.includes(i);
      line.push(compactBar(bar));
      if(ends.includes(i)){closing=true;flush();}
      else if(line.length>=4)flush();
    });
    flush();output.push("");
  }
  return output.join("\n").trim();
}
