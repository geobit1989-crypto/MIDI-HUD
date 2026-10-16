/**
 * MIDI HUD LIVE: ajuste tipográfico del lead sheet según contenido y tamaño.
 * No toca el motor, los datos ni los controles MIDI.
 */
export function chooseSheetColumns(sections){
 const maxBars=Math.max(0,...(sections||[]).map(s=>s?.bars?.length||0));
 return Math.min(4,Math.max(1,maxBars));
}
export function sheetRowCounts(sections,columns=chooseSheetColumns(sections)){
 return (sections||[]).map(s=>Math.max(1,Math.ceil((s?.bars?.length||0)/columns)));
}
export function occupiedBeatSpans(beats){
 const taken=(Array.isArray(beats)?beats:[]).slice(0,4)
   .map((value,index)=>({index,text:String(value??"").trim()}))
   .filter(x=>x.text);
 return taken.map(({index,text},i)=>({
   text,start:index+1,span:(taken[i+1]?.index??4)-index
 }));
}
export function installAdaptiveLeadSheet(root){
 if(!root)throw Error("Falta el contenedor del lead sheet");
 let queued=false;
 function applySize(px){
  root.style.setProperty("--sheet-chord-size",px+"px");
  root.style.setProperty("--sheet-label-size",Math.max(9,px*.74).toFixed(2)+"px");
  root.style.setProperty("--sheet-letter-size",Math.max(9,px*.65).toFixed(2)+"px");
  root.style.setProperty("--sheet-repeat-size",px+"px");
 }
 function fits(px){
  applySize(px);
  const lines=root.querySelectorAll(".chord-line");
  for(const line of lines){
   const r=line.getBoundingClientRect();
   if(!r.height || r.height<px*1.08+3)return false;
  }
  for(const beat of root.querySelectorAll(".bar .beat")){
   if(!beat.textContent.trim())continue;
   const bounds=beat.getBoundingClientRect();
   const css=getComputedStyle(beat);
   const inner=bounds.width-parseFloat(css.paddingLeft||"0")-
     parseFloat(css.paddingRight||"0");
   const range=document.createRange();
   range.selectNodeContents(beat);
   const ink=range.getBoundingClientRect().width;
   if(ink>inner-1)return false;
   const parent=beat.parentElement.getBoundingClientRect();
   if(bounds.bottom>parent.bottom+1)return false;
  }
  for(const marker of root.querySelectorAll(".repeat-measure .repeat-glyph")){
   const a=marker.getBoundingClientRect(),b=marker.parentElement.getBoundingClientRect();
   if(a.width>b.width-4||a.bottom>b.bottom+1)return false;
  }
  for(const heading of root.querySelectorAll(".section-label")){
   const area=heading.getBoundingClientRect();
   const section=heading.parentElement.getBoundingClientRect();
   if(heading.scrollWidth>heading.clientWidth+1||
      heading.scrollHeight>heading.clientHeight+1||
      area.height>section.height+1)return false;
   // No dividir palabras musicales ("INTRO" -> "INT"+"RO") para simular
   // que un título cabe. El ancho de su palabra más larga limita el tamaño.
   const label=heading.querySelector("span:last-child");
   if(label && typeof document.createElement==="function"){
     const canvas=document.createElement("canvas");
     const ctx=canvas.getContext("2d");
     if(ctx){
       ctx.font=getComputedStyle(label).font;
       const words=(label.textContent||"").split(/\s+/).filter(Boolean);
       // Los elementos flexibles suelen medir su propio texto y no todo
       // el espacio asignado: se compara contra el ancho del encabezado.
       const style=getComputedStyle(heading);
       const letter=heading.querySelector(".section-letter");
       const gap=parseFloat(style.gap||"0")||0;
       const available=heading.getBoundingClientRect().width-
         (style.flexDirection==="row"&&letter?(letter.getBoundingClientRect().width+gap):0);
       if(words.some(word=>ctx.measureText(word).width>available-2))return false;
     }
   }
  }
  return true;
 }
 function fit(){
  if(!root.isConnected || !root.querySelector(".chord-line"))return null;
  const box=root.getBoundingClientRect();
  if(box.height<40||box.width<90)return null;
  // La mayor letra real que cabe: no solo una aproximación por anchura.
  const min=8,max=Math.min(72,Math.max(20,box.height*.56));
  let lo=min,hi=max;
  for(let i=0;i<13;i++){
   const middle=(lo+hi)/2;
   if(fits(middle))lo=middle;else hi=middle;
  }
  const final=Math.max(min,Math.floor(lo*10)/10);
  applySize(final);
  root.dataset.fitSize=String(final);
  root.dataset.fitRows=String(root.querySelectorAll(".chord-line").length);
  root.classList.toggle("sheet-dense",final<12);
  return final;
 }
 function schedule(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;fit();});
 }
 const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(schedule):null;
 observer?.observe(root);
 window.addEventListener("resize",schedule,{passive:true});
 window.visualViewport?.addEventListener("resize",schedule,{passive:true});
 document.fonts?.ready?.then(schedule).catch(()=>{});
 return {fit,schedule,disconnect:()=>{
  observer?.disconnect();window.removeEventListener("resize",schedule);
  window.visualViewport?.removeEventListener("resize",schedule);
 }};
}
