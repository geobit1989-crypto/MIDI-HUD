const valid=(v,a=0,b=127)=>Number.isInteger(v)&&v>=a&&v<=b;
const check=(ok,message)=>{if(!ok)throw Error("MIDI HUD: "+message);};
export function midiCCFor(slot){return slot.kind==="expression"?slot.expressionCC:slot.midiCC??(slot.stateMode==="effect"?81:80);}
export function expressionRange(slot){return {min:slot.expressionMin??0,max:slot.expressionMax??127};}
export function midiModuleText(slot){
 const cc=midiCCFor(slot);
 if(slot.kind==="expression"){const {min,max}=expressionRange(slot);return cc==null?"Sin asignar":"CC"+cc+" · "+min+"–"+max;}
 if(slot.midiValue==null)return "Sin asignar";
 return slot.stateMode==="effect"&&slot.midiMode==="onoff"?"CC"+cc+" · ON "+slot.midiValue+" / OFF "+slot.midiOffValue:"CC"+cc+" = "+slot.midiValue;
}
export function validateModuleMidi(slots=[]){
 const expressions=new Set(),pairs=new Set();
 for(const slot of slots){
  if(slot.kind!=="expression")continue;
  const cc=slot.expressionCC,{min,max}=expressionRange(slot);
  check(cc==null||valid(cc,1,127),"CC de expresión inválido");
  check(valid(min)&&valid(max)&&min<max,"rango de expresión inválido");
  if(cc!=null)expressions.add(cc);
 }
 check(slots.filter(s=>s.expressionCC===11).length<=1,"CC11 permite Wah o Whammy, no ambos");
 for(const slot of slots){
  if(slot.kind==="expression")continue;
  const cc=midiCCFor(slot);
  check(valid(cc,1,127)&&![7,11,91].includes(cc),"CC de módulo reservado o inválido");
  check(slot.midiMode==null||["toggle","onoff"].includes(slot.midiMode),"modo MIDI inválido");
  if(slot.midiValue==null)continue;
  check(!expressions.has(cc),"CC ocupado por una expresión");
  const values=[slot.midiValue];
  if(slot.stateMode==="effect"&&slot.midiMode==="onoff"){
   check(slot.midiOffValue!==slot.midiValue,"ON y OFF deben tener valores diferentes");
   values.push(slot.midiOffValue);
  }
  for(const v of values){const key=cc+":"+v;check(valid(v)&&!pairs.has(key),"valor MIDI de módulo inválido o duplicado");pairs.add(key);}
 }
 return true;
}
export function expressionPercent(slot,value){const {min,max}=expressionRange(slot);return Math.round(Math.max(0,Math.min(1,(value-min)/(max-min)))*100);}
