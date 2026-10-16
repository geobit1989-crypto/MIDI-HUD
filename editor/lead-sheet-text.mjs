/**
 * Parser del mini-lenguaje aprobado en MIDI HUD Lead Sheet LAB v0.4.
 * Entrada humana: «A - Intro», «| C | F Am | / |», «|: C | G :|».
 * Salida compatible con el motor: arrays de cuatro posiciones por compás.
 * Sin dependencias de DOM, MIDI ni almacenamiento.
 */
const chordPattern = /^[A-G](?:#|b|♯|♭)?m?$/;
const uniqueInts = value => [...new Set(value || [])].filter(Number.isInteger);

function problem(errors,line,message,section=null,bar=null){
  errors.push({line,message,section,bar});
}
export function parseLeadSheetText(input){
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
      const text=chunks[i],bar=initial+i+1,repeat=text==="/";
      if(bar>32)problem(errors,lineNo,"Se admiten hasta 32 compases por sección.",current.letter,bar);
      if(repeat&&bar===1)
        problem(errors,lineNo,"/ no puede ser el primer compás de una sección.",current.letter,bar);
      const chords=repeat?[]:text.split(/\s+/);
      if(chords.length>2)problem(errors,lineNo,"Máximo dos acordes por compás.",current.letter,bar);
      for(const chord of chords){
        if(!chordPattern.test(chord))
          problem(errors,lineNo,"Acorde «"+chord+"» inválido. Usa A–G, #/b opcional y m opcional.",current.letter,bar);
      }
      const beats=repeat?["/","","",""]:
        chords.length===2?[chords[0],"",chords[1],""]:[chords[0]||"","","",""];
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
export function compileLeadSheetText(input){
  const result=parseLeadSheetText(input);
  if(result.errors.length)return {valid:false,errors:result.errors,leadSheet:null};
  return {valid:true,errors:[],leadSheet:{
    sourceText:result.sourceText,
    sections:result.sections
  }};
}
function compactBar(bar){
  if(!Array.isArray(bar))return "";
  if(bar[0]==="/"&&bar.slice(1).every(x=>!x))return "/";
  return bar.filter(Boolean).join(" ");
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
