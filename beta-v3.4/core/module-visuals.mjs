/**
 * MIDI HUD: catálogo de apariencia de los módulos adaptativos de LIVE.
 * Se guarda en song.displaySlots[] para mantener compatibilidad con v2;
 * la sección unificada "Estados y módulos" lo edita en conjunto.
 */
export const MODULE_COLORS=Object.freeze([
  {id:"azul",label:"Azul",hex:"#075eff"},
  {id:"turquesa",label:"Turquesa",hex:"#08b7ae"},
  {id:"naranja",label:"Naranja",hex:"#ff8300"},
  {id:"rojo",label:"Rojo",hex:"#ff071b"},
  {id:"amarillo",label:"Amarillo",hex:"#eac400"},
  {id:"acero",label:"Azul acero",hex:"#536d8a"},
  {id:"oliva",label:"Oliva",hex:"#aaab00"},
  {id:"violeta",label:"Violeta",hex:"#8500ef"},
  {id:"grafito",label:"Grafito",hex:"#4b5056"}
]);
export const MODULE_ICONS=Object.freeze([
  {id:"sparkle",label:"Brillo",glyph:"✦"},
  {id:"ambient",label:"Ondas",glyph:"≋"},
  {id:"drive",label:"Drive",glyph:"∿"},
  {id:"target",label:"Objetivo",glyph:"◎"},
  {id:"delay",label:"Delay",glyph:"⠿"},
  {id:"boost",label:"Boost",glyph:"▂▅▇"},
  {id:"down",label:"Abajo",glyph:"▼"},
  {id:"up",label:"Arriba",glyph:"▲"},
  {id:"ctl1",label:"CTL1",glyph:"CTL1"},
  {id:"music",label:"Música",glyph:"♫"},
  {id:"heart",label:"Corazón",glyph:"♥"},
  {id:"power",label:"Encendido",glyph:"⏻"},
  {id:"star",label:"Estrella",glyph:"★"},
  {id:"circle",label:"Círculo",glyph:"●"},
  {id:"blank",label:"Sin icono",glyph:""}
]);
const DEFAULT_ICONS=Object.freeze(["sparkle","ambient","drive","target","delay","boost","down","up","ctl1"]);
const HEX=/^#[0-9a-fA-F]{6}$/;
function adjust(hex,factor){
 const value=hex.slice(1);
 const channels=[0,2,4].map(n=>parseInt(value.slice(n,n+2),16));
 return "#"+channels.map(c=>Math.max(0,Math.min(255,Math.round(c*factor))).toString(16).padStart(2,"0")).join("");
}
function lighten(hex){
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 return "#"+rgb.map(c=>Math.min(255,Math.round(c+(255-c)*.25)).toString(16).padStart(2,"0")).join("");
}
export function validModuleColor(value){return typeof value==="string"&&HEX.test(value);}
export function validModuleIcon(value){return MODULE_ICONS.some(icon=>icon.id===value);}
export function moduleDefaults(index){
 const safe=Number.isInteger(index)&&index>=0?index%MODULE_COLORS.length:0;
 return {color:MODULE_COLORS[safe].hex,icon:DEFAULT_ICONS[safe]};
}
export function resolveModuleVisual(slot,index){
 const fallback=moduleDefaults(index);
 const color=validModuleColor(slot?.color)?slot.color:fallback.color;
 const icon=validModuleIcon(slot?.icon)?slot.icon:fallback.icon;
 return {color,icon,glyph:MODULE_ICONS.find(x=>x.id===icon)?.glyph??"",
   light:color,dark:adjust(color,.48),meter:lighten(color)};
}
export function normalizeSlot(slot,index){
 const style=resolveModuleVisual(slot,index);
 return {name:typeof slot?.name==="string"?slot.name:"—",
   sub:slot?.deviceTag==null&&slot?.sub==="GT"?"":typeof slot?.sub==="string"?slot.sub:"Sin asignar",
   deviceTag:typeof slot?.deviceTag==="string"?slot.deviceTag:slot?.sub==="GT"?"GT":"",
   kind:slot?.kind==="expression"?"expression":"control",
   hidden:slot?.hidden===true,
   rowBreakBefore:slot?.rowBreakBefore===true,
   color:style.color,icon:style.icon};
}
