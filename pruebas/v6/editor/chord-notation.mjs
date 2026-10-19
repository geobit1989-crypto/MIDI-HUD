// Conversion is limited to chord positions in the lead-sheet language.
const AM=['A','B','C','D','E','F','G'];
const LAT=['La','Si','Do','Re','Mi','Fa','Sol'];
const quality='(?:maj7|m7|sus2|sus4|m|7)?';
const root='(?:Sol|Do|Re|Mi|Fa|La|Si|[A-G])';
const re=new RegExp(`^(${root})([#b♯♭]?)(${quality})(?:/(${root})([#b♯♭]?))?$`);
export function chordParts(token){
 const m=String(token).match(re);if(!m)return null;
 const family=x=>AM.includes(x)?'americano':LAT.includes(x)?'latino':null;
 return {root:m[1],acc:m[2],quality:m[3],bass:m[4]||'',bassAcc:m[5]||'',families:[family(m[1]),m[4]?family(m[4]):null].filter(Boolean)};
}
export function convertChord(token,to){
 if(!['latino','americano'].includes(to))throw Error('Sistema de cifrado desconocido.');
 const p=chordParts(token);if(!p)throw Error('Acorde no reconocido: '+token);
 const transform=x=>{const i=AM.indexOf(x)>=0?AM.indexOf(x):LAT.indexOf(x);return (to==='latino'?LAT:AM)[i];};
 return transform(p.root)+p.acc+p.quality+(p.bass?'/'+transform(p.bass)+p.bassAcc:'');
}
export function scanNotation(source){
 const families=new Set(),invalid=[];
 String(source).split(/\r?\n/).forEach((line,li)=>{
  if(/^\s*[A-Z]\s*[-–—]\s*/i.test(line)||!line.trim().startsWith('|'))return;
  const body=line.replace(/\|:/g,'|').replace(/:\|/g,'|');
  for(const part of body.split('|'))for(const token of part.trim().split(/\s+/).filter(x=>x&&x!=='/')){
   const p=chordParts(token);if(!p)invalid.push({line:li+1,token});else p.families.forEach(x=>families.add(x));
  }
 });
 return {mixed:families.size>1,families:[...families],invalid};
}
export function convertSheet(source,to){
 if(!['latino','americano'].includes(to))throw Error('Sistema de cifrado desconocido.');
 return String(source).split(/(\r?\n)/).map(line=>{
  if(!line.trim().startsWith('|'))return line;
  return line.replace(/[^\s|:]+/g,t=>t==='/'?t:convertChord(t,to));
 }).join('');
}
