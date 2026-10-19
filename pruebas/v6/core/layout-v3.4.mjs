/** Filas compensadas, sin casillas de relleno. Geometría depende solo del número visible. */
export function balancedModuleRows(count){
 if(!Number.isInteger(count)||count<0||count>256)throw Error("Número de módulos inválido");
 if(count===0)return [];
 const maxCols=Math.ceil(Math.sqrt(count));
 const rows=Math.ceil(count/maxCols);
 const each=Math.floor(count/rows),extra=count%rows;
 return Array.from({length:rows},(_,i)=>each+(i<extra?1:0));
}
/** Conserva índices originales: ocultar/reordenar no cambia qué acción MIDI los activa. */
export function moduleRows(slots=[],{manual=false}={}){
 const visible=slots.map((cfg,index)=>({cfg,index})).filter(x=>!x.cfg.hidden);
 if(manual||visible.some((x,i)=>i>0&&x.cfg.rowBreakBefore)){
  const rows=[];
  for(const entry of visible){
   if(!rows.length||entry.cfg.rowBreakBefore)rows.push([]);
   rows.at(-1).push(entry);
  }
  return rows;
 }
 let offset=0;
 return balancedModuleRows(visible.length).map(size=>{
  const row=visible.slice(offset,offset+size);offset+=size;return row;
 });
}
