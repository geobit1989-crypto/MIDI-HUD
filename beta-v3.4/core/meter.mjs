/** Musical meter belongs to the song; existing scores default to 4/4. */
export const DEFAULT_METER=Object.freeze({numerator:4,denominator:4});
export function meterGroups(n,d){
 if(d===8&&n>=6&&n%3===0)return Array(n/3).fill(3);
 if(n===5)return [3,2];
 if(n===7)return [2,2,3];
 return [n];
}
export function normalizeMeter(value){
 const m=value??DEFAULT_METER,n=m.numerator,d=m.denominator;
 if(!Number.isInteger(n)||n<1||n>32||![2,4,8,16].includes(d))throw Error("Métrica inválida: numerador 1–32 y denominador 2, 4, 8 o 16.");
 const groups=m.groups??meterGroups(n,d);
 if(!Array.isArray(groups)||!groups.length||groups.some(x=>!Number.isInteger(x)||x<1)||groups.reduce((a,b)=>a+b,0)!==n)throw Error("La agrupación debe sumar "+n+".");
 return {numerator:n,denominator:d,groups:[...groups]};
}
export const meterLabel=m=>{const x=normalizeMeter(m);return x.numerator+"/"+x.denominator;};
export const beatCount=m=>normalizeMeter(m).numerator;
export function groupBoundaries(m){
 const {groups}=normalizeMeter(m);let offset=0;return groups.slice(0,-1).map(n=>offset+=n);
}
/** Keep existing chord positions; never silently discard a chord. */
export function resizeScore(score,meter){
 if(!score)return null;
 const size=beatCount(meter),next=JSON.parse(JSON.stringify(score));delete next.sourceText;
 for(const section of next.sections||[])section.bars=section.bars.map(bar=>{
  if(!Array.isArray(bar)||bar.slice(size).some(Boolean))throw Error("Hay acordes fuera de la nueva métrica. Ajusta la partitura antes de cambiarla.");
  return Array.from({length:size},(_,i)=>bar[i]||"");
 });
 return next;
}
